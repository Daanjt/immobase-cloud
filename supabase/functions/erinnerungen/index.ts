// erinnerungen - taeglicher Cron-Job, nur per Mail (keine WhatsApp)
// 1) Vertraege (Miet- und Parkplatzvertraege), die versendet aber noch nicht unterschrieben sind:
//    1. Erinnerung 3 Tage nach Versand, 2. (letzte) Erinnerung 7 Tage nach Versand.
//    contracts.erinnerung_aus = true schaltet die Erinnerungen fuer einen Vertrag ab.
// 2) Parkplatz-Schluesselprotokolle, die versendet aber nicht bestaetigt sind: nach 3 und 7 Tagen.
// Uebernahme-/Abgabeprotokolle erinnert bereits process-handover-deadlines.
// Body {"dry":true} zeigt nur, wer eine Mail bekaeme.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { istAdminOderServer, verweigert } from "../_shared/auth.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTAL = "https://mieter.dthomes.ch";
const TAG = 86400000;
const STUFEN = [3, 7]; // Tage nach Versand
const OFFEN = ["gesendet", "geoeffnet", "geoeffnet_ungelesen"];
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const vorn = (v: unknown, en: boolean) => String(v || "").trim().split(/\s+/)[0] || (en ? "there" : "zusammen");

async function mail(to: string, betreff: string, text: string, en: boolean) {
  const r = await fetch(`${URL_}/functions/v1/send-message`, {
    method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to, betreff, text, sprache: en ? "en" : "de" }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
}

function vertragText(en: boolean, vorname: string, objekt: string, link: string, letzte: boolean) {
  if (en) return {
    betreff: letzte ? `Last reminder: please sign your contract` : `Reminder: please sign your contract`,
    text: `Hi ${vorname},\n\na friendly reminder: your contract${objekt ? ` for ${objekt}` : ""} is still waiting for your signature.\n\nYou can review and sign it here in a few minutes:\n${link}\n\nIf you have any questions or no longer need it, just reply to this email.\n\nBest regards\nYour D&T Homes Team`,
  };
  return {
    betreff: letzte ? `Letzte Erinnerung: bitte unterschreibe deinen Vertrag` : `Erinnerung: bitte unterschreibe deinen Vertrag`,
    text: `Hallo ${vorname},\n\neine kurze Erinnerung: Dein Vertrag${objekt ? ` für ${objekt}` : ""} wartet noch auf deine Unterschrift.\n\nDu kannst ihn hier in wenigen Minuten prüfen und unterschreiben:\n${link}\n\nFalls du Fragen hast oder ihn nicht mehr brauchst, antworte einfach auf diese Mail.\n\nLiebe Grüsse\nDein D&T Homes Team`,
  };
}

function schluesselText(en: boolean, vorname: string, platz: string, link: string) {
  if (en) return {
    betreff: `Reminder: please confirm your parking key`,
    text: `Hi ${vorname},\n\na friendly reminder: please confirm that you have received the key for your parking space${platz ? ` (${platz})` : ""}. Enter the key number shown on the key and sign, it only takes a minute:\n${link}\n\nBest regards\nYour D&T Homes Team`,
  };
  return {
    betreff: `Erinnerung: Parkplatzschlüssel bestätigen`,
    text: `Hallo ${vorname},\n\neine kurze Erinnerung: Bitte bestätige noch den Erhalt des Schlüssels für deinen Parkplatz${platz ? ` (${platz})` : ""}. Trag dazu die Schlüsselnummer ein, die auf dem Schlüssel steht, und unterschreibe. Das dauert nur eine Minute:\n${link}\n\nLiebe Grüsse\nDein D&T Homes Team`,
  };
}

Deno.serve(async (req) => {
  if (!(await istAdminOderServer(req))) return verweigert();
  const { dry } = await req.json().catch(() => ({}));
  const sb = createClient(URL_, KEY);
  const jetzt = Date.now();
  const res: any[] = [];

  // 1) Vertraege
  const { data: cs } = await sb.from("contracts").select("id, token, status, contract_type, contract_data, mieter_email, mieter_vorname, bewerber_id, sent_at, created_at, erinnerung_count, erinnerung_aus")
    .in("status", OFFEN).eq("erinnerung_aus", false).lt("erinnerung_count", STUFEN.length).limit(200);
  for (const c of cs || []) {
    const ab = Date.parse(c.sent_at || c.created_at);
    if (!c.mieter_email || !c.token || isNaN(ab)) continue;
    const nr = c.erinnerung_count || 0;
    if (jetzt - ab < STUFEN[nr] * TAG) continue;
    let sprache = "de";
    if (c.contract_type === "parkplatz" && c.contract_data?.sprache) sprache = c.contract_data.sprache;
    else if (c.bewerber_id) { const { data: b } = await sb.from("applicants").select("sprache").eq("id", c.bewerber_id).maybeSingle(); if (b?.sprache) sprache = b.sprache; }
    else { const { data: t } = await sb.from("tenants").select("sprache").ilike("email", c.mieter_email).limit(1); if (t?.[0]?.sprache) sprache = t[0].sprache; }
    const en = sprache === "en";
    const v = c.contract_data?.vertrag || {};
    const objekt = c.contract_type === "parkplatz"
      ? String(c.contract_data?.platz || c.contract_data?.bezeichnung || "").trim()
      : [v.adresse || v.apt?.adresse, v.ort || v.apt?.ort].filter(Boolean).join(", ");
    const link = `${PORTAL}/${c.token}${en ? "?lang=en" : ""}`;
    const m = vertragText(en, vorn(c.mieter_vorname, en), objekt, link, nr + 1 === STUFEN.length);
    if (dry) { res.push({ art: "vertrag", id: c.id, an: c.mieter_email, nr: nr + 1, betreff: m.betreff }); continue; }
    // zuerst hochzaehlen, damit bei Fehlern/Doppelstarts keine doppelten Mails rausgehen
    const { data: upd } = await sb.from("contracts").update({ erinnerung_count: nr + 1, erinnerung_at: new Date().toISOString() }).eq("id", c.id).eq("erinnerung_count", nr).select("id");
    if (!upd?.length) continue;
    try { await mail(c.mieter_email, m.betreff, m.text, en); res.push({ art: "vertrag", id: c.id, nr: nr + 1, ok: true }); }
    catch (e) { await sb.from("contracts").update({ erinnerung_count: nr }).eq("id", c.id); res.push({ art: "vertrag", id: c.id, error: String(e).slice(0, 200) }); }
  }

  // 2) Parkplatz-Schluesselprotokolle
  const { data: ps } = await sb.from("parkplaetze").select("id, bezeichnung, adresse, tenant_id, mieter_extern, mieter_email, sprache, schluessel_token, schluessel_gesendet_am, schluessel_erinnert_count")
    .not("schluessel_gesendet_am", "is", null).is("schluessel_bestaetigt_am", null).lt("schluessel_erinnert_count", STUFEN.length).limit(200);
  for (const p of ps || []) {
    const ab = Date.parse(p.schluessel_gesendet_am);
    const nr = p.schluessel_erinnert_count || 0;
    if (!p.schluessel_token || isNaN(ab) || jetzt - ab < STUFEN[nr] * TAG) continue;
    let email = p.mieter_email || "", vorname = p.mieter_extern || "", sprache = p.sprache || "de";
    if (p.tenant_id) { const { data: t } = await sb.from("tenants").select("email, vorname, sprache").eq("id", p.tenant_id).maybeSingle(); if (t) { email = t.email || email; vorname = t.vorname || vorname; sprache = t.sprache || sprache; } }
    if (!email) continue;
    const en = sprache === "en";
    const m = schluesselText(en, vorn(vorname, en), p.bezeichnung || "", `${PORTAL}/parkplatz-schluessel/${p.schluessel_token}`);
    if (dry) { res.push({ art: "schluessel", id: p.id, an: email, nr: nr + 1 }); continue; }
    const { data: upd } = await sb.from("parkplaetze").update({ schluessel_erinnert_count: nr + 1, schluessel_erinnert_at: new Date().toISOString() }).eq("id", p.id).eq("schluessel_erinnert_count", nr).select("id");
    if (!upd?.length) continue;
    try { await mail(email, m.betreff, m.text, en); res.push({ art: "schluessel", id: p.id, nr: nr + 1, ok: true }); }
    catch (e) { await sb.from("parkplaetze").update({ schluessel_erinnert_count: nr }).eq("id", p.id); res.push({ art: "schluessel", id: p.id, error: String(e).slice(0, 200) }); }
  }
  return json({ dry: !!dry, anzahl: res.length, res });
});
