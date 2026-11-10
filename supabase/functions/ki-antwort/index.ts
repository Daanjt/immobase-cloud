// ki-antwort - Antwortvorschlag für Interessenten (WhatsApp / Inserate) aus KI-Wissen + Live-Angebot.
// Nur Admin oder Service-Key. Body: { nachricht, verlauf?: [{von:"kunde"|"wir", text}], kanal?: "whatsapp" }
// Antwort: { antwort, eskalieren, grund, sprache }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { istAdminOderServer, verweigert } from "../_shared/auth.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function pd(s: any): Date | null {
  const t = String(s || "").trim(); if (!t) return null;
  let m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return null;
}
const fd = (d: Date) => `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
const slug = (a: any) => String(a.adresse || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") + "-" + String(a.id).toLowerCase();

// gleiche Logik wie die Website: welche Zimmer/Wohnungen sind ausgeschrieben
function istFrei(r: any, a: any) {
  if (!a || r.nachmieter_gesetzt) return false;
  const ov = r.ausschreib_override || "auto";
  if (ov === "ja") return true; if (ov === "nein") return false;
  if (a.nicht_ausschreiben) return false;
  if (!r.occupied) return true;
  if (a.ausschreiben) return true;
  const aus = pd(r.mieter_auszug), ende = pd(a.mietende);
  if (!aus || (ende && aus >= ende)) return false;
  const h = new Date(); h.setHours(0, 0, 0, 0);
  return h >= new Date(aus.getTime() - 45 * 86400000);
}

async function angebot(sb: any): Promise<string> {
  const [{ data: rooms }, { data: apts }] = await Promise.all([
    sb.from("rooms").select("id, apt_id, occupied, miete, balkon, qm, ausschreib_override, mieter_auszug, moebliert, nachmieter_gesetzt"),
    sb.from("apartments").select("id, type, adresse, plz, ort, zimmer, stockwerk, flaeche, merkmale, matterport_url, mietbeginn, mietende, immer_befristet, ausschreiben, nicht_ausschreiben, vermietungsart, pipeline").eq("type", "WG"),
  ]);
  const amap: Record<string, any> = {}; (apts || []).forEach((a: any) => { amap[a.id] = a; }); // wie Website: auch Objekte in der Pipeline, sofern ausgeschrieben
  const h = new Date(); h.setHours(0, 0, 0, 0);
  const zeilenWg: string[] = [], zeilenWhg: string[] = [];
  for (const r of rooms || []) {
    const a = amap[r.apt_id]; if (!istFrei(r, a)) continue;
    let ab = "sofort";
    if (r.occupied) { const aus = pd(r.mieter_auszug); if (aus) ab = fd(new Date(aus.getTime() + 86400000)); }
    else { const mb = pd(a.mietbeginn); if (mb && mb > h) ab = fd(mb); }
    const ende = pd(a.mietende);
    const dauer = ende ? `befristet bis ${fd(ende)}` : "unbefristet";
    const ort = `${a.adresse}, ${[a.plz, a.ort].filter(Boolean).join(" ")}`;
    // Wohnung beginnt bei uns erst in der Zukunft: neu übernommen und noch bewohnt
    const mbW = pd(a.mietbeginn);
    const neu = mbW && mbW > h ? ` HINWEIS NOCH BEWOHNT: Verfügbar ab ${fd(mbW)}, aktuell noch bewohnt. Besichtigung vor Ort erst kurz vor Mietbeginn möglich. Nicht erwähnen, dass wir die Wohnung übernehmen oder anmieten, nur ab wann sie verfügbar ist (Rücktrittsklausel und Zahlung erst nach Besichtigung kurz erwähnen).` : "";
    if (a.vermietungsart === "wohnung") {
      zeilenWhg.push(`- Wohnung ${a.zimmer || ""} Zimmer, ${a.flaeche ? a.flaeche + " m², " : ""}${a.stockwerk || ""}, ${ort}: CHF ${r.miete} brutto pro Monat (zzgl. Strom CHF 25 pro Person), frei ab ${ab}, ${dauer}. Link: www.dthomes.ch/wohnungen/${slug(a)}${neu}`);
    } else {
      zeilenWg.push(`- WG-Zimmer ${r.qm ? r.qm + " m²" : ""}${r.balkon ? " mit Balkon" : ""} in einer ${a.zimmer || ""}-Zimmer-WG, ${ort}: CHF ${r.miete} pro Monat inkl. Nebenkosten (zzgl. Strom CHF 25), frei ab ${ab}, ${dauer}. Link: www.dthomes.ch/zimmer/${slug(a)}${neu}`);
    }
  }
  return `Freie WG-Zimmer (Stand heute ${fd(h)}):\n${zeilenWg.join("\n") || "- keine"}\n\nFreie Wohnungen:\n${zeilenWhg.join("\n") || "- keine"}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await istAdminOderServer(req))) return verweigert(CORS);
  try {
    const b = await req.json().catch(() => ({}));
    const nachricht = String(b.nachricht || "").trim().slice(0, 4000);
    if (!nachricht) return json({ error: "nachricht fehlt" }, 400);
    const verlauf = Array.isArray(b.verlauf) ? b.verlauf.slice(-12) : [];
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: cfg } = await sb.from("app_config").select("key,value").in("key", ["anthropic_api_key", "anthropic_model"]);
    const c: Record<string, string> = Object.fromEntries((cfg || []).map((r: any) => [r.key, r.value]));
    c.anthropic_api_key = Deno.env.get("ANTHROPIC_API_KEY") || c.anthropic_api_key || "";
    c.anthropic_model = Deno.env.get("ANTHROPIC_MODEL") || c.anthropic_model || "claude-sonnet-5";
    if (!c.anthropic_api_key) return json({ error: "Kein Anthropic-Schlüssel hinterlegt" }, 400);
    const { data: wissen } = await sb.from("ki_wissen").select("titel, inhalt").eq("aktiv", true).order("sort");
    const wissenText = (wissen || []).map((w: any) => `## ${w.titel}\n${w.inhalt}`).join("\n\n");
    const live = await angebot(sb);

    // Sprache der Nachricht grob erkennen, damit die Antwort sicher in der richtigen Sprache kommt
    const w = (re: RegExp) => (nachricht.toLowerCase().match(re) || []).length;
    const en = w(/\b(the|and|is|are|can|you|my|we|please|hello|hi|thanks|available|room|rent|together|would|what|how)\b/g);
    const de = w(/\b(und|ist|ich|das|der|die|nicht|ein|eine|bitte|hallo|danke|kann|wie|wann|zimmer|wohnung|möchte|gerne)\b/g);
    const sprache = en > de ? "en" : "de";
    const system = `Du bist der Assistent von D&T Homes und beantwortest Nachrichten von Wohnungs- und Zimmer-Interessenten per WhatsApp.
WICHTIG: Schreibe die Antwort immer in der Sprache der letzten Nachricht des Interessenten. Schreibt er Englisch, antworte vollständig auf Englisch; schreibt er Deutsch, auf Deutsch (du-Form). Andere Sprachen: Englisch.
Halte dich strikt an das hinterlegte Wissen und die Live-Daten unten. Erfinde nichts. Wenn eine Frage damit nicht sicher beantwortet werden kann, oder wenn sie unter "Offene Punkte" fällt, setze "eskalieren": true und schreibe nur eine kurze, freundliche Zwischenantwort (wir klären das und melden uns).
Gib deine Antwort immer über das Werkzeug "antwort_senden" zurück (antwort, eskalieren, grund, sprache). "grund" ist eine kurze interne Notiz für das Team (Deutsch), warum eskaliert wird oder welche Quellen du genutzt hast.

# Hinterlegtes Wissen
${wissenText}

# Live-Daten aus ImmoBase
${live}

# Antwortsprache
${sprache === "en" ? "Die Nachricht ist auf Englisch. Schreibe die Antwort ausschliesslich auf Englisch, auch wenn das Wissen oben auf Deutsch ist, und setze \"sprache\": \"en\"." : "Die Nachricht ist auf Deutsch (oder unklar). Schreibe die Antwort auf Deutsch in der du-Form, ausser die Nachricht ist eindeutig in einer anderen Sprache, dann auf Englisch."}`;

    const messages: any[] = [];
    for (const v of verlauf) { const t = String(v?.text || "").trim(); if (t) messages.push({ role: v.von === "wir" ? "assistant" : "user", content: t.slice(0, 2000) }); }
    while (messages.length && messages[0].role === "assistant") messages.shift();
    // aufeinanderfolgende gleiche Rollen zusammenfassen
    const msgs: any[] = [];
    for (const m of [...messages, { role: "user", content: nachricht }]) {
      if (msgs.length && msgs[msgs.length - 1].role === m.role) msgs[msgs.length - 1].content += "\n" + m.content; else msgs.push({ ...m });
    }
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": c.anthropic_api_key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: c.anthropic_model, max_tokens: 1200, system, messages: msgs,
        tools: [{
          name: "antwort_senden",
          description: "Die Antwort an den Interessenten zurückgeben.",
          input_schema: { type: "object", properties: {
            antwort: { type: "string", description: "Text der WhatsApp-Antwort an den Interessenten" },
            eskalieren: { type: "boolean", description: "true, wenn das Team übernehmen soll" },
            grund: { type: "string", description: "Kurze interne Notiz auf Deutsch" },
            sprache: { type: "string", enum: ["de", "en"] },
          }, required: ["antwort", "eskalieren", "grund", "sprache"] },
        }],
        tool_choice: { type: "tool", name: "antwort_senden" },
      }),
    });
    const j = await r.json();
    if (!r.ok) return json({ error: "KI-Fehler: " + JSON.stringify(j).slice(0, 300) }, 502);
    let out: any = (j.content || []).find((x: any) => x.type === "tool_use")?.input || null;
    if (!out || typeof out.antwort !== "string") {
      // Rückfall: Freitext oder JSON im Text
      const text = (j.content || []).map((x: any) => x.text || "").join("").trim();
      try { out = JSON.parse(text.replace(/^```(json)?|```$/g, "").trim()); } catch { const m = text.match(/\{[\s\S]*\}/); if (m) try { out = JSON.parse(m[0]); } catch { /* */ } }
      if ((!out || typeof out.antwort !== "string") && text) out = { antwort: text, eskalieren: true, grund: "Antwort ohne Struktur, bitte prüfen", sprache };
    }
    if (!out || typeof out.antwort !== "string" || !out.antwort.trim()) return json({ error: "Antwort nicht lesbar" }, 502);
    // Sicherheitsnetz: Gedankenstriche entfernen, interne Zimmer-IDs nie nach aussen
    out.antwort = out.antwort.replace(/\s[–—]\s/g, ", ").replace(/[–—]/g, "-");
    if (/\bA\d{1,3}-\d{1,2}\b/.test(out.antwort)) { out.eskalieren = true; out.grund = (out.grund || "") + " | interne Zimmer-ID in Antwort"; }
    return json({ antwort: out.antwort, eskalieren: !!out.eskalieren, grund: out.grund || "", sprache: out.sprache || "de" });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
