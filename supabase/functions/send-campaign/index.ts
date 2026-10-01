import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const FROM_EMAIL = "D&T Homes <noreply@dthomes.ch>";
const REPLY_TO = "info@dthomes.ch";
const BCC = "daan.theijse@dthomes.ch";
const LOGO_URL = "https://mieter.dthomes.ch/dt-logo.png";
const WA_DIGITS = "41766887091";
const WA_DISPLAY = "+41 76 688 70 91";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function j(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } }); }

async function ladeLogo(): Promise<string | null> {
  try {
    const r = await fetch(LOGO_URL); if (!r.ok) return null;
    const b = new Uint8Array(await r.arrayBuffer()); let bin = ""; const CH = 0x8000;
    for (let i = 0; i < b.length; i += CH) bin += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + CH)) as unknown as number[]);
    return btoa(bin);
  } catch { return null; }
}
function logoAnhang(b64: string | null) {
  return b64 ? [{ filename: "logo.png", content: b64, content_type: "image/png", content_id: "dt-logo", disposition: "inline" }] : [];
}
function esc(s: string) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function huelle(vorname: string, text: string, logoSrc: string) {
  const wa = `https://wa.me/${WA_DIGITS}`;
  const body = esc(text).replace(/\n/g, "<br>");
  const anrede = vorname ? `Hallo ${esc(vorname)},` : "Hallo,";
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f7f3eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1814;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:30px 24px;">
<div style="text-align:center;margin-bottom:24px;"><img src="${logoSrc}" alt="D&amp;T Homes" width="100" style="display:inline-block;width:100px;height:auto;"/></div>
<div style="background:#fff;border:1px solid #e1d8c5;border-radius:14px;padding:30px 28px;">
<p style="font-size:14.5px;margin:0 0 14px;">${anrede}</p>
<div style="font-size:14px;margin:0 0 18px;">${body}</div>
<p style="font-size:12px;color:#6e6a62;margin:24px 0 0;padding-top:18px;border-top:1px solid #f0eadd;">Bei Fragen: <a href="mailto:info@dthomes.ch" style="color:#5a5448;">info@dthomes.ch</a> oder per WhatsApp <a href="${wa}" style="color:#5a5448;">${WA_DISPLAY}</a>.</p>
</div>
<div style="text-align:center;margin-top:22px;font-size:11.5px;color:#8a8174;">D&amp;T Partners GmbH &middot; dthomes.ch</div>
</div></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!RESEND_API_KEY) return j({ error: "Missing RESEND_API_KEY" }, 500);
    const { group, subject, text, test_email } = await req.json();
    if (!subject || !text) return j({ error: "Betreff und Text erforderlich" }, 400);

    const sb = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Empfaenger bestimmen
    let recipients: { email: string; vorname: string }[] = [];
    if (test_email) {
      recipients = [{ email: String(test_email), vorname: "" }];
    } else if (group === "mieter") {
      const { data } = await sb.from("tenants").select("vorname,email,status").not("email", "is", null);
      recipients = (data || []).filter((t: any) => (t.status || "aktiv") === "aktiv" && t.email && t.email.includes("@"))
        .map((t: any) => ({ email: t.email.trim(), vorname: (t.vorname || "").trim() }));
    } else if (group === "bewerber") {
      const { data } = await sb.from("applicants").select("vorname,email,status").not("email", "is", null);
      const aktiv = ["Neu", "In Pr\u00fcfung", "Zugeteilt", "Kontaktiert"];
      recipients = (data || []).filter((b: any) => b.email && b.email.includes("@") && (!b.status || aktiv.includes(b.status)))
        .map((b: any) => ({ email: b.email.trim(), vorname: (b.vorname || "").trim() }));
    } else {
      return j({ error: "Unbekannte Empfaengergruppe" }, 400);
    }

    // Duplikate per Email entfernen
    const seen = new Set<string>();
    recipients = recipients.filter(r => { const k = r.email.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    if (recipients.length === 0) return j({ error: "Keine Empfaenger mit g\u00fcltiger Email gefunden", sent: 0 }, 200);

    const logoB64 = await ladeLogo();
    const logoSrc = logoB64 ? "cid:dt-logo" : LOGO_URL;
    const attachments = logoAnhang(logoB64);

    let sent = 0; const failed: string[] = [];
    for (const r of recipients) {
      try {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: FROM_EMAIL, to: [r.email], bcc: [BCC], reply_to: REPLY_TO, subject, html: huelle(r.vorname, text, logoSrc), attachments }),
        });
        if (resp.ok) sent++; else { failed.push(r.email); }
        await new Promise(res => setTimeout(res, 120)); // leichte Drosselung
      } catch { failed.push(r.email); }
    }

    return j({ success: true, total: recipients.length, sent, failed });
  } catch (e) {
    return j({ error: String((e as Error).message || e) }, 500);
  }
});
