// ============================================================
// Supabase Edge Function:  flatfox-watch
// D&T Partners GmbH / ImmoBase
//
// Scannt die neuesten flatfox.ch-Inserate (offene API, kein Auth),
// gleicht sie per Adresse gegen die Watchlist ab und legt neue
// Treffer in public.flatfox_treffer ab.
//
// Abgleich: Strassenname (ohne Nummer, normalisiert) + PLZ. Traegt
// das Inserat eine Hausnummer, muss sie zu den bekannten Nummern des
// Objekts passen (sonst Fremdhaus auf gleicher Strasse). Ohne Nummer
// zaehlt der Strasse+PLZ-Treffer.
//
// ?backfill=1 scannt einmalig den Bestand (bis 25000).
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FLATFOX = "https://flatfox.ch/api/v1/public-listing/";
const PAGE = 100;
const MAX_SCAN_FIRST = 1500;
const MAX_SCAN_INCR = 6000;
const MAX_SCAN_BACKFILL = 25000;

const RESIDENTIAL = new Set([
  "APARTMENT","HOUSE","ATTIC","DUPLEX","STUDIO","ROOF_FLAT","MAISONETTE",
  "TERRACE_FLAT","FURNISHED_FLAT","SINGLE_ROOM","SHARED","LOFT","ATTIC_FLAT",
]);

const REGION_PREFIXES = new Set([
  "50","51","52","53","54","55","56","57","58","59",
  "63","64",
  "80","81","82","83","84","85","86","87","88",
  "90","91","92","93","94","95","96",
]);
const inRegion = (zip) => zip != null && REGION_PREFIXES.has(String(zip).slice(0, 2));

function norm(s) {
  return (s ?? "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/strasse/g, "str").replace(/str\./g, "str")
    .replace(/[^a-z0-9]/g, "");
}
const streetKey = (raw) => norm((raw ?? "").split(/\d/)[0]);
const houseNums = (raw) =>
  ((raw ?? "").match(/\d+\s*[a-zA-Z]?/g) || []).map((x) => x.replace(/\s+/g, "").toLowerCase());

async function ff(offset, limit = PAGE) {
  const url = `${FLATFOX}?limit=${limit}&offset=${offset}`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (DTHomes ImmoBase Watch)" } });
  if (!r.ok) throw new Error(`flatfox ${r.status} @${offset}`);
  return await r.json();
}

Deno.serve(async (req) => {
  const backfill = new URL(req.url).searchParams.get("backfill") === "1";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const { data: wl, error: wlErr } = await supabase
    .from("flatfox_watch_objekt")
    .select("id, strasse_norm, plz, hausnummern")
    .eq("aktiv", true);
  if (wlErr) return json({ error: wlErr.message }, 500);
  const byKey = new Map();
  for (const o of wl ?? []) {
    const key = `${o.strasse_norm}|${o.plz}`;
    let e = byKey.get(key);
    if (!e) { e = { objId: o.id, nums: new Set() }; byKey.set(key, e); }
    for (const n of houseNums(o.hausnummern)) e.nums.add(n);
  }

  const { data: stt } = await supabase
    .from("flatfox_watch_state").select("last_created").eq("id", 1).single();
  const cursor = stt?.last_created ? new Date(stt.last_created).getTime() : 0;
  const scanCap = backfill ? MAX_SCAN_BACKFILL : (cursor ? MAX_SCAN_INCR : MAX_SCAN_FIRST);

  const total = (await ff(0, 1)).count;
  let newestSeen = cursor;
  let scanned = 0, reachedCursor = false;
  const treffer = [];

  for (let off = Math.max(0, total - PAGE); off >= 0 && scanned < scanCap; off -= PAGE) {
    let d;
    try { d = await ff(off, PAGE); } catch (_e) { continue; }
    for (const r of d.results ?? []) {
      scanned++;
      const created = r.created ? new Date(r.created).getTime() : 0;
      if (created > newestSeen) newestSeen = created;
      if (!backfill && cursor && created <= cursor) { reachedCursor = true; continue; }
      if (r.offer_type !== "RENT") continue;
      if (!inRegion(r.zipcode)) continue;
      if (r.object_category && !RESIDENTIAL.has(r.object_category)) continue;

      const e = byKey.get(`${streetKey(r.street)}|${r.zipcode}`);
      if (!e) continue;
      const lnums = houseNums(r.street);
      const passt = lnums.length === 0 || lnums.some((n) => e.nums.has(n));
      if (!passt) continue;

      treffer.push({
        flatfox_pk: r.pk, watch_objekt_id: e.objId,
        strasse: r.street, plz: r.zipcode, ort: r.city,
        object_category: r.object_category, zimmer: r.number_of_rooms,
        flaeche: r.livingspace ?? r.surface_living ?? null,
        preis: r.price_display, frei_ab: r.moving_date ?? r.moving_date_type ?? null,
        offer_type: r.offer_type, agency_name: r.agency?.name ?? null,
        url: r.short_url ? `https://flatfox.ch${r.short_url}` : null,
        ff_created: r.created, status: r.status ?? "act", raw: r,
      });
    }
    if (reachedCursor) break;
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

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2),
    { status, headers: { "Content-Type": "application/json" } });
}
