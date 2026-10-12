import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { istAdminOderServer, verweigert } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Einheitlich mit allen uebrigen D&T-Mails
const FROM_EMAIL = "D&T Homes <noreply@dthomes.ch>";
const REPLY_TO = "info@dthomes.ch";
const BCC = "daan.theijse@dthomes.ch";
const LOGO_URL = "https://mieter.dthomes.ch/dt-logo.png";
const WA_DIGITS = "41766887091";
const WA_DISPLAY = "+41 76 688 70 91";

const MONATE = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

function chf(n: unknown) {
  if (n === null || n === undefined || n === "") return "-";
  const num = Number(n);
  if (isNaN(num)) return "-";
  const r = Math.round(num * 100) / 100;
  const s = Number.isInteger(r)
    ? r.toLocaleString("de-CH") + ".-"
    : r.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return "CHF\u00a0" + s.replace(/\u2019/g, "'");
}

type Posten = { jahr: number; monat: number; betrag: number; rest: boolean; label?: string };
const r2 = (n: number) => Math.round(n * 100) / 100;

// Offenen Betrag nach Monaten aufschluesseln.
// Ein Fehlbetrag wird als "uebertrag" in den Folgemonat geschoben. Zahlungen decken immer zuerst den aeltesten Betrag.
const gebuehrVon = (v: any) => (v && v.mahnung_2_sent_at && v.status !== "erlassen") ? (v.mahnung_fee != null && v.mahnung_fee !== "" ? Number(v.mahnung_fee) : 30) : 0;
function aufschluesseln(p: any, alle: any[]): Posten[] {
  const key = (j: number, m: number) => j * 12 + (m - 1);
  const byKey = new Map<number, any>(); alle.forEach((x) => byKey.set(key(x.jahr, x.monat), x));
  const posten: Posten[] = [];
  const besucht = new Set<number>([key(p.jahr, p.monat)]);
  posten.unshift({ jahr: p.jahr, monat: p.monat, betrag: Number(p.betrag_soll || 0), rest: false });
  let carried = Number(p.uebertrag || 0);
  if (carried < 0) { posten.push({ jahr: p.jahr, monat: p.monat, betrag: carried, rest: false, label: "guthaben" }); carried = 0; }
  let k = key(p.jahr, p.monat) - 1; let guard = 0;
  while (carried > 0.009 && guard++ < 24) {
    const v = byKey.get(k);
    if (!v) { posten.unshift({ jahr: 0, monat: 0, betrag: r2(carried), rest: true, label: "frueher" }); carried = 0; break; }
    besucht.add(k);
    const vs = Number(v.betrag_soll || 0) + gebuehrVon(v);
    const eigen = Math.min(vs, carried);
    if (eigen > 0) posten.unshift({ jahr: v.jahr, monat: v.monat, betrag: r2(eigen), rest: eigen < vs - 0.009 });
    carried = r2(carried - eigen);
    k--;
  }
  // Bereits bezahlter Teil des aktuellen Monats deckt zuerst die aeltesten Posten
  let ist = Number(p.betrag_ist || 0);
  for (const x of posten) {
    if (ist <= 0 || x.betrag <= 0) continue;
    const abzug = Math.min(x.betrag, ist); x.betrag = r2(x.betrag - abzug); ist = r2(ist - abzug);
    if (abzug > 0) x.rest = true;
  }
  // Weitere offene Monate, die nicht uebertragen wurden
  const andere: Posten[] = [];
  for (const v of alle) {
    const kv = key(v.jahr, v.monat);
    if (besucht.has(kv) || kv > key(p.jahr, p.monat) || v.status === "bezahlt") continue;
    const off = r2(Number(v.betrag_soll || 0) + Number(v.uebertrag || 0) + gebuehrVon(v) - Number(v.betrag_ist || 0));
    if (off > 0.009) andere.push({ jahr: v.jahr, monat: v.monat, betrag: off, rest: Number(v.betrag_ist || 0) > 0 });
  }
  return [...andere, ...posten].filter((x) => Math.abs(x.betrag) > 0.009).sort((a, b) => key(a.jahr, a.monat) - key(b.jahr, b.monat));
}

// Gemeinsames Grundgeruest aller D&T-Mails
// Logo beim Versand laden und eingebettet anhaengen.
// Eingebettet wird es auch dann angezeigt, wenn das Programm externe Bilder blockiert.
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

const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function huelle(inhalt: string, eyebrow: string | undefined, logoSrc: string, en = false) {
  const wa = `https://wa.me/${WA_DIGITS}`;
  return `<!DOCTYPE html><html lang="${en ? "en" : "de"}"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f7f3eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1814;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:30px 24px;">
<div style="text-align:center;margin-bottom:24px;"><img src="${logoSrc}" alt="D&amp;T Homes" width="100" style="display:inline-block;width:100px;height:auto;"/></div>
<div style="background:#fff;border:1px solid #e1d8c5;border-radius:14px;padding:30px 28px;">
${eyebrow ? `<div style="font-size:10px;color:#8a8174;letter-spacing:.25em;text-transform:uppercase;margin-bottom:12px;">${eyebrow}</div>` : ""}
${inhalt}
<p style="font-size:12px;color:#6e6a62;margin:24px 0 0;padding-top:18px;border-top:1px solid #f0eadd;">${en ? "Questions?" : "Bei Fragen:"} <a href="mailto:info@dthomes.ch" style="color:#5a5448;">info@dthomes.ch</a> ${en ? "or via WhatsApp" : "oder per WhatsApp"} <a href="${wa}" style="color:#5a5448;">${WA_DISPLAY}</a>.</p>
</div>
<div style="text-align:center;margin-top:22px;font-size:11.5px;color:#8a8174;">D&amp;T Partners GmbH &middot; dthomes.ch</div>
</div></body></html>`;
}

function buildEmailHtml(opts: any, logoSrc: string) {
  const { stufe, vorname, monatLabel, betragSoll, mahnungFee, totalOffen, frist, mahnung1Datum, en, posten } = opts;
  const T = (de: string, e: string) => (en ? e : de);
  const eyebrow = stufe === 1 ? T("Zahlungserinnerung", "Payment reminder") : T("Zweite Mahnung", "Second reminder");
  const M = en ? MONTHS_EN : MONATE;
  const postenLabel = (x: Posten) => x.label === "frueher" ? T("Übertrag aus früheren Monaten", "Carried over from earlier months")
    : x.label === "guthaben" ? T("Guthaben aus Vormonat", "Credit from previous month")
    : `${T("Miete", "Rent")} ${M[x.monat - 1]} ${x.jahr}${x.rest ? ` <span style="color:#8a8174;font-size:12px;">(${T("Restbetrag", "remaining")})</span>` : ""}`;
  const td = (txt: string, rechts = false, extra = "") => `<td${rechts ? ' width="38%"' : ' width="62%"'} style="${rechts ? "width:38%;text-align:right;white-space:nowrap;" : "width:62%;color:#4a4439;"}padding:7px ${rechts ? "0" : "8px 7px 0"};vertical-align:top;${extra}">${txt}</td>`;
  const zeilen = (posten as Posten[]).map((x, i) => `<tr>${td(postenLabel(x), false, i ? "border-top:1px solid #efe7d6;" : "")}${td(x.betrag < 0 ? "− " + chf(-x.betrag) : chf(x.betrag), true, i ? "border-top:1px solid #efe7d6;" : "")}</tr>`).join("");
  const sumLine = (label: string, wert: string) => `<tr><td width="62%" style="width:62%;padding:10px 8px 2px 0;font-weight:600;border-top:2px solid #1a1814;">${label}</td><td width="38%" style="width:38%;padding:10px 0 2px;text-align:right;font-weight:600;white-space:nowrap;border-top:2px solid #1a1814;">${wert}</td></tr>`;
  const feeLine = stufe === 2 ? `<tr>${td(T("Mahngebühr", "Reminder fee"), false, "border-top:1px solid #efe7d6;")}${td("+ " + chf(mahnungFee), true, "border-top:1px solid #efe7d6;")}</tr>` : "";
  const tabelle = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 22px;"><tr><td bgcolor="#faf8f3" style="background:#faf8f3;border-left:3px solid #1a1814;padding:14px 18px;">
<div style="font-size:10px;color:#8a8174;letter-spacing:.22em;text-transform:uppercase;margin-bottom:6px;">${T("Offene Beträge", "Outstanding amounts")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;font-size:13.5px;color:#1a1814;border-collapse:collapse;">${zeilen}${feeLine}${sumLine(stufe === 2 ? T("Total fällig", "Total due") : T("Total offen", "Total outstanding"), chf(totalOffen))}</table>
</td></tr></table>`;
  const mehrere = (posten as Posten[]).length > 1;

  const inhalt1 = `<p style="font-size:14.5px;margin:0 0 14px;">Hi ${vorname},</p>
<p style="font-size:14px;margin:0 0 18px;">${mehrere
  ? T(`uns ist aufgefallen, dass bei deiner Miete noch insgesamt <strong>${chf(betragSoll)}</strong> offen sind, verteilt auf mehrere Monate (<strong>${monatLabel}</strong>). Hier die Aufstellung:`, `we noticed that a total of <strong>${chf(betragSoll)}</strong> of your rent is still outstanding, spread over several months (<strong>${monatLabel}</strong>). Here is the breakdown:`)
  : T(`uns ist aufgefallen, dass für deine Miete <strong>${monatLabel}</strong> noch ein offener Betrag von <strong>${chf(betragSoll)}</strong> aussteht. Vermutlich ist es einfach untergegangen.`, `we noticed that an amount of <strong>${chf(betragSoll)}</strong> is still outstanding for your rent for <strong>${monatLabel}</strong>. It has probably just slipped through.`)}</p>
${tabelle}
<div style="background:#fdf7e8;border:1px solid #e8d2a8;border-radius:8px;padding:14px 18px;margin:0 0 22px;font-size:13.5px;color:#8a6a2e;line-height:1.6;">
⏱ ${T(`Bitte überweise den offenen Betrag innert 10 Tagen, spätestens bis zum <strong>${frist}</strong>. Danach müssten wir eine zweite Mahnung mit einer Mahngebühr von ${chf(mahnungFee)} zustellen.`, `Please transfer the outstanding amount within 10 days, by <strong>${frist}</strong> at the latest. Otherwise we would have to send a second reminder with a reminder fee of ${chf(mahnungFee)}.`)}
</div>
<p style="font-size:14px;margin:0 0 18px;">${T("Falls du den Betrag bereits überwiesen hast, betrachte diese Erinnerung als gegenstandslos.", "If you have already paid, please disregard this reminder.")}</p>`;

  const inhalt2 = `<p style="font-size:14.5px;margin:0 0 14px;">Hi ${vorname},</p>
<p style="font-size:14px;margin:0 0 18px;">${mehrere
  ? T(`trotz unserer Erinnerung vom <strong>${mahnung1Datum}</strong> sind bei deiner Miete noch Beträge aus mehreren Monaten offen (<strong>${monatLabel}</strong>). Gemäss Mietvertrag fällt dafür eine Mahngebühr an. Hier die Aufstellung:`, `despite our reminder of <strong>${mahnung1Datum}</strong>, amounts from several months are still outstanding (<strong>${monatLabel}</strong>). According to your agreement, a reminder fee applies. Here is the breakdown:`)
  : T(`trotz unserer Erinnerung vom <strong>${mahnung1Datum}</strong> ist für deine Miete <strong>${monatLabel}</strong> noch ein offener Betrag ausstehend. Gemäss Mietvertrag fällt dafür eine Mahngebühr an.`, `despite our reminder of <strong>${mahnung1Datum}</strong>, an amount is still outstanding for your rent for <strong>${monatLabel}</strong>. According to your agreement, a reminder fee applies.`)}</p>
${tabelle}
<div style="background:#fdebe5;border:1px solid #e0bcb0;border-radius:8px;padding:14px 18px;margin:0 0 22px;font-size:13.5px;color:#9b4a3e;line-height:1.6;">
⚠️ ${T(`Bitte überweise den Gesamtbetrag innert 10 Tagen, spätestens bis zum <strong>${frist}</strong>. Sollte auch danach keine Zahlung eingehen, behalten wir uns weitere rechtliche Schritte vor.`, `Please transfer the total amount within 10 days, by <strong>${frist}</strong> at the latest. If no payment is received after that, we reserve the right to take further legal steps.`)}
</div>`;

  return huelle(stufe === 1 ? inhalt1 : inhalt2, eyebrow, logoSrc, en);
}

serve(async (req) => {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await istAdminOderServer(req))) return verweigert(CORS);
  try {
    if (!RESEND_API_KEY) return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });

    const body = await req.json();
    const { payment_id, stufe, betrag, preview } = body;
    if (!payment_id || ![1, 2].includes(Number(stufe))) {
      return new Response(JSON.stringify({ error: "payment_id und stufe (1 oder 2) erforderlich" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    const stufeNum = Number(stufe);
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { data: payment, error: pErr } = await supabase.from("payments").select("*").eq("id", payment_id).single();
    if (pErr || !payment) return new Response(JSON.stringify({ error: "Payment nicht gefunden: " + (pErr?.message || "") }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
    const _restOffen = (betrag != null && Number(betrag) > 0)
      ? Number(betrag)
      : Math.max(0, (Number(payment.betrag_soll||0) + Number(payment.uebertrag||0)) - Number(payment.betrag_ist||0));
    if (!preview && payment.status === "bezahlt" && _restOffen <= 0.01) return new Response(JSON.stringify({ error: "Diese Zahlung ist bereits vollstaendig bezahlt." }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    if (!preview && stufeNum === 1 && payment.mahnung_1_sent_at) return new Response(JSON.stringify({ error: "1. Mahnung wurde bereits am " + new Date(payment.mahnung_1_sent_at).toLocaleDateString("de-CH") + " gesendet." }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    if (!preview && stufeNum === 2) {
      if (!payment.mahnung_1_sent_at) return new Response(JSON.stringify({ error: "Sende erst die 1. Mahnung bevor du die 2. sendest." }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
      if (payment.mahnung_2_sent_at) return new Response(JSON.stringify({ error: "2. Mahnung wurde bereits am " + new Date(payment.mahnung_2_sent_at).toLocaleDateString("de-CH") + " gesendet." }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const { data: tenant, error: tErr } = await supabase.from("tenants").select("vorname, nachname, email, sprache").eq("id", payment.tenant_id).single();
    if (tErr || !tenant?.email) return new Response(JSON.stringify({ error: "Mieter oder Email nicht gefunden" }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });

    const en = tenant.sprache === "en";
    const { data: allePay } = await supabase.from("payments").select("jahr,monat,betrag_soll,betrag_ist,uebertrag,status,mahnung_2_sent_at,mahnung_fee").eq("tenant_id", payment.tenant_id);
    let posten = aufschluesseln(payment, allePay || []);
    // Nur der noch offene Restbetrag: effektiver Soll (inkl. Uebertrag) minus bereits bezahlt
    const soll = Number(payment.betrag_soll || 0);
    const uebertrag = Number(payment.uebertrag || 0);
    const ist = Number(payment.betrag_ist || 0);
    let betragSoll = Math.max(0, (soll + uebertrag) - ist);
    const summePosten = r2(posten.reduce((a, x) => a + x.betrag, 0));
    if (betrag != null && !isNaN(Number(betrag)) && Number(betrag) > 0 && Math.abs(Number(betrag) - summePosten) > 0.009) {
      // Vom Nutzer angepasster Betrag: dann ohne Aufschluesselung, ein Posten fuer den gemahnten Monat
      posten = [{ jahr: payment.jahr, monat: payment.monat, betrag: r2(Number(betrag)), rest: false }];
    }
    betragSoll = r2(posten.reduce((a, x) => a + x.betrag, 0));
    const M = en ? MONTHS_EN : MONATE;
    const monate = posten.filter((x) => x.jahr > 0 && x.betrag > 0);
    const und = en ? " and " : " und ";
    const monatLabel = monate.length <= 1
      ? `${M[payment.monat - 1]} ${payment.jahr}`
      : (monate.every((x) => x.jahr === monate[0].jahr)
        ? monate.slice(0, -1).map((x) => M[x.monat - 1]).join(", ") + und + `${M[monate[monate.length - 1].monat - 1]} ${monate[0].jahr}`
        : monate.slice(0, -1).map((x) => `${M[x.monat - 1]} ${x.jahr}`).join(", ") + und + `${M[monate[monate.length - 1].monat - 1]} ${monate[monate.length - 1].jahr}`);
    const mahnungFee = Number(payment.mahnung_fee || 30);
    const totalOffen = betragSoll + (stufeNum === 2 ? mahnungFee : 0);

    const fristDate = new Date();
    fristDate.setDate(fristDate.getDate() + 10);
    const frist = en ? fristDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : fristDate.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
    const mahnung1Datum = payment.mahnung_1_sent_at ? (en ? new Date(payment.mahnung_1_sent_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : new Date(payment.mahnung_1_sent_at).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })) : "";

    const logoB64 = await ladeLogo();
    const logoSrc = logoB64 ? "cid:dt-logo" : LOGO_URL;
    const html = buildEmailHtml({ stufe: stufeNum, vorname: tenant.vorname, monatLabel, betragSoll, mahnungFee, totalOffen, frist, mahnung1Datum: mahnung1Datum || (en ? "earlier" : "früher"), en, posten }, preview ? LOGO_URL : logoSrc);
    if (preview) return new Response(JSON.stringify({ posten, total_offen: betragSoll, total: totalOffen, monat: monatLabel, html }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    const subject = stufeNum === 1 ? (en ? `Payment reminder: rent ${monatLabel}` : `Zahlungserinnerung: Miete ${monatLabel}`) : (en ? `Second reminder: rent ${monatLabel}` : `Zweite Mahnung: Miete ${monatLabel}`);

    // Zuerst reservieren (atomar): ein Doppelklick kann so keine zweite Mahnung ausloesen
    const updateField = stufeNum === 1 ? "mahnung_1_sent_at" : "mahnung_2_sent_at";
    const { data: claim, error: uErr } = await supabase.from("payments").update({ [updateField]: new Date().toISOString() }).eq("id", payment_id).is(updateField, null).select("id");
    if (!uErr && (!claim || !claim.length)) return new Response(JSON.stringify({ error: "Diese Mahnung wurde bereits gesendet." }), { status: 409, headers: { ...CORS, "Content-Type": "application/json" } });

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: [tenant.email], bcc: [BCC], reply_to: REPLY_TO, subject, html, attachments: logoAnhang(logoB64) }),
    });
    const resendData = await resendResp.json();
    if (!resendResp.ok) {
      console.error("Resend error:", resendData);
      await supabase.from("payments").update({ [updateField]: null }).eq("id", payment_id);
      return new Response(JSON.stringify({ error: resendData }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    if (uErr) return new Response(JSON.stringify({ error: "Email gesendet aber Status-Update fehlgeschlagen: " + uErr.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });

    return new Response(JSON.stringify({ success: true, sent_to: tenant.email, stufe: stufeNum, monat: monatLabel, total: totalOffen }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
