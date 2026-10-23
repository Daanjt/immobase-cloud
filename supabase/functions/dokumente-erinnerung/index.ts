// dokumente-erinnerung - stuendlicher Cron-Job (nur ganze Wohnungen)
// Nach der Unterschrift des Mieters: Mail mit Upload-Link fuer Betreibungsregister-Auszug
// und Pass/Ausweis, falls noch etwas fehlt. 1. Mail ab 1 Stunde nach Unterschrift,
// Erinnerungen nach 3 und 7 Tagen. Danach keine weiteren Mails.
// Body {"dry":true} zeigt nur, wer eine Mail bekaeme.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { istAdminOderServer, verweigert } from "../_shared/auth.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTAL = "https://mieter.dthomes.ch";
const KAT_B = "Betreibungsregister-Auszug", KAT_A = "Pass / Ausweis";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const H = 3600 * 1000;

function text(en: boolean, vorname: string, adresse: string, fehltB: boolean, fehltA: boolean, link: string, nr: number) {
  const sigDe = "Liebe Grüsse\nDein D&T Homes Team", sigEn = "Best regards\nYour D&T Homes Team";
  if (en) {
    const liste = [fehltB ? "- a current extract from the debt collection register (Betreibungsregisterauszug, not older than 3 months)" : "", fehltA ? "- a copy of your passport or ID card" : ""].filter(Boolean).join("\n");
    return {
      betreff: nr === 0 ? ((fehltB && fehltA) ? "Two more documents for your flat" : "One more document for your flat") : "Reminder: documents for your flat",
      text: `Hi ${vorname},\n\n${nr === 0 ? `thank you for signing the rental agreement for the flat at ${adresse}!` : `a friendly reminder about the documents for your flat at ${adresse}.`}\n\nTo confirm your contract, we still need:\n${liste}\n\nYou can upload them here in a few seconds:\n${link}\n\nYou can order the extract online via EasyGov (www.easygov.swiss) or at the debt collection office (Betreibungsamt) of your municipality.\n\n${sigEn}`,
    };
  }
  const liste = [fehltB ? "- einen aktuellen Betreibungsregister-Auszug (nicht älter als 3 Monate)" : "", fehltA ? "- eine Kopie deines Passes oder deiner ID" : ""].filter(Boolean).join("\n");
  return {
    betreff: nr === 0 ? ((fehltB && fehltA) ? "Noch zwei Dokumente für deine Wohnung" : "Noch ein Dokument für deine Wohnung") : "Erinnerung: Dokumente für deine Wohnung",
    text: `Hallo ${vorname},\n\n${nr === 0 ? `vielen Dank, dass du den Mietvertrag für die Wohnung an der ${adresse} unterschrieben hast!` : `eine kurze Erinnerung zu den Dokumenten für deine Wohnung an der ${adresse}.`}\n\nDamit wir deinen Vertrag bestätigen können, brauchen wir noch:\n${liste}\n\nDu kannst sie hier ganz einfach hochladen:\n${link}\n\nDen Betreibungsregister-Auszug kannst du online über EasyGov (www.easygov.swiss) oder beim Betreibungsamt deiner Wohngemeinde bestellen.\n\n${sigDe}`,
  };
}

Deno.serve(async (req) => {
  if (!(await istAdminOderServer(req))) return verweigert();
  const { dry } = await req.json().catch(() => ({}));
  const sb = createClient(URL_, KEY);
  const { data: vertraege, error } = await sb.from("contracts")
    .select("id, token, status, contract_type, contract_data, apt_id, tenant_id, bewerber_id, mieter_email, mieter_vorname, signed_at, dok_mail_count, dok_mail_last")
    .not("signed_at", "is", null).lt("dok_mail_count", 3)
    .in("status", ["mieter_signiert", "signiert"]);
  if (error) return json({ error: error.message }, 500);
  const jetzt = Date.now();
  const plan: any[] = [];
  for (const c of vertraege || []) {
    if (!c.mieter_email || String(c.contract_type).includes("verlaengerung") || c.contract_type === "parkplatz") continue;
    // nur ganze Wohnungen
    let wohnung = c.contract_data && c.contract_data.vertragsart === "wohnung";
    let adresse = (c.contract_data && (c.contract_data.adresse || c.contract_data.apt?.adresse)) || "";
    if (c.apt_id) {
      const { data: a } = await sb.from("apartments").select("vermietungsart, adresse").eq("id", c.apt_id).maybeSingle();
      if (a) { wohnung = wohnung || a.vermietungsart === "wohnung"; adresse = adresse || a.adresse; }
    }
    if (!wohnung) continue;
    // nur Vertraege ab Start dieser Funktion (keine alten Vertraege anschreiben)
    if (new Date(c.signed_at).getTime() < Date.parse("2026-10-23T00:00:00Z")) continue;
    const ent = c.tenant_id ? ["tenant", String(c.tenant_id)] : (c.bewerber_id ? ["applicant", String(c.bewerber_id)] : null);
    if (!ent) continue;
    const { data: docs } = await sb.from("documents").select("category").eq("entity_type", ent[0]).eq("entity_id", ent[1]).in("category", [KAT_B, KAT_A]);
    const fehltB = !(docs || []).some((d: any) => d.category === KAT_B);
    const fehltA = !(docs || []).some((d: any) => d.category === KAT_A);
    if (!fehltB && !fehltA) continue;
    const nr = c.dok_mail_count || 0;
    const signiert = new Date(c.signed_at).getTime();
    const faellig = nr === 0 ? signiert + 1 * H : nr === 1 ? signiert + 72 * H : signiert + 168 * H;
    if (jetzt < faellig) continue;
    plan.push({ c, nr, fehltB, fehltA, adresse });
  }
  if (dry) return json({ plan: plan.map((p) => ({ vertrag: p.c.id, nr: p.nr, fehltB: p.fehltB, fehltA: p.fehltA })) });

  const res: any[] = [];
  for (const p of plan) {
    // zuerst hochzaehlen (verhindert Doppelversand bei ueberlappenden Laeufen)
    const { data: claim } = await sb.from("contracts").update({ dok_mail_count: p.nr + 1, dok_mail_last: new Date().toISOString() })
      .eq("id", p.c.id).eq("dok_mail_count", p.nr).select("id");
    if (!claim || !claim.length) continue;
    const en = (p.c.contract_data && (p.c.contract_data.sprache === "en" || p.c.contract_data.lang === "en"));
    const m = text(!!en, String(p.c.mieter_vorname || "").trim().split(/\s+/)[0] || "", p.adresse, p.fehltB, p.fehltA, `${PORTAL}/dokumente/${p.c.token}`, p.nr);
    try {
      const r = await fetch(`${URL_}/functions/v1/send-message`, {
        method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: p.c.mieter_email, betreff: m.betreff, text: m.text, sprache: en ? "en" : "de" }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
      res.push({ vertrag: p.c.id, nr: p.nr, ok: true });
    } catch (e) {
      await sb.from("contracts").update({ dok_mail_count: p.nr }).eq("id", p.c.id);
      res.push({ vertrag: p.c.id, nr: p.nr, error: String(e).slice(0, 200) });
    }
  }
  return json({ ergebnis: res });
});
