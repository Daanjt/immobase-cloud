// hb-protokolle: Protokoll-Mails der Verwaltung H&B (W&W-Portal, no-reply.hbre@wwportal.ch) automatisch verarbeiten.
// Pro Mail: PDF ueber den Link laden, Wohnung ueber Adresse + Wohnungsnummer (apartments.refnr) bestimmen,
// als "Übergabeprotokoll" bei der Wohnung ablegen, Kellernummer eintragen (wenn leer), Mail in den Ordner H&B.
// Aktionen (nur Admin oder Server): {aktion:"lauf", tage?:3}  |  {aktion:"text", pfad}  (PDF-Text zum Pruefen)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import { istAdminOderServer, verweigert } from "../_shared/auth.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const ABSENDER = "no-reply.hbre@wwportal.ch";
const HB_ORDNER = "AAMkAGVjYWMzMzQ1LTY3YmQtNDY3Zi1hODFmLWI2YzVhOTFjMDFjOAAuAAAAAAA4yWLWuZHARrukqR8cWNyzAQCPkkMS2NFqToMZwPbzd6BnAAB8Yl3qAAA=";

const istPdf = (x: Uint8Array) => x.length > 4 && String.fromCharCode(...x.slice(0, 4)) === "%PDF";
const norm = (s: string) => String(s || "").toLowerCase().replace(/str\.?(\s|$)/g, "strasse$1").replace(/\s+/g, " ").trim();

async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return String(Array.isArray(text) ? text.join("\n") : text);
}

async function graph(sb: any) {
  const { data: cfg } = await sb.from("app_config").select("key,value").in("key", ["graph_tenant_id", "graph_client_id", "graph_client_secret", "graph_mailbox"]);
  const c: Record<string, string> = Object.fromEntries((cfg || []).map((r: any) => [r.key, r.value]));
  const tr = await fetch(`https://login.microsoftonline.com/${c.graph_tenant_id}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.graph_client_id, client_secret: c.graph_client_secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }) });
  const tok = (await tr.json()).access_token;
  if (!tok) throw new Error("Kein Graph-Token");
  return { H: { Authorization: `Bearer ${tok}` }, box: `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.graph_mailbox)}` };
}

async function ladePdf(html: string): Promise<{ bytes: Uint8Array; url: string } | null> {
  const hrefs = [...String(html || "").matchAll(/href="([^"]+)"/gi)].map((x) => x[1].replace(/&amp;/g, "&"));
  for (const h of hrefs) {
    let u: URL; try { u = new URL(h); } catch { continue; }
    if (u.protocol !== "https:" || !/(^|\.)wwportal\.ch$/i.test(u.hostname)) continue;
    const url = u.pathname.startsWith("/protocol/download") ? `${u.origin}/api/inspection/download${u.search}` : h;
    const r = await fetch(url, { redirect: "follow" });
    if (!r.ok) continue;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (istPdf(bytes)) return { bytes, url };
  }
  return null;
}

// Kellernummer aus dem Protokolltext (verschiedene Schreibweisen)
function kellerAus(text: string): string | null {
  const t = text.replace(/\s+/g, " ");
  const m = t.match(/Keller(?:abteil|raum|nummer|nr\.?)?\s*(?:Nr\.?|Nummer|-Nr\.?)?\s*[:#]?\s*([A-Z]?\d{1,4}[A-Z]?)\b/i);
  return m ? m[1] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await istAdminOderServer(req))) return verweigert(CORS);
  const b = await req.json().catch(() => ({}));
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    if (b.aktion === "text") {
      const { data, error } = await sb.storage.from("documents").download(String(b.pfad || ""));
      if (error || !data) return json({ error: "Datei nicht gefunden" }, 404);
      const text = await pdfText(new Uint8Array(await data.arrayBuffer()));
      return json({ ok: true, laenge: text.length, keller: kellerAus(text), text: text.slice(0, 6000) });
    }
    if (b.aktion !== "lauf") return json({ error: "aktion" }, 400);

    const tage = Math.min(Math.max(Number(b.tage) || 3, 1), 30);
    const seit = new Date(Date.now() - tage * 86400000).toISOString();
    const { H, box } = await graph(sb);
    const filter = encodeURIComponent(`from/emailAddress/address eq '${ABSENDER}' and receivedDateTime ge ${seit}`);
    const ms = await fetch(`${box}/messages?$filter=${filter}&$select=id,subject,internetMessageId,receivedDateTime,body&$top=25`, { headers: H }).then((r) => r.json());
    const mails = (ms.value || []).filter((m: any) => /protokoll/i.test(m.subject || ""));
    const { data: apts } = await sb.from("apartments").select("id,adresse,refnr,kellernummer");
    const ergebnis: any[] = [];

    for (const m of mails) {
      const imid = m.internetMessageId;
      const { data: schon } = await sb.from("verwaltung_protokolle").select("status").eq("internet_message_id", imid).maybeSingle();
      if (schon && schon.status === "ok") continue;
      const log = async (status: string, info: Record<string, unknown>) => {
        await sb.from("verwaltung_protokolle").upsert({ internet_message_id: imid, betreff: m.subject, empfangen: m.receivedDateTime, status, ...info, aktualisiert: new Date().toISOString() });
        ergebnis.push({ betreff: m.subject, status, ...info });
      };
      const pdf = await ladePdf(m.body?.content || "");
      if (!pdf) { await log("kein_pdf", {}); continue; }
      const text = await pdfText(pdf.bytes);
      // Adresse aus dem Betreff ("... zum Objekt Josefstrasse 202"), sonst aus dem Text
      const adrBetreff = (String(m.subject).match(/Objekt\s+(.+?)\s*$/i) || [])[1] || "";
      const kandidaten = (apts || []).filter((a: any) => a.adresse && (norm(adrBetreff).includes(norm(a.adresse)) || norm(text).includes(norm(a.adresse))));
      const treffer = kandidaten.filter((a: any) => {
        const r = String(a.refnr || "").trim();
        return r.length >= 3 && new RegExp(`(^|[^0-9])${r.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}([^0-9]|$)`).test(text);
      });
      if (treffer.length !== 1) { await log("unklar", { info: { adresse: adrBetreff, kandidaten: kandidaten.map((a: any) => a.id), treffer: treffer.map((a: any) => a.id) } }); continue; }
      const apt = treffer[0];
      const datum = (String(text).match(/(\d{2})\.(\d{2})\.(\d{4})/) || []);
      const tag = datum.length ? `${datum[3]}-${datum[2]}-${datum[1]}` : String(m.receivedDateTime).slice(0, 10);
      const art = /rückgabe|auszug|abgabe/i.test(m.subject) ? "Rueckgabe" : "Uebergabe";
      const name = `${art}protokoll_HB_${String(apt.adresse).replace(/[^\wäöüÄÖÜ]+/g, "_")}_W${String(apt.refnr).replace(/\W+/g, "")}_${tag}.pdf`;
      const pfad = `apartment/${apt.id}/${Date.now()}_${name}`;
      const { error: ue } = await sb.storage.from("documents").upload(pfad, pdf.bytes, { contentType: "application/pdf" });
      if (ue) { await log("fehler", { apt_id: apt.id, info: { upload: ue.message } }); continue; }
      const { data: doc } = await sb.from("documents").insert({ entity_type: "apartment", entity_id: apt.id, category: "Übergabeprotokoll", filename: name, storage_path: pfad, file_size: pdf.bytes.length, mime_type: "application/pdf", uploaded_by: "H&B-Protokoll (automatisch)" }).select("id").maybeSingle();
      const keller = kellerAus(text);
      let kellerStatus = "nicht gefunden";
      if (keller) {
        if (!String(apt.kellernummer || "").trim()) { await sb.from("apartments").update({ kellernummer: keller }).eq("id", apt.id); kellerStatus = "eingetragen"; }
        else kellerStatus = String(apt.kellernummer).trim() === keller ? "schon gleich" : `abweichend (ImmoBase ${apt.kellernummer}, Protokoll ${keller})`;
      }
      let verschoben = false;
      try { const mv = await fetch(`${box}/messages/${m.id}/move`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ destinationId: HB_ORDNER }) }); verschoben = mv.ok; } catch { /* */ }
      await log("ok", { apt_id: apt.id, document_id: doc?.id ?? null, keller, info: { keller: kellerStatus, verschoben } });
    }
    // Unklare Faelle als Systemfehler melden, damit sie in ImmoBase auftauchen
    for (const e of ergebnis.filter((x) => x.status !== "ok")) {
      await sb.from("system_fehler").insert({ app: "edge", bereich: "hb-protokolle", meldung: `H&B-Protokoll nicht zugeordnet (${e.status}): ${e.betreff}`, details: e }).then(() => {}, () => {});
    }
    return json({ ok: true, mails: mails.length, ergebnis });
  } catch (e) { return json({ error: String((e as Error).message || e) }, 500); }
});
