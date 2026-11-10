// whatsapp - Verwaltung des WhatsApp-Versands (YCloud). Nur Admin oder Service-Key.
// {aktion:"status"}              -> ist der Key gesetzt, Nummer, Vorlagen-Status, letzte Nachrichten
// {aktion:"vorlagen_einreichen"} -> Vorlagen (DE/EN) bei Meta zur Genehmigung einreichen
// {aktion:"ausstehend"}          -> Cron: Einladung zum Übernahmeprotokoll per WhatsApp (neue Protokolle)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { istAdminOderServer, verweigert } from "../_shared/auth.ts";
import { waKey, waSenden, telefonVon, vorlagenEinreichen, VORLAGEN, normTelefon } from "../_shared/whatsapp.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTAL = "https://mieter.dthomes.ch";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const fmt = (d: string | null) => { if (!d) return ""; const x = new Date(d); return isNaN(x.getTime()) ? "" : x.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Zurich" }); };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await istAdminOderServer(req))) return verweigert(CORS);
  const b = await req.json().catch(() => ({}));
  const sb = createClient(URL_, KEY);
  try {
    if (b.aktion === "status") {
      const key = waKey();
      const { data: log } = await sb.from("whatsapp_log").select("art, ref, status, fehler, created_at").order("created_at", { ascending: false }).limit(20);
      if (!key) return json({ aktiv: false, log });
      const h = { "X-API-Key": key };
      const nummern = await fetch("https://api.ycloud.com/v2/whatsapp/phoneNumbers?limit=10", { headers: h }).then((r) => r.json()).catch((e) => ({ fehler: String(e) }));
      const namen = Object.values(VORLAGEN).map((v) => v.name);
      const vorlagen = await fetch("https://api.ycloud.com/v2/whatsapp/templates?limit=100", { headers: h }).then((r) => r.json()).catch((e) => ({ fehler: String(e) }));
      return json({ aktiv: true, nummern: (nummern.items || []).map((n: any) => ({ nummer: n.phoneNumber, name: n.verifiedName, status: n.status, qualitaet: n.qualityRating })),
        vorlagen: (vorlagen.items || []).filter((v: any) => namen.includes(v.name)).map((v: any) => ({ name: v.name, sprache: v.language, status: v.status, grund: v.reason || null })), log });
    }
    if (b.aktion === "test") {
      // jede Vorlage einmal an die Testnummer(n) senden, mit Beispielwerten
      const { data: tm } = await sb.from("app_config").select("value").eq("key", "whatsapp_testnummern").maybeSingle();
      const nr = String(tm?.value || "").split(/[,;\s]+/).filter(Boolean)[0];
      if (!nr) return json({ error: "keine Testnummer hinterlegt" }, 400);
      const ts = Date.now();
      const erg: any[] = [];
      for (const [art, v] of Object.entries(VORLAGEN)) {
        for (const en of (b.sprachen || ["de"]).map((x: string) => x === "en")) {
          erg.push({ art, en, ...(await waSenden(sb, { art: art as any, ref: `test:${ts}:${en ? "en" : "de"}`, telefon: nr, en, params: v.beispiel })) });
        }
      }
      return json({ ergebnis: erg });
    }
    if (b.aktion === "webhook_einrichten") {
      const key = waKey(); if (!key) return json({ error: "YCLOUD_API_KEY fehlt" }, 400);
      const url = `${URL_}/functions/v1/whatsapp-eingang`;
      const versuche = [["whatsapp.inbound_message.received", "whatsapp.smb.message.echoes"], ["whatsapp.inbound_message.received"]];
      let letzte: any = null;
      for (const ev of versuche) {
        const r = await fetch("https://api.ycloud.com/v2/webhookEndpoints", { method: "POST", headers: { "X-API-Key": key, "Content-Type": "application/json" },
          body: JSON.stringify({ url, enabledEvents: ev, description: "ImmoBase whatsapp-eingang" }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.secret) {
          await sb.from("app_config").upsert({ key: "ycloud_webhook_secret", value: j.secret }, { onConflict: "key" });
          return json({ ok: true, id: j.id, events: ev });
        }
        letzte = { status: r.status, j };
      }
      return json({ error: "Webhook konnte nicht angelegt werden", details: JSON.stringify(letzte).slice(0, 400) }, 502);
    }
    if (b.aktion === "vorlagen_einreichen") return json({ ergebnis: await vorlagenEinreichen(Array.isArray(b.nur) ? b.nur : undefined) });
    if (b.aktion === "bewerber_kontakt") {
      // Erste Kontaktaufnahme mit einem Bewerber (Vorlage dt_bewerbung_interesse)
      const { data: a } = await sb.from("applicants").select("id, vorname, phone, sprache, zimmer_wunsch, zugeteiltes_zimmer, owner").eq("id", String(b.bewerber_id || "")).maybeSingle();
      if (!a) return json({ error: "Bewerber nicht gefunden" }, 404);
      const tel = normTelefon(a.phone);
      if (!tel) return json({ error: "Keine gültige Telefonnummer beim Bewerber" }, 400);
      const rid = a.zugeteiltes_zimmer || a.zimmer_wunsch;
      const { data: r } = rid ? await sb.from("rooms").select("id, apt_id, miete").eq("id", rid).maybeSingle() : { data: null };
      const { data: ap } = r ? await sb.from("apartments").select("adresse, ort, vermietungsart").eq("id", r.apt_id).maybeSingle() : { data: null };
      if (!r || !ap) return json({ error: "Beim Bewerber ist kein Zimmer bzw. keine Wohnung hinterlegt" }, 400);
      const en = a.sprache === "en";
      const wohnung = ap.vermietungsart === "wohnung";
      const objekt = en ? `${wohnung ? "the apartment" : "a room"} at ${ap.adresse}, ${ap.ort || "Zürich"}` : `${wohnung ? "die Wohnung" : "ein Zimmer"} an der ${ap.adresse}, ${ap.ort || "Zürich"}`;
      const preis = `CHF ${Number(r.miete || 0).toLocaleString("de-CH").replace(/[’\u2019]/g, "'")}`;
      const absender = String(b.absender || a.owner || "Daan").trim().split(/\s+/)[0];
      const res = await waSenden(sb, { art: "bewerbung", ref: b.erneut ? `${a.id}:${Date.now()}` : String(a.id), telefon: tel, en,
        params: [String(a.vorname || "").trim().split(/\s+/)[0] || (en ? "there" : "zusammen"), absender, objekt, preis] });
      await sb.from("applicants").update({ whatsapp_followup_status: res.status, whatsapp_followup_error: res.fehler || null,
        whatsapp_followup_language: en ? "en" : "de", ...(res.status === "gesendet" ? { whatsapp_followup_sent_at: new Date().toISOString() } : {}) }).eq("id", a.id);
      return json(res);
    }
    if (b.aktion === "ausstehend") {
      if (!waKey()) return json({ aktiv: false });
      const seit = new Date(Date.now() - 3 * 86400000).toISOString();
      const { data: ps } = await sb.from("handover_protocols").select("id, token, tenant_id, bewerber_id, mieter_vorname, mieter_telefon, deadline, status, started_at")
        .eq("status", "sent").gte("started_at", seit);
      const erg: any[] = [];
      for (const p of ps || []) {
        let en = false;
        if (p.tenant_id) { const { data: t } = await sb.from("tenants").select("sprache").eq("id", p.tenant_id).maybeSingle(); en = t?.sprache === "en"; }
        const tel = await telefonVon(sb, { tenant_id: p.tenant_id, bewerber_id: p.bewerber_id, fallback: p.mieter_telefon });
        const r = await waSenden(sb, { art: "uebernahme", ref: `${p.id}:einladung`, telefon: tel, en,
          params: [String(p.mieter_vorname || "").trim().split(/\s+/)[0] || (en ? "there" : "zusammen"), fmt(p.deadline), `${PORTAL}/uebernahme/${p.token}${en ? "?lang=en" : ""}`] });
        erg.push({ id: p.id, ...r });
      }
      return json({ ergebnis: erg });
    }
    return json({ error: "Unbekannte Aktion" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
