// Welche Dokumente ein Mieter nach der Unterschrift hochladen muss.
//   Ganze Wohnung: Betreibungsregister-Auszug + Pass/Ausweis
//   Zimmer (WG):   Pass/Ausweis, Betreibungsregister-Auszug nur bei Kautionsreduktion
//   Verlaengerung, Nachtrag, Parkplatz: nichts
export const KAT_B = "Betreibungsregister-Auszug";
export const KAT_A = "Pass / Ausweis";

export type Bedarf = { betreibung: boolean; ausweis: boolean; wohnung: boolean };

// Felder, die die Vertragsabfrage liefern muss (ohne das grosse contract_data zu laden)
export const DOK_FELDER = "contract_type, apt_id, vertragsart:contract_data->>vertragsart, km:contract_data->vertrag->>kautionMonate, auf:contract_data->vertrag->>aufschlag";

export async function benoetigteDokumente(sb: any, c: any): Promise<Bedarf | null> {
  const typ = String(c.contract_type || "");
  if (typ.includes("verlaengerung") || typ === "nachtrag" || typ === "parkplatz") return null;
  let wohnung = c.vertragsart === "wohnung";
  if (!wohnung && c.apt_id) {
    const { data: a } = await sb.from("apartments").select("vermietungsart").eq("id", c.apt_id).maybeSingle();
    wohnung = !!a && a.vermietungsart === "wohnung";
  }
  if (wohnung) return { betreibung: true, ausweis: true, wohnung: true };
  const km = c.km == null || c.km === "" ? 3 : +c.km;
  const reduktion = km < 3 || (+c.auf || 0) > 0;
  return { betreibung: reduktion, ausweis: true, wohnung: false };
}
