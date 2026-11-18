// mail-weiterleiten-entwurf: legt im Postfach (graph_mailbox) einen WEITERLEITUNGS-ENTWURF an,
// inklusive aller Anhaenge der Originalmail. Es wird nichts gesendet.
// Nur Admin oder Server. Eingabe: { messageId, an: string[], cc?: string[], html?: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { istAdminOderServer, verweigert } from "../_shared/auth.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function graph(sb: any) {
  const { data: cfg } = await sb.from("app_config").select("key,value").in("key", ["graph_tenant_id", "graph_client_id", "graph_client_secret", "graph_mailbox"]);
  const c: Record<string, string> = Object.fromEntries((cfg || []).map((r: any) => [r.key, r.value]));
  const tr = await fetch(`https://login.microsoftonline.com/${c.graph_tenant_id}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.graph_client_id, client_secret: c.graph_client_secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }) });
  const tok = (await tr.json()).access_token;
  if (!tok) throw new Error("Kein Graph-Token");
  return { H: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, box: `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.graph_mailbox)}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await istAdminOderServer(req))) return verweigert(CORS);
  const b = await req.json().catch(() => ({}));
  const an: string[] = Array.isArray(b.an) ? b.an.filter((x: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)) : [];
  const cc: string[] = Array.isArray(b.cc) ? b.cc.filter((x: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)) : [];
  if (!b.messageId || !an.length) return json({ error: "messageId und an noetig" }, 400);
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { H, box } = await graph(sb);
    const r = await fetch(`${box}/messages/${encodeURIComponent(b.messageId)}/createForward`, { method: "POST", headers: H, body: JSON.stringify({}) });
    const d = await r.json();
    if (!r.ok || !d.id) return json({ error: "createForward", detail: d?.error?.message || r.status }, 502);
    const body = String(d.body?.content || "");
    const neu = b.html ? (/<body[^>]*>/i.test(body) ? body.replace(/(<body[^>]*>)/i, `$1${b.html}`) : String(b.html) + body) : body;
    const p = await fetch(`${box}/messages/${encodeURIComponent(d.id)}`, { method: "PATCH", headers: H, body: JSON.stringify({
      toRecipients: an.map((a) => ({ emailAddress: { address: a } })),
      ccRecipients: cc.map((a) => ({ emailAddress: { address: a } })),
      body: { contentType: "HTML", content: neu },
    }) });
    if (!p.ok) return json({ error: "patch", detail: (await p.json().catch(() => ({})))?.error?.message || p.status }, 502);
    const a = await fetch(`${box}/messages/${encodeURIComponent(d.id)}/attachments?$select=name,isInline`, { headers: H }).then((x) => x.json());
    return json({ ok: true, entwurfId: d.id, betreff: d.subject, anhaenge: (a.value || []).filter((x: any) => !x.isInline).map((x: any) => x.name) });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
