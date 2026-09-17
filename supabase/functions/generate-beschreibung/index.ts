import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { adresse, plz, ort, zimmer } = await req.json();
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let key = Deno.env.get("ANTHROPIC_API_KEY") || "";
    if (!key) {
      const { data: cfg } = await sb.from("app_config").select("value").eq("key", "anthropic_api_key").maybeSingle();
      key = cfg?.value || "";
    }
    if (!key) {
      return new Response(JSON.stringify({ error: "Kein Anthropic-Schluessel hinterlegt (app_config: anthropic_api_key)" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const loc = `${adresse || ""}, ${plz || ""} ${ort || ""}`.trim();
    const prompt = `Schreibe einen kurzen, sachlichen Lagebeschrieb fuer ein WG-Zimmer-Inserat an dieser Adresse: ${loc}. Zwei bis drei Saetze, Deutsch, Schweizer Rechtschreibung (ss statt ss-Ligatur). Beschreibe Quartier-Charakter, OeV-Anbindung und Einkaufsmoeglichkeiten in der Naehe, nur was fuer diese konkrete Lage plausibel ist. Keine erfundenen Details, kein Werbe-Ueberschwang, keine Einleitung. Gib nur den Text zurueck.`;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-3-5-haiku-latest", max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
    });
    const j = await r.json();
    if (!r.ok) {
      return new Response(JSON.stringify({ error: j?.error?.message || "Anthropic-Fehler" }),
        { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const text = (j.content?.[0]?.text || "").trim();
    return new Response(JSON.stringify({ text }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
