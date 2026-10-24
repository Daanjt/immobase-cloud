// Code-Pruefung vor jedem Build (laeuft automatisch in build.cjs, also auch bei Vercel).
// Findet Fehler, die sonst erst beim Klicken in der App auffallen:
//   - doppelt deklarierte Funktionen/Variablen (no-redeclare)
//   - Namen, die es an der Stelle gar nicht gibt (no-undef), z.B. Funktion aus anderer Komponente
//   - doppelte Schluessel in Objekten, Zuweisung an const usw.
// Findet die Pruefung einen Fehler, bricht der Build ab und die letzte funktionierende
// Version bleibt online.  Manuell:  node check.cjs [datei.html ...]
const fs = require("fs");
const path = require("path");
const B = require("@babel/standalone");
const { Linter } = require("eslint");
const globals = require("globals");

const REGELN = {
  "no-undef": 2, "no-redeclare": 2, "no-dupe-keys": 2, "no-func-assign": 2,
  "no-dupe-args": 2, "no-const-assign": 2, "no-dupe-else-if": 2, "no-self-assign": 2,
};
// Babel-Hilfsfunktion, kein Fehler im eigenen Code
const IGNORIEREN = (x) => x.ruleId === "no-func-assign" && /'_extends'/.test(x.message);

function pruefeDatei(datei) {
  const html = fs.readFileSync(datei, "utf8");
  const re = /<script([^>]*)type="text\/babel"([^>]*)>([\s\S]*?)<\/script>/g;
  const linter = new Linter();
  const g = { ...globals.es2021, ...globals.browser, React: "readonly", ReactDOM: "readonly" };
  const fehler = [];
  let m, anzahl = 0;
  while ((m = re.exec(html))) {
    anzahl++;
    const startZeile = html.slice(0, m.index + m[0].indexOf(">") + 1).split("\n").length;
    let js;
    try {
      js = B.transform(m[3], { presets: ["react"], sourceType: "script", compact: false, retainLines: true }).code;
    } catch (e) {
      fehler.push(`${path.basename(datei)}: Syntaxfehler: ${String(e.message).split("\n")[0]}`);
      continue;
    }
    for (const x of linter.verify(js, { parserOptions: { ecmaVersion: 2022, sourceType: "script" }, globals: g, rules: REGELN })) {
      if (x.severity < 2 || IGNORIEREN(x)) continue;
      fehler.push(`${path.basename(datei)}:${startZeile + x.line - 1}  ${x.ruleId}  ${x.message}`);
    }
  }
  return { anzahl, fehler };
}

function pruefe(dateien) {
  let alle = [], skripte = 0;
  for (const d of dateien) { const r = pruefeDatei(d); skripte += r.anzahl; alle = alle.concat(r.fehler); }
  return { skripte, fehler: alle };
}

module.exports = { pruefe };

if (require.main === module) {
  const dateien = process.argv.slice(2).length ? process.argv.slice(2)
    : fs.readdirSync(__dirname).filter(n => n.endsWith(".html")).map(n => path.join(__dirname, n));
  const r = pruefe(dateien);
  r.fehler.forEach(f => console.log(f));
  console.log(`Code-Pruefung: ${r.skripte} Skript(e), ${r.fehler.length} Fehler`);
  process.exit(r.fehler.length ? 1 : 0);
}
