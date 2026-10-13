// finalize-auszug - Auszugsprotokoll als PDF erzeugen, in den Dokumenten ablegen
// und auf Wunsch per Mail an die Mietpartei senden. Nur fuer eingeloggte Admins.
// Body: { protocolId, preview?: bool, sendEmail?: bool, nurMail?: bool }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const PDF_API = "https://mieter.dthomes.ch/api/pdf-generate";
const LOGO_URL = "https://mieter.dthomes.ch/dt-logo.png";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function esc(v: unknown) { return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)); }
function datumDE(v: unknown) { const d = new Date(String(v || "")); return isNaN(d.getTime()) ? "" : d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Zurich" }); }
function chf(n: unknown) { return "CHF " + (Number(n) || 0).toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function sanitize(s: string) { return (s || "").replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue").replace(/ß/g, "ss").replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, ""); }

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...H, "Content-Type": "application/json", ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${path.split("?")[0]} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const t = await r.text(); return t ? JSON.parse(t) : null;
}

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
  .sig-block img { max-height:56px; max-width:230px; display:block; margin:2px 0 4px; }
  .sig-block img.fak { max-height:46px; }
  .sig-block .meta { font-size:10.5px; color:#666; }
  `;

function buildHtml(p: any, t: any, a: any): string {
  const name = `${t.vorname || ""} ${t.nachname || ""}`.trim() || "-";
  const objekt = a ? `${a.adresse || ""}, ${a.plz || ""} ${a.ort || ""}`.trim() : "";
  const keys = (p.schluessel || []) as any[];
  const fehlend = keys.filter((k) => !k.zurueck);
  const maengel = (p.maengel || []) as any[];
  const haftet = maengel.filter((m) => m.haftet && (Number(m.kosten) || 0) > 0);
  const total = haftet.reduce((s, m) => s + (Number(m.kosten) || 0), 0) + fehlend.reduce((s, k) => s + (Number(k.kosten) || 0), 0);
  const keyRows = keys.map((k) => `<tr><td>${esc(k.label)}</td><td>${esc(k.nr)}</td><td style="color:${k.zurueck ? "#3a5230" : "#9b4a3e"};font-weight:600">${k.zurueck ? "zurückgegeben" : "fehlt"}</td><td style="text-align:right">${!k.zurueck && Number(k.kosten) > 0 ? chf(k.kosten) : ""}</td></tr>`).join("");
  const wg = p.wg_schluessel && (p.wg_schluessel.text || "").trim() ? `<div style="margin-top:10px"><span class="lbl" style="font-weight:600;color:#444">Gemeinsame WG-Schlüssel:</span> ${esc(p.wg_schluessel.text)} · ${p.wg_schluessel.vollstaendig ? "vollständig in der Wohnung" : `<span style="color:#9b4a3e;font-weight:600">unvollständig</span>${p.wg_schluessel.bemerkung ? ": " + esc(p.wg_schluessel.bemerkung) : ""}`}</div>` : "";
  const mHtml = maengel.length ? `<div class="photos">${maengel.map((m) => `<div class="photo">${m.url ? `<img src="${esc(m.url)}" alt=""/>` : ""}<div class="cap"><b>${esc(m.raum || "")}</b>: ${esc(m.beschreibung || "")}${m.haftet ? `<br><span style="color:#9b4a3e;font-weight:600">zulasten der Mietpartei${Number(m.kosten) > 0 ? ": " + chf(m.kosten) : ""}</span>` : `<br><span style="color:#666">nicht zulasten der Mietpartei (z.B. normale Abnutzung)</span>`}</div></div>`).join("")}</div>` : `<div class="no-maengel">Keine neuen Mängel gegenüber dem Einzug festgestellt.</div>`;
  const weitere = [
    ["Reinigung", p.reinigung === "ok" ? "sauber übergeben" : p.reinigung === "mangelhaft" ? `Nachreinigung nötig${p.reinigung_notiz ? ": " + esc(p.reinigung_notiz) : ""}` : ""],
    ["Zurückgelassen", esc(p.gegenstaende || "")],
    ["Zählerstände", esc(p.zaehler || "")],
    ["Bemerkungen", esc(p.bemerkung || "")],
  ].filter(([, v]) => v).map(([l, v]) => `<span class="lbl">${l}:</span><span style="white-space:pre-wrap">${v}</span>`).join("");
  const sigMieter = p.mieter_verweigert
    ? `<div class="name">${esc(name)}</div><div class="meta" style="color:#9b4a3e">Unterschrift verweigert bzw. nicht anwesend. Die Mängel wurden der Mietpartei mit diesem Protokoll schriftlich gemeldet.</div>`
    : `${String(p.unterschrift_mieter || "").startsWith("data:image") ? `<img src="${p.unterschrift_mieter}" alt=""/>` : ""}<div class="name">${esc(p.unterschrift_name || name)}</div><div class="meta">${datumDE(p.datum)}</div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}
  table.keys { width:100%; border-collapse:collapse; font-size:11.5px; } table.keys td, table.keys th { padding:6px 8px; border-bottom:1px solid #eee; text-align:left; } table.keys th { font-size:9px; color:#888; letter-spacing:.15em; text-transform:uppercase; }
  .total { margin-top:14px; padding:12px 16px; background:#faf8f3; border-left:3px solid #1a1a1a; font-size:13px; }
  </style></head><body><div class="protocol-page">
    <div class="doc-header"><div><div class="label">Auszug</div><h1>Auszugsprotokoll</h1></div><div class="brand-logo"><img src="${LOGO_URL}" alt="D&amp;T Homes"/></div></div>
    <div class="person-card"><div class="card-eyebrow">Mieter*in</div><div class="person-grid">
      <span class="pl">Name:</span><span>${esc(name)}</span><span class="pl">E-Mail:</span><span>${esc(t.email || "")}</span>
      <span class="pl">Neue Adresse:</span><span style="grid-column:span 3">${esc(p.neue_adresse || "-")}</span>
    </div></div>
    <div class="info-section"><div class="card-eyebrow">Mietobjekt</div><div class="info-grid">
      <span class="lbl">Wohnung:</span><span>${esc(objekt)}</span>
      ${p.room_id ? `<span class="lbl">Zimmer:</span><span>${esc(p.room_id)}</span>` : ""}
      <span class="lbl">Auszug am:</span><span>${datumDE(p.datum)}</span>
    </div></div>
    <div class="info-section"><div class="card-eyebrow">Schlüsselrückgabe</div>
      <table class="keys"><tr><th>Schlüssel</th><th>Nummer</th><th>Status</th><th style="text-align:right">Kosten</th></tr>${keyRows || `<tr><td colspan="4">Keine Schlüssel erfasst</td></tr>`}</table>${wg}
    </div>
    <div class="maengel-title">Neue Mängel gegenüber dem Einzug (${maengel.length})</div>
    ${mHtml}
    ${weitere ? `<div class="info-section"><div class="card-eyebrow">Weiteres</div><div class="info-grid">${weitere}</div></div>` : ""}
    <div class="total"><b>Zulasten der Mietpartei: ${chf(total)}</b>${total > 0 ? `<br><span style="font-size:11px;color:#555">Dieser Betrag wird mit der Mietkaution verrechnet. Die definitive Abrechnung folgt separat.</span>` : ""}</div>
    <div class="clauses"><div class="ct">Bestätigung</div><ol>
      <li>Das Mietobjekt wurde am oben genannten Datum zurückgegeben. Der Zustand und die Schlüsselrückgabe sind in diesem Protokoll festgehalten.</li>
      <li>Die als «zulasten der Mietpartei» bezeichneten Mängel gehen über die normale Abnutzung hinaus. Sie gelten mit diesem Protokoll als gemeldet (Art. 267a OR). Die aufgeführten Beträge sind Schätzungen; massgebend sind die effektiven Kosten.</li>
      <li>Fehlende Schlüssel werden auf Kosten der Mietpartei ersetzt bzw. die betroffenen Schlösser ausgewechselt.</li>
      <li>Später entdeckte, bei der Rückgabe nicht erkennbare Mängel bleiben vorbehalten (Art. 267a Abs. 3 OR).</li>
    </ol></div>
    <div class="signatures">
      <div class="sig-block"><div class="role">Mietpartei</div>${sigMieter}</div>
      <div class="sig-block"><div class="role">Für D&amp;T Homes</div><div class="name">D&amp;T Partners GmbH</div><div class="meta">${esc(p.erfasst_von || "")}${p.erfasst_von ? " · " : ""}${datumDE(p.datum)}</div></div>
    </div>
  </div></body></html>`;
}

async function renderPdf(html: string): Promise<string> {
  const res = await fetch(PDF_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ html, filename: "auszug.pdf", format: "A4" }) });
  if (!res.ok) throw new Error(`PDF ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)) as unknown as number[]);
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    let user: any = null;
    if (jwt && jwt !== ANON_KEY) {
      const ar = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}` } });
      if (ar.ok) user = await ar.json().catch(() => null);
    }
    if (!user || !user.id) return json({ error: "Nicht autorisiert - bitte im Admin einloggen." }, 401);

    const { protocolId, preview, sendEmail, nurMail } = await req.json();
    if (!protocolId) return json({ error: "protocolId fehlt" }, 400);
    const p = (await rest(`auszug_protokolle?id=eq.${encodeURIComponent(protocolId)}&select=*`))?.[0];
    if (!p) return json({ error: "Protokoll nicht gefunden" }, 404);
    const t = (await rest(`tenants?id=eq.${encodeURIComponent(p.tenant_id)}&select=id,vorname,nachname,email,sprache`))?.[0] || {};
    const a = p.apt_id ? (await rest(`apartments?id=eq.${encodeURIComponent(p.apt_id)}&select=adresse,plz,ort`))?.[0] : null;

    const pdf = await renderPdf(buildHtml(p, t, a));
    if (preview) return json({ ok: true, pdfBase64: pdf });

    const jetzt = new Date().toISOString();
    if (!nurMail) {
      const fname = `${sanitize(t.nachname || "")}_${sanitize(t.vorname || "")}_Auszugsprotokoll.pdf`;
      const path = `tenant/${p.tenant_id}/${Date.now()}_${fname}`;
      const bytes = Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0));
      const up = await fetch(`${SUPABASE_URL}/storage/v1/object/documents/${path}`, { method: "POST", headers: { ...H, "Content-Type": "application/pdf", "x-upsert": "true" }, body: bytes });
      if (!up.ok) throw new Error(`Ablage ${up.status}: ${(await up.text()).slice(0, 200)}`);
      await rest("documents", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify([{ entity_type: "tenant", entity_id: p.tenant_id, category: "Übergabeprotokoll", filename: fname, storage_path: path, file_size: bytes.length, mime_type: "application/pdf", uploaded_by: "Auszugsprotokoll" }]) });
      await rest(`auszug_protokolle?id=eq.${p.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "abgeschlossen", abgeschlossen_at: jetzt, pdf_path: path, updated_at: jetzt }) });
    }

    let mail = null;
    if (sendEmail) {
      if (!t.email || !String(t.email).includes("@")) return json({ error: "Keine gültige E-Mail-Adresse bei der Mietpartei", abgeschlossen: !nurMail }, 400);
      const en = t.sprache === "en";
      const hallo = en ? `Hi ${esc(t.vorname || "")},` : `Hallo ${esc(t.vorname || "")}`;
      const text = en
        ? `<p>${hallo}</p><p>Thank you for handing back your room. Attached is the move-out protocol, which records the key return and the condition of the apartment.</p><p>If you have any questions, just reply to this email.</p><p>Kind regards,<br>D&amp;T Homes</p>`
        : `<p>${hallo}</p><p>Danke für die Rückgabe. Im Anhang findest du das Auszugsprotokoll mit der Schlüsselrückgabe und dem Zustand der Wohnung.</p><p>Bei Fragen antworte einfach auf diese Mail.</p><p>Liebe Grüsse<br>D&amp;T Homes</p>`;
      const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "D&T Homes <noreply@dthomes.ch>", reply_to: "info@dthomes.ch", to: [t.email], bcc: ["daan.theijse@dthomes.ch"], subject: en ? "Your move-out protocol, D&T Homes" : "Dein Auszugsprotokoll, D&T Homes",
          html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c1b17">${text}</div>`,
          attachments: [{ filename: `Auszugsprotokoll_${sanitize(t.nachname || "")}.pdf`, content: pdf }] }) });
      mail = { ok: r.ok, status: r.status };
      if (!r.ok) throw new Error(`Mailversand ${r.status}: ${(await r.text()).slice(0, 200)}`);
      await rest(`auszug_protokolle?id=eq.${p.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ email_sent_at: new Date().toISOString() }) });
    }
    return json({ ok: true, abgeschlossen: !nurMail, mail });
  } catch (e) {
    console.error("finalize-auszug", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
