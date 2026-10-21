// send-handover-pdf - Uebernahmeprotokoll als PDF an Mieter, Logo eingebettet.
// Wird nur serverseitig aufgerufen (finalize-handover, mit Service-Role-Key).
// PDF wird in der Dokumente-Sektion gespeichert und das Protokoll abgeschlossen.
// Sprache (de/en) kommt vom Mieter (tenants.sprache) bzw. Bewerber.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const LOGO_URL = "https://mieter.dthomes.ch/dt-logo.png";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const H = { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` };

function istServiceRole(req: Request): boolean {
  const t = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return !!t && t === SUPABASE_SERVICE_KEY;
}

async function ladeLogo(): Promise<string | null> {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)) as unknown as number[]);
    return btoa(bin);
  } catch (_) { return null; }
}
function logoAnhang(b64: string | null) {
  return b64 ? [{ filename: "logo.png", content: b64, content_type: "image/png", content_id: "dt-logo", disposition: "inline" }] : [];
}
function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
function formatDate(v: string | null, en: boolean): string {
  const d = v ? new Date(v) : new Date();
  if (isNaN(d.getTime())) return String(v || "");
  const de = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
  const eng = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${d.getDate()}${en ? "" : "."} ${(en ? eng : de)[d.getMonth()]} ${d.getFullYear()}`;
}
function sanitizeDoc(str: string): string {
  return (str || "").replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue").replace(/[ß]/g, "ss")
    .replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function rest(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H });
  return r.ok ? await r.json() : [];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!istServiceRole(req)) return json({ error: "Nicht berechtigt" }, 403);

  try {
    const { token, pdfBase64, force } = await req.json();
    if (!token || !pdfBase64) return json({ error: "Missing token or pdfBase64" }, 400);
    if (!String(atob(String(pdfBase64).slice(0, 12))).startsWith("%PDF")) return json({ error: "Keine gueltige PDF-Datei" }, 400);

    const protocols = await rest(`handover_protocols?token=eq.${encodeURIComponent(token)}&select=*`);
    if (!protocols.length) return json({ error: "Protocol not found" }, 404);
    const p = protocols[0];
    if (p.pdf_email_sent_at && !force) return json({ ok: true, alreadySent: true, to: p.mieter_email });
    if (!p.mieter_email || !p.mieter_email.includes("@")) return json({ error: "Invalid email address" }, 400);

    // Sprache und Wohnungstyp bestimmen
    let sprache = "de";
    if (p.tenant_id) { const t = await rest(`tenants?id=eq.${encodeURIComponent(p.tenant_id)}&select=sprache`); if (t[0]?.sprache) sprache = t[0].sprache; }
    else if (p.bewerber_id) { const b = await rest(`applicants?id=eq.${encodeURIComponent(p.bewerber_id)}&select=sprache`); if (b[0]?.sprache) sprache = b[0].sprache; }
    const en = sprache === "en";
    const T = (de: string, e: string) => (en ? e : de);
    let istWohnung = false;
    if (p.apt_id) { const a = await rest(`apartments?id=eq.${encodeURIComponent(p.apt_id)}&select=vermietungsart`); istWohnung = a[0]?.vermietungsart === "wohnung"; }
    const auszug = p.type === "auszug";

    const name = esc((p.mieter_vorname || "").trim() || T("zusammen", "there"));
    const submitDate = formatDate(p.submitted_at, en);
    const aptAdr = p.apt_adresse ? `${p.apt_adresse}${p.apt_plz || p.apt_ort ? ", " : ""}${p.apt_plz || ""} ${p.apt_ort || ""}`.trim() : "";
    const objektZeile = istWohnung ? T("Ganze Wohnung", "Entire apartment") : (p.room_label ? T(`Zimmer ${p.room_label}`, `Room ${p.room_label}`) : "");
    const photoCount = Array.isArray(p.photos) ? p.photos.length : 0;
    const protName = auszug ? T("Rückgabeprotokoll", "move-out protocol") : T("Übernahmeprotokoll", "handover protocol");

    const logoB64 = await ladeLogo();
    const logoSrc = logoB64 ? "cid:dt-logo" : LOGO_URL;
    const subject = auszug ? T("Bestätigung: Dein Rückgabeprotokoll bei D&T Homes", "Confirmation: your move-out protocol at D&T Homes")
                           : T("Bestätigung: Dein Übernahmeprotokoll bei D&T Homes", "Confirmation: your handover protocol at D&T Homes");
    const zustand = istWohnung ? T("den Zustand der Wohnung", "the condition of the apartment")
                               : T("den Zustand deines Zimmers und der gemeinsamen Räume", "the condition of your room and the shared areas");
    const html = `<!DOCTYPE html><html lang="${en ? "en" : "de"}"><head><meta charset="UTF-8"><title>${subject}</title></head><body style="margin:0;padding:0;background:#f7f3eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1814;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:30px 24px;">
<div style="text-align:center;margin-bottom:24px;"><img src="${logoSrc}" alt="D&amp;T Homes" width="100" style="display:inline-block;width:100px;height:auto;"/></div>
<div style="background:#fff;border:1px solid #e1d8c5;border-radius:14px;padding:30px 28px;">
<div style="font-size:10px;color:#8a8174;letter-spacing:.25em;text-transform:uppercase;margin-bottom:12px;">${T("Bestätigung", "Confirmation")}</div>
<p style="font-size:14.5px;margin:0 0 14px;">Hi ${name},</p>
<p style="font-size:14px;margin:0 0 18px;">${T(`danke für dein digitales ${protName}. Anbei findest du eine <strong>PDF-Kopie</strong> für deine Unterlagen.`, `thank you for completing your digital ${protName}. Attached you will find a <strong>PDF copy</strong> for your records.`)}</p>
${(aptAdr || objektZeile) ? `<div style="background:#faf8f3;border-left:3px solid #1a1814;padding:14px 18px;margin:0 0 20px;font-size:13.5px;line-height:1.7;">${aptAdr ? `<div>📍 ${esc(aptAdr)}</div>` : ""}${objektZeile ? `<div style="margin-top:4px;">🚪 ${esc(objektZeile)}</div>` : ""}<div style="margin-top:4px;color:#5a5044;font-size:12.5px;">${T("Eingereicht am", "Submitted on")}: ${submitDate}</div>${photoCount ? `<div style="margin-top:4px;color:#5a5044;font-size:12.5px;">${T("Fotos", "Photos")}: ${photoCount}</div>` : ""}</div>` : ""}
<p style="font-size:14px;margin:0 0 18px;">${T(`Bitte bewahre dieses Dokument gut auf. Es dient als Nachweis für ${zustand} bei der ${auszug ? "Rückgabe" : "Übernahme"}.`, `Please keep this document safe. It serves as proof of ${zustand} at ${auszug ? "move-out" : "handover"}.`)}</p>
${auszug ? "" : `<div style="background:#e8efde;border:1px solid #c5d5b0;border-radius:8px;padding:12px 16px;margin:0 0 22px;font-size:13px;color:#3a5230;line-height:1.6;">
<strong>${T("Wichtig", "Important")}:</strong> ${T("Verdeckte Mängel, die bei der Übernahme trotz sorgfältiger Prüfung nicht erkennbar waren, kannst du innert 10 Tagen ab Entdeckung an", "Hidden defects that were not visible at handover despite careful inspection can be reported within 10 days of discovery to")} <a href="mailto:info@dthomes.ch" style="color:#3a5230;">info@dthomes.ch</a> ${T("melden (Art. 256 OR).", "(Art. 256 Swiss Code of Obligations).")}
</div>
<p style="font-size:14px;margin:0 0 18px;">${T("Wir wünschen dir eine schöne Zeit in deinem neuen Zuhause!", "We wish you a great time in your new home!")}</p>`}
<p style="font-size:12px;color:#6e6a62;margin:24px 0 0;padding-top:18px;border-top:1px solid #f0eadd;">${T("Bei Fragen:", "Questions?")} <a href="mailto:info@dthomes.ch" style="color:#5a5448;">info@dthomes.ch</a> ${T("oder per WhatsApp", "or via WhatsApp")} <a href="https://wa.me/41766887091" style="color:#5a5448;">+41 76 688 70 91</a>.</p>
</div>
<div style="text-align:center;margin-top:22px;font-size:11.5px;color:#8a8174;">D&amp;T Partners GmbH &middot; dthomes.ch</div>
</div></body></html>`;

    const fileBase = auszug ? "Rueckgabeprotokoll" : "Uebernahmeprotokoll";
    const filename = `${fileBase}_${sanitizeDoc(p.mieter_nachname || "Mieter")}_${sanitizeDoc(p.mieter_vorname || "")}.pdf`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "D&T Homes <noreply@dthomes.ch>",
        to: [p.mieter_email],
        bcc: ["daan.theijse@dthomes.ch"],
        reply_to: "info@dthomes.ch",
        subject, html,
        attachments: [{ filename, content: pdfBase64 }, ...logoAnhang(logoB64)],
      }),
    });
    if (!resendRes.ok) throw new Error(`Resend ${resendRes.status}: ${await resendRes.text()}`);
    const resendData = await resendRes.json();

    // PDF in der Dokumente-Sektion ablegen (non-fatal)
    let documentSaved = false; let documentError: string | null = null;
    try {
      const entityType = p.tenant_id ? "tenant" : (p.bewerber_id ? "applicant" : null);
      const entityId = p.tenant_id || p.bewerber_id || null;
      if (entityType && entityId) {
        const category = auszug ? "Rückgabeprotokoll" : "Übergabeprotokoll";
        const docFilename = `${sanitizeDoc(p.mieter_nachname)}_${sanitizeDoc(p.mieter_vorname)}_${sanitizeDoc(category)}.pdf`;
        const docPath = `${entityType}/${entityId}/${Date.now()}_${docFilename}`;
        const bytes = base64ToBytes(pdfBase64);
        const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/documents/${docPath}`, { method: "POST", headers: { ...H, "Content-Type": "application/pdf", "x-upsert": "true" }, body: bytes });
        if (!upRes.ok) documentError = `Storage-Upload ${upRes.status}: ${await upRes.text()}`;
        else {
          const insRes = await fetch(`${SUPABASE_URL}/rest/v1/documents`, {
            method: "POST", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify([{ entity_type: entityType, entity_id: entityId, category, filename: docFilename, storage_path: docPath, file_size: bytes.length, mime_type: "application/pdf", uploaded_by: `${category} (automatisch)` }]),
          });
          if (!insRes.ok) documentError = `documents-Insert ${insRes.status}: ${await insRes.text()}`; else documentSaved = true;
        }
      } else documentError = "Protokoll ohne tenant_id/bewerber_id, nicht zuordenbar";
    } catch (docErr) { documentError = String((docErr as Error).message || docErr); }
    if (documentError) console.error("Dokument-Speicherung fehlgeschlagen:", documentError);

    const jetzt = new Date().toISOString();
    await fetch(`${SUPABASE_URL}/rest/v1/handover_protocols?token=eq.${encodeURIComponent(token)}`, {
      method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ pdf_email_sent_at: jetzt, status: "accepted", closed_at: jetzt, updated_at: jetzt }),
    });

    return json({ ok: true, emailId: resendData.id, to: p.mieter_email, documentSaved, documentError });
  } catch (err) {
    console.error("send-handover-pdf error:", err);
    return json({ error: String((err as Error).message || err) }, 500);
  }
});
