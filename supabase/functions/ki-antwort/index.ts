// ki-antwort - Antwortvorschlag für Interessenten (WhatsApp / Inserate) aus KI-Wissen + Live-Angebot.
// Nur Admin oder Service-Key. Body: { nachricht, verlauf?: [{von:"kunde"|"wir", text}], kanal?: "whatsapp" }
// Antwort: { antwort, eskalieren, senden, grund, sprache }
import { elev8Verbinden } from "../_shared/elev8.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { istAdminOderServer, verweigert } from "../_shared/auth.ts";
import { normTelefon } from "../_shared/whatsapp.ts";

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



const PORTAL = "https://mieter.dthomes.ch";
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const chfF = (n: any) => `CHF ${Number(n || 0).toLocaleString("de-CH", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/[’\u2019]/g, "'")}`;
// Eigene Daten des Mieters (nur seine eigenen, nie die von anderen)
async function mieterDaten(sb: any, t: any): Promise<string> {
  const [{ data: pay }, { data: kue }, { data: hp }, { data: vt }] = await Promise.all([
    sb.from("payments").select("jahr, monat, betrag_soll, betrag_ist, status, mahnung_1_sent_at").eq("tenant_id", t.id).eq("status", "offen").order("jahr").order("monat").limit(12),
    sb.from("kuendigungen").select("art, datum, status, created_at").eq("tenant_id", t.id).order("created_at", { ascending: false }).limit(1),
    sb.from("handover_protocols").select("type, status, deadline, token").eq("tenant_id", t.id).in("status", ["sent", "in_progress"]).limit(3),
    sb.from("contracts").select("contract_type, status, sent_at, signed_at, countersigned_at, created_at").or(`tenant_id.eq.${t.id}${t.email ? `,mieter_email.ilike.${String(t.email).replace(/[,()]/g, "")}` : ""}`).neq("contract_type", "parkplatz").not("status", "in", "(zurueckgezogen,storniert,abgelaufen)").order("created_at", { ascending: false }).limit(1),
  ]);
  const h = new Date();
  const c = vt && vt[0];
  const dz = (x: any) => x ? fd(new Date(x)) : "";
  const vertragZeile = !c ? "" : c.status === "signiert"
    ? `Mietvertrag: vollständig unterschrieben (Mieter am ${dz(c.signed_at)}, von uns gegengezeichnet am ${dz(c.countersigned_at)}). Der unterschriebene Vertrag wurde ihm per E-Mail zugeschickt; er findet ihn auch im Mieterportal unter Dokumente.`
    : c.status === "mieter_signiert" ? `Mietvertrag: von ihm am ${dz(c.signed_at)} unterschrieben, unsere Gegenzeichnung folgt in Kürze; danach erhält er den unterschriebenen Vertrag per E-Mail.`
    : `Mietvertrag: am ${dz(c.sent_at || c.created_at)} per E-Mail zum digitalen Unterschreiben verschickt, noch nicht unterschrieben (Link in der E-Mail).`;
  const offen = (pay || []).filter((p: any) => new Date(p.jahr, p.monat - 1, 1) <= h);
  const z: string[] = [];
  if (vertragZeile) z.push(vertragZeile);
  z.push(`Eigene Mietdaten: Einzug ${t.einzug || "-"}${t.auszug ? `, Mietende ${t.auszug}` : ", unbefristet bzw. kein Auszug erfasst"}${t.mietzins ? `, Miete ${chfF(t.mietzins)} pro Monat` : ""}${t.strom ? ` plus Strom ${chfF(t.strom)}` : ""}.`);
  if (t.kaution_betrag) z.push(`Kaution: ${chfF(t.kaution_betrag)}${t.kaution_art ? ` (${t.kaution_art})` : ""}, ${t.kaution_eingegangen_am ? `eingegangen am ${fd(pd(t.kaution_eingegangen_am) || new Date(t.kaution_eingegangen_am))}` : "Eingang im System nicht vermerkt (das Feld wird nicht immer gepflegt: sag dem Mieter NICHT, dass die Kaution fehlt, sondern dass wir es prüfen, und setze \"eskalieren\": true)"}.`);
  z.push(offen.length ? `Offene Mietzahlungen laut unserer Buchhaltung: ${offen.map((p: any) => `${MONATE[p.monat - 1]} ${p.jahr} (${chfF(p.betrag_soll - (p.betrag_ist || 0))} offen${p.mahnung_1_sent_at ? ", gemahnt" : ""})`).join(", ")}. Zahlungen der letzten Tage sind evtl. noch nicht verbucht.` : "Offene Mietzahlungen: keine.");
  if (kue && kue[0]) z.push(`Kündigung: ${kue[0].art || "Kündigung"} per ${kue[0].datum || "-"}, Status ${kue[0].status}.`);
  for (const p of hp || []) z.push(`Offenes ${p.type === "auszug" ? "Abgabeprotokoll" : "Übernahmeprotokoll"}${p.deadline ? ` (bis ${fd(new Date(p.deadline))})` : ""}: ${PORTAL}/uebernahme/${p.token}`);
  if (t.portal_token) z.push(`Persönlicher Link zum Mieterportal (Schäden melden, Dokumente, Kündigung, Namensschild): ${PORTAL}/p/${t.portal_token}`);
  return z.join("\n");
}
// Bewerber: Stand der eigenen Bewerbung
async function bewerberKontext(sb: any, tel: string): Promise<string> {
  const { data: as } = await sb.from("applicants").select("id, vorname, phone, status, zimmer_wunsch, zugeteiltes_zimmer, einzug, eingereicht_am, created_at").order("created_at", { ascending: false }).limit(1000);
  const a = (as || []).find((x: any) => normTelefon(x.phone) === tel);
  if (!a) return "";
  const { data: vt } = await sb.from("contracts").select("status, sent_at, signed_at, countersigned_at, created_at").eq("bewerber_id", a.id).not("status", "in", "(zurueckgezogen,storniert,abgelaufen)").order("created_at", { ascending: false }).limit(1);
  const c = vt && vt[0];
  const vz = !c ? "" : c.status === "signiert" ? " Vertrag: vollständig unterschrieben, der unterschriebene Vertrag wurde per E-Mail zugeschickt."
    : c.status === "mieter_signiert" ? " Vertrag: von ihm unterschrieben, unsere Gegenzeichnung folgt in Kürze, danach kommt der Vertrag per E-Mail."
    : ` Vertrag: am ${fd(new Date(c.sent_at || c.created_at))} per E-Mail zum digitalen Unterschreiben verschickt, noch nicht unterschrieben.`;
  const rid = a.zugeteiltes_zimmer || a.zimmer_wunsch;
  const { data: r } = rid ? await sb.from("rooms").select("apt_id").eq("id", rid).maybeSingle() : { data: null };
  const { data: ap } = r ? await sb.from("apartments").select("adresse, ort, vermietungsart").eq("id", r.apt_id).maybeSingle() : { data: null };
  const stand: Record<string, string> = { Neu: "eingegangen, wird geprüft", Zugeteilt: "positiv, ein Zimmer bzw. eine Wohnung ist zugeteilt", "Bestätigt": "bestätigt", Abgelehnt: "abgesagt" };
  return `# Absender
Die Nachricht kommt von jemandem, der sich bei uns beworben hat (Vorname ${a.vorname || "-"}), am ${fd(new Date(a.eingereicht_am || a.created_at))}${ap ? ` für ${ap.vermietungsart === "wohnung" ? "die Wohnung" : "ein Zimmer"} an der ${ap.adresse}` : ", ohne bestimmtes Zimmer"}${a.einzug ? `, gewünschter Einzug ${a.einzug}` : ""}. Stand der Bewerbung: ${stand[a.status] || a.status}.${vz}
Regeln für Bewerber (Ziel: Vertrag unterschreiben lassen, du bist im Verkauf):
- Bestätigt der Bewerber sein Interesse (z.B. "ja, noch aktuell" auf unsere Nachricht) oder fragt nach den nächsten Schritten, schreib NICHT "wir prüfen deine Bewerbung", sondern treib es aktiv Richtung Vertrag: Freu dich, und biete an, ihm den Untermietvertrag schon zuzuschicken. Mit seiner Unterschrift ist das Zimmer für ihn reserviert. Ist das Zimmer noch bewohnt: Besichtigung vor Ort ist kurz vor Einzug möglich, er muss vorher nichts bezahlen und kann bis und mit Besichtigung zurücktreten, falls es wesentlich von Fotos, Grundriss und 3D-Rundgang abweicht. Schlag als Einzug immer das Datum vor, ab dem das Zimmer frei ist (aus den Live-Daten, "frei ab"), auch wenn er bei der Bewerbung ein späteres Datum angegeben hat: Ein leeres Zimmer kostet uns Miete. Frag aktiv, ob dieser frühere Einzug für ihn passt. Diese Nachricht immer senden ("senden": true), auch wenn er ursprünglich ein anderes Datum wollte. Will er trotzdem später einziehen, sag nicht zu, sondern setze "eskalieren": true (das Team entscheidet). Frag, ob wir den Vertrag schicken dürfen. Setze dann "senden": true und "eskalieren": true (das Team schickt den Vertrag).
- Sagt er ja zum Vertrag, bestätige, dass wir ihn gleich vorbereiten und per E-Mail schicken ("senden": true, "eskalieren": true).
- Nie schreiben, dass er das Zimmer sicher bekommt, bevor der Vertrag unterschrieben ist. Bei einer abgesagten Bewerbung nichts dazu sagen und "senden": false.`;
}
// Absender ist aktueller Mieter? Dann Wohnung + Schadenmeldungen dieser Wohnung (ohne Namen der Mitbewohner)
const SM_STATUS: Record<string, string> = { neu: "eingegangen, noch nicht bearbeitet", in_arbeit: "in Bearbeitung", erledigt: "erledigt" };
async function mieterKontext(sb: any, telefon: string): Promise<string> {
  const tel = normTelefon(telefon); if (!tel) return "";
  const { data: ts } = await sb.from("tenants").select("id, vorname, nachname, email, phone, apt_id, room_id, einzug, auszug, mietzins, strom, kaution_betrag, kaution_art, kaution_eingegangen_am, portal_token").eq("status", "aktiv").is("deleted_at", null);
  let t = (ts || []).find((x: any) => normTelefon(x.phone) === tel);
  let andereNummer = false;
  if (!t) {
    // schreibt von einer anderen Nummer? Gleiche Person, wenn eine Bewerbung mit dieser Nummer denselben Vor- und Nachnamen hat wie ein aktiver Mieter
    const { data: as } = await sb.from("applicants").select("vorname, nachname, phone").order("created_at", { ascending: false }).limit(1000);
    const nm = (x: any) => `${String(x?.vorname || "").trim()} ${String(x?.nachname || "").trim()}`.toLowerCase().replace(/\s+/g, " ");
    const a = (as || []).find((x: any) => normTelefon(x.phone) === tel);
    if (a && nm(a).length > 3) { t = (ts || []).find((x: any) => nm(x) === nm(a)); andereNummer = !!t; }
  }
  if (!t) return await bewerberKontext(sb, tel);
  const { data: rm } = await sb.from("rooms").select("id, apt_id").or(`tenant_id.eq.${t.id}${t.room_id ? `,id.eq.${t.room_id}` : ""}`).limit(1);
  const aptId = t.apt_id || rm?.[0]?.apt_id || null;
  const { data: ap } = aptId ? await sb.from("apartments").select("adresse, plz, ort").eq("id", aptId).maybeSingle() : { data: null };
  const seit = new Date(Date.now() - 90 * 86400000).toISOString();
  const q = sb.from("schadenmeldungen").select("tenant_id, titel, beschreibung, ort_im_objekt, status, created_at, erledigt_at, weitergeleitet_at, antwort").gte("created_at", seit).order("created_at", { ascending: false }).limit(15);
  const { data: sm } = aptId ? await q.or(`apt_id.eq.${aptId},tenant_id.eq.${t.id}`) : await q.eq("tenant_id", t.id);
  const z = (sm || []).map((x: any) => `- «${x.titel}»${x.ort_im_objekt ? ` (${x.ort_im_objekt})` : ""}, gemeldet am ${fd(new Date(x.created_at))} ${x.tenant_id === t.id ? "von ihm/ihr selbst" : "von einer Mitbewohnerin bzw. einem Mitbewohner"}, Status: ${SM_STATUS[x.status] || x.status}${x.weitergeleitet_at ? `, am ${fd(new Date(x.weitergeleitet_at))} an die Verwaltung weitergeleitet` : ""}${x.antwort ? `, unsere letzte Rückmeldung: ${String(x.antwort).slice(0, 300)}` : ""}${x.beschreibung ? `. Beschreibung: ${String(x.beschreibung).slice(0, 300)}` : ""}`);
  return `# Absender
Die Nachricht kommt von einem aktuellen Mieter bzw. einer aktuellen Mieterin von D&T Homes (Vorname ${t.vorname || "-"}${ap ? `, wohnt an der ${ap.adresse}, ${[ap.plz, ap.ort].filter(Boolean).join(" ")}` : ""}). Es ist kein Interessent.${andereNummer ? " (Er schreibt von einer anderen Nummer als der bei uns hinterlegten; erkannt über seine frühere Bewerbung mit dieser Nummer.)" : ""}
${await mieterDaten(sb, t)}
Schadenmeldungen dieser Wohnung (letzte 90 Tage):
${z.join("\n") || "- keine"}
Regeln für Mieter: Nutze die eigenen Mietdaten oben, um Fragen zu Miete, Kaution, Zahlungen, Kündigung und Protokollen direkt zu beantworten, und schick bei Bedarf den persönlichen Link zum Mieterportal. Gib nie Daten anderer Mieter heraus. Bei Streitfragen zu Zahlungen, Kündigungen oder Kaution-Rückzahlung setze "eskalieren": true. Geht es um einen Schaden oder Defekt, der oben schon gemeldet ist (auch von einer Mitbewohnerin bzw. einem Mitbewohner), bestätige, dass die Meldung bei uns vorliegt, nenne den Status und verlange keine neue Meldung im Mieterportal. Nenne nie Namen von Mitbewohnern. Schickt der Mieter Unterlagen oder neue Infos dazu (z.B. Kostenvoranschlag, Techniker war da, Termin), bedanke dich, sag, dass wir es anschauen und uns melden, und setze "eskalieren": true. Nur wenn der Schaden oben noch nicht gemeldet ist, bitte darum, ihn im Mieterportal zu melden (mit Fotos), und setze bei Dringendem (Wasser, Heizung, Strom, Schloss) "eskalieren": true.`;
}

async function angebot(sb: any): Promise<string> {
  const [{ data: rooms }, { data: apts }, { data: mieter }] = await Promise.all([
    sb.from("rooms").select("id, apt_id, occupied, miete, balkon, qm, ausschreib_override, mieter_auszug, moebliert, nachmieter_gesetzt"),
    sb.from("apartments").select("id, type, adresse, plz, ort, zimmer, stockwerk, flaeche, merkmale, matterport_url, mietbeginn, mietende, immer_befristet, ausschreiben, nicht_ausschreiben, vermietungsart, pipeline").eq("type", "WG"),
    // nur Geburtsdatum + Zuordnung, keine Namen: die KI bekommt pro WG ausschliesslich eine Altersspanne
    sb.from("tenants").select("apt_id, room_id, geburt, auszug").eq("status", "aktiv").is("deleted_at", null),
  ]);
  const amap: Record<string, any> = {}; (apts || []).forEach((a: any) => { amap[a.id] = a; }); // wie Website: auch Objekte in der Pipeline, sofern ausgeschrieben
  const h = new Date(); h.setHours(0, 0, 0, 0);
  const zeilenWg: string[] = [], zeilenWhg: string[] = [];
  // Altersspanne der aktuellen Mitbewohner (ohne den Mieter des freien Zimmers)
  const alterSpanne = (aptId: string, roomId: string): string => {
    const alter: number[] = [];
    for (const t of mieter || []) {
      if (t.apt_id !== aptId || t.room_id === roomId) continue;
      const aus = pd(t.auszug); if (aus && aus < h) continue;
      const g = pd(t.geburt); if (!g) continue;
      let a = h.getFullYear() - g.getFullYear();
      if (h.getMonth() < g.getMonth() || (h.getMonth() === g.getMonth() && h.getDate() < g.getDate())) a--;
      if (a > 0 && a < 100) alter.push(a);
    }
    if (!alter.length) return " MITBEWOHNER: aktuell noch keine.";
    const lo = Math.min(...alter), hi = Math.max(...alter);
    return ` MITBEWOHNER: ${alter.length} Person(en), Altersspanne ${lo === hi ? "ca. " + lo : lo + " bis " + hi} Jahre.`;
  };
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
      zeilenWg.push(`- WG-Zimmer ${r.qm ? r.qm + " m²" : ""}${r.balkon ? " mit Balkon" : ""} in einer ${a.zimmer || ""}-Zimmer-WG, ${ort}: CHF ${r.miete} pro Monat inkl. Nebenkosten (zzgl. Strom CHF 25), frei ab ${ab}, ${dauer}. Link: www.dthomes.ch/zimmer/${slug(a)}${alterSpanne(a.id, r.id)}${neu}`);
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
    const anweisung = String(b.anweisung || "").trim().slice(0, 3000);
    const absenderName = String(b.absender || "").trim().split(/\s+/)[0].slice(0, 40);
    const mieter = b.telefon ? await mieterKontext(sb, String(b.telefon)).catch(() => "") : "";

    // Sprache der Nachricht grob erkennen, damit die Antwort sicher in der richtigen Sprache kommt
    // aktuelle Nachricht plus frühere Nachrichten des Kunden: bei kurzen Nachrichten ("Ok") zählt, wie er sonst schreibt
    const kundeVorher = (Array.isArray(b.verlauf) ? b.verlauf : []).filter((x: any) => x && x.von === "kunde").map((x: any) => String(x.text || "")).slice(-6).join(" \n ");
    const spracheText = `${nachricht} \n ${kundeVorher}`.toLowerCase();
    const w = (re: RegExp) => (spracheText.match(re) || []).length;
    const en = w(/\b(the|and|is|are|can|you|my|we|please|hello|hi|thanks|available|room|rent|together|would|what|how)\b/g);
    const de = w(/\b(und|ist|ich|das|der|die|nicht|ein|eine|bitte|hallo|danke|kann|wie|wann|zimmer|wohnung|möchte|gerne)\b/g);
    // feste Sprache pro Chat (in der WhatsApp-Inbox einstellbar), sonst automatisch erkennen
    let festSprache = "";
    if (b.telefon) { const { data: wc } = await sb.from("wa_chats").select("ki_sprache").eq("telefon", normTelefon(String(b.telefon))).maybeSingle(); festSprache = String(wc?.ki_sprache || ""); }
    const SPRACHNAME: Record<string, string> = { de: "Deutsch", en: "Englisch", nl: "Niederländisch", fr: "Französisch", it: "Italienisch", es: "Spanisch" };
    const sprache = SPRACHNAME[festSprache] ? festSprache : (en > de ? "en" : "de");
    const system = `Du bist der Assistent von D&T Homes und beantwortest Nachrichten von Wohnungs- und Zimmer-Interessenten per WhatsApp.
WICHTIG: Schreibe die Antwort immer in der Sprache der letzten Nachricht des Interessenten. Schreibt er Englisch, antworte vollständig auf Englisch; schreibt er Deutsch, auf Deutsch (du-Form). Schreibt er in einer anderen Sprache (z.B. Niederländisch, Französisch, Italienisch, Spanisch), antworte in genau dieser Sprache.
Halte dich strikt an das hinterlegte Wissen und die Live-Daten unten. Erfinde nichts. Wenn eine Frage damit nicht sicher beantwortet werden kann, oder wenn sie unter "Offene Punkte" fällt, setze "eskalieren": true und schreibe nur eine kurze, freundliche Zwischenantwort (wir klären das und melden uns).
Fragen zu den aktuellen Mitbewohnern/Mietern: Nenne ausschliesslich die Altersspanne aus "MITBEWOHNER" in den Live-Daten (z.B. "zwischen 22 und 27"). Nie Namen, Geschlecht, Nationalität, Beruf oder andere persönliche Angaben. Steht dort "noch keine" oder fehlt die Angabe, sag, dass wir jeweils Leute suchen, die studieren oder gerade angefangen haben zu arbeiten und zwischen 19 und 35 Jahre alt sind.
Heute ist ${new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date())}.\nFerienwohnungen: Nennt jemand Daten (und Personenzahl), frage mit "ferienwohnung_verfuegbarkeit" live ab, welche Wohnungen frei sind und was sie kosten. Nenne den Gesamtpreis (total_price) so wie geliefert, in CHF, inkl. Gebühren und Taxen, und verweise für die Buchung auf das jeweilige Inserat bzw. sag, dass wir die Buchung gerne vorbereiten (dann eskalieren). Ist nichts frei oder bookable=false (z.B. Mindestaufenthalt), sag das und nenne den Grund. Fehlen Daten, frag danach. Nie selbst buchen oder reservieren.\nGib deine Antwort am Schluss immer über das Werkzeug "antwort_senden" zurück (antwort, eskalieren, grund, sprache). "grund" ist eine kurze interne Notiz für das Team (Deutsch), warum eskaliert wird oder welche Quellen du genutzt hast.

# Hinterlegtes Wissen
${wissenText}

# Zusätzliche Regeln (wichtig)
- Keine Verfügbarkeitsgarantien: Schreib nie, dass ein Zimmer "sicher" bis zu einem Datum frei bleibt. Freie Zimmer können jederzeit vergeben werden; sag stattdessen, dass es aktuell frei ist und man sich am besten rasch bewirbt.
- Fristen, Beträge, Behördenregeln (z.B. Anmeldefristen beim Kreisbüro) und andere Fakten nur nennen, wenn sie im Wissen oder in den Live-Daten stehen. Sonst nichts erfinden und "eskalieren": true setzen.
- "eskalieren" und "senden" sind zwei verschiedene Dinge:
  · "eskalieren": true heisst nur, dass das Team sich etwas anschauen oder entscheiden muss (z.B. Ausnahme von der Mindestmietdauer, Vertrag zusenden, Zahlung prüfen, Rechtsfrage).
  · "senden": true heisst, deine Antwort ist korrekt und darf direkt an den Kunden gehen. Das ist der Normalfall: Beantworte alles, was du sicher weisst, stelle Rückfragen (z.B. welches Zimmer, Link zum Inserat), und schreib bei dem Punkt, den das Team entscheiden muss, kurz, dass wir uns dazu melden. Auch eine kurze Bestätigung darf gesendet werden, z.B. wenn ein Mieter mitteilt, dass eine Zahlung später kommt: "Danke für die Info, wir schauen nach dem Eingang" (senden: true, eskalieren: true).
  · "senden": false nur, wenn du keine der Fragen sicher beantworten kannst und nur eine Hinhalte-Antwort möglich wäre, oder bei heiklen Themen (Rechtsfragen, Mietzinsreduktion, Streit, Beschwerden, Absagen). Dann wird nichts gesendet und dein Text ist ein Entwurf für das Team: ohne erfundene Begründungen, Unbekanntes mit [ergänzen] markieren.
  · Hat das Team einen Punkt noch nicht beantwortet (z.B. eine Ausnahme), beantworte trotzdem neue, einfache Fragen des Kunden ("welches Zimmer ist am günstigsten?") und sende.
  · Korrigiere frühere falsche Aussagen im Verlauf nicht eigenmächtig, sondern setze "eskalieren": true.

# Live-Daten aus ImmoBase
${live}
${mieter ? "\n" + mieter : ""}
${anweisung ? `
# Stichpunkte vom Team (Vorrang)
${absenderName || "Jemand"} von D&T Homes hat diese Stichpunkte geschrieben. Formuliere daraus eine schöne, passende WhatsApp-Nachricht an den Kunden, die auf seine letzten Nachrichten eingeht:
"""
${anweisung}
"""
Regeln dafür: Übernimm alle Inhalte der Stichpunkte sinngemäss und vollständig, erfinde nichts dazu und lass nichts weg. Die Stichpunkte sind vom Team freigegeben, du darfst sie verwenden, auch wenn sie im Wissen fehlen, und setze deswegen nicht "eskalieren". Fakten aus Wissen und Live-Daten darfst du ergänzen, wenn sie direkt passen. Sind die Stichpunkte als Anweisung an dich formuliert ("sag ihm, dass..."), schreibe die Nachricht direkt an den Kunden. Passe die Anrede dem Kunden an: siezt er, schreibe in der Sie-Form, sonst du-Form. Unterschreibe mit "${absenderName || "Daan"}" bzw. bei Sie-Form mit "${absenderName || "Daan"}, D&T Homes". Keine Gedankenstriche. Schweizer Schreibweise (ss statt ß).` : ""}

# Antwortsprache
${SPRACHNAME[festSprache] ? `Mit diesem Kontakt kommunizieren wir immer auf ${SPRACHNAME[festSprache]}. Schreibe die Antwort ausschliesslich auf ${SPRACHNAME[festSprache]} (lockere Du-Form, ausser der Kontakt siezt), egal in welcher Sprache die Nachricht, das Wissen oder die Stichpunkte sind, und setze "sprache": "${festSprache}".` : sprache === "en" ? "Die Nachricht ist auf Englisch. Schreibe die Antwort ausschliesslich auf Englisch, auch wenn das Wissen oben auf Deutsch ist, und setze \"sprache\": \"en\"." : (anweisung ? "Die Nachricht ist auf Deutsch (oder unklar). Schreibe die Antwort auf Deutsch, in der Sie-Form wenn der Kunde siezt, sonst in der du-Form, ausser" : "Die Nachricht ist auf Deutsch (oder unklar). Schreibe die Antwort auf Deutsch in der du-Form, ausser")+" die Nachricht ist eindeutig in einer anderen Sprache (z.B. Niederländisch, Französisch, Italienisch, Spanisch), dann in genau dieser Sprache; setze \"sprache\" entsprechend (nl, fr, it, es)."}`;

    const messages: any[] = [];
    for (const v of verlauf) { const t = String(v?.text || "").trim(); if (t) messages.push({ role: v.von === "wir" ? "assistant" : "user", content: t.slice(0, 2000) }); }
    while (messages.length && messages[0].role === "assistant") messages.shift();
    // aufeinanderfolgende gleiche Rollen zusammenfassen
    const msgs: any[] = [];
    for (const m of [...messages, { role: "user", content: nachricht }]) {
      if (msgs.length && msgs[msgs.length - 1].role === m.role) msgs[msgs.length - 1].content += "\n" + m.content; else msgs.push({ ...m });
    }
    const TOOLS = [{
      name: "antwort_senden",
      description: "Die Antwort an den Interessenten zurückgeben (immer als letzter Schritt).",
      input_schema: { type: "object", properties: {
        antwort: { type: "string", description: "Text der WhatsApp-Antwort an den Interessenten" },
        eskalieren: { type: "boolean", description: "true, wenn das Team sich etwas anschauen oder entscheiden muss" },
        senden: { type: "boolean", description: "true, wenn die Antwort korrekt ist und direkt an den Kunden gesendet werden darf (Normalfall)" },
        grund: { type: "string", description: "Kurze interne Notiz auf Deutsch" },
        sprache: { type: "string", enum: ["de", "en", "nl", "fr", "it", "es"] },
      }, required: ["antwort", "eskalieren", "grund", "sprache"] },
    }, {
      name: "ferienwohnung_verfuegbarkeit",
      description: "Live aus Elev8: welche Ferienwohnungen (Kurzaufenthalte, Airbnb/Booking) für diese Daten frei sind, inkl. Gesamtpreis mit allen Gebühren und Taxen. Nur für Ferienwohnungen verwenden, nicht für WG-Zimmer oder Zwischennutzung.",
      input_schema: { type: "object", properties: {
        check_in: { type: "string", description: "Anreise YYYY-MM-DD" },
        check_out: { type: "string", description: "Abreise YYYY-MM-DD" },
        erwachsene: { type: "integer" }, kinder: { type: "integer" },
      }, required: ["check_in", "check_out"] },
    }];
    let j: any = null; let elev8: any = null; let elev8Fehler = "";
    for (let runde = 0; runde < 3; runde++) {
      const letzte = runde === 2;
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": c.anthropic_api_key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: c.anthropic_model, max_tokens: 1200, system, messages: msgs, tools: TOOLS,
          tool_choice: letzte ? { type: "tool", name: "antwort_senden" } : { type: "any" } }),
      });
      j = await r.json();
      if (!r.ok) return json({ error: "KI-Fehler: " + JSON.stringify(j).slice(0, 300) }, 502);
      const abfrage = (j.content || []).find((x: any) => x.type === "tool_use" && x.name === "ferienwohnung_verfuegbarkeit");
      if (!abfrage) break;
      let ergebnis: unknown;
      try {
        elev8 = elev8 || await elev8Verbinden();
        const a = abfrage.input || {};
        ergebnis = await elev8.tool("search_available_listings", { check_in_date: a.check_in, check_out_date: a.check_out,
          number_of_adults: Math.max(1, +a.erwachsene || 1), number_of_children: Math.max(0, +a.kinder || 0) });
      } catch (e) {
        const f = String((e as Error)?.message || e).slice(0, 300); console.error("elev8 abfrage", f); elev8Fehler = f;
        // Rückfall: stündlich abgeglichene Buchungen und Sperrzeiten aus ImmoBase (ohne Preise)
        try {
          const a = abfrage.input || {}; const ci = String(a.check_in || ""), co = String(a.check_out || "");
          const [{ data: bk }, { data: bl }] = await Promise.all([
            sb.from("elev8_bookings").select("listing_name, arrival, departure, cancelled, status").lt("arrival", co).gt("departure", ci),
            sb.from("elev8_blocks").select("listing_name, start_date, end_exclusive").lt("start_date", co).gt("end_exclusive", ci),
          ]);
          const { data: alle } = await sb.from("elev8_blocks").select("listing_name");
          const { data: alleB } = await sb.from("elev8_bookings").select("listing_name").gte("departure", new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10));
          const namen = [...new Set([...(alle || []), ...(alleB || [])].map((x: any) => x.listing_name).filter(Boolean))];
          const belegt = new Set([...(bk || []).filter((x: any) => !x.cancelled && !/cancel/i.test(String(x.status || ""))), ...(bl || [])].map((x: any) => x.listing_name));
          // Preise aus dem täglichen Abgleich (Nachtpreise + Putzgebühr + Kurtaxe)
          const personen = Math.max(1, +a.erwachsene || 1) + Math.max(0, +a.kinder || 0);
          const naechte: string[] = [];
          for (let d = new Date(ci + "T00:00:00Z"); d < new Date(co + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) naechte.push(d.toISOString().slice(0, 10));
          const [{ data: pr }, { data: gb }] = await Promise.all([
            sb.from("elev8_preise").select("listing_name, datum, preis").gte("datum", ci).lt("datum", co),
            sb.from("elev8_gebuehren").select("listing_name, putzgebuehr, kurtaxe_pp_nacht"),
          ]);
          const listings = namen.map((n) => {
            const frei = !belegt.has(n);
            if (!frei || !naechte.length) return { listing_name: n, frei };
            const p = new Map((pr || []).filter((x: any) => x.listing_name === n).map((x: any) => [String(x.datum).slice(0, 10), +x.preis]));
            if (naechte.some((d) => !p.has(d))) return { listing_name: n, frei, preis: "nicht bekannt" };
            const g: any = (gb || []).find((x: any) => x.listing_name === n) || {};
            const unterkunft = naechte.reduce((t, d) => t + (p.get(d) || 0), 0);
            const putz = +g.putzgebuehr || 0, kurtaxe = (+g.kurtaxe_pp_nacht || 0) * personen * naechte.length;
            return { listing_name: n, frei, naechte: naechte.length, unterkunft, putzgebuehr: putz, kurtaxe, total_price: Math.round(unterkunft + putz + kurtaxe) };
          });
          ergebnis = { quelle: "Abgleich aus Elev8 (Belegung stündlich, Preise täglich)", listings,
            hinweis: "total_price ist der Gesamtpreis in CHF inkl. Reinigung und Kurtaxe. Nenne ihn als Preis (z.B. 'insgesamt CHF 1'383 inkl. Reinigung und Kurtaxe'). Ohne total_price keinen Preis nennen, sondern sagen, dass wir ihn bestätigen. Mindestaufenthalt und maximale Personenzahl sind nicht geprüft: sag, dass wir die Buchung gerne bestätigen bzw. vorbereiten, und eskaliere bei Buchungswunsch. Kein technisches Problem erwähnen." };
        } catch (e2) { ergebnis = { fehler: "Keine Verfügbarkeit abrufbar. Kein technisches Problem erwähnen, nur sagen, dass wir die Verfügbarkeit prüfen und uns melden, und eskalieren." }; }
      }
      msgs.push({ role: "assistant", content: j.content });
      msgs.push({ role: "user", content: [{ type: "tool_result", tool_use_id: abfrage.id, content: JSON.stringify(ergebnis).slice(0, 12000) }] });
    }
    let out: any = (j.content || []).find((x: any) => x.type === "tool_use" && x.name === "antwort_senden")?.input || null;
    if (!out || typeof out.antwort !== "string") {
      // Rückfall: Freitext oder JSON im Text
      const text = (j.content || []).map((x: any) => x.text || "").join("").trim();
      try { out = JSON.parse(text.replace(/^```(json)?|```$/g, "").trim()); } catch { const m = text.match(/\{[\s\S]*\}/); if (m) try { out = JSON.parse(m[0]); } catch { /* */ } }
      if ((!out || typeof out.antwort !== "string") && text) out = { antwort: text, eskalieren: true, grund: "Antwort ohne Struktur, bitte prüfen", sprache };
    }
    if (!out || typeof out.antwort !== "string" || !out.antwort.trim()) return json({ error: "Antwort nicht lesbar" }, 502);
    // Sicherheitsnetz: Steuer-Markup, das ins Antwortfeld gerutscht ist, abschneiden und auswerten
    {
      const a = out.antwort;
      const cut = a.search(/<\/?(antwort|parameter|invoke|function_calls)\b|<\/antml|<parameter\s/i);
      if (cut >= 0) {
        const rest = a.slice(cut);
        const pm = (k: string) => (rest.match(new RegExp(`name="${k}">\\s*([\\s\\S]*?)\\s*(?:</parameter>|<parameter|$)`, "i")) || [])[1];
        const esk = pm("eskalieren"), gr = pm("grund"), sp = pm("sprache");
        if (esk !== undefined && typeof out.eskalieren !== "boolean") out.eskalieren = /true/i.test(esk);
        else if (esk !== undefined) out.eskalieren = out.eskalieren || /true/i.test(esk);
        if (gr && !out.grund) out.grund = gr.trim();
        const se = pm("senden"); if (se !== undefined && typeof out.senden !== "boolean") out.senden = /true/i.test(se);
        if (sp && !out.sprache) out.sprache = sp.trim();
        out.antwort = a.slice(0, cut);
      }
    }
    // WhatsApp kennt kein Markdown: [text](url) zu url, **fett** zu *fett*
    out.antwort = out.antwort
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m: string, t: string, u: string) => (u.replace(/^https?:\/\//, "").replace(/\/$/, "") === t.replace(/^https?:\/\//, "").replace(/\/$/, "") ? t : `${t}: ${u}`))
      .replace(/\*\*([^*]+)\*\*/g, "*$1*")
      .replace(/\n{3,}/g, "\n\n").trim();
    // Gedankenstriche entfernen, interne Zimmer-IDs nie nach aussen
    out.antwort = out.antwort.replace(/\s[–—]\s/g, ", ").replace(/[–—]/g, "-");
    if (/\bA\d{1,3}-\d{1,2}\b/.test(out.antwort)) { out.eskalieren = true; out.grund = (out.grund || "") + " | interne Zimmer-ID in Antwort"; }
    let senden = typeof out.senden === "boolean" ? out.senden : !out.eskalieren;
    // heikle Themen nie automatisch senden (Recht, Mietzinsreduktion, Beschwerden)
    const heikel = /\b(art\.?\s*\d{2,3}|anwalt|lawyer|schlichtung|mietzinsreduktion|mietzinsminderung|rent reduction|reduction (of|in) (the )?rent|klage|beschwerde|complaint|betreibung)/i;
    const gesetz = /\b\d{3}[a-z]?\s*(OR|CO)\b|\b(OR|CO)\s*\d{3}/; // z.B. "259d OR", "CO 259"
    const t = `${b.nachricht || ""}\n${out.grund || ""}`;
    if (heikel.test(t) || gesetz.test(t)) senden = false;
    if (/\bA\d{1,3}-\d{1,2}\b/.test(out.antwort)) out.senden = false;
    return json({ antwort: out.antwort, eskalieren: !!out.eskalieren, senden: /\bA\d{1,3}-\d{1,2}\b/.test(out.antwort) ? false : senden, grund: out.grund || "", sprache: out.sprache || "de", ...(elev8Fehler ? { elev8_fehler: elev8Fehler } : {}) });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
