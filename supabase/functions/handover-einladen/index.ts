// handover-einladen: Einladung zum Uebernahmeprotokoll fuer das ganze Team.
// Admin und Operations duerfen jedes Protokoll senden, Vermietung nur Protokolle, die sie laut Datenbank sehen darf
// (Einzug ihrer neuen Mieter). Der eigentliche Versand laeuft ueber send-handover-invite (mit Service-Key).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Nicht berechtigt" }, 403);
  const { protocolId } = await req.json().catch(() => ({}));
  if (!protocolId) return json({ error: "Missing protocolId" }, 400);
  const sb = createClient(URL_, KEY);
  const { data: u } = await sb.auth.getUser(token);
  const email = (u?.user?.email || "").toLowerCase();
  if (!email) return json({ error: "Nicht berechtigt" }, 403);
  const { data: r } = await sb.from("allowed_users").select("role").ilike("email", email).maybeSingle();
  const rolle = r?.role;
  if (!["admin", "operations", "vermietung"].includes(rolle)) return json({ error: "Nicht berechtigt" }, 403);
  if (rolle === "vermietung") {
    // Mit dem Login der Person lesen: die Datenbank-Regeln entscheiden, ob sie dieses Protokoll sehen darf
    const als = createClient(URL_, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: p } = await als.from("handover_protocols").select("id, type").eq("id", protocolId).maybeSingle();
    if (!p || p.type !== "einzug") return json({ error: "Nicht berechtigt" }, 403);
  }
  const res = await fetch(`${URL_}/functions/v1/send-handover-invite`, {
    method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ protocolId }),
  });
  return new Response(await res.text(), { status: res.status, headers: { ...CORS, "Content-Type": "application/json" } });
});
