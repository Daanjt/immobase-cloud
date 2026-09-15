import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: cfg } = await sb.from("app_config").select("key,value").in("key", ["graph_tenant_id", "graph_client_id", "graph_client_secret", "graph_mailbox"]);
  const c: Record<string, string> = Object.fromEntries((cfg || []).map((r: any) => [r.key, r.value]));
  if (!c.graph_tenant_id || !c.graph_mailbox) return json({ error: "graph config missing" }, 500);
  const tokRes = await fetch(`https://login.microsoftonline.com/${c.graph_tenant_id}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.graph_client_id, client_secret: c.graph_client_secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
  });
  const tok = (await tokRes.json()).access_token;
  if (!tok) return json({ error: "no token" }, 500);

  const { data: deals } = await sb.from("pipeline").select("id,contact_email,stage,kontaktiert_am,last_reply_at")
    .in("stage", ["kontaktiert", "antwort"]).not("contact_email", "is", null);
  let flagged = 0;
  for (const d of (deals || [])) {
    const email = (d.contact_email || "").trim();
    if (!email) continue;
    try {
      const flt = `from/emailAddress/address eq '${email.replace(/'/g, "''")}'`;
      const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.graph_mailbox)}/messages?$filter=${encodeURIComponent(flt)}&$orderby=receivedDateTime desc&$top=1&$select=receivedDateTime`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
      const j = await r.json();
      const msg = j && Array.isArray(j.value) ? j.value[0] : null;
      if (!msg || !msg.receivedDateTime) continue;
      const tIn = new Date(msg.receivedDateTime).getTime();
      const anchor = d.last_reply_at ? new Date(d.last_reply_at).getTime() : (d.kontaktiert_am ? new Date(d.kontaktiert_am + "T00:00:00Z").getTime() : 0);
      if (tIn > anchor) {
        const upd: any = { reply_pending: true, last_reply_at: msg.receivedDateTime, updated_at: new Date().toISOString() };
        if (d.stage === "kontaktiert") upd.stage = "antwort";
        await sb.from("pipeline").update(upd).eq("id", d.id);
        flagged++;
      }
    } catch (_) { /* skip deal on error */ }
  }
  return json({ checked: (deals || []).length, flagged });
});
