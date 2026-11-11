// mail-anhang-ablegen: Anhang einer Outlook-Mail (Microsoft Graph, App-only) als Dokument in ImmoBase ablegen.
// POST {internet_message_id, anhang, entity_type, entity_id, category, filename?}  -> Bucket "documents" + Tabelle documents
// Nur Admin oder Service-Key.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { istAdminOderServer, verweigert } from "../_shared/auth.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await istAdminOderServer(req))) return verweigert(CORS);
  const b = await req.json().catch(() => ({}));
  const imid = String(b.internet_message_id || "").trim();
  const anhang = String(b.anhang || "").trim();
  const et = String(b.entity_type || ""), eid = String(b.entity_id || ""), kat = String(b.category || "");
  if (!imid || !anhang || !et || !eid || !kat) return json({ error: "internet_message_id, anhang, entity_type, entity_id und category nötig" }, 400);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { data: cfg } = await sb.from("app_config").select("key,value").in("key", ["graph_tenant_id", "graph_client_id", "graph_client_secret", "graph_mailbox"]);
    const c: Record<string, string> = Object.fromEntries((cfg || []).map((r: any) => [r.key, r.value]));
    const tr = await fetch(`https://login.microsoftonline.com/${c.graph_tenant_id}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: c.graph_client_id, client_secret: c.graph_client_secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }) });
    const tok = (await tr.json()).access_token;
    if (!tok) return json({ error: "Kein Graph-Token" }, 500);
    const H = { Authorization: `Bearer ${tok}` };
    const box = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.graph_mailbox)}`;
    const ms = await fetch(`${box}/messages?$filter=${encodeURIComponent(`internetMessageId eq '${imid.replace(/'/g, "''")}'`)}&$select=id,subject`, { headers: H }).then((r) => r.json());
    const msg = (ms.value || [])[0];
    if (!msg) return json({ error: "Mail nicht gefunden" }, 404);
    const at = await fetch(`${box}/messages/${msg.id}/attachments`, { headers: H }).then((r) => r.json());
    const a = (at.value || []).find((x: any) => x.name === anhang) || (at.value || []).find((x: any) => String(x.name || "").toLowerCase().includes(anhang.toLowerCase()));
    if (!a || !a.contentBytes) return json({ error: "Anhang nicht gefunden", vorhanden: (at.value || []).map((x: any) => x.name) }, 404);
    const bytes = Uint8Array.from(atob(a.contentBytes), (ch) => ch.charCodeAt(0));
    const name = String(b.filename || a.name).replace(/[^\w.\-äöüÄÖÜ]+/g, "_");
    const pfad = `${et}/${eid}/${Date.now()}_${name}`;
    const { error: ue } = await sb.storage.from("documents").upload(pfad, bytes, { contentType: a.contentType || "application/octet-stream" });
    if (ue) return json({ error: "Upload: " + ue.message }, 500);
    const { data: d, error: de } = await sb.from("documents").insert({ entity_type: et, entity_id: eid, category: kat, filename: name, storage_path: pfad, file_size: bytes.length, mime_type: a.contentType || null, uploaded_by: String(b.uploaded_by || "daan.theijse@dthomes.ch") }).select("id").maybeSingle();
    if (de) return json({ error: "DB: " + de.message }, 500);
    return json({ ok: true, id: d?.id, pfad, groesse: bytes.length, betreff: msg.subject });
  } catch (e) { return json({ error: String((e as Error).message || e) }, 500); }
});
