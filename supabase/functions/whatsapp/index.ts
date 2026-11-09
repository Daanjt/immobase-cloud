// whatsapp - Verwaltung des WhatsApp-Versands (YCloud). Nur Admin oder Service-Key.
// {aktion:"status"}              -> ist der Key gesetzt, Nummer, Vorlagen-Status, letzte Nachrichten
// {aktion:"vorlagen_einreichen"} -> Vorlagen (DE/EN) bei Meta zur Genehmigung einreichen
// {aktion:"ausstehend"}          -> Cron: Einladung zum Übernahmeprotokoll per WhatsApp (neue Protokolle)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { istAdminOderServer, verweigert } from "../_shared/auth.ts";
import { waKey, waSenden, telefonVon, vorlagenEinreichen, VORLAGEN } from "../_shared/whatsapp.ts";

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
    if (b.aktion === "vorlagen_einreichen") return json({ ergebnis: await vorlagenEinreichen() });
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
