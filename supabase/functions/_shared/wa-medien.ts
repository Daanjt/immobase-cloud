// Gemeinsame Medien-Logik fuer WhatsApp (Eingang und Posteingang)
import { waKey } from "./whatsapp.ts";

export const MEDIEN = ["image", "video", "audio", "document", "sticker"];
export const LABEL: Record<string, string> = { image: "📷 Bild", video: "🎬 Video", audio: "🎤 Sprachnachricht", document: "📄 Dokument", sticker: "Sticker" };
const ENDUNG: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "application/pdf": "pdf" };

// Medium bei YCloud herunterladen und im privaten Bucket "whatsapp" ablegen
export async function medienSpeichern(sb: any, id: number | string, tel: string, typ: string, med: any) {
  const key = waKey();
  // 1. signierter Link aus dem Webhook (gilt nur kurz), 2. ohne Key, 3. ueber die Medien-ID mit API-Key
  const versuche: [string, Record<string, string>][] = [
    [med.link, key ? { "X-API-Key": key } : {}],
    [med.link, {}],
    ...(med.id && key ? [[`https://api.ycloud.com/v2/whatsapp/media/download/${med.id}`, { "X-API-Key": key }] as [string, Record<string, string>]] : []),
  ];
  let r: Response | null = null; const status: number[] = [];
  for (const [u, h] of versuche) { if (!u) continue; r = await fetch(u, { headers: h }); if (r.ok) break; status.push(r.status); await r.body?.cancel(); r = null; }
  if (!r) throw new Error(`Download ${status.join("/")}`);
  const mime = String(med.mime_type || r.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
  const roh = String(med.filename || "").replace(/[^\w.\-]+/g, "_").slice(-80);
  const ext = roh.includes(".") ? roh.split(".").pop() : (ENDUNG[mime] || mime.split("/")[1] || "bin");
  const pfad = `${tel.replace("+", "")}/${id}-${typ}.${ext}`;
  const bytes = new Uint8Array(await r.arrayBuffer());
  const { error } = await sb.storage.from("whatsapp").upload(pfad, bytes, { contentType: mime, upsert: true });
  if (error) throw error;
  await sb.from("wa_nachrichten").update({ medien_pfad: pfad, medien_mime: mime, medien_name: med.filename || null }).eq("id", id);
  return { pfad, mime, bytes };
}

// Sprachnachricht in Text umwandeln (OpenAI). Liefert den Text oder null.
async function openaiKey(sb: any): Promise<string> {
  let k = Deno.env.get("OPENAI_API_KEY") || "";
  if (!k) { const { data } = await sb.from("app_config").select("value").eq("key", "openai_api_key").maybeSingle(); k = data?.value || ""; }
  return k;
}
export async function transkribieren(sb: any, bytes: Uint8Array, mime: string): Promise<string | null> {
  const key = await openaiKey(sb);
  if (!key) throw new Error("Kein OpenAI-Schlüssel hinterlegt");
  const ext = ENDUNG[mime] || "ogg";
  let fehler = "";
  for (const model of ["gpt-4o-transcribe", "whisper-1"]) {
    const fd = new FormData();
    fd.append("file", new Blob([bytes], { type: mime }), `sprachnachricht.${ext}`);
    fd.append("model", model);
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { const t = String(j.text || "").trim(); return t || null; }
    fehler = `${r.status} ${JSON.stringify(j).slice(0, 200)}`;
  }
  throw new Error("Transkription fehlgeschlagen: " + fehler);
}

// Gespeicherte Sprachnachricht (wa_nachrichten.id) transkribieren und Text ablegen
export async function nachrichtTranskribieren(sb: any, id: number | string, bytes?: Uint8Array, mime?: string): Promise<string | null> {
  if (!bytes) {
    const { data: n } = await sb.from("wa_nachrichten").select("medien_pfad, medien_mime").eq("id", id).maybeSingle();
    if (!n?.medien_pfad) throw new Error("Sprachnachricht ist nicht gespeichert");
    const { data: f, error } = await sb.storage.from("whatsapp").download(n.medien_pfad);
    if (error || !f) throw new Error("Datei konnte nicht geladen werden");
    bytes = new Uint8Array(await f.arrayBuffer()); mime = n.medien_mime || "audio/ogg";
  }
  const t = await transkribieren(sb, bytes, mime || "audio/ogg");
  if (t) await sb.from("wa_nachrichten").update({ transkript: t, text: `🎤 ${t}` }).eq("id", id);
  return t;
}

