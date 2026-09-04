// ============================================================
// Supabase Edge Function:  markt-radar
// D&T Partners GmbH / ImmoBase
//
// Marktradar: befristete, unmoeblierte Mietobjekte auf Flatfox,
// nur von Verwaltungen / professionellen Eigentuemern (agency mit
// Namen), Region Kanton ZH + Nachbarkantone. Eigener Cursor,
// schreibt in public.markt_radar. ?backfill=1 scannt den Bestand.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FLATFOX = "https://flatfox.ch/api/v1/public-listing/";
const PAGE = 100;
const MAX_SCAN_FIRST = 1500;
const MAX_SCAN_INCR = 6000;
const MAX_SCAN_BACKFILL = 15000;

const RESIDENTIAL = new Set([
  "APARTMENT","HOUSE","ATTIC","DUPLEX","STUDIO","ROOF_FLAT","MAISONETTE",
  "TERRACE_FLAT","FURNISHED_FLAT","SINGLE_ROOM","LOFT","VILLA","ATTIC_FLAT",
]);
// Zuerich Stadt (8000-8099) plus innerer Ring (Limmattal, Zimmerberg-Fuss, Pfannenstiel-Fuss, Glattal, inneres Furttal)
const ZH_RING = new Set([
  8102,8103,8104,8105,8106,8107,8108,
  8117,8118,8121,8122,8123,8124,8125,8126,8127,
  8134,8135,8136,8142,
  8152,8153,8155,
  8302,8303,8304,8305,8306,
  8600,8602,8603,8604,
  8700,8702,8703,
  8800,8802,8803,
  8902,8903,8904,
  8951,8952,8953,8954,8955,
]);
const inRegion = (zip) => { const z = Number(zip); if (!z) return false; if (z >= 8000 && z <= 8099) return true; return ZH_RING.has(z); };

async function ff(offset, limit = PAGE) {
  const r = await fetch(`${FLATFOX}?limit=${limit}&offset=${offset}`,
    { headers: { "User-Agent": "Mozilla/5.0 (DTHomes ImmoBase MarktRadar)" } });
  if (!r.ok) throw new Error(`flatfox ${r.status} @${offset}`);
  return await r.json();
}

Deno.serve(async (req) => {
  const backfill = new URL(req.url).searchParams.get("backfill") === "1";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  const { data: stt } = await supabase
    .from("flatfox_watch_state").select("markt_last_created").eq("id", 1).single();
  const cursor = stt?.markt_last_created ? new Date(stt.markt_last_created).getTime() : 0;
  const scanCap = backfill ? MAX_SCAN_BACKFILL : (cursor ? MAX_SCAN_INCR : MAX_SCAN_FIRST);

  const { data: bl } = await supabase.from("markt_blocklist").select("term");
  const blockTerms = (bl ?? []).map((x) => (x.term || "").toLowerCase()).filter(Boolean);

  const total = (await ff(0, 1)).count;
  let newestSeen = cursor, scanned = 0, reachedCursor = false;
  const rows = [];

  for (let off = Math.max(0, total - PAGE); off >= 0 && scanned < scanCap; off -= PAGE) {
    let d;
    try { d = await ff(off, PAGE); } catch (_e) { continue; }
    for (const r of d.results ?? []) {
      scanned++;
      const created = r.created ? new Date(r.created).getTime() : 0;
      if (created > newestSeen) newestSeen = created;
      if (!backfill && cursor && created <= cursor) { reachedCursor = true; continue; }
      if (r.offer_type !== "RENT") continue;
      if (r.is_furnished) continue;           // nur unmoebliert
      if (!inRegion(r.zipcode)) continue;
      if (r.object_category && !RESIDENTIAL.has(r.object_category)) continue;
      const agency = r.agency && r.agency.name ? r.agency.name : null;
      if (!agency) continue;                  // nur Verwaltung / professionell
      if (blockTerms.some((t) => agency.toLowerCase().includes(t))) continue;  // Ausschlussliste
      const befristet = !!r.is_temporary;
      if (!befristet) {
        const rooms = Number(r.number_of_rooms);
        const price = Number(r.rent_gross);
        const cap = Math.floor(rooms) * 1000;
        if (!(rooms && price && cap > 0 && price <= cap)) continue;  // Preisgrenze: max 1000 pro Zimmer
      }
      rows.push({
        flatfox_pk: r.pk, befristet, strasse: r.street, plz: r.zipcode, ort: r.city,
        object_category: r.object_category, zimmer: r.number_of_rooms,
        flaeche: r.livingspace ?? r.surface_living ?? null,
        preis: r.rent_gross ?? r.price_display ?? null,
        frei_ab: r.moving_date ?? r.moving_date_type ?? null,
        agency_name: agency, url: r.short_url ? `https://flatfox.ch${r.short_url}` : null,
        ff_created: r.created, status: r.status ?? "act", raw: r,
      });
    }
    if (reachedCursor) break;
  }

  let inserted = 0;
  if (rows.length) {
    const { error, count } = await supabase.from("markt_radar")
      .upsert(rows, { onConflict: "flatfox_pk", ignoreDuplicates: true, count: "exact" });
    if (error) return json({ error: error.message, matched: rows.length }, 500);
    inserted = count ?? 0;
  }
  await supabase.from("flatfox_watch_state").update({
    markt_last_created: new Date(newestSeen).toISOString(),
    markt_last_run: new Date().toISOString(),
  }).eq("id", 1);

  return json({ total, scanned, matched: rows.length, inserted, backfill });
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2),
    { status, headers: { "Content-Type": "application/json" } });
}
