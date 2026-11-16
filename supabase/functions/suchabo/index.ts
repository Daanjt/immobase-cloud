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
    sb.from("apartments").select("id,type,adresse,plz,ort,zimmer,stockwerk,photos,mietbeginn,mietende,ausschreiben,nicht_ausschreiben,vermietungsart").eq("type", "WG"),
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


// ---------- Mail-Layout ----------
const LOGO = "https://mieter.dthomes.ch/dt-logo.png";
const STORAGE = `${URL_}/storage/v1/object/public/assets/`;
const FARBE = { paper: "#FBFAF6", ink: "#1C1B17", soft: "#54503F", espresso: "#211E19", cream: "#EAE3D5", sand: "#EAE1D2", line: "#E4DDD0" };
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const e = (x: unknown) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const PRIO: Record<string, number> = { aussen: 0, aussenansicht: 0, aussicht: 1, balkon: 2, kueche: 3, "küche": 3, wohnen: 4, wohnzimmer: 4, eingang: 6, flur: 6, bad: 8, wc: 9 };
function titelbild(a: any): string | null {
  const ph = (Array.isArray(a.photos) ? a.photos : []).filter((p: any) => p && p.path && !p.hidden && (p.category || "") !== "grundriss" && /\.(jpe?g|png|webp|heic)$/i.test(p.path));
  if (!ph.length) return null;
  const prio = (c: string) => (c || "").startsWith("room:") ? 5 : (PRIO[c || ""] ?? 7);
  ph.sort((x: any, y: any) => ((y.favorite ? 1 : 0) - (x.favorite ? 1 : 0)) || prio(x.category) - prio(y.category) || (x.sort_order || 0) - (y.sort_order || 0));
  return `https://wsrv.nl/?url=${encodeURIComponent(STORAGE + ph[0].path)}&w=1040&h=620&fit=cover&a=attention&output=jpg&q=78`;
}
function knopf(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${FARBE.espresso}" style="border-radius:999px;"><a href="${e(href)}" style="display:inline-block;padding:12px 26px;font-family:${SANS};font-size:14px;font-weight:600;color:${FARBE.cream};text-decoration:none;border-radius:999px;">${e(label)}</a></td></tr></table>`;
}
function karte(k: any, en: boolean) {
  const bild = k.bild ? `<tr><td style="padding:0;"><a href="${e(k.link)}" style="text-decoration:none;"><img src="${e(k.bild)}" width="520" alt="${e(k.titel)}" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:14px 14px 0 0;"></a></td></tr>` : "";
  const chips = k.chips.map((c: string) => `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 11px;border-radius:999px;background:${FARBE.sand};font-family:${SANS};font-size:12.5px;color:${FARBE.ink};white-space:nowrap;">${e(c)}</span>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;background:#ffffff;border:1px solid ${FARBE.line};border-radius:14px;border-collapse:separate;">
${bild}<tr><td style="padding:20px 22px 22px;">
<div style="font-family:${SANS};font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:${FARBE.soft};margin:0 0 6px;">${e(k.ort)}</div>
<div style="font-family:${SERIF};font-size:21px;line-height:1.3;color:${FARBE.ink};margin:0 0 12px;"><a href="${e(k.link)}" style="color:${FARBE.ink};text-decoration:none;">${e(k.titel)}</a></div>
<div style="margin:0 0 12px;">${chips}</div>
${knopf(k.link, en ? "View and apply" : "Ansehen und bewerben")}
</td></tr></table>`;
}
function huelle(o: { en: boolean; vorschau: string; titel: string; intro: string; inhalt: string; abmelden: string; grund: string }) {
  const { en } = o;
  return `<!DOCTYPE html><html lang="${en ? "en" : "de"}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${e(o.titel)}</title></head>
<body style="margin:0;padding:0;background:${FARBE.paper};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${e(o.vorschau)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${FARBE.paper};"><tr><td align="center" style="padding:32px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td align="center" style="padding:0 0 26px;"><a href="${WEB}${en ? "/en" : ""}"><img src="${LOGO}" width="96" alt="D&amp;T Homes" style="display:block;width:96px;height:auto;border:0;"></a></td></tr>
<tr><td style="padding:0 20px 22px;">
<div style="font-family:${SERIF};font-size:28px;line-height:1.25;color:${FARBE.ink};margin:0 0 10px;">${e(o.titel)}</div>
<div style="font-family:${SANS};font-size:15px;line-height:1.6;color:${FARBE.soft};">${o.intro}</div>
</td></tr>
<tr><td style="padding:0 20px;">${o.inhalt}</td></tr>
<tr><td style="padding:6px 20px 0;font-family:${SANS};font-size:14px;line-height:1.6;color:${FARBE.ink};">${en ? "Best regards<br>Your D&amp;T Homes Team" : "Liebe Grüsse<br>Dein D&amp;T Homes Team"}</td></tr>
<tr><td style="padding:28px 20px 0;"><div style="border-top:1px solid ${FARBE.line};padding-top:18px;font-family:${SANS};font-size:12px;line-height:1.6;color:#8a8174;text-align:center;">
${e(o.grund)}<br>
${en ? "Questions?" : "Fragen?"} <a href="mailto:info@dthomes.ch" style="color:#8a8174;">info@dthomes.ch</a> · <a href="https://wa.me/41766887091" style="color:#8a8174;">WhatsApp</a><br><br>
<a href="${e(o.abmelden)}" style="color:${FARBE.soft};text-decoration:underline;">${en ? "Unsubscribe" : "Suchabo abmelden"}</a>
<div style="margin-top:10px;">D&amp;T Partners GmbH · <a href="${WEB}" style="color:#8a8174;text-decoration:none;">dthomes.ch</a></div>
</div></td></tr>
</table></td></tr></table></body></html>`;
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
  const karten: any[] = [];
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
    const zielLink = link(a, abo.art, en);
    const chips: string[] = [];
    if (abo.art === "wohnung") { if (g.miete) chips.push(`${chf(g.miete)}${en ? " / month" : " / Monat"}`); }
    else { chips.push(en ? (g.n === 1 ? "1 free room" : `${g.n} free rooms`) : (g.n === 1 ? "1 freies Zimmer" : `${g.n} freie Zimmer`)); if (g.miete) chips.push((g.n > 1 ? (en ? "from " : "ab ") : "") + chf(g.miete) + (en ? " / month" : " / Monat")); }
    chips.push(g.sofort ? (en ? "Available now" : "Sofort frei") : (en ? "From " : "Frei ab ") + fmt(g.ab));
    karten.push({ ort, titel: titel.replace(/, [^,]*$/, ""), chips, link: zielLink, bild: titelbild(a) });
    return `${titel}\n${[preis, ab].filter(Boolean).join(" · ")}\n${zielLink}`;
  });
  const n = zeilen.length;
  const abmeldenUrl = abmelden;
  const htmlOf = (titelH: string, introH: string, vorschau: string) => huelle({ en, vorschau, titel: titelH, intro: introH, inhalt: karten.map((k) => karte(k, en)).join(""), abmelden: abmeldenUrl,
    grund: en ? "You're receiving this email because you set up a listing alert on dthomes.ch." : "Du erhältst diese Mail, weil du auf dthomes.ch ein Suchabo eingerichtet hast." });
  if (en) return {
    html: htmlOf(abo.art === "wohnung" ? (n === 1 ? "A new apartment for you" : "New apartments for you") : (n === 1 ? "A new room for you" : "New rooms for you"),
      "Matching your listing alert, this just became available. Free places often go quickly, so it's best to apply right away.",
      abo.art === "wohnung" ? "A new apartment matching your search is available." : "New rooms matching your search are available."),
    betreff: abo.art === "wohnung" ? (n === 1 ? "New apartment available at D&T Homes" : "New apartments available at D&T Homes") : (n === 1 ? "New room available at D&T Homes" : "New rooms available at D&T Homes"),
    text: `Hi,\n\n${n === 1 ? (abo.art === "wohnung" ? "A new apartment matching your search is" : "A shared flat with a free room matching your search is") : (abo.art === "wohnung" ? "New apartments matching your search are" : "Shared flats with free rooms matching your search are")} now available:\n\n${zeilen.join("\n\n")}\n\nFree places often go quickly, so apply directly via the link if you're interested.\n\nBest regards\nYour D&T Homes Team\n\nYou're receiving this email because you signed up for listing alerts on dthomes.ch. Unsubscribe: ${abmelden}`,
  };
  return {
    html: htmlOf(abo.art === "wohnung" ? (n === 1 ? "Eine neue Wohnung für dich" : "Neue Wohnungen für dich") : (treffer.length === 1 ? "Ein neues Zimmer für dich" : "Neue Zimmer für dich"),
      "Passend zu deinem Suchabo ist gerade frei geworden. Freie Plätze sind oft schnell weg, bewirb dich am besten direkt.",
      abo.art === "wohnung" ? "Passend zu deinem Suchabo ist eine neue Wohnung frei." : "Passend zu deinem Suchabo sind neue Zimmer frei."),
    betreff: abo.art === "wohnung" ? (n === 1 ? "Neue Wohnung frei bei D&T Homes" : "Neue Wohnungen frei bei D&T Homes") : (n === 1 ? "Neues Zimmer frei bei D&T Homes" : "Neue Zimmer frei bei D&T Homes"),
    text: `Hallo,\n\n${abo.art === "wohnung" ? (n === 1 ? "Passend zu deinem Suchabo ist neu eine Wohnung frei:" : "Passend zu deinem Suchabo sind neue Wohnungen frei:") : "Passend zu deinem Suchabo sind neue Zimmer frei:"}\n\n${zeilen.join("\n\n")}\n\nFreie Plätze sind oft schnell weg. Wenn dich etwas interessiert, bewirb dich am besten direkt über den Link.\n\nLiebe Grüsse\nDein D&T Homes Team\n\nDu erhältst diese Mail, weil du auf dthomes.ch ein Suchabo eingerichtet hast. Abmelden: ${abmelden}`,
  };
}

async function senden(to: string, betreff: string, text: string, html: string, abmelden: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "D&T Homes <noreply@dthomes.ch>", to: [to], reply_to: "info@dthomes.ch", subject: betreff, html, text,
      headers: { "List-Unsubscribe": `<${abmelden}>` },
    }),
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
    const listeUrl = `${WEB}${en ? "/en" : ""}/${art === "wohnung" ? "wohnungen" : "zimmer"}`;
    const filter = [art === "wohnung" ? (en ? "Apartments" : "Wohnungen") : (en ? "Shared-flat rooms" : "WG-Zimmer"), orte.length ? orte.join(", ") : (en ? "All locations" : "Alle Orte"), max_miete ? (en ? "Up to " : "Bis ") + chf(max_miete) : (en ? "Any rent" : "Jede Miete")];
    const box = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;background:#ffffff;border:1px solid ${FARBE.line};border-radius:14px;border-collapse:separate;"><tr><td style="padding:20px 22px 22px;">
<div style="font-family:${SANS};font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:${FARBE.soft};margin:0 0 10px;">${en ? "Your alert" : "Dein Suchabo"}</div>
<div style="margin:0 0 14px;">${filter.map((c) => `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 11px;border-radius:999px;background:${FARBE.sand};font-family:${SANS};font-size:12.5px;color:${FARBE.ink};white-space:nowrap;">${e(c)}</span>`).join("")}</div>
${knopf(listeUrl, art === "wohnung" ? (en ? "See available apartments" : "Aktuell freie Wohnungen") : (en ? "See available rooms" : "Aktuell freie Zimmer"))}
</td></tr></table>`;
    const html = huelle({ en, vorschau: en ? "We'll let you know as soon as something new becomes available." : "Wir melden uns, sobald etwas Passendes frei wird.",
      titel: en ? "Your listing alert is active" : "Dein Suchabo ist aktiv",
      intro: e(en ? `Thanks for signing up! As soon as a new ${was}${wo}${bis} becomes available at D&T Homes, you'll get an email from us.` : `Danke für deine Anmeldung! Sobald bei D&T Homes ${art === "wohnung" ? "eine neue Wohnung" : "ein neues Zimmer"}${wo}${bis} frei wird, bekommst du eine Mail von uns.`),
      inhalt: box, abmelden, grund: en ? "You're receiving this email because you set up a listing alert on dthomes.ch." : "Du erhältst diese Mail, weil du auf dthomes.ch ein Suchabo eingerichtet hast." });
    try { await senden(email, m.betreff, m.text, html, abmelden); } catch (_e) { /* Abo gilt trotzdem */ }
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
        await senden(p.abo.email, m.betreff, m.text, m.html, `${WEB}${p.abo.sprache === "en" ? "/en" : ""}/suchabo?abmelden=${p.abo.token}`);
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
