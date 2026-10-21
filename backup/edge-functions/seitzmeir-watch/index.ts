// ============================================================
// Supabase Edge Function:  seitzmeir-watch
// D&T Partners GmbH / ImmoBase
//
// Dritte Quelle neben Flatfox und Homegate. Scrapt die
// Mietangebote von seitzmeir.ch und schreibt sie mit
// agency_name='Seitzmeir Immobilien AG' in public.markt_radar.
// Seitzmeir vergibt jedem Objekt bei jedem Scrape eine NEUE
// mieteid, darum wird ueber STRASSE + PLZ + ORT + ZIMMER + PREIS
// dedupliziert (nicht ueber die mieteid). So bleiben zwei
// verschiedene Wohnungen an derselben Adresse getrennt, und auch
// Objekte ohne erkannte Strasse werden nicht mehrfach eingefuegt.
// Aufruf nur mit Service-Key (pg_cron) oder als eingeloggter Admin.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BASE = "https://www.seitzmeir.ch";
const OVERVIEW = BASE + "/immobilien-mietangebote";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const EXCL = /buero|büro|gewerbe|lager|einstellplatz|parkplatz|tiefgarage|abstellplatz|aussenparkplatz|motorrad|mofa|garage|einstellhalle/i;
const INCL = /wohnung|zimmer|attika|maisonette|wohnen|studio|loft/i;
const ROLE = "(?:Vermarktung|Bewirtschaftung|Verkauf|Bewirtschafter\\w*|Vermarkter\\w*|Immobilien\\w*|Leitung\\w*|Team\\w*)";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function istAdminOderServer(req: Request): Promise<boolean> {
  const t = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!t) return false;
  if (t === SERVICE_KEY) return true;
  try {
    const pl = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (pl.role === "service_role") return true;
    if (pl.role !== "authenticated") return false;
  } catch (_) { return false; }
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${t}` } });
  if (!u.ok) return false;
  const email = String((await u.json())?.email || "").toLowerCase();
  if (!email) return false;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/allowed_users?email=ilike.${encodeURIComponent(email)}&select=role`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  const rows = r.ok ? await r.json() : [];
  return rows.some((x: any) => x.role === "admin");
}

const strip = (s: string) => (s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const chf = (s: string) => { const d = (s ?? "").replace(/[^\d]/g, ""); return d ? parseInt(d) : null; };

async function get(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "de-CH,de;q=0.9" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return await r.text();
}

function b64email(html: string): string | null {
  const cands: string[] = [];
  for (const m of html.matchAll(/msg\('([A-Za-z0-9+/=]+)'\)/g)) {
    try { const dec = atob(m[1]); if (/^[^@ ]+@seitzmeir\.ch$/.test(dec)) cands.push(dec); } catch (_e) { /* skip */ }
  }
  return cands.find((c) => c.split("@")[0].includes(".")) ?? cands[0] ?? null;
}

function parseDetail(mid: number, ber: string, html: string) {
  const sd = strip(html);
  const tM = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/); const title = tM ? strip(tM[1]) : "";
  const hi = html.indexOf("<h1"); const pe = html.indexOf("Preise");
  const seg = html.slice(hi, pe > 0 ? pe : hi + 2500);
  let ort: string | null = null, frei: string | null = null, zimmer: number | null = null, preis: number | null = null;
  for (const m of seg.matchAll(/<span[^>]*>([^<]{2,60})<\/span>/g)) {
    const v = strip(m[1]);
    if (v.includes("CHF")) { if (preis === null) preis = chf(v); }
    else if (/^\d{2}\.\d{2}\.\d{4}$/.test(v) || /sofort|Vereinbarung|Verhandlung/i.test(v)) { frei = frei ?? v; }
    else if (/^\d\d?(\.\d)?$/.test(v) && zimmer === null) { zimmer = parseFloat(v); }
    else if (ort === null && /^[A-Za-zÄÖÜäöü.\- ]{2,40}$/.test(v)) { ort = v; }
  }
  const mb = html.match(/Brutto\s*<\/span>\s*<span[^>]*>\s*([^<]+?)\s*<\/span>/); if (mb) preis = chf(mb[1]);
  if (zimmer === null) { const mz = title.match(/(\d+(?:[.,]\d)?)[\s-]*Zimmer/i); if (mz) zimmer = parseFloat(mz[1].replace(",", ".")); }
  const mf = html.match(/(\d{2,4})\s*m²/); const flaeche = mf ? parseInt(mf[1]) : null;
  const ms = html.match(/([A-ZÄÖÜ][a-zäöüA-ZÄÖÜ\-]+(?:strasse|weg|platz|gasse|str\.)\s*\d+[a-z]?)/);
  let strasse: string | null = ms ? strip(ms[1]) : null; if (strasse && /Brunaustrasse 39/.test(strasse)) strasse = null;
  let plz: number | null = null, ort2: string | null = null;
  for (const m of html.matchAll(/\b(\d{4})\s+([A-ZÄÖÜ][a-zäöü]+)/g)) { if (m[1] !== "8002") { plz = parseInt(m[1]); ort2 = m[2]; break; } }
  ort = ort2 ?? ort;
  const befristet = /befrist/i.test(title);
  const cm = sd.match(new RegExp("Kontakt\\s+([A-ZÄÖÜ][a-zäöü]+(?:\\s+[A-ZÄÖÜ][a-zäöü\\-]+){1,3})\\s+" + ROLE));
  let contact: string | null = cm ? cm[1].trim() : null;
  if (contact) contact = contact.replace(/\s+(Team\w*|Leitung\w*|Vermarkt\w*|Bewirtschaft\w*|Verkauf\w*|Immobilien\w*)$/, "").trim();
  const email = b64email(html);
  const pm = sd.match(/Telefon\s*(\+41[\d\s]{8,15})/); const phone = pm ? pm[1].replace(/\s+/g, " ").trim() : null;
  const url = `${BASE}/detailansicht-miete?mieteid=${mid}&bereich=${ber}`;
  return {
    flatfox_pk: mid, strasse, plz, ort, object_category: "APARTMENT", zimmer, flaeche, preis,
    frei_ab: frei, agency_name: "Seitzmeir Immobilien AG", url, ff_created: new Date().toISOString(),
    gesehen: false, status: "act", befristet, agency_email: email, agency_contact_name: contact,
    raw: { source: "seitzmeir", mieteid: mid, title, phone },
  };
}

Deno.serve(async (req) => {
  if (!(await istAdminOderServer(req))) return new Response(JSON.stringify({ error: "Nicht berechtigt" }), { status: 403, headers: { "Content-Type": "application/json" } });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const errors: string[] = [];
  let scanned = 0; const rows: any[] = [];
  try {
    const ov = await get(OVERVIEW);
    const seen = new Set<string>();
    for (const L of ov.matchAll(/detailansicht-miete\?mieteid=(\d+)&bereich=(\d+)#([^"]+)/g)) {
      const mid = L[1], ber = L[2], slug = L[3];
      if (seen.has(mid)) continue; seen.add(mid);
      const tg = slug.replace(/-/g, " ");
      if (EXCL.test(tg) || !INCL.test(tg)) continue;
      scanned++;
      try {
        const d = await get(`${BASE}/detailansicht-miete?mieteid=${mid}&bereich=${ber}`);
        rows.push(parseDetail(parseInt(mid), ber, d));
      } catch (e) { errors.push(`${mid}: ${e instanceof Error ? e.message : e}`); }
      await new Promise((r) => setTimeout(r, 250));
    }
  } catch (e) { errors.push(`overview: ${e instanceof Error ? e.message : e}`); }

  let inserted = 0, refreshed = 0;
  if (rows.length) {
    // Dedup ueber Strasse + PLZ + Ort + Zimmer + Preis. Seitzmeir rotiert die mieteid
    // pro Scrape; nur wenn diese Merkmale uebereinstimmen, gilt es als dasselbe Objekt
    // (Neu-Listung) und wird aktualisiert, sonst neu eingefuegt. Gilt auch fuer Objekte
    // ohne erkannte Strasse (dann PLZ + Ort + Zimmer + Preis).
    const key = (r: any) => `${String(r.strasse ?? "").toLowerCase().trim()}|${r.plz ?? ""}|${String(r.ort ?? "").toLowerCase().trim()}|${r.zimmer ?? ""}|${r.preis ?? ""}`;
    const { data: existing } = await supabase.from("markt_radar")
      .select("id, strasse, plz, ort, zimmer, preis").eq("agency_name", "Seitzmeir Immobilien AG");
    const byKey = new Map<string, any>();
    (existing ?? []).forEach((e: any) => { byKey.set(key(e), e); });
    const toInsert: any[] = [];
    for (const row of rows) {
      const k = key(row);
      const ex = byKey.get(k);
      if (ex && ex.id) {
        await supabase.from("markt_radar").update({
          url: row.url, frei_ab: row.frei_ab, flaeche: row.flaeche, strasse: row.strasse,
          agency_email: row.agency_email, agency_contact_name: row.agency_contact_name,
          status: row.status, raw: row.raw,
        }).eq("id", ex.id);
        refreshed++;
      } else {
        toInsert.push(row);
        byKey.set(k, { id: null });
      }
    }
    if (toInsert.length) {
      const { error, count } = await supabase.from("markt_radar")
        .upsert(toInsert, { onConflict: "flatfox_pk", ignoreDuplicates: true, count: "exact" });
      if (error) errors.push(`db: ${error.message}`); else inserted = count ?? 0;
    }
  }
  try {
    await supabase.from("flatfox_watch_state").update({
      seitzmeir_last_run: new Date().toISOString(),
      seitzmeir_error: errors.length ? errors.join(" | ") : null,
    }).eq("id", 1);
  } catch (_e) { /* state optional */ }

  return new Response(JSON.stringify({ scanned, matched: rows.length, inserted, refreshed, errors }, null, 2),
    { status: 200, headers: { "Content-Type": "application/json" } });
});
