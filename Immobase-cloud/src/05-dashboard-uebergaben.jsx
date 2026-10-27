// ─── DASHBOARD ───────────────────────────────────────────────────────────────
// ─── ÜBERGABEN (Einzug + Auszug Tab) ─────────────────────────────────────────
function Uebergaben({apts,rooms,tenants,bewerber,protokolle,navigateTo,updateTenant,updateRoom,handoverProtocols,documents,startHandoverProtocol}){
  const [tab, setTab] = useState("einzug"); // 'einzug' | 'auszug'
  const [kautionTenant,setKautionTenant]=React.useState(null);
  const [dismissed,setDismissed]=React.useState([]);
  const heute = new Date();
  heute.setHours(0,0,0,0);
  
  // ─── EINZUG: Uebernahmeprotokolle nach Status ─────────────────────
  // Kategorien: 
  //   "todo" = kein Protokoll gestartet
  //   "waiting" = Protokoll laeuft (sent/in_progress)
  //   "review" = Protokoll eingereicht (submitted, wartet auf Admin-Akzeptanz)
  //   "done" = accepted / auto_accepted
  const einzuegeMitStatus = tenants
    .filter(t => (t.status||"aktiv") === "aktiv")
    .map(t => {
      const room = rooms.find(r => r.tenantId === t.id) || (t.roomId ? rooms.find(r => r.id === t.roomId) : null);
      if (!room) return null;
      const apt = apts.find(a => a.id === room.aptId);
      const myHandovers = (handoverProtocols || []).filter(h => h.tenantId === t.id);
      // Sortiere absteigend nach start um neuestes zuerst zu haben
      const sorted = [...myHandovers].sort((a,b) => new Date(b.startedAt) - new Date(a.startedAt));
      const latest = sorted[0];
      let kategorie;
      if (!latest) kategorie = "todo";
      else if (["sent","in_progress"].includes(latest.status)) kategorie = "waiting";
      else if (latest.status === "submitted") kategorie = "review";
      else if (["accepted","auto_accepted"].includes(latest.status)) kategorie = "done";
      else kategorie = "todo"; // cancelled -> zurueck auf todo
      // Altbestand: manuell als erledigt markiert oder altes Protokoll als Dokument hinterlegt
      const hatAltesProtokoll = (documents||[]).some(d => d.entity_type==="tenant" && d.entity_id===t.id && (d.category||"").toLowerCase().includes("übergabeprotokoll"));
      const istLaufend = latest && ["sent","in_progress","submitted"].includes(latest.status);
      if (!istLaufend && ((t.uebergabeStatus||"offen")==="erledigt" || hatAltesProtokoll)) kategorie = "done";
      const einzugDate = parseD(t.einzug);
      const daysTilEinzug = einzugDate ? Math.ceil((einzugDate - heute) / (1000*60*60*24)) : null;
      return { tenant: t, room, apt, einzugDate, daysTilEinzug, kategorie, latest };
    })
    .filter(Boolean)
    .sort((a, b) => {
      // Prioritaet: review > waiting > todo > done
      const prio = {review:0, waiting:1, todo:2, done:3};
      if (prio[a.kategorie] !== prio[b.kategorie]) return prio[a.kategorie] - prio[b.kategorie];
      if (a.daysTilEinzug == null && b.daysTilEinzug == null) return 0;
      if (a.daysTilEinzug == null) return 1;
      if (b.daysTilEinzug == null) return -1;
      return a.daysTilEinzug - b.daysTilEinzug;
    });
  
  const offene = einzuegeMitStatus.filter(e => e.kategorie !== "done");
  const erledigt = einzuegeMitStatus.filter(e => e.kategorie === "done");
  const [startFor, setStartFor] = useState(null);
  const [refKeyInfo, setRefKeyInfo] = useState(null);
  useEffect(()=>{
    if(!startFor||!startFor.apt||!startFor.apt.id){ setRefKeyInfo(null); return; }
    (async()=>{
      const {data:a} = await supabase.from("apartments").select("schluessel_anzahl,extra_schluessel").eq("id",startFor.apt.id).single();
      const byTyp={};
      setRefKeyInfo({ erhNormal:a?a.schluessel_anzahl:null, erhExtra:a?a.extra_schluessel:null, byTyp });
    })();
  },[startFor]);
  const [sNr, setSNr] = useState("");
  const [sExtra, setSExtra] = useState("");
  const [normalCount, setNormalCount] = useState(1);
  const [extraText, setExtraText] = useState("");
  const [wgText, setWgText] = useState("");
  const [starting, setStarting] = useState(false);
  const oeffneStart = (eintrag) => {
    const t = eintrag.tenant;
    setSNr(((t.schluesselNr||"").trim() || (t.schluesselAnzahl||"").toString().trim()));
    setSExtra((t.extraSchluessel||"").trim());
    setNormalCount(+(t.schluesselAnzahl)||1);
    if (aptKat(eintrag.apt)==="WG") { setWgText((eintrag.apt&&eintrag.apt.extraSchluessel)||""); setExtraText(""); }
    else { setExtraText((eintrag.apt&&eintrag.apt.extraSchluessel)||""); setWgText(""); }
    setStartFor(eintrag);
  };
  const schluesselText = (t) => {
    const nr = (t.schluesselNr||"").trim() || (t.schluesselAnzahl||"").toString().trim();
    const extra = (t.extraSchluessel||"").trim();
    if (!nr && !extra) return null;
    return [nr && ("Schlüssel " + nr), extra && ("Zusatz: " + extra)].filter(Boolean).join(" · ");
  };
  const offeneSchluesselUebergaben = offene; // legacy alias fuer Tab-Badge
  
  function schluesselCat(daysTilEinzug) {
    if (daysTilEinzug == null) return { color:"#5a5a5a", bg:"#ececec", border:"#c5c5c5", label:"Kein Einzug gesetzt", icon:"❓" };
    if (daysTilEinzug < 0) return { color:"#9b4a3e", bg:"#fdebe5", border:"#e0bcb0", label:`${Math.abs(daysTilEinzug)} T. überfällig`, icon:"⚠️" };
    if (daysTilEinzug === 0) return { color:"#b8843e", bg:"#f9efdb", border:"#e8d2a8", label:"Einzug heute", icon:"🔴" };
    if (daysTilEinzug <= 7) return { color:"#b8843e", bg:"#f9efdb", border:"#e8d2a8", label:`Einzug in ${daysTilEinzug} T.`, icon:"🟠" };
    if (daysTilEinzug <= 30) return { color:"#5a6e4a", bg:"#e8eadb", border:"#c5cda8", label:`Einzug in ${daysTilEinzug} T.`, icon:"🟢" };
    return { color:"#5a6e4a", bg:"#e8eadb", border:"#c5cda8", label:`Einzug ${daysTilEinzug > 60 ? "in 2+ Mt." : "in 1 Mt."}`, icon:"📅" };
  }
  
  // ─── AUSZUG: Anstehende Auszüge ────────────────────────────────
  const reminders = tenants
    .filter(t => t.auszug && t.auszug.trim())
    .filter(t => { const a=(t.status||"aktiv")==="aktiv"; const arch=t.status==="archiviert"; const kDone=!!(t.kautionAbrechnung&&(t.kautionAbrechnung.gesendet_am||t.kautionAbrechnung.erledigt_am)); return !kDone && (a || arch); })
    .map(t => {
      const dt = parseD(t.auszug);
      if (!dt) return null;
      const daysLeft = Math.ceil((dt - heute) / (1000*60*60*24));
      const room = rooms.find(r => r.id === t.roomId);
      const apt = room ? apts.find(a => a.id === room.aptId) : null;
      let aptEndsToo = false;
      if (apt && apt.mietende) {
        const aptEnd = parseD(apt.mietende);
        if (aptEnd) {
          const diff = Math.abs((aptEnd - dt) / (1000*60*60*24));
          aptEndsToo = diff <= 14;
        }
      }
      const kautionOffen = t.status==="archiviert" && !(t.kautionAbrechnung&&(t.kautionAbrechnung.gesendet_am||t.kautionAbrechnung.erledigt_am));
      return { tenant: t, room, apt, dt, daysLeft, aptEndsToo, kautionOffen };
    })
    .filter(x => x && ((x.daysLeft >= -7 && x.daysLeft <= 90) || (x.kautionOffen && x.daysLeft >= -180)))
    .filter(x => !dismissed.includes(x.tenant.id))
    .sort((a,b) => a.daysLeft - b.daysLeft);
  
  function reminderCat(daysLeft, aptEndsToo) {
    if (aptEndsToo) {
      if (daysLeft < 0) return { color:"#5a5a5a", bg:"#ececec", border:"#c5c5c5", label:"Wohnung geräumt", icon:"📦", action:"Übergabe an Eigentümer · Schlüssel zurück" };
      if (daysLeft <= 7) return { color:"#5a5a5a", bg:"#ececec", border:"#c5c5c5", label:"Räumung diese Woche", icon:"📦", action:"Wohnung räumen · Übergabe an Eigentümer/Verwaltung" };
      if (daysLeft <= 30) return { color:"#5a5a5a", bg:"#ececec", border:"#c5c5c5", label:"Räumung in 1 Monat", icon:"📦", action:"Räumungstermin koordinieren · Hauptmieter-Übergabe planen" };
      return { color:"#5a5a5a", bg:"#ececec", border:"#c5c5c5", label:"Wohnung läuft aus", icon:"📦", action:"Wohnung wird abgegeben - kein Nachmieter nötig" };
    }
    if (daysLeft < 0) return { color:"#9b4a3e", bg:"#fdebe5", border:"#e0bcb0", label:"Auszug überfällig", icon:"⚠️", action:"Übergabe + Schlüsselübergabe!" };
    if (daysLeft <= 7) return { color:"#9b4a3e", bg:"#fdebe5", border:"#e0bcb0", label:"Auszug diese Woche", icon:"🔴", action:"Übergabeprotokoll vorbereiten · Schlüssel-Termin" };
    if (daysLeft <= 30) return { color:"#b8843e", bg:"#f9efdb", border:"#e8d2a8", label:"Auszug in 1 Monat", icon:"🟠", action:"Nachmieter zuteilen · Übergabetermin vereinbaren" };
    if (daysLeft <= 60) return { color:"#b8843e", bg:"#f9efdb", border:"#e8d2a8", label:"Auszug in 2 Monaten", icon:"🟡", action:"Inserat schalten · Bewerber suchen" };
    return { color:"#5a6e4a", bg:"#e8eadb", border:"#c5cda8", label:"Auszug in ~3 Monaten", icon:"🟢", action:"Verlängerung anbieten oder Nachmieter suchen" };
  }
  
  async function archiveAndDismiss(tenant) {
    if (!tenant || !updateTenant) return;
    const ok = window.confirm(
      `${tenant.vorname} ${tenant.nachname} archivieren?\n\n` +
      `→ Mieter wird ins Archiv verschoben\n→ Zimmer wird freigegeben\n\n` +
      `Daten + Dokumente bleiben erhalten. Du findest den Mieter unter "📦 Alte Mieter".`
    );
    if (!ok) return;
    try {
      const myRoom = rooms.find(r => r.tenantId === tenant.id);
      if (myRoom && updateRoom) await updateRoom(myRoom.id, {tenantId: null, occupied: false});
      await updateTenant(tenant.id, {
        status: "archiviert",
        archivedAt: new Date().toISOString(),
        auszug: tenant.auszug || new Date().toLocaleDateString("de-CH"),
      });
    } catch (e) {
      console.error("Archivieren fehlgeschlagen:", e);
      alert("Archivieren fehlgeschlagen. Bitte erneut versuchen.");
    }
  }
  
  // ─── RENDER ──────────────────────────────────────────────────────
  const TAB_STYLE_BASE = {
    flex:1, padding:"10px 16px", border:"none", background:"transparent",
    fontSize:13, fontWeight:600, cursor:"pointer", letterSpacing:".02em",
    color:"#8a8174", transition:"all .15s", borderBottom:"2px solid transparent"
  };
  const TAB_STYLE_ACTIVE = {
    ...TAB_STYLE_BASE, color:"#1a1814", borderBottom:"2px solid #1a1814"
  };
  
  return (
    <div className="ph">
      <div className="pt">Übergaben</div>
      
      {/* Tab Header */}
      <div style={{display:"flex",borderBottom:"1px solid #e1d8c5",marginBottom:24}}>
        <button 
          onClick={()=>setTab("einzug")} 
          style={tab==="einzug" ? TAB_STYLE_ACTIVE : TAB_STYLE_BASE}
        >🔑 Einzug {offeneSchluesselUebergaben.length > 0 && <span style={{marginLeft:6,padding:"2px 8px",background:tab==="einzug"?"#1a1814":"#c5cda8",color:"#fefcf7",borderRadius:10,fontSize:10,fontWeight:700}}>{offeneSchluesselUebergaben.length}</span>}</button>
        <button 
          onClick={()=>setTab("auszug")} 
          style={tab==="auszug" ? TAB_STYLE_ACTIVE : TAB_STYLE_BASE}
        >📅 Auszug {reminders.length > 0 && <span style={{marginLeft:6,padding:"2px 8px",background:tab==="auszug"?"#1a1814":"#c5cda8",color:"#fefcf7",borderRadius:10,fontSize:10,fontWeight:700}}>{reminders.length}</span>}</button>
      </div>
      
      {/* EINZUG */}
      {tab === "einzug" && (
        <div>
          <div style={{marginBottom:16,fontSize:13,color:"#4a4439",lineHeight:1.5}}>
            Alle Mieter mit Zimmer-Zuteilung und ihr aktueller Übernahmeprotokoll-Status.
          </div>
          
          {/* FAELLIG (todo / waiting / review) */}
          {offene.length > 0 && (
            <>
              <div style={{fontSize:11,color:"#8a8478",textTransform:"uppercase",letterSpacing:".2em",fontWeight:700,marginBottom:10}}>Fällig ({offene.length})</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(min(280px, 100%), 1fr))",gap:10,marginBottom:24}}>
                {offene.map(s => {
                  const catCfg = {
                    "todo":    {bg:"#fdebe5",border:"#e0bcb0",color:"#9b4a3e",label:"Nicht gestartet",   icon:"⚠️"},
                    "waiting": {bg:"#fdf2e0",border:"#e8c89c",color:"#7a5c3c",label:"Läuft (Mieter)",     icon:"⏱"},
                    "review":  {bg:"#e0ecf5",border:"#a8c0d5",color:"#3a5570",label:"Zur Prüfung",       icon:"📥"},
                  }[s.kategorie];
                  const dayHint = s.daysTilEinzug != null ? (
                    s.daysTilEinzug < 0 ? `${Math.abs(s.daysTilEinzug)} T. überfällig` : 
                    s.daysTilEinzug === 0 ? "Einzug heute" : 
                    `Einzug in ${s.daysTilEinzug} T.`
                  ) : "kein Einzug gesetzt";
                  return (
                    <div key={s.tenant.id} style={{background:catCfg.bg,border:`1px solid ${catCfg.border}`,borderRadius:8,padding:"12px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                        <div style={{fontSize:10,fontWeight:700,color:catCfg.color,letterSpacing:".05em",textTransform:"uppercase"}}>{catCfg.icon} {catCfg.label}</div>
                        <div style={{fontSize:10,color:catCfg.color,fontWeight:600}}>{dayHint}</div>
                      </div>
                      <div style={{fontSize:14,fontWeight:600,color:"#1a1814",marginBottom:2}}>{s.tenant.vorname} {s.tenant.nachname}</div>
                      <div style={{fontSize:11,color:"#4a4439",marginBottom:8}}>{s.room?.id||"-"} · {s.apt?.adresse||"-"} · Einzug {s.tenant.einzug || "-"}</div>
                      {schluesselText(s.tenant) && (
                        <div style={{fontSize:10.5,color:"#4a4439",marginBottom:8}}>🔑 {schluesselText(s.tenant)}</div>
                      )}
                      {s.latest && ["sent","in_progress"].includes(s.latest.status) && (
                        <div style={{fontSize:10.5,color:catCfg.color,marginBottom:8,padding:"3px 6px",background:"rgba(255,255,255,.4)",borderRadius:4}}>
                          Deadline: {new Date(s.latest.deadline).toLocaleDateString("de-CH")}
                        </div>
                      )}
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        <button
                          onClick={(e)=>{e.stopPropagation(); if(s.kategorie==="todo") oeffneStart(s); else navigateTo&&navigateTo("mieter",s.tenant.id);}}
                          style={{flex:1,minWidth:0,background:"#1a1814",color:"#fefcf7",border:"none",borderRadius:6,padding:"7px 10px",fontSize:11,fontWeight:600,cursor:"pointer",letterSpacing:".02em"}}
                          title={s.kategorie==="todo" ? "Protokoll direkt starten" : "Mieter oeffnen"}
                        >
                          {s.kategorie === "todo" ? "📋 Protokoll starten" : s.kategorie === "review" ? "📥 Prüfen" : "🔍 Anzeigen"}
                        </button>
                        {s.kategorie !== "done" && (
                          <button
                            onClick={(e)=>{e.stopPropagation(); if(window.confirm("Übergabe ohne digitales Protokoll als erledigt markieren?")) updateTenant(s.tenant.id, {uebergabeStatus:"erledigt", uebergabeNotiz:"Manuell als erledigt markiert"});}}
                            style={{background:"transparent",color:"var(--muted)",border:"1px solid var(--line)",borderRadius:6,padding:"7px 10px",fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}
                            title="Ohne digitales Protokoll abschliessen, zum Beispiel bei altem Protokoll auf Papier"
                          >
                            ✓ Erledigt
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          
          {/* ERLEDIGT */}
          {erledigt.length > 0 && (
            <details style={{marginTop:4}}>
              <summary style={{fontSize:11,color:"#8a8478",textTransform:"uppercase",letterSpacing:".2em",fontWeight:700,cursor:"pointer",padding:"6px 0"}}>Erledigt ({erledigt.length})</summary>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(min(280px, 100%), 1fr))",gap:10,marginTop:10}}>
                {erledigt.map(s => (
                  <div key={s.tenant.id} style={{background:"#e8efde",border:"1px solid #c5d5b0",borderRadius:8,padding:"10px 12px",opacity:.88}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#1a1814"}}>{s.tenant.vorname} {s.tenant.nachname}</div>
                    <div style={{fontSize:10.5,color:"#4a4439",marginBottom:2}}>{s.room?.id||"-"} · {s.apt?.adresse||"-"}</div>
                    {schluesselText(s.tenant) && <div style={{fontSize:10.5,color:"#4a4439",marginBottom:6}}>🔑 {schluesselText(s.tenant)}</div>}
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      <button
                        onClick={(e)=>{e.stopPropagation();navigateTo&&navigateTo("mieter",s.tenant.id);}}
                        style={{fontSize:10.5,padding:"4px 10px",background:"transparent",color:"#3a5230",border:"1px solid #c5d5b0",borderRadius:4,cursor:"pointer"}}
                      >🔍 Anzeigen</button>
                      {(s.tenant.uebergabeStatus||"offen")==="erledigt" && (
                        <button
                          onClick={(e)=>{e.stopPropagation(); if(window.confirm("Wieder als offen markieren?")) updateTenant(s.tenant.id, {uebergabeStatus:"offen", uebergabeNotiz:""});}}
                          style={{fontSize:10.5,padding:"4px 10px",background:"transparent",color:"#8a6d4a",border:"1px solid #d8c9ab",borderRadius:4,cursor:"pointer"}}
                        >Wieder öffnen</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
          
          {offene.length === 0 && erledigt.length === 0 && (
            <div style={{padding:"40px 20px",textAlign:"center",background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,color:"#8a8174"}}>
              <div style={{fontSize:32,marginBottom:8,opacity:.5}}>🔑</div>
              <div style={{fontSize:14,fontWeight:500}}>Keine Mieter mit Zimmer-Zuteilung</div>
            </div>
          )}
        </div>
      )}
      
      {/* AUSZUG */}
      {tab === "auszug" && (
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <div style={{fontSize:13,color:"#4a4439",lineHeight:1.5}}>
              Anstehende Auszüge in den nächsten 3 Monaten (sortiert nach Datum).
            </div>
          </div>
          {reminders.length === 0 ? (
            <div style={{padding:"40px 20px",textAlign:"center",background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,color:"#8a8174"}}>
              <div style={{fontSize:32,marginBottom:8}}>📅</div>
              <div style={{fontSize:14,fontWeight:600,color:"#5a6e4a",marginBottom:4}}>Keine Auszüge in den nächsten 3 Monaten</div>
              <div style={{fontSize:11}}>Mieter mit Auszugsdatum erscheinen hier ab 90 Tagen vorher.</div>
            </div>
          ) : (
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(min(280px, 100%), 1fr))",gap:10}}>
              {kautionTenant && <div className="ov-x" onClick={()=>setKautionTenant(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:2000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"36px 14px",overflowY:"auto"}}>
                <div className="modal-x" onClick={e=>e.stopPropagation()} style={{background:"#f7f3eb",borderRadius:16,maxWidth:560,width:"100%"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px 4px"}}>
                    <div style={{fontSize:15,fontWeight:700}}>{kautionTenant.vorname} {kautionTenant.nachname}</div>
                    <button onClick={()=>setKautionTenant(null)} style={{border:"none",background:"none",fontSize:24,cursor:"pointer",color:"var(--muted)",lineHeight:1}}>×</button>
                  </div>
                  <div style={{padding:"0 18px 18px"}}><KautionsAbrechnung tenant={kautionTenant} updateTenant={updateTenant} onDone={()=>{setDismissed(d=>[...d,kautionTenant.id]); setKautionTenant(null);}}/></div>
                </div>
              </div>}
              {reminders.map(r => {
                const cat = reminderCat(r.daysLeft, r.aptEndsToo);
                return (
                  <div key={r.tenant.id} onClick={()=>setKautionTenant(r.tenant)} style={{background:cat.bg,border:`1px solid ${cat.border}`,borderRadius:8,padding:"12px 14px",transition:"all .15s",cursor:"pointer"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                      <div style={{fontSize:10,fontWeight:700,color:cat.color,letterSpacing:".05em",textTransform:"uppercase"}}>{r.kautionOffen ? "Kautionsabrechnung offen" : (cat.icon+" "+cat.label)}</div>
                      <div style={{fontSize:10,color:cat.color,fontWeight:600}}>{r.kautionOffen ? "ausgezogen" : (r.daysLeft < 0 ? `${Math.abs(r.daysLeft)} T. überfällig` : `in ${r.daysLeft} Tagen`)}</div>
                    </div>
                    <div style={{fontSize:14,fontWeight:600,color:"#1a1814",marginBottom:2}}>{r.tenant.vorname} {r.tenant.nachname}</div>
                    <div style={{fontSize:11,color:"#4a4439",marginBottom:6}}>{r.room?.id||"-"} · {r.apt?.adresse||"-"} · {r.tenant.auszug}</div>
                    {r.aptEndsToo && (
                      <div style={{fontSize:10,color:"#5a5a5a",background:"rgba(0,0,0,.05)",padding:"4px 8px",borderRadius:4,marginBottom:8,display:"inline-block",fontWeight:600,letterSpacing:".02em"}}>
                        📅 Hauptmietvertrag endet {r.apt?.mietende}
                      </div>
                    )}
                    <div style={{fontSize:10,color:cat.color,fontStyle:"italic",lineHeight:1.4,marginBottom:10}}>→ {"Anklicken zum Abrechnen der Kaution"}</div>
                    {false && <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {!r.aptEndsToo && (
                        <button 
                          onClick={(e)=>{e.stopPropagation();navigateTo&&navigateTo("bewerber",{nachmieterFor:r.room?.id});}}
                          style={{flex:1,minWidth:0,background:"#1a1814",color:"#fefcf7",border:"none",borderRadius:6,padding:"7px 10px",fontSize:11,fontWeight:600,cursor:"pointer",letterSpacing:".02em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}
                          title={`Nachmieter für ${r.room?.id} suchen/zuteilen`}
                        >🏠 Nachmieter zuteilen</button>
                      )}
                      <button
                        onClick={(e)=>{e.stopPropagation();archiveAndDismiss(r.tenant);}}
                        style={{background:"#5a6e4a",color:"#fefcf7",border:"none",borderRadius:6,padding:"7px 10px",fontSize:11,fontWeight:600,cursor:"pointer",letterSpacing:".02em",whiteSpace:"nowrap"}}
                        title={r.aptEndsToo ? "Wohnung abgegeben - Mieter archivieren" : "Übergabe erfolgt - Mieter archivieren"}
                      >✓ Erledigt</button>
                      <button
                        onClick={(e)=>{e.stopPropagation();navigateTo&&navigateTo("mieter",r.tenant.id);}}
                        style={{flex: r.aptEndsToo ? 1 : 0,background:"transparent",color:cat.color,border:`1px solid ${cat.border}`,borderRadius:6,padding:"7px 10px",fontSize:11,fontWeight:600,cursor:"pointer",letterSpacing:".02em"}}
                        title="Mieter-Details öffnen"
                      >Details</button>
                    </div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {startFor && (
        <div className="ov-x" onClick={()=>!starting&&setStartFor(null)} style={{position:"fixed",inset:0,background:"rgba(26,24,20,.45)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,zIndex:1000}}>
          <div className="modal-x klein" onClick={e=>e.stopPropagation()} style={{background:"var(--surface)",borderRadius:12,padding:"20px 20px 16px",maxWidth:420,width:"100%",boxShadow:"0 10px 40px rgba(0,0,0,.2)"}}>
            <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:18,color:"var(--ink)",marginBottom:4}}>Protokoll starten</div>
            <div style={{fontSize:12,color:"var(--muted)",marginBottom:16,lineHeight:1.5}}>
              {startFor.tenant.vorname} {startFor.tenant.nachname} · {startFor.room?.id||"-"} · {startFor.apt?.adresse||"-"}<br/>
              Der Mieter erhält einen Link und hat 14 Tage Zeit, das Protokoll auszufüllen.
            </div>
            {refKeyInfo && (refKeyInfo.erhNormal!=null || refKeyInfo.erhExtra!=null) && (
              <div style={{background:"#f3f6f0",border:"1px solid #d9e2d2",borderRadius:6,padding:"8px 10px",marginBottom:12,fontSize:12,color:"#3a5230"}}>
                <div style={{fontWeight:600,marginBottom:2}}>Für diese Wohnung erhalten</div>
                {(refKeyInfo.erhNormal!=null || refKeyInfo.erhExtra!=null) && <div>{refKeyInfo.erhNormal||0} normale · {refKeyInfo.erhExtra||0} extra</div>}
              </div>
            )}
            <label style={{display:"block",fontSize:10,textTransform:"uppercase",letterSpacing:".18em",color:"var(--muted)",marginBottom:5}}>Anzahl Wohnungsschlüssel</label>
            <input type="number" min="0" value={normalCount} onChange={e=>setNormalCount(e.target.value)}
              style={{width:"100%",padding:"8px 10px",border:"1px solid var(--line)",borderRadius:6,fontSize:13,marginBottom:14,fontFamily:"inherit"}}/>
            <label style={{display:"block",fontSize:10,textTransform:"uppercase",letterSpacing:".18em",color:"var(--muted)",marginBottom:aptKat(startFor.apt)==="WG"?2:5}}>{aptKat(startFor.apt)==="WG"?"Persönliche Extraschlüssel":"Extraschlüssel"}</label>
            {aptKat(startFor.apt)==="WG" && <div style={{fontSize:11,color:"var(--muted)",marginBottom:5}}>Nur was diese Person persönlich bekommt.</div>}
            <textarea value={extraText} onChange={e=>setExtraText(e.target.value)} rows={2} placeholder="z.B. 1x eigener Briefkastenschlüssel"
              style={{width:"100%",padding:"8px 10px",border:"1px solid var(--line)",borderRadius:6,fontSize:13,marginBottom:aptKat(startFor.apt)==="WG"?12:16,fontFamily:"inherit",resize:"vertical"}}/>
            {aptKat(startFor.apt)==="WG" && (<>
              <label style={{display:"block",fontSize:10,textTransform:"uppercase",letterSpacing:".18em",color:"var(--muted)",marginBottom:2}}>Gemeinsame WG-Schlüssel</label>
              <div style={{fontSize:11,color:"var(--muted)",marginBottom:5}}>Allen Bewohnern gemeinsam anvertraut, bei Verlust anteilige Haftung.</div>
              <textarea value={wgText} onChange={e=>setWgText(e.target.value)} rows={2} placeholder="z.B. 1x Keller, 1x Waschküche"
                style={{width:"100%",padding:"8px 10px",border:"1px solid var(--line)",borderRadius:6,fontSize:13,marginBottom:16,fontFamily:"inherit",resize:"vertical"}}/>
            </>)}
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button className="btn btn-g btn-sm" disabled={starting} onClick={()=>setStartFor(null)}>Abbrechen</button>
              <button className="btn btn-sm" disabled={starting}
                onClick={async ()=>{
                  setStarting(true);
                  try {
                    const nCount = Math.max(0, parseInt(normalCount)||0);
                    const t = startFor.tenant;
                    const extraTrim = (extraText||"").trim();
                    const wgTrim = aptKat(startFor.apt)==="WG" ? (wgText||"").trim() : "";
                    const schluesselData = { normal: Array.from({length:nCount},()=>({nr:""})), extraText: extraTrim, wgText: wgTrim };
                    await updateTenant(t.id, { extraSchluessel: extraTrim, schluesselUebergeben: false });
                    const snapshot = [
                      nCount>0 && `${nCount}x Wohnungsschlüssel`,
                      extraTrim && `Extra: ${extraTrim}`,
                      wgTrim && `Gemeinsam (WG): ${wgTrim}`
                    ].filter(Boolean).join("\n");
                    await startHandoverProtocol({
                      tenantId: t.id,
                      aptId: startFor.apt?.id,
                      roomId: startFor.room?.id,
                      mieterEmail: t.email,
                      mieterVorname: t.vorname,
                      mieterNachname: t.nachname,
                      mieterGeburtsdatum: t.geburt || null,
                      mieterNationalitaet: t.nat || null,
                      mieterTelefon: t.phone || null,
                      aptAdresse: startFor.apt?.adresse || null,
                      aptPlz: startFor.apt?.plz || null,
                      aptOrt: startFor.apt?.ort || null,
                      roomLabel: startFor.room?.id || null,
                      einzugDatum: t.einzug || null,
                      schluesselInfo: snapshot || null,
                      schluesselData,
                    });
                    setStartFor(null);
                  } catch(e) {
                    alert("Fehler: " + (e.message || e));
                  }
                  setStarting(false);
                }}>{starting ? "Starte..." : "Protokoll starten"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Strom-Einnahmen pro Zimmer: WG-Zimmer CHF 25 pauschal, Wohnung pro Person
// (Vertragswert des Mieters, sonst Ansatz der Wohnung x Personen; ohne Mieter 1 Person).
function stromVonZimmer(r, t, apts){
  const a = (apts||[]).find(x => x.id === (r && r.aptId));
  if (a && a.vermietungsart === "wohnung") {
    if (t && t.strom != null && t.strom !== "") return +t.strom || 0;
    const ansatz = +(a.strom_pro_person ?? a.stromProPerson) || 25;
    return ansatz * Math.max(1, +(t && t.personen) || 1);
  }
  return 25;
}
function Dashboard({parkVertraege=[],loadParkVertraege,parkplaetze:parkplaetzeAlle=[],apts,rooms,tenants,bewerber,navigateTo,updateTenant,updateRoom,contracts,handoverProtocols,loadContracts,loadHandoverProtocols}){
  // Nur Plaetze, die wir tatsaechlich schon mieten (noch nicht uebernommene Plaetze zaehlen nicht)
  const parkplaetze = (parkplaetzeAlle||[]).filter(ppUebernommen);
  const heute=new Date();
  heute.setHours(0,0,0,0);

  // Eine Wohnung zaehlt nur, wenn die Miete bereits begonnen hat (Mietbeginn
  // heute oder in der Vergangenheit). Kuenftige Objekte wie A13 (Start 1.11.)
  // fallen komplett aus den oberen Zahlen (Ausgaben, Einnahmen, Marge), bis
  // ihre Miete laeuft. Ohne Datum wird die Wohnung als aktiv behandelt.
  const istInMiete = (a) => {
    const start = parseDMY(a.mietbeginn);
    if (!start || isNaN(start.getTime())) return true;
    start.setHours(0,0,0,0);
    return start <= heute;
  };
  
  // ─── SEPARATE WG vs AIRBNB ─────────────────────────────────────
  const wgApts = apts.filter(a=>a.type==="WG" && !a.pipeline && istInMiete(a)).sort((a,b)=>natSort(a.id, b.id));
  const airbnbApts = apts.filter(a=>a.type==="Airbnb" && !a.pipeline && istInMiete(a)).sort((a,b)=>natSort(a.id, b.id));
  // WG-Wohnungen mit Mietbeginn in der Zukunft: nicht in den oberen Zahlen, aber
  // in der Finanzuebersicht separat sichtbar (mit Mietbeginn/Mietende).
  const wgAptsZukunft = apts.filter(a=>a.type==="WG" && !a.pipeline && !istInMiete(a)).sort((a,b)=>natSort(a.id, b.id));
  const zTot = wgAptsZukunft.reduce((acc,a)=>{
    const rs=rooms.filter(r=>r.aptId===a.id);
    const aOcc=rs.filter(r=>r.occupied).length;
    const aIst=rs.filter(r=>r.occupied).reduce((s,r)=>{const _t=tenants.find(x=>x.id===r.tenantId);return s+((_t&&_t.mietzins!=null&&_t.mietzins!=="")?+_t.mietzins:(+r.miete||0));},0)+rs.filter(r=>r.occupied).reduce((s,r)=>s+stromVonZimmer(r,(tenants||[]).find(x=>x.id===r.tenantId),apts),0);
    const aMax=rs.reduce((s,r)=>s+(+r.miete||0),0)+rs.reduce((s,r)=>s+stromVonZimmer(r,r.occupied?(tenants||[]).find(x=>x.id===r.tenantId):null,apts),0);
    const aAufschlag=tenants.filter(t=>(t.status||"aktiv")==="aktiv").filter(t=>{ if(t.aptId===a.id)return true; if(t.roomId){const tRoom=rooms.find(r=>r.id===t.roomId); if(tRoom&&tRoom.aptId===a.id)return true;} const myRoom=rooms.find(r=>r.tenantId===t.id); if(myRoom&&myRoom.aptId===a.id)return true; return false;}).reduce((s,t)=>s+feeVon(t),0);
    acc.ausgabe+=(+a.miete||0); acc.ist+=aIst; acc.max+=aMax;
    acc.margeIst+=(aIst-(+a.miete||0)); acc.margeMax+=(aMax-(+a.miete||0));
    acc.aufschlag+=aAufschlag; acc.margeTotal+=((aMax-(+a.miete||0))+aAufschlag);
    acc.occ+=aOcc; acc.rooms+=rs.length;
    return acc;
  }, {ausgabe:0,ist:0,max:0,margeIst:0,margeMax:0,aufschlag:0,margeTotal:0,occ:0,rooms:0});
  const wgIds = wgApts.map(a=>a.id);
  const airbnbIds = airbnbApts.map(a=>a.id);
  const wgRooms = rooms.filter(r=>wgIds.includes(r.aptId));
  
  // ─── KAUTIONS-AUFSCHLÄGE ───────────────────────────────────────
  // Mieter, die einen monatlichen Servicegebühr wegen reduzierter Kaution zahlen
  // (archivierte Mieter ausschliessen - sie zahlen nicht mehr)
  const _heuteMid = new Date(); _heuteMid.setHours(0,0,0,0);
  const istAktuellerMieter = (t) => {
    const ein = parseDMY(t.einzug);
    if (ein && ein > _heuteMid) return false;   // Einzug liegt noch in der Zukunft
    const aus = parseDMY(t.auszug);
    if (aus && aus < _heuteMid) return false;    // bereits ausgezogen
    return true;
  };
  const aufschlagMieter = tenants
    .filter(t => (t.status||"aktiv") === "aktiv")
    .filter(istAktuellerMieter)
    .map(t => {
      // Mehrere Wege um das Zimmer zu finden
      let room = rooms.find(r => r.id === t.roomId);
      if (!room) room = rooms.find(r => r.tenantId === t.id);
      let apt = room ? apts.find(a => a.id === room.aptId) : null;
      if (!apt && t.aptId) apt = apts.find(a => a.id === t.aptId);
      const aufschlag = feeVon(t);
      return { tenant: t, room, apt, aufschlag };
    })
    .filter(x => x.aufschlag > 0);
  const totalAufschlagMonat = aufschlagMieter.reduce((s,x) => s + x.aufschlag, 0);
  
  // WG calculations - IMMER inkl. Strom (CHF 25/belegtem Zimmer) und Kautions-Servicegebühr
  const wgAusgaben = wgApts.reduce((s,a)=>s+(+a.miete||0),0);
  
  // Strom: CHF 25 pro belegtem Zimmer (Pauschale)
  const wgOcc = wgRooms.filter(r=>r.occupied).length;
  const wgStromIst = wgRooms.filter(r=>r.occupied).reduce((s,r)=>s+stromVonZimmer(r,(tenants||[]).find(x=>x.id===r.tenantId),apts),0);
  const wgStromMax = wgRooms.reduce((s,r)=>s+stromVonZimmer(r,r.occupied?(tenants||[]).find(x=>x.id===r.tenantId):null,apts),0); // bei Vollbelegung
  
  // Servicegebühr: Summe aller monatlichen Kautions-Aufschläge der aktiven Mieter in den WGs
  const wgTenantIds = new Set(wgRooms.filter(r=>r.tenantId).map(r=>r.tenantId));
  // Servicegebuehr-Total = exakt die Summe der Wohnungs-Zeilen: gleiche Zuordnung
  // wie pro Wohnung (aptId / roomId / room.tenantId) UND gleicher Fee inkl.
  // kautionOpt-Fallback (0x=150, 1x=100, 2x=50), nur aktuelle Mieter.
  const _feeVon = feeVon;
  const _gehoertZuApt = (t,a) => { if (t.aptId===a.id) return true; if (t.roomId){const tr=rooms.find(r=>r.id===t.roomId); if(tr&&tr.aptId===a.id)return true;} const mr=rooms.find(r=>r.tenantId===t.id); if(mr&&mr.aptId===a.id)return true; return false; };
  const wgAufschlag = wgApts.reduce((sum,a) => sum + tenants
    .filter(t => (t.status||"aktiv") === "aktiv")
    .filter(istAktuellerMieter)
    .filter(t => _gehoertZuApt(t,a))
    .reduce((s,t) => s + _feeVon(t), 0), 0);
  
  // Moeblierung: Summe der monatlichen Moeblierungsgebuehren der aktiven WG-Mieter (nur Modus monatlich)
  const wgMoeblierung = tenants
    .filter(t => (t.status||"aktiv") === "aktiv")
    .filter(t => wgTenantIds.has(t.id))
    .filter(t => (t.moebliert===true||t.moebliert==="ja") && t.moeblierungModus==="monatlich")
    .reduce((s,t) => s + moeblVon(t), 0);
  
  // Einnahmen = Zimmer-Miete + Strom + Servicegebühr + monatliche Moeblierung (alles inkl.)
  const wgEinnahmenIst = wgRooms.filter(r=>r.occupied).reduce((s,r)=>{const _t=tenants.find(x=>x.id===r.tenantId);return s+((_t&&_t.mietzins!=null&&_t.mietzins!=="")?+_t.mietzins:(+r.miete||0));},0) + wgStromIst + wgAufschlag + wgMoeblierung;
  const wgEinnahmenMax = wgRooms.reduce((s,r)=>s+(+r.miete||0),0) + wgStromMax + wgAufschlag + wgMoeblierung;
  
  const wgMargeIst = wgEinnahmenIst - wgAusgaben;
  const wgMargeMax = wgEinnahmenMax - wgAusgaben;
  const wgLeerstand = wgEinnahmenMax - wgEinnahmenIst;
  const wgFree = wgRooms.filter(r=>!r.occupied);
  const wgAuslastung = wgRooms.length ? Math.round(wgOcc/wgRooms.length*100) : 0;
  
  // Airbnb calculations (whole apt = 1 unit, no rooms)
  const abAusgaben = airbnbApts.reduce((s,a)=>s+(+a.miete||0),0);
  // For Airbnb income we assume the apt rent IS the cost; income comes from bookings (data not in system yet)
  // For now: Airbnb is shown as cost only - income tracking future feature
  
  // ─── PIPELINE calculations (gleiche Logik wie WG, separate Anzeige) ──────
  const pipelineApts = apts.filter(a=>!!a.pipeline).sort((a,b)=>natSort(a.id, b.id));
  const pipelineIds = pipelineApts.map(a=>a.id);
  const pipelineRooms = rooms.filter(r=>pipelineIds.includes(r.aptId));
  const pipelineAusgaben = pipelineApts.reduce((s,a)=>s+(+a.miete||0),0);
  const pipelineOcc = pipelineRooms.filter(r=>r.occupied).length;
  const pipelineStromIst = pipelineRooms.filter(r=>r.occupied).reduce((s,r)=>s+stromVonZimmer(r,(tenants||[]).find(x=>x.id===r.tenantId),apts),0);
  const pipelineStromMax = pipelineRooms.reduce((s,r)=>s+stromVonZimmer(r,r.occupied?(tenants||[]).find(x=>x.id===r.tenantId):null,apts),0);
  const pipelineTenantIds = new Set(pipelineRooms.filter(r=>r.tenantId).map(r=>r.tenantId));
  const pipelineAufschlag = tenants
    .filter(t => (t.status||"aktiv") === "aktiv")
    .filter(t => pipelineTenantIds.has(t.id))
    .reduce((s,t) => s + feeVon(t), 0);
  const pipelineEinnahmenIst = pipelineRooms.filter(r=>r.occupied).reduce((s,r)=>s+(+r.miete||0),0) + pipelineStromIst + pipelineAufschlag;
  const pipelineEinnahmenMax = pipelineRooms.reduce((s,r)=>s+(+r.miete||0),0) + pipelineStromMax + pipelineAufschlag;
  const pipelineMargeIst = pipelineEinnahmenIst - pipelineAusgaben;
  const pipelineMargeMax = pipelineEinnahmenMax - pipelineAusgaben;
  const pipelineAuslastung = pipelineRooms.length ? Math.round(pipelineOcc/pipelineRooms.length*100) : 0;
  
  // Total
  const pk = parkFinHeute(parkplaetze);
  const pkMax = (parkplaetze||[]).filter(p=>{ const n=new Date(); return ppAktiv(p.einkauf_ab, p.einkauf_bis, new Date(n.getFullYear(),n.getMonth(),1), new Date(n.getFullYear(),n.getMonth()+1,0,23,59,59,999)); }).reduce((s,p)=>s+(+p.miete_verkauf||0),0) - pk.kosten;
  const margeHeute = wgMargeIst + pk.marge, margeMax = wgMargeMax + pkMax;
  const totalAusgaben = wgAusgaben + abAusgaben + pk.kosten;
  const totalEinnahmenIst = wgEinnahmenIst; // Airbnb income not tracked
  const totalMargeIst = totalEinnahmenIst - totalAusgaben;

  const incomplete=tenants.filter(t=>(t.status||"aktiv")==="aktiv" && (!t.email||!t.phone||!t.geburt));
  const neueBewerber=bewerber.filter(b=>b.status==="Neu"||b.status==="In Prüfung");
  const baldEnde=apts.filter(a=>!a.pipeline && (()=>{const d=parseDMY(a.mietende);return d&&(d-heute)/86400000<60;})());

  return(
    <div>
      <div className="pt">Dashboard</div>
      <div className="ps">D&T Homes · {new Date().toLocaleDateString("de-CH")}</div>

      {/* GEGENZEICHNUNG-BANNER: gleich wie im Bewerber-Tab */}
      {(() => {
        const wartend = [...(contracts||[]), ...(parkVertraege||[])].filter(c => c.status === "mieter_signiert");
        if (wartend.length === 0) return null;
        const typLabel = (ct) => ct === "parkplatz" ? "Parkplatz" : ct === "untermietvertrag" ? "Untermietvertrag"
          : ct === "anfangsmietzins" ? "Anfangsmietzins"
          : (ct === "verlaengerung" || ct === "nachtrag") ? "Verlängerung"
          : "Untermietvertrag + Anfangsmietzins";
        return (
          <div style={{background:"#2c4a6e",color:"#fefcf7",borderRadius:8,padding:"14px 18px",margin:"16px 0 22px"}}>
            <div style={{fontSize:10,letterSpacing:".25em",textTransform:"uppercase",color:"#b0c8e0",marginBottom:10,fontWeight:600}}>✍ Wartet auf Gegenzeichnung ({wartend.length})</div>
            <div style={{display:"flex",flexDirection:"column",gap:9}}>
              {wartend.map(c => (
                <div key={c.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                  <div style={{fontSize:13.5,fontWeight:600,minWidth:0}}>
                    {`${c.mieterVorname||""} ${c.mieterNachname||""}`.trim() || "Unbenannt"}
                    <span style={{fontSize:11,color:"#b0c8e0",fontWeight:400,marginLeft:8}}>{typLabel(c.contractType)}</span>
                  </div>
                  <CountersignButton contract={c} onDone={c.contractType==="parkplatz" ? loadParkVertraege : loadContracts} onSigned={c.contractType==="parkplatz" ? (()=>{}) : undefined} light />
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {(() => {
        const pPendList = (handoverProtocols||[]).filter(h=>h.status==="submitted");
        if (!pPendList.length) return null;
        const row = {display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",background:"#fff",border:"1px solid #ecd7ab",borderRadius:8,padding:"9px 12px"};
        const nm = (v,n)=>`${(v||"").trim()} ${(n||"").trim()}`.trim();
        return (
          <div style={{background:"#fdf6e3",border:"1px solid #e8d2a8",borderRadius:10,padding:"14px 18px",margin:"16px 0 22px"}}>
            <div style={{fontSize:9,color:"#8a6a2e",textTransform:"uppercase",letterSpacing:".28em",fontWeight:700,marginBottom:10}}>Zu bestätigen</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {pPendList.map(hp => (
                <div key={"h"+hp.id} style={row}>
                  <div style={{fontSize:12.5,color:"#3a352d",minWidth:0}}>🔑 <strong>Übernahmeprotokoll</strong>{nm(hp.mieterVorname,hp.mieterNachname)?` · ${nm(hp.mieterVorname,hp.mieterNachname)}`:""}{hp.submittedAt?<span style={{color:"#8a8478"}}> · eingereicht {new Date(hp.submittedAt).toLocaleDateString("de-CH")}</span>:null}</div>
                  <HandoverConfirmButton protocol={hp} onDone={loadHandoverProtocols} />
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* TOTAL OVERVIEW - 3-column hero */}
      <div className="dash-hero" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:24}}>
        <div onClick={()=>navigateTo&&navigateTo("wohnungen",null)} style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"24px 26px",cursor:"pointer",transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 4px 16px rgba(160,136,100,.12)";}} onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
          <div style={{fontSize:9,color:"#8a8174",textTransform:"uppercase",letterSpacing:".3em",fontWeight:500,marginBottom:14}}>Total Ausgaben / Mt.</div>
          <div style={{fontFamily:"'Manrope',sans-serif",fontSize:32,fontWeight:300,color:"#1a1814",lineHeight:1,marginBottom:6}}>{chf(totalAusgaben)}</div>
          <div style={{fontSize:11,color:"#8a8174",letterSpacing:".05em"}}>{wgApts.filter(a=>aptKat(a)==="WG").length} WG · {wgApts.filter(a=>aptKat(a)==="Wohnung").length} Wohnungen · {airbnbApts.length} Airbnb{pk.anzahl>0?` · ${pk.anzahl} Parkpl.`:""}</div>
        </div>
        <div onClick={()=>navigateTo&&navigateTo("wohnungen",null)} style={{background:margeHeute>=0?"#e8eadb":"#f0dcd5",border:`1px solid ${margeHeute>=0?"#c5cda8":"#e0bcb0"}`,borderRadius:8,padding:"24px 26px",cursor:"pointer",transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,.08)";}} onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
          <div style={{fontSize:9,color:"#5a6e4a",textTransform:"uppercase",letterSpacing:".3em",fontWeight:500,marginBottom:14}}>Marge aktuell / Mt.</div>
          <div style={{fontFamily:"'Manrope',sans-serif",fontSize:32,fontWeight:400,color:margeHeute>=0?"#3d4f2f":"#9b4a3e",lineHeight:1,marginBottom:6}}>{margeHeute>=0?"+":""}{chf(margeHeute)}</div>
          <div style={{fontSize:11,color:"#5a6e4a",letterSpacing:".05em"}}>WGs + Wohnungen{pk.anzahl>0?" + Parkplätze":""}, ohne Airbnb</div>
        </div>
        <div onClick={()=>navigateTo&&navigateTo("zimmer",null)} style={{background:"#1a1814",borderRadius:8,padding:"24px 26px",color:"#fefcf7",cursor:"pointer",transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,.2)";}} onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
          <div style={{fontSize:9,color:"#b8af9f",textTransform:"uppercase",letterSpacing:".3em",fontWeight:500,marginBottom:14}}>Marge maximal / Mt.</div>
          <div style={{fontFamily:"'Manrope',sans-serif",fontSize:32,fontWeight:400,color:"#fefcf7",lineHeight:1,marginBottom:6}}>+{chf(margeMax)}</div>
          <div style={{fontSize:11,color:"#b8af9f",letterSpacing:".05em"}}>Bei 100% Belegung</div>
        </div>
      </div>

      {(parkplaetze||[]).length>0 && (()=>{ const frei=(parkplaetze||[]).filter(p=>!ppVermietet(p)).length; return (
        <div onClick={()=>navigateTo&&navigateTo("parkplaetze",null)} style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:"8px 22px",background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"14px 20px",marginBottom:24,cursor:"pointer",fontSize:12.5}}>
          <span style={{fontWeight:600}}>🅿️ Parkplätze</span>
          <span>{parkplaetze.length-frei}/{parkplaetze.length} vermietet{frei>0?<span style={{color:"#b8843e"}}> · {frei} frei</span>:null}</span>
          <span style={{color:"#8a8174"}}>Einnahmen {chf(pk.einnahmen)} · Kosten {chf(pk.kosten)}</span>
          <span style={{marginLeft:"auto",fontWeight:600,color:pk.marge>=0?"#3d4f2f":"#9b4a3e"}}>Marge {pk.marge>=0?"+":""}{chf(pk.marge)} / Mt.</span>
        </div>); })()}

      <div style={{fontFamily:"'Manrope',sans-serif",fontSize:18,fontWeight:600,color:"#1a1814",marginBottom:14,marginTop:8,letterSpacing:".01em"}}>WGs und Wohnungen</div>
      <div className="sg" style={{marginBottom:18}}>
        <div className="sc"><div className="sl">Auslastung</div><div className="sv">{wgAuslastung}%</div><div className="sn" style={{color:wgAuslastung>=80?"#5a6e4a":wgAuslastung>=50?"#b8843e":"#9b4a3e"}}>{(()=>{const _wr=wgRooms.filter(r=>aptKat(apts.find(a=>a.id===r.aptId))==="WG");const _gr=wgRooms.filter(r=>aptKat(apts.find(a=>a.id===r.aptId))==="Wohnung");return `${_wr.filter(r=>r.occupied).length}/${_wr.length} WG-Zimmer · ${_gr.filter(r=>r.occupied).length}/${_gr.length} Wohnungen`;})()}</div></div>
        <div className="sc"><div className="sl">Ausgaben</div><div className="sv" style={{fontSize:24}}>{chf(wgAusgaben).replace("CHF ","")}</div><div className="sn" style={{color:"#8a8174"}}>CHF / Mt.</div></div>
        <div className="sc"><div className="sl">Einnahmen Ist</div><div className="sv" style={{fontSize:24,color:"#5a6e4a"}}>{chf(wgEinnahmenIst).replace("CHF ","")}</div><div className="sn" style={{color:"#8a8174"}}>von max. {chf(wgEinnahmenMax)}</div></div>
        <div className="sc"><div className="sl">Leerstand</div><div className="sv" style={{fontSize:24,color:wgLeerstand>0?"#9b4a3e":"#5a6e4a"}}>{wgLeerstand>0?"−":""}{chf(wgLeerstand).replace("CHF ","")}</div><div className="sn" style={{color:"#8a8174"}}>{wgFree.length} frei</div></div>
      </div>
      {(()=>{const _fz=wgFree.filter(r=>aptKat(apts.find(a=>a.id===r.aptId))==="WG");const _fw=wgFree.filter(r=>aptKat(apts.find(a=>a.id===r.aptId))==="Wohnung");return(<>{_fz.length>0&&<div className="warn">⚠ <strong>{_fz.length} WG-Zimmer frei:</strong> {_fz.map(r=>`${r.id} (${chf(r.miete)}/Mt.${r.balkon?" 🌿":""})`).join(" · ")}</div>}{_fw.length>0&&<div className="warn">⚠ <strong>{_fw.length} {_fw.length===1?"Wohnung":"Wohnungen"} frei:</strong> {_fw.map(r=>{const _a=apts.find(a=>a.id===r.aptId);return `${_a.id} ${_a.adresse} (${chf(r.miete)}/Mt.)`;}).join(" · ")}</div>}</>);})()}

      {neueBewerber.length>0&&<div className="warn">📋 <strong>{neueBewerber.length} Bewerber</strong> warten auf Bearbeitung</div>}
      {baldEnde.length>0&&<div className="warn-r">🗓 <strong>Mietende &lt;60 Tage:</strong> {baldEnde.map(a=>{const d=parseDMY(a.mietende);return `${a.id} → ${a.mietende} (${Math.ceil((d-heute)/86400000)}d)`;}).join(" · ")}</div>}

      {/* PER-APARTMENT FINANCE BREAKDOWN - separated WG / Airbnb */}
      <div className="card finance-card-compact" style={{marginBottom:24}}>
        <div className="ct">Finanzübersicht - WGs und Wohnungen</div>
        <div className="finance-scroll-table-wrap">
        <div className="finance-scroll-table">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Adresse</th>
              <th>Zimmer</th>
              <th>Stock</th>
              <th>Mietbeginn</th>
              <th>Mietende</th>
              <th style={{textAlign:"right"}}>Ausgabe</th>
              <th style={{textAlign:"right"}}>Einnahme Ist</th>
              <th style={{textAlign:"right"}}>Einnahme Max</th>
              <th style={{textAlign:"right"}}>Marge Ist</th>
              <th style={{textAlign:"right"}}>Marge Max</th>
              <th style={{textAlign:"right"}}>Servicegebühr</th>
              <th style={{textAlign:"right"}}>Marge Total</th>
              <th>Belegung</th>
            </tr>
          </thead>
          <tbody>
            {[["WG","WGs"],["Wohnung","Wohnungen"]].filter(([k])=>wgApts.some(a=>aptKat(a)===k)).map(([kat,katLabel])=>(<React.Fragment key={"kat-"+kat}>
            <tr><td colSpan={14} style={{background:"#f5f2ea",fontSize:9,color:"#8a8174",textTransform:"uppercase",letterSpacing:".28em",fontWeight:700,padding:"8px 10px"}}>{katLabel}</td></tr>
            {wgApts.filter(a=>aptKat(a)===kat).map(a=>{
              const rs=rooms.filter(r=>r.aptId===a.id);
              const aOcc=rs.filter(r=>r.occupied).length;
              // Strom: CHF 25 pro Zimmer (Pauschale)
              const aStromIst = rs.filter(r=>r.occupied).reduce((s,r)=>s+stromVonZimmer(r,(tenants||[]).find(x=>x.id===r.tenantId),apts),0);  // bei aktueller Belegung
              const aStromMax = rs.reduce((s,r)=>s+stromVonZimmer(r,r.occupied?(tenants||[]).find(x=>x.id===r.tenantId):null,apts),0);  // bei Vollbelegung
              // Einnahmen IMMER inkl. Strom
              // Mieter dieser Wohnung ermitteln (fuer Servicegebühr und monatliche Moeblierung)
              const aptTenants = tenants
                .filter(t => (t.status||"aktiv") === "aktiv")
                .filter(t => {
                  if (t.aptId === a.id) return true;
                  if (t.roomId) { const tRoom = rooms.find(r => r.id === t.roomId); if (tRoom && tRoom.aptId === a.id) return true; }
                  const myRoom = rooms.find(r => r.tenantId === t.id);
                  if (myRoom && myRoom.aptId === a.id) return true;
                  return false;
                });
              const aMoeblierung = aptTenants
                .filter(t => (t.moebliert===true||t.moebliert==="ja") && t.moeblierungModus==="monatlich")
                .reduce((s,t) => s + moeblVon(t), 0);
              const aIst = rs.filter(r=>r.occupied).reduce((s,r)=>{const _t=tenants.find(x=>x.id===r.tenantId);return s+((_t&&_t.mietzins!=null&&_t.mietzins!=="")?+_t.mietzins:(+r.miete||0));},0) + aStromIst + aMoeblierung;
              const aMax = rs.reduce((s,r)=>s+(+r.miete||0),0) + aStromMax + aMoeblierung;
              // Kautionsaufschläge pro Wohnung
              const aAufschlag = aptTenants
                .filter(istAktuellerMieter)
                .reduce((s, t) => {
                  let auf = feeVon(t);
                  return s + auf;
                }, 0);
              // Marge IST/MAX: Einnahmen (inkl. Strom) - Ausgaben, OHNE Servicegebühr (bleibt separat)
              const aMargeIst = aIst - (+a.miete||0);
              const aMargeMax = aMax - (+a.miete||0);
              // Marge Total: Marge MAX + Servicegebühr = "alles inklusive bei Vollbelegung"
              const aMargeTotal = aMargeMax + aAufschlag;
              return (
                <tr key={a.id} onClick={()=>navigateTo&&navigateTo("wohnungen",a.id)} style={{cursor:"pointer"}}>
                  <td style={{fontWeight:600}}>{a.id}</td>
                  <td style={{fontSize:11.5,color:"#8a8174"}}>{a.adresse}</td>
                  <td data-label="Zimmer" style={{fontSize:11.5,color:"#4a4439"}}>{a.zimmer?`${a.zimmer} Zi.`:"-"}</td>
                  <td data-label="Stock" style={{fontSize:11.5,color:"#4a4439"}}>{a.stockwerk||"-"}</td>
                  <td data-label="Mietbeginn" style={{fontSize:11.5,color:"#4a4439"}}>{a.mietbeginn||"-"}</td>
                  <td data-label="Mietende" style={{fontSize:11.5,color:"#4a4439"}}>{a.mietende||"-"}</td>
                  <td data-label="Kosten" style={{textAlign:"right"}}>{chf(a.miete)}</td>
                  <td data-label="Einnahmen IST" style={{textAlign:"right",color:"#5a6e4a"}}>{chf(aIst)}</td>
                  <td data-label="Einnahmen MAX" style={{textAlign:"right",color:"#8a8174"}}>{chf(aMax)}</td>
                  <td data-label="Marge IST" style={{textAlign:"right",fontWeight:500,color:aMargeIst>=0?"#5a6e4a":"#9b4a3e"}}>{(aMargeIst>=0?"+":"")+chf(aMargeIst)}</td>
                  <td data-label="Marge MAX" style={{textAlign:"right",fontWeight:500,color:"#1a1814"}}>+{chf(aMargeMax)}</td>
                  <td data-label="Servicegebühr" style={{textAlign:"right",color:aAufschlag>0?"#5a6e4a":"#bab2a0"}}>{aAufschlag>0?"+"+chf(aAufschlag):"-"}</td>
                  <td data-label="Marge Total" style={{textAlign:"right",fontWeight:600,color:aMargeTotal>=0?"#5a6e4a":"#9b4a3e"}}>{(aMargeTotal>=0?"+":"")+chf(aMargeTotal)}</td>
                  <td data-label="Belegung" style={{width:170,minWidth:130,maxWidth:200}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{flex:"1 1 0",minWidth:0}}><Prog val={aOcc} max={rs.length}/></div>
                      <span style={{fontSize:10.5,color:"#8a8174"}}>{aOcc}/{rs.length}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            </React.Fragment>))}
          </tbody>
          <tfoot>
            <tr style={{borderTop:"2px solid #1a1814"}}>
              <td colSpan={6} style={{fontWeight:700,paddingTop:14}}>Total WGs + Wohnungen</td>
              <td style={{textAlign:"right",fontWeight:700,paddingTop:14}}>{chf(wgAusgaben)}</td>
              {/* Einnahmen IST/MAX: inkl. Strom, ohne Servicegebühr (Servicegebühr steht separat) */}
              <td style={{textAlign:"right",fontWeight:700,color:"#5a6e4a",paddingTop:14}}>{chf(wgEinnahmenIst - wgAufschlag)}</td>
              <td style={{textAlign:"right",fontWeight:700,color:"#8a8174",paddingTop:14}}>{chf(wgEinnahmenMax - wgAufschlag)}</td>
              {/* Marge IST/MAX: ohne Servicegebühr, mit Strom */}
              <td style={{textAlign:"right",fontWeight:700,color:(wgMargeIst-wgAufschlag)>=0?"#5a6e4a":"#9b4a3e",paddingTop:14}}>{(wgMargeIst-wgAufschlag)>=0?"+":""}{chf(wgMargeIst - wgAufschlag)}</td>
              <td style={{textAlign:"right",fontWeight:700,color:"#1a1814",paddingTop:14}}>+{chf(wgMargeMax - wgAufschlag)}</td>
              {/* Servicegebühr: separat */}
              <td style={{textAlign:"right",fontWeight:700,color:"#5a6e4a",paddingTop:14}}>+{chf(wgAufschlag)}</td>
              {/* Marge Total: Marge MAX + Servicegebühr = alles inklusive bei Vollbelegung */}
              <td style={{textAlign:"right",fontWeight:700,color:wgMargeMax>=0?"#5a6e4a":"#9b4a3e",paddingTop:14}}>{wgMargeMax>=0?"+":""}{chf(wgMargeMax)}</td>
              <td style={{paddingTop:14}}><span style={{fontSize:11,color:"#8a8174"}}>{wgAuslastung}%</span></td>
            </tr>
          </tfoot>
        </table>
        </div>
        </div>
        {wgAptsZukunft.length > 0 && (
          <div style={{marginTop:22}}>
            <div style={{fontSize:9,color:"#8a8174",textTransform:"uppercase",letterSpacing:".3em",fontWeight:600,marginBottom:4}}>Wohnungen in der Zukunft</div>
            <div style={{fontSize:11.5,color:"#8a8174",marginBottom:12,fontStyle:"italic"}}>Mietbeginn liegt noch bevor, deshalb nicht in den oberen Zahlen enthalten.</div>
            <div className="finance-scroll-table-wrap">
            <div className="finance-scroll-table">
            <table>
              <thead>
                <tr>
                  <th>ID</th><th>Adresse</th>
                  <th>Zimmer</th>
                  <th>Stock</th>
                  <th>Mietbeginn</th>
                  <th>Mietende</th>
                  <th style={{textAlign:"right"}}>Ausgabe</th>
                  <th style={{textAlign:"right"}}>Einnahme Ist</th>
                  <th style={{textAlign:"right"}}>Einnahme Max</th>
                  <th style={{textAlign:"right"}}>Marge Ist</th>
                  <th style={{textAlign:"right"}}>Marge Max</th>
                  <th style={{textAlign:"right"}}>Servicegebühr</th>
                  <th style={{textAlign:"right"}}>Marge Total</th>
                  <th>Belegung</th>
                </tr>
              </thead>
              <tbody>
                {wgAptsZukunft.map(a=>{
                  const rs=rooms.filter(r=>r.aptId===a.id);
                  const aOcc=rs.filter(r=>r.occupied).length;
                  const aStromIst = rs.filter(r=>r.occupied).reduce((s,r)=>s+stromVonZimmer(r,(tenants||[]).find(x=>x.id===r.tenantId),apts),0);
                  const aStromMax = rs.reduce((s,r)=>s+stromVonZimmer(r,r.occupied?(tenants||[]).find(x=>x.id===r.tenantId):null,apts),0);
                  const aIst = rs.filter(r=>r.occupied).reduce((s,r)=>{const _t=tenants.find(x=>x.id===r.tenantId);return s+((_t&&_t.mietzins!=null&&_t.mietzins!=="")?+_t.mietzins:(+r.miete||0));},0) + aStromIst;
                  const aMax = rs.reduce((s,r)=>s+(+r.miete||0),0) + aStromMax;
                  const aAufschlag = tenants
                    .filter(t => (t.status||"aktiv") === "aktiv")
                    .filter(t => {
                      if (t.aptId === a.id) return true;
                      if (t.roomId) { const tRoom = rooms.find(r => r.id === t.roomId); if (tRoom && tRoom.aptId === a.id) return true; }
                      const myRoom = rooms.find(r => r.tenantId === t.id);
                      if (myRoom && myRoom.aptId === a.id) return true;
                      return false;
                    })
                    .reduce((s, t) => {
                      let auf = feeVon(t);
                      return s + auf;
                    }, 0);
                  const aMargeIst = aIst - (+a.miete||0);
                  const aMargeMax = aMax - (+a.miete||0);
                  const aMargeTotal = aMargeMax + aAufschlag;
                  return (
                    <tr key={a.id} onClick={()=>navigateTo&&navigateTo("wohnungen",a.id)} style={{cursor:"pointer",opacity:.85}}>
                      <td style={{fontWeight:600,whiteSpace:"nowrap"}}>{a.id} <TypeBadge type={aptKat(a)}/></td>
                      <td style={{fontSize:11.5,color:"#8a8174"}}>{a.adresse}</td>
                      <td data-label="Zimmer" style={{fontSize:11.5,color:"#4a4439"}}>{a.zimmer?`${a.zimmer} Zi.`:"-"}</td>
                      <td data-label="Stock" style={{fontSize:11.5,color:"#4a4439"}}>{a.stockwerk||"-"}</td>
                      <td data-label="Mietbeginn" style={{fontSize:11.5,color:"#3d4f2f",fontWeight:500}}>{a.mietbeginn||"-"}</td>
                      <td data-label="Mietende" style={{fontSize:11.5,color:"#4a4439"}}>{a.mietende||"-"}</td>
                      <td data-label="Ausgabe" style={{textAlign:"right"}}>{chf(a.miete)}</td>
                      <td data-label="Einnahmen IST" style={{textAlign:"right",color:"#5a6e4a"}}>{chf(aIst)}</td>
                      <td data-label="Einnahmen MAX" style={{textAlign:"right",color:"#8a8174"}}>{chf(aMax)}</td>
                      <td data-label="Marge IST" style={{textAlign:"right",fontWeight:500,color:aMargeIst>=0?"#5a6e4a":"#9b4a3e"}}>{(aMargeIst>=0?"+":"")+chf(aMargeIst)}</td>
                      <td data-label="Marge MAX" style={{textAlign:"right",fontWeight:500,color:"#1a1814"}}>+{chf(aMargeMax)}</td>
                      <td data-label="Servicegebühr" style={{textAlign:"right",color:aAufschlag>0?"#5a6e4a":"#bab2a0"}}>{aAufschlag>0?"+"+chf(aAufschlag):"-"}</td>
                      <td data-label="Marge Total" style={{textAlign:"right",fontWeight:600,color:aMargeTotal>=0?"#5a6e4a":"#9b4a3e"}}>{(aMargeTotal>=0?"+":"")+chf(aMargeTotal)}</td>
                      <td data-label="Belegung" style={{width:170,minWidth:130,maxWidth:200}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{flex:"1 1 0",minWidth:0}}><Prog val={aOcc} max={rs.length}/></div>
                          <span style={{fontSize:10.5,color:"#8a8174"}}>{aOcc}/{rs.length}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{borderTop:"2px solid #1a1814"}}>
                  <td colSpan={6} style={{fontWeight:700,paddingTop:14}}>Total Zukunft</td>
                  <td style={{textAlign:"right",fontWeight:700,paddingTop:14}}>{chf(zTot.ausgabe)}</td>
                  <td style={{textAlign:"right",fontWeight:700,paddingTop:14,color:"#5a6e4a"}}>{chf(zTot.ist)}</td>
                  <td style={{textAlign:"right",fontWeight:700,paddingTop:14,color:"#8a8174"}}>{chf(zTot.max)}</td>
                  <td style={{textAlign:"right",fontWeight:700,paddingTop:14,color:zTot.margeIst>=0?"#5a6e4a":"#9b4a3e"}}>{(zTot.margeIst>=0?"+":"")+chf(zTot.margeIst)}</td>
                  <td style={{textAlign:"right",fontWeight:700,paddingTop:14,color:"#1a1814"}}>+{chf(zTot.margeMax)}</td>
                  <td style={{textAlign:"right",fontWeight:700,paddingTop:14,color:zTot.aufschlag>0?"#5a6e4a":"#bab2a0"}}>{zTot.aufschlag>0?"+"+chf(zTot.aufschlag):"-"}</td>
                  <td style={{textAlign:"right",fontWeight:700,paddingTop:14,color:zTot.margeTotal>=0?"#5a6e4a":"#9b4a3e"}}>{(zTot.margeTotal>=0?"+":"")+chf(zTot.margeTotal)}</td>
                  <td style={{textAlign:"right",fontWeight:700,paddingTop:14,color:"#8a8174"}}>{zTot.occ}/{zTot.rooms}</td>
                </tr>
              </tfoot>
            </table>
            </div>
            </div>
          </div>
        )}
      </div>

      <div className="card finance-card-compact" style={{marginBottom:24}}>
        <div className="ct">Finanzübersicht - Airbnb-Wohnungen</div>
        <div style={{fontSize:11.5,color:"#8a8174",marginBottom:14,fontStyle:"italic"}}>Einnahmen aus Buchungen werden nicht im System getrackt - nur Kosten zur Eigentümerin.</div>
        <div className="finance-scroll-table-wrap">
        <div className="finance-scroll-table">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Adresse</th><th>Zimmer</th>
              <th style={{textAlign:"right"}}>Ausgabe / Mt.</th>
              <th>Mietende</th>
            </tr>
          </thead>
          <tbody>
            {airbnbApts.map(a=>(
              <tr key={a.id} onClick={()=>navigateTo&&navigateTo("wohnungen",a.id)} style={{cursor:"pointer"}}>
                <td style={{fontWeight:600}}>{a.id}</td>
                <td style={{fontSize:11.5,color:"#8a8174"}}>{a.adresse}</td>
                <td data-label="Zimmer">{a.zimmer} Zi.</td>
                <td data-label="Miete" style={{textAlign:"right"}}>{chf(a.miete)}</td>
                <td data-label="Mietende" style={{fontSize:11.5,color:"#8a8174"}}>{a.mietende||"unbefristet"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{borderTop:"2px solid #1a1814"}}>
              <td colSpan={3} style={{fontWeight:700,paddingTop:14}}>Total Airbnb</td>
              <td style={{textAlign:"right",fontWeight:700,paddingTop:14}}>{chf(abAusgaben)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        </div>
        </div>
      </div>

      {/* PIPELINE-WOHNUNGEN FINANCE TABLE - hypothetisch, in Verhandlung */}
      {pipelineApts.length > 0 && (
      <div className="card finance-card-compact" style={{marginBottom:24}}>
        <div className="ct">Finanzübersicht - Pipeline-Wohnungen</div>
        <div style={{fontSize:11.5,color:"#8a8174",marginBottom:14,fontStyle:"italic"}}>In Verhandlung - Zahlen fliessen nicht in das Gesamt-Dashboard ein.</div>
        <div className="finance-scroll-table-wrap">
        <div className="finance-scroll-table">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Adresse</th>
              <th>Zimmer</th>
              <th>Stock</th>
              <th style={{textAlign:"right"}}>Ausgabe</th>
              <th style={{textAlign:"right"}}>Einnahme Ist</th>
              <th style={{textAlign:"right"}}>Einnahme Max</th>
              <th style={{textAlign:"right"}}>Marge Ist</th>
              <th style={{textAlign:"right"}}>Marge Max</th>
              <th style={{textAlign:"right"}}>Servicegebühr</th>
              <th style={{textAlign:"right"}}>Marge Total</th>
              <th>Belegung</th>
            </tr>
          </thead>
          <tbody>
            {pipelineApts.map(a=>{
              const rs=rooms.filter(r=>r.aptId===a.id);
              const aOcc=rs.filter(r=>r.occupied).length;
              const aStromIst = rs.filter(r=>r.occupied).reduce((s,r)=>s+stromVonZimmer(r,(tenants||[]).find(x=>x.id===r.tenantId),apts),0);
              const aStromMax = rs.reduce((s,r)=>s+stromVonZimmer(r,r.occupied?(tenants||[]).find(x=>x.id===r.tenantId):null,apts),0);
              const aIst = rs.filter(r=>r.occupied).reduce((s,r)=>{const _t=tenants.find(x=>x.id===r.tenantId);return s+((_t&&_t.mietzins!=null&&_t.mietzins!=="")?+_t.mietzins:(+r.miete||0));},0) + aStromIst;
              const aMax = rs.reduce((s,r)=>s+(+r.miete||0),0) + aStromMax;
              const aAufschlag = tenants
                .filter(t => (t.status||"aktiv") === "aktiv")
                .filter(t => {
                  if (t.aptId === a.id) return true;
                  if (t.roomId) {
                    const tRoom = rooms.find(r => r.id === t.roomId);
                    if (tRoom && tRoom.aptId === a.id) return true;
                  }
                  const myRoom = rooms.find(r => r.tenantId === t.id);
                  if (myRoom && myRoom.aptId === a.id) return true;
                  return false;
                })
                .reduce((s, t) => {
                  let auf = feeVon(t);
                  return s + auf;
                }, 0);
              const aMargeIst = aIst - (+a.miete||0);
              const aMargeMax = aMax - (+a.miete||0);
              const aMargeTotal = aMargeMax + aAufschlag;
              return (
                <tr key={a.id} onClick={()=>navigateTo&&navigateTo("wohnungen",a.id)} style={{cursor:"pointer"}}>
                  <td style={{fontWeight:600}}>{a.id}</td>
                  <td style={{fontSize:11.5,color:"#8a8174"}}>{a.adresse}</td>
                  <td data-label="Zimmer" style={{fontSize:11.5,color:"#4a4439"}}>{a.zimmer?`${a.zimmer} Zi.`:"-"}</td>
                  <td data-label="Stock" style={{fontSize:11.5,color:"#4a4439"}}>{a.stockwerk||"-"}</td>
                  <td data-label="Kosten" style={{textAlign:"right"}}>{chf(a.miete)}</td>
                  <td data-label="Einnahmen IST" style={{textAlign:"right",color:"#5a6e4a"}}>{chf(aIst)}</td>
                  <td data-label="Einnahmen MAX" style={{textAlign:"right",color:"#8a8174"}}>{chf(aMax)}</td>
                  <td data-label="Marge IST" style={{textAlign:"right",fontWeight:500,color:aMargeIst>=0?"#5a6e4a":"#9b4a3e"}}>{(aMargeIst>=0?"+":"")+chf(aMargeIst)}</td>
                  <td data-label="Marge MAX" style={{textAlign:"right",fontWeight:500,color:"#1a1814"}}>+{chf(aMargeMax)}</td>
                  <td data-label="Servicegebühr" style={{textAlign:"right",color:aAufschlag>0?"#5a6e4a":"#bab2a0"}}>{aAufschlag>0?"+"+chf(aAufschlag):"-"}</td>
                  <td data-label="Marge Total" style={{textAlign:"right",fontWeight:600,color:aMargeTotal>=0?"#5a6e4a":"#9b4a3e"}}>{(aMargeTotal>=0?"+":"")+chf(aMargeTotal)}</td>
                  <td data-label="Belegung" style={{width:170,minWidth:130,maxWidth:200}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{flex:"1 1 0",minWidth:0}}><Prog val={aOcc} max={rs.length}/></div>
                      <span style={{fontSize:10.5,color:"#8a8174"}}>{aOcc}/{rs.length}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{borderTop:"2px solid #1a1814"}}>
              <td colSpan={4} style={{fontWeight:700,paddingTop:14}}>Total Pipeline</td>
              <td style={{textAlign:"right",fontWeight:700,paddingTop:14}}>{chf(pipelineAusgaben)}</td>
              <td style={{textAlign:"right",fontWeight:700,color:"#5a6e4a",paddingTop:14}}>{chf(pipelineEinnahmenIst - pipelineAufschlag)}</td>
              <td style={{textAlign:"right",fontWeight:700,color:"#8a8174",paddingTop:14}}>{chf(pipelineEinnahmenMax - pipelineAufschlag)}</td>
              <td style={{textAlign:"right",fontWeight:700,color:(pipelineMargeIst-pipelineAufschlag)>=0?"#5a6e4a":"#9b4a3e",paddingTop:14}}>{(pipelineMargeIst-pipelineAufschlag)>=0?"+":""}{chf(pipelineMargeIst - pipelineAufschlag)}</td>
              <td style={{textAlign:"right",fontWeight:700,color:"#1a1814",paddingTop:14}}>+{chf(pipelineMargeMax - pipelineAufschlag)}</td>
              <td style={{textAlign:"right",fontWeight:700,color:pipelineAufschlag>0?"#5a6e4a":"#bab2a0",paddingTop:14}}>{pipelineAufschlag>0?"+"+chf(pipelineAufschlag):"-"}</td>
              <td style={{textAlign:"right",fontWeight:700,color:pipelineMargeMax>=0?"#5a6e4a":"#9b4a3e",paddingTop:14}}>{pipelineMargeMax>=0?"+":""}{chf(pipelineMargeMax)}</td>
              <td style={{paddingTop:14}}><span style={{fontSize:11,color:"#8a8174"}}>{pipelineAuslastung}%</span></td>
            </tr>
          </tfoot>
        </table>
        </div>
        </div>
      </div>
      )}

      <div className="card" style={{marginBottom:16}}>
          <div className="ct" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>Neueste Bewerber</span>
            {bewerber.length>0&&<button className="btn btn-g btn-sm" onClick={()=>navigateTo&&navigateTo("bewerber",null)} style={{fontSize:9}}>Alle ansehen →</button>}
          </div>
          {bewerber.length===0?<div className="empty">Noch keine Bewerbungen</div>:bewerber.slice(0,5).map(b=>(
            <div key={b.id} onClick={()=>navigateTo&&navigateTo("bewerber",b.id)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,cursor:"pointer",padding:"6px 8px",margin:"-6px -8px 5px",borderRadius:6,transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background="#f5efe4"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{display:"flex",alignItems:"center",gap:8}}><Av name={b.vorname} size={26}/><div><div style={{fontSize:12.5,fontWeight:500}}>{b.vorname} {b.nachname}</div><div style={{fontSize:10.5,color:"#8a8478"}}>{fmtDatum(b.eingereichtAm)} · {b.type||"-"}</div></div></div>
              <StatusBdg status={b.status}/>
            </div>
          ))}
      </div>

      {/* KAUTIONS-AUFSCHLÄGE */}
      {aufschlagMieter.length > 0 && (
        <div style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"22px 24px",marginBottom:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:16,paddingBottom:14,borderBottom:"1px solid #e1d8c5"}}>
            <div>
              <div style={{fontSize:9,color:"#8a8174",textTransform:"uppercase",letterSpacing:".3em",fontWeight:500,marginBottom:6}}>Kautions-Aufschläge / Mt.</div>
              <div style={{fontFamily:"'Manrope',sans-serif",fontSize:28,fontWeight:300,color:"#1a1814",lineHeight:1}}>+{chf(totalAufschlagMonat)}</div>
              <div style={{fontSize:10.5,color:"#8a8174",marginTop:4}}>von {aufschlagMieter.length} Mieter{aufschlagMieter.length!==1?"n":""}</div>
            </div>
            <div style={{fontSize:10.5,color:"#8a8174",fontStyle:"italic",textAlign:"right",maxWidth:260,lineHeight:1.5}}>Zusatzeinnahmen durch Mieter mit reduzierter Kautionssumme (Variante 0×/1×/2×)</div>
          </div>
          <div className="finance-card-compact">
          <div className="finance-scroll-table-wrap">
          <div className="finance-scroll-table">
          <table style={{width:"100%",fontSize:12}}>
            <thead>
              <tr style={{textAlign:"left",fontSize:10,color:"#8a8174",textTransform:"uppercase",letterSpacing:".15em",fontWeight:500}}>
                <th style={{padding:"6px 8px"}}>Mieter</th>
                <th style={{padding:"6px 8px"}}>Wohnung</th>
                <th style={{padding:"6px 8px"}}>Zimmer</th>
                <th style={{padding:"6px 8px"}}>Variante</th>
                <th style={{padding:"6px 8px",textAlign:"right"}}>Servicegebühr / Mt.</th>
              </tr>
            </thead>
            <tbody>
              {aufschlagMieter.map(({tenant:t,room,apt,aufschlag}) => (
                <tr key={t.id} onClick={()=>navigateTo&&navigateTo("mieter",t.id)} style={{borderTop:"1px solid #f0e9d8",cursor:"pointer"}}>
                  <td style={{padding:"8px",fontWeight:600,color:"#1a1814"}}>{t.vorname} {t.nachname}</td>
                  <td style={{padding:"8px",color:"#4a4439"}}>{apt?apt.id+" - "+apt.adresse:"-"}</td>
                  <td style={{padding:"8px",color:"#4a4439"}}>{room?.id||"-"}</td>
                  <td style={{padding:"8px"}}>
                    <span style={{display:"inline-block",padding:"2px 8px",background:"#f5efe4",borderRadius:4,fontSize:11,fontWeight:500,whiteSpace:"nowrap"}}>
                      {t.kautionOpt==="0x"?"Keine Kaution":t.kautionOpt==="1x"?"1× Miete":t.kautionOpt==="2x"?"2× Miete":t.kautionMonate!=null?`${t.kautionMonate}× Miete`:"-"}
                    </span>
                  </td>
                  <td style={{padding:"8px",textAlign:"right",fontWeight:600,color:"#5a6e4a"}}>+{chf(aufschlag)}</td>
                </tr>
              ))}
              <tr style={{borderTop:"2px solid #1a1814",background:"#f5efe4"}}>
                <td colSpan={4} style={{padding:"10px 8px",fontWeight:700,textTransform:"uppercase",fontSize:10.5,letterSpacing:".15em",color:"#1a1814"}}>Total Aufschläge</td>
                <td style={{padding:"10px 8px",textAlign:"right",fontWeight:700,color:"#5a6e4a",fontSize:13}}>+{chf(totalAufschlagMonat)}</td>
              </tr>
            </tbody>
          </table>
          </div>
          </div>
          </div>
          
          {/* SUMMARY PRO WOHNUNG */}
          {(() => {
            // Gruppiere Aufschläge pro Wohnung
            const byApt = {};
            aufschlagMieter.forEach(({apt, aufschlag}) => {
              const key = apt?.id || "noapt";
              if (!byApt[key]) byApt[key] = {apt, total: 0, count: 0};
              byApt[key].total += aufschlag;
              byApt[key].count += 1;
            });
            const aptArr = Object.values(byApt).sort((a,b) => b.total - a.total);
            return (
              <div style={{marginTop:18,paddingTop:14,borderTop:"1px dashed #d4c7a8"}}>
                <div style={{fontSize:10,color:"#8a8174",textTransform:"uppercase",letterSpacing:".15em",fontWeight:500,marginBottom:10}}>Aufschläge pro Wohnung</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(min(220px, 100%), 1fr))",gap:8}}>
                  {aptArr.map(({apt, total, count}) => (
                    <div key={apt?.id || "noapt"} onClick={()=>apt && navigateTo && navigateTo("wohnungen", apt.id)} style={{background:"#f9f6ef",border:"1px solid #e1d8c5",borderRadius:6,padding:"10px 12px",cursor:apt?"pointer":"default"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                        <div style={{minWidth:0,flex:1}}>
                          <div style={{fontSize:12,fontWeight:600,color:"#1a1814"}}>{apt?.id || "Ohne Wohnung"}</div>
                          <div style={{fontSize:10.5,color:"#8a8174",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{apt?.adresse || "-"}</div>
                          <div style={{fontSize:10,color:"#bab2a0",marginTop:2}}>{count} Mieter</div>
                        </div>
                        <div style={{fontSize:14,fontWeight:600,color:"#5a6e4a",whiteSpace:"nowrap"}}>+{chf(total)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

