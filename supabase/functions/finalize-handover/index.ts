// finalize-handover - rendert ein eingereichtes Uebernahmeprotokoll (Fotos, Maengel,
// Unterschrift, Klauseln) serverseitig zu PDF und loest ueber send-handover-pdf
// Mail + Dokument + Abschluss aus. Mit skipEmail=true nur Dokument ersetzen (kein Mail).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PDF_API = "https://mieter.dthomes.ch/api/pdf-generate";
const LOGO_URL = "https://mieter.dthomes.ch/dt-logo.png";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

function esc(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function formatDateDE(v: string | null): string {
  if (!v) return "";
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  const mo = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
  if (m) return `${parseInt(m[1])}. ${mo[parseInt(m[2])-1]} ${m[3]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return `${d.getDate()}. ${mo[d.getMonth()]} ${d.getFullYear()}`;
  return s;
}
function parseSchluessel(info: string) {
  const str = info || ""; let nr = "", extra = "";
  const nrM = str.match(/Schl(?:ü|ue)sselnummer:\s*([^\n]*)/i); if (nrM) nr = nrM[1].trim();
  const exM = str.match(/Extra-Schl(?:ü|ue)ssel:\s*([\s\S]*)/i); if (exM) extra = exM[1].trim();
  return { nr, extra };
}
function sanitizeDoc(str: string): string {
  return (str || "").replace(/[äÄ]/g,"ae").replace(/[öÖ]/g,"oe").replace(/[üÜ]/g,"ue").replace(/[ß]/g,"ss").replace(/[^a-zA-Z0-9_-]/g,"_").replace(/_+/g,"_").replace(/^_|_$/g,"");
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
const RAUM_LABEL: Record<string,string> = { zimmer:"Zimmer", kueche:"Küche", bad:"Bad", wc:"WC", wohnzimmer:"Wohnzimmer", flur:"Flur/Eingang", balkon:"Balkon", keller:"Keller", allgemein:"Allgemein", sonstiges:"Sonstiges" };

function buildSubmittedHtml(p: Record<string, any>): string {
  const CSS = `
  .protocol-page { max-width:760px; margin:0 auto; background:#fff; padding:36px 40px; font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; font-size:12px; line-height:1.5; color:#1a1a1a; }
  .doc-header { display:flex; justify-content:space-between; align-items:flex-end; padding-bottom:14px; border-bottom:2px solid #1a1a1a; margin-bottom:22px; }
  .doc-header .label { font-size:9px; color:#888; letter-spacing:.3em; text-transform:uppercase; margin-bottom:5px; }
  .doc-header h1 { font-size:27px; font-weight:300; margin:0; }
  .doc-header .brand-logo img { width:130px; display:block; margin-left:auto; }
  .card-eyebrow { font-size:9px; color:#888; letter-spacing:.3em; text-transform:uppercase; font-weight:600; margin-bottom:11px; }
  .person-card { background:#faf8f3; border-left:3px solid #1a1a1a; padding:15px 20px; margin-bottom:14px; }
  .person-grid { display:grid; grid-template-columns:96px 1fr 120px 1fr; gap:8px 20px; }
  .person-grid .pl { font-weight:600; color:#444; }
  .info-section { background:#fafafa; border:1px solid #e6e2d8; border-radius:3px; padding:14px 18px; margin:12px 0; }
  .info-grid { display:grid; grid-template-columns:110px 1fr; gap:7px 20px; }
  .info-grid .lbl { font-weight:600; color:#444; }
  .maengel-title { font-size:9px; color:#888; letter-spacing:.3em; text-transform:uppercase; font-weight:600; margin:22px 0 12px; }
  .no-maengel { background:#f2f6ec; border:1px solid #cdddb8; border-radius:3px; padding:11px 15px; color:#3a5230; }
  .mnote { background:#fff8ec; border:1px solid #e8d2a8; border-radius:3px; padding:11px 15px; margin-bottom:12px; white-space:pre-wrap; }
  .photos { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .photo { border:1px solid #e6e2d8; border-radius:4px; overflow:hidden; page-break-inside:avoid; }
  .photo img { width:100%; height:200px; object-fit:cover; display:block; }
  .photo .cap { font-size:10.5px; color:#555; padding:6px 8px; background:#faf8f3; }
  .clauses { margin-top:22px; page-break-inside:avoid; }
  .clauses .ct { font-size:9px; color:#888; letter-spacing:.3em; text-transform:uppercase; font-weight:600; margin-bottom:11px; }
  .clauses ol { margin:0; padding-left:18px; font-size:11px; line-height:1.55; color:#2a2823; }
  .clauses li { margin-bottom:6px; page-break-inside:avoid; }
  .signatures { margin-top:26px; display:flex; gap:36px; page-break-inside:avoid; }
  .sig-block { flex:1; border-top:1px solid #1a1a1a; padding-top:7px; }
  .sig-block .role { font-size:9px; color:#888; letter-spacing:.2em; text-transform:uppercase; font-weight:600; margin-bottom:4px; }
  .sig-block .name { font-size:13px; font-weight:600; margin-bottom:4px; }
  .sig-block .meta { font-size:10.5px; color:#666; }
  `;
  const aptZeile = p.apt_adresse ? `${p.apt_adresse}${p.apt_plz || p.apt_ort ? ", " : ""}${p.apt_plz || ""} ${p.apt_ort || ""}`.trim() : "";
  const sk = parseSchluessel(p.schluessel_info || "");
  const vollName = `${p.mieter_vorname || ""} ${p.mieter_nachname || ""}`.trim() || "-";
  const submitStr = formatDateDE(p.submitted_at) || formatDateDE(new Date().toISOString());
  const photos: any[] = Array.isArray(p.photos) ? p.photos : [];
  const withUrl = photos.filter(f => f && f.url);
  const mnotes = (p.mangel_notes || "").trim();
  const hasMaengel = withUrl.length > 0 || mnotes.length > 0;
  const clause1Key = sk.nr ? ` (Nr. ${esc(sk.nr)}${sk.extra ? `; zusätzlich: ${esc(sk.extra.replace(/\n/g, ", "))}` : ""})` : "";

  const photoHtml = withUrl.map(f => {
    const raum = RAUM_LABEL[String(f.raum||"").toLowerCase()] || (f.raum ? esc(f.raum) : "");
    const note = f.beschreibung || f.note || f.text || "";
    const cap = [raum, note].filter(Boolean).map(esc).join(" · ");
    return `<div class="photo"><img src="${esc(f.url)}" alt=""/>${cap?`<div class="cap">${cap}</div>`:""}</div>`;
  }).join("");
  const maengelSection = hasMaengel
    ? `${mnotes?`<div class="mnote">${esc(mnotes)}</div>`:""}${withUrl.length?`<div class="photos">${photoHtml}</div>`:""}`
    : `<div class="no-maengel">Es wurden keine Mängel gemeldet; die Wohnung wurde in einwandfreiem Zustand übernommen.</div>`;
  const schluesselSection = (sk.nr || sk.extra) ? `<div class="info-section"><div class="card-eyebrow">Schlüsselübergabe</div><div class="info-grid">${sk.nr?`<span class="lbl">Schlüsselnummer:</span><span>${esc(sk.nr)}</span>`:""}${sk.extra?`<span class="lbl">Extra-Schlüssel:</span><span style="white-space:pre-wrap">${esc(sk.extra)}</span>`:""}</div></div>` : "";

  const clauses = `<div class="clauses"><div class="ct">Erklärung der Vertragsparteien</div><ol>
    <li>Die Mietpartei bestätigt den Erhalt der aufgeführten Schlüssel${clause1Key} und verpflichtet sich, diese sorgfältig zu verwahren und am Ende des Mietverhältnisses vollzählig zurückzugeben. Das Anfertigen zusätzlicher Schlüssel ohne Zustimmung ist untersagt.</li>
    <li>Die Mietpartei bestätigt, dass die Wohnung im obenstehend dokumentierten Zustand übernommen wurde. Sichtbare Mängel, die innerhalb der 14-tägigen Frist nach Einzug nicht aufgeführt wurden, gelten als nicht vorhanden.</li>
    <li>Verdeckte Mängel, die bei der Übernahme trotz sorgfältiger Prüfung nicht erkennbar waren (z.B. Schimmel hinter Möbeln), sind der Hauptmieterin innert 10 Tagen ab Entdeckung schriftlich zu melden (Art. 256 OR).</li>
    <li>Die Mietpartei verpflichtet sich, das Mietobjekt sorgfältig zu nutzen und in vergleichbarem Zustand zurückzugeben (vorbehaltlich normaler Abnutzung gemäss Schweizer Mietrecht).</li>
    <li>Die Mietpartei bestätigt die obenstehenden Angaben und die aufgeführten Mängel durch ihre digitale Unterschrift. Eine Kopie dieses Protokolls wird der Mietpartei zugestellt.</li>
    <li>Bei Streitigkeiten gilt schweizerisches Recht; Gerichtsstand ist der Ort der gelegenen Sache, zwingende gesetzliche Gerichtsstände (insbesondere Art. 33 ZPO) bleiben vorbehalten.</li>
  </ol></div>`;

  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><style>${CSS}
    body{margin:0;background:#fff;} @page{ size:A4; margin:16mm 16mm 18mm; }</style></head>
    <body><div class="protocol-page">
    <div class="doc-header"><div><div class="label">Einzug</div><h1>Übernahmeprotokoll</h1></div><div class="brand-logo"><img src="${LOGO_URL}" alt="D&amp;T Homes"/></div></div>
    <div class="person-card"><div class="card-eyebrow">Mieter*in</div><div class="person-grid">
      <span class="pl">Vorname:</span><span>${esc(p.mieter_vorname||"-")}</span>
      <span class="pl">Nachname:</span><span>${esc(p.mieter_nachname||"-")}</span>
      ${p.mieter_geburtsdatum?`<span class="pl">Geburtsdatum:</span><span>${esc(formatDateDE(p.mieter_geburtsdatum))}</span>`:""}
      ${p.mieter_nationalitaet?`<span class="pl">Nationalität:</span><span>${esc(p.mieter_nationalitaet)}</span>`:""}
      <span class="pl">E-Mail:</span><span>${esc(p.mieter_email||"-")}</span>
      ${p.mieter_telefon?`<span class="pl">Telefon:</span><span>${esc(p.mieter_telefon)}</span>`:""}
    </div></div>
    <div class="info-section"><div class="card-eyebrow">Mietobjekt</div><div class="info-grid">
      ${aptZeile?`<span class="lbl">Wohnung:</span><span>${esc(aptZeile)}</span>`:""}
      ${p.room_label?`<span class="lbl">Zimmer:</span><span>${esc(p.room_label)}</span>`:""}
      ${p.einzug_datum?`<span class="lbl">Einzug am:</span><span>${esc(formatDateDE(p.einzug_datum))}</span>`:""}
      <span class="lbl">Eingereicht am:</span><span>${esc(submitStr)}</span>
    </div></div>
    ${schluesselSection}
    <div class="maengel-title">Erfasste Mängel &amp; Fotos (${withUrl.length})</div>
    ${maengelSection}
    ${clauses}
    <div class="signatures">
      <div class="sig-block"><div class="role">Mietpartei · digital eingereicht</div><div class="name">${esc(p.tenant_signature||vollName)}</div><div class="meta">Eingereicht am ${esc(submitStr)}</div></div>
      <div class="sig-block"><div class="role">Hauptmieterin</div><div class="name">D&amp;T Partners GmbH</div></div>
    </div>
    </div></body></html>`;
}

async function renderPdf(html: string): Promise<string | null> {
  try {
    const res = await fetch(PDF_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ html, filename: "protokoll.pdf", format: "A4" }) });
    if (!res.ok) { console.error("PDF-API", res.status, await res.text()); return null; }
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = ""; const CH = 0x8000;
    for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CH)) as unknown as number[]);
    return btoa(bin);
  } catch (e) { console.error("PDF-API ex", (e as Error).message); return null; }
}

async function saveDoc(p: Record<string, any>, pdfBase64: string): Promise<{ saved: boolean; error: string | null }> {
  const entityType = p.tenant_id ? "tenant" : (p.bewerber_id ? "applicant" : null);
  const entityId = p.tenant_id || p.bewerber_id || null;
  if (!entityType || !entityId) return { saved: false, error: "keine tenant_id/bewerber_id" };
  const category = "Übergabeprotokoll";
  const docFilename = `${sanitizeDoc(p.mieter_nachname)}_${sanitizeDoc(p.mieter_vorname)}_${sanitizeDoc(category)}.pdf`;
  const docPath = `${entityType}/${entityId}/${Date.now()}_${docFilename}`;
  const bytes = base64ToBytes(pdfBase64);
  const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/documents/${docPath}`, { method: "POST", headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/pdf", "x-upsert": "true" }, body: bytes });
  if (!upRes.ok) return { saved: false, error: `Storage ${upRes.status}` };
  const insRes = await fetch(`${SUPABASE_URL}/rest/v1/documents`, { method: "POST", headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify([{ entity_type: entityType, entity_id: entityId, category, filename: docFilename, storage_path: docPath, file_size: bytes.length, mime_type: "application/pdf", uploaded_by: "Übernahmeprotokoll (automatisch)" }]) });
  if (!insRes.ok) return { saved: false, error: `insert ${insRes.status}` };
  return { saved: true, error: null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const { protocolId, skipEmail } = await req.json();
    if (!protocolId) return new Response(JSON.stringify({ error: "Missing protocolId" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    const r = await fetch(`${SUPABASE_URL}/rest/v1/handover_protocols?id=eq.${protocolId}&select=*`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
    if (!r.ok) throw new Error(`load ${r.status}`);
    const rows = await r.json();
    if (!rows.length) return new Response(JSON.stringify({ error: "Protocol not found" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
    const p = rows[0];
    if (!skipEmail && (!p.mieter_email || !p.mieter_email.includes("@"))) return new Response(JSON.stringify({ error: "Invalid email address" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const html = buildSubmittedHtml(p);
    const pdfBase64 = await renderPdf(html);
    if (!pdfBase64) throw new Error("PDF generation failed");

    if (skipEmail) {
      const doc = await saveDoc(p, pdfBase64);
      const jetzt = new Date().toISOString();
      await fetch(`${SUPABASE_URL}/rest/v1/handover_protocols?id=eq.${protocolId}`, { method: "PATCH", headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ status: "accepted", closed_at: jetzt, updated_at: jetzt }) });
      return new Response(JSON.stringify({ ok: true, skipEmail: true, documentSaved: doc.saved, documentError: doc.error }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const sp = await fetch(`${SUPABASE_URL}/functions/v1/send-handover-pdf`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ token: p.token, pdfBase64 }),
    });
    const spText = await sp.text();
    if (!sp.ok) throw new Error(`send-handover-pdf ${sp.status}: ${spText}`);
    return new Response(spText, { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("finalize-handover error:", err);
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
