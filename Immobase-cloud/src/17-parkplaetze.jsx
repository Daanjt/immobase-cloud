// ─── PARKPLATZVERTRAG (eigener Vertrag, unabhaengig vom Untermietvertrag) ───
function ppDatumLang(s, en){
  if(!s) return "____";
  const str=String(s).trim(); let d=null; const m=str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if(m) d=new Date(+m[3],+m[2]-1,+m[1]); else if(/^\d{4}-\d{2}-\d{2}/.test(str)) d=new Date(str.slice(0,10));
  if(!d||isNaN(d)) return str;
  const de=["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"], e=["January","February","March","April","May","June","July","August","September","October","November","December"];
  return en ? `${d.getDate()} ${e[d.getMonth()]} ${d.getFullYear()}` : `${d.getDate()}. ${de[d.getMonth()]} ${d.getFullYear()}`;
}
function ppDatumKurz(s){ const str=String(s||"").trim(); const m=str.match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[3]}.${m[2]}.${m[1]}`:str; }
// Letzter moeglicher Kuendigungstermin: Monatsende drei Monate vor dem Enddatum (30.06.2028 -> 31. Maerz 2028)
function ppDreiMonateVor(bis, en){ const m=String(bis||"").trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); if(!m) return ppDatumLang(bis,en); const e=new Date(+m[3],+m[2]-1,+m[1]); const t=new Date(e.getFullYear(), e.getMonth()-2, 0); return ppDatumLang(`${t.getDate()}.${t.getMonth()+1}.${t.getFullYear()}`, en); }
function ppEsc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function buildParkplatzHTML(d, en){
  const T=(a,b)=>en?b:a, E=ppEsc;
  const betrag = Number(d.miete||0).toLocaleString("de-CH",{minimumFractionDigits:2,maximumFractionDigits:2});
  const kf = Math.max(1, parseInt(d.kuendigungsfrist)||1);
  const kfDe = {1:"einem Monat",2:"zwei Monaten",3:"drei Monaten"}[kf] || `${kf} Monaten`;
  const kfEn = kf===1 ? "one month's" : `${kf} months'`;
  // Die Bezeichnung enthaelt die Adresse schon ("Josefstrasse 200/202 · Einstellplatz Nr. 10"), dann nicht doppelt anfuegen
  const mitAdr = d.objektAdresse && !String(d.bezeichnung||"").startsWith(d.objektAdresse);
  const objekt = `${E(d.bezeichnung)}${mitAdr?`, ${E(d.objektAdresse)}`:""}${d.plzOrt?`, ${E(d.plzOrt)}`:""}`;
  const dauer = d.bis
    ? T(`Das Mietverhältnis beginnt am <strong>${ppDatumLang(d.ab)}</strong> und ist befristet bis und mit <strong>${ppDatumLang(d.bis)}</strong>. Es endet an diesem Datum automatisch, ohne dass es einer Kündigung bedarf. Vorher kann es von beiden Parteien unter Einhaltung einer Kündigungsfrist von <strong>${kfDe}</strong> schriftlich auf das Ende jedes Monats gekündigt werden. Ausgenommen sind die letzten drei Monate vor dem Enddatum: Eine Kündigung auf einen Termin nach dem <strong>${ppDreiMonateVor(d.bis)}</strong> ist nicht mehr möglich, der Vertrag läuft dann bis zum Enddatum.`,
        `The tenancy begins on <strong>${ppDatumLang(d.ab,true)}</strong> and is fixed-term until and including <strong>${ppDatumLang(d.bis,true)}</strong>. It ends automatically on that date without notice being required. Before then, either party may terminate it in writing with <strong>${kfEn} notice</strong> to the end of any month. This does not apply to the last three months before the end date: notice to a date after <strong>${ppDreiMonateVor(d.bis,true)}</strong> is no longer possible, and the agreement then runs until the end date.`)
    : T(`Das Mietverhältnis beginnt am <strong>${ppDatumLang(d.ab)}</strong> und wird auf unbestimmte Zeit abgeschlossen. Es kann von beiden Parteien unter Einhaltung einer Kündigungsfrist von <strong>${kfDe}</strong> schriftlich auf das Ende jedes Monats gekündigt werden.`,
        `The tenancy begins on <strong>${ppDatumLang(d.ab,true)}</strong> and is concluded for an indefinite period. Either party may terminate it in writing with <strong>${kfEn} notice</strong> to the end of any month.`);
  const ref = `Parkplatz ${d.bezeichnung} ${d.name}`.replace(/\s+/g," ").trim();
  return `<!DOCTYPE html>
<html lang="${en?"en":"de"}"><head><meta charset="UTF-8"><title>${T("Mietvertrag Parkplatz","Parking Space Agreement")} - ${E(d.name)}</title>
<style>
@page{size:A4;margin:18mm 18mm 22mm 18mm}
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{background:#fff}
body{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:10pt;line-height:1.55;color:#1a1a1a;padding:18mm 18mm 22mm 18mm;width:210mm;margin:0 auto}
@media print{body{padding:0;width:auto}}
.doc-header{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:12pt;border-bottom:1.5pt solid #1a1a1a;margin-bottom:16pt}
.doc-header .left{flex:1}
.doc-header .left .label{font-size:8pt;color:#888;letter-spacing:.3em;text-transform:uppercase;font-weight:500;margin-bottom:5pt}
.doc-header .left .doc-title{font-size:20pt;font-weight:300;letter-spacing:-.3pt;color:#1a1a1a}
.doc-header .logo{width:38mm;height:auto}
.doc-header .logo img{width:100%;display:block}
.person-card{background:#faf8f3;border-left:3pt solid #1a1a1a;padding:12pt 16pt;margin-bottom:16pt}
.person-card .ph{font-size:8pt;color:#888;letter-spacing:.3em;text-transform:uppercase;font-weight:600;margin-bottom:8pt}
.person-grid{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:6pt 18pt;font-size:9.5pt}
.person-grid .pl{font-weight:600;color:#444;white-space:nowrap}
.person-grid .pv{color:#1a1a1a}
.parties{display:flex;gap:24pt;margin-bottom:14pt}
.parties .p{flex:1;background:#faf8f3;padding:9pt 12pt;font-size:9.5pt;line-height:1.5}
.parties .p .r{font-size:7.5pt;color:#888;letter-spacing:.2em;text-transform:uppercase;font-weight:600;margin-bottom:3pt}
.section{margin-bottom:11pt;page-break-inside:avoid;break-inside:avoid}
.section h2{font-size:11pt;font-weight:700;color:#1a1a1a;margin-bottom:6pt;padding-bottom:3pt;border-bottom:.5pt solid #ddd}
.section p{margin-bottom:5pt;text-align:justify;hyphens:auto;-webkit-hyphens:auto}
.section ul{margin:0 0 5pt 16pt}
.section li{margin-bottom:2pt}
.kv{width:100%;border-collapse:collapse;font-size:10pt;margin:2pt 0 6pt}
.kv td{padding:3pt 0;border-bottom:.5pt solid #eee;vertical-align:top}
.kv td:first-child{color:#555;width:45%}
.bank-block{display:flex;gap:14pt;align-items:center;margin:6pt 0 8pt;padding:10pt 12pt;background:#fafafa;border:.5pt solid #e0e0e0;border-radius:4pt;page-break-inside:avoid;break-inside:avoid}
.qr-box{width:90pt;height:90pt;flex-shrink:0;background:#fff;border:.5pt solid #ddd;padding:4pt;object-fit:contain;display:block}
.bank-info{font-size:9.5pt;line-height:1.7}
.bank-info .ref{font-weight:700;margin-top:5pt;padding-top:5pt;border-top:.5pt dashed #ccc}
.box{background:#faf8f3;border-left:3pt solid #1a1a1a;padding:10pt 14pt;margin:12pt 0;font-size:9.5pt;page-break-inside:avoid}
.signatures{margin-top:24pt;display:flex;gap:30pt;page-break-inside:avoid;break-inside:avoid}
.sig-block{flex:1;border-top:.5pt solid #1a1a1a;padding-top:6pt}
.sig-block .role{font-size:8pt;color:#888;letter-spacing:.2em;text-transform:uppercase;font-weight:600;margin-bottom:3pt}
.sig-block .name{font-size:11pt;font-weight:600;margin-bottom:18pt}
.sig-block .sig-row{display:flex;gap:14pt;margin-bottom:6pt;font-size:9pt}
.sig-block .sig-row .lbl{font-weight:600;color:#444;min-width:64pt}
.sig-block .sig-row .line{flex:none;width:150pt;border-bottom:.5pt solid #888;min-height:14pt}
</style></head>
<body>
<div class="doc-header"><div class="left"><div class="label">${T("Parkplatz &middot; D&amp;T Homes","Parking &middot; D&amp;T Homes")}</div><div class="doc-title">${T("Mietvertrag für einen Parkplatz","Parking Space Rental Agreement")}</div></div><div class="logo"><img src="${DT_LOGO_DATA_URI}" alt="D&T Homes"/></div></div>
<div class="person-card">
<div class="ph">${T("Mieter*in","Tenant")}</div>
<div class="person-grid">
  <span class="pl">${T("Vorname:","First name:")}</span><span class="pv">${E(d.vorname)||"-"}</span>
  <span class="pl">${T("Nachname:","Last name:")}</span><span class="pv">${E(d.nachname)||"-"}</span>
  <span class="pl">${T("Strasse:","Street:")}</span><span class="pv">${E(d.strasse)||"-"}</span>
  <span class="pl">${T("PLZ / Ort:","Postcode / City:")}</span><span class="pv">${E(d.plzOrtMieter)||"-"}</span>
  <span class="pl">${T("E-Mail:","Email:")}</span><span class="pv">${E(d.email)||"-"}</span>
  <span class="pl">${T("Telefon:","Phone:")}</span><span class="pv">${E(d.telefon)||"-"}</span>
  <span class="pl">${T("Geburtsdatum:","Date of birth:")}</span><span class="pv">${d.geburt?ppDatumKurz(d.geburt):"-"}</span>
  <span class="pl">${T("Nationalität:","Nationality:")}</span><span class="pv">${E(d.nat)||"-"}</span>
</div>
</div>
<div class="section">
<h2>1. ${T("Mietobjekt","Rental object")}</h2>
<table class="kv">
<tr><td>${T("Parkplatz","Parking space")}</td><td><strong>${objekt}</strong></td></tr>
${d.kennzeichen?`<tr><td>${T("Fahrzeug (Kennzeichen)","Vehicle (licence plate)")}</td><td>${E(d.kennzeichen)}</td></tr>`:""}
</table>
<p>${T("Der Parkplatz dient ausschliesslich dem Abstellen eines eingelösten und versicherten Fahrzeugs der Mieterin bzw. des Mieters. Die Vermieterin hat den Parkplatz ihrerseits gemietet und überlässt ihn der Mieterin bzw. dem Mieter zum Gebrauch.","The parking space may only be used to park a registered and insured vehicle of the tenant. The landlord itself rents the parking space and lets it to the tenant for use.")}</p>
</div>
<div class="section">
<h2>2. ${T("Beginn und Dauer","Start and duration")}</h2>
<p>${dauer}</p>
<p>${T("Das Mietverhältnis endet in jedem Fall spätestens mit dem Ende des Mietverhältnisses der Vermieterin über diesen Parkplatz. Die Vermieterin informiert die Mieterin bzw. den Mieter darüber, sobald sie davon Kenntnis hat.","In any case, the tenancy ends no later than the end of the landlord's own tenancy of this parking space. The landlord will inform the tenant as soon as it becomes aware of this.")}</p>
</div>
<div class="section">
<h2>3. ${T("Mietzins und Zahlung","Rent and payment")}</h2>
<table class="kv"><tr><td>${T("Mietzins pro Monat","Rent per month")}</td><td><strong>CHF ${betrag}</strong></td></tr></table>
<p>${T(`Der Mietzins ist monatlich im Voraus, spätestens bis zum 25. des Vormonats, zu bezahlen auf das Konto der D&amp;T Partners GmbH bei der Graubündner Kantonalbank, IBAN CH80 0077 4010 5279 2690 0, Referenz «${E(ref)}».`,`The rent is payable monthly in advance, no later than the 25th of the preceding month, to the account of D&amp;T Partners GmbH at Graubündner Kantonalbank, IBAN CH80 0077 4010 5279 2690 0, reference "${E(ref)}".`)}</p>
<div class="bank-block">
  <img class="qr-box" src="${swissQrDataUri(+d.miete || 0, ref)}" alt="QR-Rechnung"/>
  <div class="bank-info">
    <strong>Graubündner Kantonalbank</strong><br>
    D&amp;T Partners GmbH<br>
    Via Campeun 40, 7403 Rhäzüns<br>
    IBAN: CH80 0077 4010 5279 2690 0<br>
    BIC/SWIFT: GRKBCH2270A<br>
    ${T("Betrag","Amount")}: CHF ${betrag} ${T("pro Monat","per month")}
    <div class="ref">${T("Referenz","Reference")}: ${E(ref)}</div>
  </div>
</div>
<p>${T("Bei Zahlungsverzug kann die Vermieterin eine Mahngebühr von CHF 30 pro Mahnung erheben und das Mietverhältnis nach den gesetzlichen Bestimmungen (Art. 257d OR) kündigen.","In case of late payment, the landlord may charge a reminder fee of CHF 30 per reminder and terminate the tenancy in accordance with the statutory provisions (Art. 257d CO).")}</p>
</div>
<div class="section">
<h2>4. ${T("Benutzung","Use")}</h2>
<ul>
<li>${T("Die Haus- und Garagenordnung der Liegenschaft gilt auch für die Mieterin bzw. den Mieter.","The house and garage rules of the property also apply to the tenant.")}</li>
<li>${T("Nicht gestattet sind insbesondere das Lagern von Gegenständen, Reifen oder brennbaren Stoffen, Reparaturen, Ölwechsel und das Waschen von Fahrzeugen.","In particular, storing objects, tyres or flammable materials, carrying out repairs, oil changes and washing vehicles are not permitted.")}</li>
<li>${T("Die Weitervermietung oder Überlassung an Dritte ist nur mit schriftlicher Zustimmung der Vermieterin erlaubt.","Subletting or passing the space on to third parties is only permitted with the landlord's written consent.")}</li>
<li>${T("Schäden sind der Vermieterin umgehend zu melden. Die Mieterin bzw. der Mieter haftet für Schäden, die sie bzw. er verursacht.","Damage must be reported to the landlord immediately. The tenant is liable for any damage they cause.")}</li>
</ul>
</div>
<div class="section">
<h2>5. ${T("Haftung","Liability")}</h2>
<p>${T("Die Vermieterin haftet nicht für Diebstahl, Beschädigung oder Verlust des Fahrzeugs oder von Gegenständen im Fahrzeug, ausser bei Vorsatz oder grober Fahrlässigkeit.","The landlord is not liable for theft of, damage to or loss of the vehicle or of items inside it, except in cases of intent or gross negligence.")}</p>
</div>
<div class="section">
<h2>6. ${T("Rückgabe","Return")}</h2>
<p>${T("Bei Vertragsende ist der Parkplatz geräumt und sauber zurückzugeben. Allfällige Schlüssel, Fernbedienungen oder Badges sind vollständig zurückzugeben; fehlende Exemplare werden der Mieterin bzw. dem Mieter in Rechnung gestellt.","At the end of the tenancy, the parking space must be returned empty and clean. Any keys, remote controls or badges must be returned in full; missing items will be charged to the tenant.")}</p>
</div>
<div class="section">
<h2>7. ${T("Schlussbestimmungen","Final provisions")}</h2>
<p>${T("Dieser Vertrag ist ein eigenständiger Vertrag. Er ist kein Bestandteil eines allfälligen Untermietvertrags über ein Zimmer oder eine Wohnung und kann unabhängig davon gekündigt werden. Änderungen und Ergänzungen bedürfen der Schriftform. Im Übrigen gelten die Bestimmungen des Schweizerischen Obligationenrechts.","This agreement is a separate agreement. It is not part of any sublease agreement for a room or apartment and can be terminated independently of it. Amendments and additions must be made in writing. Otherwise, the provisions of the Swiss Code of Obligations apply.")}</p>
${d.notiz?`<p><strong>${T("Besondere Vereinbarung","Special agreement")}:</strong> ${E(d.notiz)}</p>`:""}
</div>
${en?`<div class="box">This English version is a translation for your understanding. Only the German version is legally binding.</div>`:""}
<div class="signatures">
  <div class="sig-block">
    <div class="role">${T("Mieter*in","Tenant")}</div>
    <div class="name">${E(d.name)}</div>
    <div class="sig-row"><span class="lbl">Ort, Datum:</span><span class="line"></span></div>
    <div class="sig-row"><span class="lbl">Unterschrift:</span><span class="line"></span></div>
  </div>
  <div class="sig-block">
    <div class="role">${T("Vermieterin","Landlord")}</div>
    <div class="name">D&amp;T Partners GmbH</div>
    <div class="sig-row"><span class="lbl">Ort, Datum:</span><span class="line"></span></div>
    <div class="sig-row"><span class="lbl">Unterschrift:</span><span class="line"></span></div>
  </div>
</div>
</body></html>`;
}
// Vertragsdaten aus Parkplatz + Mieter/Externem zusammenstellen. Liefert {d, fehlt[]}.
function ppVertragsDaten(p, apts, tenants, rooms){
  const t = p.tenant_id ? (tenants||[]).find(x=>x.id===p.tenant_id) : null;
  const apt = (apts||[]).find(a=>a.id===p.apt_id) || (apts||[]).find(a=>a.adresse && a.adresse===p.adresse) || (apts||[]).find(a=>a.adresse && p.adresse && a.adresse===String(p.adresse).split("/")[0].trim()) || null;
  const tRoom = t ? ((rooms||[]).find(r=>r.tenantId===t.id) || (rooms||[]).find(r=>r.id===t.roomId)) : null;
  const tApt = tRoom ? (apts||[]).find(a=>a.id===tRoom.aptId) : null;
  let vorname="", nachname="";
  if (t){ vorname=t.vorname||""; nachname=t.nachname||""; }
  else { const n=(p.mieter_extern||"").trim().split(/\s+/); nachname=n.length>1?n.pop():""; vorname=n.join(" "); if(!nachname){ nachname=vorname; vorname=""; } }
  const d = {
    name: `${vorname} ${nachname}`.trim(), vorname, nachname,
    email: t ? (t.email||"") : (p.mieter_email||""),
    telefon: t ? (t.phone||"") : (p.mieter_telefon||""),
    ...(()=>{ // Wohnadresse der Mieterin bzw. des Mieters, aufgeteilt wie im Untermietvertrag
      if (t && tApt) return { strasse: tApt.adresse||"", plzOrtMieter: [tApt.plz,tApt.ort].filter(Boolean).join(" ") };
      if (t) return { strasse: t.adresse||"", plzOrtMieter: [t.plz,t.ort].filter(Boolean).join(" ") };
      const z=(p.mieter_adresse||"").split(/\n|,\s*/).map(x=>x.trim()).filter(Boolean);
      return { strasse: z[0]||"", plzOrtMieter: z.slice(1).join(", ") };
    })(),
    geburt: t ? (t.geburt||"") : "", nat: t ? (t.nat||"") : "",
    adresseMieter: t ? (tApt ? `${tApt.adresse||""}\n${[tApt.plz,tApt.ort].filter(Boolean).join(" ")}`.trim() : "") : (p.mieter_adresse||""),
    sprache: t ? (t.sprache||"de") : (p.sprache||"de"),
    bezeichnung: p.bezeichnung, objektAdresse: p.adresse || (apt&&apt.adresse) || "",
    plzOrt: apt ? [apt.plz, apt.ort].filter(Boolean).join(" ") : "",
    kennzeichen: p.kennzeichen||"", ab: p.vermietet_ab||"", bis: p.vermietet_bis||ppBefristetBis(p.adresse || (apt&&apt.adresse), apts),
    miete: p.miete_verkauf, kuendigungsfrist: p.kuendigungsfrist||1,
  };
  const fehlt=[];
  if(!d.name) fehlt.push("Mieter*in");
  if(!d.email) fehlt.push("E-Mail");
  if(!(+d.miete>0)) fehlt.push("Mietpreis");
  if(!parseDMY(d.ab)) fehlt.push("Mietbeginn (ab)");
  if(!d.objektAdresse) fehlt.push("Adresse");
  return {d, fehlt, tenant:t, apt};
}
async function ppVertragSenden(p, apts, tenants, rooms, preBlob){
  const {d, fehlt, tenant, apt} = ppVertragsDaten(p, apts, tenants, rooms);
  if (fehlt.length) throw new Error("Es fehlt: " + fehlt.join(", "));
  const html = buildParkplatzHTML(d, false);
  const htmlEn = buildParkplatzHTML(d, true);
  // Wurde vorher eine Vorschau gezeigt, genau dieses PDF verschicken
  const blob = preBlob || await htmlToPdf(html, `Parkplatzvertrag_${d.name.replace(/\s+/g,"_")}.pdf`);
  const token = generateContractToken();
  const path = `${token}/parkplatz.pdf`;
  const { error: upErr } = await supabase.storage.from("contracts").upload(path, blob, { contentType: "application/pdf", upsert: false });
  if (upErr) throw new Error(`Upload: ${upErr.message}`);
  const { data: row, error } = await supabase.from("contracts").insert({
    token, tenant_id: tenant ? tenant.id : null, apt_id: p.apt_id || (apt&&apt.id) || null, room_id: null,
    mieter_email: d.email.trim(), mieter_vorname: d.vorname, mieter_nachname: d.nachname,
    contract_type: "parkplatz",
    contract_data: { parkplatz_id: p.id, sprache: d.sprache, person: {vorname:d.vorname, nachname:d.nachname, email:d.email, telefon:d.telefon, adresse:d.adresseMieter},
      parkplatz: {...d}, doc_html: html, doc_html_en: htmlEn,
      vertrag: { einzug: d.ab, mietende: d.bis||null, total: +d.miete, apt: {adresse: d.objektAdresse, plz: apt&&apt.plz, ort: apt&&apt.ort} } },
    status: "gesendet",
    unsigned_pdfs: [{ name: "Parkplatzvertrag", path, type: "parkplatz" }],
    created_by: (window.currentUser && window.currentUser.email) || null,
  }).select().single();
  if (error) throw new Error(`DB: ${error.message}`);
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-contract-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${((await supabase.auth.getSession()).data.session||{}).access_token||SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ contractId: row.id }),
  });
  return { contractId: row.id, signUrl: `https://mieter.dthomes.ch/${token}`, emailSent: res.ok };
}

// ─── PARKPLÄTZE ──────────────────────────────────────────────────────────────
// Ein Parkplatz kostet uns (Einkauf) und bringt Miete (Verkauf). Beides gilt im
// jeweiligen Zeitraum; ohne Datum gilt es unbefristet.
// Parkplaetze bei befristeten Liegenschaften (z.B. Josefstrasse, Rahmenvertrag Ziff. 8.3) enden mit den Wohnungen.
// Liefert das Mietende der befristeten Wohnungen an derselben Strasse, sonst "".
function ppBefristetBis(adresse, apts){
  const str = String(adresse||"").toLowerCase().replace(/\s*\d.*$/,"").trim();
  if(!str) return "";
  let best=null, bestS="";
  (apts||[]).forEach(a=>{
    if(!a.immer_befristet || !a.mietende) return;
    if(String(a.adresse||"").toLowerCase().replace(/\s*\d.*$/,"").trim()!==str) return;
    const d=parseDMY(a.mietende); if(d && !isNaN(d) && (!best||d>best)){ best=d; bestS=a.mietende; }
  });
  return bestS;
}
function ppAktiv(ab, bis, s, e){ const a=parseDMY(ab), b=parseDMY(bis); return (!a||isNaN(a)||a<=e) && (!b||isNaN(b)||b>=s); }
// Name immer aus Gebaeude, Art und Nummer: "Josefstrasse 200/202 · Einstellplatz Nr. 10"
const PP_ART_NAME={einstellplatz:"Einstellplatz",aussen:"Aussenparkplatz",motorrad:"Motorradplatz"};
function ppAutoName(adresse, art, nummer){ const a=(adresse||"").trim(); const t=PP_ART_NAME[art||"einstellplatz"]||"Parkplatz"; const nr=(nummer!==""&&nummer!=null)?` Nr. ${nummer}`:" (Nr. offen)"; return `${a?a+" · ":""}${t}${nr}`; }
function ppUebernommen(p){ return p.uebernommen!==false; }
function ppVermietet(p){ return !!(p.tenant_id || (p.mieter_extern||"").trim()); }
function parkFin(pps, s, e){
  let kosten=0, einnahmen=0, anzahl=0, vermietet=0;
  (pps||[]).forEach(p=>{
    if (!ppUebernommen(p)) return;
    if (ppAktiv(p.einkauf_ab, p.einkauf_bis, s, e)) { kosten += (+p.miete_einkauf||0); anzahl++; }
    if (ppVermietet(p) && ppAktiv(p.vermietet_ab, p.vermietet_bis, s, e)) { einnahmen += (+p.miete_verkauf||0); vermietet++; }
  });
  return {kosten, einnahmen, marge: einnahmen-kosten, anzahl, vermietet};
}
function parkFinHeute(pps){ const n=new Date(); const s=new Date(n.getFullYear(),n.getMonth(),1); const e=new Date(n.getFullYear(),n.getMonth()+1,0,23,59,59,999); return parkFin(pps,s,e); }
function ppMieterName(p, tenants){ if(p.tenant_id){ const t=(tenants||[]).find(x=>x.id===p.tenant_id); if(t) return `${t.vorname||""} ${t.nachname||""}`.trim(); } return (p.mieter_extern||"").trim(); }

// Mietzins-Vergleich bei ganzen Wohnungen (nur intern): frueherer Mietzins laut Mieterspiegel,
// Vergleichsmietzins (hoechster gleicher Typ im selben Haus und Geschoss, falls eigener <= 1900) und unser Mietzins.
function MietzinsVergleich({apt, rooms, tenants}){
  const [ms,setMs]=useState(null);
  useEffect(()=>{ let ab=false; (async()=>{
    if(!apt.refnr){ setMs({}); return; }
    const {data:o}=await supabase.from("mieterspiegel_objekte").select("*").eq("objekt",String(apt.refnr)).maybeSingle();
    if(!o){ if(!ab) setMs({}); return; }
    const {data:l}=await supabase.from("mieterspiegel_objekte").select("*").eq("haus",o.haus).eq("geschoss",o.geschoss).eq("typ",o.typ);
    if(!ab) setMs({o, l:l||[]});
  })(); return ()=>{ab=true;}; },[apt.refnr]);
  const n=v=>`CHF ${Number(v||0).toLocaleString("de-CH",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const o=ms&&ms.o;
  let v=null;
  if(o){ v = (+o.brutto>1900) ? o : (ms.l||[]).reduce((m,x)=>(!m||+x.brutto>+m.brutto)?x:m, null); }
  const fN = o ? +o.nettomiete : +apt.frueherer_mietzins||0, fK = o ? +o.nk : +apt.frueherer_nk||0;
  const room=(rooms||[])[0]; const uB=+(room&&room.miete)||0; const uK=nkWohnung(apt);
  const mieter=room&&(tenants||[]).find(t=>t.id===room.tenantId); const uS=room?stromVonZimmer({...room,aptId:apt.id},mieter,[apt]):0;
  const vertragB=(+apt.frueherer_mietzins||0)+(+apt.frueherer_nk||0);
  const box=(titel,sub,netto,nk,brutto,farbe,fuss,strom)=>(<div style={{background:"#fff",border:"1px solid #e8e3d8",borderRadius:6,padding:"12px 14px"}}>
    <div style={{fontSize:10,color:"#8a8174",textTransform:"uppercase",letterSpacing:".15em",fontWeight:500}}>{titel}</div>
    <div style={{fontSize:11,color:"#a39b8c",marginBottom:8,minHeight:15}}>{sub}</div>
    {[["Nettomiete",netto],["Nebenkosten",nk]].concat(strom!=null?[["Strom",strom]]:[]).map(([l,x])=>(<div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12.5,color:"#5a5448",padding:"2px 0"}}><span>{l}</span><span>{x==null?"-":n(x)}</span></div>))}
    <div style={{display:"flex",justifyContent:"space-between",fontSize:13.5,fontWeight:600,color:farbe,borderTop:"1px solid #f0eadd",marginTop:6,paddingTop:6}}><span>{strom!=null?"Total":"Brutto"}</span><span>{brutto==null?"-":n(brutto)}</span></div>
    {fuss && <div style={{fontSize:10.5,color:"#8a8174",marginTop:6}}>{fuss}</div>}
  </div>);
  if(ms===null) return null;
  return (<div style={{marginTop:18,background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"16px 18px"}}>
    <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:12,fontWeight:500}}>Mietzins-Vergleich (intern)</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10}}>
      {box("Früherer Mietzins", o?`Mieterspiegel, Objekt ${o.objekt}`:"aus den Wohnungsdaten", fN||null, fN?fK:null, fN?fN+fK:null, "#1a1814",
        (o && apt.frueherer_mietzins && Math.abs(vertragB-(fN+fK))>0.01) ? `Im Vertrag hinterlegt: ${n(vertragB)}` : null)}
      {box("Vergleichsmietzins", v?(v.objekt===o.objekt?"eigener Wert (über 1'900)":`Objekt ${v.objekt}, gleicher Stock`):"keine Objekt-Nr. hinterlegt", v?+v.nettomiete:null, v?+v.nk:null, v?+v.brutto:(apt.vergleichsmietzins?+apt.vergleichsmietzins:null), "#1a1814", "Nur intern, nicht im Vertrag")}
      {box("Unser Mietzins", room?"was wir verlangen":"kein Preis hinterlegt", uB?uB-uK:null, uB?uK:null, uB?uB+uS:null, "#5a6e4a", uB?(mieter?`Strom für ${Math.max(1,+mieter.personen||1)} Person(en)`:"Strom für 1 Person, CHF 25 pro Person"):null, uB?uS:null)}
    </div>
  </div>);
}

function ParkplatzModal({pp, apts, tenants, onClose, onSaved}){
  const neu = !pp.id;
  const [f, setF] = useState({anzahl:1, ...pp, mieterArt: pp.tenant_id ? "mieter" : ((pp.mieter_extern||"").trim() ? "extern" : "frei")});
  const [busy, setBusy] = useState(false);
  const set = (k)=>(e)=>setF(x=>({...x,[k]:e.target.value}));
  const adressen = [...new Set((apts||[]).map(a=>a.adresse).filter(Boolean))].sort();
  const aktiveMieter = (tenants||[]).filter(t=>(t.status||"aktiv")==="aktiv").sort((a,b)=>`${a.vorname} ${a.nachname}`.localeCompare(`${b.vorname} ${b.nachname}`));
  const marge = (+f.miete_verkauf||0) - (+f.miete_einkauf||0);
  const befristetBis = ppBefristetBis(f.adresse, apts);
  async function speichern(){
    const nrWert = (f.nummer===""||f.nummer==null) ? null : parseInt(f.nummer);
    const autoName = f.auto_name!==false && (f.adresse||"").trim();
    if(autoName) f.bezeichnung = ppAutoName(f.adresse, f.art, nrWert);
    if(!(f.bezeichnung||"").trim()){ toast("Bitte eine Bezeichnung angeben","error"); return; }
    setBusy(true);
    const row = {
      bezeichnung:(f.bezeichnung||"").trim(), adresse:(f.adresse||"").trim()||null, apt_id:f.apt_id||null,
      tenant_id: f.mieterArt==="mieter" ? (f.tenant_id||null) : null,
      mieter_extern: f.mieterArt==="extern" ? ((f.mieter_extern||"").trim()||null) : null,
      miete_einkauf: f.miete_einkauf===""||f.miete_einkauf==null ? null : +f.miete_einkauf,
      miete_verkauf: f.miete_verkauf===""||f.miete_verkauf==null ? null : +f.miete_verkauf,
      einkauf_ab:(f.einkauf_ab||"").trim()||null, einkauf_bis:(f.einkauf_bis||"").trim()||befristetBis||null,
      vermietet_ab: f.mieterArt==="frei" ? null : ((f.vermietet_ab||"").trim()||null),
      vermietet_bis: f.mieterArt==="frei" ? null : ((f.vermietet_bis||"").trim()||befristetBis||null),
      notiz:(f.notiz||"").trim()||null, updated_at:new Date().toISOString(),
      kennzeichen:(f.kennzeichen||"").trim()||null, kuendigungsfrist: parseInt(f.kuendigungsfrist)||1,
      mieter_email: f.mieterArt==="extern" ? ((f.mieter_email||"").trim()||null) : null,
      mieter_telefon: f.mieterArt==="extern" ? ((f.mieter_telefon||"").trim()||null) : null,
      mieter_adresse: f.mieterArt==="extern" ? ((f.mieter_adresse||"").trim()||null) : null,
      sprache: f.mieterArt==="extern" ? (f.sprache||"de") : "de",
      ausschreiben: !!f.ausschreiben, frei_ab: (f.frei_ab||"").trim()||null,
      art: f.art||"einstellplatz",
      nummer: nrWert, uebernommen: f.uebernommen!==false,
    };
    let error=null;
    if(neu){
      const n=Math.max(1, Math.min(50, parseInt(f.anzahl)||1));
      const rows = n===1 ? [row] : Array.from({length:n},(_,i)=>({...row, bezeichnung:`${row.bezeichnung} ${i+1}`}));
      ({error} = await supabase.from("parkplaetze").insert(rows));
    } else {
      ({error} = await supabase.from("parkplaetze").update(row).eq("id", pp.id));
    }
    // Bekommt ein uebernommener Platz eine Nummer, faellt der leere Platzhalter mit derselben Nummer weg
    if(!error && nrWert!=null && row.uebernommen && row.adresse){
      const {data:dup} = await supabase.from("parkplaetze").select("id,tenant_id,mieter_extern,uebernommen").eq("adresse",row.adresse).eq("art",row.art).eq("nummer",nrWert);
      const weg=(dup||[]).filter(x=>x.id!==pp.id && x.uebernommen===false && !x.tenant_id && !(x.mieter_extern||"").trim()).map(x=>x.id);
      if(weg.length) await supabase.from("parkplaetze").delete().in("id",weg);
    }
    setBusy(false);
    if(error){ toast("Speichern fehlgeschlagen","error"); return; }
    toast(neu && (parseInt(f.anzahl)||1)>1 ? `${parseInt(f.anzahl)} Parkplätze angelegt` : "Gespeichert");
    onSaved();
  }
  async function loeschen(){
    if(!confirm(`Parkplatz «${pp.bezeichnung}» löschen?`)) return;
    setBusy(true); const {error}=await supabase.from("parkplaetze").delete().eq("id", pp.id); setBusy(false);
    if(error){ toast("Löschen fehlgeschlagen","error"); return; }
    toast("Parkplatz gelöscht"); onSaved();
  }
  const sek = (t)=> <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:16,marginBottom:8,fontWeight:500}}>{t}</div>;
  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&!busy&&onClose()}>
      <div className="modal" style={{width:560}}>
        <div className="mt">{neu?"Neuer Parkplatz":"Parkplatz bearbeiten"}</div>
        <div className="frow">
          {(f.adresse||"").trim()
            ? <div className="fg"><label className="fl">Bezeichnung (automatisch)</label><div className="fi" style={{background:"#f7f3eb",color:"#3a352d"}}>{ppAutoName(f.adresse, f.art, f.nummer)}</div></div>
            : <div className="fg"><label className="fl">Bezeichnung</label><input className="fi" value={f.bezeichnung||""} onChange={set("bezeichnung")} placeholder="z.B. Tiefgarage Nr. 12"/></div>}
          <div className="fg" style={{maxWidth:110}}><label className="fl">Platz-Nr.</label><input className="fi" type="number" min="1" value={f.nummer??""} onChange={set("nummer")} placeholder="offen"/></div>
          <div className="fg" style={{maxWidth:190}}><label className="fl">Art</label><select className="fi" value={f.art||"einstellplatz"} onChange={set("art")}>{Object.entries(PP_ART).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></div>
          {neu && <div className="fg" style={{maxWidth:130}}><label className="fl">Anzahl</label><input className="fi" type="number" min="1" max="50" value={f.anzahl} onChange={set("anzahl")}/></div>}
        </div>
        {neu && (parseInt(f.anzahl)||1)>1 && <div style={{fontSize:11,color:"#8a8174",marginTop:-4,marginBottom:8}}>Es werden {parseInt(f.anzahl)} Parkplätze angelegt: «{(f.bezeichnung||"Parkplatz").trim()} 1», «… 2» usw.</div>}
        <div className="frow">
          <div className="fg"><label className="fl">Gebäude / Adresse</label><input className="fi" list="pp-adressen" value={f.adresse||""} onChange={set("adresse")} placeholder="z.B. Josefstrasse 200"/>
            <datalist id="pp-adressen">{adressen.map(a=><option key={a} value={a}/>)}</datalist></div>
          <div className="fg"><label className="fl">Zu Wohnung (optional)</label><select className="fi" value={f.apt_id||""} onChange={set("apt_id")}>
            <option value="">-</option>{(apts||[]).filter(a=>!f.adresse||a.adresse===f.adresse).map(a=><option key={a.id} value={a.id}>{a.id} · {a.adresse}{a.stockwerk?`, ${a.stockwerk}`:""}</option>)}</select></div>
        </div>
        <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5,margin:"4px 0 6px",cursor:"pointer"}}><input type="checkbox" checked={f.uebernommen!==false} onChange={e=>setF(x=>({...x,uebernommen:e.target.checked}))}/> Übernommen (wir mieten diesen Platz bereits)</label>
        {sek("Einkauf (was wir bezahlen)")}
        <div className="frow pp3">
          <div className="fg"><label className="fl">Miete CHF / Mt.</label><input className="fi" type="number" step="5" value={f.miete_einkauf??""} onChange={set("miete_einkauf")}/></div>
          <div className="fg"><label className="fl">Ab</label><input className="fi" value={f.einkauf_ab||""} onChange={set("einkauf_ab")} placeholder="TT.MM.JJJJ"/></div>
          <div className="fg"><label className="fl">Bis</label><input className="fi" value={f.einkauf_bis||""} onChange={set("einkauf_bis")} placeholder={befristetBis||"TT.MM.JJJJ"}/></div>
        </div>
        {sek("Vermietung")}
        <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
          {[["frei","Frei"],["mieter","An Mieter"],["extern","An Externe"]].map(([k,l])=>(
            <button key={k} type="button" className={`btn btn-sm ${f.mieterArt===k?"btn-p":"btn-g"}`} style={{width:"auto"}} onClick={()=>setF(x=>({...x,mieterArt:k}))}>{l}</button>
          ))}
        </div>
        {f.mieterArt==="mieter" && <div className="fg"><label className="fl">Mieter</label><select className="fi" value={f.tenant_id||""} onChange={set("tenant_id")}>
          <option value="">Bitte wählen…</option>{aktiveMieter.map(t=><option key={t.id} value={t.id}>{t.vorname} {t.nachname}</option>)}</select></div>}
        {f.mieterArt==="extern" && <>
          <div className="frow">
            <div className="fg"><label className="fl">Vorname Nachname</label><input className="fi" value={f.mieter_extern||""} onChange={set("mieter_extern")} placeholder="z.B. Hans Muster"/></div>
            <div className="fg"><label className="fl">E-Mail (für den Vertrag)</label><input className="fi" type="email" value={f.mieter_email||""} onChange={set("mieter_email")}/></div>
          </div>
          <div className="frow">
            <div className="fg"><label className="fl">Telefon</label><input className="fi" value={f.mieter_telefon||""} onChange={set("mieter_telefon")}/></div>
            <div className="fg"><label className="fl">Vertragssprache</label><select className="fi" value={f.sprache||"de"} onChange={set("sprache")}><option value="de">Deutsch</option><option value="en">Deutsch + englische Übersetzung</option></select></div>
          </div>
          <div className="fg"><label className="fl">Adresse</label><input className="fi" value={f.mieter_adresse||""} onChange={set("mieter_adresse")} placeholder="Strasse Nr., PLZ Ort"/></div>
        </>}
        {f.mieterArt!=="frei" && <div className="frow pp3">
          <div className="fg"><label className="fl">Miete CHF / Mt.</label><input className="fi" type="number" step="5" value={f.miete_verkauf??""} onChange={set("miete_verkauf")}/></div>
          <div className="fg"><label className="fl">Ab</label><input className="fi" value={f.vermietet_ab||""} onChange={set("vermietet_ab")} placeholder="TT.MM.JJJJ"/></div>
          <div className="fg"><label className="fl">Bis</label><input className="fi" value={f.vermietet_bis||""} onChange={set("vermietet_bis")} placeholder={befristetBis||"TT.MM.JJJJ"}/></div>
        </div>}
        {f.mieterArt!=="frei" && <div className="frow">
          <div className="fg"><label className="fl">Kennzeichen (optional)</label><input className="fi" value={f.kennzeichen||""} onChange={set("kennzeichen")} placeholder="z.B. ZH 123456"/></div>
          <div className="fg"><label className="fl">Kündigungsfrist</label><select className="fi" value={f.kuendigungsfrist||1} onChange={set("kuendigungsfrist")}><option value="1">1 Monat auf Monatsende</option><option value="2">2 Monate auf Monatsende</option><option value="3">3 Monate auf Monatsende</option></select></div>
        </div>}
        {f.mieterArt==="frei" && <div className="frow"><div className="fg"><label className="fl">Angebotspreis CHF / Mt. (für die Marge)</label><input className="fi" type="number" step="5" value={f.miete_verkauf??""} onChange={set("miete_verkauf")}/></div></div>}
        <div style={{fontSize:12.5,marginTop:4,color:marge>=0?"#3d4f2f":"#9b4a3e"}}>Marge: {marge>=0?"+":""}{chf(marge)} / Mt.{f.mieterArt==="frei"?" (sobald vermietet)":""}</div>
        {sek("Website")}
        <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer"}}>
          <input type="checkbox" checked={!!f.ausschreiben} onChange={e=>setF(x=>({...x,ausschreiben:e.target.checked}))}/>
          Auf dthomes.ch ausschreiben (Seite Parkplätze und bei Wohnungen an dieser Adresse)
        </label>
        {f.ausschreiben && <div className="frow" style={{marginTop:8}}>
          <div className="fg"><label className="fl">Frei ab</label><input className="fi" value={f.frei_ab||""} onChange={set("frei_ab")} placeholder="TT.MM.JJJJ, leer = sofort"/></div>
          <div className="fg"><label className="fl">Preis auf der Website</label><div style={{fontSize:13,padding:"9px 0"}}>{f.miete_verkauf!=null&&f.miete_verkauf!==""?`${chf(+f.miete_verkauf)} / Mt.`:<span style={{color:"#9b4a3e"}}>Angebotspreis fehlt</span>}</div></div>
        </div>}
        {f.ausschreiben && f.mieterArt!=="frei" && <div style={{fontSize:11.5,color:"#8a6d3b",marginTop:4}}>Der Platz ist noch vermietet. Ausschreiben nur, wenn er bald frei wird, und "Frei ab" angeben.</div>}
        <div className="fg" style={{marginTop:10}}><label className="fl">Notiz</label><input className="fi" value={f.notiz||""} onChange={set("notiz")} placeholder="optional"/></div>
        <div className="ma">
          {!neu && <button className="btn btn-g" style={{color:"#9b4a3e",marginRight:"auto"}} disabled={busy} onClick={loeschen}>Löschen</button>}
          <button className="btn btn-g" disabled={busy} onClick={onClose}>Abbrechen</button>
          <button className="btn btn-p" disabled={busy} onClick={speichern}>{busy?"Speichert…":"✓ Speichern"}</button>
        </div>
      </div>
    </div>
  );
}

const PP_OFFEN = ["gesendet","geoeffnet","geoeffnet_ungelesen","mieter_signiert"];
function ppAktuellerVertrag(p, vertraege){ return (vertraege||[]).filter(c=>c.parkplatzId===p.id && !["zurueckgezogen","storniert","abgelaufen"].includes(c.status)).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""))[0] || null; }
const PP_STATUS = {gesendet:["Versendet","#8a6d3b","#f6eedb"], geoeffnet:["Geöffnet","#8a6d3b","#f6eedb"], geoeffnet_ungelesen:["Geöffnet","#8a6d3b","#f6eedb"], mieter_signiert:["Unterschrieben","#2c4a6e","#e3ebf4"], signiert:["✓ Gültig","#3d4f2f","#e8eadb"]};
async function ppPdfOeffnen(c){
  const pfad = (c.signedPdfs&&c.signedPdfs[0]&&c.signedPdfs[0].path) || c.signedPdfPath || (c.unsignedPdfs&&c.unsignedPdfs[0]&&c.unsignedPdfs[0].path);
  if(!pfad){ toast("Kein PDF gefunden","error"); return; }
  const w = window.open("about:blank","_blank");
  const {data, error} = await supabase.storage.from("contracts").createSignedUrl(pfad, 600);
  if(error||!data){ if(w) w.close(); toast("PDF konnte nicht geöffnet werden","error"); return; }
  if(w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl;
}
function ParkVertragModal({pp, apts, tenants, rooms, vertraege, onClose, onChanged, onEdit}){
  const [busy, setBusy] = useState("");
  const [vorschauPP, setVorschauPP] = useState(null);
  const [ergebnis, setErgebnis] = useState(null);
  const {d, fehlt} = ppVertragsDaten(pp, apts, tenants, rooms);
  const liste = (vertraege||[]).filter(c=>c.parkplatzId===pp.id).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
  const aktuell = ppAktuellerVertrag(pp, vertraege);
  const offen = aktuell && PP_OFFEN.includes(aktuell.status);
  async function vorschau(){
    setBusy("pdf");
    try { const blob = await htmlToPdf(buildParkplatzHTML(d, false), "Parkplatzvertrag.pdf"); const u = URL.createObjectURL(blob); window.open(u, "_blank") || downloadBlob(blob, `Parkplatzvertrag_${(d.name||"").replace(/\s+/g,"_")}.pdf`); }
    catch(e){ alert("PDF konnte nicht erstellt werden: " + (e.message||e)); }
    finally { setBusy(""); }
  }
  // Vor dem Versand: Vorschau mit genau dem PDF, das verschickt wird
  async function vorschauVorSenden(){
    if(offen && !confirm("Es gibt bereits einen offenen Vertrag. Diesen zurückziehen und einen neuen senden?")) return;
    setBusy("pdf");
    try {
      const fn = `Parkplatzvertrag_${(d.name||"").replace(/\s+/g,"_")}.pdf`;
      const blob = await htmlToPdf(buildParkplatzHTML(d, false), fn);
      setVorschauPP({ fullName: d.name, blob, weitere:[{ name:"Parkplatzvertrag", kurz:"Vertrag", blob, fn }] });
    } catch(e){ alert("Vorschau fehlgeschlagen: " + (e.message||e)); }
    finally { setBusy(""); }
  }
  async function senden(){
    const pre = vorschauPP;
    setBusy("send");
    try {
      if(offen){ const {error} = await supabase.from("contracts").update({status:"zurueckgezogen", updated_at:new Date().toISOString()}).eq("id", aktuell.id); if(error) throw new Error(error.message); }
      const r = await ppVertragSenden(pp, apts, tenants, rooms, pre && pre.blob);
      setVorschauPP(null); setErgebnis(r); onChanged && await onChanged();
    } catch(e){ alert("Senden fehlgeschlagen: " + (e.message||e)); }
    finally { setBusy(""); }
  }
  async function zurueckziehen(){
    if(!aktuell || !confirm("Vertrag zurückziehen? Der Link funktioniert danach nicht mehr.")) return;
    setBusy("zurueck");
    const {error} = await supabase.from("contracts").update({status:"zurueckgezogen", updated_at:new Date().toISOString()}).eq("id", aktuell.id);
    setBusy(""); if(error){ toast("Zurückziehen fehlgeschlagen","error"); return; }
    toast("Vertrag zurückgezogen"); onChanged && onChanged();
  }
  const R = ({l,v})=> <div style={{display:"flex",justifyContent:"space-between",gap:12,padding:"6px 0",borderBottom:"1px solid #efe8da",fontSize:13}}><span style={{color:"#8a8174"}}>{l}</span><span style={{fontWeight:500,textAlign:"right"}}>{v||"-"}</span></div>;
  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&!busy&&onClose()}>
      <div className="modal" style={{width:560}}>
        <div className="mt">Parkplatzvertrag · {pp.bezeichnung}</div>
        <div style={{fontSize:12,color:"#8a8174",marginTop:-10,marginBottom:14,lineHeight:1.5}}>Eigener Vertrag, unabhängig vom Untermietvertrag. Ablauf wie bei den Zimmern: Link per E-Mail, digital unterschreiben, danach gegenzeichnen.</div>
        <R l="Mieter*in" v={d.name}/>
        <R l="E-Mail" v={d.email}/>
        <R l="Parkplatz" v={`${d.bezeichnung}, ${d.objektAdresse}${d.plzOrt?`, ${d.plzOrt}`:""}`}/>
        <R l="Mietbeginn" v={d.ab}/>
        <R l="Dauer" v={d.bis ? `befristet bis ${d.bis}` : `unbefristet, ${d.kuendigungsfrist||1} Mt. Kündigungsfrist`}/>
        <R l="Miete / Mt." v={+d.miete>0 ? chf(+d.miete) : ""}/>
        {d.kennzeichen && <R l="Kennzeichen" v={d.kennzeichen}/>}
        <R l="Sprache" v={d.sprache==="en" ? "Deutsch + englische Übersetzung" : "Deutsch"}/>
        {fehlt.length>0 && <div className="warn" style={{marginTop:14}}>Für den Vertrag fehlt noch: <strong>{fehlt.join(", ")}</strong>. <span style={{textDecoration:"underline",cursor:"pointer"}} onClick={onEdit}>Parkplatz bearbeiten</span></div>}
        {aktuell && (
          <div style={{marginTop:16,padding:"12px 14px",background:"#faf8f3",borderRadius:8,fontSize:12.5}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",justifyContent:"space-between"}}>
              <span>Aktueller Vertrag: <strong>{(PP_STATUS[aktuell.status]||[aktuell.status])[0]}</strong>{aktuell.sentAt?` · gesendet ${new Date(aktuell.sentAt).toLocaleDateString("de-CH")}`:""}</span>
              <span style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {aktuell.status==="mieter_signiert" && <CountersignButton contract={aktuell} onDone={onChanged} onSigned={()=>{}}/>}
                <button className="btn btn-g btn-sm" style={{width:"auto"}} onClick={()=>ppPdfOeffnen(aktuell)}>📄 PDF</button>
                {offen && aktuell.signUrl && <button className="btn btn-g btn-sm" style={{width:"auto"}} onClick={()=>{ try{ navigator.clipboard.writeText(aktuell.signUrl); toast("Link kopiert"); }catch(_){ prompt("Link", aktuell.signUrl); } }}>⧉ Link</button>}
                {offen && <button className="btn btn-g btn-sm" style={{width:"auto",color:"#9b4a3e"}} disabled={!!busy} onClick={zurueckziehen}>Zurückziehen</button>}
              </span>
            </div>
          </div>
        )}
        {ergebnis && <div style={{marginTop:12,fontSize:12.5,color:"#3d4f2f"}}>✓ Vertrag erstellt{ergebnis.emailSent?` und an ${d.email} gesendet`:", aber die E-Mail konnte nicht gesendet werden. Link kopieren und selbst schicken"}.</div>}
        {liste.length>1 && <div style={{marginTop:12,fontSize:11.5,color:"#8a8174"}}>Frühere Verträge: {liste.filter(c=>c!==aktuell).map(c=>`${new Date(c.createdAt).toLocaleDateString("de-CH")} (${(PP_STATUS[c.status]||[c.status==="zurueckgezogen"?"zurückgezogen":c.status])[0]})`).join(", ")}</div>}
        <div className="ma" style={{flexWrap:"wrap"}}>
          <button className="btn btn-g" disabled={!!busy} onClick={onClose}>Schliessen</button>
          <button className="btn btn-g" disabled={!!busy||fehlt.length>0} onClick={vorschau}>{busy==="pdf"?"Erstellt…":"PDF ansehen"}</button>
          {(!aktuell || offen) && <button className="btn btn-p" disabled={!!busy||fehlt.length>0} onClick={vorschauVorSenden}>{busy==="pdf"?"Erstellt…":offen?"👁 Vorschau und neu senden":"👁 Vorschau und senden"}</button>}
        </div>
      </div>
      {vorschauPP && <VertragVorschauModal vorschau={vorschauPP} email={d.email} busy={busy==="send"} progress={busy==="send"?"Vertrag wird gesendet…":null} bestaetigenText="✓ Bestätigen und Parkplatzvertrag senden" onClose={()=>setVorschauPP(null)} onConfirm={senden}/>}
    </div>
  );
}

// Reinigungs-Anfragen von dthomes.ch/reinigung (primaer Endreinigung beim Auszug)
function ReinigungPage(){
  const [liste, setListe] = useState([]);
  const [alle, setAlle] = useState(false);
  const [laden, setLaden] = useState(true);
  const lade = async()=>{ setLaden(true); const {data,error} = await supabase.from("reinigung_anfragen").select("*").order("created_at",{ascending:false}); if(error) toast("Laden fehlgeschlagen","error"); setListe(data||[]); setLaden(false); };
  useEffect(()=>{ lade(); },[]);
  const speichern = async(a, felder)=>{ const {error}=await supabase.from("reinigung_anfragen").update(felder).eq("id",a.id); if(error){ toast("Speichern fehlgeschlagen","error"); return; } lade(); };
  const ST={neu:["Neu","#8a6d3b","#f6eedb"],offeriert:["Offeriert","#2c4a6e","#e3ebf4"],gebucht:["Gebucht","#5a3e8a","#ece6f6"],erledigt:["Erledigt","#3d4f2f","#e8eadb"],abgelehnt:["Abgelehnt","#8a8174","#efeae1"]};
  const offen = liste.filter(a=>["neu","offeriert","gebucht"].includes(a.status||"neu"));
  const zeigen = alle ? liste : offen;
  const datum = (t)=>{ if(!t) return ""; const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(t); return m?`${m[3]}.${m[2]}.${m[1]}`:t; };
  return (
    <div>
      <div className="card">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:10}}>
          <div className="ct" style={{margin:0}}>Reinigungs- und Umzugs-Anfragen{offen.length>0?` (${offen.length} offen)`:""}</div>
          <div style={{display:"flex",gap:6}}>
            <a className="btn btn-g btn-sm" style={{width:"auto"}} href="https://www.dthomes.ch/zimmer#reinigung" target="_blank" rel="noopener noreferrer">Auf der Website ansehen ↗</a>
            <button className="btn btn-g btn-sm" style={{width:"auto"}} onClick={()=>setAlle(v=>!v)}>{alle?"Nur offene":"Alle anzeigen"}</button>
          </div>
        </div>
        {laden && <div style={{fontSize:12.5,color:"#8a8174"}}>Wird geladen…</div>}
        {!laden && zeigen.length===0 && <div style={{fontSize:12.5,color:"#8a8174"}}>{alle?"Noch keine Anfragen.":"Keine offenen Anfragen."}</div>}
        {zeigen.map(a=>{ const [l,col,bg]=ST[a.status||"neu"]||[a.status,"#8a8174","#efeae1"];
          return (
          <div key={a.id} style={{borderTop:"1px solid #efe8da",padding:"12px 0",display:"flex",gap:12,justifyContent:"space-between",flexWrap:"wrap",alignItems:"flex-start"}}>
            <div style={{fontSize:12.5,lineHeight:1.55,minWidth:240,flex:1}}>
              <div><strong>{a.name}</strong> <span style={{fontSize:10.5,padding:"2px 7px",borderRadius:8,color:col,background:bg,marginLeft:4}}>{l}</span>{a.dt_mieter && <span style={{fontSize:10.5,padding:"2px 7px",borderRadius:8,color:"#2c4a6e",background:"#e3ebf4",marginLeft:4}}>D&amp;T-Mieter</span>}</div>
              <div style={{color:"#3a352d"}}>{a.art||"-"}{a.groesse?` · ${a.groesse}`:""}{a.termin?` · Wunschtermin ${datum(a.termin)}`:""}</div>
              <div style={{color:"#8a8174"}}>{a.adresse_neu?`Von ${a.adresse||"-"} nach ${a.adresse_neu}`:(a.adresse||"-")} · eingegangen {new Date(a.created_at).toLocaleDateString("de-CH")}{a.sprache==="en"?" · Englisch":""}</div>
              <div><a href={`mailto:${a.email}`}>{a.email}</a>{a.telefon && <> · <a href={`tel:${a.telefon}`}>{a.telefon}</a></>}</div>
              {a.bemerkung && <div style={{color:"#5a5448",marginTop:2,whiteSpace:"pre-wrap"}}>{a.bemerkung}</div>}
              <input className="fi" placeholder="Interne Notiz (z.B. Offerte CHF, Termin, Reinigungskraft / Umzugsfirma)" defaultValue={a.notiz||""} onBlur={e=>{ const v=e.target.value.trim(); if(v!==(a.notiz||"")) speichern(a,{notiz:v||null}); }} style={{marginTop:6,fontSize:12}}/>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {["offeriert","gebucht","erledigt","abgelehnt"].filter(st=>st!==(a.status||"neu")).map(st=>(
                <button key={st} className={`btn btn-sm ${st==="erledigt"?"btn-p":"btn-g"}`} style={{width:"auto"}} onClick={()=>speichern(a,{status:st})}>{ST[st][0]}</button>
              ))}
            </div>
          </div>); })}
      </div>
    </div>
  );
}

const PP_ART={einstellplatz:"Tiefgarage",aussen:"Aussenparkplatz",motorrad:"Motorradplatz"};
function ParkplaetzePage({parkplaetze, loadParkplaetze, parkVertraege=[], loadParkVertraege, apts, tenants, rooms, istAdmin=true}){
  const [edit, setEdit] = useState(null);
  const [vertragFuer, setVertragFuer] = useState(null);
  const [anfragen, setAnfragen] = useState([]);
  const [zuteilen, setZuteilen] = useState(null); // {anfrage, pp}
  const [alleAnfragen, setAlleAnfragen] = useState(false);
  const ladeAnfragen = async()=>{ const {data} = await supabase.from("parkplatz_anfragen").select("*").order("created_at",{ascending:false}); setAnfragen(data||[]); };
  useEffect(()=>{ if(istAdmin) ladeAnfragen(); },[istAdmin]);
  const toggleOnline = async(p)=>{ const {error}=await supabase.from("parkplaetze").update({ausschreiben:!p.ausschreiben, updated_at:new Date().toISOString()}).eq("id",p.id); if(error){ toast("Speichern fehlgeschlagen","error"); return; } toast(!p.ausschreiben?"Auf der Website ausgeschrieben":"Von der Website genommen"); loadParkplaetze&&loadParkplaetze(); };
  const anfrageStatus = async(a, status)=>{ const {error}=await supabase.from("parkplatz_anfragen").update({status}).eq("id",a.id); if(error){ toast("Speichern fehlgeschlagen","error"); return; } ladeAnfragen(); };
  const [alleZeigen, setAlleZeigen] = useState(false);
  const ppsAlle = parkplaetze||[];
  const pps = ppsAlle.filter(ppUebernommen);
  const ppSort=(a,b)=>((a.art||"einstellplatz").localeCompare(b.art||"einstellplatz")) || ((a.nummer==null?9999:a.nummer)-(b.nummer==null?9999:b.nummer)) || (a.bezeichnung||"").localeCompare(b.bezeichnung||"");
  const fin = parkFinHeute(pps);
  const gruppen = {};
  ppsAlle.forEach(p=>{ const k=(p.adresse||"Ohne Adresse"); (gruppen[k]=gruppen[k]||[]).push(p); });
  const td={padding:"9px 10px",borderTop:"1px solid #efe8da",fontSize:12.5,verticalAlign:"middle"};
  const frei = pps.filter(p=>!ppVermietet(p)).length;
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}><div><div className="pt">Parkplätze</div><div className="ps">{pps.length} übernommen · {pps.length-frei} vermietet · {frei} frei{ppsAlle.length>pps.length?` · ${ppsAlle.length-pps.length} noch nicht übernommen`:""}</div></div>
        {istAdmin && <button className="btn btn-p" style={{width:"auto"}} onClick={()=>setEdit({bezeichnung:"Parkplatz", adresse:"", anzahl:1})}>+ Parkplatz</button>}</div>
      <div className="sg" style={{marginBottom:18}}>
        <div className="sc"><div className="sl">Einnahmen</div><div className="sv" style={{fontSize:24,color:"#5a6e4a"}}>{chf(fin.einnahmen).replace("CHF ","")}</div><div className="sn" style={{color:"#8a8174"}}>CHF / Mt.</div></div>
        <div className="sc"><div className="sl">Kosten</div><div className="sv" style={{fontSize:24}}>{chf(fin.kosten).replace("CHF ","")}</div><div className="sn" style={{color:"#8a8174"}}>CHF / Mt.</div></div>
        <div className="sc"><div className="sl">Marge</div><div className="sv" style={{fontSize:24,color:fin.marge>=0?"#3d4f2f":"#9b4a3e"}}>{fin.marge>=0?"+":""}{chf(fin.marge).replace("CHF ","")}</div><div className="sn" style={{color:"#8a8174"}}>CHF / Mt.</div></div>
        <div className="sc"><div className="sl">Frei</div><div className="sv" style={{fontSize:24,color:frei>0?"#b8843e":"#5a6e4a"}}>{frei}</div><div className="sn" style={{color:"#8a8174"}}>von {pps.length}</div></div>
      </div>
      {istAdmin && anfragen.length>0 && (()=>{
        const AST={neu:["Neu","#8a6d3b","#f6eedb"],kontaktiert:["Kontaktiert","#2c4a6e","#e3ebf4"],zugeteilt:["Zugeteilt","#3d4f2f","#e8eadb"],abgelehnt:["Abgelehnt","#8a8174","#efeae1"]};
        const offen=anfragen.filter(a=>["neu","kontaktiert"].includes(a.status));
        const liste=alleAnfragen?anfragen:offen;
        return (
          <div className="card" style={{marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:10,flexWrap:"wrap",marginBottom:8}}>
              <div className="ct" style={{margin:0}}>Anfragen von der Website{offen.length>0?` (${offen.length} offen)`:""}</div>
              <button className="btn btn-g btn-sm" style={{width:"auto"}} onClick={()=>setAlleAnfragen(v=>!v)}>{alleAnfragen?"Nur offene":"Alle anzeigen"}</button>
            </div>
            {liste.length===0 && <div style={{fontSize:12.5,color:"#8a8174"}}>Keine offenen Anfragen.</div>}
            {liste.map(a=>{ const [l,col,bg]=AST[a.status]||[a.status,"#8a8174","#efeae1"]; const freiHier=pps.filter(p=>p.adresse===a.adresse && !ppVermietet(p)).sort(ppSort);
              return (
              <div key={a.id} style={{borderTop:"1px solid #efe8da",padding:"10px 0",display:"flex",gap:12,justifyContent:"space-between",flexWrap:"wrap",alignItems:"flex-start"}}>
                <div style={{fontSize:12.5,lineHeight:1.55,minWidth:220,flex:1}}>
                  <div><strong>{a.name}</strong> <span style={{fontSize:10.5,padding:"2px 7px",borderRadius:8,color:col,background:bg,marginLeft:4}}>{l}</span></div>
                  <div style={{color:"#8a8174"}}>{a.adresse||"-"}{a.art?` · ${PP_ART[a.art]||a.art}`:""} · eingegangen {new Date(a.created_at).toLocaleDateString("de-CH")}{a.ab_wann?` · ab ${a.ab_wann}`:""}{a.kennzeichen?` · ${a.kennzeichen}`:""}</div>
                  <div><a href={`mailto:${a.email}`}>{a.email}</a>{a.telefon && <> · <a href={`tel:${a.telefon}`}>{a.telefon}</a></>}{a.wohnadresse?` · ${a.wohnadresse}`:""}</div>
                  {a.bemerkung && <div style={{color:"#5a5448",marginTop:2,whiteSpace:"pre-wrap"}}>{a.bemerkung}</div>}
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {a.status!=="zugeteilt" && <button className="btn btn-p btn-sm" style={{width:"auto"}} disabled={!freiHier.length} title={freiHier.length?"":"An dieser Adresse ist kein Platz frei"} onClick={()=>setZuteilen({anfrage:a, pp:{...freiHier[0], mieterArt:"extern", mieter_extern:a.name, mieter_email:a.email, mieter_telefon:a.telefon||"", mieter_adresse:a.wohnadresse||"", kennzeichen:a.kennzeichen||"", vermietet_ab:a.ab_wann&&/\d/.test(a.ab_wann)?a.ab_wann:"", sprache:a.sprache==="en"?"en":"de", ausschreiben:false}})}>Platz zuteilen</button>}
                  <select className="fi" style={{width:"auto",padding:"4px 8px",fontSize:12}} value={a.status} onChange={e=>anfrageStatus(a,e.target.value)}>
                    {Object.entries(AST).map(([k,[lab]])=><option key={k} value={k}>{lab}</option>)}
                  </select>
                </div>
              </div>); })}
          </div>
        );
      })()}
      {pps.length===0 && <div className="empty">Noch keine Parkplätze erfasst.</div>}
      {Object.keys(gruppen).sort().map(adr=>{
        const alleHier=gruppen[adr].slice().sort(ppSort); const aktivHier=alleHier.filter(ppUebernommen); const liste=alleZeigen?alleHier:aktivHier; const gf=parkFinHeute(aktivHier);
        return (
          <div key={adr} className="card" style={{marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:10,flexWrap:"wrap",marginBottom:8}}>
              <div><div className="ct" style={{margin:0}}>{adr}</div>
                {alleHier.length>aktivHier.length && <div style={{fontSize:11.5,color:"#8a8174",marginTop:3}}>Übernommen: {["einstellplatz","aussen","motorrad"].map(a=>{ const x=alleHier.filter(p=>(p.art||"einstellplatz")===a); return x.length?`${x.filter(ppUebernommen).length} von ${x.length} ${a==="aussen"?"Aussenparkplätzen":a==="motorrad"?"Motorradplätzen":"Einstellplätzen"}`:null; }).filter(Boolean).join(" · ")} <span onClick={()=>setAlleZeigen(v=>!v)} style={{marginLeft:6,cursor:"pointer",textDecoration:"underline dotted",color:"#5a5448"}}>{alleZeigen?"nur übernommene zeigen":"alle Plätze zeigen"}</span></div>}</div>
              <div style={{fontSize:11.5,color:"#8a8174"}}>{aktivHier.filter(ppVermietet).length}/{aktivHier.length} vermietet · {aktivHier.filter(x=>!ppVermietet(x)).length} frei · {aktivHier.filter(x=>x.ausschreiben).length} online · Marge <span style={{color:gf.marge>=0?"#3d4f2f":"#9b4a3e",fontWeight:600}}>{gf.marge>=0?"+":""}{chf(gf.marge)}</span> / Mt.</div>
            </div>
            <div style={{overflowX:"auto"}}><table className="pp-tbl" style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr style={{textAlign:"left",fontSize:9.5,color:"#8a8174",letterSpacing:".15em",textTransform:"uppercase"}}>
                <th style={{padding:"6px 10px"}}>Parkplatz</th><th style={{padding:"6px 10px"}}>Mieter</th><th style={{padding:"6px 10px",textAlign:"right"}}>Einkauf</th><th style={{padding:"6px 10px",textAlign:"right"}}>Vermietung</th><th style={{padding:"6px 10px",textAlign:"right"}}>Marge</th>{istAdmin&&<th style={{padding:"6px 10px"}}>Vertrag</th>}{istAdmin&&<th></th>}</tr></thead>
              <tbody>{liste.map(p=>{ const m=(+p.miete_verkauf||0)-(+p.miete_einkauf||0); const name=ppMieterName(p,tenants); const apt=(apts||[]).find(a=>a.id===p.apt_id); const inaktiv=!ppUebernommen(p); return (
                <tr key={p.id} style={inaktiv?{opacity:.45}:undefined} title={inaktiv?"Noch nicht übernommen":undefined}>
                  <td style={{...td,fontWeight:600}}>{p.bezeichnung}{istAdmin && !name && !inaktiv ? <span onClick={()=>toggleOnline(p)} title={p.ausschreiben?`Auf der Website ausgeschrieben${p.frei_ab?`, frei ab ${p.frei_ab}`:""}. Klicken zum Ausblenden.`:"Nicht auf der Website. Klicken zum Ausschreiben."} style={{marginLeft:6,fontSize:9.5,fontWeight:600,padding:"2px 7px",borderRadius:8,cursor:"pointer",background:p.ausschreiben?"#e3ebf4":"#f0ebe1",color:p.ausschreiben?"#2c4a6e":"#8a8174"}}>{p.ausschreiben?"online":"offline"}</span> : (p.ausschreiben && <span style={{marginLeft:6,fontSize:9.5,fontWeight:600,padding:"2px 7px",borderRadius:8,background:"#e3ebf4",color:"#2c4a6e"}}>online</span>)}<div style={{fontSize:10.5,color:"#8a8174",fontWeight:400}}>{inaktiv?"noch nicht übernommen · ":""}{PP_ART[p.art||"einstellplatz"]||p.art}{apt?` · zu ${apt.id}${apt.stockwerk?` · ${apt.stockwerk}`:""}`:""}{!name&&p.frei_ab?` · frei ab ${p.frei_ab}`:""}</div></td>
                  <td data-label="Mieter" style={td}>{inaktiv ? <span style={{color:"#a89f8f"}}>-</span> : name ? <>{name}{p.vermietet_ab && <div style={{fontSize:10.5,color:"#8a8174"}}>ab {p.vermietet_ab}{p.vermietet_bis?` bis ${p.vermietet_bis}`:""}</div>}</> : <span style={{color:"#b8843e"}}>frei</span>}</td>
                  <td data-label="Einkauf" style={{...td,textAlign:"right"}}>{p.miete_einkauf!=null?chf(+p.miete_einkauf):"-"}</td>
                  <td data-label="Vermietung" style={{...td,textAlign:"right",color:name?"inherit":"#a89f8f"}}>{p.miete_verkauf!=null?chf(+p.miete_verkauf):"-"}</td>
                  <td data-label="Marge" style={{...td,textAlign:"right",color:m>=0?"#3d4f2f":"#9b4a3e"}}>{(p.miete_verkauf!=null||p.miete_einkauf!=null)?`${m>=0?"+":""}${chf(m)}`:"-"}</td>
                  {istAdmin && <td data-label="Vertrag" style={td}>{(()=>{ const c=ppAktuellerVertrag(p, parkVertraege); if(!name) return <span style={{color:"#a89f8f"}}>-</span>;
                    if(c && c.status==="mieter_signiert") return <CountersignButton contract={c} onDone={loadParkVertraege} onSigned={()=>{}}/>;
                    if(c){ const [l,col,bg]=PP_STATUS[c.status]||[c.status,"#8a8174","#f0ebe1"]; return <span onClick={()=>setVertragFuer(p)} style={{cursor:"pointer",fontSize:11,padding:"3px 8px",borderRadius:10,color:col,background:bg,whiteSpace:"nowrap"}}>{l}</span>; }
                    return <button className="btn btn-g btn-sm" style={{width:"auto"}} onClick={()=>setVertragFuer(p)}>📄 Vertrag</button>; })()}</td>}
                  {istAdmin && <td style={{...td,textAlign:"right",whiteSpace:"nowrap"}}>{ppAktuellerVertrag(p, parkVertraege) && <button className="btn btn-g btn-sm" style={{width:"auto",marginRight:4}} title="Vertrag" onClick={()=>setVertragFuer(p)}>📄</button>}<button className="btn btn-g btn-sm" style={{width:"auto"}} onClick={()=>setEdit(p)}>✏</button></td>}
                </tr>);})}</tbody>
            </table></div>
          </div>
        );
      })}
      {vertragFuer && <ParkVertragModal pp={(pps.find(x=>x.id===vertragFuer.id))||vertragFuer} apts={apts} tenants={tenants} rooms={rooms} vertraege={parkVertraege} onClose={()=>setVertragFuer(null)} onChanged={()=>loadParkVertraege&&loadParkVertraege()} onEdit={()=>{ const p=vertragFuer; setVertragFuer(null); setEdit(p); }}/>}
      {edit && <ParkplatzModal pp={edit} apts={apts} tenants={tenants} onClose={()=>setEdit(null)} onSaved={()=>{ setEdit(null); loadParkplaetze&&loadParkplaetze(); }}/>}
      {zuteilen && <ParkplatzModal pp={zuteilen.pp} apts={apts} tenants={tenants} onClose={()=>setZuteilen(null)} onSaved={async()=>{ const a=zuteilen.anfrage; setZuteilen(null); await supabase.from("parkplatz_anfragen").update({status:"zugeteilt", parkplatz_id:zuteilen.pp.id}).eq("id",a.id); ladeAnfragen(); loadParkplaetze&&loadParkplaetze(); }}/>}
    </div>
  );
}

const PAGES=[
  {id:"dashboard",icon:"⊞",label:"Dashboard"},
  {id:"bewerber",icon:"📋",label:"Bewerber"},
  {id:"mieter",icon:"👤",label:"Mieter"},
  {id:"todos",icon:"✅",label:"To-dos"},
  {id:"schaeden",icon:"🔧",label:"Schäden"},
  {id:"kuendigungen",icon:"📤",label:"Kündigungen"},
  {id:"wohnungen",icon:"🏠",label:"Wohnungen",group:"vermietung"},
  {id:"zimmer",icon:"🚪",label:"Zimmer",group:"vermietung"},
  {id:"nachvermietung",icon:"🔄",label:"Nachvermietung",group:"vermietung"},
  {id:"uebergaben",icon:"🔑",label:"Übergaben",group:"vermietung"},
  {id:"parkplaetze",icon:"🅿️",label:"Parkplätze",group:"vermietung"},
  {id:"reinigung",icon:"🧽",label:"Reinigung & Umzug",group:"vermietung"},
  {id:"zahlungen",icon:"💰",label:"Zahlungen",group:"finanzen"},
  {id:"finanzen",icon:"📊",label:"Finanzen",group:"finanzen"},
  {id:"auslagen",icon:"💳",label:"Geschäftskarte",group:"finanzen"},
  {id:"pipeline",icon:"📇",label:"Pipeline",group:"akquise"},
  {id:"portfoliowatch",icon:"📡",label:"Portfolio-Watch",group:"akquise"},
  {id:"marktradar",icon:"🔭",label:"Marktradar",group:"akquise"},
  {id:"bauradar",icon:"🏗️",label:"Bauradar",group:"akquise"},
  {id:"kontakte",icon:"👥",label:"Kontakte",group:"akquise"},
  {id:"partner",icon:"🏢",label:"Partner",group:"akquise"},
  {id:"werbung",icon:"📣",label:"Werbung",group:"akquise"},
  {id:"dokumente",icon:"📁",label:"Dokumente",group:"verwaltung"},
  {id:"datencheck",icon:"🩺",label:"Datencheck",group:"verwaltung"},
  {id:"passwoerter",icon:"🔐",label:"Passwörter",group:"verwaltung"},
  {id:"zeit",icon:"⏱",label:"Zeiterfassung",group:"verwaltung"},
];
// Gruppen der Seitenleiste (aufklappbar)
const NAV_GRUPPEN=[
  {id:"vermietung",icon:"🏘️",label:"Vermietung"},
  {id:"finanzen",icon:"💼",label:"Finanzen"},
  {id:"akquise",icon:"🧭",label:"Akquise"},
  {id:"verwaltung",icon:"🗂️",label:"Verwaltung"},
];

// Welche Seiten eine Rolle sehen darf. null bedeutet: alle Seiten.
// Die Datenbank setzt die Grenzen unabhaengig davon nochmals durch, diese Liste
// dient nur einer aufgeraeumten Oberflaeche.
const ROLLEN_SEITEN = {
  admin: null,
  operations: ["bewerber","nachvermietung","portfoliowatch","marktradar","bauradar","pipeline","kontakte","dokumente","wohnungen","zimmer","mieter","uebergaben","todos","zeit","schaeden"],
  mitarbeiter: ["zeit"],
};

function seitenFuerRolle(rolle) {
  const erlaubt = ROLLEN_SEITEN[rolle];
  if (erlaubt === null || erlaubt === undefined) return PAGES;
  return PAGES.filter(p => erlaubt.includes(p.id));
}

// Wird angezeigt, wenn eine Rolle eine Seite oeffnet, die sie nicht sehen darf.
