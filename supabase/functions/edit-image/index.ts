import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const PROMPTS: Record<string, string> = {
  // Moebel entfernen und aufraeumen -> leerer, ordentlicher Raum
  leeren:
    "Remove all freestanding furniture, decor, clutter and personal items from this interior real estate photo, showing an empty, clean and tidy room. Keep the room's architecture, walls, floor, ceiling, windows, doors, radiators, built-in fixtures, lighting and camera perspective exactly the same and fully photorealistic. Do not add any new objects, text or watermarks. Natural, realistic result.",
  // Nur aufraeumen -> Unordnung weg, Moebel bleiben
  aufraeumen:
    "Declutter and tidy this interior real estate photo: remove mess, clutter, personal items, cables and small objects so the room looks clean and neat. Keep all furniture, the room's architecture, walls, floor, windows, fixtures, lighting and camera perspective exactly the same and fully photorealistic. Do not add any new objects, text or watermarks.",
};

function extToType(path: string): string {
  const e = (path.split(".").pop() || "").toLowerCase();
  if (e === "png") return "image/png";
  if (e === "webp") return "image/webp";
  return "image/jpeg";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const p = await req.json();
    const path = (p.path || "").toString();
    const apartmentId = (p.apartment_id || "").toString();
    const mode = (p.mode || "leeren").toString();
    if (!path || !apartmentId) return j({ error: "path und apartment_id sind erforderlich." }, 200);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let key = Deno.env.get("OPENAI_API_KEY") || "";
    let model = Deno.env.get("OPENAI_IMAGE_MODEL") || "";
    if (!key || !model) {
      const { data: cfg } = await sb.from("app_config").select("key,value").in("key", ["openai_api_key", "openai_image_model"]);
      const c: Record<string, string> = {};
      (cfg || []).forEach((r: any) => (c[r.key] = r.value));
      if (!key) key = c.openai_api_key || "";
      if (!model) model = c.openai_image_model || "";
    }
    if (!key) return j({ error: "Kein OpenAI-Schluessel hinterlegt (Edge-Function-Secret OPENAI_API_KEY oder app_config.openai_api_key)." }, 200);
    if (!model) model = "gpt-image-1";

    const prompt = PROMPTS[mode] || PROMPTS["leeren"];

    // Originalbild aus dem assets-Bucket holen
    const { data: pub } = sb.storage.from("assets").getPublicUrl(path);
    const srcUrl = pub?.publicUrl;
    if (!srcUrl) return j({ error: "Bild-URL konnte nicht bestimmt werden." }, 200);
    const imgRes = await fetch(srcUrl);
    if (!imgRes.ok) return j({ error: "Originalbild konnte nicht geladen werden." }, 200);
    const imgBuf = new Uint8Array(await imgRes.arrayBuffer());
    const imgType = extToType(path);

    // OpenAI Image Edit aufrufen (multipart)
    const form = new FormData();
    form.append("model", model);
    form.append("image", new File([imgBuf], "photo." + (imgType.split("/")[1] || "jpg"), { type: imgType }));
    form.append("prompt", prompt);
    form.append("size", "auto");
    form.append("n", "1");

    const oa = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: "Bearer " + key },
      body: form,
    });
    const oaJson = await oa.json();
    if (!oa.ok) return j({ error: oaJson?.error?.message || "OpenAI-Fehler" }, 200);

    const b64 = oaJson?.data?.[0]?.b64_json;
    if (!b64) return j({ error: "Leere Antwort vom Bildmodell." }, 200);

    // Base64 -> Bytes
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const newPath = `apartments/${apartmentId}/ki_${mode}_${Date.now()}.png`;
    const { error: upErr } = await sb.storage.from("assets").upload(newPath, bytes, { contentType: "image/png", upsert: false });
    if (upErr) return j({ error: "Speichern fehlgeschlagen: " + upErr.message }, 200);

    return j({ path: newPath });
  } catch (e) {
    return j({ error: String(e) }, 200);
  }
});
