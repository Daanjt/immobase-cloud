// ─── BEWERBER ────────────────────────────────────────────────────────────────
// ── Geteilte Vertrags-Helfer (Top-Level: Versand UND Download nutzen denselben Weg) ──
function daanDatumStr() {
  return new Date().toLocaleDateString("de-CH", { day:"numeric", month:"long", year:"numeric" });
}
function injectDaanInUMV(html) {
  const hauptmieterPattern = /(<div class="sig-block">\s*<div class="role">Hauptmieter<\/div>[\s\S]*?<div class="sig-row">\s*<span class="lbl">Unterschrift:<\/span>\s*)<span class="line"><\/span>/;
  let sigOk = false;
  let replaced = html.replace(hauptmieterPattern, (match, prefix) => {
    sigOk = true;
    return `${prefix}<span class="line" style="position:relative;flex:1;"><img src="${DAAN_FAKSIMILE_DATA_URI}" style="position:absolute;left:8pt;bottom:-6pt;height:28pt;pointer-events:none;" alt="Daan Theijse"/></span>`;
  });
  const datumPattern = /(<div class="sig-block">\s*<div class="role">Hauptmieter<\/div>[\s\S]*?<div class="sig-row">\s*<span class="lbl">Ort, Datum:<\/span>\s*)<span class="line"><\/span>/;
  const datumStr = daanDatumStr();
  let datumOk = false;
  replaced = replaced.replace(datumPattern, (m, prefix) => {
    datumOk = true;
    return `${prefix}<span class="line" style="border-bottom:.5pt solid #888;flex:1;">Zürich, ${datumStr}</span>`;
  });
  if (!sigOk || !datumOk) throw new Error(`injectDaanInUMV: Hauptmieter-Signaturblock nicht gefunden [sig=${sigOk}, datum=${datumOk}]`);
  return replaced;
}
function injectDaanInAMZ(html) {
  const datumStr = daanDatumStr();
  const labelStyle = ' style="min-width:62pt;width:62pt;"';
  const vermPattern = /(<div class="lbl">Vermieter\*in<\/div>[\s\S]*?<div class="sig-row-inner"><span class="label")(>Datum:<\/span>)<span class="line"><\/span>(<\/div>\s*<div class="sig-row-inner"><span class="label")(>Unterschrift:<\/span>)<span class="line"><\/span>/;
  let vermOk = false;
  let replaced = html.replace(vermPattern, (m, p1, p2, p3, p4) => {
    vermOk = true;
    return `${p1}${labelStyle}${p2}<span class="line" style="flex:1;">${datumStr}</span>${p3}${labelStyle}${p4}<span class="line" style="position:relative;flex:1;"><img src="${DAAN_FAKSIMILE_DATA_URI}" style="position:absolute;left:8pt;bottom:-6pt;height:22pt;pointer-events:none;" alt="Daan Theijse"/></span>`;
  });
  const mieterPattern = /(<div class="lbl">Mieter\*in<\/div>[\s\S]*?<div class="sig-row-inner"><span class="label")(>Datum:<\/span><span class="line"><\/span><\/div>\s*<div class="sig-row-inner"><span class="label")(>Unterschrift:<\/span>)/;
  let mieterOk = false;
  replaced = replaced.replace(mieterPattern, (m, p1, p2, p3) => {
    mieterOk = true;
    return `${p1}${labelStyle}${p2}${labelStyle}${p3}`;
  });
  if (!vermOk || !mieterOk) throw new Error(`injectDaanInAMZ: Signaturblock nicht gefunden [verm=${vermOk}, mieter=${mieterOk}]`);
  return replaced;
}
async function htmlToPdf(html, filename, maxRetries = 2) {
  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch("https://mieter.dthomes.ch/api/pdf-generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, filename }),
      });
      if (response.ok) return await response.blob();
      const errText = await response.text();
      lastErr = new Error(`PDF generation failed (${response.status}): ${errText}`);
      const retriable = response.status === 500 && (errText.includes("ETXTBSY") || errText.includes("timeout") || errText.includes("Failed to launch"));
      if (!retriable || attempt === maxRetries) throw lastErr;
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      if (attempt === maxRetries) throw err;
      lastErr = err; await new Promise(r => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Geteilter Vertrags-Versand (Bewerber UND Mieter). opts.tenantId -> schreibt tenant_id statt bewerber_id.
function generateContractToken() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}
// Vorschau vor dem digitalen Versand: dieselben PDFs, die danach verschickt werden
async function vertragPdfsErstellen(b, vertragData, types, onProgress) {
  const progress = onProgress || (() => {});
  const sel = Array.isArray(types) && types.length ? types : ["umv", "amz"];
  const fullName = `${b.vorname || ""} ${b.nachname || ""}`.trim();
  const stromFix = istWohnungsVertrag(vertragData) ? (+vertragData.strom || 0) : 25;
  const amzData = { ...vertragData, strom: stromFix, total: (vertragData.nettomiete||0) + (vertragData.nebenkosten||0) + stromFix };
  const out = { fullName };
  if (sel.includes("umv")) { progress("Vorschau Untermietvertrag…", 0.2); out.umvBlob = await htmlToPdf(buildContractHTML(b, vertragData, fullName, formatDateLong), `Untermietvertrag_${fullName.replace(/\s+/g,"_")}.pdf`); }
  if (sel.includes("amz")) { progress("Vorschau Anfangsmietzinsformular…", 0.6); out.amzBlob = await htmlToPdf(buildAnfangsmietzinsHTML(b, amzData, fullName, formatDateLong), `Anfangsmietzinsformular_${fullName.replace(/\s+/g,"_")}.pdf`); }
  return out;
}
// Alle Seiten eines PDFs als Bilder (fuer Handys: iOS/Android zeigen PDFs im iframe schlecht oder gar nicht)
function PdfSeiten({ url }) {
  const [seiten, setSeiten] = useState([]);
  const [fehler, setFehler] = useState(false);
  const [fertig, setFertig] = useState(false);
  useEffect(() => {
    let abbruch = false;
    setSeiten([]); setFehler(false); setFertig(false);
    (async () => {
      try {
        const pdfjs = await _ensurePdfJsAdmin();
        const pdf = await pdfjs.getDocument(url).promise;
        const breite = Math.min(window.innerWidth || 400, 900);
        for (let i = 1; i <= pdf.numPages; i++) {
          if (abbruch) return;
          const page = await pdf.getPage(i);
          const basis = page.getViewport({ scale: 1 });
          const scale = (breite * Math.min(window.devicePixelRatio || 1, 2.5)) / basis.width;
          const vp = page.getViewport({ scale });
          const c = document.createElement("canvas");
          c.width = vp.width; c.height = vp.height;
          await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
          const d = c.toDataURL("image/jpeg", 0.88);
          if (abbruch) return;
          setSeiten(prev => [...prev, d]);
        }
        if (!abbruch) setFertig(true);
      } catch (e) { console.warn("PDF-Vorschau:", e); if (!abbruch) setFehler(true); }
    })();
    return () => { abbruch = true; };
  }, [url]);
  if (fehler) return <div style={{padding:24,textAlign:"center",fontSize:13,color:"#6e6a62"}}>Vorschau konnte nicht geladen werden. Bitte oben „Öffnen" verwenden.</div>;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {seiten.map((src,i)=>(
        <div key={i}>
          <img src={src} alt={"Seite "+(i+1)} style={{width:"100%",display:"block",background:"#fff",border:"1px solid #d8d0c0",borderRadius:4,boxShadow:"0 1px 4px rgba(0,0,0,.08)"}}/>
          <div style={{fontSize:10.5,color:"#8a8174",textAlign:"center",marginTop:3}}>Seite {i+1}</div>
        </div>
      ))}
      {!fertig && <div style={{padding:20,textAlign:"center",fontSize:12.5,color:"#8a8174"}}>⏳ Seiten werden geladen…</div>}
    </div>
  );
}
function useIstHandy() {
  const q = "(max-width: 760px), (pointer: coarse) and (max-width: 1024px)";
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia ? window.matchMedia(q).matches : false);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(q); const h = () => setM(mq.matches);
    mq.addEventListener ? mq.addEventListener("change", h) : mq.addListener(h);
    return () => { mq.removeEventListener ? mq.removeEventListener("change", h) : mq.removeListener(h); };
  }, []);
  return m;
}
function VertragVorschauModal({ vorschau, email, busy, progress, onClose, onConfirm }) {
  const [idx, setIdx] = useState(0);
  const handy = useIstHandy();
  const docs = React.useMemo(() => {
    if (!vorschau) return [];
    const n = vorschau.fullName ? vorschau.fullName.replace(/\s+/g, "_") : "Vertrag";
    const d = [];
    if (vorschau.umvBlob) d.push({ name: "Untermietvertrag", kurz: "Vertrag", url: URL.createObjectURL(vorschau.umvBlob), fn: `Untermietvertrag_${n}.pdf` });
    if (vorschau.amzBlob) d.push({ name: "Anfangsmietzinsformular", kurz: "Mietzinsformular", url: URL.createObjectURL(vorschau.amzBlob), fn: `Anfangsmietzinsformular_${n}.pdf` });
    return d;
  }, [vorschau]);
  useEffect(() => () => { docs.forEach(x => { try { URL.revokeObjectURL(x.url); } catch (e) {} }); }, [docs]);
  useEffect(() => {
    if (!vorschau) return;
    const alt = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = alt; };
  }, [vorschau]);
  if (!vorschau) return null;
  const cur = docs[Math.min(idx, docs.length - 1)];
  const kleinBtn = {fontSize:12,padding:handy?"8px 12px":"5px 12px",background:"#f0ebe1",color:"#4a4439",border:"1px solid #d8d0c0",borderRadius:6,textDecoration:"none",cursor:"pointer",whiteSpace:"nowrap"};
  const inhalt = (
    <div style={{position:"fixed",inset:0,background:"rgba(20,18,15,.55)",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center",padding:handy?0:16}}>
      <div style={{background:"#fefcf7",borderRadius:handy?0:10,width:handy?"100%":"min(980px,100%)",height:handy?"100%":"min(92vh,1100px)",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
        <div style={{padding:handy?"calc(10px + env(safe-area-inset-top)) 14px 10px":"14px 20px",borderBottom:"1px solid #e8e3d8",display:"flex",flexDirection:handy?"column":"row",alignItems:handy?"stretch":"center",justifyContent:"space-between",gap:handy?8:10,flexWrap:"wrap",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:handy?16:15,fontWeight:600,color:"#1a1814"}}>Vorschau vor dem Versand</div>
              <div style={{fontSize:11.5,color:"#8a8174",wordBreak:"break-word"}}>So erhält {email || "der Mieter"} die Dokumente zum Unterschreiben.</div>
            </div>
            {handy && <button onClick={()=>!busy&&onClose()} disabled={busy} aria-label="Schliessen" style={{flexShrink:0,width:36,height:36,borderRadius:18,border:"1px solid #d8d0c0",background:"#f0ebe1",fontSize:18,lineHeight:1,cursor:"pointer",color:"#4a4439"}}>×</button>}
          </div>
          {docs.length > 1 && <div style={{display:"flex",gap:6}}>
            {docs.map((d,i)=>(
              <button key={i} onClick={()=>setIdx(i)} style={{flex:handy?1:"none",fontSize:12,padding:handy?"9px 8px":"7px 14px",borderRadius:6,cursor:"pointer",fontWeight:600,border:"1px solid",borderColor:idx===i?"#2c4a6e":"#d8d0c0",background:idx===i?"#2c4a6e":"#fefcf7",color:idx===i?"#fefcf7":"#4a4439"}}>{handy?d.kurz:d.name}</button>
            ))}
          </div>}
        </div>
        <div style={{flex:1,minHeight:0,padding:handy?"10px 10px 0":12,display:"flex",flexDirection:"column",gap:8}}>
          {cur && <div style={{display:"flex",justifyContent:handy?"space-between":"flex-end",alignItems:"center",gap:8,flexShrink:0}}>
            {handy && <div style={{fontSize:12,fontWeight:600,color:"#4a4439",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cur.name}</div>}
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              <a href={cur.url} download={cur.fn} style={kleinBtn}>⬇ {handy?"Laden":cur.name+" herunterladen"}</a>
              <button onClick={()=>window.open(cur.url,"_blank")} style={kleinBtn}>↗ {handy?"Öffnen":"In neuem Tab"}</button>
            </div>
          </div>}
          {cur && (handy
            ? <div key={cur.url} style={{flex:1,minHeight:0,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingBottom:12}}><PdfSeiten url={cur.url}/></div>
            : <iframe key={cur.url} src={cur.url} title={cur.name} style={{flex:1,width:"100%",minHeight:300,border:"1px solid #d8d0c0",borderRadius:6,background:"#fff"}}/>)}
        </div>
        {busy && progress && <div style={{padding:"6px 16px",fontSize:11.5,color:"#6e6a62",flexShrink:0}}>⏳ {progress}</div>}
        <div style={{padding:handy?"10px 12px calc(10px + env(safe-area-inset-bottom))":"12px 20px",borderTop:"1px solid #e8e3d8",display:"flex",flexDirection:handy?"column-reverse":"row",justifyContent:"flex-end",gap:8,flexShrink:0,background:"#fefcf7"}}>
          <button onClick={()=>!busy&&onClose()} disabled={busy} style={{fontSize:handy?14:12.5,padding:handy?"12px 16px":"9px 16px",background:"#f0ebe1",color:"#4a4439",border:"1px solid #d8d0c0",borderRadius:6,cursor:busy?"wait":"pointer"}}>Zurück zum Bearbeiten</button>
          <button onClick={onConfirm} disabled={busy} style={{fontSize:handy?14.5:12.5,padding:handy?"14px 18px":"9px 18px",background:"#3a5230",color:"#fefcf7",border:"1px solid #2f4527",borderRadius:6,cursor:busy?"wait":"pointer",fontWeight:600}}>{busy?"Wird gesendet…":(handy?"✓ Bestätigen und senden":"✓ Bestätigen und Vertrag digital senden")}</button>
        </div>
      </div>
    </div>
  );
  return (window.ReactDOM && ReactDOM.createPortal) ? ReactDOM.createPortal(inhalt, document.body) : inhalt;
}
async function sendContractForSigningShared(b, vertragData, onProgress, types, opts) {
  opts = opts || {};
  const progress = onProgress || (() => {});
  const selectedTypes = Array.isArray(types) && types.length > 0 ? types : ["umv", "amz"];
  const wantUmv = selectedTypes.includes("umv");
  const wantAmz = selectedTypes.includes("amz");
  if (istWohnungsVertrag(vertragData) && vertragData.mitmieter && mitmieterFehlt(vertragData.mitmieter)) throw new Error("Mitmieter*in unvollständig: " + mitmieterFehlt(vertragData.mitmieter));
  if (!wantUmv && !wantAmz) throw new Error("Keine Vertragsart ausgewählt");
  if (!b || !vertragData) throw new Error("Person oder Vertragsdaten fehlen");
  // Sonderklausel einmalig ins Englische uebersetzen und speichern (fuer die EN-Vertragsversion); keine wiederholten API-Aufrufe beim Anzeigen
  if (vertragData.sonderklausel && String(vertragData.sonderklausel).trim() && !(vertragData.sonderklausel_en && String(vertragData.sonderklausel_en).trim())) {
    try {
      const { data: _tr } = await supabase.functions.invoke("translate-clause", { body: { text: vertragData.sonderklausel } });
      if (_tr && _tr.en && String(_tr.en).trim()) vertragData = { ...vertragData, sonderklausel_en: String(_tr.en).trim() };
    } catch (_e) {}
  }
  if (!b.email) throw new Error("Person hat keine Email-Adresse");
  const fullName = `${b.vorname || ""} ${b.nachname || ""}`.trim();
  if (!fullName) throw new Error("Person hat keinen Namen");

  const stromFix = istWohnungsVertrag(vertragData) ? (+vertragData.strom || 0) : 25;
  const amzData = { ...vertragData, strom: stromFix, total: (vertragData.nettomiete||0) + (vertragData.nebenkosten||0) + stromFix };

  progress("Verträge generieren...", 0.1);
  // Neuer Ablauf: Der Vertrag geht OHNE D&T-Faksimile raus. Der Mieter
  // unterschreibt zuerst; die Gegenzeichnung durch D&T erfolgt danach separat.
  const umvHtml = wantUmv ? buildContractHTML(b, vertragData, fullName, formatDateLong) : null;
  const amzHtml = wantAmz ? buildAnfangsmietzinsHTML(b, amzData, fullName, formatDateLong) : null;

  const totalSteps = (wantUmv ? 1 : 0) + (wantAmz ? 1 : 0);
  let step = 0, umvBlob = null, amzBlob = null;
  if (wantUmv) { step++; progress(`PDF erstellen (${step}/${totalSteps}: Untermietvertrag)...`, 0.2); umvBlob = (opts.pre && opts.pre.umvBlob) || await htmlToPdf(umvHtml, `Untermietvertrag_${fullName.replace(/\s+/g,"_")}.pdf`); }
  if (wantAmz) { step++; progress(`PDF erstellen (${step}/${totalSteps}: Anfangsmietzinsformular)...`, 0.45); amzBlob = (opts.pre && opts.pre.amzBlob) || await htmlToPdf(amzHtml, `Anfangsmietzinsformular_${fullName.replace(/\s+/g,"_")}.pdf`); }

  progress("PDFs hochladen...", 0.6);
  const token = generateContractToken();
  const umvPath = `${token}/untermietvertrag.pdf`;
  const amzPath = `${token}/anfangsmietzins.pdf`;
  const unsignedPdfs = [];
  if (wantUmv) {
    const { error: e1 } = await supabase.storage.from("contracts").upload(umvPath, umvBlob, { contentType: "application/pdf", upsert: false });
    if (e1) throw new Error(`Upload UMV: ${e1.message}`);
    unsignedPdfs.push({ name: istWohnungsVertrag(vertragData) ? "Untermietvertrag Zwischennutzung" : "Untermietvertrag", path: umvPath, type: "umv" });
  }
  if (wantAmz) {
    const { error: e2 } = await supabase.storage.from("contracts").upload(amzPath, amzBlob, { contentType: "application/pdf", upsert: false });
    if (e2) throw new Error(`Upload AMZ: ${e2.message}`);
    unsignedPdfs.push({ name: "Anfangsmietzinsformular", path: amzPath, type: "amz" });
  }

  let contractType = "untermietvertrag_und_anfangsmietzins";
  if (wantUmv && !wantAmz) contractType = "untermietvertrag";
  else if (!wantUmv && wantAmz) contractType = "anfangsmietzins";

  progress("Vertrag in Datenbank speichern...", 0.8);
  const idField = opts.tenantId ? { tenant_id: opts.tenantId } : { bewerber_id: b.id };
  const { data: contractRow, error: insErr } = await supabase.from("contracts").insert({
    token, ...idField,
    apt_id: vertragData.apt?.id || null,
    room_id: vertragData.zimmerId || null,
    mieter_email: b.email,
    mieter_vorname: b.vorname || "",
    mieter_nachname: b.nachname || "",
    contract_type: contractType,
    contract_data: { bewerber: b, vertrag: vertragData, umv_html: umvHtml, amz_html: amzHtml },
    status: "gesendet",
    unsigned_pdfs: unsignedPdfs,
    created_by: (window.currentUser && window.currentUser.email) || null,
  }).select().single();
  if (insErr) throw new Error(`DB Insert: ${insErr.message}`);

  progress("Email an Mieter senden...", 0.95);
  const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-contract-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${((await supabase.auth.getSession()).data.session||{}).access_token||SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ contractId: contractRow.id }),
  });
  if (!emailRes.ok) { console.error("Email-Versand fehlgeschlagen:", await emailRes.text()); }

  progress("Fertig!", 1.0);
  return { contractId: contractRow.id, token, signUrl: `https://mieter.dthomes.ch/${token}`, emailSent: emailRes.ok };
}

// ── Verlängerung / Nachtrag ──────────────────────────────────────────────────
function buildNachtragHTML(person, nd, fullName, fmtDate){
  const _ndW = istWohnungsVertrag(nd) || !!(nd.apt && nd.apt.vermietungsart === "wohnung");
  const _ndMM = (_ndW && nd.mitmieter && String(nd.mitmieter.vorname||"").trim()) ? `${nd.mitmieter.vorname||""} ${nd.mitmieter.nachname||""}`.trim() : "";
  const _ndSW = stockwerkLang(nd.stockwerk || (nd.apt && nd.apt.stockwerk) || "");
  const _ndIm = _ndSW ? ` im ${_ndSW}` : "";
  const objekt = _ndW ? `Wohnung${_ndIm} an der ${nd.adresse}, ${nd.plz} ${nd.ort}` : (nd.zimmerId ? `Zimmer ${(nd.zimmerId||"").split("-")[1]||nd.zimmerId}${_ndIm} an der ${nd.adresse}, ${nd.plz} ${nd.ort}` : `${nd.adresse}, ${nd.plz} ${nd.ort}${_ndSW?`, ${_ndSW}`:""}`);
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Nachtrag Untermietvertrag - ${fullName}</title>
<style>
@page{size:A4;margin:18mm 18mm 22mm 18mm}
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{background:#fff}
body{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:10pt;line-height:1.55;color:#1a1a1a;padding:18mm 18mm 22mm 18mm;width:210mm;margin:0 auto}
@media print{body{padding:0;width:auto}.print-banner{display:none!important}}
.print-banner{position:fixed;top:0;left:0;right:0;background:#1a1a1a;color:#fff;padding:12px 20px;text-align:center;font-size:13px;z-index:9999;font-family:Helvetica,Arial,sans-serif;box-shadow:0 2px 12px rgba(0,0,0,.2)}
.print-banner button{background:#fff;color:#1a1a1a;border:none;padding:7px 18px;margin-left:14px;font-weight:600;border-radius:4px;cursor:pointer;font-size:13px}
.doc-header{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:12pt;border-bottom:1.5pt solid #1a1a1a;margin-bottom:18pt}
.doc-header .left{flex:1}
.doc-header .left .label{font-size:8pt;color:#888;letter-spacing:.3em;text-transform:uppercase;font-weight:500;margin-bottom:5pt}
.doc-header .left .doc-title{font-size:20pt;font-weight:300;letter-spacing:-.3pt;color:#1a1a1a}
.doc-header .logo{width:38mm;height:auto}
.doc-header .logo img{width:100%;display:block}
.section{margin-bottom:12pt;page-break-inside:avoid;break-inside:avoid}
.section h2{font-size:11pt;font-weight:700;color:#1a1a1a;margin-bottom:7pt;padding-bottom:3pt;border-bottom:.5pt solid #ddd;page-break-after:avoid;break-after:avoid}
.section p{margin-bottom:5pt;text-align:justify;hyphens:auto;-webkit-hyphens:auto;orphans:2;widows:2}
.box{background:#faf8f3;border-left:3pt solid #1a1a1a;padding:11pt 14pt;margin:14pt 0;font-size:10pt;text-align:justify;hyphens:auto;-webkit-hyphens:auto;page-break-inside:avoid;break-inside:avoid}
.signatures{margin-top:26pt;display:flex;gap:30pt;page-break-inside:avoid;break-inside:avoid}
.sig-block{flex:1;border-top:.5pt solid #1a1a1a;padding-top:6pt}
.sig-block .role{font-size:8pt;color:#888;letter-spacing:.2em;text-transform:uppercase;font-weight:600;margin-bottom:3pt}
.sig-block .name{font-size:11pt;font-weight:600;margin-bottom:18pt}
.sig-block .sig-row{display:flex;gap:14pt;margin-bottom:6pt;font-size:9pt}
.sig-block .sig-row .lbl{font-weight:600;color:#444;min-width:64pt}
.sig-block .sig-row .line{flex:none;width:150pt;border-bottom:.5pt solid #888;min-height:14pt}
</style></head>
<body>
<div class="print-banner">Vertragsentwurf bereit &middot; W&auml;hle <strong>"Als PDF speichern"</strong> im Druck-Dialog<button onclick="window.print()">&#128196; Drucken / PDF speichern</button><button onclick="window.close()" style="background:transparent;color:#fff;border:1px solid #fff">Schliessen</button></div>
<div class="doc-header"><div class="left"><div class="label">Verl&auml;ngerung &middot; D&amp;T Homes</div><div class="doc-title">Nachtrag zum Untermietvertrag</div></div><div class="logo"><img src="${DT_LOGO_DATA_URI}" alt="D&T Homes"/></div></div>
<div class="section">
<p>Zwischen der <strong>D&amp;T Partners GmbH</strong> (Hauptmieterin) und <strong>${fullName}</strong> (Untermieter*in)${_ndMM?` sowie <strong>${_ndMM}</strong> (Mitmieter*in, solidarisch haftend)`:""} betreffend das Mietobjekt ${objekt}.</p>
<p>Zwischen den Parteien besteht ein befristetes Untermietverh&auml;ltnis betreffend das genannte Mietobjekt. Mit diesem Nachtrag vereinbaren die Parteien Folgendes:</p>
</div>
<div class="section">
<h2>1. Verl&auml;ngerung</h2>
<p>Das bestehende, befristete Untermietverh&auml;ltnis wird <strong>verl&auml;ngert bis und mit ${fmtDate(nd.mietende)}</strong>.${nd.einzug?` Die Verl&auml;ngerung gilt ab dem ${fmtDate(nd.einzug)}.`:""} Das Mietverh&auml;ltnis endet an diesem Datum automatisch, ohne dass es einer K&uuml;ndigung bedarf, sofern keine weitere schriftliche Verl&auml;ngerung vereinbart wird. Eine ordentliche K&uuml;ndigung durch die Untermieter*in ist w&auml;hrend der Verl&auml;ngerungsdauer ausgeschlossen.</p>
</div>
<div class="section">
<h2>2. R&uuml;ckgabe bei Vertragsende und Verzugsfolgen</h2>
<p>Der Untermieter ist verpflichtet, das Mietobjekt sp&auml;testens am neuen Endtermin gem&auml;ss Ziffer 1 vollst&auml;ndig ger&auml;umt und ordnungsgem&auml;ss zur&uuml;ckzugeben. Ihm ist bekannt, dass die Liegenschaft nach Vertragsende dem Eigent&uuml;mer bzw. der Verwaltung zur weiteren Nutzung, insbesondere zu Umbau- oder Sanierungszwecken, zu &uuml;bergeben ist und dass eine versp&auml;tete R&uuml;ckgabe dem Hauptmieter erheblichen Schaden verursachen kann, der &uuml;ber den Wert des einzelnen Mietobjekts hinausgeht. Gibt der Untermieter das Mietobjekt nicht rechtzeitig zur&uuml;ck, schuldet er f&uuml;r jeden angefangenen Tag der versp&auml;teten R&uuml;ckgabe (a) eine Nutzungsentsch&auml;digung in H&ouml;he des anteiligen Mietzinses sowie (b) eine pauschalierte Verzugsentsch&auml;digung von CHF 300 pro Tag, zur Abgeltung des typischerweise entstehenden Aufwands und Schadens (Koordination, Ersatzunterbringung, Administration). Dem Untermieter bleibt der Nachweis offen, dass kein oder ein geringerer Schaden entstanden ist; bis zu diesem Nachweis gilt der pauschalierte Schaden als ausgewiesen. Die Geltendmachung eines weitergehenden, tats&auml;chlichen Schadens bleibt ausdr&uuml;cklich vorbehalten, insbesondere f&uuml;r Anspr&uuml;che des Eigent&uuml;mers oder der Verwaltung sowie f&uuml;r Verzugs- und Projektkosten, soweit der Untermieter die versp&auml;tete R&uuml;ckgabe zu vertreten hat. Der Hauptmieter ist berechtigt, diese Betr&auml;ge mit der Kaution und weiteren Sicherheiten zu verrechnen, und kann bei nicht rechtzeitiger R&uuml;ckgabe die Ausweisung im Verfahren des Rechtsschutzes in klaren F&auml;llen (Art. 257 ZPO) verlangen.</p>
</div>
<div class="section">
<h2>3. Baulicher Zustand und Bauvorhaben</h2>
<p>Dem Untermieter ist bekannt, dass die Liegenschaft im Hinblick auf ein geplantes Bauvorhaben des Eigent&uuml;mers (insbesondere Umbau, Sanierung oder Abbruch und Neubau) nur befristet zur Verf&uuml;gung steht und dass aufgrund der bestehenden Bausubstanz w&auml;hrend der Verl&auml;ngerungsdauer mit technischen und infrastrukturellen Beeintr&auml;chtigungen zu rechnen ist, insbesondere, jedoch nicht abschliessend, mit Ausf&auml;llen der Heizungsanlage, Wassersch&auml;den, Feuchtigkeitseintritten sowie St&ouml;rungen an sanit&auml;ren Einrichtungen und der &uuml;brigen Geb&auml;udetechnik. Der Untermieter anerkennt, dass der Hauptmieter im Hinblick auf das geplante Bauvorhaben nicht gehalten ist, &uuml;ber den vertragsgem&auml;ssen Gebrauch hinausgehende Instandstellungen oder Erneuerungen vorzunehmen; zwingende mietrechtliche Anspr&uuml;che des Untermieters bleiben vorbehalten.</p>
<p>Der Untermieter verpflichtet sich, das geplante Bauvorhaben des Eigent&uuml;mers nicht zu behindern und den vereinbarten R&uuml;ckgabetermin einzuhalten.</p>
</div>
<div class="section">
<h2>4. &Uuml;brige Bestimmungen</h2>
<p>S&auml;mtliche &uuml;brigen Bestimmungen des Untermietvertrags (insbesondere Mietzins, Nebenkosten, Kaution und Hausordnung) bleiben unver&auml;ndert in Kraft.</p>
</div>
<div class="box">Dieser Nachtrag wird mit der Unterzeichnung durch beide Parteien g&uuml;ltig und bildet einen integrierenden Bestandteil des bestehenden Untermietvertrags.</div>
<div class="signatures">
  <div class="sig-block">
    <div class="role">Untermieter*in</div>
    <div class="name">${fullName}</div>
    <div class="sig-row"><span class="lbl">Ort, Datum:</span><span class="line"></span></div>
    <div class="sig-row"><span class="lbl">Unterschrift:</span><span class="line"></span></div>
  </div>
  <div class="sig-block">
    <div class="role">Hauptmieter</div>
    <div class="name">D&amp;T Partners GmbH</div>
    <div class="sig-row"><span class="lbl">Ort, Datum:</span><span class="line"></span></div>
    <div class="sig-row"><span class="lbl">Unterschrift:</span><span class="line"></span></div>
  </div>
</div>
${_ndMM?`<div class="signatures" style="margin-top:22pt">
  <div class="sig-block">
    <div class="role">Mitmieter*in</div>
    <div class="name">${_ndMM}</div>
    <div class="sig-row"><span class="lbl">Ort, Datum:</span><span class="line"></span></div>
    <div class="sig-row"><span class="lbl">Unterschrift:</span><span class="line"></span></div>
  </div>
  <div class="sig-block" style="border-top:none"></div>
</div>`:""}
</body></html>`;
}
async function sendSingleDocForSigning(person, html, opts) {
  opts = opts || {};
  const progress = opts.onProgress || (() => {});
  const fullName = `${person.vorname || ""} ${person.nachname || ""}`.trim();
  if (!person.email) throw new Error("Person hat keine Email-Adresse");
  progress("PDF erstellen...", 0.3);
  const blob = await htmlToPdf(html, `${opts.docName||"Dokument"}_${fullName.replace(/\s+/g,"_")}.pdf`);
  progress("PDF hochladen...", 0.6);
  const token = generateContractToken();
  const path = `${token}/${opts.docType||"dokument"}.pdf`;
  const { error: upErr } = await supabase.storage.from("contracts").upload(path, blob, { contentType: "application/pdf", upsert: false });
  if (upErr) throw new Error(`Upload: ${upErr.message}`);
  const unsignedPdfs = [{ name: opts.docName || "Dokument", path, type: opts.docType || "dokument" }];
  progress("Vertrag in Datenbank speichern...", 0.8);
  const idField = opts.tenantId ? { tenant_id: opts.tenantId } : { bewerber_id: person.id };
  const { data: contractRow, error: insErr } = await supabase.from("contracts").insert({
    token, ...idField,
    apt_id: opts.aptId || null,
    room_id: opts.roomId || null,
    mieter_email: person.email,
    mieter_vorname: person.vorname || "",
    mieter_nachname: person.nachname || "",
    contract_type: opts.contractType || opts.docType || "dokument",
    contract_data: { person, doc_html: html, vertrag: opts.vertrag || null },
    status: "gesendet",
    unsigned_pdfs: unsignedPdfs,
    created_by: (window.currentUser && window.currentUser.email) || null,
  }).select().single();
  if (insErr) throw new Error(`DB Insert: ${insErr.message}`);
  progress("Email an Mieter senden...", 0.95);
  const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-contract-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${((await supabase.auth.getSession()).data.session||{}).access_token||SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ contractId: contractRow.id }),
  });
  if (!emailRes.ok) { console.error("Email-Versand fehlgeschlagen:", await emailRes.text()); }
  progress("Fertig!", 1.0);
  return { contractId: contractRow.id, token, signUrl: `https://mieter.dthomes.ch/${token}`, emailSent: emailRes.ok };
}

// ─── Gegenzeichnung: Button + Vorschau-Modal (wiederverwendbar) ─────────
// Sichtbar nur bei Status "mieter_signiert". Zeigt das final unterzeichnete
// PDF (beide Unterschriften) in einer Vorschau; erst mit Bestaetigen wird der
// Vertrag gueltig und die Bestaetigungsmail geht an den Mieter.
function HandoverConfirmButton({protocol, onDone}){
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const p = protocol;
  async function openPreview(){
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("finalize-handover", { body: { protocolId: p.id, preview: true } });
      if (error) throw error;
      if (!data || data.error || !data.pdfBase64) throw new Error((data&&data.error)||"Keine Vorschau erhalten");
      const bin = atob(data.pdfBase64); const bytes = new Uint8Array(bin.length);
      for (let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));
      setPreviewUrl(url);
    } catch(e){ console.error("handover preview:", e); alert("Vorschau fehlgeschlagen: " + (e.message||e)); }
    finally { setBusy(false); }
  }
  function closePreview(){ if(previewUrl){ try{URL.revokeObjectURL(previewUrl);}catch(_){} } setPreviewUrl(null); }
  async function confirmSend(){
    if (p.status !== "submitted") { alert("Dieses Protokoll wurde noch nicht eingereicht und kann darum nicht bestätigt werden."); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("finalize-handover", { body: { protocolId: p.id } });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);
      closePreview();
      if (onDone) await onDone();
      alert("Protokoll bestätigt. Die Bestätigung mit PDF wurde an den Mieter gesendet und im Dokumente-Ordner gespeichert.");
    } catch(e){ console.error("handover confirm:", e); alert("Bestätigen fehlgeschlagen: " + (e.message||e)); }
    finally { setBusy(false); }
  }
  return (<>
    <button onClick={openPreview} disabled={busy} style={{fontSize:10.5,padding:"4px 10px",background:"#e8efde",color:"#3a5230",border:"1px solid #c5d5b0",borderRadius:4,cursor:busy?"wait":"pointer",fontWeight:600}}>{busy&&!previewUrl?"lädt…":"👁 Vorschau & bestätigen"}</button>
    {previewUrl && (
      <div className="ov-x" onClick={()=>{ if(!busy) closePreview(); }} style={{position:"fixed",inset:0,background:"rgba(26,24,20,.45)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,zIndex:2000}}>
        <div className="modal-x" onClick={e=>e.stopPropagation()} style={{background:"var(--bg)",borderRadius:10,maxWidth:820,width:"100%",maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 10px 40px rgba(0,0,0,.3)",overflow:"hidden"}}>
          <div style={{padding:"16px 20px",borderBottom:"1px solid #e8e3d8"}}>
            <div style={{fontSize:14,color:"#3a352d",fontWeight:600}}>Übernahmeprotokoll · Vorschau</div>
            <div style={{fontSize:11.5,color:"#8a8478",marginTop:3,lineHeight:1.5}}>Fertiges Protokoll mit beiden Unterschriften. Mit Bestätigen geht die Bestätigung samt PDF an den Mieter und wird im Dokumente-Ordner gespeichert.</div>
          </div>
          <div style={{flex:1,overflow:"auto",padding:16,background:"#efe9dd",minHeight:0}}>
            {(typeof window!=="undefined" && window.innerWidth < 640)
              ? <button onClick={()=>window.open(previewUrl,"_blank")} style={{width:"100%",padding:"22px 16px",background:"#fff",border:"1px solid #d8d0c0",borderRadius:6,cursor:"pointer",fontSize:13,color:"#3a5230",fontWeight:600}}>📄 PDF öffnen</button>
              : <iframe src={previewUrl} title="Vorschau" style={{width:"100%",height:"60vh",border:"1px solid #d8d0c0",borderRadius:6,background:"#fff"}}/>}
          </div>
          <div style={{padding:"12px 20px",borderTop:"1px solid #e8e3d8",display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={closePreview} disabled={busy} style={{fontSize:12,padding:"8px 16px",background:"#f0ebe1",color:"#4a4439",border:"1px solid #d8d0c0",borderRadius:6,cursor:"pointer"}}>Abbrechen</button>
            <button onClick={confirmSend} disabled={busy} style={{fontSize:12,padding:"8px 16px",background:"#3a5230",color:"#fff",border:"1px solid #2e4426",borderRadius:6,cursor:busy?"wait":"pointer",fontWeight:600}}>{busy?"sende…":"✓ Bestätigen & senden"}</button>
          </div>
        </div>
      </div>
    )}
  </>);
}
function CountersignButton({contract, onDone, onSigned, light}){
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [dok, setDok] = useState(null);
  const c = contract;
  useEffect(() => { if (c && c.status === "mieter_signiert") ladeDok(); }, [c && c.id, c && c.status]);
  if (!c || c.status !== "mieter_signiert") return null;

  // Dokumentstatus (Chips neben dem Button und in der Vorschau). Gleiche Regel wie supabase/functions/_shared/dokumente.ts:
  // Wohnung: Betreibungsauszug + Pass/Ausweis. Zimmer: Pass/Ausweis, Betreibungsauszug nur bei Kautionsreduktion.
  async function ladeDok(){
    try {
      if (["verlaengerung","nachtrag","parkplatz"].includes(c.contractType)) return;
      const apt = (((window.__IB_DATA||{}).apts)||[]).find(a => a.id === c.aptId);
      const ent = c.tenantId ? ["tenant", String(c.tenantId)] : (c.bewerberId ? ["applicant", String(c.bewerberId)] : null);
      if (!ent) return;
      const { data: cd } = await supabase.from("contracts").select("vertragsart:contract_data->>vertragsart, km:contract_data->vertrag->>kautionMonate, auf:contract_data->vertrag->>aufschlag").eq("id", c.id).maybeSingle();
      const wohnung = (cd && cd.vertragsart === "wohnung") || (apt && apt.vermietungsart === "wohnung");
      const km = (!cd || cd.km == null || cd.km === "") ? 3 : +cd.km;
      const braucht = wohnung ? ["Betreibungsregister-Auszug","Pass / Ausweis"]
        : ((km < 3 || (+(cd && cd.auf) || 0) > 0) ? ["Pass / Ausweis","Betreibungsregister-Auszug"] : ["Pass / Ausweis"]);
      const { data: docs } = await supabase.from("documents").select("category").eq("entity_type", ent[0]).eq("entity_id", ent[1]).in("category", braucht);
      setDok(braucht.map(n => [n, (docs||[]).some(d => d.category === n)]));
    } catch (_) {}
  }

  async function openPreview(){
    setBusy(true);
    ladeDok();
    try {
      const { data, error } = await supabase.functions.invoke("countersign-contract", { body: { token: c.token, preview: true } });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);
      if (!data || !Array.isArray(data.pdfs)) throw new Error("Keine Vorschau erhalten");
      const urls = data.pdfs.map(p => {
        const bin = atob(p.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
        const blob = new Blob([bytes], {type:"application/pdf"});
        return { name: p.name, url: URL.createObjectURL(blob) };
      });
      setPreview({urls});
      setActiveIdx(0);
    } catch(e){
      console.error("countersign preview:", e);
      toast("Vorschau fehlgeschlagen", "error");
    } finally { setBusy(false); }
  }

  function closePreview(){
    if (preview) preview.urls.forEach(u => { try { URL.revokeObjectURL(u.url); } catch(_){} });
    setPreview(null);
  }

  async function confirmSend(){
    setBusy(true);
    try {
      // Offene Vertraege anderer Personen fuer dasselbe Zimmer zieht die Datenbank beim Gegenzeichnen zurueck
      const andere = (c.roomId && !["verlaengerung","nachtrag"].includes(c.contractType))
        ? (((window.__IB_DATA||{}).contracts)||[]).filter(x => x.id !== c.id && x.roomId === c.roomId && (x.bewerberId||"") !== (c.bewerberId||"")
            && ["gesendet","geoeffnet","geoeffnet_ungelesen","mieter_signiert"].includes(x.status) && !["verlaengerung","nachtrag"].includes(x.contractType))
        : [];
      const { data, error } = await supabase.functions.invoke("countersign-contract", { body: { token: c.token } });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);
      closePreview();
      if (onDone) await onDone();
      try { window.__ibDokNeu && await window.__ibDokNeu(); } catch (_) {}
      const zusatz = andere.length ? `\n\n${andere.length === 1 ? "Der offene Vertrag" : "Die " + andere.length + " offenen Verträge"} für ${c.roomId} wurde${andere.length === 1 ? "" : "n"} automatisch zurückgezogen: ${andere.map(x => `${x.mieterVorname||""} ${x.mieterNachname||""}`.trim()).join(", ")}.` : "";
      if (data && data.mail_error) alert("Vertrag gegengezeichnet.\n\nAchtung: " + data.mail_error + " Bitte dem Mieter den Vertrag manuell senden." + zusatz);
      else alert("Vertrag gegengezeichnet. Die Bestätigung wurde an den Mieter gesendet." + zusatz);
      if (onSigned) onSigned(contract && contract.roomId);
      else if (c.bewerberId && !["verlaengerung","nachtrag"].includes(c.contractType) && window.__ibNavigate) window.__ibNavigate("bewerber", { zuteilen: c.bewerberId, roomId: c.roomId });
    } catch(e){
      console.error("countersign confirm:", e);
      toast("Gegenzeichnung fehlgeschlagen", "error");
    } finally { setBusy(false); }
  }

  return (<>
    {dok && dok.length > 0 && (
      <span title={dok.map(([n,ok])=>n+": "+(ok?"vorhanden":"fehlt noch")).join("\n")} style={{display:"inline-flex",gap:4,flexShrink:0,alignItems:"center"}}>
        {dok.map(([n,ok])=>(
          <span key={n} style={{fontSize:9.5,fontWeight:600,padding:"2px 7px",borderRadius:99,whiteSpace:"nowrap",background:ok?"#e6eedc":"#f6e3df",color:ok?"#3a5230":"#9b4a3e",border:"1px solid "+(ok?"#c9d8b8":"#e8c5bd")}}>{ok?"✓":"✗"} {n==="Pass / Ausweis"?"ID":"Betreibung"}</span>
        ))}
      </span>
    )}
    <button onClick={openPreview} disabled={busy} style={{fontSize:10.5,padding:"4px 10px",background:light?"#fefcf7":"#2c4a6e",color:light?"#2c4a6e":"#fefcf7",border:light?"1px solid #fefcf7":"1px solid #24405f",borderRadius:4,cursor:busy?"wait":"pointer",fontWeight:600,flexShrink:0}}>
      {busy && !preview ? "lädt…" : "✍ Gegenzeichnen"}
    </button>
    {preview && (
      <div className="ov-x" onClick={()=>{ if(!busy) closePreview(); }} style={{position:"fixed",inset:0,background:"rgba(26,24,20,.45)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,zIndex:2000}}>
        <div className="modal-x" onClick={e=>e.stopPropagation()} style={{background:"var(--bg)",borderRadius:10,maxWidth:820,width:"100%",maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 10px 40px rgba(0,0,0,.3)",overflow:"hidden"}}>
          <div style={{padding:"16px 20px",borderBottom:"1px solid #e8e3d8"}}>
            <div style={{fontSize:14,color:"#3a352d",fontWeight:600}}>Gegenzeichnung · Vorschau</div>
            <div style={{fontSize:11.5,color:"#8a8478",marginTop:3,lineHeight:1.5}}>Final unterzeichnetes Dokument mit beiden Unterschriften. Mit Bestaetigen wird der Vertrag gültig und die Bestaetigung geht an den Mieter.</div>
            {dok && dok.length > 0 && (
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
                {dok.map(([n,ok])=>(
                  <span key={n} style={{fontSize:11.5,fontWeight:600,padding:"4px 10px",borderRadius:99,background:ok?"#e6eedc":"#f6e3df",color:ok?"#3a5230":"#9b4a3e",border:"1px solid "+(ok?"#c9d8b8":"#e8c5bd")}}>{ok?"✓ ":"✗ "}{n} {ok?"vorhanden":"fehlt noch"}</span>
                ))}
              </div>
            )}
          </div>
          <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",background:"#efe9dd"}}>
            {(typeof window!=="undefined" && window.innerWidth < 640) ? (
              <div style={{flex:1,overflow:"auto",padding:16,display:"flex",flexDirection:"column",gap:14}}>
                {preview.urls.map((u,i)=>(
                  <button key={i} onClick={()=>window.open(u.url,"_blank")} style={{width:"100%",padding:"22px 16px",background:"#fff",border:"1px solid #d8d0c0",borderRadius:6,cursor:"pointer",fontSize:13,color:"#2c4a6e",fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>📄 {u.name} als PDF öffnen</button>
                ))}
              </div>
            ) : (
              <>
                {preview.urls.length > 1 && (
                  <div style={{display:"flex",gap:6,padding:"12px 16px 0",flexWrap:"wrap",flexShrink:0}}>
                    {preview.urls.map((u,i)=>(
                      <button key={i} onClick={()=>setActiveIdx(i)} style={{fontSize:11.5,padding:"7px 14px",borderRadius:6,cursor:"pointer",fontWeight:600,border:"1px solid",borderColor:activeIdx===i?"#2c4a6e":"#d8d0c0",background:activeIdx===i?"#2c4a6e":"#fefcf7",color:activeIdx===i?"#fefcf7":"#4a4439"}}>{u.name}</button>
                    ))}
                  </div>
                )}
                {(()=>{
                  const u = preview.urls[Math.min(activeIdx, preview.urls.length-1)];
                  if (!u) return null;
                  return (
                    <div style={{flex:1,overflow:"auto",padding:16,display:"flex",flexDirection:"column",gap:8,minHeight:0}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap",flexShrink:0}}>
                        <div style={{fontSize:10.5,color:"#8a8478",fontWeight:600}}>{u.name}</div>
                        <button onClick={()=>window.open(u.url,"_blank")} style={{fontSize:10.5,padding:"4px 10px",background:"#f0ebe1",color:"#4a4439",border:"1px solid #d8d0c0",borderRadius:4,cursor:"pointer",flexShrink:0}}>↗ In neuem Tab öffnen</button>
                      </div>
                      <iframe src={u.url} title={u.name} style={{width:"100%",flex:1,minHeight:420,border:"1px solid #d8d0c0",borderRadius:6,background:"#fff"}}/>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
          <div style={{padding:"14px 20px",borderTop:"1px solid #e8e3d8",display:"flex",justifyContent:"flex-end",gap:8}}>
            <button onClick={()=>!busy&&closePreview()} disabled={busy} style={{fontSize:12,padding:"8px 16px",background:"#f0ebe1",color:"#4a4439",border:"1px solid #d8d0c0",borderRadius:5,cursor:busy?"wait":"pointer"}}>Abbrechen</button>
            <button onClick={confirmSend} disabled={busy} style={{fontSize:12,padding:"8px 18px",background:"#3a5230",color:"#fefcf7",border:"1px solid #2f4527",borderRadius:5,cursor:busy?"wait":"pointer",fontWeight:600}}>{busy?"Wird gesendet…":"Bestaetigen und senden"}</button>
          </div>
        </div>
      </div>
    )}
  </>);
}

function BewerberUebersicht({bewerber, apts, rooms, tenants, contracts, onWohnung, onSelectBewerber, withdrawContract, updateBewerber}){
  const [waTpl, setWaTpl] = useState(null);
  const [meName, setMeName] = useState("");
  useEffect(()=>{ resolveMeName().then(setMeName); },[]);
  useEffect(()=>{
    supabase.from("message_templates").select("*").eq("aktiv",true).order("sortierung")
      .then(({data})=>{ const tpls=(data||[]).filter(v=>(v.zielgruppe==="bewerber"||v.zielgruppe==="beide")&&!v.nur_wg); if(tpls[0]) setWaTpl(tpls[0]); })
      .catch(()=>{});
  },[]);
  function waShortcut(b, e){
    if(e) e.stopPropagation();
    const cleanPhone = String(b.phone||"").replace(/\D/g,"");
    if(!cleanPhone){ alert("Für diesen Bewerber ist keine Telefonnummer hinterlegt."); return; }
    const roomObj = (rooms||[]).find(r=>r.id===b.zimmerWunsch);
    const aptObj = roomObj ? (apts||[]).find(a=>a.id===roomObj.aptId) : null;
    const empf = { ...b,
      adresse: [aptObj&&aptObj.adresse, [aptObj&&aptObj.plz, aptObj&&aptObj.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      zimmer: (roomObj&&roomObj.id)||"",
      zimmerpreis: (roomObj&&roomObj.miete) ? ("CHF "+(+roomObj.miete).toLocaleString('de-CH')) : "",
      absender: meName || (b.owner&&String(b.owner).trim()) || "Daan",
    };
    const tplText = waTpl ? vorlageTexte(waTpl, b.sprache, aptIstWohnung(aptObj)).inhalt : "";
    const text = tplText ? platzhalterFuellen(tplText, empf) : "";
    window.open("https://wa.me/"+cleanPhone+"?text="+encodeURIComponent(text), "_blank");
    if(meName && !(b.owner&&String(b.owner).trim()) && updateBewerber){ updateBewerber(b.id,{owner:meName}); }
  }
  const aktiv = ["Neu","In Prüfung","Bestätigt","Zugeteilt"];
  const isFrei = (r)=> !r.occupied && !r.tenantId;
  const tenantKeys = new Set();
  (tenants||[]).forEach(t=>{ if(t.email) tenantKeys.add("e:"+String(t.email).toLowerCase()); if(t.bewerberId) tenantKeys.add("b:"+t.bewerberId); });
  const istMieter = (b)=> (b.email && tenantKeys.has("e:"+String(b.email).toLowerCase())) || tenantKeys.has("b:"+b.id);
  const wohnungen = (apts||[])
    .filter(a=> (a.type||"")!=="Airbnb" && !a.pipeline)
    .map(a=>({a, freieRms:(rooms||[]).filter(r=>r.aptId===a.id && isFrei(r)).sort((x,y)=>natSort(x.id,y.id)), alleRms:(rooms||[]).filter(r=>r.aptId===a.id)}))
    .filter(x=> x.freieRms.length>0)
    .sort((x,y)=>natSort(x.a.id,y.a.id));
  const badge = (bg,c,txt)=><span style={{fontSize:9,padding:"1px 7px",borderRadius:99,background:bg,color:c,whiteSpace:"nowrap"}}>{txt}</span>;
  const nameOf = (b)=> `${b.vorname||""} ${b.nachname||""}`.trim() || "Ohne Name";

  const nachfolgeVon = (b)=>{ const t=(tenants||[]).find(x=>x.nachfolge_token && x.nachfolge_token===b.nachfolge_token); return t?`${t.vorname} ${t.nachname}`.trim():"unbekannt"; };
  const BewRow = ({b, context})=>{
    const cs = (contracts||[]).filter(c=>c.bewerberId===b.id && !["zurueckgezogen","abgelaufen","withdrawn","expired","storniert"].includes(c.status));
    const signed = cs.some(c=>c.status==="signiert");
    return (
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6,padding:"3px 0",fontSize:11}}>
        <span onClick={(e)=>{e.stopPropagation(); onSelectBewerber&&onSelectBewerber(b.id);}} style={{color:"var(--ink)",cursor:"pointer",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}><span style={{textDecoration:"underline",textDecorationColor:"var(--line)"}}>{nameOf(b)}</span>{context?<span style={{color:"var(--muted)",fontSize:10}}> · {context}</span>:null}</span>
        <span style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
          <button onClick={(e)=>waShortcut(b,e)} title="Erste WhatsApp-Nachricht senden" style={{border:"none",background:"none",cursor:"pointer",fontSize:13,padding:"0 2px",lineHeight:1}}>💬</button>
          {b.nachfolge_token && <span title={`Nachfolge von ${nachfolgeVon(b)}`} style={{fontSize:9,fontWeight:600,padding:"1px 5px",borderRadius:3,background:"#ece6f6",color:"#5a3e8a",whiteSpace:"nowrap"}}>↻ Nachfolge</span>}
          {b.sprache==="en" && <span title="Bewirbt sich auf Englisch" style={{fontSize:9,fontWeight:600,padding:"1px 5px",borderRadius:3,background:"#e6eef6",color:"#2c4a6e"}}>EN</span>}
          {b.owner && <span style={{fontSize:9,fontWeight:600,padding:"1px 6px",borderRadius:3,background:b.owner==="Daan"?"#e0e8f0":"#f0e6dc",color:b.owner==="Daan"?"#3a4d66":"#7a5c3c",letterSpacing:".05em",whiteSpace:"nowrap"}}>👤 {b.owner}</span>}
          {cs.length===0 ? badge("#f0ece3","#8a8478","kein Vertrag") : (signed ? badge("#e8efde","#3a5230","✓ signiert") : badge("#fdf2e0","#7a5c3c","📄 Vertrag ausgestellt"))}
        </span>
      </div>
    );
  };

  const aktivBew = (bewerber||[]).filter(b=>aktiv.includes(b.status) && !istMieter(b));
  const shownAptIds = new Set(wohnungen.map(x=>x.a.id));
  const shownRoomIds = new Set(); wohnungen.forEach(x=>x.alleRms.forEach(r=>shownRoomIds.add(r.id)));
  const orphans = aktivBew.filter(b=> !shownAptIds.has(b.aptId) && !shownRoomIds.has(b.zimmerWunsch));
  const roomCtx = (b)=>{
    if (!b.zimmerWunsch) return "ohne Zimmerwunsch";
    const rm = (rooms||[]).find(r=>r.id===b.zimmerWunsch);
    return rm && rm.miete ? `CHF ${(+rm.miete).toLocaleString('de-CH')}` : "Preis unbekannt";
  };
  const orphanByApt = {};
  orphans.forEach(b=>{
    const apt=(apts||[]).find(a=>a.id===b.aptId) || (apts||[]).find(a=>(rooms||[]).some(r=>r.id===b.zimmerWunsch && r.aptId===a.id));
    const addr = apt ? (apt.adresse||apt.id) : "Unbekannte Wohnung";
    const key = String(addr).trim().toLowerCase();
    if(!orphanByApt[key]) orphanByApt[key] = { addr: String(addr).trim(), list:[] };
    orphanByApt[key].list.push(b);
  });
  const orphanGroups = Object.values(orphanByApt).sort((a,b)=> (a.addr>b.addr?1:a.addr<b.addr?-1:0));
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(min(340px,100%),1fr))",gap:14}}>
        {wohnungen.length===0 && orphans.length===0 && <div style={{color:"#8a8478",fontSize:12}}>Keine offenen Bewerbungen.</div>}
      {wohnungen.map(({a,freieRms,alleRms})=>{
        const roomIds = alleRms.map(r=>r.id);
        const freiIds = freieRms.map(r=>r.id);
        const aptBew = (bewerber||[]).filter(b=>aktiv.includes(b.status) && !istMieter(b) && (b.aptId===a.id || roomIds.includes(b.zimmerWunsch)));
        const wunschBelegt = aptBew.filter(b=> b.zimmerWunsch && !freiIds.includes(b.zimmerWunsch));
        const flexibel = aptBew.filter(b=> !b.zimmerWunsch);
        return (
          <div key={a.id} className="card" style={{margin:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,cursor:"pointer"}} onClick={()=>onWohnung&&onWohnung(a.id)}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:13.5,fontWeight:600,color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.adresse||a.id}</div>
                <div style={{fontSize:10.5,color:"var(--muted)"}}>{a.type||"WG"} · {freieRms.length} von {alleRms.length} Zimmern frei</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:20,fontWeight:700,color:aptBew.length>0?"var(--ink)":"#a06a2c",lineHeight:1}}>{aptBew.length}</div>
                <div style={{fontSize:9,color:"var(--muted)"}}>Bewerbungen</div>
              </div>
            </div>
            <div style={{marginTop:10}}>
              {freieRms.map(r=>{
                const roomBew = (bewerber||[]).filter(b=>aktiv.includes(b.status) && !istMieter(b) && b.zimmerWunsch===r.id);
                return (
                  <div key={r.id} style={{borderTop:"1px solid var(--line)",paddingTop:7,marginTop:7}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,fontSize:11.5,marginBottom:roomBew.length?4:0}}>
                      <span style={{color:"var(--ink)",fontWeight:600}}>Zimmer {r.id.split("-")[1]||r.id}{r.miete?` · CHF ${(+r.miete).toLocaleString('de-CH')}`:""}</span>
                      <span style={{color:roomBew.length>0?"var(--muted)":"#a06a2c",fontSize:10}}>{roomBew.length} Bew.</span>
                    </div>
                    {roomBew.map(b=><BewRow key={b.id} b={b}/>)}
                    {roomBew.length===0 && <div style={{fontSize:10,color:"#a06a2c"}}>Noch keine Bewerber</div>}
                  </div>
                );
              })}
              {wunschBelegt.length>0 && (
                <div style={{borderTop:"1px solid var(--line)",paddingTop:7,marginTop:7}}>
                  <div style={{fontSize:10,color:"#7a5c3c",marginBottom:4,textTransform:"uppercase",letterSpacing:".12em"}}>Wunschzimmer belegt · anderes Zimmer anbieten</div>
                  {wunschBelegt.map(b=><BewRow key={b.id} b={b}/>)}
                </div>
              )}
              {flexibel.length>0 && (
                <div style={{borderTop:"1px solid var(--line)",paddingTop:7,marginTop:7}}>
                  <div style={{fontSize:10,color:"var(--muted)",marginBottom:4,textTransform:"uppercase",letterSpacing:".12em"}}>Flexibel · ohne Zimmerwunsch</div>
                  {flexibel.map(b=><BewRow key={b.id} b={b}/>)}
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>
      {orphans.length>0 && (
        <div className="card" style={{marginTop:14}}>
          <div style={{fontSize:10,color:"#7a5c3c",marginBottom:8,textTransform:"uppercase",letterSpacing:".12em"}}>Bewerber ohne aktuell verfügbares Zimmer · anderes Zimmer anbieten ({orphans.length})</div>
          {orphanGroups.map((g,i)=>(
            <div key={i} style={{marginTop:i?10:0,borderTop:i?"1px solid var(--line)":"none",paddingTop:i?8:0}}>
              <div style={{fontSize:11.5,fontWeight:600,color:"var(--ink)",marginBottom:3}}>{g.addr}</div>
              {g.list.map(b=><BewRow key={b.id} b={b} context={roomCtx(b)}/>)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Bewerber({bewerber,rooms,tenants,apts,updateBewerber,deleteBewerber,updateRoom,insertTenant,navTarget,documents,uploadDocument,getDocumentUrl,deleteDocument,migrateDocumentsToTenant,contracts,withdrawContract,deleteContract,loadContracts}){
  const [sel,setSel]=useState(null);
  const [tab,setTab]=useState("info");
  const [zuteilModal,setZuteilModal]=useState(false);
  const [selZimmer,setSelZimmer]=useState(null);
  const [einzugDate,setEinzugDate]=useState("");
  const [filterStatus,setFilterStatus]=useState("Neu");
  const [listMode,setListMode]=useState("bewerber");
  const [bewSort,setBewSort]=useState("neu");
  const [bewSearch,setBewSearch]=useState("");
  const [ansicht,setAnsicht]=useState("liste");
  const touchX=useRef(null);
  const detailRef = useRef(null);
  useEffect(()=>{
    if (sel && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [sel]);
  const [nachmieterFor,setNachmieterFor]=useState(null); // wenn aus Dashboard "Nachmieter zuteilen" geklickt
  const [copied,setCopied]=useState(false);
  const [vertragModal,setVertragModal]=useState(false);
  const [vorschauB,setVorschauB]=useState(null);
  const [editModal,setEditModal]=useState(false);
  const [waTplB, setWaTplB] = useState(null);
  const [meNameB, setMeNameB] = useState("");
  useEffect(()=>{ resolveMeName().then(setMeNameB); },[]);
  useEffect(()=>{
    supabase.from("message_templates").select("*").eq("aktiv",true).order("sortierung")
      .then(({data})=>{ const tpls=(data||[]).filter(v=>(v.zielgruppe==="bewerber"||v.zielgruppe==="beide")&&!v.nur_wg); if(tpls[0]) setWaTplB(tpls[0]); })
      .catch(()=>{});
  },[]);
  function waShortcutB(bb, e){
    if(e) e.stopPropagation();
    const cleanPhone = String(bb.phone||"").replace(/\D/g,"");
    if(!cleanPhone){ alert("Für diesen Bewerber ist keine Telefonnummer hinterlegt."); return; }
    const roomObj = (rooms||[]).find(r=>r.id===bb.zimmerWunsch);
    const aptObj = roomObj ? (apts||[]).find(a=>a.id===roomObj.aptId) : null;
    const empf = { ...bb,
      adresse: [aptObj&&aptObj.adresse, [aptObj&&aptObj.plz, aptObj&&aptObj.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      zimmer: (roomObj&&roomObj.id)||"",
      zimmerpreis: (roomObj&&roomObj.miete) ? ("CHF "+(+roomObj.miete).toLocaleString('de-CH')) : "",
      absender: meNameB || (bb.owner&&String(bb.owner).trim()) || "Daan",
    };
    const tplText = waTplB ? vorlageTexte(waTplB, bb.sprache, aptIstWohnung(aptObj)).inhalt : "";
    const text = tplText ? platzhalterFuellen(tplText, empf) : "";
    window.open("https://wa.me/"+cleanPhone+"?text="+encodeURIComponent(text), "_blank");
    if(meNameB && !(bb.owner&&String(bb.owner).trim())){ updateBewerber(bb.id,{owner:meNameB}); }
  }
  const [editForm,setEditForm]=useState({});
  const [vertragData,setVertragData]=useState(null);
  const [emailMenu,setEmailMenu]=useState(false);
  const [sending,setSending]=useState(false);
  const [sendProgress,setSendProgress]=useState({message:"",pct:0});
  const [sendResult,setSendResult]=useState(null); // {signUrl, emailSent, error}

  // Wenn vom Dashboard "Nachmieter zuteilen" aufgerufen wurde
  useEffect(() => {
    if (navTarget && navTarget.type === "bewerber" && navTarget.id && typeof navTarget.id === "object" && navTarget.id.nachmieterFor) {
      setNachmieterFor(navTarget.id.nachmieterFor);
      setFilterStatus("Neu"); // sicher dass wir auf "Neu" Tab sind
      setSel(null);
    } else if (navTarget && navTarget.type === "bewerber" && navTarget.id && typeof navTarget.id === "object" && navTarget.id.zuteilen) {
      // Nach der Gegenzeichnung: Bewerber oeffnen und Zimmerzuteilung mit Zimmer und Einzug vorbelegt anzeigen
      const bz = bewerber.find(x => x.id === navTarget.id.zuteilen);
      if (bz && bz.status !== "Zugeteilt") {
        setSel(bz.id);
        const rid = navTarget.id.roomId || bz.zimmerWunsch || null;
        if (rid) setSelZimmer(rid);
        if (bz.einzug) { const _d = _pdZ(bz.einzug); if (_d) setEinzugDate(_d.getFullYear()+"-"+String(_d.getMonth()+1).padStart(2,"0")+"-"+String(_d.getDate()).padStart(2,"0")); }
        setZuteilModal(true);
      } else if (bz) { setSel(bz.id); }
    } else if (navTarget && navTarget.type === "bewerber" && typeof navTarget.id === "string") {
      // Single bewerber selection
      setSel(navTarget.id);
    }
  }, [navTarget]);

  // Bewerbungen laufen ueber die Webseite (WG-Zimmer), nicht mehr ueber bewerbung.dthomes.ch
  const formLink = "https://www.dthomes.ch/zimmer";

  const b=bewerber.find(x=>x.id===sel);
  const freeRooms=rooms.filter(r=>!r.occupied);
  const _pdZ=(s)=>{ if(!s) return null; const t=String(s).trim(); if(/^\d{4}-\d{2}-\d{2}/.test(t)){const d=new Date(t);return isNaN(d.getTime())?null:d;} const m=t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); if(m){const d=new Date(+m[3],+m[2]-1,+m[1]);return isNaN(d.getTime())?null:d;} const d=new Date(t);return isNaN(d.getTime())?null:d; };
  const _heuteZ=new Date(); _heuteZ.setHours(0,0,0,0);
  const nachRooms=rooms.filter(r=>{
    if(!r.occupied) return false;
    const tn=r.tenantId?tenants.find(x=>x.id===r.tenantId):null;
    const apt=apts.find(a=>a.id===r.aptId);
    const aus=_pdZ(tn&&tn.auszug)||_pdZ(r.mieter_auszug);
    const ende=_pdZ(apt&&apt.mietende);
    if(!aus) return false;               // kein Auszug bekannt -> keine Nachvermietung
    if(ende&&aus>=ende) return false;    // Auszug = Wohnungsende -> Wohnung faellt weg
    return true;                          // Mieter zieht vor Wohnungsende aus
  });
  // Filter: Status + ggf. Wohnungs-Match wenn Nachmieter gesucht wird
  const wgLeadCount=bewerber.filter(x=>x.quelle==="wgzimmer").length;
  let shown = listMode==="leads" ? bewerber.filter(x=>x.quelle==="wgzimmer") : bewerber.filter(x=>(x.quelle!=="wgzimmer") && x.status===filterStatus);
  if (nachmieterFor) {
    // Bewerber die das Ziel-Zimmer als Wunsch haben oder keine Präferenz
    const targetRoom = rooms.find(r => r.id === nachmieterFor);
    const targetApt = targetRoom ? apts.find(a => a.id === targetRoom.aptId) : null;
    const aptRoomIds = targetApt ? rooms.filter(r => r.aptId === targetApt.id).map(r => r.id) : [];
    shown = shown.filter(x => {
      // Match: kein Wunsch, oder Wunsch = Ziel-Zimmer, oder Wunsch = anderes Zimmer in selber Wohnung
      if (!x.zimmerWunsch) return true;
      if (x.zimmerWunsch === nachmieterFor) return true;
      if (aptRoomIds.includes(x.zimmerWunsch)) return true;
      return false;
    });
  }
  if (filterStatus === "Neu") {
    const recency = (x) => {
      if (x.created_at) { const t = new Date(x.created_at).getTime(); if (!isNaN(t)) return t; }
      const m = String(x.id||"").match(/^B(\d+)$/); if (m) return parseInt(m[1],10);
      return 0;
    };
    shown = shown.slice().sort((a,b)=>{
      if (bewSort === "monat") {
        const da = a.einzug ? new Date(a.einzug).getTime() : Infinity;
        const db = b.einzug ? new Date(b.einzug).getTime() : Infinity;
        if (da !== db) return da - db;
        return recency(b) - recency(a);
      }
      return recency(b) - recency(a);
    });
  }
  if (bewSearch.trim()) {
    const q = bewSearch.trim().toLowerCase();
    shown = shown.filter(x => `${x.vorname||""} ${x.nachname||""}`.toLowerCase().includes(q));
  }

  async function setStatus(id,status){
    // Bei Ablehnung werden offene Vertraege automatisch zurueckgezogen (Datenbank-Trigger)
    const offen = status === "Abgelehnt" ? (contracts||[]).filter(c => c.bewerberId === id && ["gesendet","geoeffnet","mieter_signiert"].includes(c.status)) : [];
    if (offen.length && !confirm(offen.length === 1
        ? "Dieser Bewerber hat einen offenen Vertrag. Er wird beim Ablehnen automatisch zurückgezogen und der Link wird ungültig.\n\nAblehnen?"
        : offen.length + " offene Verträge werden beim Ablehnen automatisch zurückgezogen und die Links werden ungültig.\n\nAblehnen?")) return;
    await updateBewerber(id,{status});
    if (offen.length) { try { await loadContracts(); } catch(e){} toast(offen.length === 1 ? "Abgelehnt · Vertrag zurückgezogen" : "Abgelehnt · " + offen.length + " Verträge zurückgezogen"); }
    if (status === "Abgelehnt") {
      setSel(null); // bei Ablehnung auf aktueller Liste bleiben, nicht zu Abgelehnt springen
    } else {
      setFilterStatus(status);  // Auto-switch filter so user sees the result
    }
  }

  async function confirmZuteilung(){
    if(!selZimmer||!b)return;
    const room=rooms.find(r=>r.id===selZimmer);
    const istNachmieter = !!(room && room.occupied);
    if (istNachmieter) {
      // Belegtes Zimmer: Bewerber wird als zukuenftiger Mieter angelegt, ohne den aktuellen Mieter zu ueberschreiben.
      const tn = room.tenantId ? tenants.find(x=>x.id===room.tenantId) : null;
      const ausT = _pdZ(tn && tn.auszug) || _pdZ(room.mieter_auszug);
      const einT = einzugDate ? _pdZ(einzugDate) : null;
      if (!einzugDate) { if(!confirm("Kein Einzugsdatum gesetzt. Der zukünftige Mieter wird ohne Einzugsdatum angelegt. Trotzdem fortfahren?")) return; }
      if (ausT && einT && einT <= ausT) {
        if (!confirm(`Das Einzugsdatum (${einT.toLocaleDateString("de-CH")}) liegt nicht nach dem Auszug des aktuellen Mieters (${ausT.toLocaleDateString("de-CH")}). Trotzdem anlegen?`)) return;
      }
    }
    // Kautionsvariante und Servicegebühr aus dem Bewerber ableiten (gleiche Logik wie im
    // Vertrag), damit Mieter und Vertrag uebereinstimmen und nichts manuell nachgetragen
    // werden muss.
    let zutKautionMonate = 3, zutKautionAufschlag = 0;
    if (b.kautionOpt === "0x" || b.kautionAufschlag === 150 || (b.kautionType||"").toLowerCase().includes("keine")) {
      zutKautionMonate = 0; zutKautionAufschlag = 150;
    } else if (b.kautionOpt === "1x" || b.kautionAufschlag === 100 || (b.kautionType||"").startsWith("1")) {
      zutKautionMonate = 1; zutKautionAufschlag = 100;
    } else if (b.kautionOpt === "2x" || b.kautionAufschlag === 50 || (b.kautionType||"").startsWith("2")) {
      zutKautionMonate = 2; zutKautionAufschlag = 50;
    } else {
      zutKautionMonate = 3; zutKautionAufschlag = 0;
    }
    const zutKautionBetrag = (Number(room?.miete||0) + 25) * zutKautionMonate;
    // Sequenzielle ID: T01, T02, ... (nicht random!)
    // Finde höchste existierende T-Nummer und nehme +1 (auch wenn alte IDs gelöscht wurden)
    let n = 1;
    tenants.forEach(t => {
      const m = String(t.id||"").match(/^T(\d+)$/);
      if (m) n = Math.max(n, parseInt(m[1],10) + 1);
    });
    const newId=`T${String(n).padStart(2,"0")}`;
    const newTenant={
      id:newId,
      vorname:b.vorname,nachname:b.nachname,
      email:b.email,phone:b.phone,
      geburt: fmtDateDE(b.geburt),
      gender:b.gender||"",nat:b.nat||"",land:b.land||"",
      zivilstand:b.zivilstand||"",
      adresse:b.adresse||"",plz:b.plz||"",ort:b.ort||"",
      type:b.type==="AOZ / Sozialhilfe"?"AOZ":b.type||"",
      job:b.job||"",arbeitgeber:b.arbeitgeber||"",einkommen:b.einkommen||"",
      kautionArt:b.kautionType||"",
      kautionType:b.kautionType||"",
      kautionOpt:`${zutKautionMonate}x`,
      kautionMonate:zutKautionMonate,
      kautionAufschlag:zutKautionAufschlag,
      kautionBetrag:zutKautionBetrag,
      moeblierungPauschale:(b.moeblierungPauschale===""||b.moeblierungPauschale==null)?null:b.moeblierungPauschale,
      deposit:false,
      schluessel:false,furnished:b.moebliert==="ja",moebliert:b.moebliert==="ja",betreibung:false,
      einzug:einzugDate?new Date(einzugDate).toLocaleDateString("de-CH"):(b.einzug?new Date(b.einzug).toLocaleDateString("de-CH"):""),
      auszug:"",schluessel_nr:"",
      roomId: istNachmieter ? selZimmer : undefined,
      owner: b.owner || "",
      personen: b.personen != null && b.personen !== "" ? +b.personen : null,
      mitmieter: (b.mitmieter && b.mitmieter.aktiv !== false && b.mitmieter.vorname) ? { ...b.mitmieter, aktiv: true } : null,
      // Mitziehende Personen, die nicht Vertragspartei sind (2. Person ohne Haekchen + ab 3. Person), als Info behalten
      weitere_personen: (() => { const l = [ ...((b.mitmieter && b.mitmieter.aktiv === false && b.mitmieter.vorname) ? [b.mitmieter] : []), ...(Array.isArray(b.weitere_personen) ? b.weitere_personen : []) ].map(({aktiv, ...r}) => r); return l.length ? l : null; })(),
    };
    await insertTenant(newTenant);
    if (!istNachmieter) { await updateRoom(selZimmer,{occupied:true,tenantId:newId}); }
    await updateBewerber(b.id,{status:"Zugeteilt",zugeteiltes_zimmer:selZimmer});
    
    // Dokumente vom Bewerber zum Mieter migrieren (applicant → tenant)
    if (migrateDocumentsToTenant) {
      try {
        const res = await migrateDocumentsToTenant(b.id, newId);
        if (res.migrated > 0) console.log(`${res.migrated} Dokument(e) migriert: applicant/${b.id} → tenant/${newId}`);
      } catch (e) {
        console.error("Dokument-Migration fehlgeschlagen:", e);
      }
    }

    // Bestehende Verträge des Bewerbers auf den Mieter umhängen, damit später
    // signierte oder gegengezeichnete Verträge korrekt beim Mieter gespeichert
    // werden, auch wenn vor der Unterschrift umgewandelt wird.
    try {
      const { error: cErr } = await supabase.from("contracts").update({ tenant_id: newId }).eq("bewerber_id", b.id);
      if (cErr) console.error("Vertrag-Umhängen fehlgeschlagen:", cErr.message);
    } catch (e) {
      console.error("Vertrag-Umhängen fehlgeschlagen:", e);
    }

    if (istNachmieter) alert(`${b.vorname} ${b.nachname} wurde als zukünftiger Mieter angelegt (Zimmer ${selZimmer}${einzugDate?`, Einzug ${new Date(einzugDate).toLocaleDateString("de-CH")}`:""}). Er erscheint im Mieter-Tab unter Zukünftige. Der aktuelle Mieter bleibt bis zu seinem Auszug im Zimmer.`);
    setZuteilModal(false);setSelZimmer(null);setSel(null);
  }

  function copyLink(){navigator.clipboard.writeText(formLink).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});}

  function openEdit(){
    if(!b)return;
    setEditForm({...b});
    setEditModal(true);
  }
  async function saveEdit(){
    // ─── VALIDIERUNG ───────────────────────────────────────────────
    const errors = [];
    
    if (editForm.email) {
      const r = validateEmail(editForm.email);
      if (!r.ok) errors.push(`E-Mail: ${r.error}`);
      else editForm.email = r.value;
    }
    
    if (editForm.phone) {
      const r = validatePhone(editForm.phone);
      if (!r.ok) errors.push(`Telefon: ${r.error}`);
      else editForm.phone = formatPhoneCH(r.value);
    }
    
    if (editForm.geb) {
      const r = validateDate(editForm.geb, {type: "birthday"});
      if (!r.ok) errors.push(`Geburtstag: ${r.error}`);
      else editForm.geb = r.value;
    }
    
    if (editForm.plz) {
      const r = validatePLZ(editForm.plz);
      if (!r.ok) errors.push(`PLZ: ${r.error}`);
      else editForm.plz = r.value;
    }
    
    if (editForm.einkommen) {
      const r = validateNumber(editForm.einkommen, {min: 0, max: 1000000});
      if (!r.ok) errors.push(`Einkommen: ${r.error}`);
    }
    
    if (errors.length > 0) {
      alert("Bitte korrigiere folgende Felder:\n\n• " + errors.join("\n• "));
      return;
    }
    
    const {id,...fields}=editForm;
    await updateBewerber(id,fields);
    setEditModal(false);
  }
  function EF(k){return e=>setEditForm(p=>({...p,[k]:e.target.value}));}
  function EFB(k){return e=>setEditForm(p=>({...p,[k]:e.target.checked}));}

  // ─── EMAIL VERSAND ──────────────────────────────────────────────────────────
  function sendEmail(type) {
    if (!b || !b.email) {
      alert("Keine Email-Adresse für diesen Bewerber hinterlegt.");
      return;
    }
    const fullName = `${b.vorname || ""} ${b.nachname || ""}`.trim();
    const targetRoomId = b.zugeteiltes_zimmer || b.zimmerWunsch;
    const room = targetRoomId ? rooms.find(r=>r.id===targetRoomId) : null;
    const apt = room ? apts.find(a=>a.id===room.aptId) : null;
    const adresse = apt ? `${apt.adresse}, ${apt.plz||""} ${apt.ort||""}`.trim() : "";
    const zimmerId = targetRoomId || "";
    const istW = !!(apt && apt.vermietungsart === "wohnung");
    // Wohnung: kein Zimmer nennen, sondern die Wohnung
    const objektKurz = istW ? `Wohnung ${apt.id}` : zimmerId;
    const objektSatz = istW ? "die Wohnung" : `Zimmer ${zimmerId}`;
    const objektDativ = istW ? "die Wohnung" : `das Zimmer ${zimmerId}`;
    
    let subject, body;
    
    if (type === "vertrag") {
      subject = `Untermietvertrag - ${adresse} (${objektKurz}) | D&T Homes`;
      body = `Liebe/r ${b.vorname || fullName}

Vielen Dank für dein Interesse an unserer Wohnung an der ${adresse}.

Im Anhang findest du den Untermietvertrag für ${objektSatz}. Bitte gehe wie folgt vor:

1. Überprüfe alle Angaben im Vertrag sorgfältig
2. Unterzeichne beide Exemplare
3. Sende ein unterzeichnetes Exemplar per E-Mail zurück an info@dthomes.ch oder per Post

Bitte stelle ausserdem die folgenden Dokumente bereit:
- Kopie deines Passes / Ausweises
- Aktueller Betreibungsregister-Auszug (nicht älter als 3 Monate)
- Kautionsbestätigung (gemäss gewählter Variante)

Bei Fragen stehe ich dir gerne zur Verfügung.

Beste Grüsse

Daan Theijse
D&T Homes
info@dthomes.ch
www.dthomes.ch`;
    } else if (type === "anfangsmietzins") {
      subject = `Anfangsmietzinsformular - ${adresse} (${objektKurz}) | D&T Homes`;
      body = `Liebe/r ${b.vorname || fullName}

Im Anhang findest du das amtliche Anfangsmietzinsformular für ${objektDativ} an der ${adresse}.

Dieses Formular ist gesetzlich vorgeschrieben (Art. 270 OR) und informiert dich über:
- Den vorherigen Mietzins
- Den aktuellen Mietzins
- Den geltenden Referenzzinssatz

Bitte bewahre dieses Dokument zusammen mit dem Untermietvertrag auf.

Bei Fragen stehe ich dir gerne zur Verfügung.

Beste Grüsse

Daan Theijse
D&T Homes
info@dthomes.ch
www.dthomes.ch`;
    } else if (type === "beides") {
      subject = `Vertragsunterlagen - ${adresse} (${objektKurz}) | D&T Homes`;
      body = `Liebe/r ${b.vorname || fullName}

Vielen Dank für dein Interesse an unserer Wohnung an der ${adresse}.

Im Anhang findest du zwei wichtige Dokumente für ${objektDativ}:

1) UNTERMIETVERTRAG
   - Bitte überprüfen, unterzeichnen und ein Exemplar zurücksenden

2) ANFANGSMIETZINSFORMULAR (gesetzlich vorgeschrieben)
   - Information über den vorherigen und aktuellen Mietzins
   - Bitte zur Ablage aufbewahren

Bitte stelle uns ausserdem die folgenden Dokumente bereit:
- Kopie deines Passes / Ausweises
- Aktueller Betreibungsregister-Auszug (nicht älter als 3 Monate)
- Kautionsbestätigung (gemäss gewählter Variante)

Bei Fragen stehe ich dir gerne zur Verfügung.

Beste Grüsse

Daan Theijse
D&T Homes
info@dthomes.ch
www.dthomes.ch`;
    }
    
    // Outlook Web Compose URL - öffnet neue Email direkt in OWA mit info@dthomes.ch als Absender
    // (sofern Nutzer im selben Browser bei Microsoft 365 eingeloggt ist)
    const owaUrl = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(b.email)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(owaUrl, "_blank");
  }

  function quickGenerateAnfangsmietzins(){
    if(!b) return;
    // Build vertragData on-the-fly (without opening modal)
    const targetRoomId = b.zugeteiltes_zimmer || b.zimmerWunsch;
    const room = targetRoomId ? rooms.find(r=>r.id===targetRoomId) : null;
    const apt = room ? apts.find(a=>a.id===room.aptId) : null;
    const bruttomiete = room ? +room.miete : 1000;
    const nebenkosten = 100;
    const nettomiete = bruttomiete - nebenkosten;
    const strom = 25; // Fix CHF 25 Stromkostenpauschale
    // Kein Kautions-Servicegebühr im Anfangsmietzins (gehört zum Untermietvertrag)
    const total = nettomiete + nebenkosten + strom;
    const tempData = {
      zimmerId: targetRoomId || "",
      apt: apt || null,
      room: room || null,
      adresse: apt?.adresse || "",
      plz: apt?.plz || "",
      ort: apt?.ort || "Zürich",
      nettomiete,
      nebenkosten,
      bruttomiete,
      strom,
      total,
      einzug: b.einzug || "",
    };
    const fullName = `${b.vorname || ""} ${b.nachname || ""}`.trim();
    const html = buildAnfangsmietzinsHTML(b, tempData, fullName, formatDateLong);
    const win = window.open("", "_blank");
    if (!win) {
      alert("Popup wurde blockiert. Bitte Popups erlauben und erneut versuchen.");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.onload = () => {
      setTimeout(() => { win.focus(); win.print(); }, 300);
    };
  }

  // Nachfolge: Bewerber übernimmt das Zimmer/die Wohnung eines bestehenden Mieters
  const [uebernahme,setUebernahme]=useState(null); // { einzug: "YYYY-MM-DD", auszug: "YYYY-MM-DD", busy }
  const vormieterVon = (bb)=> bb && bb.nachfolge_token ? (tenants||[]).find(x=>x.nachfolge_token===bb.nachfolge_token) : null;
  const isoZuCh = (iso)=>{ const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(iso||""); return m?`${m[3]}.${m[2]}.${m[1]}`:""; };
  const chZuIso = (ch)=>{ const m=/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(ch||"").trim()); return m?`${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`:""; };
  function uebernahmeStarten(){
    const vm = vormieterVon(b); if(!vm) return;
    const ein = (b.einzug||"").slice(0,10);
    let aus = "";
    if(ein){ const d=new Date(ein+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()-1); aus=d.toISOString().slice(0,10); }
    else if(vm.auszug) aus = chZuIso(vm.auszug);
    setUebernahme({ einzug: ein, auszug: aus, busy:false });
  }
  async function uebernahmeBestaetigen(){
    const vm = vormieterVon(b); const u = uebernahme; if(!vm||!u) return;
    if(!u.einzug||!u.auszug){ alert("Bitte Einzug des Nachmieters und Auszug des Vormieters angeben."); return; }
    if(u.auszug >= u.einzug && !confirm("Der Auszug des Vormieters ist nicht vor dem Einzug des Nachmieters. Trotzdem fortfahren?")) return;
    setUebernahme(x=>({...x,busy:true}));
    try{
      const auszugCh = isoZuCh(u.auszug), jetzt=new Date().toISOString();
      // 1. Auszug beim Vormieter
      { const {error}=await supabase.from("tenants").update({auszug:auszugCh, updated_at:jetzt}).eq("id",vm.id); if(error) throw error; }
      // 2. Kündigung beim Vormieter erfassen bzw. anpassen (per Nachmieter, bestätigt)
      const nmName = `${b.vorname||""} ${b.nachname||""}`.trim();
      const {data:kd} = await supabase.from("kuendigungen").select("id").eq("tenant_id",vm.id).eq("art","kuendigung").in("status",["eingereicht","bestaetigt"]).limit(1);
      if(kd&&kd.length){ const {error}=await supabase.from("kuendigungen").update({datum:auszugCh,status:"bestaetigt",nachmieter_name:nmName,nachmieter_email:b.email||null,bearbeitet_at:jetzt,updated_at:jetzt}).eq("id",kd[0].id); if(error) throw error; }
      else { const {error}=await supabase.from("kuendigungen").insert({tenant_id:vm.id,art:"kuendigung",datum:auszugCh,status:"bestaetigt",quelle:"nachmieter",grund:"Nachmieter übernimmt",nachmieter_name:nmName,nachmieter_email:b.email||null,bearbeitet_at:jetzt}); if(error) throw error; }
      // 3. Bewerbung als übernommen markieren, Zimmer und Einzug setzen
      const zimmer = vm.roomId || vm.room_id || b.zimmerWunsch || "";
      { const {error}=await supabase.from("applicants").update({nachfolge_angenommen_at:jetzt, einzug:u.einzug, ...(zimmer?{zimmer_wunsch:zimmer}:{})}).eq("id",b.id); if(error) throw error; }
      try{ window.__ibNeuLaden && window.__ibNeuLaden(); }catch(_){}
      setUebernahme(null);
      toast(`Übernommen · Auszug ${vm.vorname||""} per ${auszugCh}`);
      // 4. Vertrag für den Nachmieter gleich öffnen
      openVertragModal({ zimmer, einzug: u.einzug });
    }catch(e){ setUebernahme(x=>({...x,busy:false})); alert("Fehler: "+(e.message||e)); }
  }

  function openVertragModal(over){
    if(!b) return;
    if(over && over.nativeEvent) over = null;
    // Determine the room: assigned > wish > first free
    const targetRoomId = (over&&over.zimmer) || b.zugeteiltes_zimmer || b.zimmerWunsch;
    const room = targetRoomId ? rooms.find(r=>r.id===targetRoomId) : null;
    const apt = room ? apts.find(a=>a.id===room.aptId) : null;
    const bruttomiete = room ? +room.miete : 1000;
    const nebenkosten = 100;
    const nettomiete = bruttomiete - nebenkosten;
    const strom = 25;
    // Detect kaution variant from multiple possible sources
    let kautionMonate = 3;
    let aufschlag = 0;
    if (b.kautionOpt === "0x" || b.kautionAufschlag === 150 || (b.kautionType||"").toLowerCase().includes("keine")) {
      kautionMonate = 0; aufschlag = 150;
    } else if (b.kautionOpt === "1x" || b.kautionAufschlag === 100 || (b.kautionType||"").startsWith("1")) {
      kautionMonate = 1; aufschlag = 100;
    } else if (b.kautionOpt === "2x" || b.kautionAufschlag === 50 || (b.kautionType||"").startsWith("2")) {
      kautionMonate = 2; aufschlag = 50;
    } else {
      kautionMonate = 3; aufschlag = 0;
    }
    const kautionBetrag = (bruttomiete + strom) * kautionMonate;
    const total = bruttomiete + strom + aufschlag;

    setVertragData({
      zimmerId: targetRoomId || "",
      apt: apt || null,
      room: room || null,
      // Editable fields
      adresse: apt?.adresse || "",
      plz: apt?.plz || "",
      ort: apt?.ort || "Zürich",
      nettomiete,
      nebenkosten,
      bruttomiete,
      strom,
      aufschlag,
      total,
      kautionMonate,
      kautionBetrag,
      moebliert: b.moebliert === "ja" || b.moebliert === true,
      moeblierungModus: b.moeblierungModus || "einmalig",
      moeblierungPauschale: +b.moeblierungPauschale || (b.moeblierungModus==="monatlich" ? 150 : 990),
      einzug: (over&&over.einzug) || b.einzug || "",
      auszug: b.auszug || "",
      mietende: "",
      fruehererMietzins: (room && (room.tenantId || (tenants||[]).some(x=>x&&x.roomId===room.id))) ? (bruttomiete + strom) : "",
      ortVertrag: "Zürich",
      datumVertrag: new Date().toISOString().split("T")[0],
      minMietdauer: 6,
      kuendigungsfrist: 3,
    });
    if (apt && apt.vermietungsart === "wohnung") {
      const _mm = (b.mitmieter && typeof b.mitmieter === "object") ? b.mitmieter : null;
      setVertragData(p => ({ ...wohnungVertragswerte({ ...p, fruehererMietzins: "" }, apt, room, b.personen || 1),
        mitmieter: (_mm && _mm.aktiv !== false && _mm.vorname) ? { ..._mm, aktiv: true } : null,
        _mmDraft: _mm || {} }));
    }
    setVertragModal(true);
  }

  const [dlBusy, setDlBusy] = useState("");
  async function generateContract(){
    if (!vertragData || !b) return;
    const v = vertragData;
    if (v.mietende && v.apt?.mietende) {
      const es = toDateInputValue(v.mietende), as = toDateInputValue(v.apt.mietende);
      if (es && as && es > as) { alert(`Das Enddatum (${v.mietende}) darf nicht nach dem Mietende der Wohnung (${v.apt.mietende}) liegen.`); return; }
    }
    if (istWohnungsVertrag(v) && v.mitmieter && mitmieterFehlt(v.mitmieter)) { alert("Mitmieter*in unvollständig: " + mitmieterFehlt(v.mitmieter)); return; }
    const fullName = `${b.vorname || ""} ${b.nachname || ""}`.trim();
    setDlBusy("umv");
    try {
      const html = buildContractHTML(b, v, fullName, formatDateLong);
      const fn = `Untermietvertrag_${fullName.replace(/\s+/g,"_")}.pdf`;
      downloadBlob(await htmlToPdf(html, fn), fn);
    } catch (e) { alert("PDF konnte nicht erstellt werden: " + (e.message || e)); }
    finally { setDlBusy(""); }
  }

  async function generateAnfangsmietzins(){
    if (!vertragData || !b) return;
    const strom = 25;
    const v = { ...vertragData, strom, total: vertragData.nettomiete + vertragData.nebenkosten + strom };
    const fullName = `${b.vorname || ""} ${b.nachname || ""}`.trim();
    setDlBusy("amz");
    try {
      const html = buildAnfangsmietzinsHTML(b, v, fullName, formatDateLong);
      const fn = `Anfangsmietzinsformular_${fullName.replace(/\s+/g,"_")}.pdf`;
      downloadBlob(await htmlToPdf(html, fn), fn);
    } catch (e) { alert("PDF konnte nicht erstellt werden: " + (e.message || e)); }
    finally { setDlBusy(""); }
  }

  // ═══════════════════════════════════════════════════════════════════
  // DIGITAL CONTRACT SIGNING - Vertrag senden Workflow
  // ═══════════════════════════════════════════════════════════════════

  // Faksimile-Signatur in HTML einfügen (Hauptmieter im UMV)
  // Einheitliches Datumsformat (ohne führende Null, wie in der Edge Function)
  function daanDatumStr() {
    return new Date().toLocaleDateString("de-CH", { day:"numeric", month:"long", year:"numeric" });
  }

  function injectDaanInUMV(html) {
    const hauptmieterPattern = /(<div class="sig-block">\s*<div class="role">Hauptmieter<\/div>[\s\S]*?<div class="sig-row">\s*<span class="lbl">Unterschrift:<\/span>\s*)<span class="line"><\/span>/;
    let sigOk = false;
    let replaced = html.replace(hauptmieterPattern, (match, prefix) => {
      sigOk = true;
      return `${prefix}<span class="line" style="position:relative;flex:1;"><img src="${DAAN_FAKSIMILE_DATA_URI}" style="position:absolute;left:8pt;bottom:-6pt;height:28pt;pointer-events:none;" alt="Daan Theijse"/></span>`;
    });
    // Ort/Datum bei Hauptmieter
    const datumPattern = /(<div class="sig-block">\s*<div class="role">Hauptmieter<\/div>[\s\S]*?<div class="sig-row">\s*<span class="lbl">Ort, Datum:<\/span>\s*)<span class="line"><\/span>/;
    const datumStr = daanDatumStr();
    let datumOk = false;
    replaced = replaced.replace(datumPattern, (m, prefix) => {
      datumOk = true;
      return `${prefix}<span class="line" style="border-bottom:.5pt solid #888;flex:1;">Zürich, ${datumStr}</span>`;
    });
    if (!sigOk || !datumOk) {
      throw new Error(`injectDaanInUMV: Hauptmieter-Signaturblock nicht gefunden (Markup geändert?) [sig=${sigOk}, datum=${datumOk}]`);
    }
    return replaced;
  }

  // Faksimile-Signatur in HTML einfügen (Vermieter im AMZ + Labels gleichbreit)
  function injectDaanInAMZ(html) {
    const datumStr = daanDatumStr();
    const labelStyle = ' style="min-width:62pt;width:62pt;"';

    // Vermieter Block
    const vermPattern = /(<div class="lbl">Vermieter\*in<\/div>[\s\S]*?<div class="sig-row-inner"><span class="label")(>Datum:<\/span>)<span class="line"><\/span>(<\/div>\s*<div class="sig-row-inner"><span class="label")(>Unterschrift:<\/span>)<span class="line"><\/span>/;
    let vermOk = false;
    let replaced = html.replace(vermPattern, (m, p1, p2, p3, p4) => {
      vermOk = true;
      return `${p1}${labelStyle}${p2}<span class="line" style="flex:1;">${datumStr}</span>${p3}${labelStyle}${p4}<span class="line" style="position:relative;flex:1;"><img src="${DAAN_FAKSIMILE_DATA_URI}" style="position:absolute;left:8pt;bottom:-6pt;height:22pt;pointer-events:none;" alt="Daan Theijse"/></span>`;
    });
    // Mieter Block - nur Labels gleichbreit machen (keine Unterschrift)
    const mieterPattern = /(<div class="lbl">Mieter\*in<\/div>[\s\S]*?<div class="sig-row-inner"><span class="label")(>Datum:<\/span><span class="line"><\/span><\/div>\s*<div class="sig-row-inner"><span class="label")(>Unterschrift:<\/span>)/;
    let mieterOk = false;
    replaced = replaced.replace(mieterPattern, (m, p1, p2, p3) => {
      mieterOk = true;
      return `${p1}${labelStyle}${p2}${labelStyle}${p3}`;
    });
    if (!vermOk || !mieterOk) {
      throw new Error(`injectDaanInAMZ: Signaturblock nicht gefunden (Markup geändert?) [verm=${vermOk}, mieter=${mieterOk}]`);
    }
    return replaced;
  }

  // HTML → PDF via Vercel Function (mit Retry bei ETXTBSY / 500)
  async function htmlToPdf(html, filename, maxRetries = 2) {
    let lastErr = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch("https://mieter.dthomes.ch/api/pdf-generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html, filename }),
        });
        if (response.ok) return await response.blob();
        const errText = await response.text();
        lastErr = new Error(`PDF generation failed (${response.status}): ${errText}`);
        // Retry bei transient errors (500 mit ETXTBSY oder Timeout)
        const retriable = response.status === 500 && (errText.includes("ETXTBSY") || errText.includes("timeout") || errText.includes("Failed to launch"));
        if (!retriable || attempt === maxRetries) throw lastErr;
        // Wait 1.5 Sek vor retry (Chromium soll sich settlen)
        await new Promise(r => setTimeout(r, 1500));
      } catch (err) {
        if (attempt === maxRetries) throw err;
        lastErr = err;
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    throw lastErr;
  }

  // Token generator (32 hex chars)
  function generateContractToken() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Hauptworkflow: generiert beide PDFs, lädt sie hoch, erstellt contracts row, sendet Email
  async function sendContractForSigning(b, vertragData, onProgress, types, pre) {
    const progress = onProgress || (() => {});
    // types: optional array ["umv","amz"] - default both
    const selectedTypes = Array.isArray(types) && types.length > 0 ? types : ["umv", "amz"];
    const wantUmv = selectedTypes.includes("umv");
    const wantAmz = selectedTypes.includes("amz");
    if (istWohnungsVertrag(vertragData) && vertragData.mitmieter && mitmieterFehlt(vertragData.mitmieter)) throw new Error("Mitmieter*in unvollständig: " + mitmieterFehlt(vertragData.mitmieter));
    if (!wantUmv && !wantAmz) throw new Error("Keine Vertragsart ausgewählt");
    if (!b || !vertragData) throw new Error("Bewerber oder Vertragsdaten fehlen");
    if (!b.email) throw new Error("Bewerber hat keine Email-Adresse");
    if (vertragData.mietende && vertragData.apt?.mietende) {
      const es = toDateInputValue(vertragData.mietende), as = toDateInputValue(vertragData.apt.mietende);
      if (es && as && es > as) throw new Error(`Das Enddatum (${vertragData.mietende}) darf nicht nach dem Mietende der Wohnung (${vertragData.apt.mietende}) liegen.`);
    }

    const fullName = `${b.vorname || ""} ${b.nachname || ""}`.trim();
    if (!fullName) throw new Error("Bewerber hat keinen Namen");

    // AMZ braucht angepasste Daten (Strom=25 bzw. bei Wohnungen Strom pro Person, keine Servicegebühr)
    const stromFix = istWohnungsVertrag(vertragData) ? (+vertragData.strom || 0) : 25;
    const amzData = {
      ...vertragData,
      strom: stromFix,
      total: (vertragData.nettomiete||0) + (vertragData.nebenkosten||0) + stromFix,
    };

    progress("Verträge generieren...", 0.1);
    const umvHtml = wantUmv ? buildContractHTML(b, vertragData, fullName, formatDateLong) : null;
    const amzHtml = wantAmz ? buildAnfangsmietzinsHTML(b, amzData, fullName, formatDateLong) : null;

    const totalSteps = (wantUmv ? 1 : 0) + (wantAmz ? 1 : 0);
    let step = 0;
    let umvBlob = null, amzBlob = null;
    if (wantUmv) {
      step++;
      progress(`PDF erstellen (${step}/${totalSteps}: Untermietvertrag)...`, 0.2);
      umvBlob = (pre && pre.umvBlob) || await htmlToPdf(umvHtml, `Untermietvertrag_${fullName.replace(/\s+/g,"_")}.pdf`);
    }
    if (wantAmz) {
      step++;
      progress(`PDF erstellen (${step}/${totalSteps}: Anfangsmietzinsformular)...`, 0.45);
      amzBlob = (pre && pre.amzBlob) || await htmlToPdf(amzHtml, `Anfangsmietzinsformular_${fullName.replace(/\s+/g,"_")}.pdf`);
    }

    progress("PDFs hochladen...", 0.6);
    const token = generateContractToken();
    const umvPath = `${token}/untermietvertrag.pdf`;
    const amzPath = `${token}/anfangsmietzins.pdf`;
    const unsignedPdfs = [];

    if (wantUmv) {
      const { error: upErr1 } = await supabase.storage.from("contracts").upload(umvPath, umvBlob, {
        contentType: "application/pdf", upsert: false
      });
      if (upErr1) throw new Error(`Upload UMV: ${upErr1.message}`);
      unsignedPdfs.push({ name: istWohnungsVertrag(vertragData) ? "Untermietvertrag Zwischennutzung" : "Untermietvertrag", path: umvPath, type: "umv" });
    }
    if (wantAmz) {
      const { error: upErr2 } = await supabase.storage.from("contracts").upload(amzPath, amzBlob, {
        contentType: "application/pdf", upsert: false
      });
      if (upErr2) throw new Error(`Upload AMZ: ${upErr2.message}`);
      unsignedPdfs.push({ name: "Anfangsmietzinsformular", path: amzPath, type: "amz" });
    }

    // contract_type-string je nach Auswahl
    let contractType = "untermietvertrag_und_anfangsmietzins";
    if (wantUmv && !wantAmz) contractType = "untermietvertrag";
    else if (!wantUmv && wantAmz) contractType = "anfangsmietzins";

    progress("Vertrag in Datenbank speichern...", 0.8);
    const { data: contractRow, error: insErr } = await supabase.from("contracts").insert({
      token,
      bewerber_id: b.id,
      apt_id: vertragData.apt?.id || null,
      room_id: vertragData.zimmerId || null,
      mieter_email: b.email,
      mieter_vorname: b.vorname || "",
      mieter_nachname: b.nachname || "",
      contract_type: contractType,
      contract_data: { bewerber: b, vertrag: vertragData, umv_html: umvHtml, amz_html: amzHtml },
      status: "gesendet",
      unsigned_pdfs: unsignedPdfs,
      created_by: (window.currentUser && window.currentUser.email) || null,
    }).select().single();
    if (insErr) throw new Error(`DB Insert: ${insErr.message}`);

    progress("Email an Mieter senden...", 0.95);
    const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-contract-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${((await supabase.auth.getSession()).data.session||{}).access_token||SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ contractId: contractRow.id }),
    });
    if (!emailRes.ok) {
      const err = await emailRes.text();
      console.error("Email-Versand fehlgeschlagen:", err);
      // Don't fail - contract is in DB, email can be re-sent
    }

    progress("Fertig!", 1.0);
    return {
      contractId: contractRow.id,
      token,
      signUrl: `https://mieter.dthomes.ch/${token}`,
      emailSent: emailRes.ok,
    };
  }

  return(
    <div>
      <div className="pt">Bewerber</div>
      <div className="ps">{bewerber.length} Bewerbungen · {freeRooms.length} freie Zimmer</div>
      
      {/* NACHMIETER-SUCHE-BANNER */}
      {nachmieterFor && (() => {
        const targetRoom = rooms.find(r => r.id === nachmieterFor);
        const targetApt = targetRoom ? apts.find(a => a.id === targetRoom.aptId) : null;
        return (
          <div style={{background:"#1a1814",color:"#fefcf7",borderRadius:8,padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
            <div>
              <div style={{fontSize:10,letterSpacing:".25em",textTransform:"uppercase",color:"#b8af9f",marginBottom:4,fontWeight:600}}>🏠 Nachmieter-Suche</div>
              <div style={{fontSize:14,fontWeight:600,marginBottom:2}}>Zeige passende Bewerber für {nachmieterFor}</div>
              <div style={{fontSize:11,color:"#b8af9f"}}>{targetApt?.adresse||"-"} {targetRoom?.miete?`· CHF ${targetRoom.miete}/Mt.`:""} · {shown.length} passende{shown.length===1?"r":""} Bewerber</div>
            </div>
            <button onClick={()=>setNachmieterFor(null)} style={{background:"transparent",color:"#fefcf7",border:"1px solid #b8af9f",borderRadius:6,padding:"7px 14px",fontSize:11,fontWeight:600,cursor:"pointer",letterSpacing:".02em"}}>✕ Filter aufheben</button>
          </div>
        );
      })()}
      
      {/* GEGENZEICHNUNG-BANNER: Vertraege, die auf die Gegenzeichnung durch D&T warten */}
      {(() => {
        const wartend = contracts.filter(c => c.status === "mieter_signiert");
        if (wartend.length === 0) return null;
        const typLabel = (ct) => ct === "untermietvertrag" ? "Untermietvertrag"
          : ct === "anfangsmietzins" ? "Anfangsmietzins"
          : (ct === "verlaengerung" || ct === "nachtrag") ? "Verlängerung"
          : "Untermietvertrag + Anfangsmietzins";
        return (
          <div style={{background:"#2c4a6e",color:"#fefcf7",borderRadius:8,padding:"14px 18px",marginBottom:16}}>
            <div style={{fontSize:10,letterSpacing:".25em",textTransform:"uppercase",color:"#b0c8e0",marginBottom:10,fontWeight:600}}>✍ Wartet auf Gegenzeichnung ({wartend.length})</div>
            <div style={{display:"flex",flexDirection:"column",gap:9}}>
              {wartend.map(c => (
                <div key={c.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                  <div style={{fontSize:13.5,fontWeight:600,minWidth:0}}>
                    {`${c.mieterVorname||""} ${c.mieterNachname||""}`.trim() || "Unbenannt"}
                    <span style={{fontSize:11,color:"#b0c8e0",fontWeight:400,marginLeft:8}}>{typLabel(c.contractType)}</span>
                  </div>
                  <CountersignButton contract={c} onDone={loadContracts} light />
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      
      <div className="card" style={{marginBottom:20}}>
        <div className="ct">📋 Bewerbungs-Link (Webseite)</div>
        <div style={{fontSize:12.5,color:"#8a8478",marginBottom:10}}>Diesen Link an potenzielle Mieter senden. Dort sehen sie alle freien Zimmer mit Bildern und können sich direkt bewerben. Bewerbungen erscheinen automatisch hier.</div>
        <div className="link-box">
          <span className="link-text">{formLink}</span>
          <button className="btn btn-p btn-sm" onClick={copyLink}>{copied?"✓ Kopiert!":"Link kopieren"}</button>
        </div>
      </div>
      {/* Umschalter Liste / Übersicht, per Wischen umschaltbar */}
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        <button className={`btn btn-sm ${ansicht==="liste"?"btn-p":"btn-g"}`} style={{flex:1,justifyContent:"center"}} onClick={()=>setAnsicht("liste")}>Liste</button>
        <button className={`btn btn-sm ${ansicht==="uebersicht"?"btn-p":"btn-g"}`} style={{flex:1,justifyContent:"center"}} onClick={()=>setAnsicht("uebersicht")}>Übersicht</button>
      </div>
      <div onTouchStart={e=>{touchX.current=e.touches[0].clientX;}} onTouchEnd={e=>{ if(touchX.current==null)return; const dx=e.changedTouches[0].clientX-touchX.current; touchX.current=null; if(Math.abs(dx)>60) setAnsicht(dx<0?"uebersicht":"liste"); }}>
      {ansicht==="uebersicht" ? (
        <BewerberUebersicht bewerber={bewerber} apts={apts} rooms={rooms} tenants={tenants} contracts={contracts} withdrawContract={withdrawContract} updateBewerber={updateBewerber} onSelectBewerber={(id)=>{ setNachmieterFor(null); setSel(id); setAnsicht("liste"); }} onWohnung={()=>{ setNachmieterFor(null); setBewSearch(""); setFilterStatus("Neu"); setAnsicht("liste"); }} />
      ) : (
      <div className="list-detail" style={{display:"grid",gridTemplateColumns:"260px 1fr",gap:16}}>
        <div>
          <div style={{marginBottom:10}}>
            <input
              type="text"
              className="fi bewerber-search"
              placeholder="🔎 Bewerber nach Name suchen..."
              value={bewSearch}
              onChange={e=>setBewSearch(e.target.value)}
              style={{width:"100%"}}
            />
          </div>
          <div style={{display:"flex",gap:5,marginBottom:12,flexWrap:"wrap",borderBottom:"1px solid var(--line)",paddingBottom:10}}>
            <button className={`btn btn-sm ${listMode!=="leads"?"btn-p":"btn-g"}`} onClick={()=>setListMode("bewerber")}>Bewerber</button>
            <button className={`btn btn-sm ${listMode==="leads"?"btn-p":"btn-g"}`} onClick={()=>setListMode("leads")}>wgzimmer-Leads{wgLeadCount>0?(" ("+wgLeadCount+")"):""}</button>
          </div>
          {listMode!=="leads" && <div style={{display:"flex",gap:5,marginBottom:10,flexWrap:"wrap"}}>
            {["Neu","Zugeteilt","Abgelehnt"].map(s=>(<button key={s} className={`btn btn-sm ${filterStatus===s?"btn-p":"btn-g"}`} onClick={()=>setFilterStatus(s)} style={{fontSize:10}}>{s}</button>))}
          </div>}
          {filterStatus==="Neu" && (
            <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:10,flexWrap:"wrap"}}>
              <span style={{fontSize:9.5,color:"#b8af9f",textTransform:"uppercase",letterSpacing:".15em",fontWeight:600,marginRight:2}}>Sortieren</span>
              {[["neu","Neueste"],["monat","Nach Monat"]].map(([k,l])=>(
                <button key={k} className={`btn btn-sm ${bewSort===k?"btn-p":"btn-g"}`} onClick={()=>setBewSort(k)} style={{fontSize:10}}>{l}</button>
              ))}
            </div>
          )}
          {shown.length===0?<div className="empty">Keine Bewerbungen</div>:shown.map((bw,idx)=>{
            const on = sel===bw.id;
            const wunschRoom = bw.zimmerWunsch ? rooms.find(r=>r.id===bw.zimmerWunsch) : null;
            const zugeteiltRoom = bw.zugeteiltes_zimmer ? rooms.find(r=>r.id===bw.zugeteiltes_zimmer) : null;
            const targetRoom = zugeteiltRoom || wunschRoom;
            const targetApt = targetRoom ? apts.find(a=>a.id===targetRoom.aptId) : null;
            const bwContracts = (contracts||[]).filter(c => c.bewerberId === bw.id);
            const contractMark = bwContracts.length===0 ? null : (bwContracts.some(c=>c.status==="signiert") ? {bg:"#e8efde",color:"#3a5230",label:"✓ Vertrag"} : {bg:"#fdf2e0",color:"#7a5c3c",label:"📄 Vertrag"});
            const mKey = bw.einzug ? new Date(bw.einzug).toLocaleDateString("de-CH",{month:"long",year:"numeric"}) : "Ohne Wunschdatum";
            const prevB = idx>0 ? shown[idx-1] : null;
            const prevKey = prevB ? (prevB.einzug ? new Date(prevB.einzug).toLocaleDateString("de-CH",{month:"long",year:"numeric"}) : "Ohne Wunschdatum") : null;
            const showMonth = filterStatus==="Neu" && bewSort==="monat" && mKey !== prevKey;
            return (
            <React.Fragment key={bw.id}>
            {showMonth && <div style={{fontSize:9.5,textTransform:"uppercase",letterSpacing:".2em",color:"#8a8174",fontWeight:600,margin:idx===0?"2px 0 8px":"16px 0 8px",paddingLeft:2}}>{mKey}</div>}
            <div className={`bewerber-card${on?" selected":""}`} onClick={()=>{setSel(bw.id);setTab("info");}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:3}}>
                <div style={{fontWeight:600,fontSize:12.5,color:on?"#a08864":"#1f1d18",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1,minWidth:0}}>{bw.vorname} {bw.nachname}</div>
                <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
                  {bw.owner&&<span style={{fontSize:9,fontWeight:600,padding:"2px 6px",borderRadius:3,background:bw.owner==="Daan"?"#e0e8f0":"#f0e6dc",color:bw.owner==="Daan"?"#3a4d66":"#7a5c3c",letterSpacing:".05em"}}>{bw.owner}</span>}
                  {contractMark&&<span title="Vertrag ausgestellt" style={{fontSize:9,fontWeight:600,padding:"2px 6px",borderRadius:3,background:contractMark.bg,color:contractMark.color,letterSpacing:".05em",whiteSpace:"nowrap"}}>{contractMark.label}</span>}
                  <StatusBdg status={bw.status}/>
                </div>
              </div>
              <div style={{fontSize:10.5,color:"#8a8478",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {targetRoom ? (
                  <>
                    {zugeteiltRoom ? "🏠 " : "💭 "}
                    <strong style={{color:"#5a5249"}}>{targetRoom.id}</strong>
                    {targetApt && targetApt.zimmer && <> · {targetApt.zimmer} Zi.</>}
                    {targetApt && targetApt.stockwerk && <> · {targetApt.stockwerk}</>}
                    {targetApt && <> · {targetApt.adresse}</>}
                  </>
                ) : <span style={{fontStyle:"italic",color:"#bab2a0"}}>Kein Wunsch-Zimmer</span>}
              </div>
            </div></React.Fragment>);
          })}
        </div>
        {b?(
          <>
          <div ref={detailRef} className="card" style={{margin:0,scrollMarginTop:16}}>
            <div className="detail-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,gap:12,flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"center",gap:11,minWidth:0,flex:"1 1 auto"}}>
                <Av name={b.vorname} size={40}/>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:"#1f1d18",wordBreak:"break-word"}}>{b.vorname} {b.nachname}</div>
                  <div style={{fontSize:11,color:"#8a8478",marginTop:2,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                    <span>Eingereicht: {fmtDatum(b.eingereichtAm)}</span>
                    <span>·</span>
                    <StatusBdg status={b.status}/>
                    {b.owner&&<span style={{fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:3,background:b.owner==="Daan"?"#e0e8f0":"#f0e6dc",color:b.owner==="Daan"?"#3a4d66":"#7a5c3c",letterSpacing:".05em"}}>👤 {b.owner}</span>}
                  </div>
                </div>
              </div>
              <div className="detail-actions" style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
                <button className="btn btn-sm" onClick={(e)=>waShortcutB(b,e)} title="Erste WhatsApp-Nachricht senden" style={{background:"#4e7d55",color:"#fff",borderColor:"#4e7d55"}}>💬 WhatsApp</button>
                <button className="btn btn-g btn-sm" onClick={openEdit}>✏ Bearbeiten</button>
                {vormieterVon(b) && !b.nachfolge_angenommen_at && b.status!=="Abgelehnt" && <button className="btn btn-sm" onClick={uebernahmeStarten} style={{background:"#5a3e8a",color:"#fff",borderColor:"#5a3e8a"}}>↻ Als Nachmieter übernehmen</button>}
                <button className="btn btn-p btn-sm" onClick={openVertragModal}>📄 Vertrag</button>
                {b.status!=="Zugeteilt"&&b.status!=="Abgelehnt"&&(<button className="btn btn-gr btn-sm" onClick={()=>setZuteilModal(true)}>🏠 Zimmer zuteilen</button>)}
                {b.status!=="Abgelehnt"&&b.status!=="Zugeteilt"&&<button className="btn btn-r btn-sm" onClick={()=>setStatus(b.id,"Abgelehnt")}>✗ Ablehnen</button>}
                <button className="btn btn-sm" onClick={()=>{
                  if(confirm(`Bewerbung von ${b.vorname} ${b.nachname} wirklich endgültig löschen?\n\nDie Bewerbung wird komplett aus der Datenbank entfernt - dieser Vorgang kann nicht rückgängig gemacht werden.`)){
                    deleteBewerber(b.id);
                    setSel(null);
                  }
                }} style={{background:"#fefcf7",color:"#9b4a3e",border:"1px solid #e0bcb0"}}>🗑 Löschen</button>
              </div>
            </div>
            
            <div className="tabs">{[["info","Profil"],["docs","Dokumente"],["komm","Kommunikation"]].map(([k,l])=>(<button key={k} className={`tab${tab===k?" on":""}`} onClick={()=>setTab(k)}>{l}</button>))}</div>
            
            {tab==="info"&&<>

            {b.zimmerWunsch&&!b.zugeteiltes_zimmer&&(()=>{
              const wRoom=rooms.find(r=>r.id===b.zimmerWunsch);
              const wApt=wRoom?apts.find(a=>a.id===wRoom.aptId):null;
              const stillFree=wRoom&&!wRoom.occupied;
              return(
                <div style={{background:stillFree?"#f5efe4":"#f6ecd8",border:`1px solid ${stillFree?"rgba(160,136,100,.4)":"rgba(200,150,83,.4)"}`,borderRadius:8,padding:"12px 14px",marginBottom:12}}>
                  <div style={{fontSize:9.5,color:"#8a8478",textTransform:"uppercase",letterSpacing:".4px",marginBottom:8,fontWeight:700}}>💭 Wunschzimmer</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:stillFree?"#a08864":"#c89653"}}>{objektLabel(b.zimmerWunsch)}</div>
                      <div style={{fontSize:11.5,color:"#8a8478",marginTop:2}}>{wApt?.adresse||"-"}{wRoom?.balkon?" · 🌿":""}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,color:"#5a7c5e",fontSize:14}}>{wRoom?chf(wRoom.miete):"-"}/Mt.</div>
                      <div style={{fontSize:10.5,marginTop:3}}>{stillFree?<Bdg label="○ noch frei" color="g"/>:<Bdg label="● belegt" color="y"/>}</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="igrid" style={{marginBottom:16}}>
              {[
                ["E-Mail",b.email?<a href={`mailto:${b.email}`}>{b.email}</a>:"-"],
                ["Empfohlen von", b.empfohlen_von ? <strong style={{color:"#8a6a2e"}}>{b.empfohlen_von}</strong> : "-"],
                ...(b.nachfolge_angenommen_at ? [["Nachfolge", <strong style={{color:"#3a5230"}}>✓ übernommen am {new Date(b.nachfolge_angenommen_at).toLocaleDateString("de-CH")}</strong>]] : []),
                ...(b.nachfolge_token ? [["Nachfolge von", (()=>{ const t=(tenants||[]).find(x=>x.nachfolge_token===b.nachfolge_token); return t ? <strong style={{color:"#5a3e8a"}}>{t.vorname} {t.nachname}{t.auszug?` (Auszug ${t.auszug})`:""}</strong> : "unbekannter Link"; })()]] : []),
                ["Parkplatz", b.parkplatz_wunsch ? <strong style={{color:"#2c4a6e"}}>🅿️ gewünscht</strong> : "-"],
                ["Reinigung", b.reinigung_wunsch ? <strong style={{color:"#2c4a6e"}}>🧽 Offerte gewünscht</strong> : "-"],
                ["Umzug", b.umzug_wunsch ? <strong style={{color:"#2c4a6e"}}>📦 Offerte gewünscht</strong> : "-"],
                ["Telefon",b.phone?<span><a href={`tel:${b.phone}`}>{b.phone}</a> <a href={`https://wa.me/${(b.phone||"").replace(/\D/g,"").replace(/^00/,"").replace(/^0/,"41")}?text=${encodeURIComponent((()=>{ const _r=(rooms||[]).find(r=>r.id===(b.zugeteiltes_zimmer||b.zimmerWunsch)); const _a=_r?(apts||[]).find(a=>a.id===_r.aptId):null; return aptIstWohnung(_a) ? ("Hallo "+(b.vorname||"")+", vielen Dank für deine Anfrage, schön dass du dich gemeldet hast! Auf https://www.dthomes.ch/wohnungen findest du unsere Wohnungen mit mehr Bildern und 3D-Rundgang. Die Besichtigung läuft bei uns über den 3D-Rundgang, und wenn dir eine Wohnung gefällt, kannst du dich dort direkt bewerben. Liebe Grüsse, Daan") : ("Hallo "+(b.vorname||"")+", vielen Dank für deine Anfrage, schön dass du dich gemeldet hast! Wir haben aktuell mehrere Zimmer frei. Auf https://www.dthomes.ch/zimmer findest du Bilder und kannst dich direkt bewerben, wenn du Interesse hast. Liebe Grüsse, Daan"); })())}`} target="_blank" rel="noopener noreferrer" style={{marginLeft:8,color:"#1a8f4c",fontWeight:600,textDecoration:"none"}}>WhatsApp</a></span>:"-"],
                ["Geburtsdatum", fmtDateDE(b.geburt) || "-"],
                ["Geschlecht",b.gender||"-"],
                ["Nationalität",b.nat||"-"],
                ["Adresse",b.adresse?[b.adresse,[b.plz,b.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "):"-"],
                ["Land",b.land?({ch:"Schweiz",de:"Deutschland",at:"Österreich",li:"Liechtenstein",fr:"Frankreich",it:"Italien",es:"Spanien",pt:"Portugal",gb:"Vereinigtes Königreich",nl:"Niederlande",be:"Belgien",pl:"Polen",us:"USA",intl:"Anderes Land"}[b.land]||b.land):"-"],
                ["Beschäftigung",b.type||"-"],
                ["Beruf",b.job||"-"],
                ["Nettoeinkommen",b.einkommen?chf(b.einkommen):"-"],
                ["Arbeitgeber",b.arbeitgeber||"-"],
                ["Gewünschter Einzug",b.einzug?new Date(b.einzug).toLocaleDateString("de-CH"):"-"],
                ...(b.mitmieter && b.mitmieter.vorname ? [["Mitmieter*in", mitmieterZeile(b.mitmieter)]] : []),
                ...(Array.isArray(b.weitere_personen) && b.weitere_personen.length ? [["Weitere Personen", weiterePersonenZeile(b.weitere_personen)]] : []),
                ["Keine offenen Betreibungen",b.noDebt?<span style={{color:"#5a6e4a",fontWeight:600}}>✓ Bestätigt</span>:<span style={{color:"#8a8174"}}>- Nicht bestätigt</span>],
              ].map(([l,v])=>(<div key={l} className="ig"><label>{l}</label><span>{v}</span></div>))}
            </div>

            <div style={{background:"#fafaf7",border:"1px solid #2a2d3e",borderRadius:8,padding:"12px 14px",marginBottom:12}}>
              <div style={{fontSize:9.5,color:"#8a8478",textTransform:"uppercase",letterSpacing:".4px",marginBottom:9,fontWeight:700}}>💰 Gewählte Konditionen</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                <div>
                  <div style={{fontSize:10,color:"#8a8478",marginBottom:3,textTransform:"uppercase"}}>Kaution</div>
                  <div style={{fontSize:12.5,color:"#3a352d",fontWeight:500}}>{b.kautionType || ({"3x":"3× Miete (volle Kaution)","2x":"2× Miete","1x":"1× Miete","0x":"Keine Kaution"}[b.kautionOpt]) || "-"}</div>
                  {(() => { const auf = (b.kautionAufschlag!=null && b.kautionAufschlag!=="") ? +b.kautionAufschlag : ({"3x":0,"2x":50,"1x":100,"0x":150}[b.kautionOpt]); return auf>0 ? <div style={{fontSize:11,color:"#c89653",marginTop:2}}>+ CHF {auf}.- / Monat</div> : auf===0 ? <div style={{fontSize:11,color:"#5a7c5e",marginTop:2}}>Kein Servicegebühr</div> : null; })()}
                </div>
                <div>
                  <div style={{fontSize:10,color:"#8a8478",marginBottom:3,textTransform:"uppercase"}}>Möblierung</div>
                  <div style={{fontSize:12.5,color:"#3a352d",fontWeight:500}}>{b.moebliert==="ja"?"🛋 Möbliert":b.moebliert==="nein"?"📦 Unmöbliert":"-"}</div>
                  {b.moeblierungPauschale>0&&<div style={{fontSize:11,color:"#a78bfa",marginTop:2}}>CHF {b.moeblierungPauschale}.- {b.moeblierungModus==="monatlich"?"/ Monat":"einmalig"}</div>}
                </div>
              </div>
            </div>

            {(() => {
              const bContracts = (contracts || []).filter(c => c.bewerberId === b.id);
              if (bContracts.length === 0) return null;
              return (
                <div style={{background:"#fafaf7",border:"1px solid #2a2d3e",borderRadius:8,padding:"12px 14px",marginBottom:12}}>
                  <div style={{fontSize:9.5,color:"#8a8478",textTransform:"uppercase",letterSpacing:".4px",marginBottom:10,fontWeight:700}}>📄 Verträge ({bContracts.length})</div>
                  {bContracts.map((c, idx) => {
                    const statusColors = {
                      "gesendet": {bg:"#fdf2e0",color:"#7a5c3c",border:"#e8c89c",label:"⏱ Gesendet"},
                      "geoeffnet": {bg:"#fdf2e0",color:"#7a5c3c",border:"#e8c89c",label:"👁 Geöffnet"},
                      "geoeffnet_ungelesen": {bg:"#fdf2e0",color:"#7a5c3c",border:"#e8c89c",label:"👁 Geöffnet"},
                      "mieter_signiert": {bg:"#e6eef6",color:"#2c4a6e",border:"#b0c8e0",label:"✍ Wartet auf Gegenzeichnung"},
                      "signiert": {bg:"#e8efde",color:"#3a5230",border:"#c5d5b0",label:"✓ Signiert"},
                      "abgeschlossen": {bg:"#e8efde",color:"#3a5230",border:"#c5d5b0",label:"✓ Abgeschlossen"},
                      "zurueckgezogen": {bg:"#f0ebe1",color:"#7a5c3c",border:"#d8d0c0",label:"✕ Zurückgezogen"},
                      "abgelaufen": {bg:"#fbeae6",color:"#8a3a2e",border:"#e8c5be",label:"⌛ Abgelaufen"},
                    };
                    const sc = statusColors[c.status] || {bg:"#f0ebe1",color:"#5a5249",border:"#d8d0c0",label:c.status||"?"};
                    const isWithdrawable = ["gesendet","geoeffnet","geoeffnet_ungelesen","mieter_signiert"].includes(c.status);
                    const contractTypeLabel = c.contractType === "untermietvertrag" ? "Untermietvertrag" 
                      : c.contractType === "anfangsmietzins" ? "Anfangsmietzins" 
                      : "UMV + AMZ";
                    return (
                      <div key={c.id} style={{marginBottom: idx < bContracts.length-1 ? 12 : 0, paddingBottom: idx < bContracts.length-1 ? 12 : 0, borderBottom: idx < bContracts.length-1 ? "1px solid #e8e3d8" : "none"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
                          <span style={{fontSize:12.5,color:"#3a352d",fontWeight:600}}>{contractTypeLabel}</span>
                          <span style={{display:"inline-block",padding:"3px 9px",borderRadius:11,background:sc.bg,color:sc.color,border:`1px solid ${sc.border}`,fontSize:10.5,fontWeight:600,letterSpacing:".03em"}}>{sc.label}</span>
                        </div>
                        <div style={{fontSize:11,color:"#8a8478",marginBottom:8,display:"grid",gridTemplateColumns:"auto 1fr",gap:"3px 10px"}}>
                          {c.sentAt && (<><span>Gesendet:</span><span>{new Date(c.sentAt).toLocaleDateString("de-CH")} {new Date(c.sentAt).toLocaleTimeString("de-CH",{hour:"2-digit",minute:"2-digit"})}</span></>)}
                          {c.openedAt && (<><span>Geöffnet:</span><span>{new Date(c.openedAt).toLocaleDateString("de-CH")} {new Date(c.openedAt).toLocaleTimeString("de-CH",{hour:"2-digit",minute:"2-digit"})}</span></>)}
                          {c.signedAt && (<><span>Signiert:</span><span style={{color:"#3a5230",fontWeight:600}}>{new Date(c.signedAt).toLocaleDateString("de-CH")} {new Date(c.signedAt).toLocaleTimeString("de-CH",{hour:"2-digit",minute:"2-digit"})}</span></>)}
                          {c.expiresAt && !c.signedAt && (<><span>Läuft ab:</span><span>{new Date(c.expiresAt).toLocaleDateString("de-CH")}</span></>)}
                        </div>
                        {c.signUrl && (
                          <div style={{display:"flex",gap:6,marginBottom:6,alignItems:"center",flexWrap:"wrap"}}>
                            <div style={{fontSize:10.5,color:"#8a8478",flexShrink:0}}>Link:</div>
                            <div style={{fontSize:11,fontFamily:"monospace",color:"#3a352d",background:"#f0ebe1",padding:"4px 8px",borderRadius:4,flex:"1 1 200px",wordBreak:"break-all",minWidth:0}}>{c.signUrl}</div>
                            <button onClick={()=>{navigator.clipboard.writeText(c.signUrl).then(()=>alert("Link kopiert!")).catch(()=>alert("Kopieren fehlgeschlagen"));}} style={{fontSize:10.5,padding:"4px 10px",background:"#f0ebe1",color:"#4a4439",border:"1px solid #d8d0c0",borderRadius:4,cursor:"pointer",flexShrink:0}}>📋 Kopieren</button>
                            <a href={c.signUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:10.5,padding:"4px 10px",background:"#e8efde",color:"#3a5230",border:"1px solid #c5d5b0",borderRadius:4,textDecoration:"none",flexShrink:0}}>↗ Öffnen</a>
                          </div>
                        )}
                        <div style={{display:"flex",gap:6,justifyContent:"flex-end",flexWrap:"wrap"}}>
                          <CountersignButton contract={c} onDone={loadContracts} />
                          {isWithdrawable && (
                            <button onClick={async()=>{
                              if (!confirm(`Vertrag zurueckziehen?${c.status==="mieter_signiert"?"\n\nACHTUNG: Der Mieter hat bereits unterschrieben. Der Vertrag wird nicht gegengezeichnet und ist damit hinfaellig.":""}\n\n${contractTypeLabel}\nGesendet: ${c.sentAt ? new Date(c.sentAt).toLocaleDateString("de-CH") : "-"}\n\nDer Link wird ungueltig. Kann nicht rueckgaengig gemacht werden.`)) return;
                              try { await withdrawContract(c.id); } catch(e){}
                            }} style={{fontSize:10.5,padding:"4px 10px",background:"#fbeae6",color:"#8a3a2e",border:"1px solid #e8c5be",borderRadius:4,cursor:"pointer"}}>
                              ✕ Zurückziehen
                            </button>
                          )}
                          <button onClick={async()=>{
                            if (!confirm(`Vertrag komplett loeschen?\n\n${contractTypeLabel}\n\nDies loescht den Vertrag komplett aus der Datenbank. Kann nicht rueckgaengig gemacht werden.`)) return;
                            try { await deleteContract(c.id); } catch(e){}
                          }} style={{fontSize:10.5,padding:"4px 10px",background:"#fefcf7",color:"#9b4a3e",border:"1px solid #e0bcb0",borderRadius:4,cursor:"pointer"}}>
                            🗑 Löschen
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            
            {b.bemerkung&&(<div style={{background:"#fafaf7",border:"1px solid #2a2d3e",borderRadius:7,padding:"10px 13px",marginBottom:12}}><div style={{fontSize:9.5,color:"#8a8478",textTransform:"uppercase",marginBottom:5}}>Bemerkung</div><div style={{fontSize:12.5,lineHeight:1.6}}>{b.bemerkung}</div></div>)}

            {b.zugeteiltes_zimmer&&(<div style={{background:"#eaeee2",border:"1px solid rgba(90,124,94,.3)",borderRadius:7,padding:"10px 13px",marginTop:12}}><div style={{fontSize:12,color:"#5a7c5e"}}>✓ Zugeteilt zu Zimmer <strong>{b.zugeteiltes_zimmer}</strong></div></div>)}
            
            <DocumentChecklist entityType="applicant" entityId={String(b.id)} documents={documents} onJumpToDocs={()=>setTab("docs")}/>
            </>}
            
            {tab==="docs"&&<DocumentsManager entityType="applicant" entityId={String(b.id)} documents={documents} uploadDocument={uploadDocument} getDocumentUrl={getDocumentUrl} deleteDocument={deleteDocument}/>}
            {tab==="komm"&&(()=>{
              const zimmerRef = b.zugeteiltes_zimmer || b.zimmerWunsch;
              const roomObj = zimmerRef ? rooms.find(r => r.id === zimmerRef) : null;
              const aptObj = roomObj ? apts.find(a => a.id === roomObj.aptId) : null;
              const kautionText = b.kautionOpt==="0x"?"keine Kaution":b.kautionOpt==="1x"?"1 Monatsmiete":b.kautionOpt==="2x"?"2 Monatsmieten":b.kautionOpt==="3x"?"3 Monatsmieten":"";
              const moeblText = b.moebliert==="ja"?"möbliert":b.moebliert==="nein"?"unmöbliert":"";
              const vormieter = (roomObj && roomObj.tenantId) ? (tenants||[]).find(t => t && t.id === roomObj.tenantId) : null;
              const empf = {
                vorname: b.vorname, nachname: b.nachname, email: b.email, phone: b.phone,
                adresse: [aptObj?.adresse, [aptObj?.plz, aptObj?.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "), zimmer: roomObj?.id || "", einzug: b.einzug || "", auszug: "",
                zimmerpreis: roomObj?.miete ? `CHF ${(+roomObj.miete).toLocaleString('de-CH')}` : "",
                moeblierung: moeblText,
                kautionswahl: kautionText,
                tour_link: aptObj?.matterportUrl || "",
                vormieter_name: vormieter ? `${vormieter.vorname||""} ${vormieter.nachname||""}`.trim() : "",
                vormieter_telefon: vormieter ? (vormieter.phone||"") : "",
                absender: meNameB || (b.owner&&String(b.owner).trim()) || "Daan",
                sprache: b.sprache || "de",
                istWohnung: aptIstWohnung(aptObj),
              };
              return <KommunikationTab key={"b"+b.id} empfaenger={empf} zielgruppe="bewerber"/>;
            })()}
          </div>
          </>
        ):<div className="card" style={{margin:0,display:"flex",alignItems:"center",justifyContent:"center",minHeight:200}}><span style={{color:"#8a8478",fontSize:12}}>← Bewerber wählen</span></div>}
      </div>
      )}
      </div>

      {zuteilModal&&b&&(
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setZuteilModal(false)}>
          <div className="modal">
            <div className="mt">🏠 Zimmer zuteilen</div>
            <div style={{background:"#f5efe4",border:"1px solid #2a2d3e",borderRadius:8,padding:"10px 13px",marginBottom:16,fontSize:12.5}}>
              <strong style={{color:"#1f1d18"}}>{b.vorname} {b.nachname}</strong>
            </div>
            <div style={{fontSize:10,color:"#8a8478",textTransform:"uppercase",marginBottom:10}}>Freie Zimmer ({freeRooms.length})</div>
            {freeRooms.length===0?<div className="empty">Aktuell keine freien Zimmer</div>:[...freeRooms].sort((a,c)=>{if(a.id===b.zimmerWunsch)return -1;if(c.id===b.zimmerWunsch)return 1;return 0;}).map(r=>{
              const apt=apts.find(a=>a.id===r.aptId);
              const isWunsch=r.id===b.zimmerWunsch;
              return(
                <div key={r.id} className={`zimmer-option${selZimmer===r.id?" sel":""}`} onClick={()=>setSelZimmer(r.id)} style={isWunsch?{borderColor:"#a08864",background:selZimmer===r.id?"#eaeee2":"#f5efe4"}:undefined}>
                  <div>
                    <div style={{fontWeight:600,fontSize:13,color:selZimmer===r.id?"#5a7c5e":isWunsch?"#a08864":"#1f1d18",display:"flex",alignItems:"center",gap:7}}>{r.id}{isWunsch&&<Bdg label="💭 Wunsch" color="b"/>}</div>
                    <div style={{fontSize:11,color:"#8a8478",marginTop:2}}>{apt?.adresse}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontWeight:600,color:"#5a7c5e",fontSize:13}}>{chf(r.miete)}/Mt.</div>
                    <div style={{fontSize:10.5,color:"#8a8478"}}>{r.balkon?"🌿 Balkon":""}</div>
                  </div>
                </div>
              );
            })}
            {nachRooms.length>0 && (<>
              <div style={{fontSize:10,color:"#8a8478",textTransform:"uppercase",margin:"18px 0 10px"}}>Zimmer mit bevorstehendem Auszug ({nachRooms.length})</div>
              {[...nachRooms].sort((a,c)=>{if(a.id===b.zimmerWunsch)return -1;if(c.id===b.zimmerWunsch)return 1;return 0;}).map(r=>{
                const apt=apts.find(a=>a.id===r.aptId);
                const tn=r.tenantId?tenants.find(x=>x.id===r.tenantId):null;
                const aus=_pdZ(tn&&tn.auszug)||_pdZ(r.mieter_auszug);
                const belegt=(bewerber||[]).find(x=>x.id!==b.id && x.zugeteiltes_zimmer===r.id && x.status!=="Abgesagt");
                return (
                  <div key={r.id} className={`zimmer-option${selZimmer===r.id?" sel":""}`} onClick={()=>{ setSelZimmer(r.id); if(aus) setEinzugDate(new Date(aus.getTime()+86400000).toISOString().slice(0,10)); }} style={{borderColor:"#e0b89c"}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:13,color:selZimmer===r.id?"#5a7c5e":"#1f1d18",display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>{r.id} <span style={{fontSize:10,color:"#c0392b",fontWeight:600}}>Auszug {aus?aus.toLocaleDateString("de-CH"):"-"}</span>{belegt&&<span style={{fontSize:10,color:"#b8843e"}}>schon vorgemerkt</span>}</div>
                      <div style={{fontSize:11,color:"#8a8478",marginTop:2}}>{apt?.adresse} · aktuell: {tn?`${tn.vorname} ${tn.nachname}`:"?"}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontWeight:600,color:"#5a7c5e",fontSize:13}}>{chf(r.miete)}/Mt.</div>
                    </div>
                  </div>
                );
              })}
            </>)}
            <div className="fg" style={{marginTop:14}}><label className="fl">Einzugsdatum</label><input className="fi" type="date" value={einzugDate} onChange={e=>setEinzugDate(e.target.value)}/></div>
            <div className="ma">
              <button className="btn btn-g" onClick={()=>setZuteilModal(false)}>Abbrechen</button>
              <button className="btn btn-gr" onClick={confirmZuteilung} disabled={!selZimmer}>✓ Zuteilung bestätigen</button>
            </div>
          </div>
        </div>
      )}

      {editModal&&b&&(
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setEditModal(false)}>
          <div className="modal" style={{width:620}}>
            <div className="mt">✏ Bewerber bearbeiten</div>

            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Status & Zuständigkeit</div>
            <div className="frow"><div className="fg"><label className="fl">Status</label><select className="fi" value={editForm.status||"Neu"} onChange={EF("status")}><option value="Neu">Neu</option><option value="Zugeteilt">Zugeteilt</option><option value="Abgelehnt">Abgelehnt</option></select></div><div className="fg"><label className="fl">👤 Bearbeitet von</label><select className="fi" value={editForm.owner||""} onChange={EF("owner")}><option value="">-</option><option value="Daan">Daan</option><option value="Tijn">Tijn</option></select></div></div>

            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:18,marginBottom:10,fontWeight:500}}>Persönliche Angaben</div>
            <div className="frow"><div className="fg"><label className="fl">Vorname</label><input className="fi" value={editForm.vorname||""} onChange={EF("vorname")}/></div><div className="fg"><label className="fl">Nachname</label><input className="fi" value={editForm.nachname||""} onChange={EF("nachname")}/></div></div>
            <div className="frow"><div className="fg"><label className="fl">Geburtsdatum</label><input className="fi" type="date" value={toDateInputValue(editForm.geburt)} onChange={EF("geburt")}/></div><div className="fg"><label className="fl">Zivilstand</label><select className="fi" value={editForm.zivilstand||""} onChange={EF("zivilstand")}><option value="">-</option><option>ledig</option><option>verheiratet</option><option>eingetragene Partnerschaft</option><option>geschieden</option><option>verwitwet</option><option>getrennt</option></select></div><div className="fg"><label className="fl">Geschlecht</label><select className="fi" value={editForm.gender||""} onChange={EF("gender")}><option value="">-</option><option value="Frau">Frau</option><option value="Mann">Mann</option><option value="Divers">Divers</option></select></div></div>
            <div className="fg"><label className="fl">Land (Adresse)</label><select className="fi" value={editForm.land||""} onChange={EF("land")}><option value="">Schweiz (Standard)</option>{NATIONALITAETEN_TOP.map(n=><option key={n} value={n}>{n}</option>)}<option disabled>──────────</option>{NATIONALITAETEN_REST.map(n=><option key={n} value={n}>{n}</option>)}</select></div><div className="fg"><label className="fl">Nationalität</label><select className="fi" value={editForm.nat||""} onChange={EF("nat")}><option value="">- Bitte wählen -</option>{NATIONALITAETEN_TOP.map(n=><option key={n} value={n}>{n}</option>)}<option disabled>──────────</option>{NATIONALITAETEN_REST.map(n=><option key={n} value={n}>{n}</option>)}</select></div>

            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:18,marginBottom:10,fontWeight:500}}>Kontakt</div>
            <div className="frow"><div className="fg"><label className="fl">E-Mail</label><input className="fi" type="email" value={editForm.email||""} onChange={EF("email")}/></div><div className="fg"><label className="fl">Telefon</label><input className="fi" value={editForm.phone||""} onChange={EF("phone")}/></div></div>
            <div className="fg"><label className="fl">Adresse</label><input className="fi" value={editForm.adresse||""} onChange={EF("adresse")}/></div>
            <div className="frow"><div className="fg"><label className="fl">PLZ</label><input className="fi" value={editForm.plz||""} onChange={EF("plz")}/></div><div className="fg"><label className="fl">Ort</label><input className="fi" value={editForm.ort||""} onChange={EF("ort")}/></div></div>

            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:18,marginBottom:10,fontWeight:500}}>Beruf & Finanzen</div>
            <div className="frow"><div className="fg"><label className="fl">Beschäftigung</label><select className="fi" value={editForm.type||""} onChange={EF("type")}><option value="">-</option><option value="Arbeitnehmer">Arbeitnehmer</option><option value="Selbstständig">Selbstständig</option><option value="Student">Student</option><option value="AOZ / Sozialhilfe">AOZ / Sozialhilfe</option><option value="Andere">Andere</option></select></div><div className="fg"><label className="fl">Beruf</label><input className="fi" value={editForm.job||""} onChange={EF("job")}/></div></div>
            <div className="frow"><div className="fg"><label className="fl">Arbeitgeber</label><input className="fi" value={editForm.arbeitgeber||""} onChange={EF("arbeitgeber")}/></div><div className="fg"><label className="fl">Nettoeinkommen / Mt.</label><input className="fi" type="number" value={editForm.einkommen||""} onChange={EF("einkommen")}/></div></div>

            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:18,marginBottom:10,fontWeight:500}}>Mietverhältnis</div>
            <div className="frow"><div className="fg"><label className="fl">Wunsch-Zimmer</label><select className="fi" value={editForm.zimmerWunsch||""} onChange={EF("zimmerWunsch")}><option value="">-</option>{(() => {
              const pdW = (s)=>{ if(!s) return null; const t=String(s).trim(); const m=t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); if(m) return new Date(+m[3],+m[2]-1,+m[1]); const d=new Date(t); return isNaN(d.getTime())?null:d; };
              const verf = (r)=>{ if(!r.occupied) return true; const aus=pdW(r.mieter_auszug); const apt=apts.find(a=>a.id===r.aptId); const ende=pdW(apt&&apt.mietende); return !!(aus && ende && aus < ende); };
              return [...rooms].sort((x,y)=>{ const vx=verf(x)?0:1, vy=verf(y)?0:1; if(vx!==vy) return vx-vy; return natSort(x.id,y.id); }).map(r=>{ const a=apts.find(x=>x.id===r.aptId); const frei=verf(r); return <option key={r.id} value={r.id}>{objektLabel(r.id)} - {a?.adresse||""} ({chf(r.miete)}){frei?"":" · belegt"}</option>; });
            })()}</select></div><div className="fg"><label className="fl">Gewünschter Einzug</label><input className="fi" type="date" value={editForm.einzug?editForm.einzug.split("T")[0]:""} onChange={EF("einzug")}/></div></div>
            <div className="frow"><div className="fg"><label className="fl">Möblierung</label><select className="fi" value={editForm.moebliert||""} onChange={EF("moebliert")}><option value="">-</option><option value="ja">Möbliert</option><option value="nein">Unmöbliert</option></select></div></div>

            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:18,marginBottom:10,fontWeight:500}}>Kaution</div>
            <div className="frow"><div className="fg"><label className="fl">Kaution-Variante</label><select className="fi" value={editForm.kautionType||""} onChange={EF("kautionType")}><option value="">-</option><option value="3× Miete (volle Kaution)">3× Miete (volle Kaution)</option><option value="2× Miete">2× Miete (+50/Mt.)</option><option value="1× Miete">1× Miete (+100/Mt.)</option></select></div><div className="fg"><label className="fl">Servicegebühr / Mt.</label><input className="fi" type="number" value={editForm.kautionAufschlag||0} onChange={e=>setEditForm(p=>({...p,kautionAufschlag:+e.target.value}))}/></div></div>

            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:18,marginBottom:10,fontWeight:500}}>Bemerkung</div>
            <div className="fg"><label style={{display:"flex",alignItems:"center",gap:8,padding:"10px 0",fontSize:12.5}}><input type="checkbox" checked={!!editForm.noDebt} onChange={EFB("noDebt")}/> Keine offenen Betreibungen</label></div>
            <div className="fg"><label className="fl">Bemerkung</label><textarea className="fi" rows={3} value={editForm.bemerkung||""} onChange={EF("bemerkung")} style={{resize:"vertical",fontFamily:"inherit"}}/></div>

            <div className="ma">
              <button className="btn btn-g" onClick={()=>setEditModal(false)}>Abbrechen</button>
              <button className="btn btn-p" onClick={saveEdit}>✓ Speichern</button>
            </div>
          </div>
        </div>
      )}

      {uebernahme&&b&&vormieterVon(b)&&(()=>{ const vm=vormieterVon(b); return (
        <div className="ov" onClick={()=>!uebernahme.busy&&setUebernahme(null)}>
          <div className="modal" style={{width:560,padding:"26px 28px"}} onClick={e=>e.stopPropagation()}>
            <div className="ct" style={{marginTop:0}}>Als Nachmieter übernehmen</div>
            <div style={{fontSize:13,lineHeight:1.6,marginBottom:12}}>
              <b>{b.vorname} {b.nachname}</b> übernimmt {vm.roomId||vm.room_id ? <>das Zimmer <b>{vm.roomId||vm.room_id}</b></> : "die Wohnung"} von <b>{vm.vorname} {vm.nachname}</b>.
            </div>
            <div className="frow">
              <div className="fg"><label className="fl">Einzug Nachmieter</label><input className="fi" type="date" value={uebernahme.einzug} onChange={e=>{ const v=e.target.value; let aus=uebernahme.auszug; if(v){ const d=new Date(v+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()-1); aus=d.toISOString().slice(0,10);} setUebernahme(x=>({...x,einzug:v,auszug:aus})); }}/></div>
              <div className="fg"><label className="fl">Auszug Vormieter (letzter Tag)</label><input className="fi" type="date" value={uebernahme.auszug} onChange={e=>setUebernahme(x=>({...x,auszug:e.target.value}))}/></div>
            </div>
            <div style={{fontSize:12,color:"#5a5448",lineHeight:1.6,background:"#f5f2ec",borderRadius:8,padding:"10px 12px"}}>
              Das passiert:<br/>
              1. Beim Vormieter wird der Auszug eingetragen und eine bestätigte Kündigung „per Nachmieter“ erfasst. Er sieht das im Mieterportal.<br/>
              2. Die Bewerbung wird als übernommen markiert.<br/>
              3. Der Vertrag für den Nachmieter öffnet sich mit Zimmer und Einzug.<br/>
              4. Sobald du den Vertrag gegenzeichnest, bekommt der Vormieter automatisch eine Mail, dass sein Mietverhältnis endet.
            </div>
            <div className="ma">
              <button className="btn btn-g" disabled={uebernahme.busy} onClick={()=>setUebernahme(null)}>Abbrechen</button>
              <button className="btn btn-p" disabled={uebernahme.busy} onClick={uebernahmeBestaetigen}>{uebernahme.busy?"Speichert…":"Übernehmen & Vertrag öffnen"}</button>
            </div>
          </div>
        </div>); })()}
      {vertragModal&&b&&vertragData&&(
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setVertragModal(false)}>
          <div className="modal" style={{width:600}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:4}}>
              <div className="mt" style={{marginBottom:0}}>📄 Untermietvertrag erstellen</div>
              <button className="btn btn-g btn-sm" onClick={()=>{ setVertragModal(false); setSendResult(null); }} disabled={sending} title="Schliessen" style={{flexShrink:0}}>✕ Abbrechen</button>
            </div>
            <div style={{height:14}}/>
            <div style={{background:"#f5efe4",border:"1px solid #ddd0b8",borderRadius:8,padding:"12px 16px",marginBottom:18,fontSize:12.5}}>
              <strong style={{color:"#1a1814"}}>{b.vorname} {b.nachname}</strong>
              <div style={{color:"#8a8174",fontSize:11.5,marginTop:3}}>{b.email} · {b.phone}</div>
            </div>
            
            {(() => {
              const activeContracts = (contracts || []).filter(c => c.bewerberId === b.id && !["zurueckgezogen","abgelaufen"].includes(c.status));
              const allContracts = (contracts || []).filter(c => c.bewerberId === b.id);
              if (allContracts.length === 0) return null;
              return (
                <div style={{marginBottom:20,padding:"14px 16px",background:activeContracts.length>0?"#fdf2e0":"#fafaf7",border:`1px solid ${activeContracts.length>0?"#e8c89c":"#e1d8c5"}`,borderRadius:8}}>
                  <div style={{fontSize:9.5,color:"#7a5c3c",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:600}}>
                    {activeContracts.length > 0 ? "⚠ Bereits ausgestellte Verträge" : "Frühere Verträge"}
                  </div>
                  {activeContracts.length > 0 && (
                    <div style={{fontSize:12,color:"#4a4439",marginBottom:12,lineHeight:1.5}}>
                      Dieser Bewerber hat bereits einen aktiven Vertrag. Um Änderungen an den Konditionen zu machen, ziehe den bisherigen Vertrag zuerst zurück.
                    </div>
                  )}
                  {allContracts.map((c, idx) => {
                    const statusColors = {
                      "gesendet": {bg:"#fdf2e0",color:"#7a5c3c",border:"#e8c89c",label:"⏱ Gesendet"},
                      "geoeffnet": {bg:"#fdf2e0",color:"#7a5c3c",border:"#e8c89c",label:"👁 Geöffnet"},
                      "geoeffnet_ungelesen": {bg:"#fdf2e0",color:"#7a5c3c",border:"#e8c89c",label:"👁 Geöffnet"},
                      "mieter_signiert": {bg:"#e6eef6",color:"#2c4a6e",border:"#b0c8e0",label:"✍ Wartet auf Gegenzeichnung"},
                      "signiert": {bg:"#e8efde",color:"#3a5230",border:"#c5d5b0",label:"✓ Signiert"},
                      "abgeschlossen": {bg:"#e8efde",color:"#3a5230",border:"#c5d5b0",label:"✓ Abgeschlossen"},
                      "zurueckgezogen": {bg:"#f0ebe1",color:"#7a5c3c",border:"#d8d0c0",label:"✕ Zurückgezogen"},
                      "abgelaufen": {bg:"#fbeae6",color:"#8a3a2e",border:"#e8c5be",label:"⌛ Abgelaufen"},
                    };
                    const sc = statusColors[c.status] || {bg:"#f0ebe1",color:"#5a5249",border:"#d8d0c0",label:c.status||"?"};
                    const isActive = ["gesendet","geoeffnet","geoeffnet_ungelesen","mieter_signiert"].includes(c.status);
                    const contractTypeLabel = c.contractType === "untermietvertrag" ? "UMV" : c.contractType === "anfangsmietzins" ? "AMZ" : "UMV + AMZ";
                    return (
                      <div key={c.id} style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:6,padding:"10px 12px",marginBottom:idx<allContracts.length-1?8:0}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,flexWrap:"wrap",gap:6}}>
                          <span style={{fontSize:12,color:"#3a352d",fontWeight:600}}>{contractTypeLabel} {c.sentAt ? `· ${new Date(c.sentAt).toLocaleDateString("de-CH")}` : ""}</span>
                          <span style={{display:"inline-block",padding:"2px 8px",borderRadius:10,background:sc.bg,color:sc.color,border:`1px solid ${sc.border}`,fontSize:10,fontWeight:600}}>{sc.label}</span>
                        </div>
                        {c.signUrl && (
                          <div style={{display:"flex",gap:5,marginBottom:6,alignItems:"center",flexWrap:"wrap"}}>
                            <div style={{fontSize:10.5,fontFamily:"monospace",color:"#3a352d",background:"#f5efe4",padding:"3px 7px",borderRadius:3,flex:"1 1 180px",wordBreak:"break-all",minWidth:0}}>{c.signUrl}</div>
                            <button type="button" onClick={()=>{navigator.clipboard.writeText(c.signUrl).then(()=>alert("Link kopiert!")).catch(()=>alert("Kopieren fehlgeschlagen"));}} style={{fontSize:10,padding:"3px 8px",background:"#f0ebe1",color:"#4a4439",border:"1px solid #d8d0c0",borderRadius:3,cursor:"pointer",flexShrink:0}}>📋 Kopieren</button>
                            <a href={c.signUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:10,padding:"3px 8px",background:"#e8efde",color:"#3a5230",border:"1px solid #c5d5b0",borderRadius:3,textDecoration:"none",flexShrink:0}}>↗ Öffnen</a>
                          </div>
                        )}
                        {isActive && (
                          <div style={{display:"flex",justifyContent:"flex-end",gap:5}}>
                            <button type="button" onClick={async()=>{
                              if (!confirm(`Vertrag zurueckziehen?${c.status==="mieter_signiert"?"\n\nACHTUNG: Der Mieter hat bereits unterschrieben. Der Vertrag wird nicht gegengezeichnet und ist damit hinfaellig.":""}\n\n${contractTypeLabel}\nGesendet: ${c.sentAt ? new Date(c.sentAt).toLocaleDateString("de-CH") : "-"}\n\nDer Link wird ungueltig. Danach kannst du unten einen neuen Vertrag mit angepassten Konditionen erstellen.`)) return;
                              try { await withdrawContract(c.id); } catch(e){}
                            }} style={{fontSize:10.5,padding:"4px 10px",background:"#fbeae6",color:"#8a3a2e",border:"1px solid #e8c5be",borderRadius:4,cursor:"pointer"}}>
                              ✕ Zurückziehen
                            </button>
                          </div>
                        )}
                        {c.status === "mieter_signiert" && (
                          <div style={{display:"flex",justifyContent:"flex-end",gap:5}}>
                            <CountersignButton contract={c} onDone={loadContracts} onSigned={(rid)=>{ if(rid) setSelZimmer(rid); if(b&&b.einzug){ var _d=_pdZ(b.einzug); if(_d){ setEinzugDate(_d.getFullYear()+"-"+String(_d.getMonth()+1).padStart(2,"0")+"-"+String(_d.getDate()).padStart(2,"0")); } } setZuteilModal(true); }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Mietobjekt</div>
            <div className="frow" style={{marginBottom:14}}>
              <div className="fg"><label className="fl">Zimmer</label><select className="fi" value={vertragData.zimmerId} onChange={e=>{
                const newId = e.target.value;
                const room = rooms.find(r=>r.id===newId);
                const apt = room ? apts.find(a=>a.id===room.aptId) : null;
                setVertragData(p=>{
                  const bruttomiete = room ? +room.miete : p.bruttomiete;
                  const nettomiete = bruttomiete - (p.nebenkosten||100);
                  const kautionBetrag = (bruttomiete + (p.strom||25)) * (p.kautionMonate||0);
                  const total = bruttomiete + (p.strom||25) + (p.aufschlag||0);
                  const neu = {
                    ...p,
                    zimmerId: newId,
                    apt: apt || p.apt,
                    room: room || p.room,
                    adresse: apt?.adresse || p.adresse,
                    plz: apt?.plz || p.plz,
                    ort: apt?.ort || p.ort,
                    bruttomiete, nettomiete, kautionBetrag, total,
                  };
                  if (apt && apt.vermietungsart === "wohnung") return wohnungVertragswerte(neu, apt, room, p.personen || 1);
                  if (p.vertragsart === "wohnung") { const { vertragsart, ...rest } = neu; return { ...rest, nebenkosten: 100, nettomiete: bruttomiete - 100, strom: 25, total: bruttomiete + 25 + (p.aufschlag||0), kautionBetrag: (bruttomiete + 25) * (p.kautionMonate||0) }; }
                  return neu;
                });
                // Sync zurueck an Bewerber
                updateBewerber(b.id, { zugeteiltes_zimmer: newId });
              }}>
                {!rooms.find(r=>r.id===vertragData.zimmerId) && vertragData.zimmerId && <option value={vertragData.zimmerId}>{vertragData.zimmerId} (aktuell)</option>}
                {[...rooms].sort((a,b)=>String(a.id).localeCompare(String(b.id))).map(r=>{
                  const a = apts.find(x=>x.id===r.aptId);
                  return <option key={r.id} value={r.id}>{objektLabel(r.id)} - {a?.adresse||""} ({chf(r.miete)})</option>;
                })}
              </select></div>
              <div className="fg"><label className="fl">Adresse</label><input className="fi" value={vertragData.adresse} onChange={e=>setVertragData(p=>({...p,adresse:e.target.value}))}/></div>
            </div>
            <div className="frow" style={{marginBottom:18}}>
              <div className="fg"><label className="fl">PLZ</label><input className="fi" value={vertragData.plz} onChange={e=>setVertragData(p=>({...p,plz:e.target.value}))}/></div>
              <div className="fg"><label className="fl">Ort</label><input className="fi" value={vertragData.ort} onChange={e=>setVertragData(p=>({...p,ort:e.target.value}))}/></div>
            </div>
            {istWohnungsVertrag(vertragData) && (
              <div style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"12px 16px",marginBottom:18}}>
                <div style={{fontSize:12.5,fontWeight:600,color:"#1a1814",marginBottom:6}}>Wohnung (unmöbliert)</div>
                <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <label className="fl" style={{margin:0}}>Anzahl Personen</label>
                  <input className="fi" type="number" min="1" max="10" value={vertragData.personen||1} style={{width:80,margin:0}} onChange={e=>{ const n=Math.max(1,+e.target.value||1); setVertragData(p=>wohnungVertragswerte(p, p.apt, null, n)); updateBewerber(b.id,{personen:n}); }}/>
                  <label className="fl" style={{margin:"0 0 0 10px"}}>Nebenkosten (CHF/Mt.)</label>
                  <input className="fi" type="number" min="0" value={vertragData.nebenkosten??""} style={{width:90,margin:0}} onChange={e=>{ const v=e.target.value; setVertragData(p=>wohnungVertragswerte({...p, nkManuell: v===""?null:v}, p.apt, null, p.personen||1)); }}/>
                  <span style={{fontSize:11.5,color:"#8a8174"}}>werden von der Bruttomiete abgezogen (Nettomiete CHF {vertragData.nettomiete}). Standard: frühere NK der Wohnung. Strom CHF 25 pro Person.</span>
                </div>
                <MitmieterEditor value={vertragData.mitmieter} draft={vertragData._mmDraft}
                  onChange={(mm, draft) => { setVertragData(p => ({ ...p, mitmieter: mm, _mmDraft: draft })); updateBewerber(b.id, { mitmieter: mm ? { ...mm, aktiv: true } : (draft && Object.keys(draft).length ? { ...draft, aktiv: false } : null) }); }}/>
              </div>
            )}

            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Mietdauer</div>
            <div className="fg" style={{marginBottom:8}}>
              <label className="fl">Einzugsdatum</label>
              <input className="fi" type="date" value={vertragData.einzug?vertragData.einzug.split("T")[0]:""} onChange={e=>setVertragData(p=>({...p,einzug:e.target.value}))}/>
            </div>
            <div className="fg" style={{marginBottom:8}}>
              <label className="fl">Enddatum · optional, macht den Vertrag befristet</label>
              <input className="fi" type="date" max={vertragData.apt?.mietende?toDateInputValue(vertragData.apt.mietende):undefined} value={vertragData.mietende?vertragData.mietende.split("T")[0]:""} onChange={e=>setVertragData(p=>({...p,mietende:e.target.value}))}/>
              {vertragData.apt?.mietende && <div style={{fontSize:10.5,color:"#8a8174",marginTop:4}}>Die Wohnung endet am {vertragData.apt.mietende}. Ein späteres Enddatum ist nicht möglich.</div>}
            </div>
            <div style={{marginBottom:18,padding:"10px 14px",background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:6,fontSize:11.5,color:"#4a4439"}}>
              {(() => {
                function parseD(s) {
                  if (!s) return null;
                  const str = String(s).trim();
                  if (!str) return null;
                  if (/^\d{4}-\d{2}-\d{2}/.test(str)) { const d=new Date(str); return isNaN(d.getTime())?null:d; }
                  const m = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
                  if (m) { const d=new Date(+m[3], +m[2]-1, +m[1]); return isNaN(d.getTime())?null:d; }
                  const d = new Date(str); return isNaN(d.getTime())?null:d;
                }
                const einzug = parseD(vertragData.einzug);
                const userEnde = parseD(vertragData.mietende);
                const aptEnde = parseD(vertragData.apt?.mietende);
                const ende = userEnde || aptEnde;
                if (!einzug) return "ℹ Bitte Einzugsdatum setzen";
                if (!ende) return "→ Vertrag ist UNBEFRISTET (kein Enddatum gesetzt)";
                if (userEnde && aptEnde && userEnde > aptEnde) return `⚠ Enddatum darf nicht nach dem Mietende der Wohnung (${aptEnde.toLocaleDateString("de-CH")}) liegen`;
                const m = (ende - einzug) / (1000*60*60*24*30.44);
                if (ende <= einzug) return "⚠ Enddatum liegt vor dem Einzug";
                const istManuell = !!userEnde;
                const _immer = !!(vertragData.apt && (vertragData.apt.immer_befristet || vertragData.apt.vermietungsart === "wohnung"));
                if (m > 0 && (m < 12 || _immer)) return `→ Vertrag ist BEFRISTET bis ${ende.toLocaleDateString("de-CH")} (${Math.round(m)} Monate${istManuell?", manuell gesetzt":", aus Wohnung"}${_immer && m >= 12 ? ", Wohnung immer befristet" : ""})`;
                return `→ Vertrag ist UNBEFRISTET (Wohnung endet in ${Math.round(m)} Monaten, mindestens 12)`;
              })()}
            </div>

            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Mietzins-Aufstellung</div>
            <div style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"14px 18px",marginBottom:14}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 110px",gap:8,alignItems:"center",fontSize:12.5}}>
                <span>Nettomiete</span><input className="fi" type="number" value={vertragData.nettomiete} onChange={e=>{const v=+e.target.value;setVertragData(p=>({...p,nettomiete:v,bruttomiete:v+p.nebenkosten,total:v+p.nebenkosten+p.strom+p.aufschlag}));}} style={{textAlign:"right"}}/>
                <span>Nebenkosten</span><input className="fi" type="number" value={vertragData.nebenkosten} onChange={e=>{const v=+e.target.value;setVertragData(p=>({...p,nebenkosten:v,bruttomiete:p.nettomiete+v,total:p.nettomiete+v+p.strom+p.aufschlag}));}} style={{textAlign:"right"}}/>
                <span style={{fontWeight:600,borderTop:"1px solid #1a1814",paddingTop:6}}>Bruttomiete</span>
                <span style={{fontWeight:600,textAlign:"right",borderTop:"1px solid #1a1814",paddingTop:6}}>CHF {vertragData.bruttomiete.toLocaleString('de-CH')}</span>
                <span>Stromkosten</span><input className="fi" type="number" value={vertragData.strom} onChange={e=>{const v=+e.target.value;setVertragData(p=>({...p,strom:v,total:p.bruttomiete+v+p.aufschlag}));}} style={{textAlign:"right"}}/>
                {vertragData.aufschlag>0&&(<>
                  <span style={{color:"#b8843e"}}>Kautions-Servicegebühr</span>
                  <span style={{color:"#b8843e",textAlign:"right",fontWeight:500}}>CHF {vertragData.aufschlag}</span>
                </>)}
                <span style={{fontWeight:700,borderTop:"2px solid #1a1814",paddingTop:8,fontSize:14}}>Total / Mt.</span>
                <span style={{fontWeight:700,textAlign:"right",borderTop:"2px solid #1a1814",paddingTop:8,fontSize:14,color:"#1a1814"}}>CHF {vertragData.total.toLocaleString('de-CH')}</span>
              </div>
            </div>

            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Anfangsmietzinsformular · Früherer Mietzins</div>
            <div style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"12px 18px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
              <div>
                <div style={{fontSize:12.5,fontWeight:500}}>Früherer Mietzins (brutto)</div>
                <div style={{fontSize:10.5,color:"#8a8174",marginTop:2}}>Nur fürs Anfangsmietzinsformular. Leer lassen bei Erstvermietung.</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{color:"#1a1814",fontSize:13}}>CHF</span>
                <input className="fi" type="number" placeholder="leer" value={vertragData.fruehererMietzins||""} onChange={e=>setVertragData(p=>({...p,fruehererMietzins:e.target.value===""?"":+e.target.value}))} style={{width:120,textAlign:"right"}}/>
              </div>
            </div>

            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Kaution und Servicegebühr</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
              {[
                {monate:3,aufschlag:0,label:"3× Monatsmiete",note:"Volle Kaution, keine Gebühr"},
                {monate:2,aufschlag:50,label:"2× Monatsmiete",note:"+ CHF 50 / Monat Servicegebühr für Kautionsreduktion"},
                {monate:1,aufschlag:100,label:"1× Monatsmiete",note:"+ CHF 100 / Monat Servicegebühr für Kautionsreduktion"},
              ].map(opt=>{
                const sel=vertragData.kautionMonate===opt.monate;
                return (
                  <label key={opt.monate} style={{padding:"12px 14px",background:sel?"#f5efe4":"#fefcf7",border:`1px solid ${sel?"#1a1814":"#e1d8c5"}`,borderRadius:8,cursor:"pointer",fontSize:12.5,display:"block"}} onClick={()=>{
                    const brutto = +vertragData.bruttomiete || 0;
                    const strom = (vertragData.strom != null && vertragData.strom !== "") ? +vertragData.strom : 25;
                    const newBetrag = (brutto + strom) * opt.monate;
                    setVertragData(p=>({
                      ...p,
                      kautionMonate:opt.monate,
                      kautionBetrag:newBetrag,
                      aufschlag:opt.aufschlag,
                      total: brutto + strom + opt.aufschlag,
                    }));
                    // Sync zurueck an Bewerber
                    const typeMap = {3:"3x",2:"2x",1:"1x"};
                    updateBewerber(b.id, { kautionType: typeMap[opt.monate], kautionAufschlag: opt.aufschlag });
                  }}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                      <input type="radio" name="kaution" checked={sel} readOnly/>
                      <span style={{fontWeight:600}}>{opt.label}</span>
                    </div>
                    <div style={{fontSize:11,color:"#8a8174",marginLeft:24}}>{opt.note}</div>
                  </label>
                );
              })}
            </div>
            <div style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"12px 18px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:13,fontWeight:600,gap:12}}>
              <span>Kautionsbetrag {vertragData.kautionMonate>0?<span style={{fontSize:10.5,color:"#8a8174",fontWeight:400,marginLeft:6}}>(Standard: CHF {((+vertragData.bruttomiete||0)+(+vertragData.strom||25))*vertragData.kautionMonate})</span>:null}</span>
              {vertragData.kautionMonate > 0 ? (
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{color:"#1a1814"}}>CHF</span>
                  <input className="fi" type="number" step="1" value={vertragData.kautionBetrag} onChange={e=>setVertragData(p=>({...p,kautionBetrag:+e.target.value||0}))} style={{width:120,textAlign:"right",fontSize:13,fontWeight:600,padding:"6px 10px"}}/>
                </div>
              ) : <span style={{color:"#1a1814"}}>-</span>}
            </div>
            
            {/* Custom Servicegebühr */}
            <div style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"12px 18px",marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:13,fontWeight:600,gap:12}}>
              <span>Servicegebühr / Mt. <span style={{fontSize:10.5,color:"#8a8174",fontWeight:400,marginLeft:6}}>(Standard bei {vertragData.kautionMonate}× Miete: CHF {vertragData.kautionMonate===0?150:vertragData.kautionMonate===1?100:vertragData.kautionMonate===2?50:0})</span></span>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{color:"#1a1814"}}>CHF</span>
                <input className="fi" type="number" step="1" value={vertragData.aufschlag||0} onChange={e=>{
                  const val = +e.target.value || 0;
                  setVertragData(p=>({
                    ...p,
                    aufschlag: val,
                    total: (+p.bruttomiete||0) + (+p.strom||25) + val,
                  }));
                  updateBewerber(b.id, { kautionAufschlag: val });
                }} style={{width:120,textAlign:"right",fontSize:13,fontWeight:600,padding:"6px 10px"}}/>
              </div>
            </div>

            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Vertragsbedingungen</div>
            <div style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"14px 18px",marginBottom:18}}>
              <div className="frow" style={{marginBottom:0}}>
                <div className="fg">
                  <label className="fl">Mindest-Mietdauer (Monate)</label>
                  <input className="fi" type="number" min="1" max="60" value={vertragData.minMietdauer||6} onChange={e=>setVertragData(p=>({...p,minMietdauer:+e.target.value||6}))}/>
                  <div style={{fontSize:10.5,color:"#8a8174",marginTop:4}}>Standard: 6 Monate</div>
                </div>
                <div className="fg">
                  <label className="fl">Kündigungsfrist (Monate)</label>
                  <input className="fi" type="number" min="1" max="6" value={vertragData.kuendigungsfrist||3} onChange={e=>setVertragData(p=>({...p,kuendigungsfrist:+e.target.value||3}))}/>
                  <div style={{fontSize:10.5,color:"#8a8174",marginTop:4}}>Standard: 3 Monate</div>
                </div>
              </div>
            </div>

            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Spezielle Klausel</div>
            <div style={{marginBottom:18}}>
              <textarea className="fi" style={{width:"100%",minHeight:70,resize:"vertical",lineHeight:1.5}} value={vertragData.sonderklausel||""} onChange={e=>setVertragData(p=>({...p,sonderklausel:e.target.value}))} placeholder="Deutsch. Wird als Punkt 15.8 in den Untermietvertrag aufgenommen."/>
              <textarea className="fi" style={{width:"100%",minHeight:56,resize:"vertical",lineHeight:1.5,marginTop:8}} value={vertragData.sonderklausel_en||""} onChange={e=>setVertragData(p=>({...p,sonderklausel_en:e.target.value}))} placeholder="Optional: übersteuert die automatische Übersetzung. Leer lassen = wird beim Erstellen einmal automatisch übersetzt und gespeichert."/>
            </div>

            {!istWohnungsVertrag(vertragData) && (<>
            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Möblierung</div>
            <div style={{display:"flex",gap:10,marginBottom:10}}>
              <label style={{flex:1,padding:"10px 14px",background:vertragData.moebliert?"#f5efe4":"#fefcf7",border:`1px solid ${vertragData.moebliert?"#1a1814":"#e1d8c5"}`,borderRadius:8,cursor:"pointer",fontSize:12.5,display:"flex",alignItems:"center",gap:8}}>
                <input type="radio" checked={vertragData.moebliert} onChange={()=>{
                  setVertragData(p=>({...p,moebliert:true}));
                  updateBewerber(b.id, { moebliert: "ja" });
                }}/> Möbliert
              </label>
              <label style={{flex:1,padding:"10px 14px",background:!vertragData.moebliert?"#f5efe4":"#fefcf7",border:`1px solid ${!vertragData.moebliert?"#1a1814":"#e1d8c5"}`,borderRadius:8,cursor:"pointer",fontSize:12.5,display:"flex",alignItems:"center",gap:8}}>
                <input type="radio" checked={!vertragData.moebliert} onChange={()=>{
                  setVertragData(p=>({...p,moebliert:false}));
                  updateBewerber(b.id, { moebliert: "nein" });
                }}/> Unmöbliert
              </label>
            </div>
            {vertragData.moebliert && (
              <div style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"14px 18px",marginBottom:18}}>
                <div style={{display:"flex",gap:8,marginBottom:12}}>
                  {[["einmalig","Einmalig kaufen",990],["monatlich","Monatlich mieten",150]].map(([modus,label,def])=>{
                    const on=(vertragData.moeblierungModus||"einmalig")===modus;
                    return (<button key={modus} onClick={()=>{ setVertragData(p=>({...p,moeblierungModus:modus,moeblierungPauschale:def})); updateBewerber(b.id,{moeblierungModus:modus,moeblierungPauschale:def}); }} style={{flex:1,padding:"9px 12px",borderRadius:7,cursor:"pointer",fontSize:12,fontWeight:on?600:400,border:`1px solid ${on?"#1a1814":"#d8d0c0"}`,background:on?"#1a1814":"#fff",color:on?"#fff":"#5a5249"}}>{label}</button>);
                  })}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:13,fontWeight:600,gap:12}}>
                  <span>{(vertragData.moeblierungModus||"einmalig")==="monatlich"?"Möblierung pro Monat":"Möblierung einmalig"}</span>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{color:"#1a1814"}}>CHF</span>
                    <input className="fi" type="number" step="1" value={vertragData.moeblierungPauschale||((vertragData.moeblierungModus||"einmalig")==="monatlich"?150:990)} onChange={e=>{
                      const val = +e.target.value || 0;
                      setVertragData(p=>({...p, moeblierungPauschale: val}));
                      updateBewerber(b.id, { moeblierungPauschale: val });
                    }} style={{width:120,textAlign:"right",fontSize:13,fontWeight:600,padding:"6px 10px"}}/>
                    <span style={{color:"#8a8174",fontSize:11}}>{(vertragData.moeblierungModus||"einmalig")==="monatlich"?"/Mt.":"einmalig"}</span>
                  </div>
                </div>
              </div>
            )}
            {!vertragData.moebliert && <div style={{marginBottom:18}}/>}
            </>)}

            <div style={{fontSize:11,color:"#6e6a62",marginBottom:8,letterSpacing:".05em",textTransform:"uppercase",fontWeight:600}}>⬇ Einzeln herunterladen (ohne Versand)</div>
            <div className="ma" style={{flexWrap:"wrap"}}>
              <button className="btn btn-g" onClick={()=>{ setVertragModal(false); setSendResult(null); }} disabled={sending}>Abbrechen</button>
              <button className="btn btn-s" onClick={generateContract} disabled={sending||dlBusy==="umv"}>{dlBusy==="umv"?"⏳ …":"📄 UMV herunterladen"}</button>
              <button className="btn btn-s" onClick={generateAnfangsmietzins} disabled={sending||dlBusy==="amz"}>{dlBusy==="amz"?"⏳ …":"📄 AMZ herunterladen"}</button>
            </div>
            <div style={{height:1,background:"#e8e3d8",margin:"12px 0"}}/>
            <div style={{fontSize:11,color:"#6e6a62",marginBottom:10,letterSpacing:".05em",textTransform:"uppercase",fontWeight:600}}>📤 Digital senden zum Online-Unterzeichnen</div>
            <button className="btn btn-p" style={{width:"100%",justifyContent:"center",padding:"12px 18px",fontSize:13.5}} onClick={async()=>{
                if (!b || !vertragData) return;
                if (!b.email) { alert("Bewerber hat keine Email-Adresse."); return; }
                if (istWohnungsVertrag(vertragData) && vertragData.mitmieter && mitmieterFehlt(vertragData.mitmieter)) { alert("Mitmieter*in unvollständig: " + mitmieterFehlt(vertragData.mitmieter)); return; }
                setSending(true); setSendResult(null); setSendProgress({message:"Vorschau wird erstellt…",pct:0.1});
                try {
                  const pre = await vertragPdfsErstellen(b, vertragData, ["umv","amz"], (msg,pct)=>setSendProgress({message:msg,pct}));
                  setVorschauB(pre);
                } catch(err) { setSendResult({success:false, error: "Vorschau fehlgeschlagen: " + err.message}); }
                finally { setSending(false); }
              }} disabled={sending}>{sending ? `⏳ ${sendProgress.message}` : "👁 Vorschau und digital senden"}</button>
            <VertragVorschauModal vorschau={vorschauB} email={b.email} busy={sending} progress={sendProgress && sendProgress.message} onClose={()=>setVorschauB(null)} onConfirm={async()=>{
                setSending(true); setSendResult(null); setSendProgress({message:"Starte...",pct:0});
                try {
                  const result = await sendContractForSigning(b, vertragData, (msg,pct)=>setSendProgress({message:msg,pct}), undefined, vorschauB);
                  setSendResult({success:true, ...result}); setVorschauB(null);
                } catch(err) {
                  console.error("sendContractForSigning failed:", err);
                  setSendResult({success:false, error: err.message}); setVorschauB(null);
                } finally { setSending(false); }
              }}/>
            
            {sending && (
              <div style={{marginTop:14,padding:"10px 12px",background:"#f5efe4",border:"1px solid #e1d8c5",borderRadius:8}}>
                <div style={{height:6,background:"#e1d8c5",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.round(sendProgress.pct*100)}%`,background:"#1a1814",transition:"width .3s"}}></div>
                </div>
                <div style={{fontSize:11.5,color:"#6e6a62",marginTop:6}}>{sendProgress.message}</div>
              </div>
            )}
            
            {sendResult && sendResult.success && (
              <div style={{marginTop:14,padding:"14px 16px",background:"#e8f3ed",border:"1px solid #a5d4b8",borderRadius:8}}>
                <div style={{fontWeight:600,fontSize:13,color:"#1a5a32",marginBottom:6}}>✓ Vertrag erfolgreich gesendet</div>
                <div style={{fontSize:11.5,color:"#2d5e44",lineHeight:1.55}}>
                  {sendResult.emailSent ? `Email gesendet an ${b.email}` : "⚠ Email-Versand fehlgeschlagen - manuell nachsenden"}
                </div>
                <div style={{fontSize:11.5,color:"#2d5e44",marginTop:6}}>
                  Sign-Link: <a href={sendResult.signUrl} target="_blank" style={{color:"#1a5a32",textDecoration:"underline"}}>{sendResult.signUrl}</a>
                </div>
              </div>
            )}
            
            {sendResult && !sendResult.success && (
              <div style={{marginTop:14,padding:"14px 16px",background:"#fdecec",border:"1px solid #f0a5a5",borderRadius:8}}>
                <div style={{fontWeight:600,fontSize:13,color:"#8a1a1a",marginBottom:6}}>✗ Fehler beim Senden</div>
                <div style={{fontSize:11.5,color:"#5a1a1a",lineHeight:1.55}}>{sendResult.error}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

