// mail-anhang-holen: liest einen Anhang einer Mail im Postfach (graph_mailbox) und gibt ihn als Base64 zurueck.
// Nur Admin oder Server. Eingabe: { messageId, attachmentId?, name? } (ohne attachmentId: erster Nicht-Inline-Anhang bzw. Name)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { istAdminOderServer, verweigert } from "../_shared/auth.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await istAdminOderServer(req))) return verweigert(CORS);
  const b = await req.json().catch(() => ({}));
  if (!b.messageId) return json({ error: "messageId noetig" }, 400);
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: cfg } = await sb.from("app_config").select("key,value").in("key", ["graph_tenant_id", "graph_client_id", "graph_client_secret", "graph_mailbox"]);
    const c: Record<string, string> = Object.fromEntries((cfg || []).map((r: any) => [r.key, r.value]));
    const tr = await fetch(`https://login.microsoftonline.com/${c.graph_tenant_id}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: c.graph_client_id, client_secret: c.graph_client_secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }) });
    const tok = (await tr.json()).access_token;
    if (!tok) return json({ error: "Kein Graph-Token" }, 502);
    const H = { Authorization: `Bearer ${tok}` };
    const box = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.graph_mailbox)}/messages/${encodeURIComponent(b.messageId)}/attachments`;
    let id = b.attachmentId;
    if (!id) {
      const l = await fetch(`${box}?$select=id,name,isInline`, { headers: H }).then((x) => x.json());
      const a = (l.value || []).find((x: any) => !x.isInline && (!b.name || x.name === b.name));
      if (!a) return json({ error: "kein Anhang gefunden", anhaenge: (l.value || []).map((x: any) => x.name) }, 404);
      id = a.id;
    }
    const a = await fetch(`${box}/${encodeURIComponent(id)}`, { headers: H }).then((x) => x.json());
    if (!a.contentBytes) return json({ error: "kein Inhalt", detail: a?.error?.message }, 502);
    return json({ ok: true, name: a.name, contentType: a.contentType, base64: a.contentBytes });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
