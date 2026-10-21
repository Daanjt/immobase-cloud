// bright-responder - Bestaetigung an Bewerber (DE/EN), einheitliches D&T-Design
// Aufruf durch DB-Trigger send_bewerbung_confirmation (ohne Login). Die Bewerbung wird
// deshalb immer frisch aus der Datenbank geladen, nie aus dem mitgeschickten Payload.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const FROM_EMAIL = "D&T Homes <noreply@dthomes.ch>";
const REPLY_TO = "info@dthomes.ch";
const LOGO_URL = "https://mieter.dthomes.ch/dt-logo.png";
const WA_DIGITS = "41766887091";
const WA_DISPLAY = "+41 76 688 70 91";

const KAUTION_INFO: Record<string, {months:number; aufschlag:number; label:string}> = {
  "0x": { months: 0, aufschlag: 150, label: "0x Kaution (kein Depot)" },
  "1x": { months: 1, aufschlag: 100, label: "1x Miete" },
  "2x": { months: 2, aufschlag: 50,  label: "2x Miete" },
  "3x": { months: 3, aufschlag: 0,   label: "3x Miete (Standard)" },
};

function chf(n: unknown) {
  if (n === null || n === undefined || n === "") return "-";
  const num = Number(n);
  if (isNaN(num)) return "-";
  return "CHF " + num.toLocaleString("de-CH") + ".-";
}

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
function logoAnhang(b64: string | null) {
  return b64 ? [{ filename: "logo.png", content: b64, content_type: "image/png", content_id: "dt-logo", disposition: "inline" }] : [];
}

function huelle(inhalt: string, eyebrow: string | undefined, logoSrc: string, en = false) {
  const wa = `https://wa.me/${WA_DIGITS}`;
  const fragen = en ? "Questions?" : "Bei Fragen:";
  const oder = en ? "or via WhatsApp" : "oder per WhatsApp";
  return `<!DOCTYPE html><html lang="${en ? "en" : "de"}"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f7f3eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1814;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:30px 24px;">
<div style="text-align:center;margin-bottom:24px;"><img src="${logoSrc}" alt="D&amp;T Homes" width="100" style="display:inline-block;width:100px;height:auto;"/></div>
<div style="background:#fff;border:1px solid #e1d8c5;border-radius:14px;padding:30px 28px;">
${eyebrow ? `<div style="font-size:10px;color:#8a8174;letter-spacing:.25em;text-transform:uppercase;margin-bottom:12px;">${eyebrow}</div>` : ""}
${inhalt}
<p style="font-size:12px;color:#6e6a62;margin:24px 0 0;padding-top:18px;border-top:1px solid #f0eadd;">${fragen} <a href="mailto:info@dthomes.ch" style="color:#5a5448;">info@dthomes.ch</a> ${oder} <a href="${wa}" style="color:#5a5448;">${WA_DISPLAY}</a>.</p>
</div>
<div style="text-align:center;margin-top:22px;font-size:11.5px;color:#8a8174;">D&amp;T Partners GmbH &middot; dthomes.ch</div>
</div></body></html>`;
}

// Zeile mit Betrag: Label links, Wert rechts (feste Spaltenbreiten, damit Outlook die Tabelle nicht verbreitert)
function zeile(label: string, wert: string, ersteZeile = false) {
  const bt = ersteZeile ? "" : "border-top:1px solid #efe7d6;";
  return `<tr><td width="62%" style="width:62%;padding:7px 8px 7px 0;color:#4a4439;vertical-align:top;${bt}">${label}</td><td width="38%" style="width:38%;padding:7px 0;text-align:right;vertical-align:top;white-space:nowrap;${bt}">${wert}</td></tr>`;
}
// Zeile mit laengerem Text (Adresse, Mietobjekt): Wert unter dem Label, volle Breite
function zeileVoll(label: string, wert: string, ersteZeile = false) {
  const bt = ersteZeile ? "" : "border-top:1px solid #efe7d6;";
  return `<tr><td colspan="2" style="padding:7px 0;${bt}"><div style="color:#8a8174;font-size:11.5px;margin-bottom:2px;">${label}</div><div style="color:#1a1814;">${wert}</div></td></tr>`;
}
function summeZeile(label: string, wert: string) {
  return `<tr><td width="62%" style="width:62%;padding:10px 8px 2px 0;font-weight:600;border-top:2px solid #1a1814;">${label}</td><td width="38%" style="width:38%;padding:10px 0 2px;text-align:right;font-weight:600;white-space:nowrap;border-top:2px solid #1a1814;">${wert}</td></tr>`;
}
// Beige Box als Tabelle (zuverlaessig in Outlook, Gmail und auf dem Handy)
function box(titel: string, inhalt: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 22px;"><tr><td bgcolor="#faf8f3" style="background:#faf8f3;border-left:3px solid #1a1814;padding:16px 18px;">
<div style="font-size:10px;color:#8a8174;letter-spacing:.22em;text-transform:uppercase;margin-bottom:8px;">${titel}</div>
${inhalt}
</td></tr></table>`;
}
function tabelle(rows: string, extraStyle = "") {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;font-size:13px;color:#1a1814;border-collapse:collapse;${extraStyle}">${rows}</table>`;
}
function zwischentitel(t: string) {
  return `<div style="font-size:10px;color:#8a8174;letter-spacing:.22em;text-transform:uppercase;margin:16px 0 4px;">${t}</div>`;
}

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

// Ganze Wohnung (unmoebliert, Zwischennutzung): Bruttomiete inkl. Nebenkosten, Strom pro Person,
// Kaution 3/2/1 Monatsmieten (2x/1x mit Servicegebuehr).
function buildWohnungHtml(b: any, roomDetails: any, aptDetails: any, logoSrc: string) {
  const en = b.sprache === "en";
  const T = (de: string, e: string) => (en ? e : de);
  const pers = Math.max(1, +b.personen || 1);
  const bruttomiete = roomDetails?.miete ? +roomDetails.miete : 0;
  const stromPP = aptDetails?.strom_pro_person != null && aptDetails.strom_pro_person !== "" ? +aptDetails.strom_pro_person : 25;
  const strom = stromPP * pers;
  const total = bruttomiete + strom;
  const kInfo = b.kaution_opt ? KAUTION_INFO[b.kaution_opt] : null;
  const kMonate = kInfo ? kInfo.months : 3;
  const sg = b.kaution_aufschlag ? +b.kaution_aufschlag : (kInfo ? kInfo.aufschlag : 0);
  const kaution = total * kMonate;
  const objekt = [T("Ganze Wohnung", "Entire apartment"), aptDetails?.zimmer ? `${aptDetails.zimmer} ${T("Zimmer", "rooms")}` : "", aptDetails?.flaeche ? `${aptDetails.flaeche} m²` : "", T("unmöbliert", "unfurnished")].filter(Boolean).join(" · ");
  const adresse = aptDetails?.adresse
    ? `${aptDetails.adresse}, ${aptDetails.plz || ""} ${aptDetails.ort || "Zürich"}`.trim().replace(/\s+/g, " ")
    : "";
  const mm = b.mitmieter && b.mitmieter.vorname ? `${b.mitmieter.vorname} ${b.mitmieter.nachname || ""}`.trim() : "";

  const konditionen = bruttomiete > 0 ? box(T("Deine Konditionen", "Your conditions"),
    tabelle(
      zeileVoll(T("Mietobjekt", "Rental object"), esc(objekt), true) +
      (adresse ? zeileVoll(T("Adresse", "Address"), esc(adresse)) : "") +
      (aptDetails?.mietende ? zeile(T("Befristet bis", "Fixed term until"), esc(aptDetails.mietende)) : "") +
      zeile(T("Anzahl Personen", "Number of persons"), String(pers)) +
      (mm ? zeile(T("Zweite Person", "Second person"), esc(mm)) : "") +
      zeile(T("Bruttomiete inkl. Nebenkosten", "Gross rent incl. additional costs"), chf(bruttomiete)) +
      zeile(T(`Strom pauschal (${pers} ${pers === 1 ? "Person" : "Personen"})`, `Electricity flat rate (${pers} ${pers === 1 ? "person" : "persons"})`), chf(strom)) +
      (sg > 0 ? zeile(T("Servicegebühr Kautionsreduktion", "Service fee deposit reduction"), "+ " + chf(sg)) : "") +
      summeZeile(T("Total pro Monat", "Total per month"), chf(total + sg))
    ) +
    zwischentitel(T("Einmalig", "One-off")) +
    tabelle(kMonate === 0 ? zeile(T("Kaution", "Deposit"), T("keine", "none"), true) : zeile(kMonate === 3 ? T("Kaution (3 Monatsmieten)", "Deposit (3 months' rent)") : T(`Kaution (${kMonate} ${kMonate === 1 ? "Monatsmiete" : "Monatsmieten"})`, `Deposit (${kMonate} ${kMonate === 1 ? "month's" : "months'"} rent)`), chf(kaution), true))
  ) : "";

  const inhalt = `<p style="font-size:14.5px;margin:0 0 14px;">Hi ${esc(b.vorname)},</p>
<p style="font-size:14px;margin:0 0 18px;">${T(
    "vielen Dank für deine Bewerbung für die Wohnung bei D&amp;T Homes. Wir haben deine Unterlagen erhalten und melden uns innerhalb von <strong>48 Stunden</strong> mit einer Rückmeldung.",
    "thank you for your application for the apartment at D&amp;T Homes. We have received your details and will get back to you within <strong>48 hours</strong>."
  )}</p>
${konditionen}`;
  return huelle(inhalt, T("Bewerbung erhalten", "Application received"), logoSrc, en);
}

function buildEmailHtml(b: any, roomDetails: any, aptDetails: any, logoSrc: string) {
  if (aptDetails?.vermietungsart === "wohnung") return buildWohnungHtml(b, roomDetails, aptDetails, logoSrc);
  const en = b.sprache === "en";
  const T = (de: string, e: string) => (en ? e : de);
  const kautionInfo = b.kaution_opt ? KAUTION_INFO[b.kaution_opt] : null;
  const kautionLabel = kautionInfo
    ? (en ? (kautionInfo.months === 0 ? "no deposit" : `${kautionInfo.months}× rent${kautionInfo.months === 3 ? ", standard" : ""}`) : kautionInfo.label)
    : (b.kaution_type || "-");
  const aufschlag = b.kaution_aufschlag ? +b.kaution_aufschlag : (kautionInfo?.aufschlag || 0);
  const bruttomiete = roomDetails?.miete ? +roomDetails.miete : 0;
  const strom = 25;
  const moeblierung = b.moeblierung_pauschale ? +b.moeblierung_pauschale : 0;
  const totalMonat = bruttomiete + strom + aufschlag;
  const kautionMonate = kautionInfo?.months ?? 3;
  const kautionBetrag = bruttomiete > 0 ? (bruttomiete + strom) * kautionMonate : 0;

  const teile: string[] = [];
  if (aptDetails?.zimmer) teile.push(en ? `${aptDetails.zimmer}-room shared flat` : `${aptDetails.zimmer}-Zimmer-WG`);
  if (roomDetails?.qm) teile.push(`${roomDetails.qm} m²`);
  if (roomDetails?.balkon) teile.push(T("Balkon", "balcony"));
  const wohnungstyp = teile.join(" · ");
  const adresse = aptDetails?.adresse
    ? `${aptDetails.adresse}, ${aptDetails.plz || ""} ${aptDetails.ort || "Zürich"}`.trim().replace(/\s+/g, " ")
    : "";

  let konditionen = "";
  if (b.zimmer_wunsch && bruttomiete > 0) {
    konditionen = box(T("Deine Konditionen", "Your conditions"),
      tabelle(
        zeile(T("Zimmer", "Room"), esc(b.zimmer_wunsch), true) +
        (adresse ? zeileVoll(T("Adresse", "Address"), esc(adresse)) : "") +
        (wohnungstyp ? zeileVoll(T("Wohnungstyp", "Apartment type"), esc(wohnungstyp)) : "") +
        zeile(T("Bruttomiete", "Gross rent"), chf(bruttomiete)) +
        zeile(T("Strom (pauschal)", "Electricity (flat rate)"), chf(strom)) +
        (aufschlag > 0 ? zeile(T("Servicegebühr Kautionsreduktion", "Service fee deposit reduction"), "+ " + chf(aufschlag)) : "") +
        summeZeile(T("Total pro Monat", "Total per month"), chf(totalMonat))
      ) +
      ((kautionBetrag > 0 || moeblierung > 0) ? zwischentitel(T("Einmalig", "One-off")) + tabelle(
        (kautionBetrag > 0 ? zeile(T("Kaution", "Deposit") + " (" + kautionLabel + ")", chf(kautionBetrag), true) : "") +
        (moeblierung > 0 ? zeile(T("Möblierung", "Furnishing"), chf(moeblierung), kautionBetrag === 0) : "")
      ) : "")
    );
  } else if (b.zimmer_wunsch) {
    konditionen = `<div style="background:#faf8f3;border-left:3px solid #1a1814;padding:14px 18px;margin:0 0 22px;font-size:13.5px;">${T("Wunsch-Zimmer", "Requested room")}: <strong>${esc(b.zimmer_wunsch)}</strong></div>`;
  }

  const inhalt = `<p style="font-size:14.5px;margin:0 0 14px;">Hi ${esc(b.vorname)},</p>
<p style="font-size:14px;margin:0 0 18px;">${T("vielen Dank für deine Bewerbung bei D&amp;T Homes. Wir haben deine Unterlagen erhalten und melden uns innerhalb von <strong>48 Stunden</strong> mit einer Rückmeldung.", "thank you for your application at D&amp;T Homes. We have received your details and will get back to you within <strong>48 hours</strong>.")}</p>
${konditionen}`;

  return huelle(inhalt, T("Bewerbung erhalten", "Application received"), logoSrc, en);
}

serve(async (req) => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, content-type" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!RESEND_API_KEY) return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY" }), { status: 500 });
    const payload = await req.json();
    if (payload.type !== "INSERT") return new Response(JSON.stringify({ skipped: "not INSERT" }), { status: 200 });
    // Sicherheit: Der Aufruf kommt vom DB-Trigger ohne Login. Darum werden NICHT die
    // mitgeschickten Daten verwendet, sondern die Bewerbung frisch aus der Datenbank
    // geladen (nur echte, gerade eben eingegangene Bewerbungen). So kann niemand ueber
    // diese Funktion Mails an beliebige Adressen verschicken.
    const recId = payload?.record?.id;
    if (!recId || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return new Response(JSON.stringify({ skipped: "no id" }), { status: 200 });
    const sbCheck = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: b } = await sbCheck.from("applicants").select("*").eq("id", String(recId)).maybeSingle();
    if (!b) return new Response(JSON.stringify({ skipped: "not found" }), { status: 200 });
    const alterMin = (Date.now() - Date.parse(b.created_at || "")) / 60000;
    if (!(alterMin >= -1 && alterMin <= 10)) return new Response(JSON.stringify({ skipped: "not fresh" }), { status: 200 });
    // Leads von wgzimmer.ch haben sich noch nicht beworben: keine Bestaetigung senden
    if (b.quelle === "wgzimmer") return new Response(JSON.stringify({ skipped: "wgzimmer lead" }), { status: 200 });
    if (!b.email || !b.vorname) return new Response(JSON.stringify({ skipped: "missing fields" }), { status: 200 });

    let roomDetails: any = null;
    let aptDetails: any = null;
    if (b.zimmer_wunsch) {
      try {
        const supabase = sbCheck;
        const { data: room } = await supabase.from("rooms").select("*").eq("id", b.zimmer_wunsch).maybeSingle();
        if (room) {
          roomDetails = { miete: room.miete, qm: room.qm, balkon: room.balkon };
          const aptId = room.apt_id || room.aptId;
          if (aptId) {
            const { data: apt } = await supabase.from("apartments").select("*").eq("id", aptId).maybeSingle();
            if (apt) aptDetails = { adresse: apt.adresse, plz: apt.plz, ort: apt.ort, zimmer: apt.zimmer, vermietungsart: apt.vermietungsart, flaeche: apt.flaeche, strom_pro_person: apt.strom_pro_person, mietende: apt.mietende };
          }
        }
      } catch (e) { console.warn("Could not fetch room/apt details:", e); }
    }

    const logoB64 = await ladeLogo();
    const logoSrc = logoB64 ? "cid:dt-logo" : LOGO_URL;
    const istEn = b.sprache === "en";

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [b.email],
        reply_to: REPLY_TO,
        subject: istEn ? "Application received at D&T Homes" : "Bewerbung erhalten bei D&T Homes",
        html: buildEmailHtml(b, roomDetails, aptDetails, logoSrc),
        attachments: logoAnhang(logoB64),
      }),
    });
    const resendData = await resendResp.json();
    if (!resendResp.ok) { console.error("Resend error:", resendData); return new Response(JSON.stringify({ error: resendData }), { status: 500 }); }
    return new Response(JSON.stringify({ success: true, id: resendData.id }), { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
