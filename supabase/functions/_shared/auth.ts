// Prueft, ob der Aufruf von einem eingeloggten ImmoBase-Admin (allowed_users.role = admin)
// oder serverseitig mit dem Service-Role-Key (pg_cron, andere Functions) kommt.
// Der oeffentliche anon-Key reicht NICHT. verify_jwt = true prueft vorher die Signatur.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// strikt = true fuer Functions mit verify_jwt = false: dann gilt nur der exakte Service-Key
export async function istAdminOderServer(req: Request, strikt = false): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try {
    const pl = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (pl.role === "service_role") return !strikt;
    if (pl.role !== "authenticated") return false;
  } catch (_) { return false; }
  const url = Deno.env.get("SUPABASE_URL")!, key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(url, key);
  const { data, error } = await sb.auth.getUser(token);
  const email = (data?.user?.email || "").toLowerCase();
  if (error || !email) return false;
  const { data: u } = await sb.from("allowed_users").select("role").ilike("email", email).maybeSingle();
  return !!u && u.role === "admin";
}

export function verweigert(cors: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: "Nicht berechtigt" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
}

// Wie istAdminOderServer, aber jede in ImmoBase freigeschaltete Person (alle Rollen) darf
export async function istTeamOderServer(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try {
    const pl = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (pl.role === "service_role") return true;
    if (pl.role !== "authenticated") return false;
  } catch (_) { return false; }
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await sb.auth.getUser(token);
  const email = (data?.user?.email || "").toLowerCase();
  if (error || !email) return false;
  const { data: u } = await sb.from("allowed_users").select("role").ilike("email", email).maybeSingle();
  return !!u;
}
