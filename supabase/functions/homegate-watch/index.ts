// ============================================================
// Supabase Edge Function:  homegate-watch
// D&T Partners GmbH / ImmoBase
//
// Zweite Quelle neben Flatfox. Ruft die Homegate-Anbieterseiten
// der von Bilaya genutzten Verwaltungen ab, gleicht per Adresse
// gegen die Watchlist ab und schreibt Treffer mit quelle='homegate'
// in flatfox_treffer. Best-Effort: Homegate hat Bot-Schutz, bei
// Blockade wird der Fehler in flatfox_watch_state vermerkt.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Verwaltungen: [Anzeigename, Homegate-Anbieter-ID, Slug]
const ANBIETER: [string, string, string][] = [
  ["H&B Real Estate AG", "hau", "h-b-real-estate-ag"],
  ["BODAG Immobilien AG", "x080", "bodag-immobilien-ag"],
  ["Weber + Schweizer Immob.-Treuh. AG", "n017wemy", "weber-schweizer-immobilien-treuhand-ag"],
];
const MAX_PAGES = 45;

const RESIDENTIAL = new Set([
  "APARTMENT","HOUSE","ATTIC","DUPLEX","STUDIO","ROOF_FLAT","MAISONETTE",
  "TERRACE_FLAT","FURNISHED_FLAT","SINGLE_ROOM","LOFT","VILLA","ATTIC_FLAT","FLAT","CHALET",
]);

function norm(s: string): string {
  return (s ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/strasse/g, "str").replace(/str\./g, "str")
    .replace(/[^a-z0-9]/g, "");
}
const streetKey = (raw: string) => norm((raw ?? "").split(/\d/)[0]);
const houseNums = (raw: string) =>
  ((raw ?? "").match(/\d+\s*[a-zA-Z]?/g) || []).map((x) => x.replace(/\s+/g, "").toLowerCase());

function extractListings(html: string): any[] {
  const key = '"listings"';
  const start = html.indexOf(key);
  if (start < 0) return [];
  let i = html.indexOf("[", start);
  if (i < 0) return [];
  let depth = 0, instr = false, esc = false;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { instr = !instr; }
    else if (!instr) {
      if (c === "[") depth++;
      else if (c === "]") { depth--; if (depth === 0) {
        try { return JSON.parse(html.slice(i, j + 1)); } catch { return []; }
      } }
    }
  }
  return [];
}

async function fetchPage(aid: string, slug: string, ep: number): Promise<string> {
  const url = `https://www.homegate.ch/anbieter/${aid}/${slug}` + (ep > 1 ? `?ep=${ep}` : "");
  const r = await fetch(url, { headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Accept-Language": "de-CH,de;q=0.9",
  } });
  if (!r.ok) throw new Error(`homegate ${r.status} ${aid} ep${ep}`);
  return await r.text();
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: wl, error: wlErr } = await supabase
    .from("flatfox_watch_objekt").select("id, strasse_norm, plz, hausnummern").eq("aktiv", true);
  if (wlErr) return json({ error: wlErr.message }, 500);
  const byKey = new Map<string, { objId: number; nums: Set<string> }>();
  for (const o of wl ?? []) {
    const k = `${o.strasse_norm}|${o.plz}`;
    let e = byKey.get(k);
    if (!e) { e = { objId: o.id, nums: new Set() }; byKey.set(k, e); }
    for (const n of houseNums(o.hausnummern)) e.nums.add(n);
  }

  const treffer: any[] = [];
  let scanned = 0;
  const errors: string[] = [];

  for (const [name, aid, slug] of ANBIETER) {
    try {
      const html1 = await fetchPage(aid, slug, 1);
      const totM = html1.match(/"(?:totalCount|resultCount|numberOfListings|hitCount|itemCount)"\s*:\s*(\d+)/);
      const total = totM ? parseInt(totM[1]) : 8;
      const pages = Math.min(Math.ceil(total / 8), MAX_PAGES);
      const seen = new Set<string>();
      for (let ep = 1; ep <= pages; ep++) {
        const html = ep === 1 ? html1 : await fetchPage(aid, slug, ep);
        for (const L of extractListings(html)) {
          const lid = String(L.id ?? "");
          if (!lid || seen.has(lid)) continue;
          seen.add(lid); scanned++;
          const lst = L.listing ?? {};
          const a = lst.address ?? {};
          const plz = parseInt(a.postalCode);
          if (!plz) continue;
          const off = String(lst.offerType ?? "RENT").toUpperCase();
          if (off !== "RENT") continue;
          const cats = (lst.categories ?? []).map((c: string) => c.toUpperCase());
          if (cats.length && !cats.some((c: string) => RESIDENTIAL.has(c))) continue;
          const e = byKey.get(`${streetKey(a.street)}|${plz}`);
          if (!e) continue;
          const ln = houseNums(a.street);
          if (ln.length && !ln.some((n) => e.nums.has(n))) continue;
          const ch = lst.characteristics ?? {};
          const rent = (lst.prices ?? {}).rent ?? {};
          treffer.push({
            flatfox_pk: Number(lid), quelle: "homegate", watch_objekt_id: e.objId,
            strasse: a.street, plz, ort: a.locality,
            object_category: cats[0] ?? null, zimmer: ch.numberOfRooms ?? null,
            preis: rent.gross ?? rent.net ?? null, offer_type: "RENT",
            agency_name: name, url: `https://www.homegate.ch/mieten/${lid}`,
            ff_created: new Date().toISOString(), status: "act",
          });
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : e}`);
    }
  }

  let inserted = 0;
  if (treffer.length) {
    const { error, count } = await supabase.from("flatfox_treffer")
      .upsert(treffer, { onConflict: "flatfox_pk", ignoreDuplicates: true, count: "exact" });
    if (error) errors.push(`db: ${error.message}`);
    else inserted = count ?? 0;
  }

  const blocked = scanned === 0 && errors.length > 0;
  await supabase.from("flatfox_watch_state").update({
    homegate_last_run: new Date().toISOString(),
    homegate_error: errors.length ? errors.join(" | ") : null,
  }).eq("id", 1);

  return json({ scanned, matched: treffer.length, inserted, blocked, errors });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2),
    { status, headers: { "Content-Type": "application/json" } });
}
