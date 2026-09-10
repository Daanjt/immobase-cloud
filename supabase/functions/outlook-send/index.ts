// Sendet eine E-Mail aus dem Outlook-Postfach via Microsoft Graph (App-only).
// Benoetigt in der Entra-App zusaetzlich die Berechtigung Mail.Send.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { to, subject, body, cc } = await req.json().catch(() => ({}));
    if (!to) return json({ error: "empfaenger fehlt" }, 400);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: rows } = await sb.from("app_config").select("key,value")
      .in("key", ["graph_tenant_id", "graph_client_id", "graph_client_secret", "graph_mailbox"]);
    const c: Record<string, string> = {};
    for (const r of rows ?? []) c[r.key] = r.value;
    if (!c.graph_tenant_id || !c.graph_client_id || !c.graph_client_secret || !c.graph_mailbox)
      return json({ error: "not_configured" });

    const tokRes = await fetch(`https://login.microsoftonline.com/${c.graph_tenant_id}/oauth2/v2.0/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: c.graph_client_id, client_secret: c.graph_client_secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
    });
    const tok = await tokRes.json();
    if (!tok.access_token) return json({ error: "auth_failed", detail: tok.error_description || tok.error || "" });

    const toList = String(to).split(/[;,]/).map((x) => x.trim()).filter(Boolean).map((a) => ({ emailAddress: { address: a } }));
    const ccList = (cc ? String(cc).split(/[;,]/).map((x) => x.trim()).filter(Boolean) : []).map((a) => ({ emailAddress: { address: a } }));
    const message: any = { subject: subject || "", body: { contentType: "Text", content: body || "" }, toRecipients: toList };
    if (ccList.length) message.ccRecipients = ccList;

    const mbox = encodeURIComponent(c.graph_mailbox);
    const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${mbox}/sendMail`, {
      method: "POST", headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message, saveToSentItems: true }),
    });
    if (sendRes.status === 202) return json({ ok: true });
    const err = await sendRes.text();
    return json({ error: "send_failed", detail: err.slice(0, 300) });
  } catch (e) {
    return json({ error: String(e) });
  }
});
