// ─── MIETER ──────────────────────────────────────────────────────────────────
function MieterSchluessel({tenant, updateTenant}) {
  const nrStart = ((tenant.schluesselNr||"").toString().trim() || (tenant.schluesselAnzahl||"").toString().trim());
  const [edit, setEdit] = useState(false);
  const [nr, setNr] = useState(nrStart);
  const [extra, setExtra] = useState(tenant.extraSchluessel||"");
  const [busy, setBusy] = useState(false);
  function oeffnen(){ setNr(nrStart); setExtra(tenant.extraSchluessel||""); setEdit(true); }
  async function speichern(){
    setBusy(true);
    try{ const v=nr.trim(); await updateTenant(tenant.id, {schluesselAnzahl:v, schluesselNr:v, extraSchluessel:extra.trim()}); setEdit(false); }
    finally{ setBusy(false); }
  }
  return (
    <div>
      <div style={{background:"#f3f6f0",border:"1px solid #d9e2d2",borderRadius:8,padding:"12px 14px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:edit?10:8}}>
          <div style={{fontSize:12,fontWeight:600,color:"#3a5230"}}>Schlüssel des Mieters</div>
          {!edit && <button className="btn btn-g btn-sm" style={{width:"auto"}} onClick={oeffnen}>✏ Bearbeiten</button>}
        </div>
        {edit ? (<>
          <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-end"}}>
            <div style={{flex:"0 1 180px",minWidth:0}}><label className="fl">Schlüsselnummer</label><input className="fi" style={{fontFamily:"monospace"}} value={nr} onChange={e=>setNr(e.target.value)} placeholder="z.B. A145 oder 12B" autoFocus/></div>
            <div style={{flex:"1 1 220px",minWidth:0}}><label className="fl">Extra-Schlüssel</label><input className="fi" value={extra} onChange={e=>setExtra(e.target.value)} placeholder="z.B. 1× Briefkasten, 1× Keller"/></div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:10}}>
            <button className="btn btn-g btn-sm" style={{width:"auto"}} disabled={busy} onClick={()=>setEdit(false)}>Abbrechen</button>
            <button className="btn btn-p btn-sm" style={{width:"auto"}} disabled={busy} onClick={speichern}>{busy?"Speichert…":"✓ Speichern"}</button>
          </div>
        </>) : (
          <div style={{display:"flex",gap:28,flexWrap:"wrap",fontSize:13}}>
            <div><div className="fl" style={{marginBottom:3}}>Schlüsselnummer</div><div style={{fontWeight:600,fontFamily:nrStart?"monospace":"inherit",color:nrStart?"inherit":"#a4442e"}}>{nrStart||"fehlt"}</div></div>
            <div style={{minWidth:0}}><div className="fl" style={{marginBottom:3}}>Extra-Schlüssel</div><div style={{fontWeight:600,whiteSpace:"pre-wrap"}}>{(tenant.extraSchluessel||"").trim()||"-"}</div></div>
          </div>
        )}
      </div>
      <div style={{fontSize:11,color:"#8a8174",marginTop:10,lineHeight:1.5}}>Die Schlüsselnummern, die der Mieter im Übergabeprotokoll einträgt, werden nach Abschluss automatisch hier übernommen.</div>
    </div>
  );
}

function Mieter({parkplaetze=[],tenants,rooms,apts,partners,contracts,loadContracts,withdrawContract,updateTenant,insertTenant,renameTenantId,deleteTenant,restoreTenant,purgeTenant,deletedTenants,loadDeleted,convertTenantToBewerber,updateRoom,documents,uploadDocument,getDocumentUrl,deleteDocument,protokolle,insertProtokoll,updateProtokoll,deleteProtokoll,navigateTo,navTarget,handoverProtocols,loadHandoverProtocols,startHandoverProtocol,cancelHandoverProtocol,acceptHandoverProtocol,extendHandoverDeadline,deleteHandoverProtocol,resendHandoverInvite,istAdmin=true}){
  const [search,setSearch]=useState("");
  const [sel,setSel]=useState(null);
  const [editing,setEditing]=useState(false);
  const [form,setForm]=useState({});
  const [tab,setTab]=useState("info");
  const [uebTab,setUebTab]=useState("einzug");
  const [adding,setAdding]=useState(false);
  const [newForm,setNewForm]=useState({});
  const [viewMode,setViewMode]=useState("aktiv"); // "aktiv" | "archiviert"
  const [mArt,setMArt]=useState("alle"); // "alle" | "WG" | "Wohnung"
  const [changingRoom,setChangingRoom]=useState(null); // tenant whose room is being changed
  const [newRoomId,setNewRoomId]=useState("");
  const [qrBillSending,setQrBillSending]=useState(null); // tenant.id currently sending
  
  // QR-Einzahlungsschein generieren + per Email senden
  async function generateQrBill(tenantId) {
    if (!tenantId) return;
    setQrBillSending(tenantId);
    try {
      const { data, error } = await supabase.functions.invoke("generate-qr-bill", {
        body: { tenant_id: tenantId, send_email: true }
      });
      if (error) throw new Error(error.message || String(error));
      if (data?.error) throw new Error(data.error);
      alert(`✓ QR-Einzahlungsschein generiert und per Email versendet!\n\nReferenz: ${data.qr_reference}\nBetrag: CHF ${Number(data.amount).toLocaleString("de-CH",{minimumFractionDigits:2,maximumFractionDigits:2})}`);
    } catch (e) {
      console.error("generateQrBill failed:", e);
      alert("⚠️ QR-Bill konnte nicht erstellt werden:\n\n" + (e.message || e));
    }
    setQrBillSending(null);
  }
  
  // Auto-select target tenant when navigated from another tab
  useEffect(() => {
    if (navTarget && navTarget.type === "mieter" && navTarget.id) {
      setSel(navTarget.id);
      setTab("info");
      // Wenn der Mieter archiviert ist, automatisch in Archiv-Modus wechseln
      const t = tenants.find(x => x.id === navTarget.id);
      if (t && t.status === "archiviert") setViewMode("ehemalig");
    }
  }, [navTarget]);
  
  // Mieter dreiteilen nach Datum: aktiv (aktuell drin), zukuenftig (Einzug spaeter), ehemalig (ausgezogen/archiviert)
  const _heuteM = new Date(); _heuteM.setHours(0,0,0,0);
  const _pdM = (s)=>{ if(!s) return null; const str=String(s).trim(); if(/^\d{4}-\d{2}-\d{2}/.test(str)){const d=new Date(str);return isNaN(d.getTime())?null:d;} const m=str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); if(m){const d=new Date(+m[3],+m[2]-1,+m[1]);return isNaN(d.getTime())?null:d;} const d=new Date(str);return isNaN(d.getTime())?null:d; };
  const _grpM = (t)=>{ if (t.status === "archiviert") return "ehemalig"; const ein=_pdM(t.einzug), aus=_pdM(t.auszug); if (aus && aus < _heuteM) return "ehemalig"; if (ein && ein > _heuteM) return "zukuenftig"; return "aktiv"; };
  const aktive = tenants.filter(t => _grpM(t)==="aktiv");
  const zukuenftige = tenants.filter(t => _grpM(t)==="zukuenftig");
  const ehemalige = tenants.filter(t => _grpM(t)==="ehemalig");
  const currentList = viewMode==="zukuenftig" ? zukuenftige : viewMode==="ehemalig" ? ehemalige : aktive;
  
  const filtered = currentList.filter(t=>`${t.vorname} ${t.nachname} ${t.id} ${t.email}`.toLowerCase().includes(search.toLowerCase())).sort((a,b) => {
    if (viewMode === "ehemalig") {
      const dateA = _pdM(a.auszug) || new Date(a.archivedAt || a.archived_at || 0);
      const dateB = _pdM(b.auszug) || new Date(b.archivedAt || b.archived_at || 0);
      return dateB - dateA;
    }
    if (viewMode === "zukuenftig") {
      const dateA = _pdM(a.einzug) || 0, dateB = _pdM(b.einzug) || 0;
      return dateA - dateB;
    }
    return natSort(a.id, b.id);
  });
  const tenant=tenants.find(t=>t.id===sel);const room=tenant?(rooms.find(r=>r.tenantId===tenant.id)||(tenant.roomId?rooms.find(r=>r.id===tenant.roomId):null)):null;const apt=room?apts.find(a=>a.id===room.aptId):null;
  function F(k){return e=>setForm(p=>({...p,[k]:e.target.value}));}function FB(k){return e=>setForm(p=>({...p,[k]:e.target.checked}));}
  function NF(k){return e=>setNewForm(p=>({...p,[k]:e.target.value}));}function NFB(k){return e=>setNewForm(p=>({...p,[k]:e.target.checked}));}
  
  // ─── Vertrags-Generation für Mieter (UMV + AMZ) ──────────────────────
  function buildContractDataForTenant(t) {
    if (!t) return null;
    const room = rooms.find(r => r.tenantId === t.id) || (t.roomId ? rooms.find(r => r.id === t.roomId) : null);
    const apt = room ? apts.find(a => a.id === room.aptId) : null;
    const bruttomiete = room ? +room.miete : 1000;
    const nebenkosten = 100;
    const nettomiete = bruttomiete - nebenkosten;
    const strom = 25;
    
    // Detect kaution variant
    let kautionMonate = 3;
    let aufschlag = 0;
    const kOpt = t.kautionOpt || t.kaution_opt;
    const kAufschlag = t.kautionAufschlag || t.kaution_aufschlag;
    if (kOpt === "0x" || kAufschlag === 150) { kautionMonate = 0; aufschlag = 150; }
    else if (kOpt === "1x" || kAufschlag === 100) { kautionMonate = 1; aufschlag = 100; }
    else if (kOpt === "2x" || kAufschlag === 50) { kautionMonate = 2; aufschlag = 50; }
    else if (t.kautionMonate !== null && t.kautionMonate !== undefined) {
      kautionMonate = +t.kautionMonate;
      aufschlag = kautionMonate === 0 ? 150 : kautionMonate === 1 ? 100 : kautionMonate === 2 ? 50 : 0;
    }
    const kautionBetrag = (bruttomiete + strom) * kautionMonate;
    const total = bruttomiete + strom + aufschlag;
    
    // Build bewerber-like object from tenant
    const b = {
      id: t.id,
      vorname: t.vorname,
      nachname: t.nachname,
      email: t.email,
      phone: t.phone,
      geburt: t.geburt,
      gender: t.gender,
      nat: t.nat,
      adresse: t.adresse,
      plz: t.plz,
      ort: t.ort,
      type: t.type || t.anstellung,
      job: t.job || t.beruf,
      einkommen: t.einkommen,
      einzug: t.einzug,
      zugeteiltes_zimmer: room?.id,
      zimmerWunsch: room?.id,
      kautionOpt: kOpt || (kautionMonate === 3 ? "3x" : kautionMonate === 2 ? "2x" : kautionMonate === 1 ? "1x" : "0x"),
      kautionType: t.kautionType,
      kautionAufschlag: aufschlag,
      moebliert: t.moebliert ? "ja" : "nein",
      moeblierungPauschale: t.moeblierungPauschale,
      noDebt: t.noDebt,
      owner: t.owner,
      status: t.status,
      bemerkung: t.bemerkung,
    };
    
    const v = {
      zimmerId: room?.id || "",
      apt: apt || null,
      room: room || null,
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
      moebliert: !!t.moebliert,
      einzug: t.einzug || "",
      fruehererMietzins: (room && room.tenantId && room.tenantId !== t.id) ? (bruttomiete + strom) : "",
    };
    if (apt && apt.vermietungsart === "wohnung") {
      const vw = wohnungVertragswerte({ ...v }, apt, room, t.personen || 1);
      const _tm = (t.mitmieter && t.mitmieter.aktiv !== false && t.mitmieter.vorname) ? { ...t.mitmieter, aktiv: true } : null;
      return { b: { ...b, personen: vw.personen, moebliert: "nein" }, v: { ...vw, mitmieter: _tm, _mmDraft: t.mitmieter || {} } };
    }
    
    return { b, v };
  }
  
  const [dlBusy, setDlBusy] = useState("");
  const [tvModal, setTvModal] = useState(false);
  const [tvData, setTvData] = useState(null);
  const [tvSending, setTvSending] = useState(false);
  const [vorschauT, setVorschauT] = useState(null);
  const [tvProgress, setTvProgress] = useState(null);
  const [tvResult, setTvResult] = useState(null);
  const [tvTypes, setTvTypes] = useState(["umv","amz"]);
  function openTenantVertrag(t){
    const data = buildContractDataForTenant(t);
    if (!data) { alert("Konnte Vertragsdaten nicht aufbauen."); return; }
    setTvData({
      ...data.v, _tenant: t,
      mietende: "",
      moebliert: t.moebliert === "ja" || t.moebliert === true,
      moeblierungModus: t.moeblierungModus || "einmalig",
      moeblierungPauschale: +t.moeblierungPauschale || (t.moeblierungModus==="monatlich" ? 150 : 990),
      auszug: t.auszug || "",
      ortVertrag: "Zürich",
      datumVertrag: new Date().toISOString().split("T")[0],
      minMietdauer: 6,
      kuendigungsfrist: 3,
    });
    setTvResult(null); setTvProgress(null); setTvTypes(["umv","amz"]); setTvModal(true);
  }
  const TV = (k)=>(e)=>{ const val = e && e.target ? e.target.value : e; setTvData(p=>({...p,[k]:val})); };
  const TVn = (k)=>(e)=>{ setTvData(p=>({...p,[k]: +e.target.value || 0})); };
  async function tvDownload(type){
    if(!tvData) return;
    const t = tvData._tenant;
    const fullName = `${t.vorname||""} ${t.nachname||""}`.trim();
    setDlBusy(type);
    try {
      let html, fn;
      if(type==="umv"){ html = injectDaanInUMV(buildContractHTML(t, tvData, fullName, formatDateLong)); fn = `Untermietvertrag_${fullName.replace(/\s+/g,"_")}.pdf`; }
      else { const amz = {...tvData, strom:25, total:(tvData.nettomiete||0)+(tvData.nebenkosten||0)+25}; html = injectDaanInAMZ(buildAnfangsmietzinsHTML(t, amz, fullName, formatDateLong)); fn = `Anfangsmietzinsformular_${fullName.replace(/\s+/g,"_")}.pdf`; }
      downloadBlob(await htmlToPdf(html, fn), fn);
    } catch(e){ alert("PDF konnte nicht erstellt werden: " + (e.message||e)); }
    finally { setDlBusy(""); }
  }
  async function tvSend(){
    if(!tvData) return;
    const t = tvData._tenant;
    if(!t.email){ alert("Dieser Mieter hat keine E-Mail-Adresse hinterlegt."); return; }
    if(!tvTypes.length){ alert("Bitte mindestens eine Vertragsart wählen."); return; }
    setTvSending(true); setTvResult(null);
    try {
      const res = await sendContractForSigningShared(t, tvData, (msg,p)=>setTvProgress({msg,p}), tvTypes, {tenantId: t.id});
      setTvResult({ok:true, ...res});
      if(loadContracts) await loadContracts();
    } catch(e){ setTvResult({ok:false, error:e.message||String(e)}); }
    finally { setTvSending(false); setTvProgress(null); }
  }
  const [nachModal, setNachModal] = useState(false);
  const [nd, setNd] = useState(null);
  const [nachBusy, setNachBusy] = useState(false);
  const [vorschauN, setVorschauN] = useState(null);
  const [nachProgress, setNachProgress] = useState(null);
  const [nachResult, setNachResult] = useState(null);
  function openNachtrag(t){
    const data = buildContractDataForTenant(t);
    const room = data && data.v.room, apt = data && data.v.apt;
    const tContracts = (contracts||[]).filter(c => c.tenantId === t.id || (c.mieterEmail && t.email && c.mieterEmail.toLowerCase().trim() === t.email.toLowerCase().trim()) || (c.bewerberId && t.bewerberId && c.bewerberId === t.bewerberId)).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
    const current = tContracts.find(c=>c.status==="signiert") || tContracts[0];
    setNd({
      _tenant: t,
      adresse: (data&&data.v.adresse)||"", plz:(data&&data.v.plz)||"", ort:(data&&data.v.ort)||"",
      zimmerId: (data&&data.v.zimmerId)||"",
      stockwerk: (apt&&apt.stockwerk)||"",
      aptId: apt?apt.id:null, roomId: room?room.id:null,
      vertragsart: (apt && apt.vermietungsart === "wohnung") ? "wohnung" : undefined,
      mitmieter: (apt && apt.vermietungsart === "wohnung" && t.mitmieter && t.mitmieter.aktiv !== false && t.mitmieter.vorname) ? t.mitmieter : null,
      mietbeginn: t.einzug || "",
      einzug: "",
      mietende: (apt && apt.mietende) || "",
    });
    setNachResult(null); setNachProgress(null); setNachModal(true);
  }
  const ND = (k)=>(e)=>{ const val = e && e.target ? e.target.value : e; setNd(p=>({...p,[k]:val})); };
  async function downloadNachtrag(){
    if(!nd) return;
    const t = nd._tenant;
    const fullName = `${t.vorname||""} ${t.nachname||""}`.trim();
    setNachBusy(true);
    try {
      const html = injectDaanInUMV(buildNachtragHTML(t, nd, fullName, formatDateLong));
      const fn = `Nachtrag_Verlaengerung_${fullName.replace(/\s+/g,"_")}.pdf`;
      downloadBlob(await htmlToPdf(html, fn), fn);
    } catch(e){ alert("PDF konnte nicht erstellt werden: " + (e.message||e)); }
    finally { setNachBusy(false); }
  }
  // Vor dem Versand: genau das PDF zeigen, das der Mieter erhaelt
  async function vorschauNachtrag(){
    if(!nd) return;
    const t = nd._tenant;
    if(!nd.mietende){ alert("Bitte das neue Enddatum (verlängert bis) angeben."); return; }
    if(!t.email){ alert("Dieser Mieter hat keine E-Mail-Adresse."); return; }
    setNachBusy(true); setNachResult(null); setNachProgress({msg:"Vorschau wird erstellt…",p:0.2});
    try {
      const fullName = `${t.vorname||""} ${t.nachname||""}`.trim();
      const html = buildNachtragHTML(t, nd, fullName, formatDateLong);
      const fn = `Verlaengerung_${fullName.replace(/\s+/g,"_")}.pdf`;
      const blob = await htmlToPdf(html, fn);
      setVorschauN({ fullName, html, blob, weitere:[{ name:"Verlängerung", kurz:"Verlängerung", blob, fn }] });
    } catch(e){ alert("Vorschau fehlgeschlagen: " + (e.message||e)); }
    finally { setNachBusy(false); setNachProgress(null); }
  }
  async function sendNachtrag(pre){
    if(!nd) return;
    const t = nd._tenant;
    if(!nd.mietende){ alert("Bitte das neue Enddatum (verlängert bis) angeben."); return; }
    if(!t.email){ alert("Dieser Mieter hat keine E-Mail-Adresse."); return; }
    setNachBusy(true); setNachResult(null);
    try {
      const fullName = `${t.vorname||""} ${t.nachname||""}`.trim();
      // Neuer Ablauf: ohne D&T-Faksimile verschicken, Mieter zeichnet zuerst.
      const html = (pre && pre.html) || buildNachtragHTML(t, nd, fullName, formatDateLong);
      const cdata = buildContractDataForTenant(t);
      const vFull = cdata ? { ...cdata.v, einzug: nd.mietbeginn || cdata.v.einzug, auszug: nd.mietende, mietende: nd.mietende } : null;
      const res = await sendSingleDocForSigning(t, html, {
        docName:"Verlängerung", docType:"verlaengerung", contractType:"verlaengerung",
        aptId: nd.aptId, roomId: nd.roomId, tenantId: t.id, vertrag: vFull, preBlob: pre && pre.blob,
        onProgress:(msg,p)=>setNachProgress({msg,p}),
      });
      setNachResult({ok:true, ...res}); setVorschauN(null);
      if(updateTenant){ try { await updateTenant(t.id, {auszug: nd.mietende}); } catch(e){} }
      if(loadContracts) await loadContracts();
    } catch(e){ setNachResult({ok:false, error:e.message||String(e)}); setVorschauN(null); }
    finally { setNachBusy(false); setNachProgress(null); }
  }
  async function generateUMVForTenant(t) {
    const data = buildContractDataForTenant(t);
    if (!data) { alert("Konnte Vertragsdaten nicht aufbauen."); return; }
    const fullName = `${data.b.vorname || ""} ${data.b.nachname || ""}`.trim();
    setDlBusy("umv");
    try {
      const html = injectDaanInUMV(buildContractHTML(data.b, data.v, fullName, formatDateLong));
      const fn = `Untermietvertrag_${fullName.replace(/\s+/g,"_")}.pdf`;
      downloadBlob(await htmlToPdf(html, fn), fn);
    } catch (e) { alert("PDF konnte nicht erstellt werden: " + (e.message || e)); }
    finally { setDlBusy(""); }
  }

  async function generateAMZForTenant(t) {
    const data = buildContractDataForTenant(t);
    if (!data) { alert("Konnte Vertragsdaten nicht aufbauen."); return; }
    const fullName = `${data.b.vorname || ""} ${data.b.nachname || ""}`.trim();
    const amzData = { ...data.v, strom: 25, total: (data.v.nettomiete||0) + (data.v.nebenkosten||0) + 25 };
    setDlBusy("amz");
    try {
      const html = injectDaanInAMZ(buildAnfangsmietzinsHTML(data.b, amzData, fullName, formatDateLong));
      const fn = `Anfangsmietzinsformular_${fullName.replace(/\s+/g,"_")}.pdf`;
      downloadBlob(await htmlToPdf(html, fn), fn);
    } catch (e) { alert("PDF konnte nicht erstellt werden: " + (e.message || e)); }
    finally { setDlBusy(""); }
  }
  
  // Find free rooms for assignment dropdown
  const freeRooms = rooms.filter(r => !r.occupied);
  
  function nextTenantId(){
    // Finde höchste existierende T-Nummer und nehme +1 (auch wenn alte IDs gelöscht wurden)
    let n = 1;
    tenants.forEach(t => {
      const m = String(t.id||"").match(/^T(\d+)$/);
      if (m) n = Math.max(n, parseInt(m[1],10) + 1);
    });
    return `T${String(n).padStart(2,"0")}`;
  }
  
  async function saveNew(){
    if (!newForm.vorname || !newForm.nachname) {
      alert("Bitte mindestens Vorname und Nachname angeben.");
      return;
    }
    
    // Validierung
    const errors = [];
    if (newForm.email) {
      const r = validateEmail(newForm.email);
      if (!r.ok) errors.push(`E-Mail: ${r.error}`);
      else newForm.email = r.value;
    }
    if (newForm.phone) {
      const r = validatePhone(newForm.phone);
      if (!r.ok) errors.push(`Telefon: ${r.error}`);
      else newForm.phone = formatPhoneCH(r.value);
    }
    if (newForm.geburt) {
      const r = validateDate(newForm.geburt, {type: "birthday"});
      if (!r.ok) errors.push(`Geburtstag: ${r.error}`);
      else newForm.geburt = r.value;
    }
    if (newForm.einzug) {
      const r = validateDate(newForm.einzug);
      if (!r.ok) errors.push(`Einzug: ${r.error}`);
      else newForm.einzug = r.value;
    }
    if (newForm.plz) {
      const r = validatePLZ(newForm.plz);
      if (!r.ok) errors.push(`PLZ: ${r.error}`);
      else newForm.plz = r.value;
    }
    if (newForm.einkommen) {
      const r = validateNumber(newForm.einkommen, {min: 0, max: 1000000});
      if (!r.ok) errors.push(`Einkommen: ${r.error}`);
    }
    if (errors.length > 0) {
      alert("Bitte korrigiere folgende Felder:\n\n• " + errors.join("\n• "));
      return;
    }
    
    const id = newForm.id || nextTenantId();
    if (tenants.find(t=>t.id===id)) {
      alert(`Mieter-ID "${id}" existiert bereits.`);
      return;
    }
    
    // Calculate kaution if room selected
    let kautionMonate = 0;
    let kautionAufschlag = 0;
    let kautionBetrag = 0;
    if (newForm.kautionOpt) {
      kautionMonate = newForm.kautionOpt==="3x"?3:newForm.kautionOpt==="2x"?2:newForm.kautionOpt==="1x"?1:0;
      kautionAufschlag = newForm.kautionOpt==="0x"?150:newForm.kautionOpt==="1x"?100:newForm.kautionOpt==="2x"?50:0;
      const room = rooms.find(r => r.id === newForm.roomId);
      const bm = room?.miete || 0;
      kautionBetrag = (bm + 25 * Math.max(1, +newForm.personen || 1)) * kautionMonate; // Strom CHF 25 pro Person
    }
    
    const newTenant = {
      id,
      vorname: newForm.vorname || "",
      nachname: newForm.nachname || "",
      email: newForm.email || "",
      phone: newForm.phone || "",
      geburt: newForm.geburt || "",
      nat: newForm.nat || "",
      adresse: newForm.adresse || "",
      plz: newForm.plz || "",
      ort: newForm.ort || "",
      beruf: newForm.beruf || "",
      arbeitgeber: newForm.arbeitgeber || "",
      einkommen: newForm.einkommen || "",
      type: newForm.type || "",
      einzug: newForm.einzug || "",
      auszug: "",
      aptId: newForm.roomId ? rooms.find(r=>r.id===newForm.roomId)?.aptId : null,
      roomId: newForm.roomId || null,
      kautionOpt: newForm.kautionOpt || "",
      kautionMonate,
      kautionAufschlag,
      kautionBetrag,
      kautionType: (newForm.kautionType||"Evorest") || "",
      moebliert: !!newForm.moebliert,
      furnished: !!newForm.moebliert,
      zivilstand: newForm.zivilstand || "",
      noDebt: !!newForm.noDebt,
      schluesselAnzahl: newForm.schluesselAnzahl || "",
      extraSchluessel: newForm.extraSchluessel || "",
      schluesselUebergeben: !!newForm.schluesselUebergeben,
      bemerkung: newForm.bemerkung || "",
    };
    
    try {
      await insertTenant(newTenant);
      // If room was assigned, mark it as occupied
      if (newForm.roomId) {
        await updateRoom(newForm.roomId, {occupied:true, tenantId:id});
      }
      setAdding(false);
      setNewForm({});
      setSel(id);
    } catch (err) {
      alert("Mieter konnte nicht angelegt werden: " + (err.message||err));
    }
  }
  
  // ─── VALIDIERUNG ─────────────────────────────────────────────
  function validateForm() {
    const errors = [];
    if (form.email) {
      const r = validateEmail(form.email);
      if (!r.ok) errors.push(`E-Mail: ${r.error}`);
      else form.email = r.value;
    }
    if (form.phone) {
      const r = validatePhone(form.phone);
      if (!r.ok) errors.push(`Telefon: ${r.error}`);
      else form.phone = formatPhoneCH(r.value);
    }
    if (form.geburt) {
      const r = validateDate(form.geburt, {type: "birthday"});
      if (!r.ok) errors.push(`Geburtstag: ${r.error}`);
      else form.geburt = r.value;
    }
    if (form.einzug) {
      const r = validateDate(form.einzug);
      if (!r.ok) errors.push(`Einzug: ${r.error}`);
      else form.einzug = r.value;
    }
    if (form.auszug) {
      const r = validateDate(form.auszug);
      if (!r.ok) errors.push(`Auszug: ${r.error}`);
      else form.auszug = r.value;
    }
    if (form.plz) {
      const r = validatePLZ(form.plz);
      if (!r.ok) errors.push(`PLZ: ${r.error}`);
      else form.plz = r.value;
    }
    if (form.einkommen) {
      const r = validateNumber(form.einkommen, {min: 0, max: 1000000});
      if (!r.ok) errors.push(`Einkommen: ${r.error}`);
    }
    if (errors.length > 0) {
      alert("Bitte korrigiere folgende Felder:\n\n• " + errors.join("\n• "));
      return false;
    }
    return true;
  }
  
  // Zimmer-Wechsel: aktiven Mieter zu anderem Zimmer verschieben
  async function executeRoomChange() {
    if (!changingRoom || !newRoomId) return;
    const t = changingRoom;
    const newRoom = rooms.find(r => r.id === newRoomId);
    if (!newRoom) { alert("Neues Zimmer nicht gefunden."); return; }
    
    const oldRoom = rooms.find(r => r.tenantId === t.id) || (t.roomId ? rooms.find(r => r.id === t.roomId) : null);
    
    // Falls neues Zimmer schon belegt ist (von anderem Mieter) → Tausch-Frage
    if (newRoom.occupied && newRoom.tenantId && newRoom.tenantId !== t.id) {
      const occupant = tenants.find(x => x.id === newRoom.tenantId);
      const occupantName = occupant ? `${occupant.vorname} ${occupant.nachname} (${occupant.id})` : `Mieter ${newRoom.tenantId}`;
      const confirmMsg = `⚠ Das Zimmer ${newRoom.id} ist bereits belegt von ${occupantName}.\n\nMöchtest du die Zimmer TAUSCHEN? ${occupantName} würde dann in ${oldRoom?.id || "das aktuelle"} Zimmer ziehen.`;
      if (!confirm(confirmMsg)) return;
      // TAUSCH: occupant in altes Zimmer
      if (oldRoom) {
        await updateRoom(oldRoom.id, {tenantId: occupant.id, occupied: true});
        if (occupant) await updateTenant(occupant.id, {aptId: oldRoom.aptId, roomId: oldRoom.id});
      } else {
        // Aktueller Mieter hatte kein altes Zimmer → occupant rausnehmen
        if (occupant) await updateTenant(occupant.id, {aptId: null, roomId: null});
      }
    } else if (oldRoom) {
      // Altes Zimmer freigeben (kein Tausch)
      await updateRoom(oldRoom.id, {tenantId: null, occupied: false});
    }
    
    // Neues Zimmer belegen mit aktuellem Mieter
    await updateRoom(newRoom.id, {tenantId: t.id, occupied: true});
    
    // Mieter-Datensatz updaten
    await updateTenant(t.id, {aptId: newRoom.aptId, roomId: newRoom.id});
    
    setChangingRoom(null);
    setNewRoomId("");
    alert(`✓ ${t.vorname} ${t.nachname} ist jetzt in Zimmer ${newRoom.id} (${apts.find(a=>a.id===newRoom.aptId)?.adresse||""}).`);
  }
  
  async function save(){
    if (!validateForm()) return;
    // ID-Änderung erkennen und ggf. durchführen
    const originalId = form._originalId || form.id;
    if (form.id && form.id !== originalId) {
      const ok = window.confirm(`Mieter-ID von ${originalId} auf ${form.id} ändern?\n\nDies aktualisiert auch die Zimmer-Zuordnung.`);
      if (!ok) return;
      const success = await renameTenantId(originalId, form.id);
      if (!success) return; // Fehler wurde schon angezeigt
    }
    // Restliche Felder speichern (mit ggf. neuer ID)
    await updateTenant(form.id,{
      vorname:form.vorname,nachname:form.nachname,
      email:form.email,phone:form.phone,
      geburt:form.geburt,nat:form.nat,
      adresse:form.adresse,plz:form.plz,ort:form.ort,
      einzug:form.einzug,auszug:form.auszug,
      beruf:form.beruf,arbeitgeber:form.arbeitgeber,
      einkommen:form.einkommen,type:form.type,
      kautionOpt:form.kautionOpt,kautionMonate:+form.kautionMonate||0,
      kautionAufschlag:+form.kautionAufschlag||0,kautionBetrag:+form.kautionBetrag||0,
      mietzins:(form.mietzins===""||form.mietzins==null)?null:+form.mietzins,
      kautionType:(form.kautionType||"Evorest"),
      moebliert:!!form.moebliert,furnished:!!form.moebliert,
      zivilstand:form.zivilstand||"",gender:form.gender||"",
      noDebt:!!form.noDebt,
      bemerkung:form.bemerkung,
      owner:form.owner||null,
    });
    // Selection auf neue ID setzen falls geändert
    if (form.id !== originalId) {
      setSel(form.id);
    }
    setEditing(false);
  }
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
        <div>
          <div className="pt">Mieter</div>
          <div className="ps">{viewMode==="ehemalig"?`${ehemalige.length} ehemalige Mieter`:viewMode==="zukuenftig"?`${zukuenftige.length} zukünftige Mieter`:`${aktive.length} aktive Mieter`}</div>
        </div>
        {viewMode==="aktiv" && <button className="btn btn-p" onClick={()=>{setNewForm({id:nextTenantId(),kautionOpt:"3x"});setAdding(true);}}>+ Neuer Mieter</button>}
      </div>
      
      {/* TAB-TOGGLE: Aktive / Zukünftige / Ehemalige */}
      <div style={{display:"flex",gap:0,marginBottom:12,borderBottom:"1px solid #e8e3d8"}}>
        <button onClick={()=>{setViewMode("aktiv");setSel(null);}} style={{background:"transparent",border:"none",padding:"8px 14px",fontSize:12,fontWeight:viewMode==="aktiv"?600:400,color:viewMode==="aktiv"?"#1a1814":"#8a8174",cursor:"pointer",borderBottom:viewMode==="aktiv"?"2px solid #1a1814":"2px solid transparent",marginBottom:-1}}>
          Aktive Mieter ({aktive.length})
        </button>
        <button onClick={()=>{setViewMode("zukuenftig");setSel(null);}} style={{background:"transparent",border:"none",padding:"8px 14px",fontSize:12,fontWeight:viewMode==="zukuenftig"?600:400,color:viewMode==="zukuenftig"?"#1a1814":"#8a8174",cursor:"pointer",borderBottom:viewMode==="zukuenftig"?"2px solid #1a1814":"2px solid transparent",marginBottom:-1}}>
          🔜 Zukünftige ({zukuenftige.length})
        </button>
        <button onClick={()=>{setViewMode("ehemalig");setSel(null);}} style={{background:"transparent",border:"none",padding:"8px 14px",fontSize:12,fontWeight:viewMode==="ehemalig"?600:400,color:viewMode==="ehemalig"?"#1a1814":"#8a8174",cursor:"pointer",borderBottom:viewMode==="ehemalig"?"2px solid #1a1814":"2px solid transparent",marginBottom:-1}}>
          📦 Ehemalige ({ehemalige.length})
        </button>
        <button onClick={()=>{setViewMode("papierkorb");setSel(null);loadDeleted&&loadDeleted();}} style={{background:"transparent",border:"none",padding:"8px 14px",fontSize:12,fontWeight:viewMode==="papierkorb"?600:400,color:viewMode==="papierkorb"?"#1a1814":"#8a8174",cursor:"pointer",borderBottom:viewMode==="papierkorb"?"2px solid #1a1814":"2px solid transparent",marginBottom:-1}}>
          🗑 Papierkorb ({(deletedTenants||[]).length})
        </button>
      </div>
      {viewMode==="papierkorb" && (
        <div style={{maxWidth:640}}>
          <div style={{fontSize:12.5,color:"#8a8174",marginBottom:12}}>Gelöschte Mieter und Bewerber. Wiederherstellen holt sie samt Dokumenten zurück, endgültig löschen entfernt sie dauerhaft.</div>
          {(deletedTenants||[]).length===0 && <div style={{padding:"22px 4px",color:"#8a8174",fontSize:13}}>Der Papierkorb ist leer.</div>}
          {(deletedTenants||[]).map(t=>(
            <div key={t.id} style={{border:"1px solid var(--line)",borderRadius:10,padding:"11px 13px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",background:"var(--surface)"}}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:13.5,fontWeight:600,color:"var(--ink)"}}>{((t.vorname||"")+" "+(t.nachname||"")).trim()||t.id}</div>
                <div style={{fontSize:11,color:"#a0968a",marginTop:2}}>{t.email||""}{t.deletedAt?" · gelöscht am "+new Date(t.deletedAt).toLocaleDateString("de-CH"):""}</div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button onClick={async()=>{ if(await restoreTenant(t.id)){ loadDeleted&&loadDeleted(); } }} style={{background:"var(--ink)",color:"var(--surface)",border:"1px solid var(--ink)",borderRadius:8,padding:"6px 12px",fontSize:11.5,cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>Wiederherstellen</button>
                <button onClick={async()=>{ if(!confirm("Endgültig löschen? Das kann nicht rückgängig gemacht werden."))return; if(await purgeTenant(t.id)){ loadDeleted&&loadDeleted(); } }} style={{background:"none",color:"#9b4a3e",border:"1px solid var(--line)",borderRadius:8,padding:"6px 10px",fontSize:11.5,cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>Endgültig löschen</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="list-detail" style={{display:(typeof viewMode!=="undefined"&&viewMode==="papierkorb")?"none":"grid",gridTemplateColumns:"240px 1fr",gap:16}}>
        <div>
          <input className="inp" style={{width:"100%",marginBottom:8}} placeholder="🔍 Suchen…" value={search} onChange={e=>setSearch(e.target.value)}/>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>{[["alle","Alle"],["WG","WG"],["Wohnung","Wohnung"]].map(([k,l])=>(<button key={k} className={`btn ${mArt===k?"btn-p":"btn-g"} btn-sm`} onClick={()=>setMArt(k)}>{l}</button>))}</div>
          <div style={{maxHeight:"calc(100vh - 230px)",overflowY:"auto"}}>
            {filtered.filter(t=>{ if(mArt==="alle") return true; const _r=rooms.find(r=>r.tenantId===t.id)||(t.roomId?rooms.find(r=>r.id===t.roomId):null); const _a=_r?apts.find(a=>a.id===_r.aptId):(t.aptId?apts.find(a=>a.id===t.aptId):null); return aptKat(_a)===mArt; }).map(t=>{
              const on=sel===t.id;
              const tRoom = rooms.find(r=>r.tenantId===t.id) || (t.roomId ? rooms.find(r=>r.id===t.roomId) : null);
              const tApt = tRoom ? apts.find(a=>a.id===tRoom.aptId) : null;
              return(
              <div key={t.id} onClick={()=>{setSel(t.id);setTab("info");}} style={{background:on?"#f5efe4":"#ffffff",border:`1px solid ${on?"#a08864":"#e8e3d8"}`,borderRadius:8,padding:"9px 12px",marginBottom:5,cursor:"pointer"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:3}}>
                  <div style={{fontWeight:600,fontSize:12.5,color:on?"#a08864":"#1f1d18",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1,minWidth:0}}>{t.vorname} {t.nachname}</div>
                  <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
                    {t.owner && <span style={{fontSize:9,fontWeight:600,padding:"2px 6px",borderRadius:3,background:t.owner==="Daan"?"#e0e8f0":"#f0e6dc",color:t.owner==="Daan"?"#3a4d66":"#7a5c3c",letterSpacing:".05em"}}>{t.owner}</span>}
                    <div style={{fontSize:9.5,fontWeight:700,color:on?"#a08864":"#8a8478",letterSpacing:".05em",whiteSpace:"nowrap",fontFamily:"'JetBrains Mono',monospace"}}>{t.id}</div>
                  </div>
                </div>
                <div style={{fontSize:10.5,color:"#8a8478",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {tRoom ? (
                    <>
                      🏠 <strong style={{color:"#5a5249"}}>{tRoom.id}</strong>
                      {tApt && tApt.zimmer && <> · {tApt.zimmer} Zi.</>}
                      {tApt && tApt.stockwerk && <> · {tApt.stockwerk}</>}
                      {tApt && <> · {tApt.adresse}</>}
                    </>
                  ) : <span style={{fontStyle:"italic",color:"#bab2a0"}}>Kein Zimmer zugeteilt</span>}
                </div>
              </div>);})}
          </div>
        </div>
        {tenant?(
          <div className="card" style={{margin:0}}>
            <div className="detail-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12,gap:12,flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"center",gap:11,minWidth:0,flex:"1 1 auto"}}><Av name={tenant.vorname} size={40}/><div style={{minWidth:0}}><div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:"#1f1d18",wordBreak:"break-word"}}>{tenant.vorname} {tenant.nachname}</div><div style={{fontSize:11,color:"#8a8478",marginTop:2,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><span>{tenant.id}</span>{tenant.owner&&<span style={{fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:3,background:tenant.owner==="Daan"?"#e0e8f0":"#f0e6dc",color:tenant.owner==="Daan"?"#3a4d66":"#7a5c3c",letterSpacing:".05em"}}>👤 {tenant.owner}</span>}{tenant.status==="archiviert"&&<span style={{fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:3,background:"#e8e3d8",color:"#5a5249",letterSpacing:".05em"}}>📦 ARCHIVIERT</span>}</div></div></div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button className="btn btn-g btn-sm" onClick={()=>{setForm({...tenant,_originalId:tenant.id});setEditing(true);}}>✏ Bearbeiten</button>
                {istAdmin && <button className="btn btn-p btn-sm" title="Neuen Vertrag mit Parametern erstellen (z.B. Verlängerung) und verschicken" onClick={()=>openTenantVertrag(tenant)}>📝 Neuer Vertrag</button>}
                {istAdmin && <button className="btn btn-g btn-sm" title="Verlängerung (Nachtrag) mit neuem Enddatum, gleiche Basis, zur Unterschrift" onClick={()=>openNachtrag(tenant)}>⏱ Verlängerung</button>}
                {istAdmin && <button className="btn btn-s btn-sm" title="Kaution bei Evorest vorausgefüllt eröffnen" onClick={()=>window.open(buildEvorestUrl(tenant, apt, (partners||[]).find(p=>p.name===(apt&&apt.eigentuemer))), "_blank")}>💰 Evorest</button>}
                {tenant.status!=="archiviert" && (
                  <button className="btn btn-g btn-sm" onClick={()=>{setChangingRoom(tenant);setNewRoomId("");}}>🔄 Zimmer wechseln</button>
                )}
                {convertTenantToBewerber && (
                  <button className="btn btn-g btn-sm" title="Diesen Mieter zurueck in die Bewerber-Sektion verschieben" onClick={async()=>{
                    const name = `${tenant.vorname} ${tenant.nachname}`;
                    const myContracts = (contracts||[]).filter(c=>c.tenantId===tenant.id);
                    let msg = `${name} zurück in die Bewerber-Sektion verschieben?\n\nDer Bewerber erscheint wieder unter "Neu", das zugeteilte Zimmer wird freigegeben, und die Dokumente werden zurück zum Bewerber verschoben.\n\nAchtung: der Mieter-Eintrag inklusive erfasster Zahlungen und Übergabeprotokolle wird dabei entfernt. Dokumente bleiben erhalten.`;
                    if (myContracts.length>0) msg += `\n\nHinweis: für diesen Mieter existieren ${myContracts.length} Vertrag/Verträge. Diese bleiben bestehen, verweisen danach aber auf einen entfernten Mieter.`;
                    if (!confirm(msg)) return;
                    try {
                      const res = await convertTenantToBewerber(tenant);
                      if (res && res.ok) {
                        setSel(null);
                        alert(`✓ ${name} wurde zurück in die Bewerber-Sektion verschoben.`);
                        navigateTo && navigateTo("bewerber", res.applicantId || null);
                      }
                    } catch(e) { alert("Fehler: " + (e.message||e)); }
                  }} style={{color:"#3a4d66",borderColor:"#c0cdde"}}>↩ Zu Bewerber</button>
                )}
                {tenant.status==="archiviert" ? (
                  <>
                    <button className="btn btn-p btn-sm" onClick={async()=>{
                      if (!confirm(`${tenant.vorname} ${tenant.nachname} wieder als aktiven Mieter reaktivieren?\n\nDanach kannst du ihn/sie einem Zimmer zuteilen.`)) return;
                      await updateTenant(tenant.id, {status:"aktiv", archivedAt:null});
                      setViewMode("aktiv");
                      alert("✓ Mieter reaktiviert. Im Tab 'Zimmer' kannst du ein freies Zimmer zuweisen.");
                    }}>↑ Reaktivieren</button>
                    <button className="btn btn-sm" onClick={async()=>{
                      const name = `${tenant.vorname} ${tenant.nachname}`;
                      if (!confirm(`⚠ Archivierten Mieter ${name} ENDGÜLTIG LÖSCHEN?\n\nFolgende Daten werden permanent entfernt:\n• Mieter-Profil\n• Alle hochgeladenen Dokumente\n• Alle Zahlungen\n• Alle Übergabeprotokolle\n\nDieser Vorgang kann NICHT rückgängig gemacht werden.`)) return;
                      if (!confirm(`Sicher? Tippe nochmal OK um ${name} unwiderruflich zu löschen.`)) return;
                      const ok = await deleteTenant(tenant.id);
                      if (ok) {
                        setSel(null);
                        alert(`✓ ${name} und alle zugehörigen Daten wurden gelöscht.`);
                      }
                    }} style={{background:"#fefcf7",color:"#9b4a3e",border:"1px solid #e0bcb0"}}>🗑 Löschen</button>
                  </>
                ) : (
                  <button className="btn btn-g btn-sm" onClick={async()=>{
                    if (!confirm(`${tenant.vorname} ${tenant.nachname} archivieren?\n\nDer Mieter wird ins Archiv verschoben (alte Mieter). Daten bleiben erhalten. Die Zimmer-Zuteilung wird aufgelöst.`)) return;
                    // Zimmer freigeben
                    const myRoom = rooms.find(r=>r.tenantId===tenant.id);
                    if (myRoom) await updateRoom(myRoom.id, {tenantId:null, occupied:false});
                    // Mieter archivieren
                    await updateTenant(tenant.id, {
                      status:"archiviert", 
                      archivedAt:new Date().toISOString(),
                      auszug: tenant.auszug || new Date().toLocaleDateString("de-CH"),
                    });
                    setSel(null);
                    alert("✓ Mieter ins Archiv verschoben. Du findest ihn unter 'Alte Mieter'.");
                  }} style={{color:"#9b6a4a",borderColor:"#d4c7a8"}}>📦 Archivieren</button>
                )}
              </div>
            </div>
            {tenant.status==="archiviert" && (
              <div style={{background:"#f5efe4",border:"1px solid #d4c7a8",borderRadius:7,padding:"10px 14px",marginBottom:14,fontSize:12,color:"#5a5249",lineHeight:1.5}}>
                <div style={{fontWeight:600,marginBottom:3}}>📦 Archivierter Mieter</div>
                <div style={{fontSize:11}}>
                  {tenant.archivedAt||tenant.archived_at ? `Archiviert am ${fmtDateDE(tenant.archivedAt||tenant.archived_at)}` : "Archiviert"} · 
                  Auszug: {tenant.auszug || "-"} · 
                  Daten + Dokumente bleiben erhalten.
                </div>
              </div>
            )}
            {room&&<div style={{background:"#fafaf7",border:"1px solid #2a2d3e",borderRadius:7,padding:"8px 12px",marginBottom:14,fontSize:12,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
              <div>🏠 <strong>{apt?.adresse}</strong> · {apt?.vermietungsart==="wohnung"?<>Wohnung <strong>{apt.id}</strong></>:<>Zimmer <strong>{room.id}</strong></>} · {chf(room.miete)}/Mt.</div>
              <div style={{display:"flex",gap:4}}>
                {apt&&<button className="btn btn-g btn-sm" onClick={()=>navigateTo&&navigateTo("wohnungen",apt.id)} style={{fontSize:9}}>→ Wohnung</button>}
                <button className="btn btn-g btn-sm" onClick={()=>navigateTo&&navigateTo("zimmer",room.id)} style={{fontSize:9}}>→ Zimmer</button>
              </div>
            </div>}
            {room && (() => {
              const istMoeb = (tenant.moebliert===true||tenant.moebliert==="ja") && tenant.moeblierungModus==="monatlich";
              const moeb = moeblVon(tenant);
              const aufschlag = feeVon(tenant);
              const basis = (tenant.mietzins != null && tenant.mietzins !== "") ? +tenant.mietzins : (+room.miete||0);
              const _tW = !!(apt && apt.vermietungsart === "wohnung");
              const nk = _tW ? nkWohnung(apt) : 100, strom = _tW ? 25 * Math.max(1, +tenant.personen || 1) : 25;
              const netto = Math.max(0, basis - nk);
              const total = basis + strom + aufschlag + moeb;
              const zeile = (label, val, opts={}) => (
                <div style={{display:"flex",justifyContent:"space-between",padding:"3px 0",fontSize:11.5,color:opts.muted?"#8a8174":"#3a352d"}}>
                  <span>{label}</span><span style={{fontWeight:500}}>CHF {val.toLocaleString("de-CH",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                </div>
              );
              return (
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:9,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:6,fontWeight:500}}>Monatliche Zahlung</div>
                  <div style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"11px 15px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6,paddingBottom:8,borderBottom:"1px solid #e1d8c5"}}>
                      <span style={{fontSize:11,color:"#8a8174"}}>Total pro Monat</span>
                      <span style={{fontSize:17,fontWeight:600,color:"#1a1814",lineHeight:1}}>CHF {total.toLocaleString("de-CH",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                    </div>
                    {zeile("Nettomiete", netto)}
                    {zeile("Nebenkosten", nk, {muted:true})}
                    {zeile("Strom", strom, {muted:true})}
                    {aufschlag>0 && zeile("Kautions-Servicegebühr", aufschlag)}
                    {moeb>0 && zeile("Möblierung (monatlich)", moeb)}
                  </div>
                </div>
              );
            })()}
            {room && (() => {
              const basis = (tenant.mietzins != null && tenant.mietzins !== "") ? +tenant.mietzins : (+room.miete||0);
              const _bW = !!(apt && apt.vermietungsart === "wohnung");
              const _bNk = _bW ? nkWohnung(apt) : 100;
              const netto = Math.max(0, basis - _bNk);
              const doBexio = async () => {
                if(!confirm("QR-Rechnung(en) als Entwurf in Bexio erstellen?")) return;
                toast("Bexio: erstelle Rechnung …");
                const { data, error } = await supabase.functions.invoke("bexio-invoice", { body: {
                  tenantId: tenant.id,
                  bexioContactId: tenant.bexioContactId || null,
                  contact: { name_1: tenant.nachname, name_2: tenant.vorname, mail: tenant.email, phone: tenant.telefon, address: tenant.adresse, postcode: tenant.plz, city: tenant.ort, country_id: 1 },
                  aptAdresse: apt ? apt.adresse : "",
                  roomLabel: _bW ? "Wohnung" : (room ? ("Zimmer " + (room.id||"")) : ""),
                  einzug: tenant.einzug || "",
                  amounts: { nettomiete: netto, nebenkosten: _bW ? (_bNk + 25 * Math.max(1, +tenant.personen || 1)) : 125, aufschlag: feeVon(tenant), moeblierung: moeblVon(tenant) },
                }});
                if(error || (data && data.error)){ toast("Bexio-Fehler", "error"); console.error("bexio-invoice", error||data); return; }
                const nrs = ((data&&data.invoices)||[]).map(x=>x.nr).filter(Boolean).join(", ");
                toast("Entwurf erstellt: " + (nrs||"OK"));
              };
              return <button className="btn btn-p btn-sm" onClick={doBexio} style={{marginTop:10}}>Bexio: QR-Rechnung erstellen (Entwurf)</button>;
            })()}
            <div className="tabs">{[["info","Profil"],["docs","Dokumente"],["komm","Kommunikation"],["uebergabe","Übergabe"],["schluessel","🔑\u00a0Schlüssel"],["drittmeldung","Drittmeldepflicht"],["portal","Portal"]].map(([k,l])=>(<button key={k} className={`tab${tab===k?" on":""}`} onClick={()=>setTab(k)}>{l}</button>))}</div>
            {tab==="info"&&<div>
              {(() => {
                const ezDocs = (documents||[]).filter(d => d.entity_type==="tenant" && d.entity_id===tenant.id && d.category==="Drittmeldebestätigung (Einzug)");
                const azDocs = (documents||[]).filter(d => d.entity_type==="tenant" && d.entity_id===tenant.id && d.category==="Drittmeldebestätigung (Auszug)");
                const badge = (label, status, hasDoc) => {
                  const g = status==="gemeldet";
                  return (<span style={{display:"inline-flex",alignItems:"center",gap:5}}>
                    <span style={{color:"var(--muted)"}}>{label}:</span>
                    <span style={{padding:"1px 9px",borderRadius:20,background:g?"var(--green-soft)":"#f7e4e0",color:g?"#3d4f2f":"#9b4a3e",fontSize:11,fontWeight:600}}>{g?"Gemeldet":"Offen"}</span>
                    {hasDoc && <span style={{color:"#3d4f2f",fontSize:11}} title="Bestätigung hinterlegt">✓</span>}
                  </span>);
                };
                return (
                  <div onClick={()=>setTab("drittmeldung")} title="Zur Drittmeldepflicht" style={{display:"flex",alignItems:"center",gap:14,padding:"9px 13px",background:"var(--surface)",border:"1px solid var(--line-soft)",borderRadius:8,marginBottom:16,fontSize:12,cursor:"pointer",flexWrap:"wrap"}}>
                    <span style={{fontSize:9.5,textTransform:"uppercase",letterSpacing:".22em",color:"var(--muted)",fontWeight:600}}>Drittmeldepflicht</span>
                    {badge("Einzug", tenant.drittmeldungStatus||"offen", ezDocs.length>0)}
                    {badge("Auszug", tenant.drittmeldungAuszugStatus||"offen", azDocs.length>0)}
                    <span style={{marginLeft:"auto",color:"var(--muted)",fontSize:12}}>→</span>
                  </div>
                );
              })()}
              <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:8,fontWeight:500}}>Persönliche Daten</div>
              <div className="igrid">{[
                ["E-Mail",tenant.email||"-"],
                ["Telefon",tenant.phone||"-"],
                ["Geburt", fmtDateDE(tenant.geburt) || "-"],
                ["Nationalität",tenant.nat||"-"],
                ["Vorherige Adresse",tenant.adresse?[tenant.adresse,[tenant.plz,tenant.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "):"-"],
                ...(tenant.mitmieter && tenant.mitmieter.vorname ? [["Mitmieter*in", mitmieterZeile(tenant.mitmieter)]] : []),
                ...(Array.isArray(tenant.weitere_personen) && tenant.weitere_personen.length ? [["Weitere Personen", weiterePersonenZeile(tenant.weitere_personen)]] : []),
              ].map(([l,v])=>(<div key={l} className="ig"><label>{l}</label><span>{v}</span></div>))}</div>
              
              <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:18,marginBottom:8,fontWeight:500}}>Beruf & Einkommen</div>
              <div className="igrid">{[
                ["Beruf",tenant.beruf||"-"],
                ["Arbeitgeber",tenant.arbeitgeber||"-"],
                istAdmin && ["Einkommen",tenant.einkommen?`CHF ${tenant.einkommen}`:"-"],
                ["Beschäftigung",tenant.type||"-"],
              ].filter(Boolean).map(([l,v])=>(<div key={l} className="ig"><label>{l}</label><span>{v}</span></div>))}</div>
              
              <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:18,marginBottom:8,fontWeight:500}}>Mietverhältnis</div>
              <div className="igrid">{[
                ["Einzug",tenant.einzug||"-"],
                ["Auszug",tenant.auszug||"-"],
                istAdmin && ["Kaution-Variante",tenant.kautionOpt==="0x"?"Keine Kaution":tenant.kautionOpt==="1x"?"1× Miete":tenant.kautionOpt==="2x"?"2× Miete":tenant.kautionOpt==="3x"?"3× Miete":(tenant.kautionMonate?`${tenant.kautionMonate}× Miete`:"-")],
                (()=>{ const l=(parkplaetze||[]).filter(p=>p.tenant_id===tenant.id); return l.length>0 && ["Parkplatz", <span style={{cursor:"pointer",textDecoration:"underline dotted"}} onClick={()=>navigateTo&&navigateTo("parkplaetze",null)}>{l.map(p=>`${p.bezeichnung}${p.miete_verkauf!=null?` · ${chf(+p.miete_verkauf)}/Mt.`:""}`).join(", ")}</span>]; })(),
                istAdmin && ["Kautionsbetrag",tenant.kautionBetrag?`CHF ${(+tenant.kautionBetrag).toLocaleString('de-CH')}`:"-"],
                istAdmin && ["Servicegebühr/Mt.",tenant.kautionAufschlag?`CHF ${tenant.kautionAufschlag}`:"CHF 0"],
                istAdmin && ["Möbliert",tenant.moebliert?"Ja"+(tenant.moeblierungPauschale?` (CHF ${tenant.moeblierungPauschale}${tenant.moeblierungModus==="monatlich"?"/Mt.":" einmalig"})`:""):"Nein"],
                !istAdmin && ["Möbliert",tenant.moebliert?"Ja":"Nein"],
                ["Keine offenen Betreibungen",tenant.noDebt?<span style={{color:"#5a6e4a",fontWeight:600}}>✓ Bestätigt</span>:<span style={{color:"#8a8174"}}>- Nicht bestätigt</span>],
              ].filter(Boolean).map(([l,v])=>(<div key={l} className="ig"><label>{l}</label><span>{v}</span></div>))}</div>
              
              {/* QR-Einzahlungsschein Sektion */}
              {istAdmin && room && room.miete > 0 && (() => {
                const miete = Number(room.miete);
                const hasQR = !!tenant.qrReference;
                const sentAt = tenant.qrBillSentAt;
                const generatedAt = tenant.qrBillGeneratedAt;
                const lastAmount = tenant.qrBillAmount != null ? Number(tenant.qrBillAmount) : null;
                const amountChanged = hasQR && lastAmount != null && Math.abs(lastAmount - miete) > 0.01;
                const sending = qrBillSending === tenant.id;
                const refFormatted = hasQR ? tenant.qrReference.replace(/(\d{2})(\d{5})(\d{5})(\d{5})(\d{5})(\d{5})/, "$1 $2 $3 $4 $5 $6") : "";
                
                return (
                  <div style={{marginTop:22}}>
                    <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:8,fontWeight:500}}>QR-Einzahlungsschein · Dauerauftrag</div>
                    <div style={{background:hasQR?"#fafaf7":"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"14px 16px"}}>
                      {hasQR ? (
                        <>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap",marginBottom:10}}>
                            <div style={{flex:1,minWidth:240}}>
                              <div style={{fontSize:11,color:"#8a8174",marginBottom:3}}>QR-Referenz</div>
                              <div style={{fontSize:12,fontFamily:"'SF Mono',Monaco,monospace",color:"#1a1814",letterSpacing:".02em"}}>{refFormatted}</div>
                            </div>
                            <div>
                              <div style={{fontSize:11,color:"#8a8174",marginBottom:3,textAlign:"right"}}>Letzter Betrag</div>
                              <div style={{fontSize:13,fontWeight:600,color:"#1a1814",textAlign:"right"}}>CHF {lastAmount?.toLocaleString("de-CH",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                            </div>
                          </div>
                          <div style={{fontSize:10.5,color:"#8a8174",lineHeight:1.6,marginBottom:amountChanged?10:12}}>
                            {generatedAt && <>📄 Erstellt: {fmtDateDE(generatedAt)}</>}
                            {sentAt && <> · 📧 Gesendet: {fmtDateDE(sentAt)}</>}
                            {!sentAt && generatedAt && <> · ⚠️ noch nicht versendet</>}
                          </div>
                          {amountChanged && (
                            <div style={{background:"#fdf7e8",border:"1px solid #e8d2a8",borderRadius:6,padding:"8px 12px",marginBottom:12,fontSize:11.5,color:"#8a6a2e",lineHeight:1.5}}>
                              ⚠️ Miete hat sich geändert: CHF {lastAmount?.toLocaleString("de-CH")} → <strong>CHF {miete.toLocaleString("de-CH")}</strong>. Bitte neu generieren und an Mieter senden.
                            </div>
                          )}
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            {tenant.email ? (
                              <button className={amountChanged?"btn btn-p btn-sm":"btn btn-g btn-sm"} onClick={()=>{
                                const action = amountChanged ? "Neuen QR-Bill mit aktualisiertem Betrag" : "Neuen QR-Bill";
                                if (!confirm(`${action} generieren und an ${tenant.email} senden?\n\nDie QR-Referenz bleibt gleich, nur Betrag wird aktualisiert.`)) return;
                                generateQrBill(tenant.id);
                              }} disabled={sending}>
                                {sending ? "⏳ Sende..." : (amountChanged ? "🔄 Neu generieren + senden" : "📧 Erneut senden")}
                              </button>
                            ) : (
                              <div style={{fontSize:11,color:"#9b4a3e"}}>⚠️ Mieter hat keine Email-Adresse hinterlegt</div>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{fontSize:12,color:"#4a4439",lineHeight:1.6,marginBottom:12}}>
                            Erstelle einen persönlichen QR-Einzahlungsschein für den Mieter. Der Mieter scannt ihn einmal und richtet einen Dauerauftrag ein (fällig 25. des Vormonats).
                          </div>
                          {tenant.email ? (
                            <button className="btn btn-p btn-sm" onClick={()=>{
                              if (!confirm(`QR-Einzahlungsschein für ${tenant.vorname} ${tenant.nachname} erstellen und an ${tenant.email} senden?\n\nBetrag: CHF ${miete.toLocaleString("de-CH",{minimumFractionDigits:2,maximumFractionDigits:2})}`)) return;
                              generateQrBill(tenant.id);
                            }} disabled={sending}>
                              {sending ? "⏳ Erstelle PDF..." : "📄 QR-Einzahlungsschein erstellen + senden"}
                            </button>
                          ) : (
                            <div style={{fontSize:11.5,color:"#9b4a3e",lineHeight:1.5}}>
                              ⚠️ Mieter hat keine Email-Adresse hinterlegt. Bitte zuerst Email in den Profil-Daten ergänzen.
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
              
              {tenant.bemerkung&&<div style={{marginTop:18}}>
                <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:8,fontWeight:500}}>Bemerkung</div>
                <div style={{padding:"10px 14px",background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:6,fontSize:12.5,lineHeight:1.6}}>{tenant.bemerkung}</div>
              </div>}
              
              {tenant.bewerberId&&<div style={{marginTop:14,fontSize:11,color:"#8a8174",fontStyle:"italic"}}>↗ Übernommen aus Bewerbung #{tenant.bewerberId}</div>}
              
              <DocumentChecklist entityType="tenant" entityId={tenant.id} documents={documents} onJumpToDocs={()=>setTab("docs")} tenant={tenant} onJumpToDrittmeldung={()=>setTab("drittmeldung")}/>
            </div>}
            {tab==="docs"&&<DocumentsManager entityType="tenant" entityId={tenant.id} documents={documents} uploadDocument={uploadDocument} getDocumentUrl={getDocumentUrl} deleteDocument={deleteDocument}/>}
            {tab==="schluessel"&&<MieterSchluessel key={"ms"+tenant.id} tenant={tenant} updateTenant={updateTenant}/>}
            {tab==="komm"&&(()=>{
              // Neuestes Uebergabeprotokoll des Mieters finden, dessen Link als
              // Platzhalter {uebergabe_link} bereitstellen (falls vorhanden).
              const hps = (handoverProtocols||[]).filter(h => h.tenantId === tenant.id && h.signUrl);
              hps.sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));
              const uebergabeLink = hps[0]?.signUrl || "";
              const wgMitbewohner = apt ? (rooms||[])
                .filter(r => r.aptId === apt.id && r.tenantId && r.tenantId !== tenant.id)
                .map(r => (tenants||[]).find(x => x.id === r.tenantId))
                .filter(x => x && (x.status||"aktiv") === "aktiv")
                .map(x => `${(x.vorname||"").trim()} ${(x.nachname||"").trim()}`.trim() + (x.phone ? ` · ${x.phone}` : ""))
                .join("\n") : "";
              const vormieter = (room && room.tenantId && room.tenantId !== tenant.id) ? (tenants||[]).find(t => t && t.id === room.tenantId) : null;
              const nachmieter = room ? (tenants||[]).find(t => t && t.id !== tenant.id && t.roomId === room.id && (t.status||"aktiv")!=="archiviert") : null;
              const empf = {
                vorname: tenant.vorname, nachname: tenant.nachname, email: tenant.email, phone: tenant.phone,
                adresse: [apt?.adresse, [apt?.plz, apt?.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "), zimmer: room?.id || "", einzug: tenant.einzug || "", auszug: tenant.auszug || "",
                uebergabe_link: uebergabeLink, mitbewohner: wgMitbewohner,
                vormieter_name: vormieter ? `${vormieter.vorname||""} ${vormieter.nachname||""}`.trim() : "",
                vormieter_telefon: vormieter ? (vormieter.phone||"") : "",
                nachmieter_name: nachmieter ? `${nachmieter.vorname||""} ${nachmieter.nachname||""}`.trim() : "",
                nachmieter_telefon: nachmieter ? (nachmieter.phone||"") : "",
                sprache: tenant.sprache || "de",
                istWohnung: aptIstWohnung(apt),
                aptId: apt?.id || "",
              };
              return <KommunikationTab key={"t"+tenant.id} empfaenger={empf} zielgruppe="mieter"/>;
            })()}
            {tab==="uebergabe" && <div style={{display:"flex",background:"#f1ece2",borderRadius:9,padding:3,marginBottom:16,maxWidth:300}}>
              <button onClick={()=>setUebTab("einzug")} style={{flex:1,textAlign:"center",background:uebTab==="einzug"?"var(--ink)":"transparent",color:uebTab==="einzug"?"#fff":"var(--ink)",border:"none",borderRadius:7,padding:"8px 0",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Einzug</button>
              <button onClick={()=>setUebTab("auszug")} style={{flex:1,textAlign:"center",background:uebTab==="auszug"?"var(--ink)":"transparent",color:uebTab==="auszug"?"#fff":"var(--ink)",border:"none",borderRadius:7,padding:"8px 0",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Auszug</button>
            </div>}
            {tab==="uebergabe" && uebTab==="auszug" && <KautionsAbrechnung tenant={tenant} updateTenant={updateTenant}/>}
            {tab==="uebergabe" && uebTab==="einzug" && (()=>{
              const hatAltesDok = (documents||[]).some(d => d.entity_type==="tenant" && d.entity_id===tenant.id && (d.category||"").toLowerCase().includes("übergabeprotokoll"));
              const hatDigital = (handoverProtocols||[]).some(h => h.tenant_id===tenant.id && ["accepted","auto_accepted","abgeschlossen","completed"].includes(h.status));
              const manuell = (tenant.uebergabeStatus||"offen")==="erledigt";
              const erledigt = manuell || hatAltesDok || hatDigital;
              const grund = hatDigital ? "Digitales Protokoll akzeptiert" : hatAltesDok ? "Protokoll als Dokument hinterlegt" : manuell ? (tenant.uebergabeNotiz||"Manuell als erledigt markiert") : "";
              return (
                <>
                  <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",padding:"10px 13px",borderRadius:8,marginBottom:16,background:erledigt?"var(--green-soft)":"#f7e4e0",border:`1px solid ${erledigt?"#c5d5b0":"#e0bcb0"}`}}>
                    <span style={{fontSize:9.5,textTransform:"uppercase",letterSpacing:".22em",color:erledigt?"#3d4f2f":"#9b4a3e",fontWeight:600}}>Übergabe {erledigt?"erledigt":"offen"}</span>
                    {grund && <span style={{fontSize:11,color:"var(--muted)"}}>{grund}</span>}
                    {(() => {
                      const nr = (tenant.schluesselNr||"").trim() || (tenant.schluesselAnzahl||"").toString().trim();
                      const extra = (tenant.extraSchluessel||"").trim();
                      if (!nr && !extra) return <span style={{fontSize:11,color:"var(--muted)"}}>🔑 keine Schlüsselnummer erfasst</span>;
                      return <span style={{fontSize:11,color:"var(--ink)"}}>🔑 {[nr && ("Schlüssel " + nr), extra && ("Zusatz: " + extra)].filter(Boolean).join(" · ")}</span>;
                    })()}
                    {!hatDigital && !hatAltesDok && (
                      <button className="btn btn-sm" style={{marginLeft:"auto"}}
                        onClick={()=>{
                          const neuS = manuell ? "offen" : "erledigt";
                          if (window.confirm(neuS==="erledigt" ? "Übergabe ohne digitales Protokoll als erledigt markieren?" : "Wieder als offen markieren?"))
                            updateTenant(tenant.id, {uebergabeStatus:neuS, uebergabeNotiz: neuS==="erledigt" ? "Manuell als erledigt markiert" : ""});
                        }}>
                        {manuell ? "Wieder öffnen" : "Als erledigt markieren"}
                      </button>
                    )}
                  </div>
                  <UebergabeProtokoll tenant={tenant} room={room} apt={apt} uploadDocument={uploadDocument} updateTenant={updateTenant} documents={documents} getDocumentUrl={getDocumentUrl} deleteDocument={deleteDocument} protokolle={protokolle} insertProtokoll={insertProtokoll} updateProtokoll={updateProtokoll} deleteProtokoll={deleteProtokoll} handoverProtocols={handoverProtocols} startHandoverProtocol={startHandoverProtocol} cancelHandoverProtocol={cancelHandoverProtocol} acceptHandoverProtocol={acceptHandoverProtocol} extendHandoverDeadline={extendHandoverDeadline} deleteHandoverProtocol={deleteHandoverProtocol} loadHandoverProtocols={loadHandoverProtocols} resendHandoverInvite={resendHandoverInvite}/>
                </>
              );
            })()}
            {tab==="portal"&&<MieterPortalTab key={"mp"+tenant.id} tenant={tenant}/>}
            {tab==="drittmeldung"&&<DrittmeldungTab tenant={tenant} updateTenant={updateTenant} documents={documents} uploadDocument={uploadDocument} getDocumentUrl={getDocumentUrl} deleteDocument={deleteDocument}/>}
          </div>
        ):<div className="card" style={{margin:0,display:"flex",alignItems:"center",justifyContent:"center",minHeight:180}}><span style={{color:"#8a8478"}}>← Mieter wählen</span></div>}
      </div>
      {editing&&<div className="ov" onClick={e=>e.target===e.currentTarget&&setEditing(false)}><div className="modal" style={{width:640,maxHeight:"90vh",overflowY:"auto"}}>
        <div className="mt">Mieter bearbeiten</div>

        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Mieter-ID & Zuständigkeit</div>
        <div className="frow">
          <div className="fg">
            <label className="fl">ID <span style={{fontWeight:400,color:"#bab2a0",fontSize:10}}>(Format: T01, T02, …)</span></label>
            <input className="fi" value={form.id||""} onChange={F("id")} style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:600}}/>
            <div style={{fontSize:10,color:"#bab2a0",marginTop:4,lineHeight:1.4}}>
              ⚠️ ID-Änderung wirkt sich auf Zimmer-Zuordnung und Dokumente aus.
            </div>
          </div>
          <div className="fg">
            <label className="fl">👤 Bearbeitet von</label>
            <select className="fi" value={form.owner||""} onChange={F("owner")}>
              <option value="">-</option>
              <option value="Daan">Daan</option>
              <option value="Tijn">Tijn</option>
            </select>
          </div>
        </div>

        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:18,marginBottom:10,fontWeight:500}}>Persönliche Daten</div>
        <div className="frow"><div className="fg"><label className="fl">Vorname</label><input className="fi" value={form.vorname||""} onChange={F("vorname")}/></div><div className="fg"><label className="fl">Nachname</label><input className="fi" value={form.nachname||""} onChange={F("nachname")}/></div></div>
        <div className="frow"><div className="fg"><label className="fl">E-Mail</label><input className="fi" type="email" value={form.email||""} onChange={F("email")}/></div><div className="fg"><label className="fl">Telefon</label><input className="fi" value={form.phone||""} onChange={F("phone")}/></div></div>
        <div className="frow"><div className="fg"><label className="fl">Sprache für E-Mails</label><select className="fi" value={form.sprache==="en"?"en":"de"} onChange={F("sprache")}><option value="de">Deutsch</option><option value="en">Englisch</option></select></div><div className="fg"></div></div>
        <div className="frow"><div className="fg"><label className="fl">Geburtsdatum</label><input className="fi" type="date" value={toDateInputValue(form.geburt)} onChange={F("geburt")}/></div><div className="fg"><label className="fl">Zivilstand</label><select className="fi" value={form.zivilstand||""} onChange={F("zivilstand")}><option value="">-</option><option>ledig</option><option>verheiratet</option><option>eingetragene Partnerschaft</option><option>geschieden</option><option>verwitwet</option><option>getrennt</option></select></div><div className="fg"><label className="fl">Land (Adresse)</label><select className="fi" value={form.land||""} onChange={F("land")}><option value="">Schweiz (Standard)</option>{NATIONALITAETEN_TOP.map(n=><option key={n} value={n}>{n}</option>)}<option disabled>──────────</option>{NATIONALITAETEN_REST.map(n=><option key={n} value={n}>{n}</option>)}</select></div><div className="fg"><label className="fl">Nationalität</label><select className="fi" value={form.nat||""} onChange={F("nat")}><option value="">- Bitte wählen -</option>{NATIONALITAETEN_TOP.map(n=><option key={n} value={n}>{n}</option>)}<option disabled>──────────</option>{NATIONALITAETEN_REST.map(n=><option key={n} value={n}>{n}</option>)}</select></div></div>
        <div className="fg"><label className="fl">Vorherige Adresse</label><input className="fi" value={form.adresse||""} onChange={F("adresse")}/></div>
        <div className="frow"><div className="fg"><label className="fl">PLZ</label><input className="fi" value={form.plz||""} onChange={F("plz")}/></div><div className="fg"><label className="fl">Ort</label><input className="fi" value={form.ort||""} onChange={F("ort")}/></div></div>

        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:18,marginBottom:10,fontWeight:500}}>Beruf & Einkommen</div>
        <div className="frow"><div className="fg"><label className="fl">Beruf</label><input className="fi" value={form.beruf||""} onChange={F("beruf")}/></div><div className="fg"><label className="fl">Arbeitgeber</label><input className="fi" value={form.arbeitgeber||""} onChange={F("arbeitgeber")}/></div></div>
        <div className="frow"><div className="fg"><label className="fl">Einkommen CHF/Mt.</label><input className="fi" value={form.einkommen||""} onChange={F("einkommen")}/></div><div className="fg"><label className="fl">Beschäftigung</label><select className="fi" value={form.type||""} onChange={F("type")}><option value="">-</option><option value="Arbeitnehmer">Arbeitnehmer</option><option value="Selbstständig">Selbstständig</option><option value="Student">Student</option><option value="AOZ / Sozialhilfe">AOZ / Sozialhilfe</option><option value="Andere">Andere</option></select></div></div>

        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:18,marginBottom:10,fontWeight:500}}>Mietverhältnis</div>
        <div className="frow"><div className="fg"><label className="fl">Einzug</label><input className="fi" value={form.einzug||""} onChange={F("einzug")}/></div><div className="fg"><label className="fl">Auszug</label><input className="fi" value={form.auszug||""} onChange={F("auszug")}/></div></div>
        <div className="frow"><div className="fg"><label className="fl">Kaution-Variante</label><select className="fi" value={form.kautionOpt||""} onChange={e=>{
          const opt=e.target.value;
          const monate=opt==="3x"?3:opt==="2x"?2:opt==="1x"?1:0;
          const auf=opt==="0x"?150:opt==="1x"?100:opt==="2x"?50:0;
          // Try to find room mietzins via roomId first, then via tenantId backref
          let room = form.roomId ? rooms.find(r=>r.id===form.roomId) : null;
          if (!room && form.id) room = rooms.find(r=>r.tenantId===form.id);
          const bm = +room?.miete || 0;
          const strom = 25 * Math.max(1, +form.personen || 1); // Strom CHF 25 pro Person
          // If no room mietzins available, don't overwrite kautionBetrag (keep user-entered value)
          const betrag = bm > 0 ? (bm + strom) * monate : (form.kautionBetrag || 0);
          setForm(p=>({...p,kautionOpt:opt,kautionMonate:monate,kautionAufschlag:auf,kautionBetrag:betrag}));
        }}><option value="">-</option><option value="3x">3× Miete (Standard)</option><option value="2x">2× Miete (+CHF 50/Mt.)</option><option value="1x">1× Miete (+CHF 100/Mt.)</option><option value="0x">Keine Kaution (+CHF 150/Mt.)</option></select></div><div className="fg"><label className="fl">Kautionsbetrag CHF</label><input className="fi" type="number" value={form.kautionBetrag||""} onChange={F("kautionBetrag")}/></div></div>
        <div className="frow"><div className="fg"><label className="fl">Fixer Mietzins (netto + NK) CHF/Mt.</label><input className="fi" type="number" step="5" value={form.mietzins||""} onChange={F("mietzins")} placeholder="netto + Nebenkosten, ohne Strom"/></div></div>
        <div className="frow"><div className="fg"><label className="fl">Servicegebühr CHF/Mt.</label><input className="fi" type="number" value={form.kautionAufschlag||""} onChange={F("kautionAufschlag")}/></div></div>

        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:18,marginBottom:10,fontWeight:500}}>Möblierung & Status</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:12.5}}>
          <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",padding:"6px 0"}}><input type="checkbox" checked={!!form.moebliert} onChange={FB("moebliert")}/> Möbliert</label>
          <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",padding:"6px 0"}}><input type="checkbox" checked={!!form.noDebt} onChange={FB("noDebt")}/> Keine offenen Betreibungen</label>
        </div>
        {form.moebliert && <div className="frow">
          <div className="fg"><label className="fl">Möblierung</label>
            <select className="fi" value={form.moeblierungModus||"monatlich"} onChange={F("moeblierungModus")}>
              <option value="monatlich">Monatlich</option>
              <option value="einmalig">Einmalig</option>
            </select>
          </div>
          <div className="fg"><label className="fl">Möblierung {form.moeblierungModus==="einmalig"?"einmalig CHF":"CHF/Mt."}</label>
            <input className="fi" type="number" value={form.moeblierungPauschale||""} onChange={F("moeblierungPauschale")} placeholder={form.moeblierungModus==="einmalig"?"z.B. 990":"z.B. 150"}/>
          </div>
        </div>}

        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:18,marginBottom:10,fontWeight:500}}>Bemerkung</div>
        <div className="fg"><textarea className="fi" rows={3} value={form.bemerkung||""} onChange={F("bemerkung")} placeholder="Interne Notizen..."/></div>

        <div className="ma"><button className="btn btn-g" onClick={()=>setEditing(false)}>Abbrechen</button><button className="btn btn-p" onClick={save}>Speichern</button></div>
      </div></div>}

      {/* ZIMMER-WECHSEL MODAL */}
      {changingRoom && (() => {
        const currentRoom = rooms.find(r => r.tenantId === changingRoom.id) || (changingRoom.roomId ? rooms.find(r => r.id === changingRoom.roomId) : null);
        // Alle Zimmer ausser dem aktuellen
        const availableRooms = rooms.filter(r => r.id !== currentRoom?.id);
        // Gruppe: Freie zuerst, dann belegte
        const freie = availableRooms.filter(r => !r.occupied);
        const belegte = availableRooms.filter(r => r.occupied);
        return (
          <div className="ov" onClick={e=>e.target===e.currentTarget&&setChangingRoom(null)}>
            <div className="modal" style={{width:580,maxHeight:"90vh",overflowY:"auto"}}>
              <div className="mt">🔄 Zimmer wechseln</div>
              <div style={{fontSize:13,color:"#4a4439",marginBottom:6}}>
                <strong>{changingRoom.vorname} {changingRoom.nachname}</strong> ({changingRoom.id})
              </div>
              {currentRoom && (
                <div style={{fontSize:11.5,color:"#8a8174",marginBottom:14}}>
                  Aktuell: <strong>{currentRoom.id}</strong> · {apts.find(a=>a.id===currentRoom.aptId)?.adresse||""}
                </div>
              )}
              
              <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Neues Zimmer wählen</div>
              
              {freie.length === 0 && belegte.length === 0 ? (
                <div className="empty">Keine anderen Zimmer vorhanden</div>
              ) : (
                <div style={{maxHeight:380,overflowY:"auto"}}>
                  {freie.length > 0 && (
                    <>
                      <div style={{fontSize:10.5,color:"#5a6e4a",fontWeight:600,padding:"8px 4px 6px",letterSpacing:".05em"}}>✓ FREIE ZIMMER ({freie.length})</div>
                      {freie.map(r => {
                        const apt = apts.find(a => a.id === r.aptId);
                        const sel = newRoomId === r.id;
                        return (
                          <label key={r.id} style={{display:"flex",alignItems:"center",gap:11,padding:"10px 12px",background:sel?"#f5efe4":"#fefcf7",border:`1px solid ${sel?"#1a1814":"#e1d8c5"}`,borderRadius:8,cursor:"pointer",marginBottom:6}} onClick={()=>setNewRoomId(r.id)}>
                            <input type="radio" name="newroom" checked={sel} readOnly/>
                            <div style={{flex:1}}>
                              <div style={{fontSize:13,fontWeight:600}}>{r.id} <span style={{fontWeight:400,color:"#8a8174"}}>· {apt?.adresse||"-"}</span></div>
                              <div style={{fontSize:11,color:"#8a8174"}}>CHF {(+r.miete||0).toLocaleString("de-CH")}/Monat · {r.qm?`${r.qm} m²`:"k.A."}</div>
                            </div>
                            <span style={{fontSize:9.5,fontWeight:600,padding:"2px 7px",borderRadius:3,background:"#e8efde",color:"#3a5230",letterSpacing:".05em"}}>FREI</span>
                          </label>
                        );
                      })}
                    </>
                  )}
                  {belegte.length > 0 && (
                    <>
                      <div style={{fontSize:10.5,color:"#9b4a3e",fontWeight:600,padding:"14px 4px 6px",letterSpacing:".05em"}}>⚠ BELEGTE ZIMMER ({belegte.length})</div>
                      <div style={{fontSize:11,color:"#8a8174",fontStyle:"italic",marginBottom:8,padding:"0 4px"}}>Bei Auswahl: Tausch-Option (anderer Mieter zieht ins aktuelle Zimmer)</div>
                      {belegte.map(r => {
                        const apt = apts.find(a => a.id === r.aptId);
                        const occupant = tenants.find(x => x.id === r.tenantId);
                        const sel = newRoomId === r.id;
                        return (
                          <label key={r.id} style={{display:"flex",alignItems:"center",gap:11,padding:"10px 12px",background:sel?"#f5efe4":"#fefcf7",border:`1px solid ${sel?"#1a1814":"#e1d8c5"}`,borderRadius:8,cursor:"pointer",marginBottom:6}} onClick={()=>setNewRoomId(r.id)}>
                            <input type="radio" name="newroom" checked={sel} readOnly/>
                            <div style={{flex:1}}>
                              <div style={{fontSize:13,fontWeight:600}}>{r.id} <span style={{fontWeight:400,color:"#8a8174"}}>· {apt?.adresse||"-"}</span></div>
                              <div style={{fontSize:11,color:"#8a8174"}}>{occupant?`Belegt von ${occupant.vorname} ${occupant.nachname} (${occupant.id})`:"belegt"}</div>
                            </div>
                            <span style={{fontSize:9.5,fontWeight:600,padding:"2px 7px",borderRadius:3,background:"#fbeae6",color:"#8a3a2e",letterSpacing:".05em"}}>BELEGT</span>
                          </label>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
              
              <div className="ma">
                <button className="btn btn-g" onClick={()=>{setChangingRoom(null);setNewRoomId("");}}>Abbrechen</button>
                <button className="btn btn-p" onClick={executeRoomChange} disabled={!newRoomId}>✓ Verschieben</button>
              </div>
            </div>
          </div>
        );
      })()}

      {adding&&<div className="ov" onClick={e=>e.target===e.currentTarget&&setAdding(false)}><div className="modal" style={{width:640,maxHeight:"90vh",overflowY:"auto"}}>
        <div className="mt">+ Neuer Mieter manuell anlegen</div>
        <div style={{fontSize:11.5,color:"#8a8174",marginBottom:14,fontStyle:"italic",lineHeight:1.5}}>Für Direkt-Vermietungen ohne vorherige Bewerbung. Du kannst auch nur Pflichtfelder ausfüllen und den Rest später ergänzen.</div>

        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Persönliche Daten</div>
        <div className="frow"><div className="fg"><label className="fl">ID</label><input className="fi" value={newForm.id||""} onChange={NF("id")} placeholder="z.B. T18"/></div></div>
        <div className="frow"><div className="fg"><label className="fl">Vorname *</label><input className="fi" value={newForm.vorname||""} onChange={NF("vorname")}/></div><div className="fg"><label className="fl">Nachname *</label><input className="fi" value={newForm.nachname||""} onChange={NF("nachname")}/></div></div>
        <div className="frow"><div className="fg"><label className="fl">E-Mail</label><input className="fi" type="email" value={newForm.email||""} onChange={NF("email")}/></div><div className="fg"><label className="fl">Telefon</label><input className="fi" value={newForm.phone||""} onChange={NF("phone")}/></div></div>
        <div className="frow"><div className="fg"><label className="fl">Sprache für E-Mails</label><select className="fi" value={newForm.sprache==="en"?"en":"de"} onChange={NF("sprache")}><option value="de">Deutsch</option><option value="en">Englisch</option></select></div><div className="fg"></div></div>
        <div className="frow"><div className="fg"><label className="fl">Geburtsdatum</label><input className="fi" type="date" value={toDateInputValue(newForm.geburt)} onChange={NF("geburt")}/></div><div className="fg"><label className="fl">Zivilstand</label><select className="fi" value={newForm.zivilstand||""} onChange={NF("zivilstand")}><option value="">-</option><option>ledig</option><option>verheiratet</option><option>eingetragene Partnerschaft</option><option>geschieden</option><option>verwitwet</option><option>getrennt</option></select></div><div className="fg"><label className="fl">Land (Adresse)</label><select className="fi" value={newForm.land||""} onChange={NF("land")}><option value="">Schweiz (Standard)</option>{NATIONALITAETEN_TOP.map(n=><option key={n} value={n}>{n}</option>)}<option disabled>──────────</option>{NATIONALITAETEN_REST.map(n=><option key={n} value={n}>{n}</option>)}</select></div><div className="fg"><label className="fl">Nationalität</label><select className="fi" value={newForm.nat||""} onChange={NF("nat")}><option value="">- Bitte wählen -</option>{NATIONALITAETEN_TOP.map(n=><option key={n} value={n}>{n}</option>)}<option disabled>──────────</option>{NATIONALITAETEN_REST.map(n=><option key={n} value={n}>{n}</option>)}</select></div></div>
        <div className="fg"><label className="fl">Vorherige Adresse</label><input className="fi" value={newForm.adresse||""} onChange={NF("adresse")}/></div>
        <div className="frow"><div className="fg"><label className="fl">PLZ</label><input className="fi" value={newForm.plz||""} onChange={NF("plz")}/></div><div className="fg"><label className="fl">Ort</label><input className="fi" value={newForm.ort||""} onChange={NF("ort")}/></div></div>

        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:18,marginBottom:10,fontWeight:500}}>Beruf & Einkommen</div>
        <div className="frow"><div className="fg"><label className="fl">Beruf</label><input className="fi" value={newForm.beruf||""} onChange={NF("beruf")}/></div><div className="fg"><label className="fl">Arbeitgeber</label><input className="fi" value={newForm.arbeitgeber||""} onChange={NF("arbeitgeber")}/></div></div>
        <div className="frow"><div className="fg"><label className="fl">Einkommen CHF/Mt.</label><input className="fi" value={newForm.einkommen||""} onChange={NF("einkommen")}/></div><div className="fg"><label className="fl">Beschäftigung</label><select className="fi" value={newForm.type||""} onChange={NF("type")}><option value="">-</option><option value="Arbeitnehmer">Arbeitnehmer</option><option value="Selbstständig">Selbstständig</option><option value="Student">Student</option><option value="AOZ / Sozialhilfe">AOZ / Sozialhilfe</option><option value="Andere">Andere</option></select></div></div>

        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:18,marginBottom:10,fontWeight:500}}>Mietverhältnis</div>
        <div className="fg">
          <label className="fl">Zimmer zuteilen (optional)</label>
          <select className="fi" value={newForm.roomId||""} onChange={NF("roomId")}>
            <option value="">- Kein Zimmer (später zuweisen) -</option>
            {freeRooms.length===0?<option disabled>Keine freien Zimmer verfügbar</option>:freeRooms.map(r=>{const a=apts.find(x=>x.id===r.aptId);return <option key={r.id} value={r.id}>{objektLabel(r.id)} - {a?.adresse} ({chf(r.miete)}/Mt.)</option>;})}
          </select>
        </div>
        <div className="frow"><div className="fg"><label className="fl">Einzug</label><input className="fi" value={newForm.einzug||""} onChange={NF("einzug")} placeholder="DD.MM.YYYY"/></div><div className="fg"><label className="fl">Schlüsselnummer</label><input className="fi" value={newForm.schluesselAnzahl||""} onChange={NF("schluesselAnzahl")} placeholder="z.B. A145 oder 12B"/></div></div>
        <div className="fg"><label className="fl">Extra-Schlüssel</label><input className="fi" value={newForm.extraSchluessel||""} onChange={NF("extraSchluessel")} placeholder="z.B. 1× Briefkasten, 1× Keller"/></div>
        <label style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",fontSize:12.5,cursor:"pointer"}}><input type="checkbox" checked={!!newForm.schluesselUebergeben} onChange={NFB("schluesselUebergeben")}/> Schlüssel bereits übergeben</label>
        <div className="frow"><div className="fg"><label className="fl">Kaution-Variante</label><select className="fi" value={newForm.kautionOpt||""} onChange={NF("kautionOpt")}><option value="">-</option><option value="3x">3× Miete (Standard)</option><option value="2x">2× Miete (+CHF 50/Mt.)</option><option value="1x">1× Miete (+CHF 100/Mt.)</option><option value="0x">Keine Kaution (+CHF 150/Mt.)</option></select></div><div className="fg"><label className="fl">Kautionstyp</label><select className="fi" value={newForm.kautionType||""} onChange={NF("kautionType")}><option value="">-</option><option>Evorest</option><option>Firstcaution</option><option>GoCaution</option><option>Bankkaution</option><option>Bar</option></select></div></div>

        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:18,marginBottom:10,fontWeight:500}}>Möblierung & Status</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:12.5}}>
          <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",padding:"6px 0"}}><input type="checkbox" checked={!!newForm.moebliert} onChange={NFB("moebliert")}/> Möbliert</label>
          <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",padding:"6px 0"}}><input type="checkbox" checked={!!newForm.noDebt} onChange={NFB("noDebt")}/> Keine offenen Betreibungen</label>
        </div>

        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:18,marginBottom:10,fontWeight:500}}>Bemerkung</div>
        <div className="fg"><textarea className="fi" rows={3} value={newForm.bemerkung||""} onChange={NF("bemerkung")} placeholder="Interne Notizen..."/></div>

        <div className="ma">
          <button className="btn btn-g" onClick={()=>{setAdding(false);setNewForm({});}}>Abbrechen</button>
          <button className="btn btn-p" onClick={saveNew}>✓ Mieter anlegen</button>
        </div>
      </div></div>}
      {nachModal && nd && (() => {
        const t = nd._tenant;
        return (
        <div className="ov" onClick={e=>e.target===e.currentTarget && !nachBusy && setNachModal(false)}>
          <div className="modal" style={{width:560,maxHeight:"90vh",overflowY:"auto"}}>
            <div className="mt">⏱ Verlängerung · {t.vorname} {t.nachname}</div>
            <div style={{fontSize:11.5,color:"var(--muted)",marginBottom:16}}>Nachtrag zum bestehenden Untermietvertrag, gleiche Basis, nur neues Enddatum.</div>
            {nachResult ? (
              <div style={{padding:"16px 18px",borderRadius:8,background:nachResult.ok?"var(--green-soft)":"#f7e4e0",fontSize:13,lineHeight:1.6}}>
                {nachResult.ok ? (<>
                  <div style={{fontWeight:700,color:"#3d4f2f",marginBottom:6}}>✓ Verlängerung verschickt</div>
                  <div>Der Mieter hat eine E-Mail zum Unterschreiben erhalten{nachResult.emailSent?"":" (E-Mail-Status unklar, bitte prüfen)"}.</div>
                  <div style={{marginTop:6,fontSize:11.5,color:"var(--muted)"}}>Signatur-Link: {nachResult.signUrl}</div>
                </>) : (<>
                  <div style={{fontWeight:700,color:"var(--error)",marginBottom:6}}>Fehler</div>
                  <div>{nachResult.error}</div>
                </>)}
                <div style={{marginTop:14}}><button className="btn btn-p btn-sm" onClick={()=>setNachModal(false)}>Schliessen</button></div>
              </div>
            ) : (<>
              <div style={{marginBottom:14,padding:"12px 14px",background:"var(--beige-soft)",borderRadius:8,fontSize:12.5,lineHeight:1.7}}>
                <div><span style={{color:"var(--muted)"}}>Objekt:</span> {nd.adresse}{nd.zimmerId?`, Zimmer ${(nd.zimmerId||"").split("-")[1]||""}`:""}</div>
                <div><span style={{color:"var(--muted)"}}>Mietverhältnis ab:</span> {nd.mietbeginn?fmtDateDE(nd.mietbeginn):"nicht erfasst"}</div>
                <div style={{color:"var(--muted)",fontSize:11.5,marginTop:5}}>Übrige Bedingungen bleiben unverändert.</div>
              </div>
              {(() => {
                const verl = (contracts||[]).filter(c => (c.tenantId===t.id || (c.mieterEmail && t.email && c.mieterEmail.toLowerCase().trim()===t.email.toLowerCase().trim())) && c.contractType==="verlaengerung").sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
                if (verl.length===0) return null;
                const aktiv = verl.filter(c=>!["zurueckgezogen","abgelaufen"].includes(c.status));
                const sColors = {
                  "gesendet":{bg:"#fdf2e0",color:"#7a5c3c",border:"#e8c89c",label:"⏱ Gesendet"},
                  "geoeffnet":{bg:"#fdf2e0",color:"#7a5c3c",border:"#e8c89c",label:"👁 Geöffnet"},
                  "geoeffnet_ungelesen":{bg:"#fdf2e0",color:"#7a5c3c",border:"#e8c89c",label:"👁 Geöffnet"},
                  "mieter_signiert":{bg:"#e6eef6",color:"#2c4a6e",border:"#b0c8e0",label:"✍ Wartet auf Gegenzeichnung"},
                  "signiert":{bg:"#e8efde",color:"#3a5230",border:"#c5d5b0",label:"✓ Signiert"},
                  "abgeschlossen":{bg:"#e8efde",color:"#3a5230",border:"#c5d5b0",label:"✓ Abgeschlossen"},
                  "zurueckgezogen":{bg:"#f0ebe1",color:"#7a5c3c",border:"#d8d0c0",label:"✕ Zurückgezogen"},
                  "abgelaufen":{bg:"#fbeae6",color:"#8a3a2e",border:"#e8c5be",label:"⌛ Abgelaufen"},
                };
                return (
                  <div style={{marginBottom:16,padding:"14px 16px",background:aktiv.length>0?"#fdf2e0":"#fafaf7",border:`1px solid ${aktiv.length>0?"#e8c89c":"#e1d8c5"}`,borderRadius:8}}>
                    <div style={{fontSize:9.5,color:"#7a5c3c",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:600}}>{aktiv.length>0?"Verschickte Verlängerungen":"Frühere Verlängerungen"}</div>
                    {verl.map((c,idx)=>{
                      const sc=sColors[c.status]||{bg:"#f0ebe1",color:"#5a5249",border:"#d8d0c0",label:c.status||"?"};
                      const isA=["gesendet","geoeffnet","geoeffnet_ungelesen"].includes(c.status);
                      return (
                        <div key={c.id} style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:6,padding:"10px 12px",marginBottom:idx<verl.length-1?8:0}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,flexWrap:"wrap",gap:6}}>
                            <span style={{fontSize:12,color:"#3a352d",fontWeight:600}}>Verlängerung{c.sentAt?` · ${new Date(c.sentAt).toLocaleDateString("de-CH")}`:""}</span>
                            <span style={{display:"inline-block",padding:"2px 8px",borderRadius:10,background:sc.bg,color:sc.color,border:`1px solid ${sc.border}`,fontSize:10,fontWeight:600}}>{sc.label}</span>
                          </div>
                          {c.signUrl && (
                            <div style={{display:"flex",gap:5,marginBottom:6,alignItems:"center",flexWrap:"wrap"}}>
                              <div style={{fontSize:10.5,fontFamily:"monospace",color:"#3a352d",background:"#f5efe4",padding:"3px 7px",borderRadius:3,flex:"1 1 180px",wordBreak:"break-all",minWidth:0}}>{c.signUrl}</div>
                              <button type="button" onClick={()=>{navigator.clipboard.writeText(c.signUrl).then(()=>alert("Link kopiert!")).catch(()=>alert("Kopieren fehlgeschlagen"));}} style={{fontSize:10,padding:"3px 8px",background:"#f0ebe1",color:"#4a4439",border:"1px solid #d8d0c0",borderRadius:3,cursor:"pointer",flexShrink:0}}>📋 Kopieren</button>
                              <a href={c.signUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:10,padding:"3px 8px",background:"#e8efde",color:"#3a5230",border:"1px solid #c5d5b0",borderRadius:3,textDecoration:"none",flexShrink:0}}>↗ Öffnen</a>
                            </div>
                          )}
                          {isA && (
                            <div style={{display:"flex",justifyContent:"flex-end",gap:5}}>
                              <button type="button" onClick={async()=>{ if(!confirm("Verlängerung zurückziehen? Der Link wird ungültig.")) return; try{ await withdrawContract(c.id);}catch(e){} }} style={{fontSize:10.5,padding:"4px 10px",background:"#fbeae6",color:"#8a3a2e",border:"1px solid #e8c5be",borderRadius:4,cursor:"pointer"}}>✕ Zurückziehen</button>
                            </div>
                          )}
                          {c.status==="mieter_signiert" && (
                            <div style={{display:"flex",justifyContent:"flex-end",gap:5}}><CountersignButton contract={c} onDone={loadContracts}/></div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <div className="frow">
                <div className="fg"><label className="fl">Verlängert bis *</label><input className="fi" type="date" value={toDateInputValue(nd.mietende)} onChange={ND("mietende")}/><div style={{fontSize:10.5,color:"var(--muted)",marginTop:3,lineHeight:1.4}}>{(nd.mietende)?"Automatisch aus der Wohnung übernommen, bei Bedarf anpassbar.":"Enddatum der Wohnung ist nicht hinterlegt, bitte angeben."}</div></div>
              </div>
              {nachProgress && <div style={{fontSize:12.5,color:"var(--muted)",marginBottom:10}}>{nachProgress.msg}</div>}
              <div className="ma" style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                <button className="btn btn-g btn-sm" disabled={nachBusy} onClick={downloadNachtrag}>{nachBusy?"⏳ …":"📄 Herunterladen"}</button>
                <div style={{flex:1}}/>
                <button className="btn btn-g" disabled={nachBusy} onClick={()=>setNachModal(false)}>Abbrechen</button>
                <button className="btn btn-p" disabled={nachBusy} onClick={vorschauNachtrag}>{nachBusy?"⏳ …":"👁 Vorschau und senden"}</button>
              </div>
            </>)}
          </div>
        </div>
        );
      })()}
      {vorschauN && nd && <VertragVorschauModal vorschau={vorschauN} email={nd._tenant.email} busy={nachBusy} progress={nachProgress && nachProgress.msg} bestaetigenText="✓ Bestätigen und Verlängerung senden" onClose={()=>setVorschauN(null)} onConfirm={()=>sendNachtrag(vorschauN)}/>}
      {tvModal && tvData && (() => { const t = tvData._tenant; return (
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setTvModal(false)}>
          <div className="modal" style={{width:600}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:4}}>
              <div className="mt" style={{marginBottom:0}}>📄 Untermietvertrag erstellen</div>
              <button className="btn btn-g btn-sm" onClick={()=>{ setTvModal(false); setTvResult(null); }} disabled={tvSending} title="Schliessen" style={{flexShrink:0}}>✕ Abbrechen</button>
            </div>
            <div style={{height:14}}/>
            <div style={{background:"#f5efe4",border:"1px solid #ddd0b8",borderRadius:8,padding:"12px 16px",marginBottom:18,fontSize:12.5}}>
              <strong style={{color:"#1a1814"}}>{t.vorname} {t.nachname}</strong>
              <div style={{color:"#8a8174",fontSize:11.5,marginTop:3}}>{t.email} · {t.phone}</div>
            </div>
            
            {(() => {
              const activeContracts = (contracts || []).filter(c => c.tenantId === t.id && !["zurueckgezogen","abgelaufen"].includes(c.status));
              const allContracts = (contracts || []).filter(c => c.tenantId === t.id);
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
                            <CountersignButton contract={c} onDone={loadContracts} />
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
              <div className="fg"><label className="fl">Zimmer</label><select className="fi" value={tvData.zimmerId} onChange={e=>{
                const newId = e.target.value;
                const room = rooms.find(r=>r.id===newId);
                const apt = room ? apts.find(a=>a.id===room.aptId) : null;
                setTvData(p=>{
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
                /* Zimmer nur lokal fuer den Vertrag, keine Mieter-Zuordnung aendern */
              }}>
                {!rooms.find(r=>r.id===tvData.zimmerId) && tvData.zimmerId && <option value={tvData.zimmerId}>{tvData.zimmerId} (aktuell)</option>}
                {[...rooms].sort((a,b)=>String(a.id).localeCompare(String(b.id))).map(r=>{
                  const a = apts.find(x=>x.id===r.aptId);
                  return <option key={r.id} value={r.id}>{objektLabel(r.id)} - {a?.adresse||""} ({chf(r.miete)})</option>;
                })}
              </select></div>
              <div className="fg"><label className="fl">Adresse</label><input className="fi" value={tvData.adresse} onChange={e=>setTvData(p=>({...p,adresse:e.target.value}))}/></div>
            </div>
            <div className="frow" style={{marginBottom:18}}>
              <div className="fg"><label className="fl">PLZ</label><input className="fi" value={tvData.plz} onChange={e=>setTvData(p=>({...p,plz:e.target.value}))}/></div>
              <div className="fg"><label className="fl">Ort</label><input className="fi" value={tvData.ort} onChange={e=>setTvData(p=>({...p,ort:e.target.value}))}/></div>
            </div>
            {istWohnungsVertrag(tvData) && (
              <div style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"12px 16px",marginBottom:18}}>
                <div style={{fontSize:12.5,fontWeight:600,color:"#1a1814",marginBottom:2}}>Wohnung (unmöbliert) · {tvData.personen||1} Person(en)</div>
                <MitmieterEditor value={tvData.mitmieter} draft={tvData._mmDraft}
                  onChange={(mm, draft) => { setTvData(p => ({ ...p, mitmieter: mm, _mmDraft: draft })); if (tvData._tenant) updateTenant(tvData._tenant.id, { mitmieter: mm ? { ...mm, aktiv: true } : (draft && Object.keys(draft).length ? { ...draft, aktiv: false } : null) }); }}/>
              </div>
            )}

            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Mietdauer</div>
            <div className="fg" style={{marginBottom:8}}>
              <label className="fl">Einzugsdatum</label>
              <input className="fi" type="date" value={tvData.einzug?tvData.einzug.split("T")[0]:""} onChange={e=>setTvData(p=>({...p,einzug:e.target.value}))}/>
            </div>
            <div className="fg" style={{marginBottom:8}}>
              <label className="fl">Enddatum · optional, macht den Vertrag befristet</label>
              <input className="fi" type="date" max={tvData.apt?.mietende?toDateInputValue(tvData.apt.mietende):undefined} value={tvData.mietende?tvData.mietende.split("T")[0]:""} onChange={e=>setTvData(p=>({...p,mietende:e.target.value}))}/>
              {tvData.apt?.mietende && <div style={{fontSize:10.5,color:"#8a8174",marginTop:4}}>Die Wohnung endet am {tvData.apt.mietende}. Ein späteres Enddatum ist nicht möglich.</div>}
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
                const einzug = parseD(tvData.einzug);
                const userEnde = parseD(tvData.mietende);
                const aptEnde = parseD(tvData.apt?.mietende);
                const ende = userEnde || aptEnde;
                if (!einzug) return "ℹ Bitte Einzugsdatum setzen";
                if (!ende) return "→ Vertrag ist UNBEFRISTET (kein Enddatum gesetzt)";
                if (userEnde && aptEnde && userEnde > aptEnde) return `⚠ Enddatum darf nicht nach dem Mietende der Wohnung (${aptEnde.toLocaleDateString("de-CH")}) liegen`;
                const m = (ende - einzug) / (1000*60*60*24*30.44);
                if (ende <= einzug) return "⚠ Enddatum liegt vor dem Einzug";
                const istManuell = !!userEnde;
                const _immer = !!(tvData.apt && (tvData.apt.immer_befristet || tvData.apt.vermietungsart === "wohnung"));
                if (m > 0 && (m < 12 || _immer)) return `→ Vertrag ist BEFRISTET bis ${ende.toLocaleDateString("de-CH")} (${Math.round(m)} Monate${istManuell?", manuell gesetzt":", aus Wohnung"}${_immer && m >= 12 ? ", Wohnung immer befristet" : ""})`;
                return `→ Vertrag ist UNBEFRISTET (Wohnung endet in ${Math.round(m)} Monaten, mindestens 12)`;
              })()}
            </div>

            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Mietzins-Aufstellung</div>
            <div style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"14px 18px",marginBottom:14}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 110px",gap:8,alignItems:"center",fontSize:12.5}}>
                <span>Nettomiete</span><input className="fi" type="number" value={tvData.nettomiete} onChange={e=>{const v=+e.target.value;setTvData(p=>({...p,nettomiete:v,bruttomiete:v+p.nebenkosten,total:v+p.nebenkosten+p.strom+p.aufschlag}));}} style={{textAlign:"right"}}/>
                <span>Nebenkosten</span><input className="fi" type="number" value={tvData.nebenkosten} onChange={e=>{const v=+e.target.value;setTvData(p=>({...p,nebenkosten:v,bruttomiete:p.nettomiete+v,total:p.nettomiete+v+p.strom+p.aufschlag}));}} style={{textAlign:"right"}}/>
                <span style={{fontWeight:600,borderTop:"1px solid #1a1814",paddingTop:6}}>Bruttomiete</span>
                <span style={{fontWeight:600,textAlign:"right",borderTop:"1px solid #1a1814",paddingTop:6}}>CHF {tvData.bruttomiete.toLocaleString('de-CH')}</span>
                <span>Stromkosten</span><input className="fi" type="number" value={tvData.strom} onChange={e=>{const v=+e.target.value;setTvData(p=>({...p,strom:v,total:p.bruttomiete+v+p.aufschlag}));}} style={{textAlign:"right"}}/>
                {tvData.aufschlag>0&&(<>
                  <span style={{color:"#b8843e"}}>Kautions-Servicegebühr</span>
                  <span style={{color:"#b8843e",textAlign:"right",fontWeight:500}}>CHF {tvData.aufschlag}</span>
                </>)}
                <span style={{fontWeight:700,borderTop:"2px solid #1a1814",paddingTop:8,fontSize:14}}>Total / Mt.</span>
                <span style={{fontWeight:700,textAlign:"right",borderTop:"2px solid #1a1814",paddingTop:8,fontSize:14,color:"#1a1814"}}>CHF {tvData.total.toLocaleString('de-CH')}</span>
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
                <input className="fi" type="number" placeholder="leer" value={tvData.fruehererMietzins||""} onChange={e=>setTvData(p=>({...p,fruehererMietzins:e.target.value===""?"":+e.target.value}))} style={{width:120,textAlign:"right"}}/>
              </div>
            </div>

            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Kaution und Servicegebühr</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
              {[
                {monate:3,aufschlag:0,label:"3× Monatsmiete",note:"Volle Kaution, keine Gebühr"},
                {monate:2,aufschlag:50,label:"2× Monatsmiete",note:"+ CHF 50 / Monat Servicegebühr für Kautionsreduktion"},
                {monate:1,aufschlag:100,label:"1× Monatsmiete",note:"+ CHF 100 / Monat Servicegebühr für Kautionsreduktion"},
              ].map(opt=>{
                const sel=tvData.kautionMonate===opt.monate;
                return (
                  <label key={opt.monate} style={{padding:"12px 14px",background:sel?"#f5efe4":"#fefcf7",border:`1px solid ${sel?"#1a1814":"#e1d8c5"}`,borderRadius:8,cursor:"pointer",fontSize:12.5,display:"block"}} onClick={()=>{
                    const brutto = +tvData.bruttomiete || 0;
                    const strom = +tvData.strom || 25;
                    const newBetrag = (brutto + strom) * opt.monate;
                    setTvData(p=>({
                      ...p,
                      kautionMonate:opt.monate,
                      kautionBetrag:newBetrag,
                      aufschlag:opt.aufschlag,
                      total: brutto + strom + opt.aufschlag,
                    }));
                    // Sync zurueck an Bewerber
                    const typeMap = {3:"3x",2:"2x",1:"1x"};
                    updateTenant(t.id, { kautionType: typeMap[opt.monate], kautionAufschlag: opt.aufschlag });
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
              <span>Kautionsbetrag {tvData.kautionMonate>0?<span style={{fontSize:10.5,color:"#8a8174",fontWeight:400,marginLeft:6}}>(Standard: CHF {((+tvData.bruttomiete||0)+(+tvData.strom||25))*tvData.kautionMonate})</span>:null}</span>
              {tvData.kautionMonate > 0 ? (
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{color:"#1a1814"}}>CHF</span>
                  <input className="fi" type="number" step="1" value={tvData.kautionBetrag} onChange={e=>setTvData(p=>({...p,kautionBetrag:+e.target.value||0}))} style={{width:120,textAlign:"right",fontSize:13,fontWeight:600,padding:"6px 10px"}}/>
                </div>
              ) : <span style={{color:"#1a1814"}}>-</span>}
            </div>
            
            {/* Custom Servicegebühr */}
            <div style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"12px 18px",marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:13,fontWeight:600,gap:12}}>
              <span>Servicegebühr / Mt. <span style={{fontSize:10.5,color:"#8a8174",fontWeight:400,marginLeft:6}}>(Standard bei {tvData.kautionMonate}× Miete: CHF {[0,100,50,0,0][3-tvData.kautionMonate] ?? 0}{tvData.kautionMonate===0?150:tvData.kautionMonate===1?100:tvData.kautionMonate===2?50:0})</span></span>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{color:"#1a1814"}}>CHF</span>
                <input className="fi" type="number" step="1" value={tvData.aufschlag||0} onChange={e=>{
                  const val = +e.target.value || 0;
                  setTvData(p=>({
                    ...p,
                    aufschlag: val,
                    total: (+p.bruttomiete||0) + (+p.strom||25) + val,
                  }));
                  updateTenant(t.id, { kautionAufschlag: val });
                }} style={{width:120,textAlign:"right",fontSize:13,fontWeight:600,padding:"6px 10px"}}/>
              </div>
            </div>

            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Vertragsbedingungen</div>
            <div style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"14px 18px",marginBottom:18}}>
              <div className="frow" style={{marginBottom:0}}>
                <div className="fg">
                  <label className="fl">Mindest-Mietdauer (Monate)</label>
                  <input className="fi" type="number" min="1" max="60" value={tvData.minMietdauer||6} onChange={e=>setTvData(p=>({...p,minMietdauer:+e.target.value||6}))}/>
                  <div style={{fontSize:10.5,color:"#8a8174",marginTop:4}}>Standard: 6 Monate</div>
                </div>
                <div className="fg">
                  <label className="fl">Kündigungsfrist (Monate)</label>
                  <input className="fi" type="number" min="1" max="6" value={tvData.kuendigungsfrist||3} onChange={e=>setTvData(p=>({...p,kuendigungsfrist:+e.target.value||3}))}/>
                  <div style={{fontSize:10.5,color:"#8a8174",marginTop:4}}>Standard: 3 Monate</div>
                </div>
              </div>
            </div>

            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Spezielle Klausel</div>
            <div style={{marginBottom:18}}>
              <textarea className="fi" style={{width:"100%",minHeight:70,resize:"vertical",lineHeight:1.5}} value={tvData.sonderklausel||""} onChange={e=>setTvData(p=>({...p,sonderklausel:e.target.value}))} placeholder="Deutsch. Wird als Punkt 15.8 in den Untermietvertrag aufgenommen."/>
              <textarea className="fi" style={{width:"100%",minHeight:56,resize:"vertical",lineHeight:1.5,marginTop:8}} value={tvData.sonderklausel_en||""} onChange={e=>setTvData(p=>({...p,sonderklausel_en:e.target.value}))} placeholder="Optional: übersteuert die automatische Übersetzung. Leer lassen = wird beim Erstellen einmal automatisch übersetzt und gespeichert."/>
            </div>

            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Möblierung</div>
            <div style={{display:"flex",gap:10,marginBottom:10}}>
              <label style={{flex:1,padding:"10px 14px",background:tvData.moebliert?"#f5efe4":"#fefcf7",border:`1px solid ${tvData.moebliert?"#1a1814":"#e1d8c5"}`,borderRadius:8,cursor:"pointer",fontSize:12.5,display:"flex",alignItems:"center",gap:8}}>
                <input type="radio" checked={tvData.moebliert} onChange={()=>{
                  setTvData(p=>({...p,moebliert:true}));
                  updateTenant(t.id, { moebliert: "ja" });
                }}/> Möbliert
              </label>
              <label style={{flex:1,padding:"10px 14px",background:!tvData.moebliert?"#f5efe4":"#fefcf7",border:`1px solid ${!tvData.moebliert?"#1a1814":"#e1d8c5"}`,borderRadius:8,cursor:"pointer",fontSize:12.5,display:"flex",alignItems:"center",gap:8}}>
                <input type="radio" checked={!tvData.moebliert} onChange={()=>{
                  setTvData(p=>({...p,moebliert:false}));
                  updateTenant(t.id, { moebliert: "nein" });
                }}/> Unmöbliert
              </label>
            </div>
            {tvData.moebliert && (
              <div style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"14px 18px",marginBottom:18}}>
                <div style={{display:"flex",gap:8,marginBottom:12}}>
                  {[["einmalig","Einmalig kaufen",990],["monatlich","Monatlich mieten",150]].map(([modus,label,def])=>{
                    const on=(tvData.moeblierungModus||"einmalig")===modus;
                    return (<button key={modus} onClick={()=>{ setTvData(p=>({...p,moeblierungModus:modus,moeblierungPauschale:def})); updateTenant(t.id,{moeblierungModus:modus,moeblierungPauschale:def}); }} style={{flex:1,padding:"9px 12px",borderRadius:7,cursor:"pointer",fontSize:12,fontWeight:on?600:400,border:`1px solid ${on?"#1a1814":"#d8d0c0"}`,background:on?"#1a1814":"#fff",color:on?"#fff":"#5a5249"}}>{label}</button>);
                  })}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:13,fontWeight:600,gap:12}}>
                  <span>{(tvData.moeblierungModus||"einmalig")==="monatlich"?"Möblierung pro Monat":"Möblierung einmalig"}</span>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{color:"#1a1814"}}>CHF</span>
                    <input className="fi" type="number" step="1" value={tvData.moeblierungPauschale||((tvData.moeblierungModus||"einmalig")==="monatlich"?150:990)} onChange={e=>{
                      const val = +e.target.value || 0;
                      setTvData(p=>({...p, moeblierungPauschale: val}));
                      updateTenant(t.id, { moeblierungPauschale: val });
                    }} style={{width:120,textAlign:"right",fontSize:13,fontWeight:600,padding:"6px 10px"}}/>
                    <span style={{color:"#8a8174",fontSize:11}}>{(tvData.moeblierungModus||"einmalig")==="monatlich"?"/Mt.":"einmalig"}</span>
                  </div>
                </div>
              </div>
            )}
            {!tvData.moebliert && <div style={{marginBottom:18}}/>}

            <div style={{fontSize:11,color:"#6e6a62",marginBottom:8,letterSpacing:".05em",textTransform:"uppercase",fontWeight:600}}>⬇ Einzeln herunterladen (ohne Versand)</div>
            <div className="ma" style={{flexWrap:"wrap"}}>
              <button className="btn btn-g" onClick={()=>{ setTvModal(false); setTvResult(null); }} disabled={tvSending}>Abbrechen</button>
              <button className="btn btn-s" onClick={()=>tvDownload("umv")} disabled={tvSending||dlBusy==="umv"}>{dlBusy==="umv"?"⏳ …":"📄 UMV herunterladen"}</button>
              <button className="btn btn-s" onClick={()=>tvDownload("amz")} disabled={tvSending||dlBusy==="amz"}>{dlBusy==="amz"?"⏳ …":"📄 AMZ herunterladen"}</button>
            </div>
            <div style={{height:1,background:"#e8e3d8",margin:"12px 0"}}/>
            <div style={{fontSize:11,color:"#6e6a62",marginBottom:10,letterSpacing:".05em",textTransform:"uppercase",fontWeight:600}}>📤 Digital senden zum Online-Unterzeichnen</div>
            <button className="btn btn-p" style={{width:"100%",justifyContent:"center",padding:"12px 18px",fontSize:13.5}} onClick={async()=>{
                if (!t || !tvData) return;
                if (!t.email) { alert("Bewerber hat keine Email-Adresse."); return; }
                if (istWohnungsVertrag(tvData) && tvData.mitmieter && mitmieterFehlt(tvData.mitmieter)) { alert("Mitmieter*in unvollständig: " + mitmieterFehlt(tvData.mitmieter)); return; }
                setTvSending(true); setTvResult(null); setTvProgress({message:"Vorschau wird erstellt…",pct:0.1});
                try {
                  const pre = await vertragPdfsErstellen(t, tvData, ["umv","amz"], (msg,pct)=>setTvProgress({message:msg,pct}));
                  setVorschauT(pre);
                } catch(err) { setTvResult({success:false, error: "Vorschau fehlgeschlagen: " + err.message}); }
                finally { setTvSending(false); }
              }} disabled={tvSending}>{tvSending ? `⏳ ${tvProgress.message}` : "👁 Vorschau und digital senden"}</button>
            <VertragVorschauModal vorschau={vorschauT} email={t.email} busy={tvSending} progress={tvProgress && tvProgress.message} onClose={()=>setVorschauT(null)} onConfirm={async()=>{
                setTvSending(true); setTvResult(null); setTvProgress({message:"Starte...",pct:0});
                try {
                  const result = await sendContractForSigningShared(t, tvData, (msg,pct)=>setTvProgress({message:msg,pct}), ["umv","amz"], {tenantId: t.id, pre: vorschauT});
                  setTvResult({success:true, ...result}); setVorschauT(null);
                } catch(err) {
                  console.error("sendContractForSigning failed:", err);
                  setTvResult({success:false, error: err.message}); setVorschauT(null);
                } finally { setTvSending(false); }
              }}/>
            
            {tvSending && (
              <div style={{marginTop:14,padding:"10px 12px",background:"#f5efe4",border:"1px solid #e1d8c5",borderRadius:8}}>
                <div style={{height:6,background:"#e1d8c5",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.round(tvProgress.pct*100)}%`,background:"#1a1814",transition:"width .3s"}}></div>
                </div>
                <div style={{fontSize:11.5,color:"#6e6a62",marginTop:6}}>{tvProgress.message}</div>
              </div>
            )}
            
            {tvResult && tvResult.success && (
              <div style={{marginTop:14,padding:"14px 16px",background:"#e8f3ed",border:"1px solid #a5d4b8",borderRadius:8}}>
                <div style={{fontWeight:600,fontSize:13,color:"#1a5a32",marginBottom:6}}>✓ Vertrag erfolgreich gesendet</div>
                <div style={{fontSize:11.5,color:"#2d5e44",lineHeight:1.55}}>
                  {tvResult.emailSent ? `Email gesendet an ${t.email}` : "⚠ Email-Versand fehlgeschlagen - manuell nachsenden"}
                </div>
                <div style={{fontSize:11.5,color:"#2d5e44",marginTop:6}}>
                  Sign-Link: <a href={tvResult.signUrl} target="_blank" style={{color:"#1a5a32",textDecoration:"underline"}}>{tvResult.signUrl}</a>
                </div>
              </div>
            )}
            
            {tvResult && !tvResult.success && (
              <div style={{marginTop:14,padding:"14px 16px",background:"#fdecec",border:"1px solid #f0a5a5",borderRadius:8}}>
                <div style={{fontWeight:600,fontSize:13,color:"#8a1a1a",marginBottom:6}}>✗ Fehler beim Senden</div>
                <div style={{fontSize:11.5,color:"#5a1a1a",lineHeight:1.55}}>{tvResult.error}</div>
              </div>
            )}
          </div>
        </div>
      ); })()}
    </div>
  );
}

