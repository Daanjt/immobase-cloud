// Build fuer admin.dthomes.ch: wandelt den JSX-Code (text/babel) schon beim Veroeffentlichen
// in normales JavaScript um. So muss das Handy beim Start nichts mehr umwandeln (viel schnellerer Start).
// Gleicher Babel wie vorher im Browser (@babel/standalone 7.18.6, preset react) => gleiches Verhalten.
const fs = require("fs"), path = require("path");
const B = require("@babel/standalone");
const SRC = __dirname, OUT = path.join(__dirname, "dist");
// Zuerst den Code pruefen. Bei Fehlern bricht der Build ab, die letzte Version bleibt online.
{
  const { pruefe } = require("./check.cjs");
  const r = pruefe(fs.readdirSync(SRC).filter(n => n.endsWith(".html")).map(n => path.join(SRC, n)));
  if (r.fehler.length) {
    r.fehler.forEach(f => console.error("  " + f));
    throw new Error(`Code-Pruefung: ${r.fehler.length} Fehler gefunden, Build abgebrochen`);
  }
  console.log(`Code-Pruefung ok (${r.skripte} Skript(e))`);
}
const SKIP = new Set(["node_modules", "dist", "src", "build.cjs", "check.cjs", "package.json", "package-lock.json", ".vercel", "vercel.json", "README.md"]);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
function kopieren(von, nach) {
  for (const n of fs.readdirSync(von)) {
    if (SKIP.has(n) || n.startsWith(".")) continue;
    const a = path.join(von, n), b = path.join(nach, n);
    if (fs.statSync(a).isDirectory()) { fs.mkdirSync(b, { recursive: true }); kopieren(a, b); }
    else fs.copyFileSync(a, b);
  }
}
kopieren(SRC, OUT);
let total = 0;
const { zusammensetzen } = require("./check.cjs");
for (const f of fs.readdirSync(OUT).filter(n => n.endsWith(".html"))) {
  // App-Code aus src/*.jsx einsetzen (Quelle ist SRC, nicht die Kopie in OUT)
  let h = zusammensetzen(path.join(SRC, f)).html;
  let anzahl = 0;
  h = h.replace(/<script([^>]*)type="text\/babel"([^>]*)>([\s\S]*?)<\/script>/g, (m, a1, a2, code) => {
    anzahl++;
    const js = B.transform(code, { presets: ["react"], sourceType: "script", compact: false, comments: false }).code;
    if (/<\/script/i.test(js)) throw new Error(f + ": kompilierter Code enthaelt </script>");
    return "<script>" + js + "</script>";
  });
  if (anzahl) h = h.replace(/<script[^>]*@babel\/standalone[^>]*><\/script>\s*/g, "");
  fs.writeFileSync(path.join(OUT, f), h);
  if (anzahl) console.log(f + ": " + anzahl + " Skript(e) vorkompiliert");
  total += anzahl;
}
if (!total) throw new Error("Keine text/babel-Skripte gefunden");
