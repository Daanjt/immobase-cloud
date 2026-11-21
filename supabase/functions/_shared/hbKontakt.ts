// H&B Real Estate: Ansprechperson eines Inserats von hbre.ch holen.
// Die Detailseite liegt unter /de/offer/detail--em<ref_object> (ref_object aus
// dem Flatfox-Inserat, ref_house "hbre"). Im Block "Kontakt" stehen Name (h4),
// Telefon (tel:) und die per Cloudflare verschluesselte E-Mail (data-cfemail).

const UA = { "User-Agent": "Mozilla/5.0 (DTHomes ImmoBase)" };

export type HbKontakt = { name: string | null; email: string | null; tel: string | null };

export function istHb(agency: string | null | undefined): boolean {
  return /^h\s*&\s*b\b/i.test((agency ?? "").trim());
}

function cfDecode(hex: string): string {
  const k = parseInt(hex.slice(0, 2), 16);
  let s = "";
  for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ k);
  return s;
}

function text(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

export async function hbKontaktVonRef(refObject: string): Promise<HbKontakt | null> {
  const ref = (refObject ?? "").trim();
  if (!ref) return null;
  const r = await fetch("https://www.hbre.ch/de/offer/detail--em" + ref, { headers: UA });
  if (!r.ok) return null;
  const html = await r.text();
  const i = html.indexOf(">Kontakt<");
  if (i < 0) return null;
  const end = html.indexOf("Besichtigung", i);
  const block = html.slice(i, end > i ? end : i + 2500);
  const name = (block.match(/<h4[^>]*>([\s\S]*?)<\/h4>/) ?? [])[1];
  const tel = (block.match(/href="tel:([^"]+)"/) ?? [])[1];
  const cf = (block.match(/data-cfemail="([0-9a-f]+)"/i) ?? [])[1];
  let email: string | null = cf ? cfDecode(cf) : null;
  if (!email) email = (block.match(/mailto:([^"?]+)/) ?? [])[1] ?? null;
  if (email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) email = null;
  const k = { name: name ? text(name) || null : null, email: email ? email.toLowerCase() : null, tel: tel ? tel.trim() : null };
  return k.name || k.email ? k : null;
}

// raw = Flatfox-Datensatz (falls vorhanden), sonst wird das Inserat per pk geholt.
export async function hbKontakt(flatfoxPk: string | number | null, raw?: any): Promise<HbKontakt | null> {
  let rec = raw;
  if (!rec?.ref_object && flatfoxPk) {
    try {
      const r = await fetch(`https://flatfox.ch/api/v1/public-listing/${encodeURIComponent(String(flatfoxPk))}/`, { headers: UA });
      if (r.ok) rec = await r.json();
    } catch (_e) { /* ignorieren */ }
  }
  const ref = rec?.ref_object ? String(rec.ref_object) : "";
  if (!ref) return null;
  try { return await hbKontaktVonRef(ref); } catch (_e) { return null; }
}
