// ============================================================
// Supabase Edge Function:  markt-radar
// D&T Partners GmbH / ImmoBase
//
// Marktradar: befristete, unmoeblierte Mietobjekte auf Flatfox,
// nur von Verwaltungen / professionellen Eigentuemern (agency mit
// Namen), Region Kanton ZH + Nachbarkantone. Eigener Cursor,
// schreibt in public.markt_radar. ?backfill=1 scannt den Bestand.
// Bereinigung: bei jedem (taeglichen) Lauf werden bis zu 400 Flatfox-
// Eintraege nachgeschaut (zuerst die am laengsten ungeprueften); ist ein Inserat nicht mehr
// aktiv, wird es aus dem Marktradar entfernt. ?bereinigen=1 prueft alle.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { istAdminOderServer, verweigert } from "../_shared/auth.ts";

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
const inRegion = (zip) => { const z = Number(zip); if (!z) return false; if (z >= 8000 && z <= 8099) return true; if (z >= 3000 && z <= 3018) return true; /* Bern Stadt inkl. Innenstadt/Altstadt 3011 */ return ZH_RING.has(z); };

async function ff(offset, limit = PAGE) {
  const r = await fetch(`${FLATFOX}?limit=${limit}&offset=${offset}`,
    { headers: { "User-Agent": "Mozilla/5.0 (DTHomes ImmoBase MarktRadar)" } });
  if (!r.ok) throw new Error(`flatfox ${r.status} @${offset}`);
  return await r.json();
}

Deno.serve(async (req) => {
  if (!(await istAdminOderServer(req))) return verweigert({});
  const backfill = new URL(req.url).searchParams.get("backfill") === "1";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  const alleBereinigen = new URL(req.url).searchParams.get("bereinigen") === "1";
  const nurBereinigen = alleBereinigen && new URL(req.url).searchParams.get("scan") !== "1";
  const bereinigung = await bereinige(supabase, alleBereinigen ? 1000 : 400);
  if (nurBereinigen) return json({ bereinigung });

  const { data: stt } = await supabase
    .from("flatfox_watch_state").select("markt_last_created").eq("id", 1).single();
  const cursor = stt?.markt_last_created ? new Date(stt.markt_last_created).getTime() : 0;
  const scanCap = backfill ? MAX_SCAN_BACKFILL : (cursor ? MAX_SCAN_INCR : MAX_SCAN_FIRST);

  const { data: bl } = await supabase.from("markt_blocklist").select("term");
  const blockTerms = (bl ?? []).map((x) => (x.term || "").toLowerCase()).filter(Boolean);
  const { data: ae } = await supabase.from("markt_agency_email").select("agency_norm,email");
  const emailMap = new Map((ae ?? []).map((x) => [x.agency_norm, x.email]));

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
        agency_name: agency, agency_email: emailMap.get(agency.toLowerCase().trim()) ?? null,
        url: r.short_url ? `https://flatfox.ch${r.short_url}` : null,
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

  return json({ total, scanned, matched: rows.length, inserted, backfill, bereinigung });
});

// Prueft Flatfox-Eintraege (nicht Seitzmeir/Homegate) und entfernt die, die auf
// Flatfox nicht mehr aktiv sind. Entfernt wird nur bei einer sauberen Antwort
// (HTTP 200 und 0 Treffer); bei Fehlern bleibt der Eintrag stehen.
async function bereinige(supabase, limit) {
  const { data: liste, error } = await supabase.from("markt_radar")
    .select("id, flatfox_pk, raw->>source")
    .is("raw->>source", null)
    .order("geprueft_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) return { fehler: error.message };
  const weg = [], aktiv = [];
  let fehler = 0;
  const queue = [...(liste ?? [])];
  async function arbeiter() {
    while (queue.length) {
      const x = queue.shift();
      try {
        const r = await fetch(`${FLATFOX}?pk=${encodeURIComponent(x.flatfox_pk)}&limit=1`,
          { headers: { "User-Agent": "Mozilla/5.0 (DTHomes ImmoBase MarktRadar)" } });
        if (!r.ok) { fehler++; continue; }
        const d = await r.json();
        const treffer = (d.results ?? []).some((y) => String(y.pk) === String(x.flatfox_pk));
        if (d.count === 0 || (!treffer && (d.results ?? []).length === 0)) weg.push(x.id); else if (treffer) aktiv.push(x.id); else fehler++;
      } catch (_e) { fehler++; }
    }
  }
  await Promise.all(Array.from({ length: 6 }, arbeiter));
  const jetzt = new Date().toISOString();
  for (let i = 0; i < aktiv.length; i += 200) await supabase.from("markt_radar").update({ geprueft_at: jetzt }).in("id", aktiv.slice(i, i + 200));
  for (let i = 0; i < weg.length; i += 200) await supabase.from("markt_radar").delete().in("id", weg.slice(i, i + 200));
  return { geprueft: (liste ?? []).length, entfernt: weg.length, noch_aktiv: aktiv.length, fehler };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2),
    { status, headers: { "Content-Type": "application/json" } });
}
