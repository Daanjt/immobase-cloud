// outlook-anhang: Datei aus dem Bucket "documents" an einen Outlook-ENTWURF anhängen (Microsoft Graph, App-only).
// {aktion:"upload_url", pfad}                    -> signierte Upload-URL (Datei per PUT hochladen)
// {aktion:"anhaengen", message_id, pfad, name}  -> Anhang an Entwurf (message_id = immutable ID), nur Entwürfe
// Nur Admin oder Service-Key. Sendet nie etwas.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { istAdminOderServer, verweigert } from "../_shared/auth.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await istAdminOderServer(req))) return verweigert(CORS);
  const b = await req.json().catch(() => ({}));
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const pfad = String(b.pfad || "");
  try {
    if (b.aktion === "upload_url") {
      const { data, error } = await sb.storage.from("documents").createSignedUploadUrl(pfad);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, url: data.signedUrl, pfad });
    }
    if (b.aktion === "anhaengen") {
      const { data: f, error: fe } = await sb.storage.from("documents").download(pfad);
      if (fe || !f) return json({ error: "Datei nicht gefunden" }, 404);
      const bytes = new Uint8Array(await f.arrayBuffer());
      let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const { data: cfg } = await sb.from("app_config").select("key,value").in("key", ["graph_tenant_id", "graph_client_id", "graph_client_secret", "graph_mailbox"]);
      const c: Record<string, string> = Object.fromEntries((cfg || []).map((r: any) => [r.key, r.value]));
      const tr = await fetch(`https://login.microsoftonline.com/${c.graph_tenant_id}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: c.graph_client_id, client_secret: c.graph_client_secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }) });
      const tok = (await tr.json()).access_token;
      if (!tok) return json({ error: "Kein Graph-Token" }, 500);
      const H = { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Prefer: 'IdType="ImmutableId"' };
      const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.graph_mailbox)}/messages/${encodeURIComponent(String(b.message_id || ""))}`;
      const m = await fetch(`${url}?$select=isDraft,subject`, { headers: H }).then((r) => r.json());
      if (!m || m.isDraft !== true) return json({ error: "Nur Entwürfe erlaubt", detail: m?.error?.message || null }, 400);
      const r = await fetch(`${url}/attachments`, { method: "POST", headers: H, body: JSON.stringify({ "@odata.type": "#microsoft.graph.fileAttachment", name: String(b.name || pfad.split("/").pop()), contentType: f.type || "application/pdf", contentBytes: btoa(bin) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return json({ error: "Anhängen fehlgeschlagen", detail: JSON.stringify(j).slice(0, 300) }, 502);
      return json({ ok: true, betreff: m.subject, anhang: j.name });
    }
    return json({ error: "Unbekannte Aktion" }, 400);
  } catch (e) { return json({ error: String((e as Error).message || e) }, 500); }
});
