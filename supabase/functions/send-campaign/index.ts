import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { istAdminOderServer, verweigert } from "../_shared/auth.ts";
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
function esc(s: string) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

type Design = { eyebrow?: string; button_text?: string; button_url?: string };
// Empfaenger kann einen eigenen Button-Link haben (z.B. persoenlicher Mieterportal-Link)
type Empf = { email: string; vorname: string; button_url?: string };

// Links, Mailadressen und **fett** im bereits escapten Text
function inline(t: string) {
  let x = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  x = x.replace(/((?:https?:\/\/)?(?:[a-z0-9-]+\.)*dthomes\.ch(?:\/[^\s<,;)]*)?|https?:\/\/[^\s<,;)]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,})/gi, (m) => {
    let url = m.replace(/[.!?:]+$/, ""); const rest = m.slice(url.length);
    if (url.includes("@") && !url.startsWith("http")) return `<a href="mailto:${url}" style="color:#1a1814;">${url}</a>${rest}`;
    const href = /^https?:\/\//i.test(url) ? url : "https://" + url;
    return `<a href="${href}" style="color:#1a1814;font-weight:600;">${url.replace(/^https?:\/\//i, "")}</a>${rest}`;
  });
  return x;
}
function schrittListe(items: string[]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:4px 0 18px;">${items.map((it, i) => `<tr><td width="34" style="width:34px;vertical-align:top;padding:5px 0;"><span style="display:inline-block;background:#1a1814;color:#fff;width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;font-size:12px;font-weight:600;">${i + 1}</span></td><td style="vertical-align:top;padding:7px 0 5px;font-size:14px;color:#3a352d;">${inline(it)}</td></tr>`).join("")}</table>`;
}
function punktListe(items: string[]) {
  return `<ul style="font-size:14px;color:#3a352d;margin:0 0 16px;padding-left:20px;">${items.map((it) => `<li style="margin:0 0 5px;">${inline(it)}</li>`).join("")}</ul>`;
}
function infoBox(rows: [string, string][]) {
  const tr = rows.map(([l, v], i) => { const bt = i ? "border-top:1px solid #efe7d6;" : ""; return `<tr><td colspan="2" style="padding:7px 0;${bt}"><div style="color:#8a8174;font-size:11.5px;margin-bottom:2px;">${inline(l)}</div><div style="color:#1a1814;font-size:13.5px;">${inline(v)}</div></td></tr>`; }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:2px 0 20px;"><tr><td bgcolor="#faf8f3" style="background:#faf8f3;border-left:3px solid #1a1814;padding:12px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;border-collapse:collapse;">${tr}</table></td></tr></table>`;
}
const BTN_MARKE = '<p style="font-size:14px;color:#3a352d;margin:0 0 16px;">[button]</p>';
const P = (t: string) => `<p style="font-size:14px;color:#3a352d;margin:0 0 16px;">${t}</p>`;

// Freitext aus dem Admin in gestaltetes HTML umwandeln
function textZuHtml(raw: string) {
  let text = String(raw || "").replace(/\r/g, "").trim();
  // Eigene Anrede im Text entfernen (wird automatisch gesetzt)
  text = text.replace(/^(hallo|hi|hey|hoi|liebe[rs]?|guten tag)\b[^\n]{0,40}\n+/i, "");
  const bloecke = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  let html = "";
  for (const blk of bloecke) {
    const zeilen = blk.split("\n").map((z) => z.trim()).filter(Boolean);
    const kv = zeilen.map((z) => z.match(/^([^:\n]{2,32}):\s+(\S.*)$/));
    if (zeilen.length >= 2 && kv.every((m) => m && !/https?$/i.test(m[1]))) {
      html += infoBox(kv.map((m) => [esc(m![1]), esc(m![2])]));
      continue;
    }
    let absatz: string[] = []; let liste: string[] = []; let art = "";
    const flush = () => {
      if (absatz.length) { html += P(absatz.map((z) => inline(esc(z))).join("<br>")); absatz = []; }
      if (liste.length) { html += art === "n" ? schrittListe(liste.map(esc)) : punktListe(liste.map(esc)); liste = []; }
    };
    for (const z of zeilen) {
      const n = z.match(/^\d+[.)]\s+(.*)$/); const u = z.match(/^[-•*]\s+(.*)$/);
      if (n || u) {
        const neuArt = n ? "n" : "u";
        if (absatz.length) { html += P(absatz.map((x) => inline(esc(x))).join("<br>")); absatz = []; }
        if (liste.length && art !== neuArt) flush();
        art = neuArt; liste.push((n || u)![1]);
      } else { if (liste.length) flush(); absatz.push(z); }
    }
    flush();
  }
  const hatGruss = /(gr[üu](ss|ß)e|gruss|cheers|best regards)/i.test(bloecke.slice(-1)[0] || "");
  return { html, hatGruss };
}

function huelle(vorname: string, text: string, logoSrc: string, d: Design = {}) {
  const wa = `https://wa.me/${WA_DIGITS}`;
  const { html: body, hatGruss } = textZuHtml(text);
  const anrede = vorname ? `Hi ${esc(vorname)},` : "Hi,";
  const eyebrow = (d.eyebrow || "").trim() || "D&T Homes";
  let btnUrl = (d.button_url || "").trim();
  if (btnUrl && !/^(https?:|mailto:)/i.test(btnUrl)) btnUrl = "https://" + btnUrl;
  const button = btnUrl && (d.button_text || "").trim()
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:8px 0 22px;"><tr><td align="center"><a href="${esc(btnUrl)}" style="display:inline-block;background:#1a1814;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:14px;font-weight:500;letter-spacing:.02em;">${esc(d.button_text!.trim())}</a></td></tr></table>`
    : "";
  // Steht im Text eine Zeile [button], kommt der Button an diese Stelle statt ans Ende
  let inhalt = body + button;
  if (button && body.includes(BTN_MARKE)) inhalt = body.replace(BTN_MARKE, button);
  else if (body.includes(BTN_MARKE)) inhalt = body.replace(BTN_MARKE, "");
  const gruss = hatGruss ? "" : `<p style="font-size:14px;color:#3a352d;margin:6px 0 0;">Liebe Grüsse<br><strong style="color:#1a1814;">Daan</strong><br><span style="color:#8a8174;font-size:12.5px;">D&amp;T Homes</span></p>`;
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f7f3eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1814;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:30px 24px;">
<div style="text-align:center;margin-bottom:24px;"><img src="${logoSrc}" alt="D&amp;T Homes" width="100" style="display:inline-block;width:100px;height:auto;"/></div>
<div style="background:#fff;border:1px solid #e1d8c5;border-radius:14px;padding:30px 28px;">
<div style="font-size:10px;color:#8a8174;letter-spacing:.25em;text-transform:uppercase;margin-bottom:12px;">${esc(eyebrow)}</div>
<p style="font-size:15px;font-weight:600;margin:0 0 14px;">${anrede}</p>
${inhalt}${gruss}
<p style="font-size:12px;color:#6e6a62;margin:24px 0 0;padding-top:18px;border-top:1px solid #f0eadd;">Bei Fragen: <a href="mailto:info@dthomes.ch" style="color:#5a5448;">info@dthomes.ch</a> oder per WhatsApp <a href="${wa}" style="color:#5a5448;">${WA_DISPLAY}</a>.</p>
</div>
<div style="text-align:center;margin-top:22px;font-size:11.5px;color:#8a8174;">D&amp;T Partners GmbH &middot; dthomes.ch</div>
</div></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await istAdminOderServer(req))) return verweigert(CORS);
  try {
    if (!RESEND_API_KEY) return j({ error: "Missing RESEND_API_KEY" }, 500);
    const { group, subject, text, test_email, exclude, include_future, recipients: inRecip, attachments: inAtt, design: inDesign, preview } = await req.json();
    if (!subject || !text) return j({ error: "Betreff und Text erforderlich" }, 400);
    const design: Design = inDesign && typeof inDesign === "object" ? inDesign : {};
    if (preview) return j({ html: huelle(String(preview === true ? "Vorname" : preview), text, LOGO_URL, design) });

    const sb = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Empfaenger bestimmen
    let recipients: Empf[] = [];
    if (test_email) {
      recipients = [{ email: String(test_email), vorname: "" }];
    } else if (Array.isArray(inRecip) && inRecip.length) {
      recipients = inRecip.filter((r: any) => r && r.email && String(r.email).includes("@")).map((r: any) => ({ email: String(r.email).trim(), vorname: String(r.vorname || "").trim(), ...(r.button_url ? { button_url: String(r.button_url) } : {}) }));
    } else if (group === "mieter") {
      const { data } = await sb.from("tenants").select("vorname,email,status,einzug").not("email", "is", null);
      const heute = Date.now();
      const pd = (x: string) => { const m = (x || "").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); return m ? new Date(+m[3], +m[2]-1, +m[1]).getTime() : null; };
      recipients = (data || []).filter((t: any) => {
        if ((t.status || "aktiv") !== "aktiv" || !t.email || !t.email.includes("@")) return false;
        if (!include_future) { const ez = pd(t.einzug); if (ez && ez > heute) return false; }
        return true;
      }).map((t: any) => ({ email: t.email.trim(), vorname: (t.vorname || "").trim() }));
    } else if (group === "bewerber") {
      const { data } = await sb.from("applicants").select("vorname,email,status,created_at").not("email", "is", null);
      const aktiv = ["Neu", "In Pr\u00fcfung", "Zugeteilt", "Kontaktiert"];
      const cutoff = Date.now() - 31 * 86400000; // nur Bewerbungen der letzten ~31 Tage
      const { data: ten } = await sb.from("tenants").select("email"); // schon Mieter ausschliessen
      const tenantMails = new Set((ten || []).filter((t: any) => t.email).map((t: any) => t.email.trim().toLowerCase()));
      recipients = (data || []).filter((b: any) => b.email && b.email.includes("@")
        && (!b.status || aktiv.includes(b.status))
        && b.created_at && new Date(b.created_at).getTime() >= cutoff
        && !tenantMails.has(b.email.trim().toLowerCase()))
        .map((b: any) => ({ email: b.email.trim(), vorname: (b.vorname || "").trim() }));
    } else {
      return j({ error: "Unbekannte Empfaengergruppe" }, 400);
    }

    // Duplikate per Email entfernen
    const seen = new Set<string>();
    recipients = recipients.filter(r => { const k = r.email.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    const excl = new Set((Array.isArray(exclude) ? exclude : []).map((e: string) => String(e).trim().toLowerCase()));
    if (excl.size) recipients = recipients.filter(r => !excl.has(r.email.toLowerCase()));
    if (recipients.length === 0) return j({ error: "Keine Empfaenger mit g\u00fcltiger Email gefunden", sent: 0 }, 200);

    const logoB64 = await ladeLogo();
    const logoSrc = logoB64 ? "cid:dt-logo" : LOGO_URL;
    let attachments = logoAnhang(logoB64);
    if (Array.isArray(inAtt)) attachments = attachments.concat(inAtt.filter((a: any) => a && a.filename && a.content).map((a: any) => ({ filename: String(a.filename), content: String(a.content) })));

    let sent = 0; const failed: string[] = [];
    for (const r of recipients) {
      try {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: FROM_EMAIL, to: [r.email], bcc: [BCC], reply_to: REPLY_TO, subject, html: huelle(r.vorname, text, logoSrc, r.button_url ? { ...design, button_url: r.button_url } : design), attachments }),
        });
        if (resp.ok) sent++; else { failed.push(r.email); }
        await new Promise(res => setTimeout(res, 120)); // leichte Drosselung
      } catch { failed.push(r.email); }
    }

    if (!test_email) { try { await sb.from("kampagnen").insert({ gruppe: group, betreff: subject, text, empfaenger_anzahl: recipients.length, gesendet: sent, fehlgeschlagen: failed.length, design }); } catch (_e) { /* Log best-effort */ } }
    return j({ success: true, total: recipients.length, sent, failed });
  } catch (e) {
    return j({ error: String((e as Error).message || e) }, 500);
  }
});
