// mail-anhang-ablegen: Anhang einer Outlook-Mail (Microsoft Graph, App-only) als Dokument in ImmoBase ablegen.
// POST {internet_message_id, anhang, entity_type, entity_id, category, filename?}  -> Bucket "documents" + Tabelle documents
// Mit aus_link:true statt anhang: laedt das PDF ueber den Download-Link im Mailtext (z.B. Protokoll-Mails von
// Verwaltungsportalen ohne Anhang). Nur Links auf bekannte Portale (VERWALTUNGS_PORTALE), nur echte PDFs.
// Nur Admin oder Service-Key.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { istAdminOderServer, verweigert } from "../_shared/auth.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const VERWALTUNGS_PORTALE = [/(^|\.)wwportal\.ch$/i];
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await istAdminOderServer(req))) return verweigert(CORS);
  const b = await req.json().catch(() => ({}));
  const imid = String(b.internet_message_id || "").trim();
  const anhang = String(b.anhang || "").trim();
  const et = String(b.entity_type || ""), eid = String(b.entity_id || ""), kat = String(b.category || "");
  if (!imid || (!b.nur_liste && ((!anhang && !b.aus_link) || !et || !eid || !kat))) return json({ error: "internet_message_id, anhang, entity_type, entity_id und category nötig" }, 400);
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
    if (b.aus_link) {
      const m = await fetch(`${box}/messages/${msg.id}?$select=body`, { headers: H }).then((r) => r.json());
      const hrefs = [...String(m?.body?.content || "").matchAll(/href="([^"]+)"/gi)].map((x) => x[1].replace(/&amp;/g, "&"));
      const ziel = hrefs.find((h) => { try { const u = new URL(h); return u.protocol === "https:" && VERWALTUNGS_PORTALE.some((re) => re.test(u.hostname)); } catch { return false; } });
      if (!ziel) return json({ error: "Kein Download-Link eines bekannten Verwaltungsportals in der Mail" }, 404);
      const istPdf = (x: Uint8Array) => x.length > 4 && String.fromCharCode(...x.slice(0, 4)) === "%PDF";
      // W&W-Portal (wwportal.ch): die Seite /protocol/download ist eine App, das PDF liegt unter /api/inspection/download
      let url = ziel;
      try { const u = new URL(ziel); if (/wwportal\.ch$/i.test(u.hostname) && u.pathname.startsWith("/protocol/download")) url = `${u.origin}/api/inspection/download${u.search}`; } catch { /* */ }
      let r = await fetch(url, { redirect: "follow" });
      if (!r.ok) return json({ error: `Download fehlgeschlagen (HTTP ${r.status})` }, 502);
      let bytes = new Uint8Array(await r.arrayBuffer());
      // Portal liefert zuerst eine Seite: darin den eigentlichen PDF-Link suchen (gleicher Host)
      if (!istPdf(bytes)) {
        const seite = new TextDecoder().decode(bytes);
        const basis = new URL(r.url || ziel);
        const kand = [...seite.matchAll(/(?:href|src|data-url|action)\s*=\s*["']([^"']+)["']|["'](\/[^"']*(?:\.pdf|download|file|document)[^"']*)["']/gi)]
          .map((x) => (x[1] || x[2] || "").replace(/&amp;/g, "&")).filter(Boolean)
          .map((h) => { try { return new URL(h, basis).toString(); } catch { return ""; } })
          .filter((h) => h && new URL(h).hostname === basis.hostname && h !== ziel && /pdf|download|file|document/i.test(h));
        for (const k of kand.slice(0, 6)) {
          const r2 = await fetch(k, { redirect: "follow" });
          if (!r2.ok) continue;
          const b2 = new Uint8Array(await r2.arrayBuffer());
          if (istPdf(b2)) { r = r2; bytes = b2; break; }
        }
        if (!istPdf(bytes)) return json({ error: "Link liefert kein PDF", typ: r.headers.get("content-type"), kandidaten: kand.slice(0, 6), seite: seite.replace(/\s+/g, " ").slice(0, 1500) }, 422);
      }
      const cd = r.headers.get("content-disposition") || "";
      const dname = (cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i) || [])[1];
      const name = String(b.filename || (dname ? decodeURIComponent(dname) : "Protokoll.pdf")).replace(/[^\w.\-äöüÄÖÜ]+/g, "_");
      const pfad = `${et}/${eid}/${Date.now()}_${name}`;
      const { error: ue } = await sb.storage.from("documents").upload(pfad, bytes, { contentType: "application/pdf" });
      if (ue) return json({ error: "Upload: " + ue.message }, 500);
      const { data: d, error: de } = await sb.from("documents").insert({ entity_type: et, entity_id: eid, category: kat, filename: name, storage_path: pfad, file_size: bytes.length, mime_type: "application/pdf", uploaded_by: String(b.uploaded_by || "daan.theijse@dthomes.ch") }).select("id").maybeSingle();
      if (de) return json({ error: "DB: " + de.message }, 500);
      return json({ ok: true, id: d?.id, pfad, groesse: bytes.length, betreff: msg.subject, quelle: new URL(ziel).hostname });
    }
    const at = await fetch(`${box}/messages/${msg.id}/attachments`, { headers: H }).then((r) => r.json());
    // nur Anhänge auflisten (kein Fehler, damit die Systemprüfung nicht anschlägt)
    if (b.nur_liste) return json({ ok: true, betreff: msg.subject, anhaenge: (at.value || []).map((x: any) => x.name) });
    const a = (at.value || []).find((x: any) => x.name === anhang) || (at.value || []).find((x: any) => String(x.name || "").toLowerCase().includes(anhang.toLowerCase()));
    if (!a || !a.contentBytes) return json({ error: "Anhang nicht gefunden", vorhanden: (at.value || []).map((x: any) => x.name) }, 404);
    const bytes = Uint8Array.from(atob(a.contentBytes), (ch) => ch.charCodeAt(0));
    const name = String(b.filename || a.name).replace(/[^\w.\-äöüÄÖÜ]+/g, "_");
    const pfad = `${et}/${eid}/${Date.now()}_${name}`;
    const { error: ue } = await sb.storage.from("documents").upload(pfad, bytes, { contentType: a.contentType || "application/octet-stream" });
    if (ue) return json({ error: "Upload: " + ue.message }, 500);
    const { data: d, error: de } = await sb.from("documents").insert({ entity_type: et, entity_id: eid, category: kat, filename: name, storage_path: pfad, file_size: bytes.length, mime_type: a.contentType || null, uploaded_by: String(b.uploaded_by || "daan.theijse@dthomes.ch") }).select("id").maybeSingle();
    if (de) return json({ error: "DB: " + de.message }, 500);
    // optional: kurzlebiger Download-Link (1 Stunde)
    let link: string | null = null;
    if (b.link) { const { data: su } = await sb.storage.from("documents").createSignedUrl(pfad, 3600); link = su?.signedUrl || null; }
    return json({ ok: true, id: d?.id, pfad, groesse: bytes.length, betreff: msg.subject, link });
  } catch (e) { return json({ error: String((e as Error).message || e) }, 500); }
});
