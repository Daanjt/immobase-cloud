import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const p = await req.json();
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let key = Deno.env.get("ANTHROPIC_API_KEY") || "";
    let model = "";
    if (!key) {
      const { data: cfg } = await sb.from("app_config").select("key,value").in("key", ["anthropic_api_key", "anthropic_model"]);
      const c: Record<string, string> = {};
      (cfg || []).forEach((r: any) => (c[r.key] = r.value));
      key = c.anthropic_api_key || "";
      model = c.anthropic_model || "";
    }
    if (!key) return j({ error: "Kein Anthropic-Schluessel hinterlegt (Edge-Function-Secret ANTHROPIC_API_KEY oder app_config.anthropic_api_key)." }, 400);
    if (!model) model = "claude-3-5-sonnet-latest";

    // ---- Build a facts block from provided data only (no invented details) ----
    const lines: string[] = [];
    const add = (label: string, val: any) => {
      if (val === null || val === undefined) return;
      const s = String(val).trim();
      if (s) lines.push(`- ${label}: ${s}`);
    };
    const typ = (p.typ || "").toString().toLowerCase();
    const istWG = typ.includes("wg") || (Array.isArray(p.rooms) && p.rooms.length > 0);
    add("Objektart", p.typ);
    add("Adresse", p.adresse);
    add("PLZ / Ort", [p.plz, p.ort].filter(Boolean).join(" "));
    add("Stockwerk", p.stockwerk);
    add("Wohnungsgroesse (Zimmer der ganzen Wohnung)", p.wgGroesse);
    // Verfuegbarkeit und Befristung
    const roomsArr = Array.isArray(p.rooms) ? p.rooms : [];
    const parseDate = (v: any): Date | null => {
      if (!v) return null;
      const t = String(v).trim();
      let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      const d = new Date(t); return isNaN(d.getTime()) ? null : d;
    };
    const roomAvail = roomsArr.map((r: any) => parseDate(r.verfuegbarAb)).filter((d: Date | null) => !!d) as Date[];
    const startDate = roomAvail.length ? new Date(Math.min(...roomAvail.map((d) => d.getTime()))) : parseDate(p.mietbeginn);
    const freiAb = (roomsArr.length && roomsArr[0].verfuegbarAb) ? roomsArr[0].verfuegbarAb : p.mietbeginn;
    add("Frei ab", freiAb);
    if (istWG) {
      const endDate = parseDate(p.mietende);
      if (p.mietende && endDate && startDate && (endDate.getTime() - startDate.getTime()) / 86400000 > 366) {
        add("Mietdauer", "unbefristet");
      } else if (p.mietende) {
        add("Befristet bis", p.mietende);
      } else {
        add("Mietdauer", "unbefristet");
      }
    } else {
      add("Befristet bis", p.mietende);
    }
    add("Kaution", p.kaution ? `CHF ${p.kaution}${p.kautionType ? " (" + p.kautionType + ")" : ""}` : null);
    if (istWG) {
      const wz = Number(p.wgZimmer) || 0;
      const wgWord: Record<number, string> = { 2: "Zweier-WG", 3: "Dreier-WG", 4: "Vierer-WG", 5: "Fuenfer-WG", 6: "Sechser-WG", 7: "Siebener-WG", 8: "Achter-WG" };
      const zuWort: Record<number, string> = { 2: "zu zweit", 3: "zu dritt", 4: "zu viert", 5: "zu fuenft", 6: "zu sechst", 7: "zu siebt", 8: "zu acht" };
      if (wz >= 2) add("WG-Groesse", `${wgWord[wz] || wz + "er-WG"}, man wohnt ${zuWort[wz] || "zu " + wz + "."}`);
      add("Moeblierung", "Gemeinschaftsraeume sind moebliert; Zimmer wahlweise moebliert oder unmoebliert mietbar");
    }

    const rooms = Array.isArray(p.rooms) ? p.rooms : [];
    if (rooms.length) {
      lines.push(istWG ? "- Verfuegbare Zimmer in der WG:" : "- Einheiten:");
      rooms.forEach((r: any, i: number) => {
        const parts: string[] = [];
        if (r.groesse) parts.push(`Bezeichnung ${r.groesse}`);
        if (r.qm) parts.push(`${r.qm} m2`);
        if (r.miete) parts.push(`CHF ${r.miete}/Monat`);
        if (r.balkon) parts.push("mit Balkon");
        if (r.verfuegbarAb) parts.push(`verfuegbar ab ${r.verfuegbarAb}`);
        lines.push(`  ${i + 1}. ${parts.join(", ") || "keine weiteren Angaben"}`);
      });
    } else {
      add("Miete", p.miete ? `CHF ${p.miete}/Monat` : null);
    }

    const facts = lines.join("\n");

    const prompt = `Du schreibst ein Wohnungsinserat fuer die Schweizer Plattform Flatfox fuer D&T Homes, einen Anbieter von hochwertigem moebliertem Wohnraum (${istWG ? "hier ein WG-Zimmer" : "hier eine moeblierte Wohnung auf Zeit"}).

Regeln:
- Nutze AUSSCHLIESSLICH die unten gelieferten Fakten. Erfinde nichts: keine erfundene Quadratmeterzahl, keine erfundene Ausstattung, keine erfundenen Preise oder Daten. Fehlt eine Angabe, lass sie weg.
- Zur Lage darfst du allgemein bekannte, plausible Merkmale der genannten Adresse und des Quartiers nennen (OeV-Anbindung, Naehe zu Zentrum, Uni oder Einkauf), aber nichts Konkretes erfinden.
- Schweizer Rechtschreibung (ss statt scharfem s). Warm und einladend, aber sachlich und ehrlich, kein Werbe-Ueberschwang. Keine Emojis, kein Fettdruck, keine Gedankenstriche.
- Aufbau der Beschreibung in kurzen Absaetzen (getrennt durch eine Leerzeile): 1) einladender Einstieg, 2) ${istWG ? "das Zimmer" : "die Wohnung"} (Groesse, moebliert, Balkon, Preis soweit bekannt), 3) ${istWG ? "die WG: nenne die WG-Groesse aus den Fakten (zum Beispiel Vierer-WG, man wohnt zu viert) und die Moeblierung" : "Ausstattung und Umfeld"}, 4) die Lage, 5) das Wichtigste in Kuerze (Miete, frei ab, Mietdauer, Kaution soweit bekannt), 6) kurzer Hinweis, dass die Bewerbung einfach online laeuft.
- Bei einer WG: nenne die WG-Groesse genau wie im Faktum WG-Groesse (zum Beispiel Vierer-WG, man wohnt zu viert). Die Groesse ergibt sich aus der Zahl der Zimmer in der Wohnung, nicht aus belegten Zimmern. Erfinde keine andere Personenzahl.
- Erwaehne bei einer WG die Moeblierung: die Gemeinschaftsraeume sind moebliert, und die Zimmer koennen wahlweise moebliert oder unmoebliert gemietet werden. Behaupte nicht, das Zimmer sei fix moebliert.
- Gehe NICHT davon aus, dass es ein Wohnzimmer oder einen gemeinsamen Wohnbereich gibt. Die meisten unserer WGs haben keines. Erwaehne ein Wohnzimmer nur, wenn es ausdruecklich in den Fakten steht. Kueche und Bad als gemeinsam genutzte Raeume sind bei einer WG in Ordnung.
- Nenne klar, ab wann das Zimmer frei ist (aus dem Faktum "Frei ab"). Uebernimm die Mietdauer exakt aus den Fakten: steht dort "Mietdauer: unbefristet", schreibe, das Zimmer sei unbefristet zu haben; steht ein "Befristet bis"-Datum, nenne dieses Datum klar. Erfinde keine Befristung und wandle das eine nicht ins andere um.
- Der Titel ist kurz (hoechstens rund 60 Zeichen), konkret und ansprechend und nennt Objektart und Lage.

Antworte NUR mit gueltigem JSON, ohne Markdown und ohne weiteren Text, genau in dieser Form:
{"titel": "...", "beschreibung": "..."}
In "beschreibung" werden Absaetze mit \\n\\n getrennt.

FAKTEN:
${facts}`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
    });
    const jr = await r.json();
    if (!r.ok) return j({ error: jr?.error?.message || "Anthropic-Fehler" }, 502);

    let raw = (jr.content?.[0]?.text || "").trim();
    // strip accidental code fences
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    let titel = "", beschreibung = "";
    try {
      const parsed = JSON.parse(raw);
      titel = (parsed.titel || "").toString().trim();
      beschreibung = (parsed.beschreibung || "").toString().trim();
    } catch (_e) {
      // fallback: return the raw text as description if JSON parsing failed
      beschreibung = raw;
    }
    if (!titel && !beschreibung) return j({ error: "Leere Antwort vom Modell." }, 502);
    return j({ titel, beschreibung });
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
});
