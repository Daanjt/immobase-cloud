// ─── ZIMMER ──────────────────────────────────────────────────────────────────
function Zimmer({rooms,tenants,apts,bewerber,updateRoom,updateBewerber,insertTenant,updateTenant,navigateTo,navTarget,istAdmin=true}){
  const [filter,setFilter]=useState("alle");
  const [art,setArt]=useState("alle");
  const [editing,setEditing]=useState(false);
  const [form,setForm]=useState({});
  const [assigning,setAssigning]=useState(null); // room being assigned
  const [assignMode,setAssignMode]=useState("bewerber"); // "bewerber" | "alteMieter" | "manual" | "remove"
  const [selBewerberId,setSelBewerberId]=useState("");
  const [selOldTenantId,setSelOldTenantId]=useState("");
  const [manualForm,setManualForm]=useState({vorname:"",nachname:"",email:"",phone:""});
  const [highlightId,setHighlightId]=useState(null);
  
  // Auto-scroll & highlight when navigated here
  useEffect(() => {
    if (navTarget && navTarget.type === "zimmer" && navTarget.id) {
      setFilter("alle"); setArt("alle");
      setHighlightId(navTarget.id);
      setTimeout(() => {
        const el = document.getElementById(`zimmer-${navTarget.id}`);
        if (el) el.scrollIntoView({behavior:"smooth", block:"center"});
      }, 150);
      setTimeout(() => setHighlightId(null), 3500);
    }
  }, [navTarget]);
  const shown=filter==="frei"?rooms.filter(r=>!r.occupied):filter==="belegt"?rooms.filter(r=>r.occupied):rooms;
  const free=rooms.filter(r=>!r.occupied);
  const grouped=apts.filter(a=>a.type==="WG" && (art==="alle"||aptKat(a)===art)).sort((a,b)=>(aptKat(a)===aptKat(b)?natSort(a.id, b.id):aptKat(a)==="WG"?-1:1)).map(a=>({apt:a,rs:shown.filter(r=>r.aptId===a.id).sort((x,y)=>natSort(x.id, y.id))})).filter(g=>g.rs.length>0);
  const eligibleBewerber=bewerber?bewerber.filter(b=>b.status==="Neu"):[];

  function F(k){return e=>setForm(p=>({...p,[k]:e.target.value}));}
  function FB(k){return e=>setForm(p=>({...p,[k]:e.target.checked}));}
  function MF(k){return e=>setManualForm(p=>({...p,[k]:e.target.value}));}
  function openEdit(r){setForm({...r});setEditing(true);}
  function openAssign(r){
    setAssigning(r);
    setSelBewerberId("");
    setManualForm({vorname:"",nachname:"",email:"",phone:""});
    setAssignMode(r.occupied?"remove":"bewerber");
  }
  async function saveEdit(){
    await updateRoom(form.id,{
      miete:+form.miete||0,
      groesse:formatGroesse(form.groesse),
      balkon:!!form.balkon,
    });
    setEditing(false);
  }
  async function assignFromBewerber(){
    if (!selBewerberId) { alert("Bitte einen Bewerber auswählen."); return; }
    const b = bewerber.find(x=>x.id===selBewerberId);
    if (!b) return;
    // Sequenzielle ID: T01, T02, ... (nicht random!)
    // Finde höchste existierende T-Nummer und nehme +1 (auch wenn alte IDs gelöscht wurden)
    let n = 1;
    tenants.forEach(t => {
      const m = String(t.id||"").match(/^T(\d+)$/);
      if (m) n = Math.max(n, parseInt(m[1],10) + 1);
    });
    const newId = `T${String(n).padStart(2,"0")}`;
    // Compute kaution data from bewerber selection
    const kautionMonate = b.kautionOpt==="3x"?3:b.kautionOpt==="2x"?2:b.kautionOpt==="1x"?1:0;
    const room = rooms.find(r => r.id === assigning.id);
    const bruttomiete = room?.miete || 0;
    const strom = 25;
    const kautionBetrag = (bruttomiete + strom) * kautionMonate;
    
    // Copy ALL bewerber fields, then override tenant-specific ones
    const newTenant = {
      ...b,  // Spread ALL applicant fields (vorname, nachname, email, phone, geburt, gender, nat, adresse, plz, ort, beruf, anstellung, arbeitgeber, einkommen, rauchen, haustiere, bemerkung, einzug, kautionOpt, kautionType, kautionAufschlag, moebliert, moeblierungPauschale, zimmerWunsch, noDebt, ...)
      // Now override tenant-specific fields:
      id: newId,
      bewerberId: b.id,
      aptId: assigning.aptId,
      roomId: assigning.id,
      // Recompute kaution to be tenant-specific
      kautionMonate: kautionMonate,
      kautionBetrag: kautionBetrag,
      // Tenant-specific default fields
      betreibung: false,
      schluesselNr: "",
      auszug: "",
      // Normalize types (form sends "ja"/"nein" strings, DB wants boolean)
      moebliert: b.moebliert === "ja" || b.moebliert === true,
      noDebt: !!b.noDebt,
    };
    
    // Strip fields that don't belong on a tenant
    delete newTenant.status;          // Bewerber-status
    delete newTenant.eingereichtAm;   // Bewerber-only
    delete newTenant.eingereicht_am;  // DB snake_case version
    delete newTenant.zugeteiltes_zimmer; // Bewerber-only
    delete newTenant.truthful;        // Form only
    delete newTenant.rauchen;         // Removed feature
    delete newTenant.haustiere;       // Removed feature
    delete newTenant.betreibung;      // Removed feature
    delete newTenant.created_at;
    delete newTenant.updated_at;
    
    try {
      if (newTenant.mietzins == null || newTenant.mietzins === "") { const rm = rooms.find(r=>r.id===assigning.id); if (rm && rm.miete != null) newTenant.mietzins = +rm.miete; }
      await insertTenant(newTenant);
      await updateRoom(assigning.id,{occupied:true,tenantId:newId});
      await updateBewerber(b.id,{status:"Zugeteilt"});
      setAssigning(null);
    } catch (err) {
      toast("Zuteilung fehlgeschlagen", "error");
    }
  }
  
  async function assignFromOldTenant(){
    if (!selOldTenantId) { alert("Bitte einen alten Mieter auswählen."); return; }
    const old = tenants.find(t => t.id === selOldTenantId);
    if (!old) return;
    
    const room = rooms.find(r => r.id === assigning.id);
    const bruttomiete = room?.miete || 0;
    const strom = 25;
    const kautionMonate = old.kautionMonate || 3;
    const kautionBetrag = (bruttomiete + strom) * kautionMonate;
    
    try {
      // Reaktiviere alten Mieter + neue Zimmer-Daten + neuer Einzug
      await updateTenant(selOldTenantId, {
        status: "aktiv",
        archivedAt: null,
        aptId: assigning.aptId,
        roomId: assigning.id,
        einzug: new Date().toLocaleDateString("de-CH"),
        auszug: "",
        kautionBetrag: kautionBetrag,
      });
      // Zimmer als belegt markieren
      await updateRoom(assigning.id, {occupied:true, tenantId:selOldTenantId});
      setAssigning(null);
      setSelOldTenantId("");
      alert(`✓ ${old.vorname} ${old.nachname} wurde reaktiviert und Zimmer ${assigning.id} zugewiesen.`);
    } catch (err) {
      toast("Zuteilung fehlgeschlagen", "error");
    }
  }
  async function assignManual(){
    if (!manualForm.vorname || !manualForm.nachname) { alert("Bitte mindestens Vorname und Nachname angeben."); return; }
    // Sequenzielle ID: T01, T02, ... (nicht random!)
    // Finde höchste existierende T-Nummer und nehme +1 (auch wenn alte IDs gelöscht wurden)
    let n = 1;
    tenants.forEach(t => {
      const m = String(t.id||"").match(/^T(\d+)$/);
      if (m) n = Math.max(n, parseInt(m[1],10) + 1);
    });
    const newId = `T${String(n).padStart(2,"0")}`;
    const newTenant = {
      id: newId,
      vorname: manualForm.vorname, nachname: manualForm.nachname,
      email: manualForm.email||"", phone: manualForm.phone||"",
      aptId: assigning.aptId, roomId: assigning.id,
    };
    await insertTenant(newTenant);
    await updateRoom(assigning.id,{occupied:true,tenantId:newId});
    setAssigning(null);
  }
  async function removeOccupant(){
    if (!confirm(`Mieterzuweisung von ${assigning.id} wirklich entfernen?\n\nDer Mieter bleibt im System bestehen, das Zimmer wird als frei markiert.`)) return;
    if (assigning.tenantId) {
      // Mark tenant as no longer in this room
      await updateTenant(assigning.tenantId,{aptId:null,roomId:null});
    }
    await updateRoom(assigning.id,{occupied:false,tenantId:null});
    setAssigning(null);
  }

  return(
    <div>
      <div className="pt">Zimmer</div>
      <div className="ps">{(()=>{const _k=r=>aptKat(apts.find(a=>a.id===r.aptId));const _z=rooms.filter(r=>_k(r)==="WG"),_w=rooms.filter(r=>_k(r)==="Wohnung");return `${_z.length} WG-Zimmer (${_z.filter(r=>!r.occupied).length} frei) · ${_w.length} Wohnungen (${_w.filter(r=>!r.occupied).length} frei)`;})()}</div>
      <div className="row" style={{flexWrap:"wrap",gap:10}}><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{[["alle","Alle"],["frei","Nur freie"],["belegt","Belegt"]].map(([k,l])=>(<button key={k} className={`btn ${filter===k?"btn-p":"btn-g"} btn-sm`} onClick={()=>setFilter(k)}>{l}</button>))}</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{[["alle","Alle Arten"],["WG","WGs"],["Wohnung","Wohnungen"]].map(([k,l])=>(<button key={k} className={`btn ${art===k?"btn-p":"btn-g"} btn-sm`} onClick={()=>setArt(k)}>{l}</button>))}</div></div>
      {grouped.map(({apt,rs})=>(
        <div key={apt.id} className="card">
          <div className="ct" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>{apt.id} - {apt.adresse} <TypeBadge type={aptKat(apt)}/></span>
            <button className="btn btn-g btn-sm" onClick={()=>navigateTo&&navigateTo("wohnungen",apt.id)} style={{fontSize:9}}>→ Wohnung</button>
          </div>
          <table>
            <thead><tr><th>Zimmer</th><th>Größe</th><th>Miete</th><th>Balkon</th><th>Möbliert</th><th>Status</th><th>Mieter</th><th style={{textAlign:"right"}}>Aktionen</th></tr></thead>
            <tbody>
              {rs.map(r=>{
                const t=r.tenantId?tenants.find(x=>x.id===r.tenantId):null;
                const isHighlight = highlightId === r.id;
                return(
                  <tr key={r.id} id={`zimmer-${r.id}`} style={isHighlight?{background:"#f5efe4",boxShadow:"0 0 0 2px #a08864",transition:"all .3s"}:{}}>
                    <td style={{fontWeight:600}}>{objektLabel(r.id)}</td>
                    <td data-label="Größe" style={{color:"#8a8174",fontSize:12}}>{r.groesse||"-"}</td>
                    <td data-label="Miete" style={{color:"#5a6e4a"}}>{r.miete?chf(r.miete):"-"}</td>
                    <td data-label="Balkon">{r.balkon?"🌿":"-"}</td>
                    <td data-label="Möbliert"><span style={{display:"inline-block",fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:11,whiteSpace:"nowrap",lineHeight:1.4,border:`1px solid ${r.moebliert?"#b89a5e":"#ddd6c8"}`,background:r.moebliert?"#f3ead2":"#fff",color:r.moebliert?"#7a5f22":"#b0a894"}}>{r.moebliert?"🛋 Möbliert":"Unmöbliert"}</span></td>
                    <td data-label="Status">{r.occupied?<Bdg label="● belegt" color="g"/>:<Bdg label="○ frei" color="y"/>}</td>
                    <td data-label="Mieter">{t?<button onClick={()=>navigateTo&&navigateTo("mieter",t.id)} style={{background:"none",border:"none",color:"#1a1814",cursor:"pointer",padding:0,textDecoration:"underline",fontFamily:"inherit",fontSize:"inherit"}}>{t.vorname} {t.nachname}</button>:"-"}</td>
                    <td style={{textAlign:"right",whiteSpace:"nowrap"}}>
                      {!r.occupied&&<button className="btn btn-p btn-sm" onClick={()=>openAssign(r)} style={{marginRight:4}}>+ Zuteilen</button>}
                      <button className="btn btn-g btn-sm" onClick={()=>openEdit(r)}>✏ Bearbeiten</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {/* EDIT-MODAL */}
      {editing&&<div className="ov" onClick={e=>e.target===e.currentTarget&&setEditing(false)}><div className="modal">
        <div className="mt">Zimmer bearbeiten - {form.id}</div>
        <div className="frow">
          <div className="fg"><label className="fl">Größe</label><input className="fi" value={form.groesse||""} onChange={F("groesse")} placeholder="z.B. 14 (m² wird automatisch ergänzt)"/></div>
          <div className="fg"><label className="fl">Miete CHF/Mt.</label><input className="fi" type="number" value={form.miete||""} onChange={F("miete")}/></div>
        </div>
        <div className="fg">
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}>
            <input type="checkbox" checked={!!form.balkon} onChange={FB("balkon")}/>
            <span>🌿 Zimmer hat Balkon</span>
          </label>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,marginTop:8}}>
            <input type="checkbox" checked={!!form.moebliert} onChange={FB("moebliert")}/>
            <span>🛋 Zimmer ist möbliert</span>
          </label>
        </div>
        {form.occupied&&form.tenantId&&(
          <div style={{marginTop:18,paddingTop:18,borderTop:"1px solid #e1d8c5"}}>
            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Mieterzuweisung</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,marginBottom:10}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:"#1a1814"}}>{(()=>{const t=tenants.find(x=>x.id===form.tenantId);return t?`${t.vorname} ${t.nachname}`:"-";})()}</div>
                <div style={{fontSize:11,color:"#8a8174",marginTop:2}}>aktueller Mieter</div>
              </div>
              <button className="btn btn-r btn-sm" onClick={()=>{setEditing(false);openAssign(form);}}>✕ Mieter entfernen</button>
            </div>
            <div style={{fontSize:11,color:"#8a8174",fontStyle:"italic",lineHeight:1.5}}>Beim Entfernen wird das Zimmer als frei markiert. Der Mieter bleibt im System.</div>
          </div>
        )}
        <div className="ma"><button className="btn btn-g" onClick={()=>setEditing(false)}>Abbrechen</button><button className="btn btn-p" onClick={saveEdit}>Speichern</button></div>
      </div></div>}

      {/* ASSIGN-MODAL */}
      {assigning&&<div className="ov" onClick={e=>e.target===e.currentTarget&&setAssigning(null)}><div className="modal" style={{width:560}}>
        <div className="mt">{assigning.occupied?"Mieter entfernen":"Bewerber zuteilen"} - {assigning.id}</div>
        <div style={{fontSize:11.5,color:"#8a8174",marginBottom:18}}>{apts.find(a=>a.id===assigning.aptId)?.adresse} · CHF {assigning.miete||"-"} / Mt.</div>

        {!assigning.occupied&&(
          <div style={{display:"flex",gap:6,marginBottom:18,padding:4,background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8}}>
            <button className={`btn ${assignMode==="bewerber"?"btn-p":"btn-g"} btn-sm`} style={{flex:1}} onClick={()=>setAssignMode("bewerber")}>Aus Bewerbern</button>
            <button className={`btn ${assignMode==="alteMieter"?"btn-p":"btn-g"} btn-sm`} style={{flex:1}} onClick={()=>setAssignMode("alteMieter")}>📦 Aus Alten Mietern</button>
            <button className={`btn ${assignMode==="manual"?"btn-p":"btn-g"} btn-sm`} style={{flex:1}} onClick={()=>setAssignMode("manual")}>Manuell anlegen</button>
          </div>
        )}

        {!assigning.occupied&&assignMode==="bewerber"&&(
          <div>
            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Bewerber auswählen</div>
            {eligibleBewerber.length===0?<div className="empty">Keine geeigneten Bewerber vorhanden</div>:(
              <div style={{maxHeight:280,overflowY:"auto"}}>
                {eligibleBewerber.map(b=>{
                  const sel=selBewerberId===b.id;
                  return(
                    <label key={b.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",background:sel?"#f5efe4":"#fefcf7",border:`1px solid ${sel?"#1a1814":"#e1d8c5"}`,borderRadius:8,cursor:"pointer",marginBottom:6}} onClick={()=>setSelBewerberId(b.id)}>
                      <input type="radio" name="bewerber" checked={sel} readOnly/>
                      <Av name={b.vorname} size={32}/>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:600}}>{b.vorname} {b.nachname}</div>
                        <div style={{fontSize:11,color:"#8a8174"}}>{b.email||"-"} · {b.zimmerWunsch?`Wunsch: ${objektLabel(b.zimmerWunsch)}`:"kein Wunsch"}</div>
                      </div>
                      <StatusBdg status={b.status}/>
                    </label>
                  );
                })}
              </div>
            )}
            <div className="ma"><button className="btn btn-g" onClick={()=>setAssigning(null)}>Abbrechen</button><button className="btn btn-p" onClick={assignFromBewerber} disabled={!selBewerberId}>✓ Zuteilen</button></div>
          </div>
        )}

        {!assigning.occupied&&assignMode==="alteMieter"&&(() => {
          const archivierteList = tenants.filter(t => t.status === "archiviert").sort((a,b) => {
            const dA = a.archivedAt || a.archived_at || 0;
            const dB = b.archivedAt || b.archived_at || 0;
            return new Date(dB) - new Date(dA);
          });
          return (
            <div>
              <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>📦 Alten Mieter reaktivieren</div>
              <div style={{fontSize:11.5,color:"#8a8174",marginBottom:14,fontStyle:"italic"}}>Wähle einen ehemaligen Mieter aus, der zurück ins System soll. Seine Daten werden übernommen, die Mieter-ID bleibt erhalten.</div>
              {archivierteList.length===0 ? <div className="empty">Keine archivierten Mieter vorhanden</div> : (
                <div style={{maxHeight:280,overflowY:"auto"}}>
                  {archivierteList.map(t=>{
                    const sel=selOldTenantId===t.id;
                    return(
                      <label key={t.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",background:sel?"#f5efe4":"#fefcf7",border:`1px solid ${sel?"#1a1814":"#e1d8c5"}`,borderRadius:8,cursor:"pointer",marginBottom:6}} onClick={()=>setSelOldTenantId(t.id)}>
                        <input type="radio" name="oldTenant" checked={sel} readOnly/>
                        <Av name={t.vorname} size={32}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600}}>{t.vorname} {t.nachname} <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"#8a8174",fontWeight:500}}>· {t.id}</span></div>
                          <div style={{fontSize:11,color:"#8a8174"}}>{t.email||"-"} · Ausgezogen: {t.auszug||"-"}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="ma"><button className="btn btn-g" onClick={()=>setAssigning(null)}>Abbrechen</button><button className="btn btn-p" onClick={assignFromOldTenant} disabled={!selOldTenantId}>↑ Reaktivieren & Zuteilen</button></div>
            </div>
          );
        })()}

        {!assigning.occupied&&assignMode==="manual"&&(
          <div>
            <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:10,fontWeight:500}}>Mieter manuell anlegen</div>
            <div style={{fontSize:11.5,color:"#8a8174",marginBottom:14,fontStyle:"italic"}}>Für Direkt-Zuweisungen ohne Bewerbung. Vollständige Daten kannst du später im Mieter-Tab ergänzen.</div>
            <div className="frow">
              <div className="fg"><label className="fl">Vorname *</label><input className="fi" value={manualForm.vorname} onChange={MF("vorname")}/></div>
              <div className="fg"><label className="fl">Nachname *</label><input className="fi" value={manualForm.nachname} onChange={MF("nachname")}/></div>
            </div>
            <div className="frow">
              <div className="fg"><label className="fl">E-Mail</label><input className="fi" type="email" value={manualForm.email} onChange={MF("email")}/></div>
              <div className="fg"><label className="fl">Telefon</label><input className="fi" value={manualForm.phone} onChange={MF("phone")}/></div>
            </div>
            <div className="ma"><button className="btn btn-g" onClick={()=>setAssigning(null)}>Abbrechen</button><button className="btn btn-p" onClick={assignManual}>✓ Anlegen & Zuteilen</button></div>
          </div>
        )}

        {assigning.occupied&&(
          <div>
            <div style={{padding:"14px 18px",background:"#f0dcd5",border:"1px solid #e0bcb0",borderRadius:8,marginBottom:18}}>
              <div style={{fontSize:11,color:"#9b4a3e",textTransform:"uppercase",letterSpacing:".2em",fontWeight:600,marginBottom:6}}>Aktueller Mieter</div>
              <div style={{fontSize:14,fontWeight:600,color:"#1a1814"}}>{(()=>{const t=tenants.find(x=>x.id===assigning.tenantId);return t?`${t.vorname} ${t.nachname}`:"-";})()}</div>
            </div>
            <div style={{fontSize:12,color:"#8a8174",lineHeight:1.6,marginBottom:14}}>Wenn du den Mieter entfernst, wird das Zimmer frei. Der Mieter bleibt im System und kann später wieder einem Zimmer zugewiesen werden - oder du löschst ihn manuell im Mieter-Tab.</div>
            <div className="ma"><button className="btn btn-g" onClick={()=>setAssigning(null)}>Abbrechen</button><button className="btn btn-r" onClick={removeOccupant}>✕ Mieter entfernen</button></div>
          </div>
        )}
      </div></div>}
    </div>
  );
}

