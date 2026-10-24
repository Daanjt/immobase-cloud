// ─── SHARED CONTRACT BUILDERS (used by both Bewerber and Mieter) ────────────

function formatDateLong(dateStr){
  if (!dateStr) return "____";
  const d = typeof dateStr === "string" ? new Date(dateStr.includes("-") ? dateStr : dateStr.split(".").reverse().join("-")) : dateStr;
  if (isNaN(d.getTime())) return dateStr;
  const months = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
  return `${d.getDate()}. ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// Wohnung (unmoebliert): Vertragswerte aus Wohnung + Personenzahl ableiten
// Nebenkosten einer ganzen Wohnung: eigener Wert, sonst die frueheren Nebenkosten, sonst CHF 100
// Stockwerk ausgeschrieben fuer den Vertrag: "EG" -> "Erdgeschoss", "4. OG" -> "4. Obergeschoss"
function stockwerkLang(s){
  const t = String(s||"").trim();
  if (!t) return "";
  if (/^EG$/i.test(t)) return "Erdgeschoss";
  const m = t.match(/^(\d+)\.?\s*OG$/i); if (m) return `${m[1]}. Obergeschoss`;
  const u = t.match(/^(\d+)\.?\s*UG$/i); if (u) return `${u[1]}. Untergeschoss`;
  if (/^UG$/i.test(t)) return "Untergeschoss";
  if (/^DG$/i.test(t)) return "Dachgeschoss";
  return t;
}
function nkWohnung(apt){
  const v = apt && apt.nebenkosten_wohnung;
  if (v !== null && v !== undefined && v !== "" && !isNaN(+v)) return +v;
  const f = apt && apt.frueherer_nk;
  if (f !== null && f !== undefined && f !== "" && +f > 0) return +f;
  return 100;
}
function wohnungVertragswerte(p, apt, room, personen){
  const pers = Math.max(1, +personen || 1);
  // Nebenkosten: aus der Wohnung (= fruehere NK), im Vertrag manuell aenderbar (p.nkManuell)
  const nk = (p.nkManuell !== null && p.nkManuell !== undefined && p.nkManuell !== "") ? Math.max(0, +p.nkManuell || 0) : nkWohnung(apt);
  // Die Miete im Zimmer ist (wie bei WG-Zimmern) die Bruttomiete inkl. Nebenkosten; die NK werden davon abgezogen, nur Strom kommt dazu
  const basis = room ? (+room.miete || 0) : (p._bruttoBasis != null ? +p._bruttoBasis : ((+p.nettomiete || 0) + (p.nebenkosten != null ? +p.nebenkosten : 100)));
  const netto = Math.max(0, basis - nk);
  const strom = 25 * pers; // Strom: CHF 25 pro Person
  const brutto = netto + nk;
  const km = p.kautionMonate == null ? 3 : p.kautionMonate;
  const auf = p.aufschlag || 0;
  const fNetto = +(apt && apt.frueherer_mietzins) || 0;
  const fNk = +(apt && apt.frueherer_nk) || 0;
  return { ...p, _bruttoBasis: basis, vertragsart: "wohnung", personen: pers, fruehererNetto: fNetto || "", fruehererNk: fNetto ? fNk : "", fruehererMietzins: fNetto ? fNetto + fNk : "", nettomiete: netto, nebenkosten: nk, strom, bruttomiete: brutto, total: brutto + strom + auf, kautionBetrag: (brutto + strom) * km, moebliert: false };
}
function objektLabel(roomId){
  const d = (typeof window!=="undefined" && window.__IB_DATA) || {};
  const r = (d.rooms||[]).find(x=>x.id===roomId); const a = r ? (d.apts||[]).find(x=>x.id===r.aptId) : null;
  return (a && a.vermietungsart==="wohnung") ? `${a.id} · Wohnung` : (roomId||"");
}
function istWohnungsVertrag(v){ return !!(v && (v.vertragsart === "wohnung" || (v.apt && v.apt.vermietungsart === "wohnung"))); }

// Optionale*r Mitmieter*in (nur Wohnungen). Standard: nur ein Hauptmieter.
function mitmieterFehlt(mm){
  if (!mm) return "";
  const f = [];
  if (!String(mm.vorname||"").trim()) f.push("Vorname");
  if (!String(mm.nachname||"").trim()) f.push("Nachname");
  if (!/^\S+@\S+\.\S+$/.test(String(mm.email||"").trim())) f.push("E-Mail");
  if (!String(mm.geburt||"").trim()) f.push("Geburtsdatum");
  return f.join(", ");
}
function mitmieterZeile(mm){
  if (!mm || !mm.vorname) return null;
  const name = `${mm.vorname||""} ${mm.nachname||""}`.trim();
  const det = [mm.email, mm.phone, mm.geburt ? fmtDateDE(mm.geburt) : "", mm.nat, mm.job, mm.arbeitgeber, mm.einkommen ? `CHF ${mm.einkommen}` : ""].filter(Boolean).join(" · ");
  return <span>{name}{mm.aktiv===false?<span style={{color:"#8a8174"}}> (zieht mit ein, nicht im Vertrag)</span>:<span style={{color:"#5a6e4a",fontWeight:600}}> · solidarisch</span>}{det?<span style={{display:"block",fontSize:11.5,color:"#8a8174"}}>{det}</span>:null}</span>;
}
// Weitere mitziehende Personen (ab 3. Person): nur Info, nicht Vertragspartei
function weiterePersonenZeile(wp){
  if (!Array.isArray(wp) || !wp.length) return null;
  return <span>{wp.map((p,i)=>{ const det=[p.geburt?fmtDateDE(p.geburt):"", p.nat, p.job, p.email, p.phone].filter(Boolean).join(" · "); return <span key={i} style={{display:"block",marginBottom:4}}>{`${p.vorname||""} ${p.nachname||""}`.trim()}<span style={{color:"#8a8174"}}> (zieht mit ein, nicht im Vertrag)</span>{det?<span style={{display:"block",fontSize:11,color:"#8a8174"}}>{det}</span>:null}</span>; })}</span>;
}
function MitmieterEditor({ value, draft, onChange }){
  const aktiv = !!value;
  const d = value || draft || {};
  const [loc, setLoc] = React.useState(d);
  React.useEffect(() => { setLoc(value || draft || {}); }, [aktiv]);
  const set = (k, val) => setLoc(p => ({ ...p, [k]: val }));
  const commit = () => { if (aktiv) onChange({ ...loc, aktiv: true }, loc); };
  const toggle = (on) => { if (on) onChange({ ...loc, aktiv: true }, loc); else onChange(null, loc); };
  const fehlt = aktiv ? mitmieterFehlt(loc) : "";
  const inp = (k, label, type) => (
    <div className="fg" style={{marginBottom:6}}><label className="fl">{label}</label>
      <input className="fi" type={type||"text"} value={loc[k]||""} onChange={e=>set(k,e.target.value)} onBlur={commit}/></div>
  );
  return (
    <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #ece4d3"}}>
      <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5,cursor:"pointer"}}>
        <input type="checkbox" checked={aktiv} onChange={e=>toggle(e.target.checked)}/>
        <span><strong>Mitmieter*in</strong> in den Vertrag aufnehmen (haftet solidarisch, unterschreibt mit)</span>
      </label>
      {!aktiv && <div style={{fontSize:11,color:"#8a8174",marginTop:4}}>Standard: nur ein*e Hauptmieter*in{(draft&&draft.vorname)?` · Angaben zu ${draft.vorname} ${draft.nachname||""} sind gespeichert`:""}</div>}
      {aktiv && <div style={{marginTop:8}}>
        <div className="frow">{inp("vorname","Vorname *")}{inp("nachname","Nachname *")}</div>
        <div className="frow">{inp("email","E-Mail *","email")}{inp("phone","Telefon")}</div>
        <div className="frow">{inp("geburt","Geburtsdatum *","date")}{inp("nat","Nationalität")}</div>
        {fehlt && <div style={{fontSize:11,color:"#9b4a3e",marginTop:2}}>Fehlt noch: {fehlt}</div>}
      </div>}
    </div>
  );
}
function buildAnfangsmietzinsHTML(b, v, fullNameIn, fmtDate){
  const chf2 = n => Number(n||0).toLocaleString("de-CH");
  const _W = istWohnungsVertrag(v);
  const _MM = (_W && v.mitmieter && String(v.mitmieter.vorname||"").trim()) ? `${v.mitmieter.vorname||""} ${v.mitmieter.nachname||""}`.trim() : "";
  const fullName = _MM ? `${fullNameIn} und ${_MM}` : fullNameIn;
  const _stw = v.apt && v.apt.stockwerk ? `, ${String(v.apt.stockwerk).trim()}` : "";
  const adresseLiegenschaft = _W ? `${v.adresse}, ${v.plz} ${v.ort}${_stw}, ganze Wohnung${v.apt&&v.apt.zimmer?` (${v.apt.zimmer} Zimmer)`:""}` : `${v.adresse}, ${v.plz} ${v.ort}${_stw}, Zimmer ${v.zimmerId}`;
  const adresseMieter = b.adresse ? `${b.adresse}, ${b.plz||""} ${b.ort||""}`.trim() : "";
  const datumLong = new Date().toLocaleDateString("de-CH", {day:"numeric",month:"long",year:"numeric"});
  // Defensive recalculation - Strom fix 25 für dieses Formular
  // Kautions-Servicegebühr wird im Anfangsmietzins NICHT aufgelistet (gehört nicht zum amtlichen Mietzins)
  const stromFix = _W ? (+v.strom || 0) : 25;
  const nettomiete = +v.nettomiete || 0;
  // Frueherer Mietzins: ein Bruttowert (inkl. NK + Strom), netto = brutto - NK - Strom
  let _fb = +v.fruehererMietzins || 0;
  let _fnk = +v.nebenkosten || 0;
  let _fstr = +v.strom || 0;
  let _fnetto = _fb > 0 ? (_fb - _fnk - _fstr) : 0;
  if (_W && +v.fruehererNetto > 0 && (+v.fruehererMietzins||0) === (+v.fruehererNetto) + (+v.fruehererNk||0)) {
    // Wohnung: frueherer Mietzins aus den Wohnungsdaten (Vormieter), Strom war nicht inbegriffen
    _fnetto = +v.fruehererNetto; _fnk = +v.fruehererNk || 0; _fstr = 0; _fb = _fnetto + _fnk;
  }
  const nebenkosten = _W ? (+v.nebenkosten || 0) : (+v.nebenkosten || 100);
  const totalCalc = nettomiete + nebenkosten + stromFix;
  // Override v so the template below uses the corrected values
  v = {...v, strom: stromFix, total: totalCalc};
  
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Anfangsmietzins - ${fullName}</title>
<style>
@page{size:A4;margin:15mm 18mm}
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;line-height:1.45;color:#000;background:#fff}
@media print{body{padding:0}.print-banner{display:none!important}}
.print-banner{position:fixed;top:0;left:0;right:0;background:#1a1a1a;color:#fff;padding:12px 20px;text-align:center;font-size:13px;z-index:9999;font-family:Helvetica,Arial,sans-serif}
.print-banner button{background:#fff;color:#1a1a1a;border:none;padding:7px 18px;margin-left:14px;font-weight:600;border-radius:4px;cursor:pointer;font-size:13px}

/* HEADER mit Logo */
.doc-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14pt}
.doc-top .logo{width:36mm}
.doc-top .logo img{width:100%;display:block}
.doc-top .title{flex:1;text-align:center}
.doc-top h1{font-size:14pt;font-weight:700;margin-bottom:3pt}
.doc-top .subtitle{font-size:9.5pt;color:#444;font-style:italic}

/* Window-fields (für Fenstercouvert) */
.window-row{display:grid;grid-template-columns:1fr 1fr;gap:24pt;margin-bottom:18pt}
.window-box{border:.4pt solid #ccc;padding:10pt 12pt;background:#fafafa;min-height:50pt;font-size:9pt}
.window-box .lbl{font-size:7.5pt;color:#888;text-transform:uppercase;letter-spacing:.15em;margin-bottom:4pt;font-weight:600}
.window-box .content{line-height:1.55}

/* Intro paragraph */
.intro{font-size:9pt;line-height:1.5;text-align:justify;margin-bottom:14pt;padding:9pt 12pt;background:#f5efe4;border-left:3pt solid #1a1a1a}

/* Section blocks */
.section{margin-bottom:12pt}
.section h2{font-size:10pt;font-weight:700;margin-bottom:6pt;padding-bottom:3pt;border-bottom:.4pt solid #1a1a1a}

.field-row{display:flex;align-items:baseline;gap:6pt;margin-bottom:4pt;font-size:9pt}
.field-row .lbl{min-width:55%;color:#333}
.field-row .val{flex:1;border-bottom:.3pt dotted #999;padding:1pt 4pt;font-weight:500}

/* Address line */
.addr-row{margin-bottom:8pt;font-size:9pt}
.addr-row .lbl{font-weight:600;margin-right:8pt}
.addr-row .val{display:inline-block;border-bottom:.3pt solid #999;padding:1pt 4pt;min-width:300pt;font-weight:500}

/* Mietzins-Tabelle */
table.mietzins{width:100%;border-collapse:collapse;margin-top:4pt;font-size:9pt}
table.mietzins th{background:#f0ebe0;border:.5pt solid #888;padding:5pt 7pt;font-weight:700;text-align:left;font-size:8.5pt}
table.mietzins th.amt{text-align:right;width:90pt}
table.mietzins td{border:.4pt solid #aaa;padding:5pt 7pt}
table.mietzins td.amt{text-align:right;font-variant-numeric:tabular-nums;font-weight:500}
table.mietzins tr.total td{font-weight:700;background:#fafaf3}

/* Subindexes */
.indent{margin-left:14pt;font-size:8.5pt;color:#444}

/* YN options */
.yn-row{display:flex;gap:18pt;align-items:center;font-size:9pt}
.yn-box{display:inline-block;width:11pt;height:11pt;border:.5pt solid #000;text-align:center;line-height:11pt;font-weight:700;margin-right:4pt}

/* Signatures */
.sig-section{margin-top:20pt;padding-top:14pt;border-top:.5pt solid #1a1a1a}
.sig-section .confirm{font-size:9pt;margin-bottom:14pt;font-style:italic}
.sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:30pt;margin-top:14pt}
.sig-block .lbl{font-size:8pt;color:#888;text-transform:uppercase;letter-spacing:.15em;margin-bottom:3pt;font-weight:600}
.sig-block .name{font-size:9pt;font-weight:600;margin-bottom:18pt}
.sig-row-inner{display:flex;gap:10pt;margin-bottom:5pt;font-size:8.5pt}
.sig-row-inner .label{font-weight:600;min-width:64pt}
.sig-row-inner .line{flex:none;width:150pt;border-bottom:.4pt solid #888;min-height:12pt}

/* Page 2-3 (Auszug OR) */
.or-page{page-break-before:always}
.or-page h1{font-size:11pt;font-weight:700;margin-bottom:6pt}
.or-page h2{font-size:9.5pt;font-weight:700;margin:8pt 0 3pt}
.or-page p{font-size:7.5pt;line-height:1.5;margin-bottom:5pt;text-align:justify}
.or-page .small-title{font-size:8pt;font-weight:700;margin:10pt 0 4pt;color:#444}
.or-cols{column-count:2;column-gap:14pt}

.footer{margin-top:18pt;padding-top:8pt;border-top:.3pt solid #ccc;text-align:center;font-size:7.5pt;color:#888;font-style:italic}
</style>
</head>
<body>

<div class="print-banner">
Anfangsmietzins-Formular bereit · Wähle <strong>"Als PDF speichern"</strong> im Druck-Dialog
<button onclick="window.print()">📄 Drucken / PDF speichern</button>
<button onclick="window.close()" style="background:transparent;color:#fff;border:1px solid #fff">Schliessen</button>
</div>

<!-- HEADER -->
<div class="doc-top">
<div class="logo"><img src="${DT_LOGO_DATA_URI}" alt="D&T Homes"/></div>
<div class="title">
  <h1>Mitteilung des Anfangsmietzinses</h1>
  <div class="subtitle">gemäss Art. 270 Abs. 2 OR und § 229 b EG ZGB</div>
</div>
<div style="width:36mm"></div>
</div>

<div class="intro">
Gestützt auf Art. 270 Abs. 2 des Obligationenrechts (OR) und § 229 b des Einführungsgesetzes zum Schweizerischen Zivilgesetzbuch (EG ZGB) geben wir Ihnen im Zusammenhang mit dem Abschluss des neuen Mietvertrags folgenden früheren Mietzins und Anfangsmietzins bekannt:
</div>

<!-- WINDOW (für Fenstercouvert links/rechts) -->
<div class="window-row">
<div class="window-box">
  <div class="lbl">Vermieterin</div>
  <div class="content">
    D&amp;T Partners GmbH<br>
    Via Campeun 40<br>
    7403 Rhäzüns
  </div>
</div>
<div class="window-box">
  <div class="lbl">Mieter*in</div>
  <div class="content">
    ${fullName}<br>
    ${adresseMieter ? adresseMieter.replace(/, /g, '<br>') : '-'}
  </div>
</div>
</div>

<!-- Adresse Liegenschaft -->
<div class="addr-row">
<span class="lbl">Adresse Liegenschaft/en:</span>
<span class="val">${adresseLiegenschaft}</span>
</div>

<!-- MIETZINS TABELLE -->
<div class="section">
<table class="mietzins">
  <thead>
    <tr>
      <th>Mietzins</th>
      <th class="amt">Früherer Mietzins</th>
      <th class="amt">Anfangsmietzins (neu)</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Nettomietzins (ohne Nebenkosten)</td><td class="amt">${(_fb>0)?`Fr. ${chf2(_fnetto)}`:"Fr. -"}</td><td class="amt">Fr. ${chf2(v.nettomiete)}</td></tr>
    <tr><td>Nebenkosten</td><td class="amt">${(_fb>0)?`Fr. ${chf2(_fnk)}`:"Fr. -"}</td><td class="amt">Fr. ${chf2(v.nebenkosten)}</td></tr>
    <tr><td>Stromkosten (pauschal)</td><td class="amt">${(_fb>0&&_fstr>0)?`Fr. ${chf2(_fstr)}`:"Fr. -"}</td><td class="amt">Fr. ${chf2(v.strom)}</td></tr>
    <tr class="total"><td>Total Mietzins inkl. Nebenkosten</td><td class="amt">${(_fb>0)?`Fr. ${chf2(_fb)}`:"Fr. -"}</td><td class="amt">Fr. ${chf2(v.total)}</td></tr>
  </tbody>
</table>
<div class="indent" style="margin-top:6pt">(seit: -)</div>
</div>

<!-- 1. Berechnungsgrundlagen -->
<div class="section">
<h2>1. Berechnungsgrundlagen des bisherigen Mietzinses</h2>
<div class="field-row">
  <span class="lbl">Referenzzinssatz für hypothekarische Bauobjekte:</span>
  <span class="val">${(v.apt&&v.apt.refzins)?v.apt.refzins:"1.25"} %</span>
</div>
<div class="field-row">
  <span class="lbl">Landesindex der Konsumentenpreise (Basis Dez. 2020 = 100):</span>
  <span class="val">106.9 Pkte</span>
</div>
</div>

<!-- 2. Vorbehalte -->
<div class="section">
<h2>2. Vorbehalte für allfällige spätere Mietzinserhöhungen</h2>
<div style="font-size:8.5pt;color:#666;font-style:italic">Keine Vorbehalte gemäss vorherigem Mietvertrag oder letzter Mietzinsanpassung.</div>
</div>

<!-- 3. Beginn -->
<div class="section">
<h2>3. Beginn des neuen Mietvertrags</h2>
<div class="field-row">
  <span class="lbl">Mietbeginn:</span>
  <span class="val">${fmtDate(v.einzug)}</span>
</div>
</div>

<!-- 4. Begründung -->
<div class="section">
<h2>4. Klare Begründung der (eventuellen) Erhöhung des Anfangsmietzinses</h2>
<div style="font-size:8.5pt;line-height:1.5">
  ${(_fb>0)
    ? `Der Anfangsmietzins entspricht den orts- und quartierüblichen Mietzinsen vergleichbarer Wohnobjekte (Art. 269a lit. a OR).${(+v.nettomiete > _fnetto) ? ` Die Anpassung gegenüber dem früheren Mietzins ist orts- und quartierüblich begründet.` : ` Gegenüber dem früheren Mietzins erfolgt keine Erhöhung.`}`
    : `Der Anfangsmietzins entspricht den orts- und quartierüblichen Mietzinsen vergleichbarer Wohnobjekte (Art. 269a lit. a OR). Eine Erhöhung gegenüber dem früheren Mietzins liegt nicht vor, da das Objekt erstmalig untervermietet wird bzw. ein Mieterwechsel ohne Mietzinserhöhung erfolgt.`}
</div>
</div>

<!-- 5. Förderbeiträge - auf neuer Seite -->
<div class="section" style="page-break-before:always">
<h2>5. Bei Erhöhung wegen Mehrleistungen: Erhalt von Förderbeiträgen für wertvermehrende Verbesserungen</h2>
<div class="yn-row">
  <span><span class="yn-box"></span>Ja</span>
  <span><span class="yn-box">X</span>Nein</span>
</div>
</div>

<!-- HINWEIS Anfechtung -->
<div style="margin-top:14pt;padding:9pt 12pt;background:#fafafa;border:.4pt solid #ccc;font-size:8.5pt;line-height:1.5">
<strong>Hinweis zur Anfechtung:</strong> Der/die Mieter*in kann den Anfangsmietzins gemäss Art. 270 Abs. 1 OR innert 30 Tagen nach der Übernahme des Mietobjekts bei der Paritätischen Schlichtungsbehörde des Bezirks, in dem sich das Mietobjekt befindet (zuständiges Bezirksgericht), als missbräuchlich anfechten und dessen Herabsetzung verlangen. Wenn keine Anfechtung erfolgt, gilt der Anfangsmietzins als angenommen.
</div>

<!-- UNTERSCHRIFTEN -->
<div class="sig-section">
<div class="confirm">Der/die Mieter*in bestätigt, ein Doppel dieses Formulars erhalten zu haben.</div>
<div class="sig-grid">
  <div class="sig-block">
    <div class="lbl">Vermieter*in</div>
    <div class="name">D&amp;T Partners GmbH</div>
    <div class="sig-row-inner"><span class="label">Datum:</span><span class="line"></span></div>
    <div class="sig-row-inner"><span class="label">Unterschrift:</span><span class="line"></span></div>
  </div>
  <div class="sig-block">
    <div class="lbl">Mieter*in</div>
    <div class="name">${fullName}</div>
    <div class="sig-row-inner"><span class="label">Datum:</span><span class="line"></span></div>
    <div class="sig-row-inner"><span class="label">Unterschrift:</span><span class="line"></span></div>
  </div>
</div>
</div>

<div class="footer">Formular bereitgestellt durch die Direktion der Justiz und des Innern des Kantons Zürich</div>

<!-- SEITE 2-3: Auszug OR ->
<div class="or-page">
<h1>Auszug aus den massgeblichen Bestimmungen des Schweizerischen Obligationenrechts</h1>
<div style="font-size:8pt;color:#444;margin-bottom:6pt;font-style:italic">Achter Titel: Die Miete · Zweiter Abschnitt: Schutz vor missbräuchlichen Mietzinsen und anderen missbräuchlichen Forderungen des Vermieters bei der Miete von Wohn- und Geschäftsräumen</div>

<div class="or-cols">
  <h2>Art. 269 (A. Missbräuchliche Mietzinse. I. Regel)</h2>
  <p>Mietzinse sind missbräuchlich, wenn damit ein übersetzter Ertrag aus der Mietsache erzielt wird oder wenn sie auf einem offensichtlich übersetzten Kaufpreis beruhen.</p>
  
  <h2>Art. 269a (II. Ausnahmen)</h2>
  <p>Mietzinse sind in der Regel nicht missbräuchlich, wenn sie insbesondere:</p>
  <p>a. im Rahmen der orts- oder quartierüblichen Mietzinse liegen;<br>
  b. durch Kostensteigerungen oder Mehrleistungen des Vermieters begründet sind;<br>
  c. bei neueren Bauten im Rahmen der kostendeckenden Bruttorendite liegen;<br>
  d. lediglich dem Ausgleich einer Mietzinsverbilligung dienen, die zuvor durch Umlagerung marktüblicher Finanzierungskosten gewährt wurde, und in einem dem Mieter im voraus bekanntgegebenen Zahlungsplan festgelegt sind;<br>
  e. lediglich die Teuerung auf dem risikotragenden Kapital ausgleichen;<br>
  f. das Ausmass nicht überschreiten, das Vermieter- und Mieterverbände oder Organisationen, die ähnliche Interessen wahrnehmen, in ihren Rahmenverträgen empfehlen.</p>
  
  <h2>Art. 269b (B. Indexierte Mietzinse)</h2>
  <p>Die Vereinbarung, dass der Mietzins einem Index folgt, ist nur gültig, wenn der Mietvertrag für mindestens fünf Jahre abgeschlossen und als Index der Landesindex der Konsumentenpreise vorgesehen wird.</p>
  
  <h2>Art. 269c (C. Gestaffelte Mietzinse)</h2>
  <p>Die Vereinbarung, dass sich der Mietzins periodisch um einen bestimmten Betrag erhöht, ist nur gültig, wenn:<br>
  a. der Mietvertrag für mindestens drei Jahre abgeschlossen wird;<br>
  b. der Mietzins höchstens einmal jährlich erhöht wird; und<br>
  c. der Betrag der Erhöhung in Franken festgelegt wird.</p>
  
  <h2>Art. 269d (D. Mietzinserhöhungen)</h2>
  <p><strong>1</strong> Der Vermieter kann den Mietzins jederzeit auf den nächstmöglichen Kündigungstermin erhöhen. Er muss dem Mieter die Mietzinserhöhung mindestens zehn Tage vor Beginn der Kündigungsfrist auf einem vom Kanton genehmigten Formular mitteilen und begründen.</p>
  <p><strong>2</strong> Die Mietzinserhöhung ist nichtig, wenn der Vermieter:<br>
  a. sie nicht mit dem vorgeschriebenen Formular mitteilt;<br>
  b. sie nicht begründet;<br>
  c. mit der Mitteilung die Kündigung androht oder ausspricht.</p>
  <p><strong>3</strong> Die Absätze 1 und 2 gelten auch, wenn der Vermieter beabsichtigt, sonstwie den Mietvertrag einseitig zu Lasten des Mieters zu ändern.</p>
  
  <h2>Art. 270 (E. Anfechtung des Mietzinses I.)</h2>
  <p><strong>1</strong> Der Mieter kann den Anfangsmietzins innert 30 Tagen nach Übernahme der Sache bei der Schlichtungsbehörde als missbräuchlich im Sinne der Artikel 269 und 269a anfechten und dessen Herabsetzung verlangen, wenn:<br>
  a. er sich wegen einer persönlichen oder familiären Notlage oder wegen der Verhältnisse auf dem örtlichen Markt für Wohn- und Geschäftsräume zum Vertragsabschluss gezwungen sah; oder<br>
  b. der Vermieter den Anfangsmietzins gegenüber dem früheren Mietzins für dieselbe Sache erheblich erhöht hat.</p>
  
  <h2>Art. 270a (2. Während der Mietdauer)</h2>
  <p><strong>1</strong> Der Mieter kann den Mietzins als missbräuchlich anfechten und die Herabsetzung auf den nächstmöglichen Kündigungstermin verlangen, wenn er Grund zur Annahme hat, dass der Vermieter wegen einer wesentlichen Änderung der Berechnungsgrundlagen einen übersetzten Ertrag aus der Mietsache erzielt.</p>
  
  <h2>Art. 270b (II. Anfechtung von Mietzinserhöhungen)</h2>
  <p><strong>1</strong> Der Mieter kann eine Mietzinserhöhung innert 30 Tagen, nachdem sie ihm mitgeteilt worden ist, bei der Schlichtungsbehörde als missbräuchlich anfechten.</p>
  
  <h2>Art. 270e (F. Weitergeltung des Mietvertrags)</h2>
  <p>Der bestehende Mietvertrag gilt unverändert weiter:<br>
  a. während des Schlichtungsverfahrens, wenn zwischen den Parteien keine Einigung zustandekommt, und<br>
  b. während des Gerichtsverfahrens, unter Vorbehalt vorsorglicher Massnahmen des Richters.</p>
</div>

<div class="footer">Formular bereitgestellt durch die Direktion der Justiz und des Innern des Kantons Zürich</div>
</div>

</body></html>`;
}

function buildContractHTML(b, v, fullName, fmtDate){
  const chf2 = n => Number(n||0).toLocaleString("de-CH");
  const adresseFull = `${v.adresse}, CH-${v.plz} in ${v.ort}`;
  const refStr = `${v.adresse} & ${fullName}`;
  const W = istWohnungsVertrag(v);
  const A = v.apt || {};
  const pers = Math.max(1, +v.personen || 1);
  const persTxt = pers === 1 ? "1 Person" : `${pers} Personen`;
  const stromPP = pers ? (+v.strom||0)/pers : 25;
  const MM = (W && v.mitmieter && String(v.mitmieter.vorname||"").trim()) ? v.mitmieter : null;
  // Befristet? (gleiche Regel wie Ziffer 2): dann entfaellt 9.3 (nur fuer unbefristete) und die folgenden Ziffern ruecken nach
  const BEF = (() => {
    const pd = (x) => { if(!x) return null; const t=String(x).trim(); if(!t) return null; if(/^\d{4}-\d{2}-\d{2}/.test(t)){const d=new Date(t);return isNaN(d)?null:d;} const m=t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); if(m){const d=new Date(+m[3],+m[2]-1,+m[1]);return isNaN(d)?null:d;} const d=new Date(t); return isNaN(d)?null:d; };
    const be = pd(v.einzug), en = pd(v.mietende || (v.apt && v.apt.mietende));
    if (!be || !en || en <= be) return false;
    const mo = (en - be) / (1000*60*60*24*30.44);
    return mo > 0 && (mo < 12 || W || !!(v.apt && v.apt.immer_befristet));
  })();
  // Kurz befristet (unter 12 Monaten): ordentliche Kuendigung durch den Untermieter ausgeschlossen
  const KURZ = (() => {
    if (!BEF) return false;
    const pd = (x) => { if(!x) return null; const t=String(x).trim(); if(/^\d{4}-\d{2}-\d{2}/.test(t)){const d=new Date(t);return isNaN(d)?null:d;} const m=t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); if(m){const d=new Date(+m[3],+m[2]-1,+m[1]);return isNaN(d)?null:d;} const d=new Date(t); return isNaN(d)?null:d; };
    const be = pd(v.einzug), en = pd(v.mietende || (v.apt && v.apt.mietende));
    if (!be || !en) return false;
    return ((en - be) / (1000*60*60*24*30.44)) < 12;
  })();
  // Ziffer 9: 9.1 = die fuer diesen Vertrag geltende Kuendigungsregel, danach 9.2 fristlos, 9.3 Nachmieter, 9.4 schwere Vertragsverletzung
  const ZN = (n) => "9." + (n - 2);
  // Hinweis bei eingeschraenkter Kuendigung: Nachmieter (9.3) und Untervermietung (6.3) bleiben moeglich
  const AUSWEG = " Auch in diesem Fall kann der Untermieter vorzeitig ausziehen, indem er einen geeigneten Nachmieter stellt (Ziffer " + ZN(5) + "); eine Untervermietung ist mit vorgängiger schriftlicher Zustimmung des Hauptmieters möglich (Ziffer 6.3).";
  const mmName = MM ? `${MM.vorname||""} ${MM.nachname||""}`.trim() : "";
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>${W?"Untermietvertrag Zwischennutzung":"Untermietvertrag"} - ${fullName}</title>
<style>
@page{size:A4;margin:18mm 18mm 22mm 18mm}
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{background:#fff}
body{
  font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;
  font-size:10pt;
  line-height:1.55;
  color:#1a1a1a;
  padding:18mm 18mm 22mm 18mm;
  width:210mm;
  margin:0 auto;
}
@media print {
  body{padding:0;width:auto}
  .print-banner{display:none!important}
}
.print-banner{
  position:fixed;top:0;left:0;right:0;
  background:#1a1a1a;color:#fff;
  padding:12px 20px;
  text-align:center;
  font-size:13px;
  z-index:9999;
  font-family:Helvetica,Arial,sans-serif;
  box-shadow:0 2px 12px rgba(0,0,0,.2);
}
.print-banner button{
  background:#fff;color:#1a1a1a;
  border:none;padding:7px 18px;
  margin-left:14px;
  font-weight:600;
  border-radius:4px;
  cursor:pointer;
  font-size:13px;
}
.print-banner button:hover{background:#f0ebe0}

/* HEADER mit Logo */
.doc-header{
  display:flex;
  justify-content:space-between;
  align-items:flex-end;
  padding-bottom:12pt;
  border-bottom:1.5pt solid #1a1a1a;
  margin-bottom:18pt;
}
.doc-header .left{flex:1}
.doc-header .left .label{
  font-size:8pt;
  color:#888;
  letter-spacing:.3em;
  text-transform:uppercase;
  font-weight:500;
  margin-bottom:5pt;
}
.doc-header .left .doc-title{
  font-size:20pt;
  font-weight:300;
  letter-spacing:-.3pt;
  color:#1a1a1a;
}
.doc-header .logo{width:38mm;height:auto}
.doc-header .logo img{width:100%;display:block}

/* PERSONENDATEN-BLOCK */
.person-card{
  background:#faf8f3;
  border-left:3pt solid #1a1a1a;
  padding:12pt 16pt;
  margin-bottom:16pt;
}
.person-card .ph{
  font-size:8pt;
  color:#888;
  letter-spacing:.3em;
  text-transform:uppercase;
  font-weight:600;
  margin-bottom:8pt;
}
.person-grid{
  display:grid;
  grid-template-columns:auto 1fr auto 1fr;
  gap:6pt 18pt;
  font-size:9.5pt;
}
.person-grid .pl{font-weight:600;color:#444;white-space:nowrap}
.person-grid .pv{color:#1a1a1a}

/* GREETING */
.greeting{margin-bottom:14pt}
.greeting p{margin-bottom:6pt;text-align:justify;hyphens:auto;font-size:10pt}
.greeting p.welcome{font-weight:500;color:#1a1a1a}

/* SECTIONS */
.section{margin-bottom:12pt;page-break-inside:avoid}
.section.allow-break{page-break-inside:auto}
.section h2{
  font-size:11pt;
  font-weight:700;
  color:#1a1a1a;
  margin-bottom:7pt;
  padding-bottom:3pt;
  border-bottom:.5pt solid #ddd;
  page-break-after:avoid;
  break-after:avoid;
}
.section p{
  margin-bottom:5pt;
  text-align:justify;
  hyphens:auto;
  orphans:2;
  widows:2;
}
.clause{margin-bottom:5pt;text-align:justify}
.clause-num{font-weight:700;color:#1a1a1a;margin-right:4pt}

/* MIETZINS-TABELLE */
.miet-wrap{
  background:#fafafa;
  border:.5pt solid #e0e0e0;
  border-radius:4pt;
  padding:12pt 16pt;
  margin:8pt 0 12pt;
  page-break-inside:avoid;
  break-inside:avoid;
}
.miet-table{width:100%;border-collapse:collapse}
.miet-table td{
  padding:5pt 0;
  font-size:10pt;
  border-bottom:.25pt solid #e8e8e8;
}
.miet-table td.amt{text-align:right;width:90pt;font-variant-numeric:tabular-nums}
.miet-table tr:last-child td{border-bottom:none}
.miet-table tr.brutto td{
  font-weight:700;
  background:#f0ebe0;
  border-bottom:.5pt solid #999;
  border-top:.5pt solid #999;
  padding:6pt 8pt;
}
.miet-table tr.brutto td.amt{padding-right:8pt}
.miet-table tr.brutto td:first-child{padding-left:8pt}
.miet-table tr.aufschlag td{color:#a85c4d;font-style:italic}
.miet-table tr.total td{
  font-weight:700;
  font-size:11pt;
  background:#1a1a1a;
  color:#fff;
  padding:8pt;
}
.miet-table tr.total td:first-child{padding-left:10pt}
.miet-table tr.total td.amt{padding-right:10pt}

/* BANK BLOCK */
.bank-block{
  display:flex;
  gap:20pt;
  align-items:center;
  justify-content:center;
  margin:10pt auto 12pt;
  padding:14pt 18pt;
  background:#fafafa;
  border:.5pt solid #e0e0e0;
  border-radius:4pt;
  page-break-inside:avoid;
  break-inside:avoid;
}
.qr-box{
  width:90pt;
  height:90pt;
  flex-shrink:0;
  background:#fff;
  border:.5pt solid #ddd;
  padding:4pt;
  object-fit:contain;
  display:block;
}
.bank-info{font-size:9.5pt;line-height:1.7}
.bank-info .ref{
  font-weight:700;
  margin-top:5pt;
  padding-top:5pt;
  border-top:.5pt dashed #ccc;
}

/* INFO BOXEN */
.info-box{
  background:#faf8f3;
  border-left:3pt solid #c5b896;
  padding:8pt 12pt;
  margin:8pt 0;
  font-size:9.5pt;
  line-height:1.5;
  page-break-inside:avoid;
  break-inside:avoid;
}
.highlight-box{
  background:#fff;
  border:1pt solid #1a1a1a;
  padding:10pt 14pt;
  margin:10pt 0;
  text-align:center;
  font-weight:700;
  font-size:10.5pt;
  page-break-inside:avoid;
  break-inside:avoid;
}

/* LISTEN */
ul{margin:5pt 0 8pt 18pt;padding:0}
li{margin-bottom:3pt;line-height:1.5}
.indent-list{margin:6pt 0 6pt 18pt;page-break-inside:avoid;break-inside:avoid}
.indent-list div{margin-bottom:3pt;line-height:1.5}

/* CLOSING + SIGNATURES (zusammenhalten) */
.closing-wrap{
  page-break-inside:avoid;
  break-inside:avoid;
  margin-top:18pt;
}
.closing{margin-top:0}
.closing p{margin-bottom:8pt;text-align:justify}
.closing .signoff{
  margin-top:10pt;
  font-style:italic;
  color:#444;
}

/* SIGNATURES */
.signatures{
  margin-top:18pt;
  display:flex;
  gap:30pt;
  page-break-inside:avoid;
  break-inside:avoid;
}
.sig-block{
  flex:1;
  border-top:.5pt solid #1a1a1a;
  padding-top:6pt;
}
.sig-block .role{
  font-size:8pt;
  color:#888;
  letter-spacing:.2em;
  text-transform:uppercase;
  font-weight:600;
  margin-bottom:3pt;
}
.sig-block .name{
  font-size:11pt;
  font-weight:600;
  margin-bottom:18pt;
}
.sig-block .sig-row{
  display:flex;
  gap:14pt;
  margin-bottom:6pt;
  font-size:9pt;
}
.sig-block .sig-row .lbl{font-weight:600;color:#444;min-width:64pt}
.sig-block .sig-row .line{flex:none;width:150pt;border-bottom:.5pt solid #888;min-height:14pt}

.page-break{page-break-after:always}
.avoid-break{page-break-inside:avoid}
</style>
</head>
<body>

<div class="print-banner">
Vertragsentwurf bereit · Wähle <strong>"Als PDF speichern"</strong> im Druck-Dialog
<button onclick="window.print()">📄 Drucken / PDF speichern</button>
<button onclick="window.close()" style="background:transparent;color:#fff;border:1px solid #fff">Schliessen</button>
</div>

<!-- HEADER -->
<div class="doc-header">
<div class="left">
  <div class="label">Vertrag</div>
  <div class="doc-title">${W?"Untermietvertrag Zwischennutzung":"Untermietvertrag"}</div>
</div>
<div class="logo"><img src="${DT_LOGO_DATA_URI}" alt="D&T Homes"/></div>
</div>

<!-- PERSON CARD -->
<div class="person-card">
<div class="ph">Untermieter*in</div>
<div class="person-grid">
  <span class="pl">Vorname:</span><span class="pv">${b.vorname||"-"}</span>
  <span class="pl">Nachname:</span><span class="pv">${b.nachname||"-"}</span>
  <span class="pl">Strasse:</span><span class="pv">${b.adresse||"-"}</span>
  <span class="pl">PLZ / Ort:</span><span class="pv">${b.plz||""} ${b.ort||""}</span>
  <span class="pl">E-Mail:</span><span class="pv">${b.email||"-"}</span>
  <span class="pl">Telefon:</span><span class="pv">${b.phone||"-"}</span>
  <span class="pl">Geburtsdatum:</span><span class="pv">${fmtDate(b.geburt)||"-"}</span>
  <span class="pl">Nationalität:</span><span class="pv">${b.nat||"-"}</span>
</div>
</div>
${MM?`
<div class="person-card">
<div class="ph">Mitmieter*in (solidarisch haftend)</div>
<div class="person-grid">
  <span class="pl">Vorname:</span><span class="pv">${MM.vorname||"-"}</span>
  <span class="pl">Nachname:</span><span class="pv">${MM.nachname||"-"}</span>
  <span class="pl">E-Mail:</span><span class="pv">${MM.email||"-"}</span>
  <span class="pl">Telefon:</span><span class="pv">${MM.phone||"-"}</span>
  <span class="pl">Geburtsdatum:</span><span class="pv">${fmtDate(MM.geburt)||"-"}</span>
  <span class="pl">Nationalität:</span><span class="pv">${MM.nat||"-"}</span>
</div>
</div>`:""}

<!-- GREETING -->
<div class="greeting">
<p class="welcome">Guten Tag ${fullName}${MM?`<span class="mm-und"> und </span>${mmName}`:""},</p>
<p class="welcome">Herzlich willkommen bei D&amp;T Homes!</p>
<p>Nachfolgend findest du alle Details und Regelungen zur Miete. Der vorliegende Untermietvertrag wird zwischen der ${W?"D&amp;T Partners GmbH":"<strong>D&amp;T Partners GmbH</strong>"} als Hauptmieterin und dir als Untermieter*in abgeschlossen. Bitte nimm dir einen Moment Zeit, den Vertrag sorgfältig zu lesen, und unterzeichne ihn, wenn du mit den Bedingungen einverstanden bist.</p>
</div>

<!-- §1 MIETOBJEKT -->
<div class="section">
<h2>1. Mietobjekt</h2>
<p>Das Objekt befindet sich an der <strong>${adresseFull}</strong>${stockwerkLang(A.stockwerk)?`, im ${stockwerkLang(A.stockwerk)}`:""}.</p>
${W
  ? `<p>Untervermietet wird die Wohnung${(A.zimmer||A.flaeche)?` (${[A.zimmer?`${A.zimmer} Zimmer`:"",A.flaeche?`ca. ${A.flaeche} m²`:""].filter(Boolean).join(", ")})`:""}, unmöbliert, im Rahmen einer befristeten Zwischennutzung.</p>
<p>Die Wohnung dient ausschliesslich Wohnzwecken und wird vom Untermieter mit insgesamt ${persTxt} bewohnt.</p>${MM?`
<p><strong>Mitmieter*in:</strong> ${mmName} ist neben ${fullName} ebenfalls Vertragspartei. Beide haften solidarisch für sämtliche Verpflichtungen aus diesem Vertrag, insbesondere für den Mietzins, die Nebenkosten und allfällige Schäden. Eine Kündigung durch die Untermieterseite ist nur gültig, wenn sie von beiden unterzeichnet ist. Mitteilungen der Hauptmieterin an eine der beiden Personen gelten für beide.</p>`:""}`
  : `<p>Untervermietet wird <strong>Zimmer Nr. ${v.zimmerId}</strong>, inklusive Mitbenutzung der gemeinschaftlichen Räumlichkeiten.</p>`}
</div>

<!-- §2 MIETDAUER -->
<div class="section">
<h2>2. Mietdauer</h2>
<p>${(() => {
  function parseD(s) {
    if (!s) return null;
    const str = String(s).trim();
    if (!str) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) { const d=new Date(str); return isNaN(d.getTime())?null:d; }
    const m = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) { const d=new Date(+m[3], +m[2]-1, +m[1]); return isNaN(d.getTime())?null:d; }
    const d = new Date(str); return isNaN(d.getTime())?null:d;
  }
  const beginn = parseD(v.einzug);
  const userEnde = v.mietende;
  const aptEnde = v.apt?.mietende;
  const endeDate = parseD(userEnde || aptEnde);
  if (beginn && endeDate && endeDate > beginn) {
    const months = (endeDate - beginn) / (1000*60*60*24*30.44);
    const endeStr = fmtDate(userEnde || aptEnde);
    // Schwelle: Unter 12 Monaten befristet, ab 12 Monaten unbefristet, unabhaengig davon
    // ob das Enddatum manuell gesetzt oder aus der Wohnung abgeleitet wurde.
    if (months > 0 && (months < 12 || W || !!(v.apt && v.apt.immer_befristet))) {
      // Befristete Vertraege sind immer wegen Umbau/Sanierung befristet: Erstreckung stets ausgeschlossen.
      const grundSatz = v.befristungsgrund
        ? ` Die Befristung erfolgt aufgrund ${v.befristungsgrund} (Art. 272a Abs. 1 lit. d OR).`
        : ` Die Befristung erfolgt im Hinblick auf einen geplanten Umbau bzw. eine geplante Sanierung der Liegenschaft (Art. 272a Abs. 1 lit. d OR).`;
      const erstreckungSatz = ` Eine Erstreckung des Mietverhältnisses ist daher ausgeschlossen. Zudem kann ein Untermietverhältnis nicht über die Dauer des Hauptmietverhältnisses hinaus erstreckt werden (Art. 273b Abs. 1 OR).`;
      const zwischenSatz = W ? ` Dem Untermieter ist bekannt, dass es sich um eine Zwischennutzung handelt und die Wohnung nach Ablauf der Mietdauer dem Eigentümer bzw. der Verwaltung zurückzugeben ist.` : "";
      const kuendigungSatz = ` Die Kündigung richtet sich nach Ziffer 9, die Rückgabe des Mietobjekts nach Ziffer 10.`;
      return `Das Mietverhältnis beginnt am <strong>${fmtDate(v.einzug)}</strong> und ist <strong>befristet bis ${endeStr}</strong>.${grundSatz}${erstreckungSatz} Der Mietvertrag endet automatisch zum vereinbarten Enddatum, sofern keine schriftliche Verlängerung vereinbart wird.${zwischenSatz}${kuendigungSatz}`;
    }
  }
  return `Das Mietverhältnis beginnt am <strong>${fmtDate(v.einzug)}</strong> und ist <strong>unbefristet</strong>, beträgt jedoch mindestens ${(function(n){const w={1:"einen",2:"zwei",3:"drei",4:"vier",5:"fünf",6:"sechs",7:"sieben",8:"acht",9:"neun",10:"zehn",11:"elf",12:"zwölf"};return w[n]||String(n);})(v.minMietdauer||6)} Monate.`;
})()}</p>
</div>

<!-- §3 MIETZINS -->
<div class="section allow-break">
<h2>3. Mietzins</h2>
<p>${W?"Der monatliche Mietzins für die Wohnung beträgt:":`Der monatliche Mietzins für das Zimmer ${v.zimmerId} beträgt:`}</p>
<div class="miet-wrap avoid-break">
  <table class="miet-table">
    <tr><td>Nettomiete in CHF</td><td class="amt">${chf2(v.nettomiete)}</td></tr>
    <tr><td>Nebenkosten (pauschal) in CHF</td><td class="amt">${chf2(v.nebenkosten)}</td></tr>
    <tr><td>${W?`Stromkosten pauschal (${pers} × CHF ${chf2(stromPP)}) in CHF`:"Stromkosten in CHF"}</td><td class="amt">${chf2(v.strom)}</td></tr>
    <tr class="total"><td>Totaler Mietzins in CHF</td><td class="amt">${chf2((+v.nettomiete||0)+(+v.nebenkosten||0)+(+v.strom||0))}</td></tr>
  </table>
</div>
<p>Im Mietpreis sind die Kosten für administrative und koordinative Leistungen, Kundenservice und persönliche Betreuung bereits inbegriffen.</p>
<p>Die Nebenkosten umfassen Heizung, ${W?"":"Internet, "}Wasser, Gebäudewartung, allgemeinen Stromverbrauch im Gebäude, Gebäudeversicherung sowie Abwassergebühren. Sie werden pauschal erhoben; eine Nebenkostenabrechnung erfolgt nicht.</p>
${W
  ? `<p>Die Nebenkosten betragen pauschal CHF ${chf2(v.nebenkosten)} pro Monat für die Wohnung.</p>
<p>Die Stromkosten werden pauschal mit CHF ${chf2(stromPP)} pro Person und Monat erhoben und gelten mit der Pauschale als abgegolten.</p>
<p>Eine Änderung der Personenzahl ist dem Hauptmieter vorgängig schriftlich mitzuteilen; die Strompauschale wird ab dem Folgemonat entsprechend angepasst.</p>`
  : `<p>Die Stromkosten werden pauschal mit CHF ${chf2(v.strom)} pro Monat verrechnet.</p>`}
${W?`<p>Mit der Strompauschale ist der übliche Stromverbrauch abgegolten. Der Betrieb von Geräten mit überdurchschnittlich hohem Energieverbrauch (z. B. Mining-Rigs, Klimaanlagen) ist nur mit schriftlicher Zustimmung des Hauptmieters gestattet. Werden solche Geräte ohne Zustimmung betrieben, kann der Hauptmieter den dadurch entstehenden Mehrverbrauch nachverrechnen.</p>`:`<p>Überschreitet der Stromverbrauch den Durchschnitt einer vergleichbaren Wohnung um mehr als 10 %, kann der Hauptmieter eine Überprüfung verlangen und eine Nachzahlung geltend machen. Der Betrieb von Geräten mit überdurchschnittlich hohem Energieverbrauch (z. B. Mining-Rigs, Klimaanlagen) ist nur mit schriftlicher Zustimmung des Hauptmieters gestattet.</p>`}
${W?"":`<p>Kosten für die Einrichtung werden zusätzlich erhoben, sofern die Möblierungsoption gewählt wurde.</p>`}
<p>Die Miete ist monatlich im Voraus, spätestens bis zum <strong>25. des Vormonats</strong>, fällig. Die Zahlung erfolgt gemäss QR-Rechnung per Banküberweisung auf folgendes Konto:</p>
<div class="bank-block avoid-break">
  <img class="qr-box" src="${swissQrDataUri(+v.total || ((+v.bruttomiete || 0) + (+v.strom || 0) + (+v.aufschlag || 0)), `Miete ${refStr}`)}" alt="QR-Rechnung"/>
  <div class="bank-info">
    <strong>Graubündner Kantonalbank</strong><br>
    D&amp;T Partners GmbH<br>
    Via Campeun 40, 7403 Rhäzüns<br>
    IBAN: CH80 0077 4010 5279 2690 0<br>
    BIC/SWIFT: GRKBCH2270A
    <div class="ref">Referenz: Miete ${refStr}</div>
  </div>
</div>
<p>Bei Zahlungsverzug kann der Hauptmieter Mahngebühren von <strong>CHF 30 pro Mahnung</strong> sowie Verzugszinsen von <strong>5 % p. a.</strong> erheben.</p>
</div>

<!-- §4 KAUTION -->
<div class="section allow-break">
<h2>4. Kaution${v.kautionMonate<3?' und Servicegebühr':''}</h2>
<p>Der Untermieter leistet vor dem Einzug eine Kaution in Höhe von ${v.kautionMonate===3?"drei":v.kautionMonate===2?"zwei":"einer"} Monatsmiete${v.kautionMonate>1?"n":""}, ausmachend <strong>CHF ${chf2(v.kautionBetrag || ((+v.bruttomiete||0)+(+v.strom||25))*v.kautionMonate)}</strong>. Die Kaution wird über die Plattform <strong>de.evorest.ch</strong> auf ein separates, auf den Namen des Untermieters lautendes und gesperrtes Kautionskonto bei der Hypothekarbank Lenzburg einbezahlt.</p>

${v.kautionMonate<3
  ? `<p>Der Untermieter hat eine gegenüber der vollen Sicherheit (drei Monatsmieten) reduzierte Kaution gewählt. Für diese Kautionsreduktion erbringt der Hauptmieter eine eigenständige Dienstleistung und erhebt dafür eine <strong>Servicegebühr für Kautionsreduktion</strong> von <strong>CHF ${v.kautionMonate===2?"50":"100"} pro Monat</strong>. Diese Servicegebühr ist vom Mietzins unabhängig und stellt weder Mietzins noch Kaution dar; sie wird zusätzlich zum Mietzins gemäss Ziffer 3 geschuldet.</p>`
  : ``}

<div class="highlight-box" style="text-align:left;font-weight:400;font-size:10pt;line-height:1.6">
  <div style="font-size:8pt;color:#888;letter-spacing:.25em;text-transform:uppercase;font-weight:700;margin-bottom:6pt">Vereinbart</div>
  <div>Kaution: <strong>CHF ${chf2(v.kautionBetrag || ((+v.bruttomiete||0)+(+v.strom||25))*v.kautionMonate)}</strong> (${v.kautionMonate} Monatsmiete${v.kautionMonate>1?"n":""})</div>
  ${v.kautionMonate<3?`<div>Servicegebühr für Kautionsreduktion: <strong>CHF ${v.kautionMonate===2?"50":"100"} / Monat</strong></div>`:``}
</div>

<p>Die Rückerstattung der Kaution erfolgt gemäss den Vertragsbedingungen, sobald sämtliche Schlussabrechnungen (z. B. für offene Mieten, Nebenkosten, Strom, allfällige Reparaturen oder Reinigungen) vorliegen und die Wohnung${W?"":" sowie das Inventar"} ordnungsgemäss und ohne Beanstandung zurückgegeben wurden. Die Rückzahlung erfolgt auf das bei Evorest hinterlegte Konto des Untermieters.</p>
</div>

<!-- §5 UEBERGABE -->
${W ? `<div class="section allow-break">
<h2>5. Übergabe, Zustand und Schlüssel</h2>
<p>Die Wohnung wird unmöbliert und in gereinigtem Zustand übergeben. Mitvermietet sind einzig die fest eingebauten Einrichtungen (insbesondere Küche mit Geräten, Sanitäranlagen und Beleuchtung, soweit vorhanden). Ein Inventar oder eine Möblierung durch den Hauptmieter ist nicht Bestandteil dieses Vertrags.</p>
<p class="clause"><span class="clause-num">5.1</span>Der Untermieter richtet die Wohnung auf eigene Kosten ein. Eigene Möbel und Gegenstände sind bei Vertragsende vollständig zu entfernen. Zurückgelassene Gegenstände kann der Hauptmieter nach erfolgloser Aufforderung auf Kosten des Untermieters entsorgen.</p>
<p>Die Schlüsselübergabe erfolgt zum vereinbarten Datum und zur vereinbarten Uhrzeit. Der Hauptmieter verpflichtet sich, dem Untermieter sämtliche für den Zugang zur Wohnung erforderlichen Schlüssel und Zugangscodes zu übergeben. Erfolgt die Übergabe mit mehr als drei Tagen Verspätung, hat der Untermieter ab dem vierten Tag Anspruch auf eine anteilsmässige Rückerstattung der ersten Mietperiode. Die Schlüssel- und Wohnungsübergabe erfolgt gegen ein schriftliches Übergabeprotokoll bei Ein- und Auszug, welches von beiden Parteien unterzeichnet wird.</p>
<p class="clause"><span class="clause-num">${W?"5.2":"5.3"}</span>Der Untermieter bestätigt den Erhalt der Schlüssel und Zugangscodes und verpflichtet sich, diese sorgfältig aufzubewahren und vor unbefugtem Zugriff zu schützen.</p>
<p class="clause"><span class="clause-num">${W?"5.3":"5.4"}</span>Das Anfertigen zusätzlicher Schlüssel ist ohne Zustimmung des Hauptmieters untersagt. Bei Verlust eines oder mehrerer Schlüssel (unabhängig vom Grund) ist der Hauptmieter berechtigt, die betroffenen Schlösser inklusive Schlüssel auf Kosten des Untermieters auszuwechseln.</p>
</div>
` : `<div class="section allow-break">
<h2>5. Übergabe, Zustand und Schlüssel</h2>
<p>In den Gemeinschaftsräumen der Wohnung befindet sich ein vollständiges Inventar mit Gegenständen des täglichen Bedarfs. Das Inventar umfasst insbesondere:</p>
<ul>
  <li>Tisch, Stühle, Besteck, Kochgeschirr, Tellerset, Bratpfanne, Küchenutensilien, Weingläser, Messerset, WC-Bürste, Abfalleimer, Schüsseln, Glas, Badematte, Seifenspender, Kanne, Zahnbürstenhalter, Duschvorhang und Topflappen.</li>
</ul>
${v.moebliert ? `<p class="clause"><span class="clause-num">5.1</span>Für eine ${(v.moeblierungModus==="monatlich")?`monatliche zusätzliche Gebühr von <strong>CHF ${v.moeblierungPauschale||150}</strong>`:`einmalige zusätzliche Gebühr von <strong>CHF ${v.moeblierungPauschale||990}</strong>`} kann das Zimmer möbliert angemietet werden. Die Möblierung umfasst:</p>
<ul>
  <li>Bett (1,40 m breit) mit Bettgestell und Federkernmatratze, Bettwäsche (Innenkissen, Bettwäsche-Set, Bettlaken), Kommode, Nachttisch, Nachttischlampe, Deckenlampe, Schrank, Tisch, Tischlampe, Stuhl, Aufbau inklusive</li>
</ul>
<p>Die Möbel werden für die Dauer der Untermiete zur Nutzung überlassen. Der Untermieter verpflichtet sich zu einem sorgfältigen Gebrauch. Die Möbel bleiben im Eigentum der D&amp;T Partners GmbH. Das Nutzungsrecht endet mit Beendigung des Untermietvertrages.</p>
<div class="highlight-box">Die Möblierung des Zimmers wird dazu gemietet: ${v.moebliert?"Ja":"Nein"}</div>` : `<p class="clause"><span class="clause-num">5.1</span>Die Gemeinschaftsräume der Wohnung sind möbliert. Das Zimmer wird unmöbliert übergeben. Der Untermieter richtet es auf eigene Kosten ein. Eigene Möbel und Gegenstände sind bei Vertragsende vollständig aus dem Zimmer zu entfernen.</p>`}
<p class="clause"><span class="clause-num">5.2</span>Zum Zeitpunkt der Zimmerübergabe kann die Wohnung je nach Datum noch nicht vollständig möbliert sein. Die Möblierung erfolgt in der Regel innerhalb der ersten Tage nach Schlüsselübergabe oder nach vorgängiger Absprache.</p>
<p>Die Schlüsselübergabe erfolgt zum vereinbarten Datum und zur vereinbarten Uhrzeit. Der Hauptmieter verpflichtet sich, dem Untermieter sämtliche für den Zugang zur Wohnung erforderlichen Schlüssel und Zugangscodes zu übergeben. Erfolgt die Übergabe mit mehr als drei Tagen Verspätung, hat der Untermieter ab dem vierten Tag Anspruch auf eine anteilsmässige Rückerstattung der ersten Mietperiode. Die Schlüssel- und Wohnungsübergabe erfolgt gegen ein schriftliches Übergabeprotokoll bei Ein- und Auszug, welches von beiden Parteien unterzeichnet wird.</p>
<p class="clause"><span class="clause-num">${W?"5.2":"5.3"}</span>Der Untermieter bestätigt den Erhalt der Schlüssel und Zugangscodes und verpflichtet sich, diese sorgfältig aufzubewahren und vor unbefugtem Zugriff zu schützen.</p>
<p class="clause"><span class="clause-num">${W?"5.3":"5.4"}</span>Das Anfertigen zusätzlicher Schlüssel ist ohne Zustimmung des Hauptmieters untersagt. Bei Verlust eines oder mehrerer Schlüssel (unabhängig vom Grund) ist der Hauptmieter berechtigt, die betroffenen Schlösser inklusive Schlüssel auf Kosten des Untermieters auszuwechseln.</p>
</div>

`}
<!-- §6 GEBRAUCH -->
<div class="section allow-break">
<h2>6. Gebrauch und Pflichten des Untermieters</h2>
${W
  ? `<p class="clause"><span class="clause-num">6.1</span>Der Untermieter verpflichtet sich, die Wohnung${W?"":" sowie das Inventar"} sorgfältig zu behandeln und Schäden oder Mängel dem Hauptmieter unverzüglich zu melden.</p>
<p class="clause"><span class="clause-num">6.2</span>Der Untermieter ist für die regelmässige Reinigung der Wohnung sowie für die ordnungsgemässe Entsorgung von Abfällen verantwortlich.</p>
<p class="clause"><span class="clause-num">6.3</span>Eine Untervermietung oder Weitergabe der Wohnung an Dritte ist ohne ausdrückliche schriftliche Zustimmung des Hauptmieters nicht gestattet.</p>
<p class="clause"><span class="clause-num">6.4</span>Bauliche Veränderungen an der Wohnung oder das Streichen von Wänden sind nur mit vorgängiger schriftlicher Zustimmung des Hauptmieters zulässig.</p>
<p class="clause"><span class="clause-num">6.5</span>Bohren, Dübeln oder sonstige Eingriffe in Wände, Decken und Böden sind nur mit vorgängiger schriftlicher Zustimmung des Hauptmieters zulässig. Bei Auszug ist der ursprüngliche Zustand wiederherzustellen.</p>
<p class="clause"><span class="clause-num">6.6</span>Bei längerer Abwesenheit hat der Untermieter sicherzustellen, dass der Zugang zur Wohnung für Notfälle gewährleistet ist (z. B. durch Hinterlegung eines Schlüssels bei einer Vertrauensperson).</p>
<p class="clause"><span class="clause-num">6.7</span>Der Untermieter ist verpflichtet, sich innert acht Tagen nach Einzug bei der zuständigen Einwohnerkontrolle anzumelden.</p>
<p class="clause"><span class="clause-num">6.8</span>Für die Serafe-Abgabe (Radio- und Fernsehabgabe) ist der Untermieter als Haushalt selbst verantwortlich.</p>
<p class="clause"><span class="clause-num">6.9</span>Der Untermieter haftet für das Verhalten sämtlicher Personen, die mit ihm in der Wohnung leben oder sich mit seinem Einverständnis darin aufhalten.</p>
<p class="clause"><span class="clause-num">6.10</span>Haustiere sind in der Wohnung nicht gestattet.</p>
<p class="clause"><span class="clause-num">6.11</span>Rauchen ist in der Wohnung nicht gestattet.</p>
<p class="clause"><span class="clause-num">6.12</span>Der Untermieter verpflichtet sich, die geltenden Hausordnungen und gesetzlichen Bestimmungen einzuhalten.</p>
<p class="clause"><span class="clause-num">6.13</span>Die Wohnung ist ausschliesslich für Wohnzwecke des Untermieters und der vereinbarten Anzahl von ${persTxt} bestimmt. Eine Belegung durch weitere Personen ist ohne vorgängige schriftliche Zustimmung des Hauptmieters unzulässig.</p>
<p class="clause"><span class="clause-num">6.14</span>Sofern zur Wohnung ein Garten gehört, darf der Untermieter diesen nutzen. Er verpflichtet sich, den Garten selbständig und ordentlich zu pflegen und in gepflegtem Zustand zu halten (insbesondere Rasen- und Grünpflege) sowie im Winter den Schnee auf den zum Mietobjekt gehörenden Wegen und Flächen zu räumen.</p>
`
  : `<p class="clause"><span class="clause-num">6.1</span>Der Untermieter verpflichtet sich, die Wohnung${W?"":" sowie das Inventar"} sorgfältig zu behandeln und Schäden oder Mängel dem Hauptmieter unverzüglich zu melden.</p>
<p class="clause"><span class="clause-num">6.2</span>Der Untermieter ist für die regelmässige Reinigung der Wohnung sowie für die ordnungsgemässe Entsorgung von Abfällen verantwortlich.</p>
<p class="clause"><span class="clause-num">6.3</span>Eine Untervermietung oder Weitergabe der Wohnung an Dritte ist ohne ausdrückliche schriftliche Zustimmung des Hauptmieters nicht gestattet.</p>
<p class="clause"><span class="clause-num">6.4</span>Bauliche Veränderungen an der Wohnung oder das Streichen von Wänden sind nur mit vorgängiger schriftlicher Zustimmung des Hauptmieters zulässig.</p>
<p class="clause"><span class="clause-num">6.5</span>Bei längerer Abwesenheit hat der Untermieter sicherzustellen, dass der Zugang zur Wohnung für Notfälle gewährleistet ist (z. B. durch Hinterlegung eines Schlüssels bei einer Vertrauensperson).</p>
<p class="clause"><span class="clause-num">6.6</span>Der Untermieter ist verpflichtet, sich innert acht Tagen nach Einzug bei der zuständigen Einwohnerkontrolle anzumelden.</p>
<p class="clause"><span class="clause-num">6.7</span>Der Untermieter darf die Suche nach Mitbewohnern durch die D&amp;T Partners GmbH nicht behindern. Diese schlägt geeignete Mitbewohner vor und ermöglicht ein vorgängiges Kennenlernen. Im Zweifelsfall behält sich die D&amp;T Partners GmbH das Recht vor, einen Untermietvertrag mit einem Interessenten abzuschliessen, ohne Mitspracherecht der aktuellen Bewohner.</p>
<p class="clause"><span class="clause-num">6.8</span>Für die Serafe-Abgabe (Radio- und Fernsehabgabe) ist jeder Haushalt selbst verantwortlich. Die Abgabe wird pro Haushalt erhoben und ist von den Untermietern zu tragen. Die D&amp;T Partners GmbH organisiert keine Kostenaufteilung innerhalb der Untermieterschaft.</p>
<p class="clause"><span class="clause-num">6.9</span>Die Kontaktdaten des Untermieters dürfen - sofern keine ausdrückliche Verweigerung erfolgt - an potenzielle Mitbewohner weitergegeben werden, um ein gegenseitiges Kennenlernen zu ermöglichen.</p>
<p class="clause"><span class="clause-num">6.10</span>Interne Angelegenheiten zwischen den Mitbewohnern fallen nicht in den Zuständigkeitsbereich des Hauptmieters. Dieser bemüht sich jedoch, bei Bedarf zu unterstützen und ein harmonisches Zusammenleben zu fördern.</p>
<p class="clause"><span class="clause-num">6.11</span>Haustiere sind in der Wohnung nicht gestattet.</p>
<p class="clause"><span class="clause-num">6.12</span>Rauchen ist in der Wohnung nicht gestattet.</p>
<p class="clause"><span class="clause-num">6.13</span>Der Untermieter verpflichtet sich, die geltenden Hausordnungen und gesetzlichen Bestimmungen einzuhalten.</p>
<p class="clause"><span class="clause-num">6.14</span>Die WG-Zimmer sind ausschliesslich für Wohnzwecke der im Vertrag eingetragenen Person bestimmt. Eine Belegung durch mehrere Personen ist unzulässig.</p>
<p class="clause"><span class="clause-num">6.15</span>Sofern zur Wohnung ein Garten gehört, darf der Untermieter diesen nutzen. Er verpflichtet sich, den Garten selbständig und ordentlich zu pflegen und in gepflegtem Zustand zu halten (insbesondere Rasen- und Grünpflege) sowie im Winter den Schnee auf den zum Mietobjekt gehörenden Wegen und Flächen zu räumen.</p>
`}
</div>

<!-- §7 UNTERHALT -->
<div class="section">
<h2>7. Unterhalt, Reparaturen und Zutritt</h2>
<p>Der Hauptmieter ist für die Instandhaltung der Wohnung verantwortlich, einschliesslich notwendiger Reparaturen an sanitären Anlagen, Heizung, Elektrik und baulichen Elementen. Der Untermieter hat Mängel oder Reparaturbedarf unverzüglich zu melden. Vorbehalten bleibt der kleine Unterhalt gemäss Ziffer 7.1.</p>
<p class="clause"><span class="clause-num">7.1</span>Kleine Reparaturen und Ausbesserungen, die für den gewöhnlichen Unterhalt des Mietobjekts erforderlich sind (z. B. Ersatz von Glühbirnen, Duschschläuchen, Brausen, Dichtungen und Filtern sowie das Beheben von Verstopfungen in Abläufen, die durch den Gebrauch verursacht wurden), gehen bis zu einem Betrag von CHF 150 pro Fall zu Lasten des Untermieters (Art. 259 OR).</p>
<p class="clause"><span class="clause-num">7.2</span>Der Hauptmieter ist berechtigt, ${W?"die Wohnung":"das Zimmer"} nach angemessener Vorankündigung zur Kontrolle, Instandhaltung, Besichtigung mit Interessenten oder bei Vertragsverletzungen zu betreten.</p>
</div>

<!-- §8 HAFTUNG -->
<div class="section">
<h2>8. Haftung und Versicherung</h2>
<p>Der Untermieter haftet für Schäden oder Verluste an ${W?"der Wohnung":"Wohnung oder Inventar"}, die durch fahrlässiges Verhalten oder unsachgemässe Nutzung verursacht werden (einschliesslich durch Besucher). Der Untermieter hat den Nachweis einer gültigen Privathaftpflichtversicherung spätestens vor dem Einzug zu erbringen.</p>
${W?"":`<p>Für Schäden in gemeinsam genutzten Bereichen haften die Bewohner anteilig (Solidarhaftung), sofern kein Verursacher festgestellt werden kann.</p>`}
</div>

<!-- §9 KUENDIGUNG -->
<div class="section allow-break">
<h2>9. Kündigung</h2>
<p>Soweit eine ordentliche Kündigung zulässig ist, beträgt die Kündigungsfrist ${(function(n){const w={1:"einen",2:"zwei",3:"drei",4:"vier",5:"fünf",6:"sechs"};return w[n]||String(n);})(v.kuendigungsfrist||3)} ${(v.kuendigungsfrist===1?"Monat":"Monate")} auf das Ende eines Monats, ausser auf Ende Dezember. Die Kündigung hat schriftlich per Einschreiben oder als elektronisch signiertes PDF zu erfolgen.</p>
${KURZ ? `<p class="clause"><span class="clause-num">9.1</span>Bei befristeten Untermietverhältnissen mit einer vereinbarten Mietdauer von weniger als zwölf (12) Monaten ist eine ordentliche Kündigung durch den Untermieter ausgeschlossen. Der Untermieter verpflichtet sich, ${W?"die Wohnung":"das Zimmer"} für die gesamte vereinbarte Mietdauer zu mieten und die entsprechenden Mietzinsen bis zum Vertragsende vollständig zu entrichten. Dies gilt auch dann, wenn der Untermieter ${W?"die Wohnung":"das Zimmer"} vorzeitig verlässt.${AUSWEG}</p>` : ""}
${(BEF && !KURZ) ? (W ? (() => {
  const _pd = (x) => { if(!x) return null; const t=String(x).trim(); if(/^\d{4}-\d{2}-\d{2}/.test(t)){const d=new Date(t);return isNaN(d)?null:d;} const m=t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); if(m){const d=new Date(+m[3],+m[2]-1,+m[1]);return isNaN(d)?null:d;} const d=new Date(t); return isNaN(d)?null:d; };
  const _f = (d) => ('0'+d.getDate()).slice(-2)+'.'+('0'+(d.getMonth()+1)).slice(-2)+'.'+d.getFullYear();
  const _end = _pd(v.mietende || (v.apt && v.apt.mietende));
  const _kf = +v.kuendigungsfrist || 3;
  let bsp = "";
  if (_end) {
    // letzter Kuendigungstermin: Monatsende mindestens 12 Monate vor Vertragsende, nicht auf Ende Dezember (Ziffer 9)
    let lt = new Date(_end.getFullYear()-1, _end.getMonth()+1, 0);
    if (lt > new Date(_end.getFullYear()-1, _end.getMonth(), _end.getDate())) lt = new Date(_end.getFullYear()-1, _end.getMonth(), 0);
    if (lt.getMonth() === 11) lt = new Date(lt.getFullYear(), 11, 0);
    const kz = new Date(lt.getFullYear(), lt.getMonth()-_kf+1, 0);
    const _beg = _pd(v.einzug);
    if (_beg && kz < _beg) {
      bsp = ` Da das Vertragsende (${_f(_end)}) weniger als zwölf Monate zuzüglich der Kündigungsfrist nach Mietbeginn liegt, ist eine ordentliche Kündigung für dieses Mietverhältnis ausgeschlossen.`;
    } else {
      bsp = ` Für dieses Mietverhältnis (Vertragsende ${_f(_end)}) ist der letztmögliche Kündigungstermin somit der ${_f(lt)}; die Kündigung muss spätestens am ${_f(kz)} beim Hauptmieter eingetroffen sein.`;
    }
  }
  return `<p class="clause"><span class="clause-num">9.1</span>Bei befristeten Untermietverhältnissen über eine ganze Wohnung kann der Untermieter das Mietverhältnis nur auf einen Termin ordentlich kündigen, der mindestens zwölf (12) Monate vor dem vereinbarten Vertragsende liegt. Eine Kündigung auf einen späteren Termin ist ausgeschlossen; der Untermieter bleibt in diesem Fall bis zum Vertragsende zur Zahlung des Mietzinses verpflichtet, vorbehältlich Ziffer ${ZN(5)}.${bsp} Damit soll sichergestellt werden, dass die Wohnung bei einem vorzeitigen Auszug für eine angemessene Restlaufzeit weitervermietet werden kann.${AUSWEG}</p>`;
})() : `<p class="clause"><span class="clause-num">9.1</span>Bei befristeten Untermietverhältnissen mit einer vereinbarten Mietdauer von zwölf (12) Monaten oder mehr kann der Untermieter das Mietverhältnis nur auf einen Termin ordentlich kündigen, der mindestens sechs (6) Monate vor dem vereinbarten Vertragsende liegt. Eine Kündigung auf einen späteren Termin ist ausgeschlossen; der Untermieter bleibt in diesem Fall bis zum Vertragsende zur Zahlung des Mietzinses verpflichtet. Dies stellt sicher, dass das Zimmer oder die Wohnung bei einem vorzeitigen Auszug für eine angemessene Restlaufzeit weitervermietet werden kann. Beispielsweise, wenn der Mietvertrag am 31. März endet, ist der letztmögliche Kündigungstermin der 30. September des Vorjahres; bei einer Kündigungsfrist von drei Monaten muss die Kündigung somit spätestens am 30. Juni des Vorjahres beim Hauptmieter eingetroffen sein.${AUSWEG}</p>`) : ""}
${BEF ? "" : `<p class="clause"><span class="clause-num">9.1</span>Wird ein zunächst unbefristetes Untermietverhältnis durch den Eigentümer oder die Verwaltung infolge einer geplanten Sanierung, Renovation, Umnutzung oder anderweitiger baulicher Massnahmen gekündigt, so gilt ab dem Zeitpunkt, an dem dem Hauptmieter die Kündigung des Hauptmietverhältnisses mitgeteilt wird, eine analoge Schutzfrist: Der Untermieter kann das Mietverhältnis nur auf einen Termin ordentlich kündigen, der mindestens sechs (6) Monate vor dem festgelegten Räumungstermin liegt. Eine Kündigung auf einen späteren Termin ist ausgeschlossen; der Untermieter bleibt in diesem Fall bis zum Räumungstermin zur Zahlung des Mietzinses verpflichtet. Der Hauptmieter wird den Untermieter unverzüglich nach Kenntnisnahme der Sanierungs- oder Räumungspläne schriftlich darüber informieren.${AUSWEG}</p>
<p>Gleiches gilt sinngemäss bei jeder anderen Form der Kündigung des Hauptmietverhältnisses durch den Eigentümer oder die Verwaltung: Auch in diesem Fall kann der Untermieter nur auf einen Termin kündigen, der mindestens sechs (6) Monate vor dem Ende des Mietverhältnisses liegt.</p>`}
<p class="clause"><span class="clause-num">${ZN(4)}</span>Bei wiederholter Nichtzahlung der Miete ist der Hauptmieter berechtigt, das Mietverhältnis per Monatsende fristlos zu kündigen.</p>
<p class="clause"><span class="clause-num">${ZN(5)}</span>Bei vorzeitigem Auszug kann sich der Untermieter durch Stellung eines geeigneten, zahlungsfähigen und zumutbaren Nachmieters, der zu gleichen Konditionen in den Vertrag eintritt, von seinen Pflichten befreien (Art. 264 OR). Andernfalls bleibt er bis zum ordentlichen Vertragsende zur Zahlung des Mietzinses verpflichtet.</p>
<p class="clause"><span class="clause-num">${ZN(6)}</span>Bei schwerwiegender Vertragsverletzung (insbesondere Zahlungsverzug, unerlaubte Weitergabe ${W?"der Wohnung":"des Zimmers"}, Störung des Hausfriedens, rechtswidrige Nutzung oder falsche Angaben bei Vertragsabschluss) ist der Hauptmieter berechtigt, den Vertrag fristlos aufzulösen und die unverzügliche Räumung zu verlangen.</p>
</div>

<!-- §10 RUECKGABE -->
<div class="section allow-break">
<h2>10. Rückgabe bei Vertragsende</h2>
<p class="clause"><span class="clause-num">10.1</span>Der Untermieter ist verpflichtet, das Mietobjekt spätestens am vereinbarten Endtermin vollständig geräumt und ordnungsgemäss zurückzugeben. Ihm ist bekannt, dass die Liegenschaft nach Vertragsende dem Eigentümer bzw. der Verwaltung zur weiteren Nutzung, insbesondere zu Umbau- oder Sanierungszwecken, zu übergeben ist und dass eine verspätete Rückgabe dem Hauptmieter erheblichen Schaden verursachen kann, der über den Wert des einzelnen Mietobjekts hinausgeht. Gibt der Untermieter das Mietobjekt nicht rechtzeitig zurück, schuldet er für jeden angefangenen Tag der verspäteten Rückgabe (a) eine Nutzungsentschädigung in Höhe des anteiligen Mietzinses sowie (b) eine pauschalierte Verzugsentschädigung von CHF 300 pro Tag, zur Abgeltung des typischerweise entstehenden Aufwands und Schadens (Koordination, Ersatzunterbringung, Administration). Dem Untermieter bleibt der Nachweis offen, dass kein oder ein geringerer Schaden entstanden ist; bis zu diesem Nachweis gilt der pauschalierte Schaden als ausgewiesen. Die Geltendmachung eines weitergehenden, tatsächlichen Schadens bleibt ausdrücklich vorbehalten, insbesondere für Ansprüche des Eigentümers oder der Verwaltung sowie für Verzugs- und Projektkosten, soweit der Untermieter die verspätete Rückgabe zu vertreten hat. Der Hauptmieter ist berechtigt, diese Beträge mit der Kaution und weiteren Sicherheiten zu verrechnen, und kann bei nicht rechtzeitiger Rückgabe die Ausweisung im Verfahren des Rechtsschutzes in klaren Fällen (Art. 257 ZPO) verlangen.</p>
<p class="clause"><span class="clause-num">10.2</span>${W?"Die Wohnung ist":"Wohnung und Inventar sind"} in dem Zustand zurückzugeben, in dem sie übernommen wurden (normale Abnutzung bleibt vorbehalten). Die Übergabe erfolgt bei Ein- und Auszug mittels schriftlichem Übergabeprotokoll. Die Schlussreinigung erfolgt zu Lasten des Untermieters.</p>
<p class="clause"><span class="clause-num">10.3</span>Bei Beendigung des Mietverhältnisses sind sämtliche Schlüssel und Zugangscodes zurückzugeben.</p>
</div>

<!-- §11 RUECKTRITT -->
<div class="section">
<h2>11. Rücktrittsrecht</h2>
<p>Der Untermieter erhält ein ausserordentliches Rücktrittsrecht vom unterzeichneten Mietvertrag bis und mit der persönlichen Besichtigung vor Ort. Dieses gilt, wenn die Wohnung wesentlich vom vorgängig zur Verfügung gestellten Bildmaterial (Fotos, Grundrisse und virtuelle Tour) abweicht. Im Falle eines solchen Rücktritts entstehen dem Untermieter keinerlei Kosten oder Verpflichtungen; bereits geleistete Zahlungen werden vollständig zurückerstattet.</p>
</div>

<!-- §12 DATENSCHUTZ -->
<div class="section">
<h2>12. Datenschutz</h2>
<p>Der Untermieter erklärt sich damit einverstanden, dass seine personenbezogenen Daten zum Zweck der Vertragsabwicklung${W?"":" sowie zur Koordination mit (potenziellen) Mitbewohnern"} gespeichert, verarbeitet und im erforderlichen Umfang weitergegeben werden dürfen. Eine Weitergabe an Dritte erfolgt ausschliesslich, soweit dies für die Durchführung des Mietverhältnisses notwendig ist.</p>
<p>Der Untermieter stimmt zu, dass die im Zusammenhang mit dem Mietverhältnis stehenden Akten und Dokumente digitalisiert und gespeichert werden dürfen und dass die digitalisierten Dokumente als Originaldokumente gelten.</p>
</div>

<!-- §13 VERTRAGSAENDERUNGEN -->
<div class="section">
<h2>13. Vertragsänderungen</h2>
<p>Änderungen oder Ergänzungen dieses Vertrags bedürfen zu ihrer Gültigkeit der Zustimmung beider Parteien. Sie können in Textform, einschliesslich per E-Mail oder mittels elektronischer Signatur, vereinbart werden. Eine handschriftliche Unterzeichnung ist nicht erforderlich.</p>
<p>Dieser Vertrag wird in deutscher Sprache abgeschlossen. Übersetzungen dienen nur dem besseren Verständnis; bei Abweichungen ist die deutsche Fassung massgebend.</p>
</div>

<!-- §14 GERICHTSSTAND -->
<div class="section">
<h2>14. Gerichtsstand</h2>
<p>Gerichtsstand für alle Streitigkeiten aus diesem Vertrag ist der Ort der gelegenen Sache. Zwingende gesetzliche Gerichtsstände, insbesondere gemäss Art. 33 ZPO, bleiben vorbehalten.</p>
</div>

<!-- §15 BESONDERE VEREINBARUNGEN -->
${(v.sonderklausel && String(v.sonderklausel).trim()) ? ('<div class="section allow-break">\n<h2>15. Besondere Vereinbarungen</h2>\n<p>'+String(v.sonderklausel).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').split(String.fromCharCode(10)).join('<br>')+'</p>\n</div>') : ''}

<!-- KOSTENUEBERSICHT -->
${(()=>{ const _mz=(+v.nettomiete||0)+(+v.nebenkosten||0)+(+v.strom||0); const _moeb=(v.moebliert&&v.moeblierungModus==="monatlich")?(+v.moeblierungPauschale||150):0; const _sg=(+v.aufschlag>0)?(+v.aufschlag):0; const _einm=(v.moebliert&&v.moeblierungModus!=="monatlich")?(+v.moeblierungPauschale||990):0; const _km=+v.kautionMonate||0; const _kb=_km>0?(+v.kautionBetrag || ((+v.bruttomiete||0)+(+v.strom||25))*_km):0;
  return `<div class="section avoid-break">
<h2>Kostenübersicht</h2>
<p>Zusammenfassung aller Kosten gemäss Ziffern ${W?"3 und 4":"3, 4 und 5"}:</p>
<div class="miet-wrap">
  <table class="miet-table">
    <tr><td>Nettomiete in CHF</td><td class="amt">${chf2(v.nettomiete)}</td></tr>
    <tr><td>Nebenkosten (pauschal) in CHF</td><td class="amt">${chf2(v.nebenkosten)}</td></tr>
    <tr><td>Stromkosten in CHF</td><td class="amt">${chf2(v.strom)}</td></tr>
    ${_moeb?`<tr><td>Möblierung (monatlich) in CHF</td><td class="amt">${chf2(_moeb)}</td></tr>`:""}
    ${_sg?`<tr><td>Servicegebühr für Kautionsreduktion in CHF</td><td class="amt">${chf2(_sg)}</td></tr>`:""}
    <tr class="total"><td>Monatlich total zu bezahlen in CHF</td><td class="amt">${chf2(_mz+_moeb+_sg)}</td></tr>
    ${_kb?`<tr><td>Kaution vor Einzug (${_km} Monatsmiete${_km>1?"n":""}) in CHF</td><td class="amt">${chf2(_kb)}</td></tr>`:""}
    ${_einm?`<tr><td>Möblierung (einmalig) in CHF</td><td class="amt">${chf2(_einm)}</td></tr>`:""}
  </table>
</div>
</div>`; })()}

<!-- CLOSING + SIGNATURES (zusammenhalten) -->
<div class="closing-wrap">
<div class="closing">
  <p>Bitte unterzeichne diesen Untermietvertrag digital und sende uns eine Kopie zurück. Digitale Unterschriften sind rechtsverbindlich. Bewahre den unterzeichneten Vertrag in deinen Unterlagen auf. Mit seiner Unterschrift bestätigt der Untermieter, sämtliche Vertragsbestimmungen gelesen, verstanden und akzeptiert zu haben.</p>
  <p class="signoff">Wir wünschen dir viel Spass in deiner neuen Wohnung.<br>Dein D&amp;T Homes Team</p>
</div>

<!-- SIGNATURES -->
<div class="signatures">
  <div class="sig-block">
    <div class="role">Untermieter*in</div>
    <div class="name">${fullName}</div>
    <div class="sig-row">
      <span class="lbl">Ort, Datum:</span>
      <span class="line"></span>
    </div>
    <div class="sig-row">
      <span class="lbl">Unterschrift:</span>
      <span class="line"></span>
    </div>
  </div>
  <div class="sig-block">
    <div class="role">Hauptmieter</div>
    <div class="name">D&amp;T Partners GmbH</div>
    <div class="sig-row">
      <span class="lbl">Ort, Datum:</span>
      <span class="line"></span>
    </div>
    <div class="sig-row">
      <span class="lbl">Unterschrift:</span>
      <span class="line"></span>
    </div>
  </div>
</div>
${MM?`<div class="signatures" style="margin-top:22pt">
  <div class="sig-block">
    <div class="role">Mitmieter*in</div>
    <div class="name">${mmName}</div>
    <div class="sig-row">
      <span class="lbl">Ort, Datum:</span>
      <span class="line"></span>
    </div>
    <div class="sig-row">
      <span class="lbl">Unterschrift:</span>
      <span class="line"></span>
    </div>
  </div>
  <div class="sig-block" style="border-top:none"></div>
</div>`:""}
</div>

</body></html>`;
}

// ─── END SHARED CONTRACT BUILDERS ──────────────────────────────────────────


