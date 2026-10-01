import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const FROM_EMAIL = "D&T Homes <noreply@dthomes.ch>";
const REPLY_TO = "info@dthomes.ch";
const BCC = "daan.theijse@dthomes.ch";
const LOGO_URL = "https://mieter.dthomes.ch/dt-logo.png";
const WA_DISPLAY = "+41 76 688 70 91";
const WA_DIGITS = "41766887091";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function j(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } }); }
function chf(n: number) { return "CHF " + (Math.round((+n || 0) * 100) / 100).toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function esc(s: string) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

async function ladeLogo(): Promise<string | null> {
  try { const r = await fetch(LOGO_URL); if (!r.ok) return null; const b = new Uint8Array(await r.arrayBuffer()); let bin = ""; const CH = 0x8000; for (let i = 0; i < b.length; i += CH) bin += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + CH)) as unknown as number[]); return btoa(bin); } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!RESEND_API_KEY) return j({ error: "Missing RESEND_API_KEY" }, 500);
    const { tenant_id, betrag, abzuege } = await req.json();
    if (!tenant_id) return j({ error: "tenant_id erforderlich" }, 400);
    const sb = createClient(SUPABASE_URL!, SERVICE_KEY!);
    const { data: t } = await sb.from("tenants").select("vorname, nachname, email").eq("id", tenant_id).single();
    if (!t || !t.email) return j({ error: "Mieter oder Email nicht gefunden" }, 404);

    const base = +betrag || 0;
    const items = Array.isArray(abzuege) ? abzuege.filter((a: any) => a && (+a.betrag || 0) > 0) : [];
    const summe = items.reduce((s: number, a: any) => s + (+a.betrag || 0), 0);
    const rueck = Math.max(0, base - summe);

    const b64 = await ladeLogo(); const logoSrc = b64 ? "cid:dt-logo" : LOGO_URL;
    const zeilen = items.map((a: any) => `<tr><td style="padding:6px 0;color:#4a4439;border-top:1px solid #f0eadd;">${esc(a.grund || "Abzug")}</td><td style="padding:6px 0;text-align:right;border-top:1px solid #f0eadd;">- ${chf(+a.betrag)}</td></tr>`).join("");
    const tabelle = `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0 20px;font-size:13.5px;color:#1a1814;border-collapse:collapse;">
<tr><td style="padding:6px 0;color:#4a4439;">Kaution</td><td style="padding:6px 0;text-align:right;">${chf(base)}</td></tr>
${zeilen || ''}
<tr><td style="padding:9px 0 0;font-weight:600;border-top:2px solid #1a1814;">Rückzahlung</td><td style="padding:9px 0 0;text-align:right;font-weight:600;border-top:2px solid #1a1814;">${chf(rueck)}</td></tr>
</table>`;

    const inhalt = `<p style="font-size:14.5px;margin:0 0 14px;">Hallo ${esc(t.vorname || "")},</p>
<p style="font-size:14px;margin:0 0 6px;">vielen Dank für deine Zeit bei uns. Hier die Abrechnung deiner Kaution:</p>
${tabelle}
${summe > 0 ? `<p style="font-size:14px;margin:0 0 18px;">Nach Abzug der oben aufgeführten Positionen erhältst du <strong>${chf(rueck)}</strong> zurück. Die Rückzahlung erfolgt über Evorest.</p>` : `<p style="font-size:14px;margin:0 0 18px;">Es gibt keine Abzüge. Du erhältst die volle Kaution von <strong>${chf(rueck)}</strong> zurück. Die Rückzahlung erfolgt über Evorest.</p>`}
<p style="font-size:14px;margin:0 0 18px;">Falls du Fragen zur Abrechnung hast, melde dich gerne.</p>`;

    const wa = `https://wa.me/${WA_DIGITS}`;
    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f7f3eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1814;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:30px 24px;">
<div style="text-align:center;margin-bottom:24px;"><img src="${logoSrc}" alt="D&amp;T Homes" width="100" style="display:inline-block;width:100px;height:auto;"/></div>
<div style="background:#fff;border:1px solid #e1d8c5;border-radius:14px;padding:30px 28px;">
<div style="font-size:10px;color:#8a8174;letter-spacing:.25em;text-transform:uppercase;margin-bottom:12px;">Kautionsabrechnung</div>
${inhalt}
<p style="font-size:12px;color:#6e6a62;margin:24px 0 0;padding-top:18px;border-top:1px solid #f0eadd;">Bei Fragen: <a href="mailto:info@dthomes.ch" style="color:#5a5448;">info@dthomes.ch</a> oder per WhatsApp <a href="${wa}" style="color:#5a5448;">${WA_DISPLAY}</a>.</p>
</div>
<div style="text-align:center;margin-top:22px;font-size:11.5px;color:#8a8174;">D&amp;T Partners GmbH &middot; dthomes.ch</div>
</div></body></html>`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: [t.email], bcc: [BCC], reply_to: REPLY_TO, subject: "Kautionsabrechnung", html, attachments: b64 ? [{ filename: "logo.png", content: b64, content_type: "image/png", content_id: "dt-logo", disposition: "inline" }] : [] }),
    });
    const rd = await resp.json();
    if (!resp.ok) return j({ error: rd }, 500);

    await sb.from("tenants").update({ kaution_abrechnung: { betrag: base, abzuege: items, rueckzahlung: rueck, gesendet_am: new Date().toISOString() } }).eq("id", tenant_id);
    return j({ success: true, sent_to: t.email, rueckzahlung: rueck });
  } catch (e) { return j({ error: String((e as Error).message || e) }, 500); }
});
