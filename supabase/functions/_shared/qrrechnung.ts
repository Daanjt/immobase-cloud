// Swiss QR-Rechnung (SPC 0200) fuer die Mietzahlung, mit Schweizerkreuz in der Mitte.
// Strukturierte Adressen (Typ S), seit Nov. 2025 Pflicht. Ohne Zahlungspflichtigen (optional laut Standard).
import QRCode from "npm:qrcode@1.5.4";
import { PNG } from "npm:pngjs@7.0.0";

export const KREDITOR = {
  iban: "CH8000774010527926900", ibanLesbar: "CH80 0077 4010 5279 2690 0", bank: "Graubündner Kantonalbank", bic: "GRKBCH2270A",
  name: "D&T Partners GmbH", strasse: "Via Campeun", nr: "40", plz: "7403", ort: "Rhäzüns", land: "CH",
};

const kurz = (s: string, n: number) => String(s || "").replace(/[\r\n]+/g, " ").trim().slice(0, n);

export function qrInhalt(betrag: number | null, mitteilung: string) {
  const k = KREDITOR;
  const leer7 = ["", "", "", "", "", "", ""];
  return [
    "SPC", "0200", "1", k.iban,
    "S", k.name, k.strasse, k.nr, k.plz, k.ort, k.land,
    ...leer7,                                   // endgültiger Zahlungsempfänger (nicht verwendet)
    betrag != null && betrag > 0 ? betrag.toFixed(2) : "", "CHF",
    ...leer7,                                   // Zahlungspflichtiger (leer, Bank füllt ein)
    "NON", "", kurz(mitteilung, 140), "EPD",
  ].join("\r\n");
}

// PNG mit Schweizerkreuz; scale = Pixel pro Modul
export async function qrPng(text: string, scale = 8): Promise<Uint8Array> {
  const rand = 4;
  const n = QRCode.create(text, { errorCorrectionLevel: "M" }).modules.size;
  const buf: Uint8Array = await QRCode.toBuffer(text, { errorCorrectionLevel: "M", margin: rand, scale, type: "png", color: { dark: "#000000ff", light: "#ffffffff" } });
  const png = PNG.sync.read(buf as any);
  const innen = n * scale, ofs = rand * scale;
  const s = Math.round(innen * 7 / 46);               // Kreuzfeld 7 mm auf 46 mm
  const b = Math.max(2, Math.round(s * 0.07));          // weisser Rand
  const x0 = ofs + Math.round((innen - s) / 2), y0 = x0;
  const setz = (x: number, y: number, v: number) => { const i = (png.width * y + x) << 2; png.data[i] = v; png.data[i + 1] = v; png.data[i + 2] = v; png.data[i + 3] = 255; };
  for (let y = y0 - b; y < y0 + s + b; y++) for (let x = x0 - b; x < x0 + s + b; x++) setz(x, y, 255);
  for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) setz(x, y, 0);
  // weisses Kreuz: Balken 3/16 breit, 5/8 lang (Proportionen des Schweizerkreuzes)
  const bw = Math.round(s * 0.18), bl = Math.round(s * 0.6), cx = x0 + s / 2, cy = y0 + s / 2;
  for (let y = Math.round(cy - bw / 2); y < Math.round(cy + bw / 2); y++) for (let x = Math.round(cx - bl / 2); x < Math.round(cx + bl / 2); x++) setz(x, y, 255);
  for (let y = Math.round(cy - bl / 2); y < Math.round(cy + bl / 2); y++) for (let x = Math.round(cx - bw / 2); x < Math.round(cx + bw / 2); x++) setz(x, y, 255);
  return new Uint8Array(PNG.sync.write(png));
}

export function b64(bytes: Uint8Array) {
  let bin = ""; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH)) as unknown as number[]);
  return btoa(bin);
}
