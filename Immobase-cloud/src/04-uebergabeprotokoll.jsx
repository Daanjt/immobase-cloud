// ─── ÜBERGABEPROTOKOLL ───────────────────────────────────────────────────────
const UEBERGABE_RAUME_PRIVAT = ["Privates Zimmer"];
const UEBERGABE_RAUME_GEMEIN = ["Küche","Badezimmer","Eingang / Korridor"];
const ZUSTAND_OPTIONS = ["Sehr gut","Gut","Akzeptabel","Mangelhaft"];

// ─── SIGNATURE PAD ────────────────────────────────────────────────
// Canvas-basiertes Unterschriften-Pad - funktioniert mit Maus + Touch
function SignaturePad({value, onChange, placeholder}) {
  const canvasRef = React.useRef(null);
  const [isDrawing, setIsDrawing] = React.useState(false);
  const lastPos = React.useRef({x:0,y:0});
  const [hasDrawn, setHasDrawn] = React.useState(!!value);
  
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Set canvas internal size (for HD displays)
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1814";
    ctx.lineWidth = 2.5;
    // Wenn wir einen Wert haben, zeichne ihn
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = value;
    }
  }, []);
  
  function getPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  
  function start(e) {
    e.preventDefault();
    setIsDrawing(true);
    setHasDrawn(true);
    lastPos.current = getPos(e);
  }
  
  function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  }
  
  function end() {
    if (!isDrawing) return;
    setIsDrawing(false);
    // Konvertiere Canvas zu PNG Data-URL
    const dataUrl = canvasRef.current.toDataURL("image/png");
    onChange(dataUrl);
  }
  
  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
    onChange("");
  }
  
  return (
    <div style={{position:"relative",marginTop:6}}>
      <canvas
        ref={canvasRef}
        style={{
          width:"100%",
          height:140,
          border:"1.5px dashed #c5b89e",
          borderRadius:8,
          background:"#fff",
          cursor:"crosshair",
          touchAction:"none",
          display:"block"
        }}
        onMouseDown={start}
        onMouseMove={draw}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={draw}
        onTouchEnd={end}
      />
      {!hasDrawn && (
        <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:12,color:"#bab2a0",pointerEvents:"none",fontStyle:"italic"}}>
          {placeholder || "Mit dem Finger oder Maus unterschreiben"}
        </div>
      )}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
        <span style={{fontSize:11,color:hasDrawn?"#5a6e4a":"#bab2a0"}}>
          {hasDrawn ? "✓ Unterschrift erfasst" : "Noch keine Unterschrift"}
        </span>
        {hasDrawn && (
          <button onClick={clear} style={{background:"transparent",border:"1px solid #e1d8c5",borderRadius:4,fontSize:11,padding:"3px 8px",cursor:"pointer",color:"#9b4a3e"}}>
            ✕ Löschen
          </button>
        )}
      </div>
    </div>
  );
}

// ─── DRITTMELDEPFLICHT (Tab) ─────────────────────────────────────────────────
function DrittmeldungTab({ tenant, updateTenant, documents, uploadDocument, getDocumentUrl, deleteDocument }){
  const [ez, setEz] = useState({status: tenant.drittmeldungStatus||"offen", datum: tenant.drittmeldungDatum||"", notiz: tenant.drittmeldungNotiz||""});
  const [az, setAz] = useState({status: tenant.drittmeldungAuszugStatus||"offen", datum: tenant.drittmeldungAuszugDatum||"", notiz: tenant.drittmeldungAuszugNotiz||""});
  const [busy, setBusy] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [sub, setSub] = useState("einzug");
  const ezFile = useRef(null), azFile = useRef(null);
  useEffect(()=>{
    setEz({status: tenant.drittmeldungStatus||"offen", datum: tenant.drittmeldungDatum||"", notiz: tenant.drittmeldungNotiz||""});
    setAz({status: tenant.drittmeldungAuszugStatus||"offen", datum: tenant.drittmeldungAuszugDatum||"", notiz: tenant.drittmeldungAuszugNotiz||""});
  }, [tenant.id]);
  const CFG = {
    einzug: { title:"Einzug", cat:"Drittmeldebestätigung (Einzug)", fields:{status:"drittmeldungStatus",datum:"drittmeldungDatum",notiz:"drittmeldungNotiz"}, state:ez, setState:setEz, fileRef:ezFile,
              orig:{status:tenant.drittmeldungStatus||"offen",datum:tenant.drittmeldungDatum||"",notiz:tenant.drittmeldungNotiz||""} },
    auszug: { title:"Auszug", cat:"Drittmeldebestätigung (Auszug)", fields:{status:"drittmeldungAuszugStatus",datum:"drittmeldungAuszugDatum",notiz:"drittmeldungAuszugNotiz"}, state:az, setState:setAz, fileRef:azFile,
              orig:{status:tenant.drittmeldungAuszugStatus||"offen",datum:tenant.drittmeldungAuszugDatum||"",notiz:tenant.drittmeldungAuszugNotiz||""} },
  };
  async function saveKind(kind){
    const c = CFG[kind]; setBusy(kind+":save");
    try { await updateTenant(tenant.id, { [c.fields.status]:c.state.status, [c.fields.datum]:c.state.datum||null, [c.fields.notiz]:c.state.notiz }); }
    catch(e){ toast("Speichern fehlgeschlagen", "error"); }
    finally { setBusy(null); }
  }
  async function uploadKind(kind, file){
    if(!file) return; const c = CFG[kind]; setBusy(kind+":upload");
    try {
      await uploadDocument("tenant", tenant.id, c.cat, file);
      c.setState(s=>({...s, status:"gemeldet"}));
      await updateTenant(tenant.id, { [c.fields.status]:"gemeldet", [c.fields.datum]:c.state.datum||null, [c.fields.notiz]:c.state.notiz });
    } catch(err){ toast("Upload fehlgeschlagen", "error"); }
    finally { setBusy(null); if(c.fileRef.current) c.fileRef.current.value=""; }
  }
  function renderSection(kind){
    const c = CFG[kind];
    const docs = (documents||[]).filter(d => d.entity_type==="tenant" && d.entity_id===tenant.id && d.category===c.cat);
    const dirty = c.state.status!==c.orig.status || (c.state.datum||"")!==(c.orig.datum||"") || (c.state.notiz||"")!==(c.orig.notiz||"");
    const isGemeldet = c.state.status==="gemeldet";
    const uploading = busy===kind+":upload";
    return (
      <div style={{border:"1px solid var(--line-soft)",borderRadius:10,padding:"16px 18px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
          <span style={{fontSize:9.5,textTransform:"uppercase",letterSpacing:".22em",color:"var(--muted)",fontWeight:600}}>Status</span>
          <span style={{padding:"2px 10px",borderRadius:20,background:isGemeldet?"var(--green-soft)":"#f7e4e0",color:isGemeldet?"#3d4f2f":"#9b4a3e",fontSize:11.5,fontWeight:600}}>{isGemeldet?"Gemeldet":"Offen"}</span>
          {docs.length>0 && <span style={{fontSize:11.5,color:"#3d4f2f"}}>· Bestätigung hinterlegt</span>}
        </div>
        <div className="frow">
          <div className="fg"><label className="fl">Status</label>
            <select className="fi" value={c.state.status} onChange={e=>c.setState(s=>({...s,status:e.target.value}))}>
              <option value="offen">Offen</option>
              <option value="gemeldet">Gemeldet</option>
            </select>
          </div>
          <div className="fg"><label className="fl">Meldedatum</label><input className="fi" type="date" value={toDateInputValue(c.state.datum)} onChange={e=>c.setState(s=>({...s,datum:e.target.value}))}/></div>
        </div>
        <div className="fg" style={{marginBottom:12}}><label className="fl">Notiz</label><textarea className="fi" rows={2} value={c.state.notiz} onChange={e=>c.setState(s=>({...s,notiz:e.target.value}))} placeholder="z.B. Gemeinde, Referenz"/></div>
        <div style={{marginBottom:16}}><button className="btn btn-p btn-sm" disabled={busy===kind+":save"||!dirty} onClick={()=>saveKind(kind)}>{busy===kind+":save"?"Speichert…":"Status speichern"}</button></div>
        {docs.length>0 ? (
          <div style={{display:"grid",gap:6,marginBottom:12}}>
            {docs.map((d,i)=>(
              <div key={d.id||i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:"var(--surface)",border:"1px solid var(--line-soft)",borderRadius:8,fontSize:12.5}}>
                <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📄 {d.filename||d.category}</span>
                <button className="btn btn-g btn-sm" onClick={async()=>{ const u=await getDocumentUrl(d.storage_path); if(u) window.open(u,"_blank"); }}>Ansehen</button>
                <button className="btn btn-g btn-sm" onClick={async()=>{ if(confirm("Bestätigung löschen?")) await deleteDocument(d); }}>✕</button>
              </div>
            ))}
          </div>
        ) : null}
        <input ref={c.fileRef} type="file" accept="application/pdf,image/*" style={{display:"none"}} onChange={e=>uploadKind(kind, e.target.files&&e.target.files[0])}/>
        <div
          onDragOver={e=>{e.preventDefault(); setDragOver(kind);}}
          onDragLeave={e=>{e.preventDefault(); setDragOver(null);}}
          onDrop={e=>{e.preventDefault(); setDragOver(null); const f=e.dataTransfer.files&&e.dataTransfer.files[0]; if(f) uploadKind(kind,f);}}
          onClick={()=>!uploading&&c.fileRef.current&&c.fileRef.current.click()}
          style={{border:`1.5px dashed ${dragOver===kind?"#a08864":"var(--line-soft)"}`,borderRadius:9,padding:"18px 16px",textAlign:"center",cursor:uploading?"default":"pointer",background:dragOver===kind?"#f5efe4":"var(--surface)",transition:".15s"}}
        >
          {uploading ? <div style={{fontSize:12.5,color:"var(--muted)"}}>Lädt hoch…</div> : (
            <><div style={{fontSize:18,marginBottom:4}}>📎</div><div style={{fontSize:12,color:"var(--ink)"}}>Bestätigung hierher ziehen oder klicken</div></>
          )}
        </div>
      </div>
    );
  }
  return (
    <div>
      <div style={{background:"var(--surface)",border:"1px solid var(--line-soft)",borderRadius:10,padding:"14px 16px",marginBottom:16,fontSize:12.5,color:"var(--muted)",lineHeight:1.6}}>
        Die Drittmeldepflicht verlangt, dass die Untermietpartei bei der Gemeinde bzw. Einwohnerkontrolle gemeldet wird, sowohl beim Einzug als auch beim Auszug. Hier trackst du beide Meldungen und legst die jeweilige Bestätigung ab.
      </div>
      <div className="tabs" style={{marginBottom:16}}>
        {[["einzug","Einzug"],["auszug","Auszug"]].map(([k,l])=>(
          <button key={k} className={`tab${sub===k?" on":""}`} onClick={()=>setSub(k)}>Drittmeldung {l}</button>
        ))}
      </div>
      {renderSection(sub)}
    </div>
  );
}

function UebergabeProtokoll({tenant, room, apt, uploadDocument, updateTenant, documents, getDocumentUrl, deleteDocument, protokolle, insertProtokoll, updateProtokoll, deleteProtokoll, handoverProtocols, startHandoverProtocol, cancelHandoverProtocol, acceptHandoverProtocol, extendHandoverDeadline, deleteHandoverProtocol, loadHandoverProtocols, resendHandoverInvite}){
  // ═══ Uebernahmeprotokoll (Selbstbedienung durch Mieter) ═══
  const [showStartModal, setShowStartModal] = React.useState(false);
  const [startSchluesselNr, setStartSchluesselNr] = React.useState("");
  const [startExtraSchluessel, setStartExtraSchluessel] = React.useState("");
  const [startWgSchluessel, setStartWgSchluessel] = React.useState("");
  const [starting, setStarting] = React.useState(false);
  const [openProto, setOpenProto] = React.useState(null);
  const [refKeyInfo, setRefKeyInfo] = React.useState(null);
  React.useEffect(()=>{
    if(!showStartModal || !apt || !apt.id){ return; }
    (async()=>{
      const {data:a} = await supabase.from("apartments").select("schluessel_anzahl,extra_schluessel").eq("id",apt.id).single();
      const byTyp={};
      setRefKeyInfo({ erhNormal:a?a.schluessel_anzahl:null, erhExtra:a?a.extra_schluessel:null, byTyp });
    })();
  },[showStartModal, apt]);
  
  // Prefill mit aktuellen tenant-Schluesselwerten wenn Modal geoeffnet wird
  React.useEffect(() => {
    if (showStartModal && tenant) {
      setStartSchluesselNr(String((apt&&apt.schluesselAnzahl)||tenant.schluesselAnzahl||""));
      // Extraschluessel der Wohnung gehoeren in einer WG meist allen (Keller, Briefkasten ...)
      if (aptKat(apt)==="WG") { setStartWgSchluessel((apt&&apt.extraSchluessel)||""); setStartExtraSchluessel(""); }
      else { setStartExtraSchluessel((apt&&apt.extraSchluessel)||""); setStartWgSchluessel(""); }
    }
  }, [showStartModal, tenant?.id]);
  const myHandovers = (handoverProtocols || []).filter(h => h.tenantId === tenant?.id);
  const activeHandover = myHandovers.find(h => ["sent","in_progress"].includes(h.status));
  
  return (
    <div>
      {/* SELBST-ÜBERNAHMEPROTOKOLL (Mieter erfasst per Link) */}
      <div style={{background:"#fafaf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"14px 16px",marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:myHandovers.length>0?12:0,gap:8,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:14,fontWeight:600,color:"#3a352d"}}>📋 Übernahmeprotokoll</div>
            <div style={{fontSize:10.5,color:"#8a8478",marginTop:2}}>Digitale Schlüsselübergabe + Mängel-Dokumentation durch den Mieter. 14 Tage Frist.</div>
          </div>
          {!activeHandover && (
            <button onClick={()=>setShowStartModal(true)} style={{fontSize:12,padding:"7px 14px",background:"#e8efde",color:"#3a5230",border:"1px solid #c5d5b0",borderRadius:5,cursor:"pointer",fontWeight:600}}>
              📋 Protokoll starten
            </button>
          )}
        </div>
        
        {myHandovers.map((h, idx) => {
          const statusColors = {
            "sent": {bg:"#fdf2e0",color:"#7a5c3c",border:"#e8c89c",label:"⏱ Eingeladen"},
            "in_progress": {bg:"#e0ecf5",color:"#3a5570",border:"#a8c0d5",label:"✎ In Arbeit"},
            "submitted": {bg:"#fdf2e0",color:"#7a5c3c",border:"#e8c89c",label:"📤 Eingereicht"},
            "auto_accepted": {bg:"#e8efde",color:"#3a5230",border:"#c5d5b0",label:"✓ Auto-akzeptiert"},
            "accepted": {bg:"#e8efde",color:"#3a5230",border:"#c5d5b0",label:"✓ Akzeptiert"},
            "cancelled": {bg:"#f0ebe1",color:"#7a5c3c",border:"#d8d0c0",label:"✕ Abgebrochen"},
          };
          const sc = statusColors[h.status] || {bg:"#f0ebe1",color:"#5a5249",border:"#d8d0c0",label:h.status};
          const isActive = ["sent","in_progress"].includes(h.status);
          const isSubmitted = h.status === "submitted";
          const now = new Date();
          const dl = new Date(h.deadline);
          const daysLeft = Math.ceil((dl - now) / (1000*60*60*24));
          return (
            <div key={h.id} style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:6,padding:"10px 12px",marginBottom:idx<myHandovers.length-1?8:0}}>
              {/* Email-Status: gruener Haken wenn versendet, rote Warnung bei Error */}
              {h.inviteSentAt ? (
                <div style={{fontSize:10.5,color:"#3a5230",background:"#e8efde",border:"1px solid #c5d5b0",padding:"4px 8px",borderRadius:4,marginBottom:8,display:"inline-block"}}>
                  ✉️ Einladung versendet {new Date(h.inviteSentAt).toLocaleString("de-CH",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}
                </div>
              ) : h.inviteEmailError ? (
                <div style={{fontSize:10.5,color:"#9b4a3e",background:"#fdebe5",border:"1px solid #e0bcb0",padding:"4px 8px",borderRadius:4,marginBottom:8,display:"inline-block"}}>
                  ⚠️ Email-Fehler: {h.inviteEmailError.substring(0,60)}
                </div>
              ) : (
                <div style={{fontSize:10.5,color:"#8a6a2e",background:"#fdf7e8",border:"1px solid #e8d2a8",padding:"4px 8px",borderRadius:4,marginBottom:8,display:"inline-block"}}>
                  ⏳ Email wird versendet ...
                </div>
              )}
              {isActive && <div style={{marginBottom:8}}>
                <button onClick={()=>resendHandoverInvite(h.id)} style={{fontSize:10.5,padding:"4px 10px",background:"#1a1814",color:"#fff",border:"none",borderRadius:4,cursor:"pointer"}}>✉️ Einladung {h.inviteSentAt?"erneut senden":"senden"}</button>
              </div>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
                <span style={{fontSize:11.5,color:"#3a352d"}}>
                  Gestartet {new Date(h.startedAt).toLocaleDateString("de-CH")}
                  {isActive && daysLeft >= 0 && <span style={{marginLeft:8,color:daysLeft <= 3 ? "#8a3a2e" : "#8a8478",fontWeight:daysLeft <= 3 ? 600 : 400}}> · Deadline in {daysLeft} Tagen</span>}
                  {isActive && daysLeft < 0 && <span style={{marginLeft:8,color:"#8a3a2e",fontWeight:600}}> · ⌛ Abgelaufen</span>}
                </span>
                <span style={{display:"inline-block",padding:"3px 9px",borderRadius:11,background:sc.bg,color:sc.color,border:`1px solid ${sc.border}`,fontSize:10.5,fontWeight:600}}>{sc.label}</span>
              </div>
              {h.signUrl && isActive && (
                <div style={{display:"flex",gap:5,marginBottom:6,alignItems:"center",flexWrap:"wrap"}}>
                  <div style={{fontSize:10.5,fontFamily:"monospace",color:"#3a352d",background:"#f5efe4",padding:"3px 7px",borderRadius:3,flex:"1 1 180px",wordBreak:"break-all",minWidth:0}}>{h.signUrl}</div>
                  <button onClick={()=>{navigator.clipboard.writeText(h.signUrl).then(()=>alert("Link kopiert!")).catch(()=>{});}} style={{fontSize:10,padding:"3px 8px",background:"#f0ebe1",color:"#4a4439",border:"1px solid #d8d0c0",borderRadius:3,cursor:"pointer",flexShrink:0}}>📋 Kopieren</button>
                  <a href={h.signUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:10,padding:"3px 8px",background:"#e8efde",color:"#3a5230",border:"1px solid #c5d5b0",borderRadius:3,textDecoration:"none",flexShrink:0}}>↗ Öffnen</a>
                </div>
              )}
              {isSubmitted && h.submittedAt && (
                <div style={{fontSize:11,color:"#3a352d",marginBottom:6}}>
                  Eingereicht am {new Date(h.submittedAt).toLocaleDateString("de-CH")} · {(h.photos||[]).length} Fotos {h.mangelNotes ? `· Mängel angegeben` : `· Keine Mängel`}{(()=>{ const nrs=((h.schluesselData&&h.schluesselData.normal)||[]).map(k=>String((k&&k.nr)||"").trim()).filter(Boolean); return nrs.length?` · 🔑 ${nrs.join(", ")}`:""; })()}
                </div>
              )}
              <div style={{display:"flex",gap:5,justifyContent:"flex-end",flexWrap:"wrap"}}>
                {(isSubmitted || ["accepted","auto_accepted"].includes(h.status)) && (
                  <button onClick={()=>setOpenProto(openProto===h.id?null:h.id)} style={{fontSize:10.5,padding:"4px 10px",background:"#eef1f6",color:"#3a4a63",border:"1px solid #c3cede",borderRadius:4,cursor:"pointer"}}>{openProto===h.id?"Verbergen":"👁 Ansehen"}</button>
                )}
                {isActive && (
                  <>
                    <button onClick={async()=>{
                      if (!confirm(`Frist um 7 Tage verlängern?`)) return;
                      try { await extendHandoverDeadline(h.id, 7); } catch(e){alert("Fehler: "+e.message);}
                    }} style={{fontSize:10.5,padding:"4px 10px",background:"#f0ebe1",color:"#4a4439",border:"1px solid #d8d0c0",borderRadius:4,cursor:"pointer"}}>
                      +7 Tage
                    </button>
                    <button onClick={async()=>{
                      if (!confirm(`Protokoll abbrechen?\n\nDer Link wird ungültig.`)) return;
                      try { await cancelHandoverProtocol(h.id); } catch(e){alert("Fehler: "+e.message);}
                    }} style={{fontSize:10.5,padding:"4px 10px",background:"#fbeae6",color:"#8a3a2e",border:"1px solid #e8c5be",borderRadius:4,cursor:"pointer"}}>
                      ✕ Abbrechen
                    </button>
                  </>
                )}
                {isSubmitted && (
                  <HandoverConfirmButton protocol={h} onDone={loadHandoverProtocols} />
                )}
                <button onClick={async()=>{
                  if (!confirm(`Protokoll komplett löschen?`)) return;
                  try { await deleteHandoverProtocol(h.id); } catch(e){alert("Fehler: "+e.message);}
                }} style={{fontSize:10.5,padding:"4px 10px",background:"#fefcf7",color:"#9b4a3e",border:"1px solid #e0bcb0",borderRadius:4,cursor:"pointer"}}>
                  🗑
                </button>
              </div>
              {openProto===h.id && (
                <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #ece3d2"}}>
                  {h.submittedAt && <div style={{fontSize:11,color:"#8a8478",marginBottom:8}}>Eingereicht am {new Date(h.submittedAt).toLocaleString("de-CH",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}</div>}
                  {(()=>{ const sd=h.schluesselData||{}; const nrs=(Array.isArray(sd.normal)?sd.normal:[]).map(k=>String((k&&k.nr)||"").trim()); const ex=String(sd.extraText||"").trim(); const wg=String(sd.wgText||"").trim(); if(!nrs.length && !ex && !wg) return null; return (
                    <div style={{fontSize:11.5,color:"#3a352d",marginBottom:6,lineHeight:1.5}}><strong>🔑 Schlüssel:</strong> {nrs.length?`${nrs.length}× ${nrs.map(n=>n||"(keine Nr.)").join(", ")}`:""}{nrs.length&&ex?" · ":""}{ex?`persönlich zusätzlich: ${ex}`:""}{wg?<div style={{color:"#6b6253"}}>Gemeinsame WG-Schlüssel (gemeinsam anvertraut): {wg}</div>:null}</div>
                  ); })()}
                  <div style={{fontSize:11.5,color:"#3a352d",marginBottom:6,lineHeight:1.5}}><strong>Mängel:</strong> {h.mangelNotes ? h.mangelNotes : "keine angegeben"}</div>
                  {h.bemerkung && <div style={{fontSize:11.5,color:"#3a352d",marginBottom:6,lineHeight:1.5}}><strong>Bemerkung:</strong> {h.bemerkung}</div>}
                  <div style={{fontSize:11.5,color:"#3a352d",marginBottom:8}}><strong>Unterschrift:</strong> {h.tenantSignature || "keine"}</div>
                  {(h.photos||[]).length>0 ? (
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:8}}>
                      {(h.photos||[]).map((ph,pi)=>(
                        <HoLink key={pi} url={ph.url} target="_blank" rel="noreferrer" style={{textDecoration:"none"}}>
                          <HoImg url={ph.url} alt={ph.raum||""} loading="lazy" style={{width:"100%",height:90,objectFit:"cover",borderRadius:5,border:"1px solid #e1d8c5",display:"block"}} />
                          <div style={{fontSize:9.5,color:"#8a8478",marginTop:2,lineHeight:1.3}}>{ph.raum?ph.raum.charAt(0).toUpperCase()+ph.raum.slice(1):""}{ph.beschreibung?": "+ph.beschreibung:""}</div>
                        </HoLink>
                      ))}
                    </div>
                  ) : <div style={{fontSize:11,color:"#8a8478"}}>Keine Fotos eingereicht.</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* START-MODAL fuer Uebernahmeprotokoll */}
      {showStartModal && (
        <div className="ov-x" style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={e=>e.target===e.currentTarget && !starting && setShowStartModal(false)}>
          <div className="modal-x" style={{background:"#fefcf7",borderRadius:10,padding:"22px 26px",maxWidth:560,width:"100%",maxHeight:"92vh",overflowY:"auto"}}>
            <div style={{fontSize:16,fontWeight:600,marginBottom:6}}>📋 Übernahmeprotokoll starten</div>
            <div style={{fontSize:12,color:"#8a8174",marginBottom:18}}>Für {tenant?.vorname||""} {tenant?.nachname||""} · {apt?.adresse||""}{room?.id ? ", Zimmer "+room.id : ""}</div>
            
            <div style={{background:"#fdf2e0",border:"1px solid #e8c89c",borderRadius:8,padding:"12px 14px",marginBottom:16,fontSize:12.5,lineHeight:1.5,color:"#5a5044"}}>
              Nach dem Start erhält der Mieter einen Link mit 14 Tagen Frist für die Fotos und Mängel-Angabe.
              Nach Ablauf gilt die Wohnung automatisch als in einwandfreiem Zustand übernommen.
            </div>
            
            {refKeyInfo && (refKeyInfo.erhNormal!=null || refKeyInfo.erhExtra!=null) && (
              <div style={{background:"#f3f6f0",border:"1px solid #d9e2d2",borderRadius:6,padding:"8px 10px",marginBottom:12,fontSize:12.5,color:"#3a5230"}}>
                <div style={{fontWeight:600,marginBottom:2}}>Für diese Wohnung erhalten</div>
                {(refKeyInfo.erhNormal!=null || refKeyInfo.erhExtra!=null) && <div>{refKeyInfo.erhNormal||0} normale · {refKeyInfo.erhExtra||0} extra</div>}
              </div>
            )}
            <div style={{marginBottom:12}}>
              <label style={{display:"block",fontSize:12.5,fontWeight:600,marginBottom:6,color:"#3a352d"}}>Anzahl Wohnungsschlüssel</label>
              <input
                type="number"
                min="0"
                value={startSchluesselNr}
                onChange={e=>setStartSchluesselNr(e.target.value)}
                placeholder="z.B. 4"
                style={{width:"100%",padding:"10px 12px",border:"1px solid #d8d0c0",borderRadius:6,fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}
              />
            </div>
            <div style={{marginBottom:16}}>
              <label style={{display:"block",fontSize:12.5,fontWeight:600,marginBottom:2,color:"#3a352d"}}>{aptKat(apt)==="WG"?"Persönliche Extraschlüssel":"Extraschlüssel"}</label>
              {aptKat(apt)==="WG" && <div style={{fontSize:11,color:"#8a8174",marginBottom:6}}>Nur was diese Person persönlich bekommt (z.B. eigener Briefkastenschlüssel).</div>}
              <textarea
                value={startExtraSchluessel}
                onChange={e=>setStartExtraSchluessel(e.target.value)}
                placeholder={"z.B.\nBriefkastenschlüssel Nr. 4711\nWaschküche Nr. 89"}
                style={{width:"100%",minHeight:70,padding:"10px 12px",border:"1px solid #d8d0c0",borderRadius:6,fontSize:13,fontFamily:"inherit",lineHeight:1.5,boxSizing:"border-box",resize:"vertical"}}
              />
              {aptKat(apt)==="WG" && (<>
                <label style={{display:"block",fontSize:12.5,fontWeight:600,marginTop:12,marginBottom:2,color:"#3a352d"}}>Gemeinsame WG-Schlüssel</label>
                <div style={{fontSize:11,color:"#8a8174",marginBottom:6}}>Allen Bewohnern gemeinsam anvertraut (z.B. Keller, Waschküche). Bei Verlust ohne feststellbaren Verursacher haften die Bewohner zu gleichen Teilen.</div>
                <textarea
                  value={startWgSchluessel}
                  onChange={e=>setStartWgSchluessel(e.target.value)}
                  placeholder={"z.B.\n1x Keller\n1x Waschküche"}
                  style={{width:"100%",minHeight:60,padding:"10px 12px",border:"1px solid #d8d0c0",borderRadius:6,fontSize:13,fontFamily:"inherit",lineHeight:1.5,boxSizing:"border-box",resize:"vertical"}}
                />
              </>)}
              <div style={{fontSize:10.5,color:"#8a8174",marginTop:6}}>
                Diese Felder sind mit den Schlüssel-Daten des Mieters synchronisiert. Vorausgefüllt aus dem Schlüssel-Tab, beim Starten wird der Mieter aktualisiert.
              </div>
            </div>
            
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>!starting && setShowStartModal(false)} disabled={starting} style={{fontSize:12.5,padding:"8px 16px",background:"#f0ebe1",color:"#4a4439",border:"1px solid #d8d0c0",borderRadius:5,cursor:starting?"not-allowed":"pointer"}}>
                Abbrechen
              </button>
              <button onClick={async()=>{
                setStarting(true);
                try {
                  const nCount = Math.max(0, parseInt(startSchluesselNr)||0);
                  const extraTrim = startExtraSchluessel.trim();
                  const wgTrim = aptKat(apt)==="WG" ? startWgSchluessel.trim() : "";
                  await updateTenant(tenant.id, {
                    extraSchluessel: extraTrim,
                    schluesselUebergeben: false,
                  });
                  const schluesselData = { normal: Array.from({length:nCount},()=>({nr:""})), extraText: extraTrim, wgText: wgTrim };
                  const snapshot = [
                    nCount>0 && `${nCount}x Wohnungsschlüssel`,
                    extraTrim && `Extra: ${extraTrim}`,
                    wgTrim && `Gemeinsam (WG): ${wgTrim}`
                  ].filter(Boolean).join("\n");
                  // 3. Start the protocol mit vollem Snapshot
                  await startHandoverProtocol({
                    tenantId: tenant.id,
                    aptId: apt?.id,
                    roomId: room?.id,
                    mieterEmail: tenant.email,
                    mieterVorname: tenant.vorname,
                    mieterNachname: tenant.nachname,
                    mieterGeburtsdatum: tenant.geburt || null,
                    mieterNationalitaet: tenant.nat || null,
                    mieterTelefon: tenant.phone || null,
                    aptAdresse: apt?.adresse || null,
                    aptPlz: apt?.plz || null,
                    aptOrt: apt?.ort || null,
                    roomLabel: room?.id || null,
                    einzugDatum: tenant.einzug || null,
                    schluesselInfo: snapshot || null,
                    schluesselData,
                  });
                  setShowStartModal(false);
                } catch(e) {
                  alert("Fehler: " + (e.message || e));
                }
                setStarting(false);
              }} disabled={starting} style={{fontSize:12.5,padding:"8px 16px",background:starting?"#f0ebe1":"#3a5230",color:starting?"#8a8174":"#fff",border:"1px solid "+(starting?"#d8d0c0":"#3a5230"),borderRadius:5,cursor:starting?"not-allowed":"pointer",fontWeight:600}}>
                {starting ? "Starte..." : "📋 Protokoll starten"}
              </button>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}

