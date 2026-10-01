import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const sb = createClient(SUPABASE_URL!, SERVICE_KEY!);
    const nowIso = new Date().toISOString();
    const { data: due } = await sb.from("kampagnen_geplant").select("*").eq("status", "geplant").lte("scheduled_for", nowIso).limit(20);
    let processed = 0;
    for (const g of (due || [])) {
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-campaign`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ group: g.gruppe, subject: g.betreff, text: g.text, recipients: g.recipients, attachments: g.attachments }),
        });
        const result = await resp.json().catch(() => ({}));
        const ok = resp.ok && !result.error;
        await sb.from("kampagnen_geplant").update({ status: ok ? "gesendet" : "fehler", gesendet_am: new Date().toISOString(), result }).eq("id", g.id);
        processed++;
      } catch (e) {
        await sb.from("kampagnen_geplant").update({ status: "fehler", gesendet_am: new Date().toISOString(), result: { error: String((e as Error).message || e) } }).eq("id", g.id);
      }
    }
    return new Response(JSON.stringify({ success: true, faellig: (due || []).length, processed }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
