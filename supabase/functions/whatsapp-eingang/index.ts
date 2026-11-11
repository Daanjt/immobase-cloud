// whatsapp-eingang - Webhook von YCloud fuer eingehende WhatsApp-Nachrichten.
// Speichert jede Nachricht in wa_nachrichten (Medien im Bucket "whatsapp"). Live (app_config.whatsapp_ki_live)
// antwortet die KI allen, sonst nur den Testnummern. Braucht eine Nachricht euch, geht eine Mail raus.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normTelefon, waKey, WA_ABSENDER } from "../_shared/whatsapp.ts";
import { MEDIEN, LABEL, medienSpeichern } from "../_shared/wa-medien.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ok = (b: unknown = { ok: true }) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });

async function hmacHex(secret: string, data: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const esc = (x: string) => String(x || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Mail an das Team, wenn eine WhatsApp-Nachricht eine Antwort von euch braucht. Hoechstens 1 Mail pro Chat in 30 Minuten.
async function benachrichtigen(sb: any, c: Record<string, string>, tel: string, name: string | null, text: string, grund: string, ki?: string) {
  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const an = String(c.whatsapp_benachrichtigung_email || "daan.theijse@dthomes.ch").split(/[,;\s]+/).filter(Boolean);
    if (!apiKey || !an.length) return;
    const { data: ch } = await sb.from("wa_chats").select("benachrichtigt_at").eq("telefon", tel).maybeSingle();
    if (ch?.benachrichtigt_at && Date.now() - new Date(ch.benachrichtigt_at).getTime() < 30 * 60000) return;
    await sb.from("wa_chats").upsert({ telefon: tel, benachrichtigt_at: new Date().toISOString() }, { onConflict: "telefon" });
    const wer = name ? `${name} (${tel})` : tel;
    const link = `https://admin.dthomes.ch/?seite=whatsapp&chat=${tel.replace("+", "")}`;
    const zeilen = [
      `<div><b>${esc(wer)}</b> hat auf WhatsApp geschrieben:</div>`, `<div><br></div>`,
      `<div style="padding:8px 12px;background:#f4f1ea;border-radius:6px;white-space:pre-wrap">${esc(text).slice(0, 1500)}</div>`, `<div><br></div>`,
      `<div>${esc(grund)}</div>`,
      ...(ki ? [`<div><br></div>`, `<div>Antwort der KI:</div>`, `<div style="padding:8px 12px;background:#e8f6e4;border-radius:6px;white-space:pre-wrap">${esc(ki).slice(0, 1500)}</div>`] : []),
      `<div><br></div>`, `<div><a href="${link}">Im WhatsApp-Posteingang öffnen</a></div>`,
    ];
    await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "D&T Homes <noreply@dthomes.ch>", to: an, subject: `WhatsApp: ${name || tel} braucht eine Antwort`,
        html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Aptos,'Segoe UI',Calibri,Arial,sans-serif;font-size:11pt;color:#000">${zeilen.join("")}</body></html>` }),
    });
  } catch (e) { console.error("benachrichtigen", e); }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok();
  const roh = await req.text();
  const sb = createClient(URL_, KEY);
  const { data: cfg } = await sb.from("app_config").select("key,value").in("key", ["ycloud_webhook_secret", "whatsapp_testnummern", "whatsapp_ki_live", "whatsapp_benachrichtigung_email"]);
  const c: Record<string, string> = Object.fromEntries((cfg || []).map((r: any) => [r.key, r.value]));
  // Signatur pruefen: YCloud-Signature: t=TIMESTAMP,s=HEX(HMAC_SHA256(secret, t + "." + body))
  if (c.ycloud_webhook_secret) {
    const h = req.headers.get("YCloud-Signature") || "";
    const t = (h.match(/t=(\d+)/) || [])[1] || "";
    const s = (h.match(/s=([0-9a-f]+)/i) || [])[1] || "";
    const soll = t ? await hmacHex(c.ycloud_webhook_secret, `${t}.${roh}`) : "";
    if (!t || !s || soll.toLowerCase() !== s.toLowerCase()) {
      console.error("whatsapp-eingang: Signatur ungueltig");
      return new Response("invalid signature", { status: 401 });
    }
  }
  let ev: any = {}; try { ev = JSON.parse(roh); } catch { return ok(); }
  const m = ev.whatsappInboundMessage;
  if (ev.type !== "whatsapp.inbound_message.received" || !m) {
    // andere Ereignisse (Echos, Status) nur protokollieren
    if (ev.type && String(ev.type).includes("echo")) {
      const e = ev.whatsappMessage || ev.whatsappEchoMessage || ev.echoMessage || {};
      const tel = normTelefon(e.to);
      if (tel) await sb.from("wa_nachrichten").insert({ richtung: "aus", telefon: tel, text: e?.text?.body || null, typ: e.type || null, wamid: e.wamid || e.id || null, quelle: "handy", roh: ev }).then(() => {}, () => {});
    }
    return ok();
  }
  const tel = normTelefon(m.from);
  if (!tel) return ok();
  // Text bzw. Bildunterschrift; Medien (Bild, Video, Audio, Dokument, Sticker) werden in Storage gespeichert
  const med = MEDIEN.includes(m.type) ? m[m.type] || {} : null;
  const caption = med ? String(med.caption || "").trim() : "";
  const text = m.type === "text" ? String(m.text?.body || "") : m.type === "button" ? String(m.button?.text || "") : m.type === "interactive" ? String(m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || "") : caption;
  const anzeige = text || (med ? (m.type === "document" && med.filename ? `📄 ${med.filename}` : LABEL[m.type]) : m.type === "location" ? `📍 Standort${m.location?.name ? ": " + m.location.name : ""}` : `[${m.type}]`);
  const { data: neu, error: dup } = await sb.from("wa_nachrichten").insert({ richtung: "ein", telefon: tel, name: m.customerProfile?.name || null, text: anzeige, typ: m.type, wamid: m.wamid || m.id, roh: ev }).select("id").maybeSingle();
  if (dup) return ok({ dup: true }); // schon verarbeitet (YCloud wiederholt Webhooks)
  if (med && med.link && neu) await medienSpeichern(sb, neu.id, tel, m.type, med).catch((e) => console.error("medien", e));

  const name = m.customerProfile?.name || null;
  const melden = (grund: string, ki?: string) => benachrichtigen(sb, c, tel, name, anzeige, grund, ki);

  // Live (app_config.whatsapp_ki_live = "true"): alle bekommen eine KI-Antwort. Sonst nur die Testnummern.
  const live = String(c.whatsapp_ki_live || "").toLowerCase() === "true";
  const test = String(c.whatsapp_testnummern || "").split(/[,;\s]+/).map(normTelefon).filter(Boolean);
  if (!live && !test.includes(tel)) return ok({ gespeichert: true });
  if (!text || !waKey()) {
    await melden(m.type === "unsupported" ? "WhatsApp hat den Inhalt nicht übermittelt" : med ? "Medium ohne Text, die KI antwortet nicht" : "Nachricht ohne Text, die KI antwortet nicht");
    return ok({ gespeichert: true });
  }
  // KI pausiert: im Posteingang ausgeschaltet oder ein Mensch hat in den letzten 6 Stunden geantwortet
  const { data: chat } = await sb.from("wa_chats").select("ki_aus").eq("telefon", tel).maybeSingle();
  if (chat?.ki_aus) { await melden("KI ist für diesen Chat ausgeschaltet"); return ok({ gespeichert: true, ki: "aus" }); }
  const { data: mensch } = await sb.from("wa_nachrichten").select("id").eq("telefon", tel).eq("richtung", "aus").in("quelle", ["handy", "immobase", "immobase_ki"])
    .gte("created_at", new Date(Date.now() - 6 * 3600000).toISOString()).limit(1);
  if (mensch && mensch.length) { await melden("Ihr habt in den letzten 6 Stunden selbst geantwortet, die KI pausiert"); return ok({ gespeichert: true, ki: "pause" }); }

  // Verlauf der letzten 7 Tage fuer diese Nummer
  const seit = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: hist } = await sb.from("wa_nachrichten").select("richtung, text, wamid").eq("telefon", tel).gte("created_at", seit).order("created_at", { ascending: true }).limit(30);
  const verlauf = (hist || []).filter((x: any) => x.wamid !== (m.wamid || m.id)).slice(-12).map((x: any) => ({ von: x.richtung === "ein" ? "kunde" : "wir", text: x.text || "" }));
  const r = await fetch(`${URL_}/functions/v1/ki-antwort`, { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ nachricht: text, verlauf }) });
  const k = await r.json().catch(() => ({}));
  if (!r.ok || !k.antwort) { console.error("ki-antwort", k); await melden("Die KI konnte keine Antwort erstellen"); return ok({ ki: "fehler" }); }
  const s = await fetch("https://api.ycloud.com/v2/whatsapp/messages/sendDirectly", {
    method: "POST", headers: { "X-API-Key": waKey()!, "Content-Type": "application/json" },
    body: JSON.stringify({ from: WA_ABSENDER, to: tel, type: "text", text: { body: k.antwort } }),
  });
  const sj = await s.json().catch(() => ({}));
  await sb.from("wa_nachrichten").insert({ richtung: "aus", telefon: tel, text: k.antwort, typ: "text", wamid: sj.wamid || sj.id || null, ki_eskalieren: !!k.eskalieren, ki_grund: k.grund || null, quelle: s.ok ? "ki" : "ki_fehler", roh: s.ok ? null : sj });
  if (!s.ok) await melden("Die KI-Antwort konnte nicht gesendet werden", k.antwort);
  else if (k.eskalieren) await melden(k.grund ? `Die KI hat an euch weitergeleitet: ${k.grund}` : "Die KI hat an euch weitergeleitet", k.antwort);
  return ok({ beantwortet: s.ok });
});
