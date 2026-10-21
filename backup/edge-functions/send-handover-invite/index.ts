// send-handover-invite - Einladung zum Uebernahmeprotokoll (DE/EN), Logo eingebettet.
// Nur fuer eingeloggte Admins bzw. serverseitig. Schutz vor Doppelversand (2 Minuten).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const BASE_URL = "https://mieter.dthomes.ch";
const LOGO_URL = "https://mieter.dthomes.ch/dt-logo.png";
const H = { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function istAdminOderServer(req: Request): Promise<boolean> {
  const t = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!t) return false;
  if (t === SUPABASE_SERVICE_KEY) return true;
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${t}` } });
  if (!u.ok) return false;
  const email = String((await u.json())?.email || "").toLowerCase();
  if (!email) return false;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/allowed_users?email=ilike.${encodeURIComponent(email)}&select=role`, { headers: H });
  const rows = r.ok ? await r.json() : [];
  return rows.some((x: any) => x.role === "admin");
}
async function rest(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H });
  return r.ok ? await r.json() : [];
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
  if (!v) return "";
  const s = String(v).trim();
  const de = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
  const eng = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  let d: Date | null = null;
  if (m) d = new Date(+m[3], +m[2] - 1, +m[1]); else { const x = new Date(s); if (!isNaN(x.getTime())) d = x; }
  if (!d) return s;
  return `${d.getDate()}${en ? "" : "."} ${(en ? eng : de)[d.getMonth()]} ${d.getFullYear()}`;
}

// Hinweis: Fotos allein reichen nicht, erst Schluesselnummer + Unterschrift + Absenden
function abschlussBox(en: boolean) {
  const T = (de: string, e: string) => (en ? e : de);
  const li = (n: number, txt: string) => `<tr><td width="30" style="width:30px;vertical-align:top;padding:4px 0;"><span style="display:inline-block;background:#1a1814;color:#fff;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;font-size:11.5px;font-weight:600;">${n}</span></td><td style="vertical-align:top;padding:5px 0;font-size:13.5px;color:#3a352d;">${txt}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 22px;"><tr><td bgcolor="#faf8f3" style="background:#faf8f3;border-left:3px solid #1a1814;padding:14px 18px;">
<div style="font-size:10px;color:#8a8174;letter-spacing:.22em;text-transform:uppercase;margin-bottom:8px;">${T("So ist dein Protokoll erledigt", "How to complete your protocol")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">${li(1, T("Mängel pro Raum mit Foto erfassen (falls vorhanden)", "Record defects per room with a photo (if any)"))}${li(2, T("<strong>Schlüsselnummer</strong> abschreiben, die auf deinem Schlüssel steht", "Copy the <strong>key number</strong> shown on your key"))}${li(3, T("<strong>Unterschreiben</strong> und auf <strong>«Protokoll absenden»</strong> tippen", "<strong>Sign</strong> and tap <strong>«Submit protocol»</strong>"))}</table>
<div style="font-size:12.5px;color:#9b4a3e;margin-top:10px;line-height:1.5;"><strong>${T("Wichtig:", "Important:")}</strong> ${T("Fotos hochladen allein reicht nicht. Erst nach dem Absenden ist das Protokoll bei uns eingegangen.", "Uploading photos alone is not enough. The protocol only reaches us once you have submitted it.")}</div>
</td></tr></table>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!(await istAdminOderServer(req))) return json({ error: "Nicht berechtigt" }, 403);

  try {
    const { protocolId } = await req.json();
    if (!protocolId) return json({ error: "Missing protocolId" }, 400);
    const protocols = await rest(`handover_protocols?id=eq.${encodeURIComponent(protocolId)}&select=*`);
    if (!protocols.length) return json({ error: "Protocol not found" }, 404);
    const p = protocols[0];
    if (!p.mieter_email || !p.mieter_email.includes("@")) return json({ error: "Invalid email address" }, 400);
    if (p.invite_sent_at && Date.now() - Date.parse(p.invite_sent_at) < 2 * 60 * 1000) return json({ error: "Die Einladung wurde gerade eben schon gesendet." }, 409);

    let sprache = "de";
    if (p.tenant_id) { const t = await rest(`tenants?id=eq.${encodeURIComponent(p.tenant_id)}&select=sprache`); if (t[0]?.sprache) sprache = t[0].sprache; }
    else if (p.bewerber_id) { const b = await rest(`applicants?id=eq.${encodeURIComponent(p.bewerber_id)}&select=sprache`); if (b[0]?.sprache) sprache = b[0].sprache; }
    const en = sprache === "en";
    const T = (de: string, e: string) => (en ? e : de);

    const url = `${BASE_URL}/uebernahme/${p.token}${en ? "?lang=en" : ""}`;
    const name = esc((p.mieter_vorname || "").trim() || T("zusammen", "there"));
    const deadline = p.deadline ? formatDate(p.deadline, en) : T("14 Tage nach Einzug", "14 days after move-in");
    const einzug = p.einzug_datum ? formatDate(p.einzug_datum, en) : "";
    const aptAdr = p.apt_adresse ? `${p.apt_adresse}${p.apt_plz || p.apt_ort ? ", " : ""}${p.apt_plz || ""} ${p.apt_ort || ""}`.trim() : "";
    const zimmer = p.room_label || "";
    const istW = p.objekt_typ === "wohnung";
    const objektZeile = istW ? `<div style="margin-top:4px;">🏠 ${T("Ganze Wohnung", "Entire apartment")}</div>` : (zimmer ? `<div style="margin-top:4px;">🚪 ${T("Zimmer", "Room")} ${esc(zimmer)}</div>` : "");
    const wlanBox = istW ? "" : `<div style="background:#eef3ec;border:1px solid #cfe0c8;border-radius:8px;padding:12px 16px;margin:0 0 20px;font-size:13.5px;line-height:1.6;color:#2f5230;">📶 <strong>${T("WLAN", "Wi-Fi")}</strong><br>${T("Verbinde dich mit dem <strong>D&amp;T Homes</strong> WLAN.", "Connect to the <strong>D&amp;T Homes</strong> Wi-Fi.")}<br>${T("Passwort", "Password")}: <strong>Welcome!</strong></div>`;
    const pruefText = istW
      ? T("Bitte prüfe die Wohnung sorgfältig, Raum für Raum, und dokumentiere allfällige Mängel mit Foto und kurzer Beschreibung. Das schützt dich bei der Rückgabe.", "Please check the apartment carefully, room by room, and document any defects with a photo and a short description. This protects you when you move out.")
      : T("Bitte prüfe die Wohnung und das Zimmer sorgfältig und dokumentiere allfällige Mängel mit Foto und kurzer Beschreibung. Das schützt dich bei der Rückgabe.", "Please check the apartment and your room carefully and document any defects with a photo and a short description. This protects you when you move out.");

    const logoB64 = await ladeLogo();
    const logoSrc = logoB64 ? "cid:dt-logo" : LOGO_URL;
    const subject = T("Dein Übernahmeprotokoll bei D&T Homes: bitte innert 14 Tagen ausfüllen", "Your handover protocol at D&T Homes: please complete within 14 days");
    const html = `<!DOCTYPE html><html lang="${en ? "en" : "de"}"><head><meta charset="UTF-8"><title>${subject}</title></head><body style="margin:0;padding:0;background:#f7f3eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1814;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:30px 24px;">
<div style="text-align:center;margin-bottom:24px;"><img src="${logoSrc}" alt="D&amp;T Homes" width="100" style="display:inline-block;width:100px;height:auto;"/></div>
<div style="background:#fff;border:1px solid #e1d8c5;border-radius:14px;padding:30px 28px;">
<p style="font-size:14.5px;margin:0 0 14px;">Hi ${name},</p>
<p style="font-size:14px;margin:0 0 18px;">${T("herzlich willkommen in deinem neuen Zuhause! Wir freuen uns, dass du da bist. Hier ist der Link zu deinem digitalen <strong>Übernahmeprotokoll</strong>.", "welcome to your new home! We are glad to have you. Here is the link to your digital <strong>handover protocol</strong>.")}</p>
${(aptAdr || objektZeile || einzug) ? `<div style="background:#faf8f3;border-left:3px solid #1a1814;padding:14px 18px;margin:0 0 20px;font-size:13.5px;line-height:1.7;">${aptAdr ? `<div>📍 ${esc(aptAdr)}</div>` : ""}${objektZeile}${einzug ? `<div style="margin-top:4px;color:#5a5044;font-size:12.5px;">${T("Einzug", "Move-in")}: ${einzug}</div>` : ""}</div>` : ""}
${wlanBox}
<p style="font-size:14px;margin:0 0 18px;">${pruefText}</p>
${abschlussBox(en)}
<div style="background:#fdf7e8;border:1px solid #e8d2a8;border-radius:8px;padding:12px 16px;margin:0 0 22px;font-size:13px;color:#8a6a2e;line-height:1.5;">
⚠️ ${T(`Du hast <strong>14 Tage</strong> Zeit, das Protokoll auszufüllen. Frist: <strong>${deadline}</strong>. Danach gilt die Wohnung automatisch als in einwandfreiem Zustand übernommen.`, `You have <strong>14 days</strong> to complete the protocol. Deadline: <strong>${deadline}</strong>. After that, the apartment is deemed to have been handed over in perfect condition.`)}
</div>
<div style="text-align:center;margin:28px 0;">
<a href="${url}" style="display:inline-block;background:#1a1814;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:14px;font-weight:500;letter-spacing:.02em;">${T("Übernahmeprotokoll ausfüllen", "Complete handover protocol")}</a>
</div>
<p style="font-size:12px;color:#6e6a62;margin:24px 0 0;padding-top:18px;border-top:1px solid #f0eadd;">${T("Oder kopiere diesen Link in deinen Browser:", "Or copy this link into your browser:")}<br><span style="color:#1a1814;word-break:break-all;">${url}</span></p>
<p style="font-size:12px;color:#6e6a62;margin:14px 0 0;">${T("Bei Fragen:", "Questions?")} <a href="mailto:info@dthomes.ch" style="color:#5a5448;">info@dthomes.ch</a> ${T("oder per WhatsApp", "or via WhatsApp")} <a href="https://wa.me/41766887091" style="color:#5a5448;">+41 76 688 70 91</a>.</p>
</div>
<div style="text-align:center;margin-top:22px;font-size:11.5px;color:#8a8174;">D&amp;T Partners GmbH &middot; dthomes.ch</div>
</div></body></html>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "D&T Homes <noreply@dthomes.ch>", to: [p.mieter_email], bcc: ["daan.theijse@dthomes.ch"], reply_to: "info@dthomes.ch", subject, html, attachments: logoAnhang(logoB64) }),
    });
    if (!resendRes.ok) {
      const errText = await resendRes.text();
      await fetch(`${SUPABASE_URL}/rest/v1/handover_protocols?id=eq.${encodeURIComponent(protocolId)}`, {
        method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ invite_email_error: `${resendRes.status}: ${errText.substring(0, 200)}` }),
      });
      throw new Error(`Resend error: ${resendRes.status} ${errText}`);
    }
    const resendData = await resendRes.json();
    await fetch(`${SUPABASE_URL}/rest/v1/handover_protocols?id=eq.${encodeURIComponent(protocolId)}`, {
      method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ invite_sent_at: new Date().toISOString(), invite_email_error: null }),
    });
    return json({ ok: true, emailId: resendData.id, url, to: p.mieter_email });
  } catch (err) {
    console.error("send-handover-invite error:", err);
    return json({ error: String((err as Error).message || err) }, 500);
  }
});
