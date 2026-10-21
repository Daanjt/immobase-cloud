// ============================================================
// Supabase Edge Function: import-listing-images
// D&T Partners GmbH / ImmoBase
//
// Holt aus einem flatfox.ch-Inserat: (1) alle Bilder in voller
// Aufloesung in den Storage-Bucket 'assets' unter
// apartments/{apartment_id}/, und (2) die Eckdaten aus der
// Flatfox-API (Zimmer, Stockwerk, Mietbeginn, befristet-bis,
// Miete, Beschreibung, 3D-Tour). Gibt Pfade + meta zurueck; die
// App uebernimmt meta in leere Wohnungsfelder.
// Nur fuer eingeloggte Admins bzw. serverseitig.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function istAdminOderServer(req: Request): Promise<boolean> {
  const t = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!t) return false;
  if (t === SERVICE_KEY) return true;
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${t}` } });
  if (!u.ok) return false;
  const email = String((await u.json())?.email || "").toLowerCase();
  if (!email) return false;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/allowed_users?email=ilike.${encodeURIComponent(email)}&select=role`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  const rows = r.ok ? await r.json() : [];
  return rows.some((x: any) => x.role === "admin");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await istAdminOderServer(req))) return json({ error: "Nicht berechtigt" }, 403);
  try {
    const { url, apartment_id } = await req.json().catch(() => ({}));
    if (!url || !apartment_id) return json({ error: "url und apartment_id erforderlich" }, 400);
    if (!/^https:\/\/(www\.)?flatfox\.ch\//i.test(String(url))) return json({ error: "Nur flatfox.ch-Links werden aktuell unterstuetzt." }, 400);
    if (!/^[A-Za-z0-9_-]+$/.test(String(apartment_id))) return json({ error: "Ungueltige apartment_id" }, 400);

    const errors: string[] = [];

    // ---------- Bilder ----------
    const pageRes = await fetch(String(url), { headers: { "User-Agent": UA } });
    if (!pageRes.ok) return json({ error: `Inserat nicht erreichbar (HTTP ${pageRes.status})` }, 502);
    const html = await pageRes.text();
    const rx = /(ff\/20\d{2}\/\d{2}\/[a-z0-9]+\.(?:jpg|jpeg|png|webp))/gi;
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = rx.exec(html)) !== null) seen.add(m[1].toLowerCase());
    const rel = [...seen];

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const stamp = Date.now();
    const stored: string[] = [];
    for (let i = 0; i < rel.length; i++) {
      const src = "https://flatfox.ch/media/" + rel[i];
      try {
        const r = await fetch(src, { headers: { "User-Agent": UA } });
        if (!r.ok) { errors.push(`${rel[i]}: HTTP ${r.status}`); continue; }
        const ext = (rel[i].split(".").pop() || "jpg").toLowerCase();
        const ct = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
        const buf = new Uint8Array(await r.arrayBuffer());
        const dest = `apartments/${apartment_id}/flatfox_${stamp}_${String(i + 1).padStart(2, "0")}.${ext}`;
        const { error } = await sb.storage.from("assets").upload(dest, buf, { contentType: ct, upsert: false });
        if (error) { errors.push(`${rel[i]}: ${error.message}`); continue; }
        stored.push(dest);
      } catch (e) { errors.push(`${rel[i]}: ${e instanceof Error ? e.message : String(e)}`); }
    }

    // ---------- Eckdaten aus der Flatfox-API ----------
    const meta: Record<string, unknown> = {};
    try {
      const pkm = String(url).match(/(\d{5,})\/?(?:[?#].*)?$/);
      if (pkm) {
        const api = await fetch(`https://flatfox.ch/api/v1/public-listing/?pk=${pkm[1]}`, { headers: { "User-Agent": UA } });
        if (api.ok) {
          const j = await api.json();
          const r = (j.results && j.results[0]) || j;
          if (r && r.pk) {
            const fmtD = (s: unknown) => { const mm = String(s ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/); return mm ? `${mm[3]}.${mm[2]}.${mm[1]}` : null; };
            const floorLabel = (f: unknown) => { if (f === null || f === undefined) return null; const n = Number(f); if (Number.isNaN(n)) return null; if (n === 0) return "EG"; if (n > 0) return `${n}. OG`; return `${Math.abs(n)}. UG`; };
            const clean = (t: unknown) => String(t ?? "").replace(/\*\*/g, "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
            const bib = () => { const txt = `${r.description_title ?? ""} ${r.description ?? ""}`; const b = txt.match(/befrist\w*[^0-9]{0,14}(\d{1,2}\.\d{1,2}\.\d{4})/i) || txt.match(/bis\s+(?:zum\s+)?(\d{1,2}\.\d{1,2}\.\d{4})/i); return b ? b[1] : null; };
            const cand: Record<string, unknown> = {
              zimmer: r.number_of_rooms != null ? String(r.number_of_rooms) : null,
              stockwerk: floorLabel(r.floor),
              mietbeginn: fmtD(r.moving_date),
              mietende: r.is_temporary ? bib() : null,
              beschreibung: r.description ? clean(r.description) : null,
              matterport_url: (typeof r.tour_url === "string" && /^https?:/.test(r.tour_url)) ? r.tour_url : null,
              miete: r.rent_gross != null ? Number(r.rent_gross) : null,
              adresse: r.street || null,
              plz: r.zipcode != null ? String(r.zipcode) : null,
              ort: r.city || null,
            };
            for (const k of Object.keys(cand)) { const v = cand[k]; if (v !== null && v !== undefined && v !== "") meta[k] = v; }
          }
        }
      }
    } catch (e) { errors.push(`meta: ${e instanceof Error ? e.message : String(e)}`); }

    return json({ count: stored.length, paths: stored, found: rel.length, meta, errors });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
