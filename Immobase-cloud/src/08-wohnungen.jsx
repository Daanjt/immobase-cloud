// ─── WOHNUNGEN ───────────────────────────────────────────────────────────────

// Keybox-Bild: liegt privat im documents-Bucket; fuer Mieter wird ein zeitlich begrenzter Link erzeugt
const KEYBOX_LINK_TAGE = 30;
async function keyboxBildLink(pfad, sekunden){
  if(!pfad) return "";
  const {data,error}=await supabase.storage.from("documents").createSignedUrl(pfad, sekunden||3600);
  return error?"":((data&&data.signedUrl)||"");
}
function KeyboxBild({box, aptId, onChange, bearbeiten}){
  const [url,setUrl]=useState("");
  const [busy,setBusy]=useState(false);
  const [ziehen,setZiehen]=useState(false);
  const inp=React.useRef(null);
  const dnd={
    onDragOver:e=>{ e.preventDefault(); e.dataTransfer.dropEffect="copy"; if(!ziehen) setZiehen(true); },
    onDragEnter:e=>{ e.preventDefault(); setZiehen(true); },
    onDragLeave:e=>{ if(!e.currentTarget.contains(e.relatedTarget)) setZiehen(false); },
    onDrop:e=>{ e.preventDefault(); setZiehen(false); const f=[...(e.dataTransfer.files||[])].find(x=>/^image\//.test(x.type)); if(f) hochladen(f); else toast("Bitte ein Bild hineinziehen","error"); },
  };
  useEffect(()=>{ let ok=true; if(box.bild_path){ keyboxBildLink(box.bild_path,3600).then(u=>{ if(ok) setUrl(u); }); } else setUrl(""); return ()=>{ok=false;}; },[box.bild_path]);
  async function hochladen(file){
    if(!file) return;
    if(!/^image\//.test(file.type)){ toast("Bitte ein Bild wählen","error"); return; }
    setBusy(true);
    try{
      const ext=((file.name||"").split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"")||"jpg";
      const pfad=`keyboxes/${aptId}/${box.id}-${Date.now()}.${ext}`;
      const {error:upErr}=await supabase.storage.from("documents").upload(pfad, file, {contentType:file.type, upsert:false});
      if(upErr) throw upErr;
      const {error}=await supabase.from("keyboxes").update({bild_path:pfad, updated_at:new Date().toISOString()}).eq("id", box.id);
      if(error) throw error;
      if(box.bild_path) supabase.storage.from("documents").remove([box.bild_path]).catch(()=>{});
      onChange(pfad); toast("Bild gespeichert");
    }catch(e){ toast("Bild konnte nicht hochgeladen werden","error"); }
    finally{ setBusy(false); if(inp.current) inp.current.value=""; }
  }
  async function entfernen(){
    if(!confirm("Bild der Keybox entfernen?")) return;
    const {error}=await supabase.from("keyboxes").update({bild_path:null, updated_at:new Date().toISOString()}).eq("id", box.id);
    if(error){ toast("Entfernen fehlgeschlagen","error"); return; }
    supabase.storage.from("documents").remove([box.bild_path]).catch(()=>{});
    onChange(null); toast("Bild entfernt");
  }
  if(!bearbeiten){
    if(!box.bild_path) return null;
    return (
      <a href={url||undefined} target="_blank" rel="noopener noreferrer" style={{display:"block",width:120,height:90,marginTop:10,borderRadius:8,overflow:"hidden",border:"1px solid #e6dccb",background:"#efe8da"}}>
        {url && <img src={url} alt="Keybox" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>}
      </a>
    );
  }
  return (
    <div {...dnd} style={{display:"flex",gap:12,alignItems:"center",marginTop:10,flexWrap:"wrap",padding:6,margin:"4px -6px 0",borderRadius:10,border:ziehen?"2px dashed #6b8a52":"2px dashed transparent",background:ziehen?"#eef3e8":"transparent",transition:"background .15s, border-color .15s"}}>
      <input ref={inp} type="file" accept="image/*" style={{display:"none"}} onChange={e=>hochladen(e.target.files&&e.target.files[0])}/>
      {box.bild_path ? (
        <a href={url||undefined} target="_blank" rel="noopener noreferrer" style={{display:"block",width:120,height:90,borderRadius:8,overflow:"hidden",border:"1px solid #e6dccb",background:"#efe8da",flex:"0 0 auto"}}>
          {url && <img src={url} alt="Keybox" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>}
        </a>
      ) : (
        <div style={{width:120,height:90,borderRadius:8,border:"1px dashed #d8ccb6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#8a8174",flex:"0 0 auto",textAlign:"center",padding:6}}>{ziehen?"Hier loslassen":"Bild hierher ziehen"}</div>
      )}
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        <button className="btn btn-g btn-sm" style={{width:"auto"}} disabled={busy} onClick={()=>inp.current&&inp.current.click()}>{busy?"Lädt hoch…":(box.bild_path?"📷 Bild ersetzen":"📷 Bild hinzufügen")}</button>
        {box.bild_path && !busy && <button className="btn btn-g btn-sm" style={{width:"auto",color:"#9b4a3e"}} onClick={entfernen}>Bild entfernen</button>}
      </div>
    </div>
  );
}

function SchluesselManager({apt, rooms, tenants, updateApt}) {
  const [erhNormal, setErhNormal] = useState("");
  const [erhExtra, setErhExtra] = useState("");
  const [erhEdit, setErhEdit] = useState(false);
  const [erhAlt, setErhAlt] = useState({n:"",e:""});
  const [boxen, setBoxen] = useState(null);
  useEffect(()=>{
    supabase.from("apartments").select("schluessel_anzahl,extra_schluessel").eq("id", apt.id).single().then(({data})=>{ if(data){ setErhNormal(data.schluessel_anzahl!=null?String(data.schluessel_anzahl):""); setErhExtra(data.extra_schluessel||""); } });
    ladeBoxen();
  },[apt.id]);
  async function ladeBoxen(){
    const {data,error}=await supabase.from("keyboxes").select("*").eq("apartment_id", apt.id).order("sort").order("created_at");
    if(error){ toast("Keyboxen konnten nicht geladen werden","error"); setBoxen([]); return; }
    setBoxen(data||[]);
  }
  const [bearbeite, setBearbeite] = useState(null);
  const [entwurfBox, setEntwurfBox] = useState({bezeichnung:"",code:"",notiz:""});
  function boxBearbeiten(b){ setEntwurfBox({bezeichnung:b.bezeichnung||"",code:b.code||"",notiz:b.notiz||""}); setBearbeite(b.id); }
  async function boxAllesSpeichern(b){
    const felder={ bezeichnung:(entwurfBox.bezeichnung||"").trim()||"Keybox", code:(entwurfBox.code||"").trim()||null, notiz:(entwurfBox.notiz||"").trim()||null, updated_at:new Date().toISOString() };
    const {error}=await supabase.from("keyboxes").update(felder).eq("id", b.id);
    if(error){ toast("Fehler beim Speichern","error"); return; }
    setBoxen(p=>p.map(x=>x.id===b.id?{...x,...felder}:x)); setBearbeite(null); toast("Gespeichert");
  }
  async function boxNeu(){
    const nr=(boxen||[]).length+1;
    const {data,error}=await supabase.from("keyboxes").insert({apartment_id:apt.id, bezeichnung: nr===1?"Keybox":"Keybox "+nr, sort:nr}).select().single();
    if(error){ toast("Keybox konnte nicht angelegt werden","error"); return; }
    setBoxen(p=>[...(p||[]), data]); boxBearbeiten(data);
  }
  async function boxLoeschen(b){
    if(!confirm(`«${b.bezeichnung||"Keybox"}» wirklich löschen?`)) return;
    const {error}=await supabase.from("keyboxes").delete().eq("id", b.id);
    if(error){ toast("Löschen fehlgeschlagen","error"); return; }
    setBoxen(p=>p.filter(x=>x.id!==b.id)); toast("Keybox gelöscht");
  }
  async function codeKopieren(code){ try{ await navigator.clipboard.writeText(code); toast("Code kopiert"); }catch(_){ toast("Kopieren nicht möglich","error"); } }
  async function saveErhalten(n, e){ let error=null; try{ if(updateApt){ await updateApt(apt.id,{schluesselAnzahl: n===""?null:+n, extraSchluessel: e===""?null:e}); return; } ({error}=await supabase.from("apartments").update({schluessel_anzahl: n===""?null:+n, extra_schluessel: e===""?null:e}).eq("id", apt.id)); }catch(x){ error=x; } toast(error?"Fehler beim Speichern":"Gespeichert", error?"error":"ok"); }
  const aptRooms = (rooms||[]).filter(r=>r.aptId===apt.id);
  const aptRoomIds = aptRooms.map(r=>r.id);
  // Mieter sind meist nur ueber das Zimmer (rooms.tenant_id) verknuepft, nicht ueber tenants.room_id
  const zimmerVon = (t)=>{ const r=aptRooms.find(r=>r.tenantId===t.id); return r ? r.id : (aptRoomIds.includes(t.roomId) ? t.roomId : ""); };
  const mieter = (tenants||[]).filter(t=>(t.status||"aktiv")==="aktiv" && (t.aptId===apt.id || aptRoomIds.includes(t.roomId) || aptRooms.some(r=>r.tenantId===t.id))).sort((a,b)=>String(zimmerVon(a)).localeCompare(String(zimmerVon(b)),undefined,{numeric:true}));
  const nrVon = (t)=>((t.schluesselNr||"").toString().trim() || (t.schluesselAnzahl||"").toString().trim());
  const td={padding:"8px 10px",borderTop:"1px solid #efe8da",fontSize:12.5,verticalAlign:"top"};
  const kopf={fontSize:12,fontWeight:600,color:"var(--ink)",marginBottom:4};
  return (
    <div>
      <div style={{marginBottom:18,background:"#f3f6f0",border:"1px solid #d9e2d2",borderRadius:8,padding:"12px 14px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:erhEdit?10:8}}>
          <div style={{fontSize:12,fontWeight:600,color:"#3a5230"}}>Erhaltene Schlüssel (von Verwaltung/Eigentümer)</div>
          {!erhEdit && <button className="btn btn-g btn-sm" style={{width:"auto"}} onClick={()=>{ setErhAlt({n:erhNormal,e:erhExtra}); setErhEdit(true); }}>✏ Bearbeiten</button>}
        </div>
        {erhEdit ? (<>
          <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-end"}}>
            <div style={{flex:"0 0 130px"}}><label className="fl">Wohnungsschlüssel</label><input className="fi" type="number" min="0" value={erhNormal} onChange={e=>setErhNormal(e.target.value)} placeholder="z.B. 3" autoFocus/></div>
            <div style={{flex:"1 1 220px"}}><label className="fl">Extra-Schlüssel</label><input className="fi" type="text" value={erhExtra} onChange={e=>setErhExtra(e.target.value)} placeholder="z.B. 2× Briefkasten, 1× Keller"/></div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:10}}>
            <button className="btn btn-g btn-sm" style={{width:"auto"}} onClick={()=>{ setErhNormal(erhAlt.n); setErhExtra(erhAlt.e); setErhEdit(false); }}>Abbrechen</button>
            <button className="btn btn-p btn-sm" style={{width:"auto"}} onClick={async()=>{ await saveErhalten(erhNormal.trim?erhNormal.trim():erhNormal, erhExtra.trim()); setErhEdit(false); }}>✓ Speichern</button>
          </div>
        </>) : (
          <div style={{display:"flex",gap:28,flexWrap:"wrap",fontSize:13}}>
            <div><div className="fl" style={{marginBottom:3}}>Wohnungsschlüssel</div><div style={{fontWeight:600}}>{erhNormal!==""?`${erhNormal}×`:"-"}</div></div>
            <div style={{minWidth:0}}><div className="fl" style={{marginBottom:3}}>Extra-Schlüssel</div><div style={{fontWeight:600,whiteSpace:"pre-wrap"}}>{(erhExtra||"").trim()||"-"}</div></div>
          </div>
        )}
      </div>
      <div style={{fontSize:12,fontWeight:600,color:"var(--ink)",marginBottom:4}}>Schlüssel bei Mietern</div>
      <div style={{fontSize:11,color:"#8a8174",marginBottom:10}}>Wird beim jeweiligen Mieter erfasst (Mieter → 🔑 Schlüssel). {mieter.length} aktive Mieter</div>
      {mieter.length===0 ? <div className="empty">Keine aktiven Mieter in dieser Wohnung.</div> : (
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{textAlign:"left",fontSize:9.5,color:"#8a8174",letterSpacing:".15em",textTransform:"uppercase"}}><th style={{padding:"6px 10px"}}>Mieter</th><th style={{padding:"6px 10px"}}>Zimmer</th><th style={{padding:"6px 10px"}}>Schlüsselnummer</th><th style={{padding:"6px 10px"}}>Extra</th></tr></thead>
          <tbody>{mieter.map(t=>(
            <tr key={t.id}>
              <td style={{...td,fontWeight:600}}>{t.vorname} {t.nachname}</td>
              <td style={td}>{zimmerVon(t)||"-"}</td>
              <td style={{...td,fontFamily:"monospace"}}>{nrVon(t)||<span style={{color:"#a4442e",fontFamily:"inherit"}}>fehlt</span>}</td>
              <td style={td}>{(t.extraSchluessel||"").trim()||"-"}</td>
            </tr>))}</tbody>
        </table></div>
      )}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:4,marginTop:26}}>
        <div style={kopf}>🔐 Keyboxen</div>
        <button className="btn btn-g btn-sm" onClick={boxNeu}>+ Keybox</button>
      </div>
      <div style={{fontSize:11,color:"#8a8174",marginBottom:10}}>Code und Bild der Keybox. Beides kannst du beim Mieter unter Kommunikation per E-Mail oder WhatsApp mitschicken.</div>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:22}}>
        {boxen===null ? <div style={{fontSize:12,color:"#8a8174"}}>Lädt…</div> : boxen.length===0 ? (
          <div className="empty">Noch keine Keybox erfasst. <button className="btn btn-g btn-sm" style={{marginLeft:8}} onClick={boxNeu}>+ Keybox anlegen</button></div>
        ) : boxen.map(b=>{ const edit=bearbeite===b.id; return (
          <div key={b.id} style={{background:"#faf7f1",border:"1px solid "+(edit?"#cdbb98":"#e6dccb"),borderRadius:10,padding:"12px 14px"}}>
            {edit ? (<>
              <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div style={{flex:"1 1 160px",minWidth:0}}><label className="fl">Bezeichnung</label><input className="fi" value={entwurfBox.bezeichnung} placeholder="z.B. Keybox Hauseingang" onChange={e=>setEntwurfBox(x=>({...x,bezeichnung:e.target.value}))}/></div>
                <div style={{flex:"1 1 200px",minWidth:0}}><label className="fl">Code</label><input className="fi" style={{fontFamily:"monospace",letterSpacing:".12em"}} type="text" autoComplete="off" value={entwurfBox.code} placeholder="z.B. 4711" onChange={e=>setEntwurfBox(x=>({...x,code:e.target.value}))}/></div>
              </div>
              <div style={{marginTop:8}}><label className="fl">Notiz</label><input className="fi" value={entwurfBox.notiz} placeholder="optional, z.B. welche Schlüssel drin sind" onChange={e=>setEntwurfBox(x=>({...x,notiz:e.target.value}))}/></div>
              <KeyboxBild box={b} aptId={apt.id} bearbeiten={true} onChange={pfad=>setBoxen(p=>p.map(x=>x.id===b.id?{...x,bild_path:pfad}:x))}/>
              <div style={{display:"flex",gap:8,alignItems:"center",marginTop:10,flexWrap:"wrap"}}>
                <button className="btn btn-g btn-sm" style={{color:"#9b4a3e",width:"auto"}} onClick={()=>boxLoeschen(b)}>Löschen</button>
                <div style={{flex:1}}/>
                <button className="btn btn-g btn-sm" style={{width:"auto"}} onClick={()=>setBearbeite(null)}>Abbrechen</button>
                <button className="btn btn-p btn-sm" style={{width:"auto"}} onClick={()=>boxAllesSpeichern(b)}>✓ Speichern</button>
              </div>
            </>) : (<>
              <div style={{display:"flex",gap:12,alignItems:"flex-start",justifyContent:"space-between"}}>
                <div style={{display:"flex",gap:28,flexWrap:"wrap",minWidth:0}}>
                  <div><div className="fl" style={{marginBottom:3}}>Bezeichnung</div><div style={{fontWeight:600,fontSize:13}}>{b.bezeichnung||"Keybox"}</div></div>
                  <div><div className="fl" style={{marginBottom:3}}>Code</div><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontFamily:"monospace",fontWeight:600,fontSize:15,letterSpacing:".12em"}}>{(b.code||"").trim()||"-"}</span>{b.code && <button className="btn btn-g btn-sm" style={{width:"auto",padding:"2px 8px"}} title="Code kopieren" onClick={()=>codeKopieren(b.code)}>⧉</button>}</div></div>
                  {(b.notiz||"").trim() && <div style={{minWidth:0}}><div className="fl" style={{marginBottom:3}}>Notiz</div><div style={{fontSize:13,whiteSpace:"pre-wrap"}}>{b.notiz}</div></div>}
                </div>
                <button className="btn btn-g btn-sm" style={{width:"auto",flex:"0 0 auto"}} onClick={()=>boxBearbeiten(b)}>✏ Bearbeiten</button>
              </div>
              <KeyboxBild box={b} aptId={apt.id} bearbeiten={false} onChange={()=>{}}/>
            </>)}
          </div>
        );})}
      </div>

    </div>
  );
}

function Wohnungen({parkplaetze=[],apts,rooms,tenants,partners,updateApt,insertApt,deleteApt,insertRoom,insertRooms,deleteRoom,updateRoom:updateRoomDb,documents,uploadDocument,getDocumentUrl,deleteDocument,navigateTo,navTarget,istAdmin=true}){
  const [sel,setSel]=useState(null);const [tab,setTab]=useState("info");const [editing,setEditing]=useState(false);const [form,setForm]=useState({});
  
  // Auto-select target apartment when navigated from another tab
  useEffect(() => {
    if (navTarget && navTarget.type === "wohnungen" && navTarget.id) {
      const [zielId, zielTab] = String(navTarget.id).split("#");
      setSel(zielId);
      setTab(zielTab || "info");
    }
  }, [navTarget]);
  const [filter,setFilter]=useState("alle");
  const [adding,setAdding]=useState(false);
  const [newForm,setNewForm]=useState({type:"WG",ort:"Zürich"});
  // Ansprechperson der Verwaltung (Liegenschaft) im Formular: null = unverändert
  const [anspNeu,setAnspNeu]=useState(null);
  const [anspEdit,setAnspEdit]=useState(null);
  const [lgAdressen,setLgAdressen]=useState([]);
  useEffect(()=>{ supabase.from("liegenschaften").select("adresse").then(({data})=>setLgAdressen((data||[]).map(x=>x.adresse))); },[]);
  const adressVorschlaege=[...new Set([...(apts||[]).map(a=>a.adresse).filter(Boolean),...lgAdressen])].sort((a,b)=>a.localeCompare(b,"de"));
  async function anspSpeichern(adresse, ansp){
    if(!ansp||!String(adresse||"").trim()) return;
    if(!ansp.kontakt_id && !String(ansp.kontakt_name||"").trim() && !String(ansp.kontakt_email||"").trim()) return;
    try{ await liegenschaftKontaktSpeichern(String(adresse).trim(), ansp); }catch(e){ toast("Ansprechperson konnte nicht gespeichert werden: "+(e.message||e),"error"); }
  }
  // Ist für die Adresse schon eine Liegenschaft mit Ansprechperson hinterlegt, Verwaltung vorschlagen
  function verwaltungVorschlag(setter, aktuell){ return (lg)=>{ if(!lg||aktuell) return; const firma=lg.kontakt_firma; const p=(partners||[]).find(x=>gleicheFirma(x.name,firma)); if(p) setter(prev=>prev.verwaltung?prev:({...prev,verwaltung:p.name})); }; }
  const [roomList,setRoomList]=useState([]);
  const [addRoomsFor,setAddRoomsFor]=useState(null);
  const [addRoomList,setAddRoomList]=useState([]);
  function openAddRooms(aptId){ setAddRoomsFor(aptId); setAddRoomList([{miete:"",groesse:"",balkon:false}]); }
  function syncAddUnits(v){ const nn=Math.max(0,Math.min(20,+v||0)); setAddRoomList(prev=>{const nx=[...prev]; while(nx.length<nn)nx.push({miete:"",groesse:"",balkon:false}); while(nx.length>nn)nx.pop(); return nx;}); }
  function updAddRoom(i,key,val){ setAddRoomList(prev=>prev.map((r,idx)=>idx===i?{...r,[key]:val}:r)); }
  async function submitAddRooms(){ const list=(addRoomList||[]).filter(Boolean); if(!list.length){ setAddRoomsFor(null); return; } const res=await insertRooms(addRoomsFor,list); if(res){ setAddRoomsFor(null); setAddRoomList([]); } }
  const apt=apts.find(a=>a.id===sel);const aptRooms=apt?rooms.filter(r=>r.aptId===apt.id).sort((a,b)=>natSort(a.id, b.id)):[];
  const wgApts=apts.filter(a=>aptKat(a)==="WG" && !a.pipeline).sort((a,b)=>natSort(a.id, b.id));
  const ganzeApts=apts.filter(a=>aptKat(a)==="Wohnung" && !a.pipeline).sort((a,b)=>natSort(a.id, b.id));
  const airbnbApts=apts.filter(a=>a.type==="Airbnb" && !a.pipeline).sort((a,b)=>natSort(a.id, b.id));
  const pipelineApts=apts.filter(a=>!!a.pipeline).sort((a,b)=>natSort(a.id, b.id));
  function F(k){return e=>setForm(p=>({...p,[k]:e.target.value}));}
  function NF(k){
    return e => {
      const val = e.target.value;
      setNewForm(p=>({...p,[k]:val}));
      // When units count changes, sync roomList length
      if (k === "units") {
        const n = Math.max(0, Math.min(20, +val||0));
        setRoomList(prev => {
          const next = [...prev];
          while (next.length < n) next.push({miete:"",groesse:"",balkon:false});
          while (next.length > n) next.pop();
          return next;
        });
      }
      // Reset roomList if switching to Airbnb
      if (k === "type" && val === "Airbnb") {
        setRoomList([]);
      }
    };
  }
  function updateRoom(i, key, val){
    setRoomList(prev => prev.map((r,idx) => idx===i ? {...r, [key]: val} : r));
  }
  function ungueltigesDatum(str){
    if(!str) return false; const m=String(str).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); if(!m) return false;
    const d=new Date(+m[3],+m[2]-1,+m[1]); return d.getDate()!==+m[1] || d.getMonth()!==+m[2]-1;
  }
  async function save(){
    for (const [k,l] of [["mietbeginn","Mietbeginn"],["mietende","Mietende"]]) { if (ungueltigesDatum(form[k])) { alert(`${l} "${form[k]}" ist kein gültiges Datum.`); return; } }
    const istWohn = (form.type||"WG")==="WG" && form.vermietungsart==="wohnung";
    if (istWohn) {
      const ar = (rooms||[]).filter(r=>r.aptId===form.id).sort((x,y)=>String(x.id).localeCompare(String(y.id),undefined,{numeric:true}));
      let unit = ar.find(r=>r.occupied||r.tenantId) || ar[0] || null;
      const weg = ar.filter(r=>r!==unit);
      if (weg.length) {
        const belegt = weg.filter(r=>r.occupied||r.tenantId);
        if (belegt.length) { alert(`Eine Wohnung hat genau 1 Zimmer. Die Zimmer ${belegt.map(r=>r.id).join(", ")} sind noch belegt. Bitte diese Mieter zuerst umziehen oder austragen.`); return; }
        if (!confirm(`Eine Wohnung hat genau 1 Zimmer (${unit.id}), an das der Mieter gekoppelt ist.\n\nDie Zimmer ${weg.map(r=>r.id).join(", ")} werden dafür gelöscht. Fortfahren?`)) return;
        for (const r of weg) { if (deleteRoom) await deleteRoom(r.id); }
      }
      if (!unit && insertRoom) unit = await insertRoom(form.id);
      if (unit && updateRoomDb && form.nettomiete_wohnung != null && form.nettomiete_wohnung !== "") await updateRoomDb(unit.id, { miete: +form.nettomiete_wohnung });
    }
    await updateApt(form.id,{
      ...(istWohn ? { units: 1 } : {}),
      adresse:form.adresse,plz:form.plz,ort:form.ort,
      stockwerk:form.stockwerk,zimmer:form.zimmer,
      miete:+form.miete||0,kaution:+form.kaution||0,
      kautionType:form.kautionType,refzins:form.refzins,
      mietbeginn:form.mietbeginn,mietende:form.mietende,
      verwaltung:form.verwaltung,eigentuemer:form.eigentuemer,
      refnr:form.refnr,vertrag:form.vertrag,
      pipeline:!!form.pipeline,
      ausschreiben:!!form.ausschreiben,
      nichtAusschreiben:!!form.nichtAusschreiben,
      merkmale: (Array.isArray(form.merkmale) ? form.merkmale : []).filter(x => !(istWohn && x === "WLAN inkl.")),
      immer_befristet: !!form.immer_befristet,
      type: form.type || "WG",
      vermietungsart: (form.type||"WG")==="WG" && form.vermietungsart==="wohnung" ? "wohnung" : "zimmer",
      nk_pro_person: 100,
      frueherer_mietzins: form.frueherer_mietzins===""||form.frueherer_mietzins==null ? null : +form.frueherer_mietzins,
      vergleichsmietzins: form.vergleichsmietzins===""||form.vergleichsmietzins==null ? null : +form.vergleichsmietzins,
      frueherer_nk: form.frueherer_nk===""||form.frueherer_nk==null ? null : +form.frueherer_nk,
      nebenkosten_wohnung: form.nebenkosten_wohnung===""||form.nebenkosten_wohnung==null ? null : +form.nebenkosten_wohnung,
      strom_pro_person: 25,
      flaeche: form.flaeche===""||form.flaeche==null ? null : +form.flaeche,
    });
    await anspSpeichern(form.adresse, anspEdit); setAnspEdit(null);
    setEditing(false);
  }
  function nextAptId(){
    let n=1;
    while(apts.find(a=>a.id===`A${n}`)) n++;
    return `A${n}`;
  }
  function duplicateApt(quelle){
    const neueId = nextAptId();
    // Alle wiederverwendbaren Stammdaten uebernehmen. Bewusst NICHT uebernommen:
    // Mietbeginn/Mietende, Vertrag und Belegung, weil diese pro Wohnung
    // individuell sind. ID wird frisch vergeben.
    setNewForm({
      id: neueId,
      adresse: quelle.adresse || "",
      plz: quelle.plz || "",
      ort: quelle.ort || "Zürich",
      type: quelle.type || "WG",
      zimmer: quelle.zimmer || "",
      units: quelle.units || "",
      stockwerk: quelle.stockwerk || "",
      miete: "",
      kaution: "",
      kautionType: quelle.kautionType || "",
      verwaltung: quelle.verwaltung || "",
      eigentuemer: quelle.eigentuemer || "",
      refzins: quelle.refzins || "",
      pipeline: !!quelle.pipeline,
      ausschreiben: false,
      mietbeginn: "",
      mietende: quelle.mietende || "",
      // Medien uebernehmen: Matterport ist nur ein Link (unkritisch).
      // Fotos werden beim Speichern physisch kopiert, damit spaeteres Loeschen
      // die Quell-Wohnung nicht beschaedigt. Hier nur die Quellpfade merken.
      matterportUrl: quelle.matterportUrl || "",
      photos: Array.isArray(quelle.photos) ? quelle.photos.map(p => ({...p, _copyFrom: p.path})) : [],
      floorplanPath: quelle.floorplanPath || "",
      _floorplanCopyFrom: quelle.floorplanPath || "",
      _srcAptId: quelle.id,
    });
    if ((quelle.type||"WG") === "WG") {
      const quellRooms = rooms.filter(r => r.aptId === quelle.id)
        .sort((a,b)=>natSort(a.id, b.id))
        .map(r => ({ groesse: r.groesse || "", miete: r.miete || "", balkon: !!r.balkon }));
      setRoomList(quellRooms);
    } else {
      setRoomList([]);
    }
    setAdding(true);
    setSel(null);
    window.scrollTo({top:0, behavior:"smooth"});
  }
  async function saveNew(){
    for (const [k,l] of [["mietbeginn","Mietbeginn"],["mietende","Mietende"]]) { if (ungueltigesDatum(newForm[k])) { alert(`${l} "${newForm[k]}" ist kein gültiges Datum.`); return; } }
    if (!newForm.adresse) { alert("Bitte Adresse angeben."); return; }
    const id = newForm.id || nextAptId();
    if (apts.find(a=>a.id===id)) { alert(`Wohnungs-ID "${id}" existiert bereits.`); return; }
    const apt = {
      id,
      adresse: newForm.adresse,
      plz: newForm.plz || "",
      ort: newForm.ort || "Zürich",
      type: newForm.type || "WG",
      zimmer: newForm.zimmer || "",
      units: newForm.type === "WG" ? (newForm.vermietungsart==="wohnung" ? 1 : (+newForm.units||0)) : null,
      vermietungsart: newForm.type === "WG" && newForm.vermietungsart==="wohnung" ? "wohnung" : "zimmer",
      nk_pro_person: 100,
      frueherer_mietzins: newForm.frueherer_mietzins ? +newForm.frueherer_mietzins : null,
      frueherer_nk: newForm.frueherer_nk ? +newForm.frueherer_nk : null,
      nebenkosten_wohnung: (newForm.nebenkosten_wohnung===""||newForm.nebenkosten_wohnung==null) ? null : +newForm.nebenkosten_wohnung,
      strom_pro_person: 25,
      flaeche: newForm.flaeche ? +newForm.flaeche : null,
      mietbeginn: newForm.mietbeginn || "",
      mietende: newForm.mietende || "",
      merkmale: (Array.isArray(newForm.merkmale) ? newForm.merkmale : []).filter(x => !(newForm.vermietungsart === "wohnung" && x === "WLAN inkl.")),
      immer_befristet: !!newForm.immer_befristet || /josefstrasse/i.test(newForm.adresse || ""),
      stockwerk: newForm.stockwerk || "",
      miete: +newForm.miete || 0,
      kaution: +newForm.kaution || 0,
      kautionType: newForm.kautionType || "",
      verwaltung: newForm.verwaltung || "",
      eigentuemer: newForm.eigentuemer || "",
      refzins: newForm.refzins || "",
      refnr: newForm.refnr || "",
      vertrag: newForm.vertrag || "",
      pipeline: !!newForm.pipeline,
      ausschreiben: !!newForm.ausschreiben,
      nichtAusschreiben: !!newForm.nichtAusschreiben,
      matterportUrl: newForm.matterportUrl || "",
      photos: Array.isArray(newForm.photos) ? newForm.photos : [],
      floorplanPath: newForm.floorplanPath || "",
    };
    // Aus einem Duplikat stammende Fotos physisch kopieren, damit die neue
    // Wohnung eigene, unabhaengige Dateien hat (Loeschen betrifft nicht die Quelle).
    const zuKopieren = (apt.photos || []).filter(p => p._copyFrom);
    if (zuKopieren.length > 0) {
      const srcAptId = newForm._srcAptId;
      // Kategorie eines Zimmerfotos von der Quell-Wohnung auf die neue umbiegen,
      // z.B. "room:A5-1" -> "room:A9-1" (gleiche Position, neue Wohnungs-ID).
      const remapKat = (kat) => {
        if (srcAptId && typeof kat === "string" && kat.startsWith(`room:${srcAptId}-`)) {
          const pos = kat.substring(`room:${srcAptId}-`.length);
          return `room:${id}-${pos}`;
        }
        return kat;
      };
      const kopierte = [];
      for (const p of apt.photos) {
        if (!p._copyFrom) { kopierte.push(p); continue; }
        const ext = (p._copyFrom.split(".").pop() || "jpg").toLowerCase();
        const ts = Date.now() + "-" + Math.random().toString(36).substr(2,7);
        const neuerPfad = `apartments/${id}/${ts}.${ext}`;
        try {
          const { error: copyErr } = await supabase.storage.from("assets").copy(p._copyFrom, neuerPfad);
          if (copyErr) { console.warn("Foto-Kopie fehlgeschlagen:", copyErr); const {_copyFrom, ...rest} = p; kopierte.push({...rest, category: remapKat(rest.category)}); }
          else { const {_copyFrom, ...rest} = p; kopierte.push({...rest, path: neuerPfad, category: remapKat(rest.category)}); }
        } catch(e) {
          console.warn("Foto-Kopie Ausnahme:", e); const {_copyFrom, ...rest} = p; kopierte.push({...rest, category: remapKat(rest.category)});
        }
      }
      apt.photos = kopierte;
    }
    // Grundriss ebenfalls kopieren, falls aus einem Duplikat uebernommen.
    if (apt.floorplanPath && newForm._floorplanCopyFrom) {
      const ext = (newForm._floorplanCopyFrom.split(".").pop() || "pdf").toLowerCase();
      const ts = Date.now() + "-" + Math.random().toString(36).substr(2,7);
      const neuerPfad = `apartments/${id}/grundriss-${ts}.${ext}`;
      try {
        const { error: fpErr } = await supabase.storage.from("assets").copy(newForm._floorplanCopyFrom, neuerPfad);
        apt.floorplanPath = fpErr ? "" : neuerPfad;
      } catch(e) { apt.floorplanPath = ""; }
    }
    await insertApt(apt, newForm.type === "WG" ? roomList : null);
    await anspSpeichern(apt.adresse, anspNeu); setAnspNeu(null);
    setAdding(false);
    setNewForm({type:"WG",ort:"Zürich"});
    setRoomList([]);
    setSel(id);
  }
  async function handleDelete(){
    if (!apt) return;
    if (!confirm(`Wohnung ${apt.id} (${apt.adresse}) wirklich löschen?\n\nAlle zugehörigen Zimmer werden ebenfalls entfernt.`)) return;
    await deleteApt(apt.id);
    setSel(null);
  }
  function renderAptCard(a){
    const rs=rooms.filter(r=>r.aptId===a.id);const o=rs.filter(r=>r.occupied).length;const on=sel===a.id;
    const meta=[a.zimmer?`${a.zimmer} Zi.`:null,a.stockwerk||null].filter(Boolean).join(" · ");
    return(
      <div key={a.id} onClick={()=>{setSel(a.id);setTab("info");}} style={{background:on?"#f5efe4":"#ffffff",border:`1px solid ${on?"#a08864":"#e8e3d8"}`,borderRadius:9,padding:"11px 13px",marginBottom:6,cursor:"pointer"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}><span style={{fontFamily:"'Manrope',sans-serif",fontWeight:700,fontSize:12.5,color:on?"#a08864":"#1f1d18"}}>{a.id}{a.pipeline&&<span style={{marginLeft:6,fontSize:8.5,color:"#8a8174",background:"#f5f2ea",border:"1px solid #e1d8c5",borderRadius:3,padding:"1px 5px",letterSpacing:".15em",fontWeight:600}}>PIPELINE</span>}{a.ausschreiben&&<span style={{marginLeft:6,fontSize:8.5,color:"var(--green)",background:"var(--green-soft)",border:"1px solid var(--green-soft)",borderRadius:3,padding:"1px 5px",letterSpacing:".15em",fontWeight:600}}>AUSGESCHRIEBEN</span>}{a.nichtAusschreiben&&<span style={{marginLeft:6,fontSize:8.5,color:"#9b4a3e",background:"#f7e9e5",border:"1px solid #edd4cd",borderRadius:3,padding:"1px 5px",letterSpacing:".15em",fontWeight:600}}>AUSGEBLENDET</span>}</span><TypeBadge type={a.vermietungsart==="wohnung"?"Wohnung":a.type}/></div>
        <div style={{fontSize:11,color:"#8a8478"}}>{a.adresse}</div>
        {meta&&<div style={{fontSize:10.5,color:"#a89e8b",marginTop:2,letterSpacing:".05em"}}>{meta}</div>}
        {rs.length>0&&<div style={{marginTop:6}}><Prog val={o} max={rs.length}/></div>}
      </div>
    );
  }
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
        <div>
          <div className="pt">Wohnungen</div>
          <div className="ps">{wgApts.length} WGs · {ganzeApts.length} Wohnungen · {airbnbApts.length} Airbnb</div>
        </div>
        <button className="btn btn-p" onClick={()=>{setNewForm({type:"WG",ort:"Zürich",id:nextAptId()});setAdding(true);}}>+ Neue Wohnung</button>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        {[["alle",`Alle (${wgApts.length+ganzeApts.length+airbnbApts.length+pipelineApts.length})`],["WG",`WGs (${wgApts.length})`],["Wohnung",`Wohnungen (${ganzeApts.length})`],["Airbnb",`Airbnb (${airbnbApts.length})`],["pipeline",`Pipeline (${pipelineApts.length})`]].map(([k,l])=>(
          <button key={k} className={`btn ${filter===k?"btn-p":"btn-g"} btn-sm`} onClick={()=>setFilter(k)}>{l}</button>
        ))}
      </div>
      <div className="list-detail" style={{display:"grid",gridTemplateColumns:"240px 1fr",gap:16}}>
        <div>
          {(filter==="alle"||filter==="WG")&&wgApts.length>0&&(
            <div style={{marginBottom:14}}>
              <div style={{fontSize:9,color:"#8a8174",textTransform:"uppercase",letterSpacing:".3em",fontWeight:600,marginBottom:8,paddingLeft:2}}>WGs</div>
              {wgApts.map(renderAptCard)}
            </div>
          )}
          {(filter==="alle"||filter==="Wohnung")&&ganzeApts.length>0&&(
            <div style={{marginBottom:14}}>
              <div style={{fontSize:9,color:"#8a8174",textTransform:"uppercase",letterSpacing:".3em",fontWeight:600,marginBottom:8,paddingLeft:2}}>Wohnungen</div>
              {ganzeApts.map(renderAptCard)}
            </div>
          )}
          {(filter==="alle"||filter==="Airbnb")&&airbnbApts.length>0&&(
            <div style={{marginBottom:14}}>
              <div style={{fontSize:9,color:"#8a8174",textTransform:"uppercase",letterSpacing:".3em",fontWeight:600,marginBottom:8,paddingLeft:2}}>Airbnb-Wohnungen</div>
              {airbnbApts.map(renderAptCard)}
            </div>
          )}
          {(filter==="alle"||filter==="pipeline")&&pipelineApts.length>0&&(
            <div>
              <div style={{fontSize:9,color:"#8a8174",textTransform:"uppercase",letterSpacing:".3em",fontWeight:600,marginBottom:8,paddingLeft:2}}>Pipeline-Wohnungen</div>
              {pipelineApts.map(renderAptCard)}
            </div>
          )}
        </div>
        {apt?(
          <div className="card" style={{margin:0}}>
            <div className="detail-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,gap:12,flexWrap:"wrap"}}>
              <div style={{minWidth:0,flex:"1 1 auto"}}><div style={{fontFamily:"'Manrope',sans-serif",fontWeight:700,fontSize:17,color:"#1f1d18",wordBreak:"break-word"}}>{apt.id} - {apt.adresse}</div><div style={{fontSize:11,color:"#8a8478",marginTop:2}}>{apt.plz} {apt.ort}{apt.stockwerk?` · ${apt.stockwerk}`:""}</div></div>
              <div className="detail-actions" style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button className="btn btn-g btn-sm" onClick={()=>{setForm({...apt});setAnspEdit(null);setEditing(true);}}>✏ Bearbeiten</button>
                {istAdmin && <button className="btn btn-g btn-sm" onClick={()=>duplicateApt(apt)}>⧉ Duplizieren</button>}
                <button className="btn btn-r btn-sm" onClick={handleDelete}>🗑 Löschen</button>
              </div>
            </div>
            <div className="tabs">{[["info","Übersicht"],["zimmer",apt.vermietungsart==="wohnung"?"Mietobjekt":"Zimmer"],["medien","Medien"],["schluessel","🔑\u00a0Schlüssel"],["docs","Dokumente"]].map(([k,l])=>(<button key={k} className={`tab${tab===k?" on":""}`} onClick={()=>setTab(k)}>{l}</button>))}</div>
            {tab==="info"&&(() => {
              const isWG = apt.type === "WG";
              const aptRooms = rooms.filter(r => r.aptId === apt.id);
              const belegt = aptRooms.filter(r => r.occupied);
              const zimmerEinnahmen = belegt.reduce((s,r) => s + (+r.miete || 0), 0);
              const stromEinnahmen = belegt.reduce((s,r)=>s+stromVonZimmer(r,(tenants||[]).find(x=>x.id===r.tenantId),apts),0);  // WG: 25 CHF pro Zimmer, Wohnung: pro Person
              const einnahmen = isWG ? zimmerEinnahmen + stromEinnahmen : 0;
              const kosten = +apt.miete || 0;
              const marge = einnahmen - kosten;
              const margePct = einnahmen > 0 ? Math.round((marge/einnahmen)*100) : 0;
              const auslastung = aptRooms.length > 0 ? Math.round((belegt.length/aptRooms.length)*100) : 0;
              
              // Max marge (if all rooms occupied)
              const maxZimmerEinnahmen = aptRooms.reduce((s,r) => s + (+r.miete || 0), 0);
              const maxStromEinnahmen = aptRooms.reduce((s,r)=>s+stromVonZimmer(r,r.occupied?(tenants||[]).find(x=>x.id===r.tenantId):null,apts),0);
              const maxEinnahmen = maxZimmerEinnahmen + maxStromEinnahmen;
              const maxMarge = maxEinnahmen - kosten;
              
              return (<div>
                <div className="igrid">{[
                  ["Typ",<TypeBadge type={apt.vermietungsart==="wohnung"?"Wohnung":apt.type}/>],
                  isWG && ["Vermietung", apt.vermietungsart==="wohnung" ? "Wohnung (unmöbliert)" : "Einzelne Zimmer"],
                  ["Früherer Mietzins", apt.frueherer_mietzins ? `CHF ${apt.frueherer_mietzins} netto${apt.frueherer_nk?` + CHF ${apt.frueherer_nk} NK`:""}` : "-"],
                  ["Zimmer",apt.zimmer+" Zi."],
                  ["Stockwerk",apt.stockwerk||"-"],
                  istAdmin && ["Miete (an Vermieter)",<strong style={{color:"#9b4a3e"}}>{chf(apt.miete)}</strong>],
                  istAdmin && ["Kaution",chf(apt.kaution)],
                  ["Kautionstyp",apt.kautionType||apt.kaution_type],
                  ["Referenzzinssatz",apt.refzins?`${apt.refzins}%`:"-"],
                  ["Referenz-Nr.",apt.refnr||"-"],
                  (()=>{ const l=(parkplaetze||[]).filter(p=>p.apt_id===apt.id); return l.length>0 && ["Parkplätze", <span style={{cursor:"pointer",textDecoration:"underline dotted"}} onClick={()=>navigateTo&&navigateTo("parkplaetze",null)}>{l.map(p=>p.bezeichnung).join(", ")}</span>]; })(),
                  ["Mietbeginn",apt.mietbeginn],
                  ["Mietende",apt.mietende||"-"],
                  istAdmin && ["Verwaltung",apt.verwaltung],
                  istAdmin && ["Eigentümer",apt.eigentuemer]
                ].filter(Boolean).map(([l,v])=>(<div key={l} className="ig"><label>{l}</label><span>{v}</span></div>))}</div>
                {istAdmin && apt.vermietungsart==="wohnung" && <MietzinsVergleich apt={apt} rooms={aptRooms} tenants={tenants}/>}
                
                {isWG && istAdmin && (
                  <div style={{marginTop:18,background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"16px 18px"}}>
                    <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:12,fontWeight:500,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span>Finanz-Übersicht</span>
                      <span style={{textTransform:"none",letterSpacing:"normal",fontSize:11,color:auslastung===100?"#5a6e4a":auslastung>=50?"#b8843e":"#9b4a3e"}}>{belegt.length}/{aptRooms.length} belegt · {auslastung}%</span>
                    </div>
                    
                    <div className="finance-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                      <div style={{background:"#fff",border:"1px solid #e8e3d8",borderRadius:6,padding:"12px 14px"}}>
                        <div style={{fontSize:10,color:"#8a8174",textTransform:"uppercase",letterSpacing:".15em",marginBottom:4,fontWeight:500}}>Einnahmen</div>
                        <div style={{fontSize:18,fontWeight:600,color:"#5a6e4a"}}>{chf(einnahmen)}</div>
                        <div style={{fontSize:10,color:"#8a8174",marginTop:2}}>aktuell / Mt.</div>
                      </div>
                      <div style={{background:"#fff",border:"1px solid #e8e3d8",borderRadius:6,padding:"12px 14px"}}>
                        <div style={{fontSize:10,color:"#8a8174",textTransform:"uppercase",letterSpacing:".15em",marginBottom:4,fontWeight:500}}>Kosten</div>
                        <div style={{fontSize:18,fontWeight:600,color:"#9b4a3e"}}>{chf(kosten)}</div>
                        <div style={{fontSize:10,color:"#8a8174",marginTop:2}}>Miete an Vermieter</div>
                      </div>
                      <div style={{background:marge>=0?"#e8eadb":"#f0dcd5",border:`1px solid ${marge>=0?"#c5cda8":"#e0bcb0"}`,borderRadius:6,padding:"12px 14px"}}>
                        <div style={{fontSize:10,color:marge>=0?"#3d4f2f":"#9b4a3e",textTransform:"uppercase",letterSpacing:".15em",marginBottom:4,fontWeight:500}}>Marge</div>
                        <div style={{fontSize:18,fontWeight:700,color:marge>=0?"#3d4f2f":"#9b4a3e"}}>{marge>=0?"+":""}{chf(marge)}</div>
                        <div style={{fontSize:10,color:marge>=0?"#3d4f2f":"#9b4a3e",marginTop:2,opacity:.8}}>{margePct}% · max. {chf(maxMarge)}</div>
                      </div>
                    </div>
                    
                    <div style={{fontSize:10.5,color:"#8a8174",marginTop:10,fontStyle:"italic",lineHeight:1.5}}>{apt.vermietungsart==="wohnung"?"Einnahmen aus der Wohnung (Miete inkl. Nebenkosten + Strompauschale pro Person).":"Einnahmen aus belegten Zimmern (Miete + CHF 25 Strompauschale)."} Bei Vollvermietung max. {chf(maxEinnahmen)}/Mt.</div>
                  </div>
                )}
                
                {!isWG && istAdmin && (
                  <div style={{marginTop:18,background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"16px 18px"}}>
                    <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:12,fontWeight:500}}>Finanz-Übersicht (Airbnb)</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr",gap:10}}>
                      <div style={{background:"#fff",border:"1px solid #e8e3d8",borderRadius:6,padding:"12px 14px"}}>
                        <div style={{fontSize:10,color:"#8a8174",textTransform:"uppercase",letterSpacing:".15em",marginBottom:4,fontWeight:500}}>Kosten (Miete an Vermieter)</div>
                        <div style={{fontSize:18,fontWeight:600,color:"#9b4a3e"}}>{chf(kosten)}/Mt.</div>
                      </div>
                    </div>
                    <div style={{fontSize:10.5,color:"#8a8174",marginTop:10,fontStyle:"italic",lineHeight:1.5}}>Airbnb-Einnahmen werden monatlich variieren. Tracking-Feature kommt später.</div>
                  </div>
                )}
                
                <DocumentChecklist entityType="apartment" entityId={apt.id} documents={documents} onJumpToDocs={()=>setTab("docs")}/>
              </div>);
            })()}
            {tab==="zimmer"&&(<div>{apt.type==="WG"&&apt.vermietungsart==="wohnung"&&<div style={{fontSize:11.5,color:"#8a8174",marginBottom:12,fontStyle:"italic"}}>Wohnung: genau 1 Zimmer, an das der Mieter gekoppelt ist. Die Miete dieses Zimmers ist die Bruttomiete der Wohnung (inkl. CHF 100 Nebenkosten), dazu kommt Strom CHF 25 pro Person.</div>}{apt.type==="WG"&&apt.vermietungsart!=="wohnung"&&istAdmin&&<div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><button className="btn btn-p btn-sm" onClick={()=>openAddRooms(apt.id)}>+ Zimmer hinzufügen</button></div>}{aptRooms.length===0?<div className="empty">Noch keine Zimmer erfasst.{apt.type==="WG"&&istAdmin?" Füge oben ein Zimmer hinzu.":""}</div>:<table><thead><tr><th>Zimmer</th><th>Miete</th><th>Status</th><th>Mieter</th><th></th></tr></thead><tbody>{aptRooms.map(r=>{const t=r.tenantId?tenants.find(x=>x.id===r.tenantId):null;return(<tr key={r.id}><td style={{fontWeight:600}}><button onClick={()=>navigateTo&&navigateTo("zimmer",r.id)} style={{background:"none",border:"none",color:"#1a1814",fontWeight:600,cursor:"pointer",padding:0,textDecoration:"underline",fontFamily:"inherit",fontSize:"inherit"}}>{objektLabel(r.id)}</button></td><td data-label="Miete" style={{color:"#5a6e4a"}}>{chf(r.miete)}</td><td data-label="Status">{r.occupied?<Bdg label="● belegt" color="g"/>:<Bdg label="○ frei" color="y"/>}</td><td data-label="Mieter">{t?<button onClick={()=>navigateTo&&navigateTo("mieter",t.id)} style={{background:"none",border:"none",color:"#1a1814",cursor:"pointer",padding:0,textDecoration:"underline",fontFamily:"inherit",fontSize:"inherit"}}>{t.vorname} {t.nachname}</button>:"-"}</td><td style={{textAlign:"right",whiteSpace:"nowrap"}}><button className="btn btn-g btn-sm" onClick={()=>navigateTo&&navigateTo("zimmer",r.id)}>→ Zimmer</button></td></tr>);})}</tbody></table>}</div>)}
            {tab==="medien"&&<MediaManager apt={apt} editApt={updateApt} rooms={rooms}/>}
            {tab==="schluessel"&&<SchluesselManager apt={apt} rooms={rooms} tenants={tenants} updateApt={updateApt}/>}
            {tab==="docs"&&<DocumentsManager entityType="apartment" entityId={apt.id} documents={documents} uploadDocument={uploadDocument} getDocumentUrl={getDocumentUrl} deleteDocument={deleteDocument}/>}
          </div>
        ):<div className="card" style={{margin:0,display:"flex",alignItems:"center",justifyContent:"center",minHeight:180}}><span style={{color:"#8a8478"}}>← Wohnung wählen</span></div>}
      </div>

      {addRoomsFor&&(()=>{
        const ex=rooms.filter(r=>r.aptId===addRoomsFor).map(r=>{const m=String(r.id).match(/-(\d+)$/);return m?+m[1]:0;});
        const startN=ex.length?Math.max(...ex):0;
        return <div className="ov" onClick={e=>e.target===e.currentTarget&&setAddRoomsFor(null)}><div className="modal" style={{width:600}}>
          <div className="mt">+ Zimmer hinzufügen · {addRoomsFor}</div>
          <div className="fg"><label className="fl">Anzahl Zimmer *</label><input className="fi" type="number" min="1" max="20" value={addRoomList.length||""} onChange={e=>syncAddUnits(e.target.value)} placeholder="z.B. 3"/><div style={{fontSize:10.5,color:"#8a8174",marginTop:5,fontStyle:"italic"}}>Neue IDs: {addRoomsFor}-{startN+1}, {addRoomsFor}-{startN+2} …</div></div>
          {addRoomList.length>0&&<div style={{marginTop:16,padding:"16px 18px",background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8}}>
            <div style={{display:"grid",gridTemplateColumns:"64px 1fr 120px 70px",gap:8,marginBottom:6,fontSize:10,color:"#8a8174",fontWeight:600,letterSpacing:".05em",textTransform:"uppercase"}}><div>Zimmer</div><div>Grösse</div><div>Miete CHF/Mt.</div><div style={{textAlign:"center"}}>Balkon</div></div>
            {addRoomList.map((r,i)=>(<div key={i} style={{display:"grid",gridTemplateColumns:"64px 1fr 120px 70px",gap:8,marginBottom:6,alignItems:"center"}}>
              <div style={{fontSize:11.5,fontWeight:600,color:"#1a1814"}}>{addRoomsFor}-{startN+i+1}</div>
              <input className="fi" style={{margin:0,padding:"7px 10px"}} value={r.groesse} onChange={e=>updAddRoom(i,"groesse",e.target.value)} placeholder="z.B. 14"/>
              <input className="fi" style={{margin:0,padding:"7px 10px"}} type="number" value={r.miete} onChange={e=>updAddRoom(i,"miete",e.target.value)} placeholder="1490"/>
              <label style={{display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}><input type="checkbox" checked={r.balkon} onChange={e=>updAddRoom(i,"balkon",e.target.checked)}/></label>
            </div>))}
          </div>}
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:18}}><button className="btn btn-g btn-sm" onClick={()=>setAddRoomsFor(null)}>Abbrechen</button><button className="btn btn-p btn-sm" onClick={submitAddRooms}>{addRoomList.length||0} Zimmer hinzufügen</button></div>
        </div></div>;
      })()}
      {adding&&<div className="ov" onClick={e=>e.target===e.currentTarget&&setAdding(false)}><div className="modal" style={{width:620}}>
        <div className="mt">+ Neue Wohnung erfassen</div>

        <div style={{background:"#faf8f3",border:"1px solid #e8e3d8",borderRadius:8,padding:"12px 14px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:14}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:600,color:"#1a1814",marginBottom:2}}>Als Pipeline-Wohnung anlegen</div>
            <div style={{fontSize:11.5,color:"#6a604f",lineHeight:1.45}}>Verhandlung läuft noch. Bewerber sehen sie, Finanzzahlen sind nicht betroffen.</div>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",flexShrink:0}}>
            <input type="checkbox" checked={!!newForm.pipeline} onChange={e=>setNewForm(p=>({...p,pipeline:e.target.checked}))} style={{width:18,height:18,cursor:"pointer"}}/>
            <span style={{fontSize:12,fontWeight:500,color:newForm.pipeline?"#7a6a4a":"#8a8174"}}>{newForm.pipeline?"Aktiv":"Aus"}</span>
          </label>
        </div>

        <div style={{background:"#faf8f3",border:"1px solid #e8e3d8",borderRadius:8,padding:"12px 14px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:14}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:600,color:"#1a1814",marginBottom:2}}>Ausschreiben</div>
            <div style={{fontSize:11.5,color:"#6a604f",lineHeight:1.45}}>Auch aktiv schaltbar, wenn die Wohnung/das Zimmer noch vermietet ist (Vorvermietung bei laufender Kündigung).</div>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",flexShrink:0}}>
            <input type="checkbox" checked={!!newForm.ausschreiben} onChange={e=>setNewForm(p=>({...p,ausschreiben:e.target.checked}))} style={{width:18,height:18,cursor:"pointer"}}/>
            <span style={{fontSize:12,fontWeight:500,color:newForm.ausschreiben?"#7a6a4a":"#8a8174"}}>{newForm.ausschreiben?"Aktiv":"Aus"}</span>
          </label>
        </div>

        <div style={{background:"#faf8f3",border:"1px solid #e8e3d8",borderRadius:8,padding:"12px 14px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:14}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:600,color:"#1a1814",marginBottom:2}}>Nicht ausschreiben</div>
            <div style={{fontSize:11.5,color:"#6a604f",lineHeight:1.45}}>Wohnung komplett aus dem Bewerbungsformular ausblenden, auch freie Zimmer. Z.B. wenn der Start noch zu weit weg ist.</div>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",flexShrink:0}}>
            <input type="checkbox" checked={!!newForm.nichtAusschreiben} onChange={e=>setNewForm(p=>({...p,nichtAusschreiben:e.target.checked}))} style={{width:18,height:18,cursor:"pointer"}}/>
            <span style={{fontSize:12,fontWeight:500,color:newForm.nichtAusschreiben?"#9b4a3e":"#8a8174"}}>{newForm.nichtAusschreiben?"Ausgeblendet":"Aus"}</span>
          </label>
        </div>

        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Grunddaten</div>
        <div className="frow">
          <div className="fg"><label className="fl">ID *</label><input className="fi" value={newForm.id||""} onChange={NF("id")} placeholder="z.B. A9"/></div>
          <div className="fg"><label className="fl">Typ *</label><select className="fi" value={(newForm.type||"WG")==="WG"&&newForm.vermietungsart==="wohnung"?"Wohnung":(newForm.type||"WG")} onChange={e=>{const v=e.target.value; if(v==="Wohnung"){ setNewForm(p=>({...p,type:"WG",vermietungsart:"wohnung",units:1})); setRoomList(prev=>[prev[0]||{miete:"",groesse:"",balkon:false}]); } else { setNewForm(p=>({...p,type:v,vermietungsart:"zimmer"})); }}}><option value="WG">WG (einzelne Zimmer, möbliert)</option><option value="Wohnung">Wohnung (unmöbliert, Zwischennutzung)</option><option value="Airbnb">Airbnb</option></select></div>
        </div>
        <div className="fg"><label className="fl">Adresse *</label><input className="fi" list="ib-adressen" value={newForm.adresse||""} onChange={NF("adresse")} placeholder="Strasse 12"/><datalist id="ib-adressen">{adressVorschlaege.map(a=><option key={a} value={a}/>)}</datalist></div>
        <div className="frow">
          <div className="fg"><label className="fl">PLZ</label><input className="fi" value={newForm.plz||""} onChange={NF("plz")}/></div>
          <div className="fg"><label className="fl">Ort</label><input className="fi" value={newForm.ort||""} onChange={NF("ort")}/></div>
        </div>
        <div className="frow">
          <div className="fg"><label className="fl">Stockwerk</label><select className="fi" value={newForm.stockwerk||""} onChange={NF("stockwerk")}><option value="">- wählen -</option>{STOCKWERK_OPTIONS.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
          <div className="fg"><label className="fl">Anzahl Zimmer</label><input className="fi" value={newForm.zimmer||""} onChange={NF("zimmer")} placeholder="z.B. 3.5"/></div>
        </div>
        <div className="fg"><label className="fl">Merkmale fürs Inserat</label><MerkmalePicker wohnung={(newForm.type||"WG")==="WG"&&newForm.vermietungsart==="wohnung"} value={newForm.merkmale} onChange={v=>setNewForm(p=>({...p,merkmale:v}))}/></div>

        {newForm.type==="WG"&&(<>
          {newForm.vermietungsart==="wohnung"&&(<>
            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:8,marginBottom:10,fontWeight:500}}>Wohnung</div>
            <div className="frow">
              <div className="fg"><label className="fl">Wohnfläche (m²)</label><input className="fi" type="number" value={newForm.flaeche||""} onChange={NF("flaeche")} placeholder="z.B. 68"/></div>
              <div className="fg"><label className="fl">Bruttomiete Wohnung inkl. NK (CHF/Mt.)</label><input className="fi" type="number" value={(roomList[0]&&roomList[0].miete)||""} onChange={e=>setRoomList(prev=>[{...(prev[0]||{groesse:"",balkon:false}),miete:e.target.value}])} placeholder="z.B. 1750"/></div>
            </div>
            <div className="frow">
              <div className="fg"><label className="fl">Nebenkosten (CHF/Mt.) · werden von der Bruttomiete abgezogen</label><input className="fi" type="number" min="0" value={newForm.nebenkosten_wohnung??""} onChange={NF("nebenkosten_wohnung")} placeholder={`leer = frühere NK (CHF ${nkWohnung({frueherer_nk:newForm.frueherer_nk})})`}/></div>
              <div className="fg"><label className="fl">Strom (CHF/Mt.)</label><div className="fi" style={{background:"#f3efe6",color:"#5a5448"}}>CHF 25 pro Person (fix)</div></div>
            </div>
          </>)}
        </>)}
        {newForm.type==="WG"&&newForm.vermietungsart!=="wohnung"&&(
          <div className="fg">
            <label className="fl">Anzahl WG-Units (vermietbare Zimmer) *</label>
            <input className="fi" type="number" min="1" max="20" value={newForm.units||""} onChange={NF("units")} placeholder="z.B. 3"/>
            <div style={{fontSize:10.5,color:"#8a8174",marginTop:5,fontStyle:"italic"}}>Es werden Zimmer mit IDs {newForm.id||"A9"}-1, {newForm.id||"A9"}-2 … angelegt</div>
          </div>
        )}

        {newForm.type==="WG"&&newForm.vermietungsart!=="wohnung"&&roomList.length>0&&(
          <div style={{marginTop:18,padding:"16px 18px",background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8}}>
            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:12,fontWeight:500}}>Zimmer-Details</div>
            <div style={{display:"grid",gridTemplateColumns:"60px 1fr 110px 80px",gap:8,marginBottom:6,fontSize:10,color:"#8a8174",fontWeight:600,letterSpacing:".05em",textTransform:"uppercase"}}>
              <div>Zimmer</div>
              <div>Größe (z.B. 14 m²)</div>
              <div>Miete CHF/Mt.</div>
              <div style={{textAlign:"center"}}>Balkon</div>
            </div>
            {roomList.map((r,i)=>(
              <div key={i} style={{display:"grid",gridTemplateColumns:"60px 1fr 110px 80px",gap:8,marginBottom:6,alignItems:"center"}}>
                <div style={{fontSize:11.5,fontWeight:600,color:"#1a1814"}}>{newForm.id||"A9"}-{i+1}</div>
                <input className="fi" style={{margin:0,padding:"7px 10px"}} value={r.groesse} onChange={e=>updateRoom(i,"groesse",e.target.value)} placeholder="z.B. 14 (m² wird automatisch ergänzt)"/>
                <input className="fi" style={{margin:0,padding:"7px 10px"}} type="number" value={r.miete} onChange={e=>updateRoom(i,"miete",e.target.value)} placeholder="1490"/>
                <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5,cursor:"pointer",fontSize:11.5}}>
                  <input type="checkbox" checked={r.balkon} onChange={e=>updateRoom(i,"balkon",e.target.checked)}/>
                  <span>{r.balkon?"🌿":""}</span>
                </label>
              </div>
            ))}
          </div>
        )}

        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:18,marginBottom:10,fontWeight:500}}>Mietverhältnis</div>
        <div className="frow">
          <div className="fg"><label className="fl">Mietbeginn</label><input className="fi" value={newForm.mietbeginn||""} onChange={NF("mietbeginn")} placeholder="DD.MM.YYYY"/></div>
          <div className="fg"><label className="fl">Mietende</label><input className="fi" value={newForm.mietende||""} onChange={NF("mietende")} placeholder="DD.MM.YYYY oder leer"/></div>
        </div>
        <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#5a5448",margin:"2px 0 12px",cursor:"pointer"}}><input type="checkbox" checked={!!newForm.immer_befristet} onChange={e=>setNewForm(p=>({...p,immer_befristet:e.target.checked}))} style={{width:16,height:16}}/>Immer befristet (alle Verträge bis Mietende befristet, auch ab 12 Monaten)</label>
        <div className="frow">
          <div className="fg"><label className="fl">Früherer Mietzins netto (CHF/Mt.)</label><input className="fi" type="number" value={newForm.frueherer_mietzins||""} onChange={NF("frueherer_mietzins")} placeholder="Vormieter, z.B. 1450"/></div>
          <div className="fg"><label className="fl">Frühere Nebenkosten (CHF/Mt.)</label><input className="fi" type="number" value={newForm.frueherer_nk||""} onChange={NF("frueherer_nk")} placeholder="z.B. 180"/></div>
        </div>
        <div className="frow">
          <div className="fg"><label className="fl">Miete (an Eigentümer) / Mt.</label><input className="fi" type="number" value={newForm.miete||""} onChange={e=>{const v=e.target.value; setNewForm(f=>{const old3x=f.miete?String(3*(+f.miete||0)):""; const auto=(!f.kaution||String(f.kaution)===old3x); return {...f,miete:v,kaution:auto?(v?String(3*(+v||0)):""):f.kaution};});}}/></div>
          <div className="fg"><label className="fl">Kaution (Vorschlag 3× Miete)</label><input className="fi" type="number" value={newForm.kaution||""} onChange={NF("kaution")}/></div>
        </div>
        <div className="frow">
          
          <div className="fg"><label className="fl">Referenzzinssatz (%)</label><div style={{position:"relative"}}><input className="fi" type="number" step="0.05" value={newForm.refzins||""} onChange={NF("refzins")} placeholder="z.B. 1.50" style={{paddingRight:32}}/><span style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",color:"#8a8174",fontSize:13,pointerEvents:"none"}}>%</span></div></div>
        </div>

        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:18,marginBottom:10,fontWeight:500}}>Vermieter / Verwaltung</div>
        <div className="frow">
          <div className="fg"><label className="fl">Verwaltung</label><select className="fi" value={newForm.verwaltung||""} onChange={NF("verwaltung")}><option value="">-</option>{newForm.verwaltung&&!(partners||[]).some(p=>p.name===newForm.verwaltung)&&<option value={newForm.verwaltung}>{newForm.verwaltung} (nicht erfasst)</option>}{(partners||[]).filter(p=>!p.typ||p.typ==="Verwaltung"||p.typ==="Beides").map(p=>(<option key={p.id} value={p.name}>{p.name}</option>))}</select></div>
          <div className="fg"><label className="fl">Eigentümer</label><select className="fi" value={newForm.eigentuemer||""} onChange={NF("eigentuemer")}><option value="">-</option>{newForm.eigentuemer&&!(partners||[]).some(p=>p.name===newForm.eigentuemer)&&<option value={newForm.eigentuemer}>{newForm.eigentuemer} (nicht erfasst)</option>}{(partners||[]).filter(p=>!p.typ||p.typ==="Eigentümer"||p.typ==="Beides").map(p=>(<option key={p.id} value={p.name}>{p.name}</option>))}</select></div>
        </div>
        <AnsprechpersonFeld adresse={newForm.adresse} verwaltung={newForm.verwaltung} value={anspNeu} onChange={setAnspNeu} onLiegenschaft={verwaltungVorschlag(setNewForm, newForm.verwaltung)} />
        <div className="frow">
          <div className="fg"><label className="fl">Referenz-Nr.</label><input className="fi" value={newForm.refnr||""} onChange={NF("refnr")}/></div>
        </div>


        <div className="ma">
          <button className="btn btn-g" onClick={()=>{setAdding(false);setRoomList([]);}}>Abbrechen</button>
          <button className="btn btn-p" onClick={saveNew}>✓ Wohnung anlegen</button>
        </div>
      </div></div>}

      {editing&&<div className="ov" onClick={e=>e.target===e.currentTarget&&setEditing(false)}><div className="modal" style={{width:620}}>
        <div className="mt">Wohnung bearbeiten - {form.id}</div>

        <div style={{background:"#faf8f3",border:"1px solid #e8e3d8",borderRadius:8,padding:"12px 14px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:14}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:600,color:"#1a1814",marginBottom:2}}>Pipeline-Wohnung</div>
            <div style={{fontSize:11.5,color:"#6a604f",lineHeight:1.45}}>Wohnung in Verhandlung. Bewerber sehen sie im Formular, sie fliesst aber NICHT in Dashboard- und Finanz-Berechnungen ein.</div>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",flexShrink:0}}>
            <input type="checkbox" checked={!!form.pipeline} onChange={e=>setForm(p=>({...p,pipeline:e.target.checked}))} style={{width:18,height:18,cursor:"pointer"}}/>
            <span style={{fontSize:12,fontWeight:500,color:form.pipeline?"#7a6a4a":"#8a8174"}}>{form.pipeline?"Aktiv":"Aus"}</span>
          </label>
        </div>

        <div style={{background:"#faf8f3",border:"1px solid #e8e3d8",borderRadius:8,padding:"12px 14px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:14}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:600,color:"#1a1814",marginBottom:2}}>Ausschreiben</div>
            <div style={{fontSize:11.5,color:"#6a604f",lineHeight:1.45}}>Auch aktiv schaltbar, wenn die Wohnung/das Zimmer noch vermietet ist (Vorvermietung bei laufender Kündigung).</div>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",flexShrink:0}}>
            <input type="checkbox" checked={!!form.ausschreiben} onChange={e=>setForm(p=>({...p,ausschreiben:e.target.checked}))} style={{width:18,height:18,cursor:"pointer"}}/>
            <span style={{fontSize:12,fontWeight:500,color:form.ausschreiben?"#7a6a4a":"#8a8174"}}>{form.ausschreiben?"Aktiv":"Aus"}</span>
          </label>
        </div>

        <div style={{background:"#faf8f3",border:"1px solid #e8e3d8",borderRadius:8,padding:"12px 14px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:14}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:600,color:"#1a1814",marginBottom:2}}>Nicht ausschreiben</div>
            <div style={{fontSize:11.5,color:"#6a604f",lineHeight:1.45}}>Wohnung komplett aus dem Bewerbungsformular ausblenden, auch freie Zimmer. Z.B. wenn der Start noch zu weit weg ist.</div>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",flexShrink:0}}>
            <input type="checkbox" checked={!!form.nichtAusschreiben} onChange={e=>setForm(p=>({...p,nichtAusschreiben:e.target.checked}))} style={{width:18,height:18,cursor:"pointer"}}/>
            <span style={{fontSize:12,fontWeight:500,color:form.nichtAusschreiben?"#9b4a3e":"#8a8174"}}>{form.nichtAusschreiben?"Ausgeblendet":"Aus"}</span>
          </label>
        </div>

        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Grunddaten</div>
        <div className="fg"><label className="fl">Adresse</label><input className="fi" value={form.adresse||""} onChange={F("adresse")}/></div>
        <div className="fg"><label className="fl">Merkmale fürs Inserat</label><MerkmalePicker wohnung={(form.type||"WG")==="WG"&&form.vermietungsart==="wohnung"} value={form.merkmale} onChange={v=>setForm(p=>({...p,merkmale:v}))}/></div>
        <div className="frow">
          <div className="fg"><label className="fl">PLZ</label><input className="fi" value={form.plz||""} onChange={F("plz")}/></div>
          <div className="fg"><label className="fl">Ort</label><input className="fi" value={form.ort||""} onChange={F("ort")}/></div>
        </div>
        <div className="frow">
          <div className="fg"><label className="fl">Stockwerk</label><select className="fi" value={form.stockwerk||""} onChange={F("stockwerk")}><option value="">- wählen -</option>{STOCKWERK_OPTIONS.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
          <div className="fg"><label className="fl">Anzahl Zimmer</label><input className="fi" value={form.zimmer||""} onChange={F("zimmer")}/></div>
        </div>

        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:18,marginBottom:10,fontWeight:500}}>Vermietung</div>
        <div className="fg"><label className="fl">Typ</label><select className="fi" value={(form.type||"WG")==="WG"&&form.vermietungsart==="wohnung"?"Wohnung":(form.type||"WG")} onChange={e=>{const v=e.target.value; setForm(p=>v==="Wohnung"?{...p,type:"WG",vermietungsart:"wohnung"}:{...p,type:v,vermietungsart:"zimmer"});}}><option value="WG">WG (einzelne Zimmer, möbliert)</option><option value="Wohnung">Wohnung (unmöbliert, Zwischennutzung)</option><option value="Airbnb">Airbnb</option></select></div>
        {(form.type||"WG")==="WG"&&(<>
        {form.vermietungsart==="wohnung"&&(<>
          <div className="frow">
            <div className="fg"><label className="fl">Wohnfläche (m²)</label><input className="fi" type="number" value={form.flaeche??""} onChange={F("flaeche")} placeholder="z.B. 68"/></div>
          </div>
          <div style={{fontSize:11,color:"#8a8174",marginTop:-4,marginBottom:6,fontStyle:"italic"}}>Eine Wohnung hat genau 1 Zimmer, an das der Mieter gekoppelt ist. Beim Speichern wird es bei Bedarf angelegt, überzählige freie Zimmer werden nach Rückfrage entfernt. Nebenkosten: gemäss bisherigem Mietvertrag (früherer Mietzins), pro Wohnung anpassbar. Strom: CHF 25 pauschal pro Person und Monat.</div>
        </>)}
        </>)}

        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:18,marginBottom:10,fontWeight:500}}>Mietverhältnis</div>
        <div className="frow">
          <div className="fg"><label className="fl">Mietbeginn</label><input className="fi" value={form.mietbeginn||""} onChange={F("mietbeginn")}/></div>
          <div className="fg"><label className="fl">Mietende</label><input className="fi" value={form.mietende||""} onChange={F("mietende")}/></div>
        </div>
        <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#5a5448",margin:"2px 0 12px",cursor:"pointer"}}><input type="checkbox" checked={!!form.immer_befristet} onChange={e=>setForm(p=>({...p,immer_befristet:e.target.checked}))} style={{width:16,height:16}}/>Immer befristet (alle Verträge bis Mietende befristet, auch ab 12 Monaten)</label>
        {(form.type||"WG")==="WG"&&form.vermietungsart==="wohnung" ? (()=>{
          const n=v=>`CHF ${Number(v||0).toLocaleString("de-CH",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
          const bruttoStd=(()=>{const r=(rooms||[]).filter(x=>x.aptId===form.id).sort((x,y)=>String(x.id).localeCompare(String(y.id),undefined,{numeric:true}));const u=r.find(x=>x.occupied||x.tenantId)||r[0];return u?(u.miete??""):"";})();
          const uB=form.nettomiete_wohnung ?? bruttoStd;
          const uK=nkWohnung({nebenkosten_wohnung:form.nebenkosten_wohnung,frueherer_nk:form.frueherer_nk});
          const fB=(+form.frueherer_mietzins||0)+(+form.frueherer_nk||0);
          const karte={background:"#fff",border:"1px solid #e8e3d8",borderRadius:8,padding:"12px 14px",display:"flex",flexDirection:"column",gap:8};
          const kt={fontSize:10,color:"#8a8174",textTransform:"uppercase",letterSpacing:".15em",fontWeight:500};
          const zeile=(l,inp)=>(<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,fontSize:12.5,color:"#5a5448"}}><span>{l}</span>{inp}</div>);
          const ein=(val,on,ph)=>(<input className="fi" type="number" value={val??""} onChange={on} placeholder={ph||""} style={{width:130,textAlign:"right",padding:"6px 8px",margin:0}}/>);
          const summe=(l,v,farbe)=>(<div style={{display:"flex",justifyContent:"space-between",fontSize:13.5,fontWeight:600,color:farbe||"#1a1814",borderTop:"1px solid #f0eadd",paddingTop:6}}><span>{l}</span><span>{v}</span></div>);
          const hinweis=t=>(<div style={{fontSize:10.5,color:"#8a8174"}}>{t}</div>);
          return (<div style={{marginBottom:14}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr",gap:8}}>
              <div style={karte}>
                <div style={kt}>Früherer Mietzins</div>
                {zeile("Nettomiete",ein(form.frueherer_mietzins,F("frueherer_mietzins"),"z.B. 1450"))}
                {zeile("Nebenkosten",ein(form.frueherer_nk,F("frueherer_nk"),"z.B. 110"))}
                {summe("Brutto",fB?n(fB):"-")}
                {hinweis("Geht ins Anfangsmietzinsformular")}
              </div>
              <div style={karte}>
                <div style={kt}>Vergleichsmietzins</div>
                {zeile("Brutto",ein(form.vergleichsmietzins,F("vergleichsmietzins"),"höchster im Stock"))}
                {hinweis("Nur intern, nicht im Vertrag")}
              </div>
              <div style={karte}>
                <div style={kt}>Unser Mietzins</div>
                {zeile("Brutto",ein(uB,F("nettomiete_wohnung"),"z.B. 1750"))}
                {zeile("Nebenkosten",ein(form.nebenkosten_wohnung,F("nebenkosten_wohnung"),String(uK)))}
                {summe("Nettomiete",uB!==""&&uB!=null?n(+uB-uK):"-","#5a6e4a")}
                {hinweis("Zzgl. Strom CHF 25 pro Person")}
              </div>
            </div>
          </div>);
        })() : (
        <div className="frow">
          <div className="fg"><label className="fl">Früherer Mietzins netto (CHF/Mt.)</label><input className="fi" type="number" value={form.frueherer_mietzins??""} onChange={F("frueherer_mietzins")} placeholder="Vormieter, z.B. 1450"/></div>
          <div className="fg"><label className="fl">Frühere Nebenkosten (CHF/Mt.)</label><input className="fi" type="number" value={form.frueherer_nk??""} onChange={F("frueherer_nk")} placeholder="z.B. 180"/></div>
        </div>)}
        <div className="frow">
          <div className="fg"><label className="fl">Miete (an Eigentümer)</label><input className="fi" type="number" value={form.miete||""} onChange={F("miete")}/></div>
          <div className="fg"><label className="fl">Kaution</label><input className="fi" type="number" value={form.kaution||""} onChange={F("kaution")}/></div>
        </div>
        <div className="frow">
          <div className="fg"><label className="fl">Kautionstyp</label><select className="fi" value={form.kautionType||form.kaution_type||""} onChange={F("kautionType")}><option value="">-</option><option value="Evorest">Evorest</option><option value="Firstcaution">Firstcaution</option><option value="GoCaution">GoCaution</option><option value="Bankkaution">Bankkaution</option></select></div>
          <div className="fg"><label className="fl">Referenzzinssatz (%)</label><div style={{position:"relative"}}><input className="fi" type="number" step="0.05" value={form.refzins||""} onChange={F("refzins")} placeholder="z.B. 1.50" style={{paddingRight:32}}/><span style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",color:"#8a8174",fontSize:13,pointerEvents:"none"}}>%</span></div></div>
        </div>

        <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginTop:18,marginBottom:10,fontWeight:500}}>Vermieter / Verwaltung</div>
        <div className="frow">
          <div className="fg"><label className="fl">Verwaltung</label><select className="fi" value={form.verwaltung||""} onChange={F("verwaltung")}><option value="">-</option>{form.verwaltung&&!(partners||[]).some(p=>p.name===form.verwaltung)&&<option value={form.verwaltung}>{form.verwaltung} (nicht erfasst)</option>}{(partners||[]).filter(p=>!p.typ||p.typ==="Verwaltung"||p.typ==="Beides").map(p=>(<option key={p.id} value={p.name}>{p.name}</option>))}</select></div>
          <div className="fg"><label className="fl">Eigentümer</label><select className="fi" value={form.eigentuemer||""} onChange={F("eigentuemer")}><option value="">-</option>{form.eigentuemer&&!(partners||[]).some(p=>p.name===form.eigentuemer)&&<option value={form.eigentuemer}>{form.eigentuemer} (nicht erfasst)</option>}{(partners||[]).filter(p=>!p.typ||p.typ==="Eigentümer"||p.typ==="Beides").map(p=>(<option key={p.id} value={p.name}>{p.name}</option>))}</select></div>
        </div>
        <AnsprechpersonFeld adresse={form.adresse} verwaltung={form.verwaltung} value={anspEdit} onChange={setAnspEdit} />
        <div className="frow">
          <div className="fg"><label className="fl">Referenz-Nr.</label><input className="fi" value={form.refnr||""} onChange={F("refnr")}/></div>
        </div>


        <div className="ma"><button className="btn btn-g" onClick={()=>setEditing(false)}>Abbrechen</button><button className="btn btn-p" onClick={save}>Speichern</button></div>
      </div></div>}
    </div>
  );
}

