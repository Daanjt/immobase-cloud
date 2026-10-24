// mieter-portal: Server-Funktion fuer das Mieterportal (mieter.dthomes.ch/p/<token>).
//
// Sicherheit
//  - Der persoenliche Link (tenants.portal_token) allein reicht nicht: Auf jedem neuen Geraet
//    kommt ein 6-stelliger Code an die E-Mail des Mieters. Danach gilt eine Geraete-Sitzung 90 Tage.
//  - Optional Face ID / Fingerabdruck (Passkey) statt Code.
//  - Ausweis und Betreibungsauszug werden nie ausgeliefert, nur "vorhanden".
//  - Link sperrbar (tenants.portal_gesperrt), Zugang endet 90 Tage nach Auszug.
//  - Alle Daten nur ueber diese Funktion (Service-Role), keine anon-Rechte auf die Tabellen.
//
// Aufrufe: POST JSON {aktion, ...}  oder multipart (aktion=hochladen|schaden).
// Geschuetzte Aktionen brauchen den Header x-portal-sitzung.
import { KREDITOR, qrInhalt, qrPng, b64 as b64Png } from "../_shared/qrrechnung.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  generateAuthenticationOptions, generateRegistrationOptions,
  verifyAuthenticationResponse, verifyRegistrationResponse,
} from "npm:@simplewebauthn/server@10.0.1";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(URL_, KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-portal-sitzung",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const fehler = (m: string, s = 400) => json({ error: m }, s);

const TAG = 86400000;
const SITZUNG_TAGE = 90;
const NACH_AUSZUG_TAGE = 90;
const KAT_AUSWEIS = "Pass / Ausweis", KAT_BETR = "Betreibungsregister-Auszug";
// Diese Dokumente darf der Mieter herunterladen
const DOWNLOAD = ["Untermietvertrag (unterzeichnet)", "Anfangsmietzinsformular (unterzeichnet)", "Verlängerung (unterzeichnet)", "Übergabeprotokoll", "Kautionsbestätigung"];
const BILDTYPEN = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"];
const DOKTYPEN = ["application/pdf", ...BILDTYPEN];

// ── Hilfen ────────────────────────────────────────────────────────────────
async function sha256(s: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function zufallHex(n: number) {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function parseDatum(x: unknown): Date | null {
  const s = String(x || "").trim();
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return null;
}
function maskiere(email: string) {
  const [u, d] = String(email || "").split("@");
  if (!d) return "";
  return (u.length <= 2 ? u[0] + "*" : u.slice(0, 2) + "*".repeat(Math.min(6, u.length - 2))) + "@" + d;
}
function sanitize(s: string) {
  return (s || "").replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}
function portalBasis(req: Request) {
  const o = req.headers.get("origin") || "";
  try { const h = new URL(o).hostname; if (h === "mieter.dthomes.ch" || /^immobase-sign[a-z0-9-]*\.vercel\.app$/.test(h)) return o; } catch (_) {}
  return "https://mieter.dthomes.ch";
}
function rp(req: Request) {
  const o = portalBasis(req);
  return { origin: o, rpID: new URL(o).hostname };
}
const b64url = {
  enc(b: Uint8Array) { let s = ""; b.forEach((x) => s += String.fromCharCode(x)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); },
  dec(s: string) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const b = atob(s); return Uint8Array.from(b, (c) => c.charCodeAt(0)); },
};

async function mail(to: string, betreff: string, text: string, en: boolean) {
  const r = await fetch(`${URL_}/functions/v1/send-message`, {
    method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to, betreff, text, sprache: en ? "en" : "de", ohneBcc: true }),
  });
  if (!r.ok) throw new Error("Mailversand fehlgeschlagen");
}

const MIETER_FELDER = "id, vorname, nachname, email, phone, sprache, status, deleted_at, portal_gesperrt, portal_token, nachfolge_token, auszug, einzug, apt_id, room_id, bewerber_id, mietzins, strom, personen, kaution_betrag, kaution_monate";

// Prueft, ob der Mieter das Portal (noch) nutzen darf
function zugangOk(t: any) {
  if (!t || t.deleted_at || t.portal_gesperrt) return false;
  const aus = parseDatum(t.auszug);
  if (aus && Date.now() > aus.getTime() + NACH_AUSZUG_TAGE * TAG) return false;
  return true;
}
async function mieterPerToken(token: string) {
  if (!/^[a-f0-9]{32}$/.test(token || "")) return null;
  const { data } = await sb.from("tenants").select(MIETER_FELDER).eq("portal_token", token).maybeSingle();
  return zugangOk(data) ? data : null;
}
async function mieterPerSitzung(req: Request) {
  const s = req.headers.get("x-portal-sitzung") || "";
  if (!/^[a-f0-9]{64}$/.test(s)) return null;
  const { data: z } = await sb.from("portal_sitzungen").select("id, tenant_id, ablauf, widerrufen, zuletzt").eq("sitzung_hash", await sha256(s)).maybeSingle();
  if (!z || z.widerrufen || new Date(z.ablauf).getTime() < Date.now()) return null;
  const { data: t } = await sb.from("tenants").select(MIETER_FELDER).eq("id", z.tenant_id).maybeSingle();
  if (!zugangOk(t)) return null;
  if (Date.now() - new Date(z.zuletzt).getTime() > 5 * 60000) await sb.from("portal_sitzungen").update({ zuletzt: new Date().toISOString() }).eq("id", z.id);
  return { t, sitzungId: z.id as string };
}
async function neueSitzung(tenantId: string, geraet: string, art: string) {
  const s = zufallHex(32);
  await sb.from("portal_sitzungen").insert({ tenant_id: tenantId, sitzung_hash: await sha256(s), geraet: String(geraet || "").slice(0, 120), art, ablauf: new Date(Date.now() + SITZUNG_TAGE * TAG).toISOString() });
  return s;
}

// ── Aktionen ohne Sitzung ─────────────────────────────────────────────────
async function start(b: any, req: Request) {
  const t = await mieterPerToken(b.token);
  if (!t) return fehler("Dieser Link ist ungültig oder nicht mehr aktiv.", 404);
  const { count } = await sb.from("portal_passkeys").select("id", { count: "exact", head: true }).eq("tenant_id", t.id).eq("rp_id", rp(req).rpID);
  return json({ vorname: t.vorname || "", email: maskiere(t.email), sprache: t.sprache === "en" ? "en" : "de", passkey: (count || 0) > 0, hatEmail: !!t.email });
}

async function codeSenden(b: any) {
  const t = await mieterPerToken(b.token);
  if (!t) return fehler("Dieser Link ist ungültig oder nicht mehr aktiv.", 404);
  if (!t.email) return fehler("Für dich ist keine E-Mail-Adresse hinterlegt. Bitte melde dich bei uns.");
  const seit = new Date(Date.now() - 3600000).toISOString();
  const { count } = await sb.from("portal_codes").select("id", { count: "exact", head: true }).eq("tenant_id", t.id).gte("created_at", seit);
  if ((count || 0) >= 5) return fehler("Zu viele Codes angefordert. Bitte versuche es in einer Stunde nochmals.", 429);
  const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  await sb.from("portal_codes").insert({ tenant_id: t.id, code_hash: await sha256(t.id + ":" + code), ablauf: new Date(Date.now() + 10 * 60000).toISOString() });
  const en = t.sprache === "en";
  await mail(t.email,
    en ? `Your login code: ${code}` : `Dein Anmeldecode: ${code}`,
    en ? `Hi ${t.vorname || ""},\n\nyour code for the D&T Homes tenant portal is:\n\n${code}\n\nThe code is valid for 10 minutes. If you did not request it, you can ignore this email.\n\nBest regards\nYour D&T Homes Team`
       : `Hallo ${t.vorname || ""},\n\ndein Code für das D&T Homes Mieterportal lautet:\n\n${code}\n\nDer Code ist 10 Minuten gültig. Falls du ihn nicht angefordert hast, kannst du diese Mail ignorieren.\n\nLiebe Grüsse\nDein D&T Homes Team`, en);
  return json({ ok: true });
}

async function codePruefen(b: any) {
  const t = await mieterPerToken(b.token);
  if (!t) return fehler("Dieser Link ist ungültig oder nicht mehr aktiv.", 404);
  const { data: c } = await sb.from("portal_codes").select("id, code_hash, versuche, verwendet, ablauf").eq("tenant_id", t.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!c || c.verwendet || new Date(c.ablauf).getTime() < Date.now()) return fehler("Der Code ist abgelaufen. Bitte fordere einen neuen an.");
  if (c.versuche >= 5) return fehler("Zu viele Versuche. Bitte fordere einen neuen Code an.");
  const ok = c.code_hash === await sha256(t.id + ":" + String(b.code || "").replace(/\D/g, ""));
  if (!ok) { await sb.from("portal_codes").update({ versuche: c.versuche + 1 }).eq("id", c.id); return fehler("Der Code stimmt nicht."); }
  await sb.from("portal_codes").update({ verwendet: true }).eq("id", c.id);
  return json({ sitzung: await neueSitzung(t.id, b.geraet, "code") });
}

async function linkAnfordern(b: any, req: Request) {
  const email = String(b.email || "").trim().toLowerCase();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    const { data: ts } = await sb.from("tenants").select(MIETER_FELDER).ilike("email", email);
    for (const t of (ts || []).filter(zugangOk)) {
      const seit = new Date(Date.now() - 10 * 60000).toISOString();
      const { count } = await sb.from("portal_challenges").select("id", { count: "exact", head: true }).eq("tenant_id", t.id).eq("zweck", "linkmail").gte("created_at", seit);
      if ((count || 0) > 0) continue;
      await sb.from("portal_challenges").insert({ tenant_id: t.id, challenge: "-", zweck: "linkmail", ablauf: new Date().toISOString() });
      const en = t.sprache === "en";
      const link = `${portalBasis(req)}/p/${t.portal_token}`;
      await mail(t.email, en ? "Your link to the tenant portal" : "Dein Link zum Mieterportal",
        en ? `Hi ${t.vorname || ""},\n\nhere is your personal link to the D&T Homes tenant portal:\n\n${link}\n\nBest regards\nYour D&T Homes Team`
           : `Hallo ${t.vorname || ""},\n\nhier ist dein persönlicher Link zum D&T Homes Mieterportal:\n\n${link}\n\nLiebe Grüsse\nDein D&T Homes Team`, en);
    }
  }
  // Immer gleiche Antwort, damit niemand herausfinden kann, welche Adressen Mieter sind
  return json({ ok: true });
}

// ── Passkeys (Face ID / Fingerabdruck) ────────────────────────────────────
async function pkLoginOptionen(b: any, req: Request) {
  const t = await mieterPerToken(b.token);
  if (!t) return fehler("Dieser Link ist ungültig oder nicht mehr aktiv.", 404);
  const { rpID } = rp(req);
  const { data: keys } = await sb.from("portal_passkeys").select("credential_id, transports").eq("tenant_id", t.id).eq("rp_id", rpID);
  if (!keys || !keys.length) return fehler("Auf diesem Gerät ist keine Face ID eingerichtet.");
  const opt = await generateAuthenticationOptions({ rpID, userVerification: "required",
    allowCredentials: keys.map((k: any) => ({ id: k.credential_id, transports: k.transports || undefined })) });
  await sb.from("portal_challenges").insert({ tenant_id: t.id, challenge: opt.challenge, zweck: "anmelden", ablauf: new Date(Date.now() + 5 * 60000).toISOString() });
  return json(opt);
}
async function pkLogin(b: any, req: Request) {
  const t = await mieterPerToken(b.token);
  if (!t) return fehler("Dieser Link ist ungültig oder nicht mehr aktiv.", 404);
  const { rpID, origin } = rp(req);
  const antwort = b.antwort || {};
  const { data: key } = await sb.from("portal_passkeys").select("*").eq("tenant_id", t.id).eq("rp_id", rpID).eq("credential_id", antwort.id).maybeSingle();
  if (!key) return fehler("Face ID nicht erkannt. Bitte melde dich mit Code an.");
  const { data: ch } = await sb.from("portal_challenges").select("id, challenge").eq("tenant_id", t.id).eq("zweck", "anmelden").gte("ablauf", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!ch) return fehler("Die Anfrage ist abgelaufen. Bitte nochmals versuchen.");
  let v;
  try {
    v = await verifyAuthenticationResponse({ response: antwort, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
      authenticator: { credentialID: key.credential_id, credentialPublicKey: b64url.dec(key.public_key), counter: Number(key.zaehler) || 0, transports: key.transports || undefined } });
  } catch (_) { return fehler("Face ID konnte nicht bestätigt werden."); }
  await sb.from("portal_challenges").update({ ablauf: new Date().toISOString() }).eq("id", ch.id);
  if (!v.verified) return fehler("Face ID konnte nicht bestätigt werden.");
  await sb.from("portal_passkeys").update({ zaehler: v.authenticationInfo.newCounter, zuletzt: new Date().toISOString() }).eq("id", key.id);
  return json({ sitzung: await neueSitzung(t.id, b.geraet, "passkey") });
}
async function pkRegOptionen(t: any, req: Request) {
  const { rpID } = rp(req);
  const { data: keys } = await sb.from("portal_passkeys").select("credential_id").eq("tenant_id", t.id).eq("rp_id", rpID);
  const opt = await generateRegistrationOptions({
    rpName: "D&T Homes Mieterportal", rpID, userName: t.email || t.id, userDisplayName: `${t.vorname || ""} ${t.nachname || ""}`.trim(),
    attestationType: "none", authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    excludeCredentials: (keys || []).map((k: any) => ({ id: k.credential_id })),
  });
  await sb.from("portal_challenges").insert({ tenant_id: t.id, challenge: opt.challenge, zweck: "registrieren", ablauf: new Date(Date.now() + 5 * 60000).toISOString() });
  return json(opt);
}
async function pkReg(t: any, b: any, req: Request) {
  const { rpID, origin } = rp(req);
  const { data: ch } = await sb.from("portal_challenges").select("id, challenge").eq("tenant_id", t.id).eq("zweck", "registrieren").gte("ablauf", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!ch) return fehler("Die Anfrage ist abgelaufen. Bitte nochmals versuchen.");
  let v;
  try { v = await verifyRegistrationResponse({ response: b.antwort, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true }); }
  catch (_) { return fehler("Face ID konnte nicht eingerichtet werden."); }
  await sb.from("portal_challenges").update({ ablauf: new Date().toISOString() }).eq("id", ch.id);
  if (!v.verified || !v.registrationInfo) return fehler("Face ID konnte nicht eingerichtet werden.");
  const ri: any = v.registrationInfo;
  await sb.from("portal_passkeys").insert({ tenant_id: t.id, rp_id: rpID, credential_id: ri.credentialID, public_key: b64url.enc(ri.credentialPublicKey),
    zaehler: ri.counter || 0, transports: b.antwort?.response?.transports || null, geraet: String(b.geraet || "").slice(0, 120) });
  return json({ ok: true });
}


// ── Kündigung ─────────────────────────────────────────────────────────────
// Gleiche Regeln wie im Untermietvertrag (ImmoBase 06-vertraege.jsx, Ziffer 2 und 9) und im Nachtrag:
//  - Frist laut Vertrag (Standard 3 Monate) auf ein Monatsende, ausser auf Ende Dezember
//  - befristet = Vertragsende gesetzt UND (Dauer < 12 Monate ODER Wohnung ODER Liegenschaft immer befristet)
//  - befristet < 12 Monate: ordentliche Kündigung ausgeschlossen (nur Nachmieter)
//  - befristete Wohnung: nur auf einen Termin mind. 12 Monate vor Vertragsende
//  - befristetes Zimmer >= 12 Monate: nur auf einen Termin mind. 6 Monate vor Vertragsende
//  - unbefristet: frühestens nach der Mindestmietdauer (Standard 6 Monate)
//  - unterschriebene Verlängerung: während der Verlängerungsdauer keine Kündigung
const MONAT = TAG * 30.44;
function monatsende(y: number, m: number) { return new Date(Date.UTC(y, m + 1, 0)); }
function fmt(d: Date) { return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`; }
const istDez = (d: Date) => d.getUTCMonth() === 11;
// letztmöglicher Termin: Monatsende mind. n Monate vor dem Vertragsende, nicht Ende Dezember
function letzterTermin(ende: Date, n: number) {
  let lt = monatsende(ende.getUTCFullYear(), ende.getUTCMonth() - n);
  const grenze = new Date(Date.UTC(ende.getUTCFullYear(), ende.getUTCMonth() - n, ende.getUTCDate()));
  if (lt.getTime() > grenze.getTime()) lt = monatsende(ende.getUTCFullYear(), ende.getUTCMonth() - n - 1);
  if (istDez(lt)) lt = monatsende(lt.getUTCFullYear(), 10);
  return lt;
}
async function vertragVon(t: any) {
  const ors = [`tenant_id.eq.${t.id}`]; if (t.bewerber_id) ors.push(`bewerber_id.eq.${t.bewerber_id}`);
  const { data } = await sb.from("contracts").select("contract_type, status, signed_at, contract_data").or(ors.join(","))
    .in("contract_type", ["untermietvertrag_und_anfangsmietzins", "verlaengerung"]).in("status", ["signiert", "mieter_signiert"])
    .order("signed_at", { ascending: false });
  const liste = data || [];
  return {
    haupt: liste.find((c: any) => c.contract_type === "untermietvertrag_und_anfangsmietzins")?.contract_data?.vertrag || null,
    verl: liste.find((c: any) => c.contract_type === "verlaengerung")?.contract_data?.vertrag || null,
  };
}
async function kuendigungsInfo(t: any, apt: any) {
  const h = new Date();
  const { haupt: v, verl } = await vertragVon(t);
  const wohnung = v ? !!(v.vertragsart === "wohnung" || v.apt?.vermietungsart === "wohnung") : apt?.vermietungsart === "wohnung";
  const frist = Math.max(1, +(v?.kuendigungsfrist) || 3);
  let frueh = monatsende(h.getUTCFullYear(), h.getUTCMonth() + frist);
  const basis = { frist, termine: [] as string[], nurNachmieter: false, hinweis: "", vertragsende: "", letzterTermin: "", spaetestens: "", minBis: "", wohnung, quelle: v ? "vertrag" : "wohnung" };

  // 1) Laufende Verlängerung: Kündigung ausgeschlossen
  const verlEnde = verl ? parseDatum(verl.mietende) : null;
  if (verlEnde && verlEnde.getTime() > h.getTime()) return { ...basis, nurNachmieter: true, hinweis: "verlaengerung", vertragsende: fmt(verlEnde) };

  const beginn = parseDatum(v?.einzug);
  const ende = parseDatum(v ? (v.mietende || v.apt?.mietende) : (apt?.immer_befristet ? apt?.mietende : null));
  const monate = beginn && ende && ende > beginn ? (ende.getTime() - beginn.getTime()) / MONAT : 0;
  const befristet = v ? (monate > 0 && (monate < 12 || wohnung || !!v.apt?.immer_befristet)) : !!ende;
  let bis: Date | null = null;
  if (befristet && ende) {
    basis.vertragsende = fmt(ende);
    if (v && monate < 12) return { ...basis, nurNachmieter: true, hinweis: "kurz" };
    bis = letzterTermin(ende, wohnung ? 12 : 6);
    if (beginn && monatsende(bis.getUTCFullYear(), bis.getUTCMonth() - frist).getTime() < beginn.getTime()) return { ...basis, nurNachmieter: true, hinweis: "fest" };
    basis.letzterTermin = fmt(bis);
    basis.spaetestens = fmt(monatsende(bis.getUTCFullYear(), bis.getUTCMonth() - frist));
  } else if (beginn) {
    // unbefristet: Mindestmietdauer
    const min = Math.max(0, +(v?.minMietdauer) || 6);
    const minEnde = new Date(Date.UTC(beginn.getUTCFullYear(), beginn.getUTCMonth() + min, beginn.getUTCDate()) - TAG);
    if (frueh.getTime() < minEnde.getTime()) { frueh = monatsende(minEnde.getUTCFullYear(), minEnde.getUTCMonth()); basis.minBis = fmt(minEnde); }
  }
  // Endet das Hauptmietverhältnis der Liegenschaft, sind spätere Termine sinnlos
  const hausEnde = parseDatum(apt?.mietende);
  if (!bis && hausEnde) {
    if (frueh.getTime() >= hausEnde.getTime()) return { ...basis, nurNachmieter: true, hinweis: "endet", vertragsende: fmt(hausEnde) };
    bis = new Date(hausEnde.getTime() - TAG);
  }
  for (let i = 0; i < 24 && basis.termine.length < 12; i++) {
    const d = monatsende(frueh.getUTCFullYear(), frueh.getUTCMonth() + i);
    if (bis && d.getTime() > bis.getTime()) break;
    if (!istDez(d)) basis.termine.push(fmt(d));
  }
  if (!basis.termine.length) return { ...basis, nurNachmieter: true, hinweis: bis ? "fest" : "keine" };
  return basis;
}
// Zimmermieter haben oft nur room_id: dann die Wohnung über das Zimmer bestimmen
async function aptIdVon(t: any) {
  if (t.apt_id) return t.apt_id as string;
  if (!t.room_id) return null;
  const { data } = await sb.from("rooms").select("apt_id").eq("id", t.room_id).maybeSingle();
  return (data?.apt_id as string) || null;
}
async function ladeApt(t: any) {
  const id = await aptIdVon(t);
  if (!id) return null;
  const { data } = await sb.from("apartments").select("id, adresse, plz, ort, stockwerk, vermietungsart, mietende, immer_befristet").eq("id", id).maybeSingle();
  return data;
}


// ── Nachfolge-Link: der Mieter teilt ihn selbst, der Nachmieter bewirbt sich damit direkt auf dieses Objekt ──
async function nachfolgeToken(t: any) {
  if (t.nachfolge_token) return t.nachfolge_token as string;
  const tok = zufallHex(12);
  await sb.from("tenants").update({ nachfolge_token: tok }).eq("id", t.id).is("nachfolge_token", null);
  const { data } = await sb.from("tenants").select("nachfolge_token").eq("id", t.id).maybeSingle();
  t.nachfolge_token = data?.nachfolge_token || tok;
  return t.nachfolge_token as string;
}
function nachfolgeLink(tok: string, wohnung: boolean, en: boolean) {
  return `https://www.dthomes.ch${en ? "/en" : ""}/${wohnung ? "wohnungen" : "zimmer"}?nachfolge=${tok}`;
}
async function nachfolgeRaum(t: any, apt: any) {
  if (t.room_id) return t.room_id as string;
  if (!apt) return null;
  const { data } = await sb.from("rooms").select("id").eq("apt_id", apt.id).order("id").limit(1);
  return data && data[0] ? data[0].id as string : null;
}
async function freiAb(t: any) {
  const { data: k } = await sb.from("kuendigungen").select("datum").eq("tenant_id", t.id).eq("art", "kuendigung").in("status", ["eingereicht", "bestaetigt"]).order("created_at", { ascending: false }).limit(1);
  const d = parseDatum(k && k[0] ? k[0].datum : t.auszug);
  return d ? fmt(new Date(d.getTime() + TAG)) : "";
}
// Oeffentlich: die Webseite fragt mit dem Token, welches Objekt gemeint ist
async function nachfolgeInfo(b: any) {
  const tok = String(b.token || "");
  if (!/^[a-f0-9]{24}$/.test(tok)) return fehler("Link ungültig.", 404);
  const { data: t } = await sb.from("tenants").select(MIETER_FELDER).eq("nachfolge_token", tok).maybeSingle();
  if (!zugangOk(t)) return fehler("Link ungültig.", 404);
  const apt = await ladeApt(t);
  const room = await nachfolgeRaum(t, apt);
  if (!apt || !room) return fehler("Link ungültig.", 404);
  return json({ apt_id: apt.id, room_id: room, wohnung: apt.vermietungsart === "wohnung", frei_ab: await freiAb(t), vorname: t.vorname || "" });
}

// ── Aktionen mit Sitzung ──────────────────────────────────────────────────
async function uebersicht(t: any, sitzungId: string, req: Request) {
  const [apt, { data: room }] = await Promise.all([
    ladeApt(t),
    t.room_id ? sb.from("rooms").select("id, miete").eq("id", t.room_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const { data: lg } = apt?.adresse ? await sb.from("liegenschaften").select("hausinfos, hausinfos_en").eq("adresse", apt.adresse).maybeSingle() : { data: null };
  const { data: ho } = await sb.from("handover_protocols").select("token, type, status, deadline, submitted_at, closed_at, auto_accepted_at").eq("tenant_id", t.id).neq("status", "cancelled").order("started_at", { ascending: false }).limit(3);
  const { data: kd } = await sb.from("kuendigungen").select("id, art, datum, status, antwort, nachmieter_name, created_at").eq("tenant_id", t.id).order("created_at", { ascending: false }).limit(10);
  const ent: [string, string][] = [["tenant", String(t.id)]];
  if (t.bewerber_id) ent.push(["applicant", String(t.bewerber_id)]);
  const docs: any[] = [];
  for (const [typ, id] of ent) {
    const { data } = await sb.from("documents").select("id, category, filename, uploaded_at").eq("entity_type", typ).eq("entity_id", id);
    (data || []).forEach((d: any) => docs.push(d));
  }
  const dokumente = docs.filter((d) => DOWNLOAD.includes(d.category))
    .sort((a, b) => String(b.uploaded_at).localeCompare(String(a.uploaded_at)))
    .map((d) => ({ id: d.id, kategorie: d.category, name: d.filename, datum: d.uploaded_at }));
  const { data: sch } = await sb.from("schadenmeldungen").select("id, titel, beschreibung, ort_im_objekt, dringlichkeit, status, antwort, created_at, erledigt_at, fotos").eq("tenant_id", t.id).order("created_at", { ascending: false }).limit(30);
  const { data: sitz } = await sb.from("portal_sitzungen").select("id, geraet, art, created_at, zuletzt").eq("tenant_id", t.id).eq("widerrufen", false).gte("ablauf", new Date().toISOString()).order("zuletzt", { ascending: false });
  const { count: pk } = await sb.from("portal_passkeys").select("id", { count: "exact", head: true }).eq("tenant_id", t.id).eq("rp_id", rp(req).rpID);
  const wohnung = apt?.vermietungsart === "wohnung";
  return json({
    mieter: { vorname: t.vorname || "", nachname: t.nachname || "", email: t.email || "", sprache: t.sprache === "en" ? "en" : "de" },
    miete: {
      wohnung, objekt: wohnung ? null : (room?.id || t.room_id || null),
      adresse: apt ? [apt.adresse, [apt.plz, apt.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "",
      stockwerk: apt?.stockwerk || "",
      mietzins: t.mietzins != null && t.mietzins !== "" ? +t.mietzins : (room?.miete != null ? +room.miete : null),
      strom: t.strom != null && t.strom !== "" ? +t.strom : (wohnung ? (Math.max(1, +t.personen || 1) * 25) : 25),
      einzug: t.einzug || "", auszug: t.auszug || "", mietende: apt?.immer_befristet ? (apt?.mietende || "") : "",
      kaution: t.kaution_betrag != null ? +t.kaution_betrag : null,
    },
    dokumente,
    unterlagen: { ausweis: docs.some((d) => d.category === KAT_AUSWEIS), betreibung: docs.some((d) => d.category === KAT_BETR) },
    schaeden: (sch || []).map((s: any) => ({ ...s, fotos: (s.fotos || []).length })),
    sitzungen: (sitz || []).map((s: any) => ({ ...s, aktuell: s.id === sitzungId })),
    passkey: (pk || 0) > 0,
    // WLAN in allen WG-Zimmern gleich (wie in der Uebernahme-Mail); ganze Wohnungen haben eigenes Internet
    wlan: wohnung ? null : { name: "D&T Homes", passwort: "Welcome!" },
    hausinfos: (t.sprache === "en" ? (lg?.hausinfos_en || lg?.hausinfos) : (lg?.hausinfos || lg?.hausinfos_en)) || "",
    hausinfos_de: lg?.hausinfos || lg?.hausinfos_en || "",
    hausinfos_en: lg?.hausinfos_en || lg?.hausinfos || "",
    kuendigung: { ...(await kuendigungsInfo(t, apt)), eintraege: kd || [] },
    uebergabe: (ho || []).map((h: any) => ({
      typ: h.type || "einzug", status: h.status, frist: h.deadline,
      offen: ["sent", "in_progress"].includes(h.status),
      link: ["sent", "in_progress"].includes(h.status) && h.token ? `${portalBasis(req)}/uebernahme/${h.token}` : null,
      fertig: h.closed_at || h.auto_accepted_at || h.submitted_at || null,
    })),
    ...(await kostenUndZahlung(t, apt, room)),
    nachfolge: { link: nachfolgeLink(await nachfolgeToken(t), wohnung, t.sprache === "en"), frei_ab: await freiAb(t) },
  });
}


// Mietkosten aus dem unterschriebenen Vertrag (Fallback: Werte beim Mieter) und Zahlungsangaben mit QR-Rechnung pro Mieter (ohne Betrag: neutral)
async function kostenUndZahlung(t: any, apt: any, room: any) {
  const { haupt: v } = await vertragVon(t);
  const zahl = (x: unknown) => (x == null || x === "" || isNaN(+x!)) ? null : +x!;
  const wohnung = apt?.vermietungsart === "wohnung";
  let netto = zahl(v?.nettomiete), nk = zahl(v?.nebenkosten), brutto = zahl(v?.bruttomiete), strom = zahl(v?.strom);
  const service = zahl(v?.aufschlag) || 0;
  if (brutto == null) brutto = zahl(t.mietzins) ?? zahl(room?.miete);
  if (brutto != null && netto == null && nk != null) netto = brutto - nk;
  if (strom == null) strom = zahl(t.strom) ?? (wohnung ? Math.max(1, +t.personen || 1) * 25 : 25);
  const total = zahl(v?.total) ?? ((brutto || 0) + (strom || 0) + service);
  const name = `${t.vorname || ""} ${t.nachname || ""}`.trim();
  const referenz = `Miete ${apt?.adresse || ""} & ${name}`.replace(/\s+/g, " ").trim();
  let qr: string | null = null;
  try { qr = "data:image/png;base64," + b64Png(await qrPng(total > 0 ? qrInhalt(total, referenz) : qrInhalt(null, ""), 6)); } catch (e) { console.error("qr", e); }
  const km = v?.kautionMonate == null ? (t.kaution_monate == null ? null : +t.kaution_monate) : +v.kautionMonate;
  return {
    kosten: { netto, nebenkosten: nk, brutto, strom, service, total, personen: wohnung ? Math.max(1, +(v?.personen || t.personen) || 1) : null },
    zahlung: { empfaenger: `${KREDITOR.name}, ${KREDITOR.strasse} ${KREDITOR.nr}, ${KREDITOR.plz} ${KREDITOR.ort}`, bank: KREDITOR.bank, iban: KREDITOR.ibanLesbar, bic: KREDITOR.bic, betrag: total, referenz, qr },
    kaution: { betrag: zahl(v?.kautionBetrag) ?? zahl(t.kaution_betrag), monate: km, evorest: km == null ? null : km > 0 },
  };
}

async function dokumentUrl(t: any, b: any) {
  const { data: d } = await sb.from("documents").select("id, category, entity_type, entity_id, storage_path, filename").eq("id", b.id).maybeSingle();
  const eigen = d && ((d.entity_type === "tenant" && d.entity_id === String(t.id)) || (d.entity_type === "applicant" && t.bewerber_id && d.entity_id === String(t.bewerber_id)));
  if (!eigen || !DOWNLOAD.includes(d.category)) return fehler("Dokument nicht gefunden.", 404);
  const { data: u } = await sb.storage.from("documents").createSignedUrl(d.storage_path, 120, { download: d.filename });
  if (!u?.signedUrl) return fehler("Dokument konnte nicht geladen werden.", 500);
  return json({ url: u.signedUrl });
}

async function hochladen(t: any, fd: FormData) {
  const art = String(fd.get("art") || "");
  const kat = art === "ausweis" ? KAT_AUSWEIS : art === "betreibung" ? KAT_BETR : null;
  const file = fd.get("file");
  if (!kat) return fehler("Unbekannte Dokumentart.");
  if (!(file instanceof File)) return fehler("Keine Datei.");
  if (file.size > 15 * 1024 * 1024) return fehler("Datei zu gross (max. 15 MB).");
  const typ = (file.type || "").toLowerCase();
  if (!DOKTYPEN.includes(typ)) return fehler("Bitte ein PDF oder Foto (JPG, PNG, HEIC) hochladen.");
  const ext = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "pdf";
  const name = `${sanitize(t.nachname)}_${sanitize(t.vorname)}_${sanitize(kat)}.${ext}`;
  const pfad = `tenant/${t.id}/${Date.now()}_${name}`;
  const { error: e1 } = await sb.storage.from("documents").upload(pfad, file, { contentType: typ, upsert: false });
  if (e1) return fehler("Upload fehlgeschlagen.", 500);
  const { error: e2 } = await sb.from("documents").insert([{ entity_type: "tenant", entity_id: String(t.id), category: kat, filename: name, storage_path: pfad, file_size: file.size, mime_type: typ, uploaded_by: "Mieterportal" }]);
  if (e2) { await sb.storage.from("documents").remove([pfad]); return fehler("Speichern fehlgeschlagen.", 500); }
  return json({ ok: true });
}

async function schadenMelden(t: any, fd: FormData) {
  const titel = String(fd.get("titel") || "").trim().slice(0, 140);
  if (!titel) return fehler("Bitte kurz beschreiben, was kaputt ist.");
  const dr = String(fd.get("dringlichkeit") || "normal");
  const fotos = fd.getAll("fotos").filter((f) => f instanceof File) as File[];
  if (fotos.length > 6) return fehler("Maximal 6 Fotos.");
  for (const f of fotos) {
    if (f.size > 10 * 1024 * 1024) return fehler("Ein Foto ist zu gross (max. 10 MB).");
    if (!BILDTYPEN.includes((f.type || "").toLowerCase())) return fehler("Bitte nur Fotos hochladen (JPG, PNG, HEIC).");
  }
  const { data: row, error } = await sb.from("schadenmeldungen").insert({
    tenant_id: t.id, apt_id: await aptIdVon(t), room_id: t.room_id, titel,
    beschreibung: String(fd.get("beschreibung") || "").trim().slice(0, 4000) || null,
    ort_im_objekt: String(fd.get("ort") || "").trim().slice(0, 140) || null,
    dringlichkeit: ["normal", "dringend", "notfall"].includes(dr) ? dr : "normal",
  }).select("id").single();
  if (error || !row) return fehler("Meldung konnte nicht gespeichert werden.", 500);
  const pfade: string[] = [];
  for (let i = 0; i < fotos.length; i++) {
    const f = fotos[i];
    const ext = (f.type.split("/")[1] || "jpg").replace("jpeg", "jpg").slice(0, 4);
    const pfad = `schaden/${t.id}/${row.id}/${i + 1}.${ext}`;
    const { error: e } = await sb.storage.from("documents").upload(pfad, f, { contentType: f.type, upsert: true });
    if (!e) pfade.push(pfad);
  }
  if (pfade.length) await sb.from("schadenmeldungen").update({ fotos: pfade }).eq("id", row.id);
  return json({ ok: true, id: row.id });
}


async function kuendigen(t: any, b: any) {
  const apt = await ladeApt(t);
  const info = await kuendigungsInfo(t, apt);
  if (info.nurNachmieter) return fehler("Eine Kündigung ist für dich nicht mehr möglich. Du kannst aber einen Nachmieter vorschlagen.");
  const datum = String(b.datum || "");
  if (!info.termine.includes(datum)) return fehler("Bitte wähle einen gültigen Termin.");
  if (!b.bestaetigt) return fehler("Bitte bestätige die Kündigung.");
  const { data: offen } = await sb.from("kuendigungen").select("id").eq("tenant_id", t.id).eq("art", "kuendigung").in("status", ["eingereicht", "bestaetigt"]).limit(1);
  if (offen && offen.length) return fehler("Du hast bereits gekündigt. Bei Fragen melde dich bitte bei uns.");
  const { error } = await sb.from("kuendigungen").insert({ tenant_id: t.id, art: "kuendigung", datum, grund: String(b.grund || "").trim().slice(0, 1000) || null, status: "eingereicht" });
  if (error) return fehler("Kündigung konnte nicht gespeichert werden.", 500);
  const en = t.sprache === "en";
  const wohnung = apt?.vermietungsart === "wohnung";
  const plink = t.portal_token ? `https://mieter.dthomes.ch/p/${t.portal_token}` : "";
  if (t.email) await mail(t.email, en ? "We have received your notice" : "Wir haben deine Kündigung erhalten",
    en ? `Hi ${t.vorname || ""},\n\nthank you for letting us know. We have received your notice of termination effective ${datum}.\n\nWe are sorry to see you go! We hope you have enjoyed living ${wohnung ? "in your apartment" : "with us"} and that you will keep good memories of your time here.\n\nWe will check your notice and send you a confirmation shortly. We will then get in touch with you in good time to arrange the handover.\n\nIf you would like to move out earlier, you can suggest a successor tenant in the tenant portal at any time. And if we can help you with the final cleaning or your move, you will also find this in the tenant portal under "Cleaning & moving".${plink ? `\n\nTenant portal: ${plink}` : ""}\n\nIf you have any questions, we are always happy to help.\n\nBest regards\nYour D&T Homes Team`
       : `Hallo ${t.vorname || ""},\n\ndanke für deine Nachricht. Wir haben deine Kündigung per ${datum} erhalten.\n\nSchade, dass du gehst! Wir hoffen, du hast dich ${wohnung ? "in deiner Wohnung" : "bei uns"} wohlgefühlt und nimmst schöne Erinnerungen mit.\n\nWir prüfen deine Kündigung und schicken dir in Kürze eine Bestätigung. Für die Übergabe melden wir uns dann rechtzeitig bei dir.\n\nFalls du früher ausziehen möchtest, kannst du im Mieterportal jederzeit einen Nachmieter vorschlagen. Und wenn wir dir bei der Endreinigung oder beim Umzug helfen können, findest du das ebenfalls im Mieterportal unter "Reinigung & Umzug".${plink ? `\n\nMieterportal: ${plink}` : ""}\n\nBei Fragen sind wir jederzeit gerne für dich da.\n\nLiebe Grüsse\nDein D&T Homes Team`, en);
  return json({ ok: true });
}

async function nachmieter(t: any, b: any) {
  const name = String(b.name || "").trim().slice(0, 120);
  const email = String(b.email || "").trim().toLowerCase().slice(0, 160);
  const telefon = String(b.telefon || "").trim().slice(0, 40);
  if (!name) return fehler("Bitte den Namen angeben.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fehler("Bitte eine gültige E-Mail-Adresse angeben.");
  const seit = new Date(Date.now() - TAG).toISOString();
  const { count } = await sb.from("kuendigungen").select("id", { count: "exact", head: true }).eq("tenant_id", t.id).eq("art", "nachmieter").gte("created_at", seit);
  if ((count || 0) >= 5) return fehler("Du hast heute schon mehrere Nachmieter vorgeschlagen. Bitte versuche es morgen wieder.", 429);
  const { error } = await sb.from("kuendigungen").insert({ tenant_id: t.id, art: "nachmieter", nachmieter_name: name, nachmieter_email: email, nachmieter_telefon: telefon || null, status: "eingereicht" });
  if (error) return fehler("Konnte nicht gespeichert werden.", 500);
  const apt = await ladeApt(t);
  const wohnung = apt?.vermietungsart === "wohnung";
  const wer = `${t.vorname || ""} ${t.nachname || ""}`.trim();
  const tok = await nachfolgeToken(t);
  const de = nachfolgeLink(tok, wohnung, false);
  const enL = nachfolgeLink(tok, wohnung, true);
  await mail(email, "Bewerbung als Nachmieter / Apply as successor tenant",
    `Hallo ${name},\n\n${wer} hat dich bei uns als Nachmieter${wohnung ? " für die Wohnung" : " für das Zimmer"} an der ${apt?.adresse || ""} vorgeschlagen.\n\nÜber diesen Link kannst du dich direkt ${wohnung ? "auf die Wohnung" : "auf das Zimmer"} bewerben:\n${de}\n\nWir melden uns nach Eingang deiner Bewerbung bei dir.\n\nLiebe Grüsse\nDein D&T Homes Team\n\n---\n\nHi ${name},\n\n${wer} has suggested you as the next tenant for ${wohnung ? "the apartment" : "the room"} at ${apt?.adresse || ""}.\n\nYou can apply for ${wohnung ? "the apartment" : "the room"} directly via this link:\n${enL}\n\nWe will get back to you once we have received your application.\n\nBest regards\nYour D&T Homes Team`, false);
  return json({ ok: true });
}

async function serviceAnfrage(t: any, b: any) {
  const apt = await ladeApt(t);
  const wohnung = apt?.vermietungsart === "wohnung";
  const ARTEN: Record<string, string> = { reinigung: wohnung ? "Endreinigung Wohnung" : "Endreinigung Zimmer", umzug: "Umzug", umzug_reinigung: "Umzug mit Endreinigung" };
  const art = ARTEN[String(b.art || "")];
  if (!art) return fehler("Unbekannter Service.");
  const termin = String(b.termin || "").trim();
  if (termin && !/^\d{4}-\d{2}-\d{2}$/.test(termin)) return fehler("Bitte ein gültiges Datum wählen.");
  const seit = new Date(Date.now() - TAG).toISOString();
  const { count } = await sb.from("reinigung_anfragen").select("id", { count: "exact", head: true }).eq("email", t.email || "-").gte("created_at", seit);
  if ((count || 0) >= 3) return fehler("Du hast heute schon Anfragen gesendet. Wir melden uns bei dir.", 429);
  const { error } = await sb.from("reinigung_anfragen").insert({
    art, name: `${t.vorname || ""} ${t.nachname || ""}`.trim(), email: t.email || null, telefon: t.phone || null,
    adresse: apt ? [apt.adresse, [apt.plz, apt.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") : null,
    termin: termin || null, bemerkung: String(b.bemerkung || "").trim().slice(0, 2000) || null,
    adresse_neu: art.startsWith("Umzug") ? (String(b.adresse_neu || "").trim().slice(0, 200) || null) : null,
    dt_mieter: true, sprache: t.sprache === "en" ? "en" : "de", status: "neu",
  });
  if (error) return fehler("Anfrage konnte nicht gesendet werden.", 500);
  return json({ ok: true });
}

async function geraetAbmelden(t: any, b: any) {
  await sb.from("portal_sitzungen").update({ widerrufen: true }).eq("tenant_id", t.id).eq("id", b.id);
  return json({ ok: true });
}

// ── Router ────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fehler("Methode nicht erlaubt", 405);
  try {
    const multipart = (req.headers.get("content-type") || "").includes("multipart/form-data");
    const fd = multipart ? await req.formData() : null;
    const b = multipart ? {} as any : await req.json().catch(() => ({}));
    const aktion = multipart ? String(fd!.get("aktion") || "") : String(b.aktion || "");

    switch (aktion) {
      case "start": return await start(b, req);
      case "code_senden": return await codeSenden(b);
      case "code_pruefen": return await codePruefen(b);
      case "link_anfordern": return await linkAnfordern(b, req);
      case "pk_login_optionen": return await pkLoginOptionen(b, req);
      case "pk_login": return await pkLogin(b, req);
      case "nachfolge_info": return await nachfolgeInfo(b);
    }
    const s = await mieterPerSitzung(req);
    if (!s) return fehler("Bitte melde dich neu an.", 401);
    switch (aktion) {
      case "uebersicht": return await uebersicht(s.t, s.sitzungId, req);
      case "dokument": return await dokumentUrl(s.t, b);
      case "hochladen": return await hochladen(s.t, fd!);
      case "schaden": return await schadenMelden(s.t, fd!);
      case "abmelden": return await geraetAbmelden(s.t, { id: s.sitzungId });
      case "geraet_abmelden": return await geraetAbmelden(s.t, b);
      case "pk_reg_optionen": return await pkRegOptionen(s.t, req);
      case "pk_reg": return await pkReg(s.t, b, req);
      case "kuendigen": return await kuendigen(s.t, b);
      case "nachmieter": return await nachmieter(s.t, b);
      case "service": return await serviceAnfrage(s.t, b);
    }
    return fehler("Unbekannte Aktion.");
  } catch (e) {
    console.error("mieter-portal", e);
    return fehler("Es ist ein Fehler aufgetreten. Bitte versuche es nochmals.", 500);
  }
});
