// process-handover-deadlines - Cron-Job: Erinnerungen und automatische Fristbestaetigung
// Logo wird beim Versand geladen und eingebettet angehaengt.
// NEU: Bei automatischer Akzeptanz (Frist abgelaufen) wird das PDF zusaetzlich in
//      der Dokumente-Sektion gespeichert, genau wie beim normalen Ablauf
//      (send-handover-pdf). Damit hat ein auto-akzeptiertes Protokoll dasselbe
//      Dokument wie ein eingereichtes.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const BASE_URL = "https://mieter.dthomes.ch";
const LOGO_URL = "https://mieter.dthomes.ch/dt-logo.png";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Logo einmal pro Versand laden und eingebettet anhaengen
async function ladeLogo(): Promise<string | null> {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH)) as unknown as number[]);
    }
    return btoa(bin);
  } catch (e) {
    console.warn("Logo konnte nicht geladen werden:", e);
    return null;
  }
}

function formatDateDE(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });
  } catch { return iso; }
}

// Dateinamen bereinigen, gleiche Logik wie in der Admin-App und in send-handover-pdf
function sanitizeDoc(str: string): string {
  return (str || "")
    .replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue").replace(/[ß]/g, "ss")
    .replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Auto-Accept-PDF in die Dokumente-Sektion ablegen (Storage + documents-Tabelle),
// exakt wie der normale Ablauf send-handover-pdf. Non-fatal: Fehler werden nur
// geloggt, der restliche Ablauf laeuft weiter.
async function savePdfToDocuments(p: Record<string, unknown>, pdfBase64: string): Promise<void> {
  try {
    const entityType = p.tenant_id ? "tenant" : (p.bewerber_id ? "applicant" : null);
    const entityId = (p.tenant_id || p.bewerber_id || null) as string | null;
    if (!entityType || !entityId) {
      console.error(`Dokument nicht zuordenbar fuer ${p.id}: keine tenant_id/bewerber_id`);
      return;
    }
    const category = "Übergabeprotokoll";
    const docFilename = `${sanitizeDoc(p.mieter_nachname as string)}_${sanitizeDoc(p.mieter_vorname as string)}_${sanitizeDoc(category)}.pdf`;
    const docPath = `${entityType}/${entityId}/${Date.now()}_${docFilename}`;
    const bytes = base64ToBytes(pdfBase64);

    const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/documents/${docPath}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/pdf",
        "x-upsert": "true",
      },
      body: bytes,
    });
    if (!upRes.ok) {
      console.error(`Storage-Upload fehlgeschlagen fuer ${p.id}:`, upRes.status, await upRes.text());
      return;
    }
    const insRes = await fetch(`${SUPABASE_URL}/rest/v1/documents`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify([{
        entity_type: entityType,
        entity_id: entityId,
        category,
        filename: docFilename,
        storage_path: docPath,
        file_size: bytes.length,
        mime_type: "application/pdf",
        uploaded_by: "Übernahmeprotokoll (Frist abgelaufen)",
      }]),
    });
    if (!insRes.ok) console.error(`documents-Insert fehlgeschlagen fuer ${p.id}:`, insRes.status, await insRes.text());
  } catch (docErr) {
    console.error(`Dokument-Speicherung fehlgeschlagen fuer ${p.id}:`, (docErr as Error).message || docErr);
  }
}

const PDF_API = "https://mieter.dthomes.ch/api/pdf-generate";

function esc(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseSchluessel(info: string): { nr: string; extra: string } {
  const str = info || "";
  let nr = "", extra = "";
  const nrM = str.match(/Schl(?:ü|ue)sselnummer:\s*([^\n]*)/i);
  if (nrM) nr = nrM[1].trim();
  const exM = str.match(/Extra-Schl(?:ü|ue)ssel:\s*([\s\S]*)/i);
  if (exM) extra = exM[1].trim();
  return { nr, extra };
}

// Auto-Accept-Protokoll als HTML, exakt im Layout des normalen Mieterportal-PDFs
// (.protocol-page). Ohne Mängel und ohne Unterschrift, da nichts eingereicht wurde;
// Status: Frist abgelaufen, automatisch akzeptiert.
function buildProtocolHtml(pRaw: Record<string, unknown>): string {
  const p = pRaw as Record<string, string>;
  const CSS = `
  .protocol-doc { background:#f5f2ec; padding:20px 12px; font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; color:#1a1a1a; }
  .protocol-page { max-width:760px; margin:0 auto; background:#fff; padding:36px 40px; border-radius:2px; box-shadow:0 2px 12px rgba(0,0,0,.08); font-size:12px; line-height:1.5; color:#1a1a1a; }
  .doc-header { display:flex; justify-content:space-between; align-items:flex-end; padding-bottom:14px; border-bottom:2px solid #1a1a1a; margin-bottom:22px; }
  .doc-header .label { font-size:9px; color:#888; letter-spacing:.3em; text-transform:uppercase; font-weight:500; margin-bottom:5px; }
  .doc-header h1 { font-size:27px; font-weight:300; color:#1a1a1a; letter-spacing:-.3px; margin:0; }
  .doc-header .brand-logo img { width:130px; display:block; margin-left:auto; }
  .card-eyebrow { font-size:9px; color:#888; letter-spacing:.3em; text-transform:uppercase; font-weight:600; margin-bottom:11px; }
  .person-card { background:#faf8f3; border-left:3px solid #1a1a1a; padding:15px 20px; margin-bottom:14px; page-break-inside:avoid; }
  .person-grid { display:grid; grid-template-columns:96px 1fr 120px 1fr; gap:8px 20px; font-size:12px; }
  .person-grid .pl { font-weight:600; color:#444; white-space:nowrap; }
  .info-section { background:#fafafa; border:1px solid #e6e2d8; border-radius:3px; padding:14px 18px; margin:12px 0; page-break-inside:avoid; }
  .info-grid { display:grid; grid-template-columns:96px 1fr 120px 1fr; gap:7px 20px; font-size:12px; }
  .info-grid .lbl { font-weight:600; color:#444; white-space:nowrap; }
  .maengel-title { font-size:9px; color:#888; letter-spacing:.3em; text-transform:uppercase; font-weight:600; margin:22px 0 12px; }
  .no-maengel { background:#f2f6ec; border:1px solid #cdddb8; border-radius:3px; padding:11px 15px; font-size:12px; color:#3a5230; }
  .clauses { margin-top:18px; page-break-inside:avoid; }
  .clauses .ct { font-size:9px; color:#888; letter-spacing:.3em; text-transform:uppercase; font-weight:600; margin-bottom:11px; }
  .clauses ol { margin:0; padding-left:18px; font-size:11px; line-height:1.55; color:#2a2823; }
  .clauses li { margin-bottom:6px; page-break-inside:avoid; }
  .clauses li:last-child { margin-bottom:0; }
  .signatures { margin-top:26px; display:flex; gap:36px; page-break-inside:avoid; }
  .sig-block { flex:1; border-top:1px solid #1a1a1a; padding-top:7px; }
  .sig-block .role { font-size:9px; color:#888; letter-spacing:.2em; text-transform:uppercase; font-weight:600; margin-bottom:4px; }
  .sig-block .name { font-size:13px; font-weight:600; margin-bottom:4px; color:#1a1a1a; }
  .sig-block .meta { font-size:10.5px; color:#666; }
  `;

  const aptZeile = p.apt_adresse ? `${p.apt_adresse}${p.apt_plz || p.apt_ort ? ", " : ""}${p.apt_plz || ""} ${p.apt_ort || ""}`.trim() : "";
  const { nr: schluesselNr, extra: extraSchluessel } = parseSchluessel(p.schluessel_info || "");
  const deadlineStr = formatDateDE(p.deadline);
  const vollName = `${p.mieter_vorname || ""} ${p.mieter_nachname || ""}`.trim() || "-";

  const mietobjektRows = [
    aptZeile ? `<span class="lbl">Wohnung:</span><span>${esc(aptZeile)}</span>` : "",
    p.room_label ? `<span class="lbl">Zimmer:</span><span>${esc(p.room_label)}</span>` : "",
    p.einzug_datum ? `<span class="lbl">Einzug am:</span><span>${esc(formatDateDE(p.einzug_datum))}</span>` : "",
    `<span class="lbl">Frist abgelaufen am:</span><span>${esc(deadlineStr)}</span>`,
  ].join("");

  const schluesselSection = (schluesselNr || extraSchluessel) ? `
    <div class="info-section">
      <div class="card-eyebrow">Schlüsselübergabe</div>
      <div class="info-grid">
        ${schluesselNr ? `<span class="lbl">Schlüsselnummer:</span><span>${esc(schluesselNr)}</span>` : ""}
        ${extraSchluessel ? `<span class="lbl">Extra-Schlüssel:</span><span style="white-space:pre-wrap">${esc(extraSchluessel)}</span>` : ""}
      </div>
    </div>` : "";

  const clause1Key = schluesselNr ? ` (Nr. ${esc(schluesselNr)}${extraSchluessel ? `; zusätzlich: ${esc(extraSchluessel.replace(/\n/g, ", "))}` : ""})` : "";

  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><style>${CSS}
    body{margin:0;background:#fff;}
    .protocol-doc{background:#fff !important;padding:0 !important;}
    @page { size:A4; margin:16mm 16mm 18mm; }
  </style></head><body><div class="protocol-doc"><div class="protocol-page">
    <div class="doc-header">
      <div><div class="label">Einzug</div><h1>Übernahmeprotokoll</h1></div>
      <div class="brand-logo"><img src="${LOGO_URL}" alt="D&amp;T Homes"/></div>
    </div>
    <div class="person-card">
      <div class="card-eyebrow">Mieter*in</div>
      <div class="person-grid">
        <span class="pl">Vorname:</span><span>${esc(p.mieter_vorname || "-")}</span>
        <span class="pl">Nachname:</span><span>${esc(p.mieter_nachname || "-")}</span>
        ${p.mieter_geburtsdatum ? `<span class="pl">Geburtsdatum:</span><span>${esc(formatDateDE(p.mieter_geburtsdatum))}</span>` : ""}
        ${p.mieter_nationalitaet ? `<span class="pl">Nationalität:</span><span>${esc(p.mieter_nationalitaet)}</span>` : ""}
        <span class="pl">E-Mail:</span><span>${esc(p.mieter_email || "-")}</span>
        ${p.mieter_telefon ? `<span class="pl">Telefon:</span><span>${esc(p.mieter_telefon)}</span>` : ""}
      </div>
    </div>
    <div class="info-section">
      <div class="card-eyebrow">Mietobjekt</div>
      <div class="info-grid">${mietobjektRows}</div>
    </div>
    ${schluesselSection}
    <div class="maengel-title">Erfasste Mängel (0)</div>
    <div class="no-maengel">Die 14-tägige Frist ist am ${esc(deadlineStr)} ohne Einreichung abgelaufen. Es wurden keine Mängel gemeldet; die Wohnung gilt als in einwandfreiem Zustand übernommen.</div>
    <div class="clauses">
      <div class="ct">Erklärung der Vertragsparteien</div>
      <ol>
        <li>Die Mietpartei bestätigt den Erhalt der aufgeführten Schlüssel${clause1Key} und verpflichtet sich, diese sorgfältig zu verwahren und am Ende des Mietverhältnisses vollzählig zurückzugeben.</li>
        <li>Die Mietpartei bestätigt, dass die Wohnung im obenstehend dokumentierten Zustand übernommen wurde. Sichtbare Mängel, die innerhalb der 14-tägigen Frist nach Einzug nicht aufgeführt wurden, gelten als nicht vorhanden.</li>
        <li>Verdeckte Mängel, die bei der Übernahme trotz sorgfältiger Prüfung nicht erkennbar waren (z.B. Schimmel hinter Möbeln), sind der Hauptmieterin innert 10 Tagen ab Entdeckung schriftlich zu melden (Art. 256 OR).</li>
        <li>Die Mietpartei verpflichtet sich, das Mietobjekt sorgfältig zu nutzen und in vergleichbarem Zustand zurückzugeben (vorbehaltlich normaler Abnutzung gemäss Schweizer Mietrecht).</li>
        <li>Da das Protokoll innert der 14-tägigen Frist nicht eingereicht wurde, gilt die Wohnung gemäss den obenstehenden Angaben und ohne gemeldete Mängel als übernommen. Eine Kopie dieses Protokolls wird der Mietpartei mit dieser Zustellung übergeben.</li>
        <li>Bei Streitigkeiten gilt schweizerisches Recht; Gerichtsstand ist der Ort der gelegenen Sache, zwingende gesetzliche Gerichtsstände (insbesondere Art. 33 ZPO) bleiben vorbehalten.</li>
      </ol>
    </div>
    <div class="signatures">
      <div class="sig-block">
        <div class="role">Mietpartei · automatisch akzeptiert</div>
        <div class="name">${esc(vollName)}</div>
        <div class="meta">Frist am ${esc(deadlineStr)} ohne Einreichung abgelaufen</div>
      </div>
      <div class="sig-block">
        <div class="role">Hauptmieterin</div>
        <div class="name">D&amp;T Partners GmbH</div>
      </div>
    </div>
  </div></div></body></html>`;
}

// HTML ueber die Chromium-PDF-API (immobase-sign) zu PDF rendern, als base64 zurueck.
async function renderPdfViaApi(html: string, filename: string): Promise<string | null> {
  try {
    const res = await fetch(PDF_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, filename, format: "A4" }),
    });
    if (!res.ok) { console.error("PDF-API Fehler:", res.status, await res.text()); return null; }
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    const CH = 0x8000;
    for (let i = 0; i < buf.length; i += CH) {
      bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CH)) as unknown as number[]);
    }
    return btoa(bin);
  } catch (e) {
    console.error("PDF-API Ausnahme:", (e as Error).message || e);
    return null;
  }
}

function buildReminderHtml(name: string, daysLeft: number, deadline: string, url: string, urgency: "first" | "final", logoSrc: string) {
  const isFinal = urgency === "final";
  const bgColor = isFinal ? "#fdebe5" : "#fdf7e8";
  const borderColor = isFinal ? "#e0bcb0" : "#e8d2a8";
  const textColor = isFinal ? "#9b4a3e" : "#8a6a2e";
  const icon = isFinal ? "⚠️" : "⏱";
  const title = isFinal ? "Letzter Reminder" : "Freundlicher Reminder";
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f7f3eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1814;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:30px 24px;">
<div style="text-align:center;margin-bottom:24px;"><img src="${logoSrc}" alt="D&amp;T Homes" width="100" style="display:inline-block;width:100px;height:auto;"/></div>
<div style="background:#fff;border:1px solid #e1d8c5;border-radius:14px;padding:30px 28px;">
<div style="font-size:10px;color:#8a8174;letter-spacing:.25em;text-transform:uppercase;margin-bottom:12px;">${title}</div>
<p style="font-size:14.5px;margin:0 0 14px;">Hi ${name},</p>
<p style="font-size:14px;margin:0 0 18px;">Dein Übernahmeprotokoll für die neue Wohnung ist noch nicht eingereicht.</p>
<div style="background:${bgColor};border:1px solid ${borderColor};border-radius:8px;padding:14px 18px;margin:0 0 22px;font-size:13.5px;color:${textColor};line-height:1.6;">
${icon} Du hast noch <strong>${daysLeft} ${daysLeft === 1 ? "Tag" : "Tage"}</strong> Zeit. Frist: <strong>${deadline}</strong>.<br>
${isFinal ? "Danach gilt die Wohnung automatisch als in einwandfreiem Zustand übernommen und Mängel können bei der Rückgabe nicht mehr geltend gemacht werden." : "Bitte fülle das Protokoll baldmöglich aus, damit allfällige Mängel dokumentiert sind."}
</div>
<div style="text-align:center;margin:28px 0;">
<a href="${url}" style="display:inline-block;background:#1a1814;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:14px;font-weight:500;letter-spacing:.02em;">Jetzt Protokoll ausfüllen</a>
</div>
<p style="font-size:12px;color:#6e6a62;margin:24px 0 0;padding-top:18px;border-top:1px solid #f0eadd;">Oder kopiere diesen Link:<br><span style="color:#1a1814;word-break:break-all;">${url}</span></p>
<p style="font-size:12px;color:#6e6a62;margin:14px 0 0;">Bei Fragen: <a href="mailto:info@dthomes.ch" style="color:#5a5448;">info@dthomes.ch</a> oder per WhatsApp <a href="https://wa.me/41766887091" style="color:#5a5448;">+41 76 688 70 91</a></p>
</div>
<div style="text-align:center;margin-top:22px;font-size:11.5px;color:#8a8174;">D&amp;T Partners GmbH &middot; dthomes.ch</div>
</div></body></html>`;
}

function buildAutoAcceptHtml(name: string, deadline: string, logoSrc: string) {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f7f3eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1814;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:30px 24px;">
<div style="text-align:center;margin-bottom:24px;"><img src="${logoSrc}" alt="D&amp;T Homes" width="100" style="display:inline-block;width:100px;height:auto;"/></div>
<div style="background:#fff;border:1px solid #e1d8c5;border-radius:14px;padding:30px 28px;">
<div style="font-size:10px;color:#8a8174;letter-spacing:.25em;text-transform:uppercase;margin-bottom:12px;">Übernahmeprotokoll</div>
<p style="font-size:14.5px;margin:0 0 14px;">Hi ${name},</p>
<p style="font-size:14px;margin:0 0 18px;">die 14-tägige Frist zur Einreichung deines digitalen Übernahmeprotokolls ist am <strong>${deadline}</strong> abgelaufen.</p>
<div style="background:#e8efde;border:1px solid #c5d5b0;border-radius:8px;padding:14px 18px;margin:0 0 22px;font-size:13.5px;color:#3a5230;line-height:1.6;">
✓ Da du keine Mängel gemeldet hast, gilt die Wohnung ab jetzt als in einwandfreiem Zustand übernommen. Anbei findest du das Protokoll als PDF zu deinen Unterlagen.
</div>
<p style="font-size:14px;margin:0 0 18px;">Wichtig: Verdeckte Mängel, die bei der Übernahme trotz sorgfältiger Prüfung nicht erkennbar waren (z.B. Schimmel hinter Möbeln), kannst du weiterhin innert 10 Tagen ab Entdeckung an <a href="mailto:info@dthomes.ch" style="color:#5a5448;">info@dthomes.ch</a> melden (Art. 256 OR).</p>
<p style="font-size:14px;margin:0 0 18px;">Bei Fragen melde dich einfach unter <a href="mailto:info@dthomes.ch" style="color:#5a5448;">info@dthomes.ch</a> oder per WhatsApp <a href="https://wa.me/41766887091" style="color:#5a5448;">+41 76 688 70 91</a>.</p>
</div>
<div style="text-align:center;margin-top:22px;font-size:11.5px;color:#8a8174;">D&amp;T Partners GmbH &middot; dthomes.ch</div>
</div></body></html>`;
}

async function sendEmail(to: string, subject: string, htmlBauer: (logoSrc: string) => string, attachments?: Array<{ filename: string, content: string }>) {
  const logoB64 = await ladeLogo();
  const logoSrc = logoB64 ? "cid:dt-logo" : LOGO_URL;
  const alleAnhaenge = [
    ...(attachments && attachments.length > 0 ? attachments : []),
    ...(logoB64 ? [{ filename: "logo.png", content: logoB64, content_type: "image/png", content_id: "dt-logo", disposition: "inline" }] : []),
  ];
  const body: Record<string, unknown> = {
    from: "D&T Homes <noreply@dthomes.ch>",
    to: [to],
    bcc: ["daan.theijse@dthomes.ch"],
    reply_to: "info@dthomes.ch",
    subject,
    html: htmlBauer(logoSrc),
  };
  if (alleAnhaenge.length > 0) body.attachments = alleAnhaenge;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Resend ${res.status}: ${err}`); }
  return await res.json();
}

async function patchProtocol(id: string, updates: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/handover_protocols?id=eq.${id}`, {
    method: "PATCH",
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`PATCH failed: ${res.status} ${await res.text()}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const url = `${SUPABASE_URL}/rest/v1/handover_protocols?status=in.(sent,in_progress)&select=*`;
    const res = await fetch(url, { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } });
    if (!res.ok) throw new Error(`Failed to load protocols: ${res.status}`);
    const protocols = await res.json();

    const now = new Date();
    const results = { total: protocols.length, reminder_7d_sent: 0, reminder_12d_sent: 0, auto_accepted: 0, errors: [] as string[] };

    for (const p of protocols) {
      try {
        const deadline = new Date(p.deadline);
        const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const signUrl = `${BASE_URL}/uebernahme/${p.token}`;
        const name = (p.mieter_vorname || "").trim() || "zusammen";

        if (daysLeft <= 0 && !p.auto_accept_email_sent_at) {
          await patchProtocol(p.id, {
            status: "auto_accepted",
            closed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            auto_accept_email_sent_at: new Date().toISOString(),
          });

          // PDF einmal erzeugen und fuer beides nutzen: Dokumente-Sektion und Mail.
          let pdfBase64: string | null = null;
          const filename = `Uebernahmeprotokoll_${p.mieter_nachname || "Mieter"}_${p.mieter_vorname || ""}.pdf`.replace(/\s+/g, "_");
          try { pdfBase64 = await renderPdfViaApi(buildProtocolHtml(p), filename); } catch (pdfErr) { console.error(`PDF generation failed for ${p.id}:`, pdfErr); }

          // Gleich wie der normale Ablauf (send-handover-pdf) das PDF in die
          // Dokumente-Sektion ablegen, damit ein auto-akzeptiertes Protokoll
          // dasselbe Dokument hat wie ein eingereichtes.
          if (pdfBase64) await savePdfToDocuments(p, pdfBase64);

          // Mail an Mieter mit PDF-Anhang (falls Adresse vorhanden).
          if (p.mieter_email && p.mieter_email.includes("@")) {
            const attachments = pdfBase64 ? [{ filename, content: pdfBase64 }] : undefined;
            await sendEmail(
              p.mieter_email,
              "Dein Übernahmeprotokoll bei D&T Homes - Frist abgelaufen",
              (logoSrc) => buildAutoAcceptHtml(name, formatDateDE(p.deadline), logoSrc),
              attachments,
            );
          }
          results.auto_accepted++;
          continue;
        }

        if (daysLeft > 0 && daysLeft <= 2 && !p.reminder_12d_sent_at) {
          if (p.mieter_email && p.mieter_email.includes("@")) {
            await sendEmail(
              p.mieter_email,
              "Letzter Reminder: Dein Übernahmeprotokoll bei D&T Homes",
              (logoSrc) => buildReminderHtml(name, daysLeft, formatDateDE(p.deadline), signUrl, "final", logoSrc),
            );
          }
          await patchProtocol(p.id, { reminder_12d_sent_at: new Date().toISOString() });
          results.reminder_12d_sent++;
          continue;
        }

        if (daysLeft > 2 && daysLeft <= 7 && !p.reminder_7d_sent_at) {
          if (p.mieter_email && p.mieter_email.includes("@")) {
            await sendEmail(
              p.mieter_email,
              "Reminder: Dein Übernahmeprotokoll bei D&T Homes",
              (logoSrc) => buildReminderHtml(name, daysLeft, formatDateDE(p.deadline), signUrl, "first", logoSrc),
            );
          }
          await patchProtocol(p.id, { reminder_7d_sent_at: new Date().toISOString() });
          results.reminder_7d_sent++;
        }
      } catch (e) {
        console.error(`Error processing protocol ${p.id}:`, e);
        results.errors.push(`${p.id}: ${(e as Error).message}`);
      }
    }

    return new Response(JSON.stringify(results), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("process-handover-deadlines error:", err);
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
