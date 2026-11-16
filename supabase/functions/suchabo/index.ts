// suchabo - Suchabo fuer freie WG-Zimmer und Wohnungen auf dthomes.ch
// Oeffentlich (verify_jwt=false):
//   {aktion:"anmelden", email, art:"zimmer"|"wohnung", orte:[], max_miete, sprache, website(Honeypot)}
//   {aktion:"abmelden", token}
// Nur Admin oder Server (Cron, stuendlich):
//   {aktion:"lauf", dry?}  gleicht die freien Inserate ab (Tabelle suchabo_inserate, frei_seit)
//   und schickt jedem aktiven Abo eine Mail mit den Inseraten, die seit dem letzten Versand
//   (bzw. seit der Anmeldung) neu frei sind. Hoechstens eine Mail pro Abo alle 20 Stunden.
// Welche Zimmer frei sind, folgt genau der Logik der Webseite (isFree in zimmer.html/wohnungen.html).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { istAdminOderServer, verweigert } from "../_shared/auth.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const PAUSE_H = 20;
const WEB = "https://www.dthomes.ch";

function pd(x: unknown): Date | null {
  const s = String(x || "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return null;
}
function heute(): Date {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, mo, d] = p.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d));
}
const fmt = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
const chf = (n: number) => "CHF " + Math.round(n).toLocaleString("de-CH").replace(/[’,]/g, "'");

function istFrei(r: any, a: any, h: Date): boolean {
  if (!a) return false;
  if (r.nachmieter_gesetzt) return false;
  const ov = r.ausschreib_override || "auto";
  if (ov === "ja") return true;
  if (ov === "nein") return false;
  if (a.nicht_ausschreiben) return false;
  if (!r.occupied) return true;
  if (a.ausschreiben) return true;
  const aus = pd(r.mieter_auszug), ende = pd(a.mietende);
  if (!aus) return false;
  if (ende && aus >= ende) return false;
  return h.getTime() >= aus.getTime() - 45 * 86400000;
}
function slug(a: any) {
  return String(a.adresse || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") + "-" + String(a.id).toLowerCase();
}
function link(a: any, art: string, en: boolean) {
  const pre = en ? "/en" : "";
  return art === "wohnung" ? `${WEB}${pre}/wohnungen?wohnung=${encodeURIComponent(a.id)}` : `${WEB}${pre}/zimmer/${slug(a)}`;
}
function strasse(adr: string) { return String(adr || "").replace(/\s\d+.*$/, ""); }

// alle aktuell freien Inserate, je Zimmer (art zimmer) bzw. je Wohnung (art wohnung)
async function freieInserate(sb: any) {
  const h = heute();
  const [{ data: rooms, error: e1 }, { data: apts, error: e2 }] = await Promise.all([
    sb.from("rooms").select("id,apt_id,occupied,miete,ausschreib_override,mieter_auszug,nachmieter_gesetzt"),
    sb.from("apartments").select("id,type,adresse,plz,ort,zimmer,mietbeginn,mietende,ausschreiben,nicht_ausschreiben,vermietungsart").eq("type", "WG"),
  ]);
  if (e1 || e2) throw new Error((e1 || e2).message);
  const amap: Record<string, any> = {};
  for (const a of apts || []) amap[a.id] = a;
  const out: Record<string, any> = {};
  for (const r of rooms || []) {
    const a = amap[r.apt_id];
    if (!a || !istFrei(r, a, h)) continue;
    const art = a.vermietungsart === "wohnung" ? "wohnung" : "zimmer";
    const key = art === "wohnung" ? `w:${a.id}` : `z:${r.id}`;
    // frei ab: Auszug des bisherigen Mieters oder Mietbeginn, falls in der Zukunft
    let ab: Date | null = null;
    const aus = r.occupied ? pd(r.mieter_auszug) : null;
    if (aus && aus > h) ab = new Date(aus.getTime() + 86400000);
    const mb = pd(a.mietbeginn);
    if (mb && mb > h && (!ab || mb > ab)) ab = mb;
    const prev = out[key];
    const miete = Number(r.miete) || null;
    if (prev) { if (miete && (!prev.miete || miete < prev.miete)) prev.miete = miete; continue; }
    out[key] = { key, art, apt_id: a.id, room_id: art === "zimmer" ? r.id : null, miete, ab, apt: a };
  }
  return Object.values(out);
}

async function abgleich(sb: any, frei: any[]) {
  const { data: bisher } = await sb.from("suchabo_inserate").select("key");
  const alt = new Set((bisher || []).map((x: any) => x.key));
  const jetzt = new Set(frei.map((x) => x.key));
  const neu = frei.filter((x) => !alt.has(x.key)).map((x) => ({ key: x.key, art: x.art, apt_id: x.apt_id, room_id: x.room_id }));
  const weg = [...alt].filter((k) => !jetzt.has(k as string));
  if (neu.length) await sb.from("suchabo_inserate").upsert(neu, { onConflict: "key", ignoreDuplicates: true });
  if (weg.length) await sb.from("suchabo_inserate").delete().in("key", weg);
  const { data: alle } = await sb.from("suchabo_inserate").select("key,frei_seit");
  const seit: Record<string, string> = {};
  for (const x of alle || []) seit[x.key] = x.frei_seit;
  return { neu: neu.length, weg: weg.length, seit };
}

function passt(abo: any, x: any) {
  if (x.art !== abo.art) return false;
  if (abo.orte?.length && !abo.orte.includes(String(x.apt.ort || "").trim())) return false;
  if (abo.max_miete && x.miete && x.miete > Number(abo.max_miete)) return false;
  return true;
}

function mailText(abo: any, treffer: any[]) {
  const en = abo.sprache === "en";
  const abmelden = `${WEB}${en ? "/en" : ""}/suchabo?abmelden=${abo.token}`;
  // Zimmer derselben Wohnung zusammenfassen
  const gruppen: Record<string, any> = {};
  for (const x of treffer) {
    const g = gruppen[x.apt_id] || (gruppen[x.apt_id] = { apt: x.apt, n: 0, miete: null as number | null, ab: null as Date | null, sofort: false });
    g.n++;
    if (x.miete && (!g.miete || x.miete < g.miete)) g.miete = x.miete;
    if (!x.ab) g.sofort = true; else if (!g.ab || x.ab < g.ab) g.ab = x.ab;
  }
  const zeilen = Object.values(gruppen).map((g: any) => {
    const a = g.apt, ort = String(a.ort || "").trim();
    const zi = a.zimmer ? String(a.zimmer) : "";
    const ab = g.sofort ? (en ? "available now" : "sofort frei") : (en ? "available from " : "frei ab ") + fmt(g.ab);
    let titel: string, preis = "";
    if (abo.art === "wohnung") {
      titel = en ? `${zi ? zi + "-room " : ""}apartment on ${strasse(a.adresse)}, ${ort}` : `${zi ? zi + "-Zimmer-" : ""}Wohnung an der ${strasse(a.adresse)}, ${ort}`;
      if (g.miete) preis = `${chf(g.miete)}${en ? " / month" : " / Monat"}`;
    } else {
      const anz = en ? (g.n === 1 ? "1 free room" : `${g.n} free rooms`) : (g.n === 1 ? "1 freies Zimmer" : `${g.n} freie Zimmer`);
      titel = en ? `${zi ? zi + "-room " : ""}shared flat on ${strasse(a.adresse)}, ${ort}` : `${zi ? zi + "-Zimmer-" : ""}WG an der ${strasse(a.adresse)}, ${ort}`;
      preis = anz + (g.miete ? " · " + (g.n > 1 ? (en ? "from " : "ab ") : "") + chf(g.miete) + (en ? " / month" : " / Monat") : "");
    }
    return `${titel}\n${[preis, ab].filter(Boolean).join(" · ")}\n${link(a, abo.art, en)}`;
  });
  const n = zeilen.length;
  if (en) return {
    betreff: abo.art === "wohnung" ? (n === 1 ? "New apartment available at D&T Homes" : "New apartments available at D&T Homes") : (n === 1 ? "New room available at D&T Homes" : "New rooms available at D&T Homes"),
    text: `Hi,\n\n${n === 1 ? (abo.art === "wohnung" ? "A new apartment matching your search is" : "A shared flat with a free room matching your search is") : (abo.art === "wohnung" ? "New apartments matching your search are" : "Shared flats with free rooms matching your search are")} now available:\n\n${zeilen.join("\n\n")}\n\nFree places often go quickly, so apply directly via the link if you're interested.\n\nBest regards\nYour D&T Homes Team\n\nYou're receiving this email because you signed up for listing alerts on dthomes.ch. Unsubscribe: ${abmelden}`,
  };
  return {
    betreff: abo.art === "wohnung" ? (n === 1 ? "Neue Wohnung frei bei D&T Homes" : "Neue Wohnungen frei bei D&T Homes") : (n === 1 ? "Neues Zimmer frei bei D&T Homes" : "Neue Zimmer frei bei D&T Homes"),
    text: `Hallo,\n\n${abo.art === "wohnung" ? (n === 1 ? "Passend zu deinem Suchabo ist neu eine Wohnung frei:" : "Passend zu deinem Suchabo sind neue Wohnungen frei:") : "Passend zu deinem Suchabo sind neue Zimmer frei:"}\n\n${zeilen.join("\n\n")}\n\nFreie Plätze sind oft schnell weg. Wenn dich etwas interessiert, bewirb dich am besten direkt über den Link.\n\nLiebe Grüsse\nDein D&T Homes Team\n\nDu erhältst diese Mail, weil du auf dthomes.ch ein Suchabo eingerichtet hast. Abmelden: ${abmelden}`,
  };
}

async function senden(to: string, betreff: string, text: string, sprache: string) {
  const r = await fetch(`${URL_}/functions/v1/send-message`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to, betreff, text, sprache, ohneBcc: true }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const body = await req.json().catch(() => ({}));
  const sb = createClient(URL_, KEY);
  const aktion = String(body.aktion || "");

  if (aktion === "anmelden") {
    if (body.website) return json({ ok: true }); // Honeypot
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) return json({ error: "email" }, 400);
    const art = body.art === "wohnung" ? "wohnung" : "zimmer";
    const orte = Array.isArray(body.orte) ? body.orte.map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 20) : [];
    const mm = Number(body.max_miete);
    const max_miete = mm > 0 && mm < 100000 ? Math.round(mm) : null;
    const sprache = body.sprache === "en" ? "en" : "de";
    // Missbrauch begrenzen: hoechstens 30 Anmeldungen pro Stunde insgesamt
    const { count } = await sb.from("suchabos").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 3600000).toISOString());
    if ((count || 0) > 30) return json({ error: "spaeter" }, 429);
    const { data: bestehend } = await sb.from("suchabos").select("id,token,aktiv").ilike("email", email).eq("art", art).maybeSingle();
    let token: string;
    if (bestehend) {
      // Angaben aktualisieren; als neu angemeldet gilt ab jetzt (sonst kaemen alte Inserate)
      const { error } = await sb.from("suchabos").update({ orte, max_miete, sprache, aktiv: true, abgemeldet_at: null, created_at: new Date().toISOString(), letzter_versand: null }).eq("id", bestehend.id);
      if (error) return json({ error: error.message }, 500);
      token = bestehend.token;
    } else {
      const { data, error } = await sb.from("suchabos").insert({ email, art, orte, max_miete, sprache }).select("token").single();
      if (error) return json({ error: error.message }, 500);
      token = data.token;
    }
    // die Inserate, die jetzt schon online sind, sieht die Person bereits: Stand jetzt festhalten
    try { await abgleich(sb, await freieInserate(sb)); } catch (_e) { /* naechster Lauf holt es nach */ }
    const en = sprache === "en";
    const was = art === "wohnung" ? (en ? "apartment" : "Wohnung") : (en ? "room" : "Zimmer");
    const wo = orte.length ? (en ? ` in ${orte.join(", ")}` : ` in ${orte.join(", ")}`) : "";
    const bis = max_miete ? (en ? ` up to ${chf(max_miete)} per month` : ` bis ${chf(max_miete)} pro Monat`) : "";
    const abmelden = `${WEB}${en ? "/en" : ""}/suchabo?abmelden=${token}`;
    const m = en
      ? { betreff: "Your listing alert at D&T Homes", text: `Hi,\n\nThanks for signing up! As soon as a new ${was}${wo}${bis} becomes available at D&T Homes, we'll send you an email.\n\nYou can see everything that's free right now at ${WEB}/en/${art === "wohnung" ? "wohnungen" : "zimmer"}.\n\nBest regards\nYour D&T Homes Team\n\nUnsubscribe at any time: ${abmelden}` }
      : { betreff: "Dein Suchabo bei D&T Homes", text: `Hallo,\n\ndanke für deine Anmeldung! Sobald bei D&T Homes ${art === "wohnung" ? "eine neue Wohnung" : "ein neues Zimmer"}${wo}${bis} frei wird, schicken wir dir eine Mail.\n\nAlles, was aktuell frei ist, findest du auf ${WEB}/${art === "wohnung" ? "wohnungen" : "zimmer"}.\n\nLiebe Grüsse\nDein D&T Homes Team\n\nJederzeit abmelden: ${abmelden}` };
    try { await senden(email, m.betreff, m.text, sprache); } catch (_e) { /* Abo gilt trotzdem */ }
    return json({ ok: true });
  }

  if (aktion === "abmelden") {
    const token = String(body.token || "");
    if (!/^[0-9a-f-]{36}$/i.test(token)) return json({ error: "token" }, 400);
    const { data } = await sb.from("suchabos").update({ aktiv: false, abgemeldet_at: new Date().toISOString() }).eq("token", token).select("art");
    return json({ ok: !!(data && data.length), art: data?.[0]?.art || null });
  }

  if (aktion === "lauf") {
    if (!(await istAdminOderServer(req))) return verweigert(CORS);
    const frei = await freieInserate(sb);
    const ab = await abgleich(sb, frei);
    const { data: abos } = await sb.from("suchabos").select("*").eq("aktiv", true);
    const jetzt = Date.now();
    const plan: any[] = [];
    for (const abo of abos || []) {
      if (abo.letzter_versand && jetzt - new Date(abo.letzter_versand).getTime() < PAUSE_H * 3600000) continue;
      const seit = new Date(abo.letzter_versand || abo.created_at).getTime();
      const treffer = frei.filter((x) => passt(abo, x) && ab.seit[x.key] && new Date(ab.seit[x.key]).getTime() > seit);
      if (treffer.length) plan.push({ abo, treffer });
    }
    if (body.dry) return json({ frei: frei.length, neu: ab.neu, weg: ab.weg, mails: plan.map((p) => ({ abo: p.abo.id, art: p.abo.art, treffer: p.treffer.map((t: any) => t.key) })) });
    const ergebnis: any[] = [];
    for (const p of plan) {
      const m = mailText(p.abo, p.treffer);
      try {
        await senden(p.abo.email, m.betreff, m.text, p.abo.sprache);
        await sb.from("suchabos").update({ letzter_versand: new Date().toISOString(), anzahl_mails: (p.abo.anzahl_mails || 0) + 1 }).eq("id", p.abo.id);
        ergebnis.push({ abo: p.abo.id, status: "sent", treffer: p.treffer.length });
      } catch (e) {
        ergebnis.push({ abo: p.abo.id, status: "error", error: String(e).slice(0, 200) });
      }
    }
    return json({ frei: frei.length, neu: ab.neu, weg: ab.weg, ergebnis });
  }

  return json({ error: "aktion" }, 400);
});
