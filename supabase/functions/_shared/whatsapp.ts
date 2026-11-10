// WhatsApp-Versand ueber YCloud (offizielle WhatsApp Business API, Coexistence mit der Business-App).
// Ohne YCLOUD_API_KEY passiert nichts (still). Jede Nachricht (art + ref) geht hoechstens einmal raus (whatsapp_log).
// Nachrichten, die wir von uns aus schicken, brauchen von Meta genehmigte Vorlagen (VORLAGEN unten).

export const WA_ABSENDER = "+41766887091";
const API = "https://api.ycloud.com/v2";

export type WaArt = "vertrag" | "dokumente" | "uebernahme" | "namensschild";

// Vorlagen (Kategorie UTILITY). {{n}} = Parameter in dieser Reihenfolge.
export const VORLAGEN: Record<WaArt, { name: string; de: string; en: string; beispiel: string[] }> = {
  vertrag: {
    name: "dt_vertrag_unterschrift",
    de: "Hallo {{1}}, dein Vertrag bei D&T Homes ist bereit zur digitalen Unterschrift. Du findest ihn hier: {{2}}\n\nDen Link haben wir dir auch per E-Mail geschickt.",
    en: "Hi {{1}}, your contract with D&T Homes is ready to be signed digitally. You can find it here: {{2}}\n\nWe have also sent you the link by email.",
    beispiel: ["Anna", "https://mieter.dthomes.ch/abc123"],
  },
  dokumente: {
    name: "dt_dokumente_fehlen",
    de: "Hallo {{1}}, für deinen Mietvertrag bei D&T Homes fehlen uns noch Dokumente. Du kannst sie hier in wenigen Sekunden hochladen: {{2}}\n\nDie Details findest du auch in unserer E-Mail.",
    en: "Hi {{1}}, we are still missing some documents for your rental agreement with D&T Homes. You can upload them here in a few seconds: {{2}}\n\nYou can also find the details in our email.",
    beispiel: ["Anna", "https://mieter.dthomes.ch/dokumente/abc123"],
  },
  uebernahme: {
    name: "dt_uebernahmeprotokoll",
    de: "Hallo {{1}}, bitte fülle bis am {{2}} dein Übernahmeprotokoll online aus und halte allfällige Mängel mit Fotos fest: {{3}}\n\nDen Link findest du auch in unserer E-Mail.",
    en: "Hi {{1}}, please complete your handover protocol online by {{2}} and record any defects with photos: {{3}}\n\nYou can also find the link in our email.",
    beispiel: ["Anna", "30.11.2026", "https://mieter.dthomes.ch/uebernahme/abc123"],
  },
  namensschild: {
    name: "dt_namensschild",
    de: "Hallo {{1}}, bitte gib uns im Mieterportal an, welcher Name auf Briefkasten und Klingel stehen soll: {{2}}\n\nDanke dir!",
    en: "Hi {{1}}, please let us know in the tenant portal which name should be on your mailbox and doorbell: {{2}}\n\nThank you!",
    beispiel: ["Anna", "https://mieter.dthomes.ch/p/abc123"],
  },
};

export function waKey(): string | null { return Deno.env.get("YCLOUD_API_KEY") || null; }

// Telefonnummer ins internationale Format (+41...). Schweizer Nummern ohne Vorwahl werden ergaenzt.
export function normTelefon(t: string | null | undefined): string | null {
  let s = String(t || "").replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!s.startsWith("+")) { if (s.startsWith("0")) s = "+41" + s.slice(1); else return null; }
  const ziffern = s.slice(1);
  if (!/^\d{8,15}$/.test(ziffern)) return null;
  return s;
}

// Telefonnummer zu Mieter / Bewerber suchen
export async function telefonVon(sb: any, o: { tenant_id?: string | null; bewerber_id?: string | null; fallback?: string | null }): Promise<string | null> {
  if (o.tenant_id) { const { data } = await sb.from("tenants").select("phone").eq("id", o.tenant_id).maybeSingle(); const n = normTelefon(data?.phone); if (n) return n; }
  if (o.bewerber_id) { const { data } = await sb.from("applicants").select("phone").eq("id", o.bewerber_id).maybeSingle(); const n = normTelefon(data?.phone); if (n) return n; }
  return normTelefon(o.fallback);
}

// Vorlage senden. Gibt {status} zurueck, wirft nie (WhatsApp ist Zusatz zur Mail).
export async function waSenden(sb: any, o: { art: WaArt; ref: string; telefon: string | null; en: boolean; params: string[] }): Promise<{ status: string; fehler?: string }> {
  const key = waKey();
  if (!key) return { status: "aus" };
  const tel = normTelefon(o.telefon);
  if (!tel) return { status: "keine_nummer" };
  // Testmodus: solange app_config.whatsapp_testnummern gesetzt ist, nur an diese Nummern senden
  const { data: tm } = await sb.from("app_config").select("value").eq("key", "whatsapp_testnummern").maybeSingle();
  const test = String(tm?.value || "").split(/[,;\s]+/).map(normTelefon).filter(Boolean);
  if (test.length && !test.includes(tel)) return { status: "testmodus" };
  const v = VORLAGEN[o.art];
  const sprache = o.en ? "en" : "de";
  // zuerst reservieren (unique art+ref verhindert Doppelversand)
  const { error: dup } = await sb.from("whatsapp_log").insert({ art: o.art, ref: o.ref, telefon: tel, vorlage: v.name, sprache, status: "senden" });
  if (dup) return { status: "schon_gesendet" };
  try {
    const r = await fetch(`${API}/whatsapp/messages/sendDirectly`, {
      method: "POST",
      headers: { "X-API-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: WA_ABSENDER, to: tel, type: "template", externalId: `${o.art}:${o.ref}`.slice(0, 64),
        template: { name: v.name, language: { code: sprache }, components: [{ type: "body", parameters: o.params.map((p) => ({ type: "text", text: String(p || "").slice(0, 900) || "-" })) }] },
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`HTTP ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
    await sb.from("whatsapp_log").update({ status: j.status || "gesendet", ycloud_id: j.id || null }).eq("art", o.art).eq("ref", o.ref);
    return { status: "gesendet" };
  } catch (e) {
    const fehler = String((e as Error)?.message || e).slice(0, 500);
    await sb.from("whatsapp_log").update({ status: "fehler", fehler }).eq("art", o.art).eq("ref", o.ref);
    console.error("whatsapp", o.art, o.ref, fehler);
    return { status: "fehler", fehler };
  }
}

// Vorlagen bei YCloud/Meta zur Genehmigung einreichen (einmalig)
export async function vorlagenEinreichen(): Promise<any[]> {
  const key = waKey();
  if (!key) throw new Error("YCLOUD_API_KEY fehlt");
  const pn = await fetch(`${API}/whatsapp/phoneNumbers?limit=10`, { headers: { "X-API-Key": key } }).then((r) => r.json());
  const nummer = (pn.items || []).find((x: any) => String(x.phoneNumber || "").replace(/\D/g, "").endsWith("766887091")) || (pn.items || [])[0];
  if (!nummer?.wabaId) throw new Error("Keine WhatsApp-Nummer in YCloud gefunden: " + JSON.stringify(pn).slice(0, 300));
  const erg: any[] = [];
  for (const v of Object.values(VORLAGEN)) {
    for (const sprache of ["de", "en"] as const) {
      const r = await fetch(`${API}/whatsapp/templates`, {
        method: "POST", headers: { "X-API-Key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ wabaId: nummer.wabaId, name: v.name, language: sprache, category: "UTILITY",
          components: [{ type: "BODY", text: v[sprache], example: { body_text: [v.beispiel] } }] }),
      });
      const j = await r.json().catch(() => ({}));
      erg.push({ name: v.name, sprache, ok: r.ok, status: j.status || null, fehler: r.ok ? null : JSON.stringify(j).slice(0, 300) });
    }
  }
  return erg;
}
