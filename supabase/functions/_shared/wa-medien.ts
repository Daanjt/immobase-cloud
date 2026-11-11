// Gemeinsame Medien-Logik fuer WhatsApp (Eingang und Posteingang)
import { waKey } from "./whatsapp.ts";

export const MEDIEN = ["image", "video", "audio", "document", "sticker"];
export const LABEL: Record<string, string> = { image: "📷 Bild", video: "🎬 Video", audio: "🎤 Sprachnachricht", document: "📄 Dokument", sticker: "Sticker" };
const ENDUNG: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "application/pdf": "pdf" };

// Medium bei YCloud herunterladen und im privaten Bucket "whatsapp" ablegen
export async function medienSpeichern(sb: any, id: number | string, tel: string, typ: string, med: any) {
  const key = waKey();
  const r = await fetch(med.link, { headers: key ? { "X-API-Key": key } : {} });
  if (!r.ok) throw new Error(`Download ${r.status}`);
  const mime = String(med.mime_type || r.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
  const roh = String(med.filename || "").replace(/[^\w.\-]+/g, "_").slice(-80);
  const ext = roh.includes(".") ? roh.split(".").pop() : (ENDUNG[mime] || mime.split("/")[1] || "bin");
  const pfad = `${tel.replace("+", "")}/${id}-${typ}.${ext}`;
  const { error } = await sb.storage.from("whatsapp").upload(pfad, new Uint8Array(await r.arrayBuffer()), { contentType: mime, upsert: true });
  if (error) throw error;
  await sb.from("wa_nachrichten").update({ medien_pfad: pfad, medien_mime: mime, medien_name: med.filename || null }).eq("id", id);
}

