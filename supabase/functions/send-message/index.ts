// Versendet eine Nachricht aus den ImmoBase-Vorlagen im einheitlichen D&T-Mail-Design.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "D&T Homes <noreply@dthomes.ch>";
const REPLY_TO = "info@dthomes.ch";
const BCC = "daan.theijse@dthomes.ch";
const LOGO_URL = "https://mieter.dthomes.ch/dt-logo.png";
const WA_DIGITS = "41766887091";
const WA_DISPLAY = "+41 76 688 70 91";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function ladeLogo(): Promise<string | null> {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = ""; const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH)) as unknown as number[]);
    return btoa(bin);
  } catch { return null; }
}

const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function textZuHtml(text: string) {
  const blocks = String(text || "").replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  return blocks.map((b) => {
    const inner = esc(b).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#5a5448;word-break:break-all;">$1</a>').replace(/\n/g, "<br>");
    return `<p style="font-size:14px;margin:0 0 14px;">${inner}</p>`;
  }).join("\n");
}

function huelle(inhalt: string, logoSrc: string, en: boolean) {
  const wa = `https://wa.me/${WA_DIGITS}`;
  return `<!DOCTYPE html><html lang="${en ? "en" : "de"}"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f7f3eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1814;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:30px 24px;">
<div style="text-align:center;margin-bottom:24px;"><img src="${logoSrc}" alt="D&amp;T Homes" width="100" style="display:inline-block;width:100px;height:auto;"/></div>
<div style="background:#fff;border:1px solid #e1d8c5;border-radius:14px;padding:30px 28px;">
${inhalt}
<p style="font-size:12px;color:#6e6a62;margin:24px 0 0;padding-top:18px;border-top:1px solid #f0eadd;">${en ? "Questions?" : "Bei Fragen:"} <a href="mailto:info@dthomes.ch" style="color:#5a5448;">info@dthomes.ch</a> ${en ? "or via WhatsApp" : "oder per WhatsApp"} <a href="${wa}" style="color:#5a5448;">${WA_DISPLAY}</a>.</p>
</div>
<div style="text-align:center;margin-top:22px;font-size:11.5px;color:#8a8174;">D&amp;T Partners GmbH &middot; dthomes.ch</div>
</div></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { to, betreff, text, sprache, cc } = await req.json().catch(() => ({}));
    if (!to) return json({ error: "Keine E-Mail-Adresse." }, 400);
    if (!String(text || "").trim()) return json({ error: "Der Text ist leer." }, 400);
    const en = sprache === "en";
    const logoB64 = await ladeLogo();
    const html = huelle(textZuHtml(text), logoB64 ? "cid:dt-logo" : LOGO_URL, en);
    const toList = String(to).split(/[;,]/).map((x) => x.trim()).filter(Boolean);
    const ccList = cc ? String(cc).split(/[;,]/).map((x) => x.trim()).filter(Boolean) : [];
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL, to: toList, ...(ccList.length ? { cc: ccList } : {}), bcc: [BCC], reply_to: REPLY_TO,
        subject: betreff || (en ? "Message from D&T Homes" : "Mitteilung von D&T Homes"), html, text,
        attachments: logoB64 ? [{ filename: "logo.png", content: logoB64, content_type: "image/png", content_id: "dt-logo", disposition: "inline" }] : [],
      }),
    });
    if (!r.ok) return json({ error: "Versand fehlgeschlagen: " + (await r.text()).slice(0, 200) }, 502);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
