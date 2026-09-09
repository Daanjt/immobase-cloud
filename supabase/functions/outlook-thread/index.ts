// Holt den Mailverlauf (gesendet/erhalten) mit einer Kontaktadresse aus dem
// Outlook-Postfach via Microsoft Graph (App-only, client_credentials).
// Zugangsdaten liegen in public.app_config (nur per Service-Role lesbar).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { email } = await req.json().catch(() => ({}));
    if (!email) return json({ error: "email fehlt" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: rows } = await sb.from("app_config").select("key,value")
      .in("key", ["graph_tenant_id", "graph_client_id", "graph_client_secret", "graph_mailbox"]);
    const c: Record<string, string> = {};
    for (const r of rows ?? []) c[r.key] = r.value;
    if (!c.graph_tenant_id || !c.graph_client_id || !c.graph_client_secret || !c.graph_mailbox)
      return json({ error: "not_configured" });

    const tokRes = await fetch(`https://login.microsoftonline.com/${c.graph_tenant_id}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: c.graph_client_id,
        client_secret: c.graph_client_secret,
        grant_type: "client_credentials",
        scope: "https://graph.microsoft.com/.default",
      }),
    });
    const tok = await tokRes.json();
    if (!tok.access_token) return json({ error: "auth_failed", detail: tok.error_description || tok.error || "" });

    const mbox = encodeURIComponent(c.graph_mailbox);
    const term = encodeURIComponent('"' + String(email).replace(/"/g, "") + '"');
    const url = `https://graph.microsoft.com/v1.0/users/${mbox}/messages?$search=${term}` +
      `&$select=subject,from,toRecipients,sentDateTime,receivedDateTime,isDraft,bodyPreview&$top=30`;
    const mRes = await fetch(url, { headers: { Authorization: `Bearer ${tok.access_token}`, ConsistencyLevel: "eventual" } });
    const md = await mRes.json();
    if (!mRes.ok) return json({ error: "graph_failed", detail: md?.error?.message || "" });

    const mb = String(c.graph_mailbox).toLowerCase();
    const messages = (md.value ?? [])
      .filter((m: any) => !m.isDraft)
      .map((m: any) => {
        const fromAddr = (m.from?.emailAddress?.address || "").toLowerCase();
        return {
          subject: m.subject || "(kein Betreff)",
          date: m.sentDateTime || m.receivedDateTime || null,
          direction: fromAddr === mb ? "gesendet" : "erhalten",
          preview: (m.bodyPreview || "").slice(0, 140),
        };
      })
      .sort((a: any, b: any) => String(b.date || "").localeCompare(String(a.date || "")));
    return json({ ok: true, messages });
  } catch (e) {
    return json({ error: String(e) });
  }
});
