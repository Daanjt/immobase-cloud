import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { parse } from "https://deno.land/std@0.168.0/encoding/csv.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const CSV_URL = "https://daten.statistik.zh.ch/ogd/daten/ressourcen/KTZH_00002982_00006183.csv";

// Zielregion: Stadt Zuerich plus innerer Ring (angelehnt an den Marktradar)
const REGION = new Set([
  "Zürich", "Schlieren", "Dietikon", "Oberengstringen", "Unterengstringen", "Weiningen", "Urdorf",
  "Adliswil", "Kilchberg", "Rüschlikon", "Thalwil", "Horgen", "Langnau am Albis",
  "Zollikon", "Küsnacht", "Zumikon", "Erlenbach", "Wallisellen", "Opfikon", "Dübendorf",
  "Dietlikon", "Wangen-Brüttisellen", "Fällanden", "Regensdorf", "Rümlang", "Kloten",
  "Maur", "Greifensee", "Schwerzenbach", "Volketswil",
]);
const norm = (m: string) => (m || "").replace(/\s*\(ZH\)\s*$/i, "").trim();

// Zwischennutzungs-relevante Vorhaben (Gebaeude wird vor den Arbeiten frei)
function categorize(desc: string): string | null {
  const d = (desc || "").toLowerCase();
  if (d.includes("abbruch") || d.includes("rückbau") || d.includes("rueckbau")) return "Abbruch/Rückbau";
  if (d.includes("ersatzneubau")) return "Ersatzneubau";
  if (d.includes("umnutzung")) return "Umnutzung";
  if (d.includes("gesamtsanier")) return "Gesamtsanierung";
  if (d.includes("umbau")) return "Umbau";
  return null;
}

const orNull = (v: any) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const res = await fetch(CSV_URL);
    if (!res.ok) return j({ error: "Datensatz konnte nicht geladen werden (HTTP " + res.status + ")." }, 200);
    const text = await res.text();

    const records = parse(text, { skipFirstRow: true }) as Record<string, string>[];

    const byPub = new Map<string, any>();
    let scanned = 0;
    for (const r of records) {
      scanned++;
      if (!REGION.has(norm(r["municipality_name"]))) continue;
      const cat = categorize(r["projectDescription"]);
      if (!cat) continue;
      const pub = r["publicationNumber"];
      if (!pub || byPub.has(pub)) continue; // eine Zeile pro Publikation
      const noUid = (r["buildingContractor_noUID"] || "").toLowerCase();
      byPub.set(pub, {
        publication_number: pub,
        ogd_id: orNull(r["id"]),
        publication_date: orNull(r["publicationDate"]),
        entry_deadline: orNull(r["entryDeadline"]),
        municipality: orNull(r["municipality_name"]),
        street: orNull(r["projectLocation_address_street"]),
        house_number: orNull(r["projectLocation_address_houseNumber"]),
        zip: orNull(r["projectLocation_address_swissZipCode"]),
        town: orNull(r["projectLocation_address_town"]),
        project_description: orNull(r["projectDescription"]),
        building_zone: orNull(r["districtCadastre_relation_buildingZone"]),
        category: cat,
        contractor_type: orNull(r["buildingContractor_legalEntity_selectType"]),
        contractor_town: orNull(r["buildingContractor_company_address_town"]),
        contractor_has_uid: noUid === "false" ? true : noUid === "true" ? false : null,
        amtsblatt_url: "https://www.amtsblatt.zh.ch/#!/search/publications/detail/" + pub,
        last_updated: orNull(r["last_updated"]),
        fetched_at: new Date().toISOString(),
      });
    }

    const rows = [...byPub.values()];
    // In Batches upserten; status/notes werden NICHT mitgeschickt und bleiben erhalten
    let saved = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await sb.from("baugesuche").upsert(chunk, { onConflict: "publication_number" });
      if (error) return j({ error: "Speichern fehlgeschlagen: " + error.message, saved }, 200);
      saved += chunk.length;
    }

    return j({ ok: true, scanned, matched: rows.length, saved });
  } catch (e) {
    return j({ error: String(e) }, 200);
  }
});
