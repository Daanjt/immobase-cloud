// Einheitlicher Look fuer alle Mails an Mieter und Interessenten (wie das Suchabo):
// heller Papier-Hintergrund, Ueberschrift in Serifenschrift, runde dunkle Knoepfe,
// weiche Info-Boxen. Wird auf das fertige HTML angewendet, kurz vor dem Versand,
// damit die einzelnen Vorlagen unveraendert bleiben koennen.
// Nur fuer Mails an Mieter verwenden, nicht fuer interne Mails oder Mails an Verwaltungen.

const PAPER = "#FBFAF6";
const INK = "#1C1B17";
const ESPRESSO = "#211E19";
const CREAM = "#EAE3D5";
const LINE = "#E4DDD0";
const BOX = "#F6F1E8";
const SERIF = "Georgia,'Times New Roman',serif";

export function mailStil(html: string): string {
  if (!html || html.includes("data-dt-stil")) return html;
  let s = html;

  // Hintergrund und Grundfarben
  s = s.replace(/background:#f7f3eb/gi, `background:${PAPER}`).replace(/background:#fefcf7/gi, `background:${PAPER}`);
  s = s.replace(/<body /i, '<body data-dt-stil="1" ');

  // kleine Grossbuchstaben-Zeile oben in der Karte -> Ueberschrift in Serifenschrift
  s = s.replace(
    /<div style="font-size:(?:9|10)px;color:#8a8174;letter-spacing:\.25em;text-transform:uppercase;margin-bottom:(?:12|28)px;">([^<]{2,80})<\/div>/,
    (_m, t) => `<div style="font-family:${SERIF};font-size:26px;line-height:1.25;color:${INK};margin:0 0 18px;letter-spacing:0;text-transform:none;">${t}</div>`,
  );

  // Knoepfe: dunkle Rechtecke -> runde Pillen
  s = s.replace(/<a ([^>]*?)style="([^"]*?)background:#1a1814;([^"]*)"/gi, (m, vor, a, b) => {
    const st = (a + "background:#1a1814;" + b);
    if (!/display:inline-block/i.test(st) || !/padding:/i.test(st)) return m;
    const neu = st
      .replace(/background:#1a1814;?/i, `background:${ESPRESSO};`)
      .replace(/color:#(?:fff|ffffff|fefcf7);?/i, `color:${CREAM};`)
      .replace(/border-radius:\d+px;?/i, "border-radius:999px;")
      .replace(/font-weight:\d+;?/i, "font-weight:600;");
    return `<a ${vor}style="${neu}${/border-radius/i.test(neu) ? "" : "border-radius:999px;"}"`;
  });

  // Info-Boxen: harter schwarzer Balken links -> weiche, runde Box
  s = s.replace(/background:#faf8f3;border-left:3px solid #1a1814;/gi, `background:${BOX};border-radius:12px;`);
  s = s.replace(/bgcolor="#faf8f3"/gi, `bgcolor="${BOX}"`);
  s = s.replace(/background:#f5efe2;/gi, `background:${BOX};`);

  // Karte und Linien
  s = s.replace(/border:1px solid #e1d8c5;border-radius:(?:10|14)px;/gi, `border:1px solid ${LINE};border-radius:16px;`);
  s = s.replace(/border-top:1px solid #f0eadd/gi, `border-top:1px solid ${LINE}`);

  // Text etwas groesser und in der Webseiten-Farbe
  s = s.replace(/<p style="font-size:14px;/gi, '<p style="font-size:15px;line-height:1.6;');
  s = s.replace(/color:#1a1814/gi, `color:${INK}`);

  // Zeilen "Bezeichnung: https://..." (Link-Text = Adresse) -> runder Knopf mit der Bezeichnung
  s = s.replace(/(^|<br>|<br \/>|<p [^>]*>)([^<>:\n]{2,40}): <a href="(https?:\/\/[^"]+)"[^>]*>\3<\/a>(?=<br>|<br \/>|<\/p>)/g,
    (_m, vor, label, url) => `${vor}<a href="${url}" style="display:inline-block;margin:6px 0;padding:11px 22px;background:${ESPRESSO};color:${CREAM};border-radius:999px;text-decoration:none;font-size:14px;font-weight:600;">${label.trim()}</a>`);

  // Logo etwas kleiner wie auf der Webseite
  s = s.replace(/width="100" style="display:inline-block;width:100px;height:auto;"/g, 'width="96" style="display:inline-block;width:96px;height:auto;"');
  return s;
}
