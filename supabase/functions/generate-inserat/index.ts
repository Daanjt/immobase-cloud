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
    if (!key) return j({ error: "Kein Anthropic-Schluessel hinterlegt (Edge-Function-Secret ANTHROPIC_API_KEY oder app_config.anthropic_api_key)." }, 200);
    if (!model) model = "claude-sonnet-5";

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
    const fmtShort = (v: any): string => { const d = parseDate(v); if (!d) return String(v || "").trim(); const p2 = (n: number) => String(n).padStart(2, "0"); return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)}`; };
    let titelZeitraum = "";
    if (istWG) {
      const endDate = parseDate(p.mietende);
      const langfristig = !!(p.mietende && endDate && startDate && (endDate.getTime() - startDate.getTime()) / 86400000 > 366);
      if (p.mietende && !langfristig) {
        add("Befristet bis", p.mietende);
        titelZeitraum = `befristet von ${fmtShort(freiAb)} bis ${fmtShort(p.mietende)}`;
      } else {
        add("Mietdauer", "unbefristet");
        titelZeitraum = freiAb ? `ab ${fmtShort(freiAb)}` : "unbefristet";
      }
    } else {
      add("Befristet bis", p.mietende);
    }
    if (istWG) {
      const wz = Number(p.wgZimmer) || 0;
      const wgWord: Record<number, string> = { 2: "Zweier-WG", 3: "Dreier-WG", 4: "Vierer-WG", 5: "Fuenfer-WG", 6: "Sechser-WG", 7: "Siebener-WG", 8: "Achter-WG" };
      const zuWort: Record<number, string> = { 2: "zu zweit", 3: "zu dritt", 4: "zu viert", 5: "zu fuenft", 6: "zu sechst", 7: "zu siebt", 8: "zu acht" };
      if (wz >= 2) add("WG-Groesse", `${wz}er-WG, insgesamt ${wz} Personen`);
      add("Moeblierung", "Gemeinschaftsraeume sind moebliert; Zimmer wahlweise moebliert oder unmoebliert mietbar");
      if (wz >= 2) add("Titel-Vorgabe", `WG-Zimmer in ${wz}er-WG${titelZeitraum ? ", " + titelZeitraum : ""}`);
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

    // Aggregate fuer WG: Bereiche Groesse/Miete, Balkon, Anzahl
    if (istWG && roomsArr.length) {
      const toNums = (a: any[]) => a.map((x) => Number(x)).filter((n) => !isNaN(n) && n > 0);
      const grp = (n: number) => (n >= 1000 ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "\u2019") : String(n));
      const qms = toNums(roomsArr.map((r: any) => r.qm));
      const mieten = toNums(roomsArr.map((r: any) => r.miete));
      add("Anzahl ausgeschriebene Zimmer", String(roomsArr.length));
      if (qms.length) { const lo = Math.min(...qms), hi = Math.max(...qms); add("Zimmergroesse", lo === hi ? `ca. ${lo} m\u00b2` : `${lo}\u2013${hi} m\u00b2`); }
      if (mieten.length) { const lo = Math.min(...mieten), hi = Math.max(...mieten); add("Miete", lo === hi ? `CHF ${grp(lo)} pro Monat` : `CHF ${grp(lo)}\u2013${grp(hi)} pro Monat, je nach Zimmer`); }
      if (roomsArr.some((r: any) => r.balkon)) add("Balkon", "teilweise eigener Balkon vorhanden");
    }

    const facts = lines.join("\n");

    const prompt = `Du schreibst ein Wohnungsinserat fuer die Schweizer Plattform Flatfox fuer D&T Homes, einen Anbieter von hochwertigem moebliertem Wohnraum (${istWG ? "hier ein WG-Zimmer" : "hier eine moeblierte Wohnung auf Zeit"}).

Regeln:
- Nutze AUSSCHLIESSLICH die unten gelieferten Fakten. Erfinde nichts: keine erfundene Quadratmeterzahl, keine erfundene Ausstattung, keine erfundenen Preise oder Daten. Fehlt eine Angabe, lass sie weg.
- Zur Lage: schreibe einen individuellen Fliesstext-Absatz, der zur TATSAECHLICHEN Lage der Adresse passt (keine Aufzaehlungspunkte). Nutze dein Wissen ueber das konkrete Quartier und die Umgebung, damit die Beschreibung wirklich zu diesem Ort passt und sich von anderen Lagen unterscheidet: Charakter des Viertels, konkrete und bekannte Verkehrsanbindungen (zum Beispiel bestimmte Tram-, Bus- oder S-Bahn-Verbindungen, nahe Bahnhoefe), Naehe zu See, Fluss, Wald oder Parks, bekannte Orientierungspunkte und was das Gebiet ausmacht. Bleibe bei allgemein bekannten, zutreffenden Merkmalen des Gebiets und erfinde keine konkreten Details wie bestimmte Geschaeftsnamen oder erfundene Distanzen. Erwaehne die Eignung fuer Studierende und Young Professionals und die gute Anbindung an die Zuercher Innenstadt sowie Universitaeten und Hochschulen.
- Schweizer Rechtschreibung (ss statt scharfem s). Warm und einladend, aber sachlich und ehrlich, kein Werbe-Ueberschwang. Keine Emojis, kein Fettdruck, keine Gedankenstriche.
- Halte dich strikt an die Vorlage unten und ihre Reihenfolge. Nenne die Verfuegbarkeit und, falls das Objekt befristet ist, die Befristung immer im oberen Teil (im Einstiegsabsatz).
- Bei einer WG: nenne die WG-Groesse genau wie im Faktum WG-Groesse (zum Beispiel Vierer-WG, insgesamt zu viert). Die Groesse ergibt sich aus der Zahl der Zimmer in der Wohnung, nicht aus belegten Zimmern. Erfinde keine andere Personenzahl.
- Erwaehne bei einer WG die Moeblierung: die Gemeinschaftsraeume sind moebliert, und die Zimmer koennen wahlweise moebliert oder unmoebliert gemietet werden. Behaupte nicht, das Zimmer sei fix moebliert.
- Gehe NICHT davon aus, dass es ein Wohnzimmer oder einen gemeinsamen Wohnbereich gibt. Die meisten unserer WGs haben keines. Erwaehne ein Wohnzimmer nur, wenn es ausdruecklich in den Fakten steht. Kueche und Bad als gemeinsam genutzte Raeume sind bei einer WG in Ordnung.
- Nenne klar, ab wann das Zimmer frei ist (aus dem Faktum "Frei ab"). Uebernimm die Mietdauer exakt aus den Fakten: steht dort "Mietdauer: unbefristet", schreibe, das Zimmer sei unbefristet zu haben; steht ein "Befristet bis"-Datum, nenne dieses Datum klar. Erfinde keine Befristung und wandle das eine nicht ins andere um.
- Schreibe durchgehend in der Du-Form (du, dein, dich, dir), niemals Sie und niemals Ihr.
- Erwaehne die Kaution im Text NICHT. Kein Satz zur Kaution, zu Evorest oder zur Mietkautionsversicherung.
- Der Titel folgt bei einer WG dem Faktum "Titel-Vorgabe", zum Beispiel: WG-Zimmer in 4er-WG, befristet von 01.11.26 bis 31.07.27. Uebernimm ihn im Wesentlichen so, hoechstens rund 70 Zeichen. Bei einer Wohnung auf Zeit: kurzer Titel mit Objektart und Lage.

Nutze die folgende Vorlage als Orientierung fuer Aufbau, Reihenfolge und Ton, mit einer Leerzeile zwischen den Absaetzen. Formuliere jedes Inserat kreativ und deutlich unterschiedlich: variiere Einstieg, Satzbau, Wortwahl und Betonung, sodass sich die Texte spuerbar voneinander unterscheiden und lebendig wirken, nicht wie aus einer Schablone. Struktur, Reihenfolge, Kernaussagen und Fakten bleiben gleich, erfinde nichts dazu und lass nichts Wichtiges weg. Fuelle die eckigen Klammern aus den Fakten und lass optionale Teile weg, wenn dazu keine Angabe vorliegt. Bei nur einem ausgeschriebenen Zimmer nutze die Einzahl, bei mehreren die Bereiche:

Du suchst ein WG-Zimmer in [Ort] mit guter Anbindung an die Innenstadt? An der [Strasse und Hausnummer] vermieten wir [mehrere Zimmer oder ein Zimmer] in einer [Zahl]er-WG. Die Zimmer sind [zwischen A und B oder ca. A] m² gross[ und verfügen teilweise über einen eigenen Balkon]. Verfügbar ab [Datum][, befristet bis [Datum]].

Die Wohnung wird von insgesamt [Anzahl] Personen bewohnt. Küche, Bad und die Gemeinschaftsbereiche sind möbliert und werden gemeinsam genutzt. Das WLAN ist inklusive. Dein eigenes Zimmer kannst du möbliert oder unmöbliert mieten.

Die Lage in [Ort und Quartier] eignet sich ideal für Studierende und Young Professionals. Einkaufsmöglichkeiten, Restaurants und Cafés befinden sich in der Umgebung. Dank der guten ÖV-Anbindung erreichst du die Zürcher Innenstadt sowie Universitäten und Hochschulen schnell und unkompliziert. Auch verschiedene Grün- und Naherholungsgebiete liegen in unmittelbarer Nähe.

Interesse? Die Bewerbung erfolgt unkompliziert online und dauert nur wenige Minuten.


Antworte NUR mit gueltigem JSON, ohne Markdown und ohne weiteren Text, genau in dieser Form:
{"titel": "...", "beschreibung": "..."}
In "beschreibung" werden Absaetze mit \\n\\n getrennt.

FAKTEN:
${facts}`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 2000, output_config: { effort: "medium" }, messages: [{ role: "user", content: prompt }] }),
    });
    const jr = await r.json();
    if (!r.ok) return j({ error: jr?.error?.message || "Anthropic-Fehler" }, 200);

    const blocks = Array.isArray(jr.content) ? jr.content : [];
    let raw = blocks.filter((b: any) => b && b.type === "text").map((b: any) => b.text || "").join("").trim();
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
    if (!titel && !beschreibung) {
      const types = blocks.map((b: any) => b && b.type).join(",") || "keine";
      return j({ error: `Leere Antwort vom Modell (stop=${jr.stop_reason || "?"}, blocks=${types}).` }, 200);
    }
    return j({ titel, beschreibung });
  } catch (e) {
    return j({ error: String(e) }, 200);
  }
});
