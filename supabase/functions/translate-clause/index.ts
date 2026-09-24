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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const p = await req.json();
    const text = (p.text || "").toString().trim();
    if (!text) return j({ en: "" });

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let key = Deno.env.get("ANTHROPIC_API_KEY") || "";
    let model = Deno.env.get("ANTHROPIC_MODEL") || "";
    if (!key || !model) {
      const { data: cfg } = await sb.from("app_config").select("key,value").in("key", ["anthropic_api_key", "anthropic_model"]);
      const c: Record<string, string> = {};
      (cfg || []).forEach((r: any) => (c[r.key] = r.value));
      if (!key) key = c.anthropic_api_key || "";
      if (!model) model = c.anthropic_model || "";
    }
    if (!key) return j({ error: "Kein Anthropic-Schluessel hinterlegt.", en: "" }, 200);
    if (!model) model = "claude-haiku-4-5-20251001";

    const prompt =
      "Uebersetze die folgende Klausel aus einem Schweizer Untermietvertrag praezise und in juristisch angemessenem Ton ins Englische. Bewahre Sinn und Bestimmtheit exakt. Antworte NUR mit der englischen Uebersetzung, ohne Anfuehrungszeichen, ohne Vorwort, ohne Erklaerung.\n\nKlausel:\n" +
      text;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 1200, output_config: { effort: "low" }, messages: [{ role: "user", content: prompt }] }),
    });
    const jr = await r.json();
    if (!r.ok) return j({ error: jr?.error?.message || "Anthropic-Fehler", en: "" }, 200);
    const blocks = Array.isArray(jr.content) ? jr.content : [];
    const en = blocks.filter((b: any) => b && b.type === "text").map((b: any) => b.text || "").join("").trim();
    return j({ en });
  } catch (e) {
    return j({ error: String(e), en: "" }, 200);
  }
});
