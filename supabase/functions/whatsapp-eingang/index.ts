// whatsapp-eingang - Webhook von YCloud fuer eingehende WhatsApp-Nachrichten.
// Speichert jede Nachricht in wa_nachrichten. Testphase: Nur Nachrichten von den Testnummern
// (app_config.whatsapp_testnummern) bekommen sofort eine KI-Antwort; alle anderen werden nur gespeichert.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normTelefon, waKey, WA_ABSENDER } from "../_shared/whatsapp.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ok = (b: unknown = { ok: true }) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });

async function hmacHex(secret: string, data: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok();
  const roh = await req.text();
  const sb = createClient(URL_, KEY);
  const { data: cfg } = await sb.from("app_config").select("key,value").in("key", ["ycloud_webhook_secret", "whatsapp_testnummern"]);
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
  const text = m.type === "text" ? String(m.text?.body || "") : "";
  const { error: dup } = await sb.from("wa_nachrichten").insert({ richtung: "ein", telefon: tel, name: m.customerProfile?.name || null, text: text || `[${m.type}]`, typ: m.type, wamid: m.wamid || m.id, roh: ev });
  if (dup) return ok({ dup: true }); // schon verarbeitet (YCloud wiederholt Webhooks)

  // Testphase: nur Testnummern bekommen eine automatische KI-Antwort
  const test = String(c.whatsapp_testnummern || "").split(/[,;\s]+/).map(normTelefon).filter(Boolean);
  if (!test.includes(tel) || !text || !waKey()) return ok({ gespeichert: true });
  // KI pausiert: im Posteingang ausgeschaltet oder ein Mensch hat in den letzten 6 Stunden geantwortet
  const { data: chat } = await sb.from("wa_chats").select("ki_aus").eq("telefon", tel).maybeSingle();
  if (chat?.ki_aus) return ok({ gespeichert: true, ki: "aus" });
  const { data: mensch } = await sb.from("wa_nachrichten").select("id").eq("telefon", tel).eq("richtung", "aus").in("quelle", ["handy", "immobase", "immobase_ki"])
    .gte("created_at", new Date(Date.now() - 6 * 3600000).toISOString()).limit(1);
  if (mensch && mensch.length) return ok({ gespeichert: true, ki: "pause" });

  // Verlauf der letzten 7 Tage fuer diese Nummer
  const seit = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: hist } = await sb.from("wa_nachrichten").select("richtung, text, wamid").eq("telefon", tel).gte("created_at", seit).order("created_at", { ascending: true }).limit(30);
  const verlauf = (hist || []).filter((x: any) => x.wamid !== (m.wamid || m.id)).slice(-12).map((x: any) => ({ von: x.richtung === "ein" ? "kunde" : "wir", text: x.text || "" }));
  const r = await fetch(`${URL_}/functions/v1/ki-antwort`, { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ nachricht: text, verlauf }) });
  const k = await r.json().catch(() => ({}));
  if (!r.ok || !k.antwort) { console.error("ki-antwort", k); return ok({ ki: "fehler" }); }
  const s = await fetch("https://api.ycloud.com/v2/whatsapp/messages/sendDirectly", {
    method: "POST", headers: { "X-API-Key": waKey()!, "Content-Type": "application/json" },
    body: JSON.stringify({ from: WA_ABSENDER, to: tel, type: "text", text: { body: k.antwort } }),
  });
  const sj = await s.json().catch(() => ({}));
  await sb.from("wa_nachrichten").insert({ richtung: "aus", telefon: tel, text: k.antwort, typ: "text", wamid: sj.wamid || sj.id || null, ki_eskalieren: !!k.eskalieren, ki_grund: k.grund || null, quelle: s.ok ? "ki" : "ki_fehler", roh: s.ok ? null : sj });
  return ok({ beantwortet: s.ok });
});
