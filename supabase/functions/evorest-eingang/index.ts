// evorest-eingang: Evorest-Mails "Einzahlungsbestätigung verfügbar - <Wohnungsnr> in <Adresse>" auswerten und beim
// passenden Mieter tenants.kaution_eingegangen_am setzen (Grundlage fuer "Einzugsinfo senden" unter Übergaben).
// Zuordnung: Wohnung ueber Referenznummer (apartments.refnr) + Adresse, dann der eine Mieter dieser Wohnung,
// dessen Kaution noch offen ist und dessen Einzug in der Naehe liegt. Unklare Faelle -> system_fehler.
// Aktion (nur Admin oder Server): {aktion:"lauf", tage?:3}
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { istAdminOderServer, verweigert } from "../_shared/auth.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const ABSENDER = "registrations@evorest.ch";
const norm = (s: string) => String(s || "").toLowerCase().replace(/\s+/g, "").replace(/str\.?(?=\d)/g, "strasse");
const pd = (s: string) => { const m = String(s || "").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null; };

async function graph(sb: any) {
  const { data: cfg } = await sb.from("app_config").select("key,value").in("key", ["graph_tenant_id", "graph_client_id", "graph_client_secret", "graph_mailbox"]);
  const c: Record<string, string> = Object.fromEntries((cfg || []).map((r: any) => [r.key, r.value]));
  const tr = await fetch(`https://login.microsoftonline.com/${c.graph_tenant_id}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.graph_client_id, client_secret: c.graph_client_secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }) });
  const tok = (await tr.json()).access_token;
  if (!tok) throw new Error("Kein Graph-Token");
  return { H: { Authorization: `Bearer ${tok}` }, box: `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.graph_mailbox)}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await istAdminOderServer(req))) return verweigert(CORS);
  const b = await req.json().catch(() => ({}));
  if (b.aktion !== "lauf") return json({ error: "aktion" }, 400);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const tage = Math.min(Math.max(Number(b.tage) || 3, 1), 60);
    const seit = new Date(Date.now() - tage * 86400000).toISOString();
    const { H, box } = await graph(sb);
    const filter = encodeURIComponent(`from/emailAddress/address eq '${ABSENDER}' and receivedDateTime ge ${seit}`);
    const alle: any[] = [];
    let url: string | null = `${box}/messages?$filter=${filter}&$select=id,subject,internetMessageId,receivedDateTime,body&$top=50`;
    for (let seite = 0; url && seite < 10; seite++) {
      const ms: any = await fetch(url, { headers: H }).then((r) => r.json());
      alle.push(...(ms.value || []));
      url = ms["@odata.nextLink"] || null;
    }
    const mails = alle.filter((m: any) => /Einzahlungsbest/i.test(m.subject || ""));
    const [{ data: apts }, { data: rooms }, { data: tenants }] = await Promise.all([
      sb.from("apartments").select("id,adresse,refnr"),
      sb.from("rooms").select("id,apt_id,tenant_id"),
      sb.from("tenants").select("id,vorname,nachname,status,einzug,room_id,apt_id,kaution_monate,kaution_eingegangen_am"),
    ]);
    const ergebnis: any[] = [];
    for (const m of mails) {
      const imid = m.internetMessageId;
      const { data: schon } = await sb.from("evorest_eingaenge").select("status").eq("internet_message_id", imid).maybeSingle();
      if (schon && ["ok", "erledigt"].includes(schon.status)) continue;
      const log = async (status: string, info: Record<string, unknown>) => {
        await sb.from("evorest_eingaenge").upsert({ internet_message_id: imid, betreff: m.subject, empfangen: m.receivedDateTime, status, ...info, aktualisiert: new Date().toISOString() });
        ergebnis.push({ betreff: m.subject, status, ...info });
      };
      const mm = String(m.subject).match(/-\s*(.+?)\s+in\s+(.+?)\s*$/i);
      if (!mm) { await log("unklar", { info: { grund: "Betreff nicht lesbar" } }); continue; }
      const [ref, adr] = [mm[1], mm[2]];
      const wohnungen = (apts || []).filter((a: any) => a.refnr && norm(a.refnr) === norm(ref) && norm(adr).startsWith(norm(a.adresse)));
      if (wohnungen.length !== 1) { await log("unklar", { info: { ref, adresse: adr, wohnungen: wohnungen.map((a: any) => a.id) } }); continue; }
      const apt = wohnungen[0];
      const raumIds = new Set((rooms || []).filter((r: any) => r.apt_id === apt.id).map((r: any) => r.id));
      const ids = new Set<string>((rooms || []).filter((r: any) => r.apt_id === apt.id && r.tenant_id).map((r: any) => r.tenant_id));
      (tenants || []).forEach((t: any) => { if ((t.room_id && raumIds.has(t.room_id)) || t.apt_id === apt.id) ids.add(t.id); });
      const mailTag = new Date(m.receivedDateTime);
      // 1. Wahl: Name des Hauptmieters aus der Mail ("Hauptmieter: Nachname Vorname")
      const plain = String(m.body?.content || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
      const hm = (plain.match(/Hauptmieter:\s*([^:]+?)\s+(?:IBAN|Mitmieter|Objekt|Adresse|$)/i) || [])[1] || "";
      const nn = (x: string) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const hmTeile = nn(hm).split(/[\s,]+/).filter(Boolean);
      const perName = hmTeile.length ? (tenants || []).filter((t: any) => ids.has(t.id) && (t.status || "aktiv") !== "archiviert" && nn(t.vorname) && nn(t.nachname)
        && nn(t.vorname).split(/\s+/).every((w) => hmTeile.includes(w)) && nn(t.nachname).split(/\s+/).every((w) => hmTeile.includes(w))) : [];
      if (perName.length === 1) {
        const t = perName[0];
        if (!t.kaution_eingegangen_am) {
          const datum = String(m.receivedDateTime).slice(0, 10);
          await sb.from("tenants").update({ kaution_eingegangen_am: datum }).eq("id", t.id);
          t.kaution_eingegangen_am = datum;
        }
        await log("ok", { apt_id: apt.id, tenant_id: t.id, info: { ref, ueber: "name", datum: t.kaution_eingegangen_am } });
        continue;
      }
      // 2. Wahl: einziger Mieter dieser Wohnung mit offener Kaution und Einzug in der Naehe
      const kand = (tenants || []).filter((t: any) => ids.has(t.id) && (t.status || "aktiv") !== "archiviert" && !t.kaution_eingegangen_am && Number(t.kaution_monate ?? 1) !== 0)
        .filter((t: any) => { const e = pd(t.einzug); if (!e) return false; const d = (e.getTime() - mailTag.getTime()) / 86400000; return d > -90 && d < 120; });
      if (kand.length !== 1) { await log("unklar", { apt_id: apt.id, info: { ref, adresse: adr, kandidaten: kand.map((t: any) => t.id) } }); continue; }
      const t = kand[0];
      const datum = String(m.receivedDateTime).slice(0, 10);
      await sb.from("tenants").update({ kaution_eingegangen_am: datum }).eq("id", t.id);
      t.kaution_eingegangen_am = datum;
      await log("ok", { apt_id: apt.id, tenant_id: t.id, info: { ref, datum } });
    }
    for (const e of ergebnis.filter((x) => x.status !== "ok")) {
      await sb.from("system_fehler").insert({ app: "edge", bereich: "evorest-eingang", meldung: `Evorest-Kaution nicht zugeordnet: ${e.betreff}`, details: e }).then(() => {}, () => {});
    }
    return json({ ok: true, mails: mails.length, ergebnis });
  } catch (e) { return json({ error: String((e as Error).message || e) }, 500); }
});
