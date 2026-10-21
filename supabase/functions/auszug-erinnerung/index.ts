// auszug-erinnerung - taeglicher Cron-Job
// 30 Tage vor dem Auszug: Erinnerung an das Auszugsdatum + Hinweis auf Reinigung/Umzug.
// 14 Tage vor dem Auszug: nur noch Reinigung/Umzug, aber nicht, wenn der Mieter schon
// eine Reinigungs- oder Umzugsanfrage geschickt hat.
// Versand ueber die Function send-message (gleiches Layout wie andere Mieter-Mails).
// Doppelversand wird ueber die Tabelle auszug_mails (unique tenant_id, art, auszug) verhindert.
// Body {"dry":true} zeigt nur, wer heute eine Mail bekaeme, ohne zu senden.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { istAdminOderServer, verweigert } from "../_shared/auth.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

// Fenster in Tagen vor dem Auszug (etwas Spielraum, falls der Job einmal ausfaellt)
const FENSTER = { erinnerung: [28, 30], angebot: [12, 14] } as const;

function parseDatum(x: string | null): Date | null {
  const s = String(x || "").trim();
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return null;
}
function heuteZuerich(): Date {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, mo, d] = p.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d));
}
const fmt = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;

function text(art: "erinnerung" | "angebot", en: boolean, vorname: string, datum: string) {
  const r = en ? "https://www.dthomes.ch/en/#reinigung" : "https://www.dthomes.ch/#reinigung";
  const u = en ? "https://www.dthomes.ch/en/#umzug" : "https://www.dthomes.ch/#umzug";
  if (en) {
    const sig = "Best regards\nYour D&T Homes Team";
    if (art === "erinnerung") return {
      betreff: `Your move-out on ${datum}`,
      text: `Hi ${vorname},\n\nWe hope you've had a great time with us so far! We just wanted to send you a friendly reminder that your move-out is coming up on ${datum}, one month from now.\n\nTo make your move as relaxed as possible, you can also book your final cleaning and your move with us, so you don't have to worry about a thing:\n\nCleaning: ${r}\nMoving: ${u}\n\nYou'll receive a non-binding quote, or simply reply to this email. We're happy to help!\n\n${sig}`,
    };
    return {
      betreff: "Final cleaning or moving help for your move-out?",
      text: `Hi ${vorname},\n\nIn two weeks it's time: your move-out is just around the corner. If you'd still like some help with the final cleaning or your move, we're happy to take care of it for you.\n\nCleaning: ${r}\nMoving: ${u}\n\nWe already wish you a great start in your new home!\n\n${sig}`,
    };
  }
  const sig = "Liebe Grüsse\nDein D&T Homes Team";
  if (art === "erinnerung") return {
    betreff: `Dein Auszug am ${datum}`,
    text: `Hallo ${vorname},\n\nwir hoffen, du hattest bisher eine schöne Zeit bei uns! Wir wollten dich ganz freundlich daran erinnern, dass dein Auszug am ${datum} ansteht, also in einem Monat.\n\nDamit dein Auszug möglichst entspannt wird, kannst du bei uns auch die Endreinigung und den Umzug buchen. So musst du dich um nichts mehr kümmern:\n\nReinigung: ${r}\nUmzug: ${u}\n\nDu erhältst eine unverbindliche Offerte, oder antworte einfach auf diese Mail. Wir helfen dir gerne!\n\n${sig}`,
  };
  return {
    betreff: "Endreinigung oder Umzug für deinen Auszug?",
    text: `Hallo ${vorname},\n\nin zwei Wochen ist es so weit: Dein Auszug steht vor der Tür. Falls du noch Unterstützung bei der Endreinigung oder beim Umzug möchtest, kümmern wir uns gerne darum.\n\nReinigung: ${r}\nUmzug: ${u}\n\nWir wünschen dir schon jetzt einen guten Start im neuen Zuhause!\n\n${sig}`,
  };
}

Deno.serve(async (req) => {
  if (!(await istAdminOderServer(req))) return verweigert();
  const { dry } = await req.json().catch(() => ({}));
  const sb = createClient(URL_, KEY);
  const heute = heuteZuerich();

  const { data: mieter, error } = await sb.from("tenants")
    .select("id,vorname,email,auszug,sprache,status,deleted_at")
    .eq("status", "aktiv").is("deleted_at", null);
  if (error) return json({ error: error.message }, 500);

  const plan: any[] = [];
  for (const t of mieter || []) {
    const email = String(t.email || "").trim();
    const aus = parseDatum(t.auszug);
    if (!email || !aus) continue;
    const tage = Math.round((aus.getTime() - heute.getTime()) / 86400000);
    let art: "erinnerung" | "angebot" | null = null;
    if (tage >= FENSTER.erinnerung[0] && tage <= FENSTER.erinnerung[1]) art = "erinnerung";
    else if (tage >= FENSTER.angebot[0] && tage <= FENSTER.angebot[1]) art = "angebot";
    if (!art) continue;
    const { data: schon } = await sb.from("auszug_mails").select("id").eq("tenant_id", t.id).eq("art", art).eq("auszug", fmt(aus)).maybeSingle();
    if (schon) continue;
    if (art === "angebot") {
      const seit = new Date(Date.now() - 60 * 86400000).toISOString();
      const { data: anfr } = await sb.from("reinigung_anfragen").select("id").ilike("email", email).gte("created_at", seit).limit(1);
      if (anfr && anfr.length) { plan.push({ tenant: t.id, art, tage, uebersprungen: "hat schon angefragt" }); continue; }
    }
    plan.push({ tenant: t.id, art, tage, email, en: t.sprache === "en", vorname: String(t.vorname || "").trim().split(/\s+/)[0] || "", datum: fmt(aus) });
  }
  if (dry) return json({ heute: fmt(heute), plan: plan.map(({ email: _e, ...p }) => p) });

  const ergebnis: any[] = [];
  for (const p of plan) {
    if (p.uebersprungen) { ergebnis.push(p); continue; }
    // zuerst reservieren, damit ueberlappende Laeufe nicht doppelt senden
    const { data: claim } = await sb.from("auszug_mails")
      .upsert({ tenant_id: p.tenant, art: p.art, auszug: p.datum, to_addr: p.email, status: "sending" }, { onConflict: "tenant_id,art,auszug", ignoreDuplicates: true })
      .select("id");
    if (!claim || !claim.length) continue;
    const m = text(p.art, p.en, p.vorname, p.datum);
    try {
      const r = await fetch(`${URL_}/functions/v1/send-message`, {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: p.email, betreff: m.betreff, text: m.text, sprache: p.en ? "en" : "de" }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
      await sb.from("auszug_mails").update({ status: "sent" }).eq("id", claim[0].id);
      ergebnis.push({ tenant: p.tenant, art: p.art, status: "sent" });
    } catch (e) {
      // Eintrag wieder entfernen, damit der naechste Lauf es nochmals versucht (solange im Fenster)
      await sb.from("auszug_mails").delete().eq("id", claim[0].id);
      ergebnis.push({ tenant: p.tenant, art: p.art, status: "error", error: String(e).slice(0, 300) });
    }
  }
  return json({ heute: fmt(heute), ergebnis });
});
