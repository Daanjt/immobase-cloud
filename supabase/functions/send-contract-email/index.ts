// send-contract-email - Vertragslink an Mieter (DE/EN), Logo eingebettet.
// Nur fuer eingeloggte Admins bzw. serverseitig.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SIGN_BASE_URL = "https://mieter.dthomes.ch";
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
function chf(n: unknown) {
  const num = Number(n);
  if (n === null || n === undefined || n === "" || isNaN(num)) return "-";
  return "CHF\u00a0" + num.toLocaleString("de-CH") + ".-";
}
function datumLang(s: unknown, en: boolean) {
  const str = String(s || "").trim();
  if (!str) return "";
  const de = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
  const eng = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  let d: Date | null = null;
  const m = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) d = new Date(+m[3], +m[2] - 1, +m[1]);
  else if (/^\d{4}-\d{2}-\d{2}/.test(str)) { const [y, mo, da] = str.slice(0, 10).split("-").map(Number); d = new Date(y, mo - 1, da); }
  if (!d || isNaN(d.getTime())) return str;
  return `${d.getDate()}${en ? "" : "."} ${(en ? eng : de)[d.getMonth()]} ${d.getFullYear()}`;
}
// Feste Spaltenbreiten und Box als Tabelle, damit Outlook nichts verbreitert
function zeile(label: string, wert: string, erste = false) {
  const bt = erste ? "" : "border-top:1px solid #efe7d6;";
  return `<tr><td width="62%" style="width:62%;padding:7px 8px 7px 0;color:#4a4439;vertical-align:top;${bt}">${label}</td><td width="38%" style="width:38%;padding:7px 0;text-align:right;vertical-align:top;${bt}">${wert}</td></tr>`;
}
function zeileVoll(label: string, wert: string, erste = false) {
  const bt = erste ? "" : "border-top:1px solid #efe7d6;";
  return `<tr><td colspan="2" style="padding:7px 0;${bt}"><div style="color:#8a8174;font-size:11.5px;margin-bottom:2px;">${label}</div><div style="color:#1a1814;">${wert}</div></td></tr>`;
}
function summeZeile(label: string, wert: string) {
  return `<tr><td width="62%" style="width:62%;padding:10px 8px 2px 0;font-weight:600;border-top:2px solid #1a1814;">${label}</td><td width="38%" style="width:38%;padding:10px 0 2px;text-align:right;font-weight:600;white-space:nowrap;border-top:2px solid #1a1814;">${wert}</td></tr>`;
}
function box(titel: string, inhalt: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 22px;"><tr><td bgcolor="#faf8f3" style="background:#faf8f3;border-left:3px solid #1a1814;padding:16px 18px;"><div style="font-size:10px;color:#8a8174;letter-spacing:.22em;text-transform:uppercase;margin-bottom:8px;">${titel}</div>${inhalt}</td></tr></table>`;
}
function tabelle(rows: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;font-size:13px;color:#1a1814;border-collapse:collapse;">${rows}</table>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!(await istAdminOderServer(req))) return json({ error: "Nicht berechtigt" }, 403);
  try {
    const { contractId } = await req.json();
    if (!contractId) return json({ error: "Missing contractId" }, 400);
    const contracts = await rest(`contracts?id=eq.${encodeURIComponent(contractId)}&select=*`);
    if (!contracts.length) return json({ error: "Contract not found" }, 404);
    const c = contracts[0];

    // Sprache: Bewerbung, sonst Mieter (ueber E-Mail)
    let sprache = "de";
    if (c.bewerber_id) { const b = await rest(`applicants?id=eq.${encodeURIComponent(c.bewerber_id)}&select=sprache`); if (b[0]?.sprache) sprache = b[0].sprache; }
    if (sprache === "de" && c.mieter_email) { const t = await rest(`tenants?email=ilike.${encodeURIComponent(c.mieter_email)}&select=sprache&limit=1`); if (t[0]?.sprache) sprache = t[0].sprache; }
    if (c.contract_type === "parkplatz" && c.contract_data?.sprache) sprache = c.contract_data.sprache;
    const en = sprache === "en";
    const T = (de: string, e: string) => (en ? e : de);

    const signUrl = `${SIGN_BASE_URL}/${c.token}${en ? "?lang=en" : ""}`;
    const mieterName = `${c.mieter_vorname || ""} ${c.mieter_nachname || ""}`.trim() || T("zusammen", "there");
    const v = (c.contract_data && c.contract_data.vertrag) || {};
    const apt = v.apt || {};
    const istWohnung = v.vertragsart === "wohnung" || apt.vermietungsart === "wohnung";
    const mm = istWohnung && v.mitmieter && String(v.mitmieter.vorname || "").trim() ? v.mitmieter : null;
    const mmName = mm ? `${mm.vorname || ""} ${mm.nachname || ""}`.trim() : "";
    const isVerlaengerung = c.contract_type === "verlaengerung" || c.contract_type === "nachtrag";
    const nurUmv = c.contract_type === "untermietvertrag";
    const nurAmz = c.contract_type === "anfangsmietzins";
    const amzLabel = T("Anfangsmietzinsformular (offizielles Formular Kanton Zürich)", "Initial rent form (official form of the Canton of Zurich)");

    let subject: string, introText: string, listItems: string, readText: string, summary = "";
    if (c.contract_type === "parkplatz") {
      const pp = (c.contract_data && c.contract_data.parkplatz) || {};
      const ort = [pp.objektAdresse, pp.plzOrt].filter(Boolean).join(", ");
      subject = T(`Dein Mietvertrag für den Parkplatz${pp.objektAdresse ? " an der " + pp.objektAdresse : ""}: bitte digital unterschreiben`, `Your parking space agreement${pp.objektAdresse ? " at " + pp.objektAdresse : ""}: please sign digitally`);
      introText = T(`Dein Mietvertrag für den Parkplatz${ort ? ` an der <strong>${esc(ort)}</strong>` : ""} ist bereit zur digitalen Unterzeichnung. Du findest ihn unter dem Link unten:`, `Your rental agreement for the parking space${ort ? ` at <strong>${esc(ort)}</strong>` : ""} is ready to be signed digitally. You can find it via the link below:`);
      listItems = `<li>${T("Mietvertrag Parkplatz", "Parking space rental agreement")}</li>`;
      readText = T("Bitte lies den Vertrag sorgfältig durch und unterzeichne ihn digital auf der Unterschriften-Seite.", "Please read the agreement carefully and sign it digitally on the signature page.");
      summary = box(T("Zusammenfassung", "Summary"), tabelle(
        zeileVoll(T("Parkplatz", "Parking space"), esc([pp.bezeichnung, ort].filter(Boolean).join(", ")), true) +
        (pp.ab ? zeile(T("Mietbeginn", "Start"), esc(datumLang(pp.ab, en))) : "") +
        (pp.bis ? zeile(T("Befristet bis", "Fixed term until"), esc(datumLang(pp.bis, en))) : zeile(T("Dauer", "Duration"), T("unbefristet", "indefinite"))) +
        (pp.miete ? summeZeile(T("Miete pro Monat", "Rent per month"), chf(pp.miete)) : "")
      ));
    } else if (isVerlaengerung) {
      subject = T("Verlängerung deines Mietverhältnisses bei D&T Homes: bitte digital unterschreiben", "Extension of your tenancy at D&T Homes: please sign digitally");
      introText = T("Dein Mietverhältnis bei D&amp;T Homes wird verlängert. Der Nachtrag ist bereit zur digitalen Unterzeichnung. Du findest ihn unter dem Link unten:", "Your tenancy at D&amp;T Homes is being extended. The addendum is ready to be signed digitally. You can find it via the link below:");
      listItems = `<li>${T("Verlängerung (Nachtrag zum Untermietvertrag)", "Extension (addendum to the sublease agreement)")}</li>`;
      readText = T("Bitte lies das Dokument sorgfältig durch und unterzeichne es digital auf der Unterschriften-Seite. Alle übrigen Bedingungen deines bestehenden Vertrags bleiben unverändert.", "Please read the document carefully and sign it digitally on the signature page. All other terms of your existing agreement remain unchanged.");
    } else if (istWohnung) {
      const adr = [apt.adresse || v.adresse, [apt.plz || v.plz, apt.ort || v.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      const strasse = apt.adresse || v.adresse;
      subject = en ? `Your sublease agreement for the apartment${strasse ? " at " + strasse : ""}: please sign digitally` : `Dein Untermietvertrag für die Wohnung${strasse ? " an der " + strasse : ""}: bitte digital unterschreiben`;
      listItems = [
        !nurAmz ? `<li style="margin-bottom:4px;">${T("Untermietvertrag für die ganze Wohnung", "Sublease agreement for the entire apartment")}</li>` : "",
        !nurUmv ? `<li>${amzLabel}</li>` : "",
      ].join("");
      const mehrere = !nurUmv && !nurAmz;
      introText = en
        ? `Your sublease agreement for the apartment${adr ? ` at <strong>${esc(adr)}</strong>` : ""} is ready to be signed digitally. You can find ${mehrere ? "both documents" : "the document"} via the link below:`
        : `Dein Untermietvertrag für die Wohnung${adr ? ` an der <strong>${esc(adr)}</strong>` : ""} ist bereit zur digitalen Unterzeichnung. Du findest unter dem Link unten ${mehrere ? "beide Dokumente" : "das Dokument"}:`;
      readText = mm
        ? T(`Bitte lest ${mehrere ? "beide Dokumente" : "das Dokument"} sorgfältig durch. Da <strong>${esc(mmName)}</strong> als Mitmieter*in Vertragspartei ist, unterschreibt ihr beide digital auf derselben Unterschriften-Seite, jede Person in ihrem eigenen Feld.`, `Please read ${mehrere ? "both documents" : "the document"} carefully. As <strong>${esc(mmName)}</strong> is a party to the agreement as co-tenant, you both sign digitally on the same signature page, each in your own field.`)
        : T(`Bitte lies ${mehrere ? "beide Dokumente" : "das Dokument"} sorgfältig durch und unterzeichne digital auf der Unterschriften-Seite.${mehrere ? " Eine einzige digitale Unterschrift gilt für beide Dokumente." : ""}`, `Please read ${mehrere ? "both documents" : "the document"} carefully and sign digitally on the signature page.${mehrere ? " A single digital signature applies to both documents." : ""}`);
      const pers = Math.max(1, +v.personen || 1);
      const brutto = +v.bruttomiete || 0;
      const strom = +v.strom || 0;
      const sg = +v.aufschlag || 0;
      const total = +v.total || (brutto + strom + sg);
      const objekt = [T("Ganze Wohnung", "Entire apartment"), apt.zimmer ? `${apt.zimmer}\u00a0${T("Zimmer", "rooms")}` : "", apt.flaeche ? `${apt.flaeche}\u00a0m²` : "", T("unmöbliert", "unfurnished")].filter(Boolean).join(" · ");
      const ende = v.mietende || apt.mietende;
      const km = v.kautionMonate == null ? 3 : +v.kautionMonate;
      summary = box(T("Zusammenfassung", "Summary"), tabelle(
        zeileVoll(T("Mietobjekt", "Rental object"), esc(objekt), true) +
        (adr ? zeileVoll(T("Adresse", "Address"), esc(adr)) : "") +
        (v.einzug ? zeile(T("Mietbeginn", "Start of tenancy"), esc(datumLang(v.einzug, en))) : "") +
        (ende ? zeile(T("Befristet bis", "Fixed term until"), esc(datumLang(ende, en))) : "") +
        zeile(T("Anzahl Personen", "Number of persons"), String(pers)) +
        (mm ? zeileVoll(T("Mitmieter*in (solidarisch)", "Co-tenant (jointly liable)"), esc(mmName)) : "") +
        (brutto ? zeile(T("Bruttomiete inkl. Nebenkosten", "Gross rent incl. additional costs"), chf(brutto)) : "") +
        (strom ? zeile(en ? `Electricity flat rate (${pers} ${pers === 1 ? "person" : "persons"})` : `Strom pauschal (${pers} ${pers === 1 ? "Person" : "Personen"})`, chf(strom)) : "") +
        (sg ? zeile(T("Servicegebühr Kautionsreduktion", "Service fee deposit reduction"), chf(sg)) : "") +
        (total ? summeZeile(T("Total pro Monat", "Total per month"), chf(total)) : "") +
        (v.kautionBetrag ? zeile(en ? `Deposit (${km} ${km === 1 ? "month's" : "months'"} rent, one-off)` : `Kaution (${km} ${km === 1 ? "Monatsmiete" : "Monatsmieten"}, einmalig)`, chf(v.kautionBetrag)) : "")
      ));
    } else {
      subject = T("Dein Untermietvertrag bei D&T Homes: bitte digital unterschreiben", "Your sublease agreement at D&T Homes: please sign digitally");
      introText = T("Dein Untermietvertrag bei D&amp;T Homes ist bereit zur digitalen Unterzeichnung. Du findest unter dem Link unten beide Dokumente:", "Your sublease agreement at D&amp;T Homes is ready to be signed digitally. You can find both documents via the link below:");
      listItems = `<li style="margin-bottom:4px;">${T("Untermietvertrag", "Sublease agreement")}</li><li>${amzLabel}</li>`;
      readText = T("Bitte lies beide Dokumente sorgfältig durch und unterzeichne digital auf der Unterschriften-Seite. Eine einzige digitale Unterschrift gilt für beide Dokumente.", "Please read both documents carefully and sign digitally on the signature page. A single digital signature applies to both documents.");
    }
    if (en) readText += " An English translation is available on the signing page; only the German version is legally binding.";

    const anrede = mm ? `Hi ${esc(mieterName)} ${T("und", "and")} ${esc(mmName)}` : `Hi ${esc(mieterName)}`;
    const logoB64 = await ladeLogo();
    const logoSrc = logoB64 ? "cid:dt-logo" : LOGO_URL;
    const html = `<!DOCTYPE html><html lang="${en ? "en" : "de"}"><head><meta charset="UTF-8"><title>${esc(subject)}</title></head><body style="margin:0;padding:0;background:#f7f3eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1814;line-height:1.55;"><div style="max-width:560px;margin:0 auto;padding:30px 24px;"><div style="text-align:center;margin-bottom:24px;"><img src="${logoSrc}" alt="D&amp;T Homes" width="100" style="display:inline-block;width:100px;height:auto;"/></div><div style="background:#fff;border:1px solid #e1d8c5;border-radius:14px;padding:30px 28px;"><p style="font-size:14.5px;margin:0 0 14px;">${anrede},</p><p style="font-size:14px;margin:0 0 18px;">${introText}</p><ul style="font-size:13.5px;margin:0 0 22px;padding-left:20px;">${listItems}</ul>${summary}<p style="font-size:14px;margin:0 0 22px;">${readText}</p><div style="text-align:center;margin:28px 0;"><a href="${signUrl}" style="display:inline-block;background:#1a1814;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:14px;font-weight:500;letter-spacing:.02em;">${T("Jetzt unterzeichnen", "Sign now")}</a></div><p style="font-size:12px;color:#6e6a62;margin:24px 0 0;padding-top:18px;border-top:1px solid #f0eadd;">${T("Oder kopiere diesen Link in deinen Browser:", "Or copy this link into your browser:")}<br><span style="color:#1a1814;word-break:break-all;">${signUrl}</span></p><p style="font-size:12px;color:#6e6a62;margin:14px 0 0;">${T("Der Link ist 14 Tage gültig. Bei Fragen:", "The link is valid for 14 days. Questions?")} <a href="mailto:info@dthomes.ch" style="color:#5a5448;">info@dthomes.ch</a> ${T("oder per WhatsApp", "or via WhatsApp")} <a href="https://wa.me/41766887091" style="color:#5a5448;">+41 76 688 70 91</a>.</p></div><div style="text-align:center;margin-top:22px;font-size:11.5px;color:#8a8174;">D&amp;T Partners GmbH &middot; dthomes.ch</div></div></body></html>`;

    const mmEmail = mm && String(mm.email || "").trim();
    const cc = mmEmail && mmEmail.toLowerCase() !== String(c.mieter_email || "").toLowerCase() ? [mmEmail] : undefined;
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "D&T Homes <noreply@dthomes.ch>", to: [c.mieter_email], ...(cc ? { cc } : {}), bcc: ["daan.theijse@dthomes.ch"], reply_to: "info@dthomes.ch", subject, html, attachments: logoAnhang(logoB64) }),
    });
    if (!resendRes.ok) { const err = await resendRes.text(); throw new Error(`Resend error: ${resendRes.status} ${err}`); }
    const resendData = await resendRes.json();
    return json({ ok: true, emailId: resendData.id, signUrl, to: c.mieter_email });
  } catch (err) {
    console.error("send-contract-email error:", err);
    return json({ error: String((err as Error).message || err) }, 500);
  }
});
