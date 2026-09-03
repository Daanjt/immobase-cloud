// ============================================================
// Supabase Edge Function:  flatfox-watch
// D&T Partners GmbH / ImmoBase
//
// Scannt taeglich die neuesten flatfox.ch-Inserate (offene API,
// kein Auth), gleicht sie per Adresse gegen die Watchlist ab und
// legt neue Treffer in public.flatfox_treffer ab. Der Sidebar-
// Badge in ImmoBase liest daraus.
//
// Deploy: MUSS manuell ueber das Supabase-Dashboard erfolgen
// (MCP deploy_edge_function schlaegt fuer dieses Konto fehl).
//   Dashboard -> Edge Functions -> Deploy -> Slug "flatfox-watch"
//   danach Slug im Dashboard verifizieren.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FLATFOX = "https://flatfox.ch/api/v1/public-listing/";
const PAGE = 100;              // Inserate pro Request
const MAX_SCAN_FIRST = 1500;   // Erstlauf: nur kurzer Rueckblick + Cursor setzen
const MAX_SCAN_INCR = 6000;    // Sicherheitsnetz pro inkrementellem Lauf

// Wohn-Kategorien, die relevant sind (WG "SHARED" bewusst dabei).
const RESIDENTIAL = new Set([
  "APARTMENT","HOUSE","ATTIC","DUPLEX","STUDIO","ROOF_FLAT","MAISONETTE",
  "TERRACE_FLAT","FURNISHED_FLAT","SINGLE_ROOM","SHARED","LOFT","ATTIC_FLAT",
]);

// Region: Kanton Zuerich + Nachbarkantone (SH, TG, SG, ZG, SZ, AG).
// Zweistellige PLZ-Praefixe; bewusst grosszuegig, da der Adressabgleich
// ohnehin exakt auf PLZ + Strasse matcht. Leicht erweiterbar.
const REGION_PREFIXES = new Set([
  "50","51","52","53","54","55","56","57","58","59", // AG
  "63",                                              // ZG
  "64",                                              // SZ (Innerschwyz)
  "80","81","82","83","84","85","86","87","88",      // ZH-Kern + SH/TG/SZ/SG-Grenze
  "90","91","92","93","94","95","96",                // SG / TG / AR / AI
]);
function inRegion(zip: number | string | null): boolean {
  if (zip == null) return false;
  return REGION_PREFIXES.has(String(zip).slice(0, 2));
}

function norm(s: string): string {
  return (s ?? "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")   // Diakritika weg
    .toLowerCase()
    .replace(/strasse/g, "str").replace(/str\./g, "str")
    .replace(/[^a-z0-9]/g, "");
}

async function ff(offset: number, limit = PAGE) {
  const url = `${FLATFOX}?limit=${limit}&offset=${offset}`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (DTHomes ImmoBase Watch)" } });
  if (!r.ok) throw new Error(`flatfox ${r.status} @${offset}`);
  return await r.json();
}

Deno.serve(async (req) => {
  const backfill = new URL(req.url).searchParams.get("backfill") === "1";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Watchlist laden -> Map (strasse_norm|plz) -> objekt-id
  const { data: wl, error: wlErr } = await supabase
    .from("flatfox_watch_objekt")
    .select("id, strasse_norm, plz")
    .eq("aktiv", true);
  if (wlErr) return json({ error: wlErr.message }, 500);
  const wlMap = new Map<string, number>();
  for (const o of wl ?? []) wlMap.set(`${o.strasse_norm}|${o.plz}`, o.id);

  // Cursor
  const { data: st } = await supabase
    .from("flatfox_watch_state").select("last_created").eq("id", 1).single();
  const cursor = st?.last_created ? new Date(st.last_created).getTime() : 0;
  const scanCap = backfill ? 25000 : (cursor ? MAX_SCAN_INCR : MAX_SCAN_FIRST);

  const total: number = (await ff(0, 1)).count;
  let newestSeen = cursor;
  let scanned = 0, reachedCursor = false;
  const treffer: any[] = [];

  // Vom Listenende nach vorne (neueste zuerst), bis Cursor erreicht.
  for (let off = Math.max(0, total - PAGE); off >= 0 && scanned < scanCap; off -= PAGE) {
    let d: any;
    try { d = await ff(off, PAGE); } catch (_e) { continue; }
    for (const r of d.results ?? []) {
      scanned++;
      const created = r.created ? new Date(r.created).getTime() : 0;
      if (created > newestSeen) newestSeen = created;
      if (cursor && created <= cursor) { reachedCursor = true; continue; }
      if (r.offer_type !== "RENT") continue;
      if (!inRegion(r.zipcode)) continue;   // ausserhalb ZH-Region ignorieren
      if (r.object_category && !RESIDENTIAL.has(r.object_category)) continue;
      const key = `${norm(r.street)}|${r.zipcode}`;
      const objId = wlMap.get(key);
      if (!objId) continue;
      treffer.push({
        flatfox_pk: r.pk, watch_objekt_id: objId,
        strasse: r.street, plz: r.zipcode, ort: r.city,
        object_category: r.object_category, zimmer: r.number_of_rooms,
        flaeche: r.livingspace ?? r.surface_living ?? null,
        preis: r.price_display, frei_ab: r.moving_date ?? r.moving_date_type ?? null,
        offer_type: r.offer_type, agency_name: r.agency?.name ?? null,
        url: r.short_url ? `https://flatfox.ch${r.short_url}` : null,
        ff_created: r.created, status: r.status ?? "act", raw: r,
      });
    }
    if (reachedCursor) break;   // ab hier nur noch aeltere -> fertig
  }

  let inserted = 0;
  if (treffer.length) {
    const { error, count } = await supabase
      .from("flatfox_treffer")
      .upsert(treffer, { onConflict: "flatfox_pk", ignoreDuplicates: true, count: "exact" });
    if (error) return json({ error: error.message, matched: treffer.length }, 500);
    inserted = count ?? treffer.length;
  }

  const summary = {
    total, scanned, matched: treffer.length, inserted, backfill,
    cursor_before: cursor ? new Date(cursor).toISOString() : null,
    cursor_after: new Date(newestSeen).toISOString(), at: new Date().toISOString(),
  };
  await supabase.from("flatfox_watch_state").update({
    last_created: new Date(newestSeen).toISOString(),
    last_run: new Date().toISOString(), last_summary: summary,
  }).eq("id", 1);

  return json(summary);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2),
    { status, headers: { "Content-Type": "application/json" } });
}
