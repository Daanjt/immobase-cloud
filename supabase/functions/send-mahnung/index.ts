import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
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
  return "CHF " + num.toLocaleString("de-CH") + ".-";
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

function huelle(inhalt: string, eyebrow: string | undefined, logoSrc: string) {
  const wa = `https://wa.me/${WA_DIGITS}`;
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f7f3eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1814;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:30px 24px;">
<div style="text-align:center;margin-bottom:24px;"><img src="${logoSrc}" alt="D&amp;T Homes" width="100" style="display:inline-block;width:100px;height:auto;"/></div>
<div style="background:#fff;border:1px solid #e1d8c5;border-radius:14px;padding:30px 28px;">
${eyebrow ? `<div style="font-size:10px;color:#8a8174;letter-spacing:.25em;text-transform:uppercase;margin-bottom:12px;">${eyebrow}</div>` : ""}
${inhalt}
<p style="font-size:12px;color:#6e6a62;margin:24px 0 0;padding-top:18px;border-top:1px solid #f0eadd;">Bei Fragen: <a href="mailto:info@dthomes.ch" style="color:#5a5448;">info@dthomes.ch</a> oder per WhatsApp <a href="${wa}" style="color:#5a5448;">${WA_DISPLAY}</a>.</p>
</div>
<div style="text-align:center;margin-top:22px;font-size:11.5px;color:#8a8174;">D&amp;T Partners GmbH &middot; dthomes.ch</div>
</div></body></html>`;
}

function buildEmailHtml(opts: any, logoSrc: string) {
  const { stufe, vorname, monatLabel, betragSoll, mahnungFee, totalOffen, frist, mahnung1Datum } = opts;
  const eyebrow = stufe === 1 ? "Zahlungserinnerung" : "Zweite Mahnung";

  const tabelle = `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:18px 0 22px;font-size:13.5px;color:#1a1814;border-collapse:collapse;">
<tr><td style="padding:6px 0;color:#4a4439;">Ausstehende Miete</td><td style="padding:6px 0;text-align:right;">${chf(betragSoll)}</td></tr>
<tr><td style="padding:6px 0;color:#4a4439;border-top:1px solid #f0eadd;">Mahnungsgebühr</td><td style="padding:6px 0;text-align:right;border-top:1px solid #f0eadd;">+ ${chf(mahnungFee)}</td></tr>
<tr><td style="padding:9px 0 0;color:#1a1814;font-weight:600;border-top:2px solid #1a1814;">Total fällig</td><td style="padding:9px 0 0;text-align:right;font-weight:600;border-top:2px solid #1a1814;">${chf(totalOffen)}</td></tr>
</table>`;

  const inhalt1 = `<p style="font-size:14.5px;margin:0 0 14px;">Hi ${vorname},</p>
<p style="font-size:14px;margin:0 0 18px;">uns ist aufgefallen, dass für deine Miete <strong>${monatLabel}</strong> noch ein offener Betrag von <strong>${chf(betragSoll)}</strong> aussteht. Vermutlich ist es einfach untergegangen.</p>
<div style="background:#fdf7e8;border:1px solid #e8d2a8;border-radius:8px;padding:14px 18px;margin:0 0 22px;font-size:13.5px;color:#8a6a2e;line-height:1.6;">
⏱ Bitte überweise den offenen Betrag innert 10 Tagen, spätestens bis zum <strong>${frist}</strong>. Danach müssten wir eine zweite Mahnung mit einer Bearbeitungsgebühr von ${chf(mahnungFee)} zustellen.
</div>
<p style="font-size:14px;margin:0 0 18px;">Falls du den Betrag bereits überwiesen hast, betrachte diese Erinnerung als gegenstandslos.</p>`;

  const inhalt2 = `<p style="font-size:14.5px;margin:0 0 14px;">Hi ${vorname},</p>
<p style="font-size:14px;margin:0 0 18px;">trotz unserer Erinnerung vom <strong>${mahnung1Datum}</strong> ist für deine Miete <strong>${monatLabel}</strong> noch ein offener Betrag ausstehend. Gemäss Mietvertrag fällt dafür eine Bearbeitungsgebühr an.</p>
${tabelle}
<div style="background:#fdebe5;border:1px solid #e0bcb0;border-radius:8px;padding:14px 18px;margin:0 0 22px;font-size:13.5px;color:#9b4a3e;line-height:1.6;">
⚠️ Bitte überweise den Gesamtbetrag innert 10 Tagen, spätestens bis zum <strong>${frist}</strong>. Sollte auch danach keine Zahlung eingehen, behalten wir uns weitere rechtliche Schritte vor.
</div>`;

  return huelle(stufe === 1 ? inhalt1 : inhalt2, eyebrow, logoSrc);
}

serve(async (req) => {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!RESEND_API_KEY) return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });

    const body = await req.json();
    const { payment_id, stufe, betrag } = body;
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
    if (payment.status === "bezahlt" && _restOffen <= 0.01) return new Response(JSON.stringify({ error: "Diese Zahlung ist bereits vollstaendig bezahlt." }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    if (stufeNum === 1 && payment.mahnung_1_sent_at) return new Response(JSON.stringify({ error: "1. Mahnung wurde bereits am " + new Date(payment.mahnung_1_sent_at).toLocaleDateString("de-CH") + " gesendet." }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    if (stufeNum === 2) {
      if (!payment.mahnung_1_sent_at) return new Response(JSON.stringify({ error: "Sende erst die 1. Mahnung bevor du die 2. sendest." }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
      if (payment.mahnung_2_sent_at) return new Response(JSON.stringify({ error: "2. Mahnung wurde bereits am " + new Date(payment.mahnung_2_sent_at).toLocaleDateString("de-CH") + " gesendet." }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const { data: tenant, error: tErr } = await supabase.from("tenants").select("vorname, nachname, email").eq("id", payment.tenant_id).single();
    if (tErr || !tenant?.email) return new Response(JSON.stringify({ error: "Mieter oder Email nicht gefunden" }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });

    const monatLabel = `${MONATE[payment.monat - 1]} ${payment.jahr}`;
    // Nur der noch offene Restbetrag: effektiver Soll (inkl. Uebertrag) minus bereits bezahlt
    const soll = Number(payment.betrag_soll || 0);
    const uebertrag = Number(payment.uebertrag || 0);
    const ist = Number(payment.betrag_ist || 0);
    let betragSoll = Math.max(0, (soll + uebertrag) - ist);
    if (betrag != null && !isNaN(Number(betrag)) && Number(betrag) > 0) betragSoll = Number(betrag); // vom Nutzer angepasster Betrag
    const mahnungFee = Number(payment.mahnung_fee || 30);
    const totalOffen = betragSoll + (stufeNum === 2 ? mahnungFee : 0);

    const fristDate = new Date();
    fristDate.setDate(fristDate.getDate() + 10);
    const frist = fristDate.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
    const mahnung1Datum = payment.mahnung_1_sent_at ? new Date(payment.mahnung_1_sent_at).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";

    const logoB64 = await ladeLogo();
    const logoSrc = logoB64 ? "cid:dt-logo" : LOGO_URL;
    const html = buildEmailHtml({ stufe: stufeNum, vorname: tenant.vorname, monatLabel, betragSoll, mahnungFee, totalOffen, frist, mahnung1Datum }, logoSrc);
    const subject = stufeNum === 1 ? `Zahlungserinnerung: Miete ${monatLabel}` : `Zweite Mahnung: Miete ${monatLabel}`;

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: [tenant.email], bcc: [BCC], reply_to: REPLY_TO, subject, html, attachments: logoAnhang(logoB64) }),
    });
    const resendData = await resendResp.json();
    if (!resendResp.ok) {
      console.error("Resend error:", resendData);
      return new Response(JSON.stringify({ error: resendData }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const updateField = stufeNum === 1 ? "mahnung_1_sent_at" : "mahnung_2_sent_at";
    const { error: uErr } = await supabase.from("payments").update({ [updateField]: new Date().toISOString() }).eq("id", payment_id);
    if (uErr) return new Response(JSON.stringify({ error: "Email gesendet aber Status-Update fehlgeschlagen: " + uErr.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });

    return new Response(JSON.stringify({ success: true, sent_to: tenant.email, stufe: stufeNum, monat: monatLabel, total: totalOffen }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
