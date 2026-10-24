function TodoPage({tenants, apts, rooms, documents, todos, insertTodo, updateTodo, deleteTodo, navigateTo, todoDismissals, dismissAutoTodo, handoverProtocols}){
  const [newTitle, setNewTitle] = useState("");
  const [neuOffen, setNeuOffen] = useState(false);
  const [neuNotiz, setNeuNotiz] = useState("");
  const [neuWer, setNeuWer] = useState("");
  const [neuFaellig, setNeuFaellig] = useState("");
  const [neuPrio, setNeuPrio] = useState("");
  const [bearbeite, setBearbeite] = useState(null);
  const ZUSTAENDIG = ["Daan", "Martijn", "Gemeinsam"];
  const PRIOS = [["", "keine"], ["hoch", "Hoch"], ["mittel", "Mittel"], ["tief", "Tief"]];
  const prioFarbe = (p) => p === "hoch" ? "#9b4a3e" : p === "mittel" ? "#8a6d4a" : "#5a6e4a";
  const fmtFaellig = (v) => {
    if (!v) return "";
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${+m[3]}.${+m[2]}.${m[1]}` : String(v);
  };
  const istUeberfaellig = (t) => {
    if (!t.faelligAm || t.status === "erledigt") return false;
    const heute = new Date(); heute.setHours(0,0,0,0);
    return new Date(t.faelligAm) < heute;
  };
  const hasDoc = (t, prefix) => (documents||[]).some(d => (d.category||"").toLowerCase().startsWith(prefix.toLowerCase()) && ((d.entity_type==="tenant" && d.entity_id===t.id) || (d.entity_type==="applicant" && d.entity_id===t.bewerberId)));
  const aptHasDoc = (a, prefix) => (documents||[]).some(d => d.entity_type==="apartment" && d.entity_id===a.id && (d.category||"").toLowerCase().startsWith(prefix.toLowerCase()));
  let auto = [];
  const dmHeute = new Date(); dmHeute.setHours(23,59,59,999);
  (tenants||[]).filter(t=>t.status!=="archiviert").forEach(t=>{
    const nm=`${t.vorname||""} ${t.nachname||""}`.trim()||t.id;
    if(!hasDoc(t,"Untermietvertrag")) auto.push({id:"umv-"+t.id,icon:"📄",label:"Untermietvertrag fehlt",sub:nm,page:"mieter",target:t.id});
    if(!hasDoc(t,"Anfangsmietzins")) auto.push({id:"amz-"+t.id,icon:"📄",label:"Anfangsmietzinsformular fehlt",sub:nm,page:"mieter",target:t.id});
    if(!((t.schluesselAnzahl||t.schluesselNr||"").toString().trim())) auto.push({id:"key-"+t.id,icon:"🔑",label:"Schlüsselnummer fehlt",sub:nm,page:"mieter",target:t.id});
    if(!(t.zivilstand||"").trim()) auto.push({id:"civ-"+t.id,icon:"👤",label:"Zivilstand fehlt",sub:nm,page:"mieter",target:t.id});
    if((t.drittmeldungStatus||"offen")!=="gemeldet") auto.push({id:"dm-ez-"+t.id,icon:"📮",label:"Drittmeldung Einzug offen",sub:nm,page:"mieter",target:t.id});
    if((t.uebergabeStatus||"offen")!=="erledigt" && !hasDoc(t,"Übergabeprotokoll") && !(handoverProtocols||[]).some(h=>h.tenant_id===t.id && ["accepted","abgeschlossen","completed"].includes(h.status))) auto.push({id:"hop-"+t.id,icon:"🔑",label:"Übergabeprotokoll fehlt",sub:nm,page:"mieter",target:t.id});
  });
  (tenants||[]).forEach(t=>{
    const nm=`${t.vorname||""} ${t.nachname||""}`.trim()||t.id;
    const ausD = parseD(t.auszug);
    if(ausD && ausD <= dmHeute && (t.drittmeldungAuszugStatus||"offen")!=="gemeldet") auto.push({id:"dm-az-"+t.id,icon:"📮",label:"Drittmeldung Auszug offen"+(t.status==="archiviert"?" (archiviert)":""),sub:nm,page:"mieter",target:t.id});
  });
  (apts||[]).filter(a=>!a.pipeline).forEach(a=>{
    const an = a.adresse||a.id;
    if(!(a.refnr||"").toString().trim()) auto.push({id:"ref-"+a.id,icon:"🏠",label:"Referenznummer fehlt",sub:an,page:"wohnungen",target:a.id});
    if(!(a.eigentuemer||"").trim()) auto.push({id:"own-"+a.id,icon:"🏢",label:"Eigentümer fehlt",sub:an,page:"wohnungen",target:a.id});
    if(!(a.verwaltung||"").trim()) auto.push({id:"verw-"+a.id,icon:"🏢",label:"Verwaltung fehlt",sub:an,page:"wohnungen",target:a.id});
    (typeof APT_REQUIRED!=="undefined"?APT_REQUIRED:["Hauptmietvertrag","Einzahlungsschein","Kautionsversicherung","Übergabeprotokoll"]).filter(cat=>cat!=="Anfangsmietzinsformular").forEach(cat=>{
      if(!aptHasDoc(a,cat)) auto.push({id:"apt-"+a.id+"-"+cat,icon:"📄",label:cat+" fehlt",sub:an,page:"wohnungen",target:a.id});
    });
  });

  const dismissed = new Set(todoDismissals||[]);
  auto = auto.filter(a => !dismissed.has(a.id));

  const order=["offen","in_arbeit","erledigt"];
  const labels={offen:"Offen",in_arbeit:"In Arbeit",erledigt:"Erledigt"};
  const manual=(s)=>(todos||[]).filter(t=>t.status===s);
  const move=(t,dir)=>{const i=order.indexOf(t.status);const ni=Math.max(0,Math.min(2,i+dir));if(ni!==i)updateTodo(t.id,{status:order[ni]});};
  const add=()=>{
    if(!newTitle.trim())return;
    insertTodo(newTitle.trim(), neuNotiz.trim(), {zustaendig:neuWer, faelligAm:neuFaellig, prioritaet:neuPrio})
      .then(()=>{ setNewTitle(""); setNeuNotiz(""); setNeuWer(""); setNeuFaellig(""); setNeuPrio(""); setNeuOffen(false); })
      .catch(()=>{});
  };

  return (
    <div className="ph">
      <div className="pt">To-dos</div>
      <p style={{fontSize:12,color:"var(--muted)",margin:"4px 0 16px"}}>Automatisch erkannte Datenlücken (mit Auto-Markierung, klickbar) und eigene Aufgaben. Eigene To-dos verschiebst du mit den Pfeilen zwischen den Spalten.</p>
      <OffeneSchadenmeldungen tenants={tenants} navigateTo={navigateTo}/>

      {!neuOffen ? (
        <button onClick={()=>setNeuOffen(true)}
          style={{display:"inline-flex",alignItems:"center",gap:8,background:"var(--ink)",color:"var(--surface)",border:"none",borderRadius:9,padding:"10px 16px",fontSize:12.5,cursor:"pointer",fontFamily:"inherit",marginBottom:20}}>
          <span style={{fontSize:14,lineHeight:1}}>+</span> Aufgabe hinzufügen
        </button>
      ) : (
      <div style={{maxWidth:560,marginBottom:20,border:"1px solid var(--line)",borderRadius:10,padding:"14px 15px",background:"var(--surface)"}}>
        <div style={{fontSize:9.5,textTransform:"uppercase",letterSpacing:".18em",color:"var(--muted)",marginBottom:10}}>Neue Aufgabe</div>
        <div style={{display:"grid",gap:10}}>
          <input className="fi" placeholder="Titel der Aufgabe" autoFocus value={newTitle}
            onChange={e=>setNewTitle(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&e.metaKey)add();}}/>
          <textarea className="fi" rows={3} placeholder="Beschreibung, Hintergrund, nächste Schritte…"
            value={neuNotiz} onChange={e=>setNeuNotiz(e.target.value)} style={{resize:"vertical",fontFamily:"inherit"}}/>
          <div className="aufgabe-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(min(150px, 100%), 1fr))",gap:10}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:9.5,textTransform:"uppercase",letterSpacing:".18em",color:"var(--muted)",marginBottom:4}}>Zuständig</div>
              <select className="fi" value={neuWer} onChange={e=>setNeuWer(e.target.value)}>
                <option value="">Niemand</option>
                {ZUSTAENDIG.map(z=><option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <div style={{minWidth:0}}>
              <div style={{fontSize:9.5,textTransform:"uppercase",letterSpacing:".18em",color:"var(--muted)",marginBottom:4}}>Fällig am</div>
              <input className="fi" type="date" style={{minWidth:0}} value={neuFaellig} onChange={e=>setNeuFaellig(e.target.value)}/>
            </div>
            <div style={{minWidth:0}}>
              <div style={{fontSize:9.5,textTransform:"uppercase",letterSpacing:".18em",color:"var(--muted)",marginBottom:4}}>Priorität</div>
              <select className="fi" value={neuPrio} onChange={e=>setNeuPrio(e.target.value)}>
                {PRIOS.map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}>
            <button className="btn btn-g btn-sm" onClick={()=>{setNeuOffen(false);setNewTitle("");setNeuNotiz("");setNeuWer("");setNeuFaellig("");setNeuPrio("");}}>Abbrechen</button>
            <button className="btn btn-p btn-sm" disabled={!newTitle.trim()} onClick={add}>Hinzufügen</button>
          </div>
        </div>
      </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(min(260px, 100%), 1fr))",gap:14,alignItems:"start"}}>
        {order.map(s=>(
          <div key={s} className="kcol">
            <div className="kcol-h"><span className="t">{labels[s]}</span><span className="c">{manual(s).length + (s==="offen"?auto.length:0)}</span></div>

            {manual(s).map(t=>(
              <div key={t.id} className="kcard">
                <div style={{display:"flex",alignItems:"flex-start",gap:6}}>
                  {t.prioritaet && <span title={`Priorität ${t.prioritaet}`} style={{flex:"0 0 auto",width:6,height:6,borderRadius:"50%",background:prioFarbe(t.prioritaet),marginTop:5}}/>}
                  <div style={{fontSize:13,color:"var(--ink)",lineHeight:1.4,flex:1,minWidth:0}}>{t.title}</div>
                </div>
                {t.notiz&&<div style={{fontSize:11.5,color:"var(--muted)",marginTop:4,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{t.notiz}</div>}
                {(t.zustaendig||t.faelligAm) && (
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:7}}>
                    {t.zustaendig && <span style={{fontSize:10,color:"var(--muted)",background:"var(--beige-soft)",borderRadius:20,padding:"2px 8px"}}>{t.zustaendig}</span>}
                    {t.faelligAm && <span style={{fontSize:10,borderRadius:20,padding:"2px 8px",background:istUeberfaellig(t)?"#f7e4e0":"var(--beige-soft)",color:istUeberfaellig(t)?"#9b4a3e":"var(--muted)"}}>
                      {istUeberfaellig(t)?"überfällig ":"fällig "}{fmtFaellig(t.faelligAm)}
                    </span>}
                  </div>
                )}
                {bearbeite===t.id && (
                  <div style={{marginTop:10,display:"grid",gap:8,paddingTop:10,borderTop:"1px solid var(--line-soft)"}}>
                    <textarea className="fi" rows={3} placeholder="Beschreibung…" defaultValue={t.notiz||""}
                      onBlur={e=>updateTodo(t.id,{notiz:e.target.value})} style={{resize:"vertical",fontFamily:"inherit",fontSize:12}}/>
                    <select className="fi" style={{fontSize:12}} value={t.zustaendig||""} onChange={e=>updateTodo(t.id,{zustaendig:e.target.value})}>
                      <option value="">Niemand zuständig</option>
                      {ZUSTAENDIG.map(z=><option key={z} value={z}>{z}</option>)}
                    </select>
                    <input className="fi" style={{fontSize:12}} type="date" value={t.faelligAm||""} onChange={e=>updateTodo(t.id,{faelligAm:e.target.value})}/>
                    <select className="fi" style={{fontSize:12}} value={t.prioritaet||""} onChange={e=>updateTodo(t.id,{prioritaet:e.target.value})}>
                      {PRIOS.map(([v,l])=><option key={v} value={v}>Priorität: {l}</option>)}
                    </select>
                  </div>
                )}
                <div style={{display:"flex",alignItems:"center",gap:5,marginTop:9}}>
                  <button className="kmini" disabled={s==="offen"} onClick={()=>move(t,-1)} title="Zurück">◀</button>
                  <button className="kmini" disabled={s==="erledigt"} onClick={()=>move(t,1)} title="Weiter">▶</button>
                  <button className="kmini" onClick={()=>setBearbeite(bearbeite===t.id?null:t.id)} title="Details bearbeiten">{bearbeite===t.id?"✕":"✎"}</button>
                  <div style={{flex:1}}/>
                  <button className="kmini" onClick={()=>{if(confirm("To-do löschen?"))deleteTodo(t.id);}} title="Löschen" style={{color:"var(--error)"}}>✕</button>
                </div>
              </div>
            ))}

            {s==="offen" && auto.map(a=>(
              <button key={a.id} className="kauto" onClick={()=>navigateTo&&navigateTo(a.page,a.target)}>
                <span style={{fontSize:15}}>{a.icon}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12.5,fontWeight:600,color:"var(--ink)"}}>{a.label}</div>
                  <div style={{fontSize:11,color:"var(--muted)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.sub}</div>
                </div>
                <span className="kbadge">Auto</span>
                <span role="button" title="Dauerhaft ausblenden"
                  onClick={e=>{e.stopPropagation(); if(window.confirm("Dieses automatische To-do dauerhaft ausblenden?")) dismissAutoTodo && dismissAutoTodo(a.id);}}
                  style={{marginLeft:6,fontSize:13,color:"var(--muted)",padding:"0 4px",cursor:"pointer"}}>×</span>
              </button>
            ))}

            {s==="offen" && auto.length===0 && manual("offen").length===0 && <div style={{fontSize:12,color:"var(--muted-light)",padding:"8px 2px"}}>Alles erledigt 🎉</div>}
            {s!=="offen" && manual(s).length===0 && <div style={{fontSize:12,color:"var(--muted-light)",padding:"8px 2px"}}>-</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ZeitTimeline({entries, onEdit, locked}) {
  const parseHM=(s)=>{ if(!s) return null; const m=String(s).match(/^(\d{1,2}):(\d{2})$/); if(!m) return null; return (+m[1])*60+(+m[2]); };
  const fmtDur=(min)=>{ if(min==null) return "-"; const h=Math.floor(min/60),m=min%60; return m?`${h}h ${m}min`:`${h}h`; };
  const dauerOf=(t)=>{ if(t.dauerMin!=null) return t.dauerMin; const a=parseHM(t.startZeit),b=parseHM(t.endZeit); if(a==null||b==null) return null; let d=b-a; if(d<0)d+=1440; d-=(+t.pauseMin||0); return d>0?d:0; };
  if(!entries||entries.length===0) return <div style={{fontSize:12.5,color:"var(--muted)",padding:"4px 0"}}>Keine Einträge in diesem Monat.</div>;
  let minM=7*60, maxM=19*60;
  entries.forEach(t=>{ const a=parseHM(t.startZeit), b=parseHM(t.endZeit); if(a!=null) minM=Math.min(minM,a); if(b!=null) maxM=Math.max(maxM,b); });
  minM=Math.max(0,Math.floor(minM/60)*60); maxM=Math.min(1440,Math.ceil(maxM/60)*60); if(maxM-minM<120) maxM=Math.min(1440,minM+120);
  const span=(maxM-minM)||1;
  const pos=(m)=>Math.max(0,Math.min(100,(m-minM)/span*100));
  const ticks=[]; for(let h=Math.ceil(minM/60); h*60<=maxM; h++){ if(h%2===0) ticks.push(h); }
  const byDay={}; entries.forEach(t=>{ (byDay[t.datum]=byDay[t.datum]||[]).push(t); });
  const tage=Object.keys(byDay).sort().reverse();
  const WD=["So","Mo","Di","Mi","Do","Fr","Sa"];
  return (
    <div>
      <div style={{display:"flex",alignItems:"flex-end",marginBottom:3}}>
        <div style={{width:96,flexShrink:0}}/>
        <div style={{position:"relative",flex:1,height:12}}>
          {ticks.map(h=>(<div key={h} style={{position:"absolute",left:pos(h*60)+"%",fontSize:9,color:"var(--muted)",transform:"translateX(-50%)"}}>{h}</div>))}
        </div>
      </div>
      {tage.map(d=>{
        const dayEntries=byDay[d].slice().sort((a,b)=>(parseHM(a.startZeit)||0)-(parseHM(b.startZeit)||0));
        const dayTotal=dayEntries.reduce((s,t)=>s+(t.endZeit?(dauerOf(t)||0):0),0);
        const dt=new Date(d);
        return (
          <div key={d} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid var(--line)"}}>
            <div style={{width:88,flexShrink:0}}>
              <div style={{fontSize:11.5,fontWeight:500,color:"var(--ink)"}}>{WD[dt.getDay()]} {dt.toLocaleDateString("de-CH",{day:"2-digit",month:"2-digit"})}</div>
              <div style={{fontSize:10,color:"var(--muted)"}}>{fmtDur(dayTotal)}</div>
            </div>
            <div style={{position:"relative",flex:1,height:26,background:"var(--line-soft, #f3efe6)",borderRadius:5}}>
              {ticks.map(h=>(<div key={h} style={{position:"absolute",left:pos(h*60)+"%",top:0,bottom:0,width:1,background:"rgba(0,0,0,.05)"}}/>))}
              {dayEntries.map(t=>{
                const a=parseHM(t.startZeit); let b=parseHM(t.endZeit);
                if(a==null) return null;
                const laufend=b==null;
                if(b==null) b=a+(dauerOf(t)||30);
                const left=pos(a), width=Math.max(1.5,pos(b)-pos(a));
                const title=`${t.startZeit||""}${t.endZeit?"–"+t.endZeit:" (läuft)"} · ${fmtDur(dauerOf(t))}${t.kategorie?" · "+t.kategorie:""}${t.notiz?" · "+t.notiz:""}`;
                return (
                  <div key={t.id} title={title} onClick={()=>{ if(!locked && onEdit) onEdit(t); }} style={{position:"absolute",left:left+"%",width:width+"%",top:3,bottom:3,background:laufend?"repeating-linear-gradient(45deg,#8a6d4a,#8a6d4a 6px,#a2855f 6px,#a2855f 12px)":"#8a6d4a",borderRadius:4,cursor:locked?"default":"pointer",display:"flex",alignItems:"center",overflow:"hidden"}}>
                    <span style={{fontSize:9,color:"#fff",whiteSpace:"nowrap",padding:"0 4px",textOverflow:"ellipsis",overflow:"hidden"}}>{t.kategorie? t.kategorie.split(" ")[0] : (t.startZeit||"")}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Zeiterfassung({employees, timeEntries, apts, insertEmployee, updateEmployee, deleteEmployee, insertTimeEntry, updateTimeEntry, deleteTimeEntry, timeApprovals, approveMonth, revokeMonth, benutzerMail}) {
  const [monat, setMonat] = useState(() => { const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [empModal, setEmpModal] = useState(null);
  const [entryModal, setEntryModal] = useState(null);
  const [offen, setOffen] = useState(null);
  const KATEGORIEN = ["Reinigung","Handwerk / Reparatur","Wohnungsübergabe","Administration","Besichtigung","Sonstiges"];
  const parseHM = (s) => { if(!s) return null; const m=String(s).match(/^(\d{1,2}):(\d{2})$/); if(!m) return null; return (+m[1])*60+(+m[2]); };
  const berechneDauer = (start,ende,pause) => { const a=parseHM(start),b=parseHM(ende); if(a==null||b==null) return null; let d=b-a; if(d<0) d+=1440; d-=(+pause||0); return d>0?d:0; };
  const fmtDauer = (min) => { if(min==null) return "-"; const h=Math.floor(min/60),m=min%60; return m?`${h}h ${m}min`:`${h}h`; };
  const fmtStd = (min) => (min/60).toFixed(2).replace(".",",")+" h";
  const imMonat = (d) => { const dt=new Date(d); return dt.getFullYear()===monat.getFullYear() && dt.getMonth()===monat.getMonth(); };
  const monatLabel = monat.toLocaleDateString("de-CH",{month:"long",year:"numeric"});
  const eintraege = (timeEntries||[]).filter(t=>t.datum&&imMonat(t.datum)).sort((a,b)=>(a.datum<b.datum?1:a.datum>b.datum?-1:0));
  const dauerOf = (t) => t.dauerMin!=null?t.dauerMin:berechneDauer(t.startZeit,t.endZeit,t.pauseMin);
  const totalEmp = (id) => eintraege.filter(t=>t.employeeId===id).reduce((s,t)=>s+(dauerOf(t)||0),0);
  const aptLabel = (id) => { const a=(apts||[]).find(x=>x.id===id); return a?(a.adresse||a.id):id; };
  const proObjekt = {}; eintraege.forEach(t=>{ if(t.aptId) proObjekt[t.aptId]=(proObjekt[t.aptId]||0)+(dauerOf(t)||0); });
  const monatTotal = eintraege.reduce((s,t)=>s+(dauerOf(t)||0),0);
  const aktive = (employees||[]).filter(e=>e.aktiv!==false);
  const inaktive = (employees||[]).filter(e=>e.aktiv===false);
  const jahrSel = monat.getFullYear(), monatSel = monat.getMonth()+1;
  const istGenehmigt = (empId) => (timeApprovals||[]).some(a=>a.employeeId===empId && a.jahr===jahrSel && a.monat===monatSel);
  const card = {border:"1px solid var(--line)",borderRadius:12,padding:"18px 18px",marginBottom:18,background:"var(--surface)"};
  const eyebrow = {fontSize:9.5,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".22em",marginBottom:8,fontWeight:500};

  async function speichereEmp(){ const f=empModal; if(!(f.vorname||f.nachname)){alert("Bitte einen Namen angeben.");return;} if(f.id) await updateEmployee(f.id,f); else await insertEmployee(f); setEmpModal(null); }
  async function speichereEntry(){ const f=entryModal; if(!f.employeeId){alert("Bitte Mitarbeiter wählen.");return;} if(!f.datum){alert("Bitte Datum angeben.");return;} const payload={...f,dauerMin:berechneDauer(f.startZeit,f.endZeit,f.pauseMin)}; if(f.id) await updateTimeEntry(f.id,payload); else await insertTimeEntry(payload); setEntryModal(null); }
  function neuerEintrag(empId){ const t=new Date(); const iso=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`; setEntryModal({employeeId:empId||"",datum:iso,startZeit:"",endZeit:"",pauseMin:"",aptId:"",kategorie:"",notiz:""}); }

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10,marginBottom:18}}>
        <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:26,color:"var(--ink)"}}>Zeiterfassung</div>
        <div style={{display:"flex",gap:8}}>
          <button className="btn btn-p btn-sm" onClick={()=>neuerEintrag("")} disabled={aktive.length===0}>+ Zeit erfassen</button>
        </div>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18,flexWrap:"wrap"}}>
        <button className="btn btn-sm" onClick={()=>setMonat(new Date(monat.getFullYear(),monat.getMonth()-1,1))}>‹</button>
        <div style={{minWidth:150,textAlign:"center",fontWeight:600,color:"var(--ink)",textTransform:"capitalize"}}>{monatLabel}</div>
        <button className="btn btn-sm" onClick={()=>setMonat(new Date(monat.getFullYear(),monat.getMonth()+1,1))}>›</button>
        <div style={{marginLeft:"auto",fontSize:12,color:"var(--muted)"}}>Total Monat: <strong style={{color:"var(--ink)"}}>{fmtStd(monatTotal)}</strong></div>
      </div>

      {employees.length===0 && <div style={{...card,color:"var(--muted)",fontSize:13}}>Noch keine Mitarbeiter. Lege sie im Kontomenü unter „Team verwalten" an, dann erscheinen sie hier automatisch.</div>}

      {aktive.map(e=>{
        const empEintraege = eintraege.filter(t=>t.employeeId===e.id);
        const total = totalEmp(e.id);
        const auf = offen===e.id;
        const genehmigt = istGenehmigt(e.id);
        return (
          <div key={e.id} style={card}>
            <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:180,cursor:"pointer"}} onClick={()=>setOffen(auf?null:e.id)}>
                <div style={{fontSize:15,color:"var(--ink)",fontWeight:500}}>{`${e.vorname||""} ${e.nachname||""}`.trim()||"Ohne Name"}</div>
                <div style={{fontSize:11.5,color:"var(--muted)"}}>{e.funktion||"-"}{e.stundenlohn?` · ${e.stundenlohn} CHF/h`:""}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:16,color:"var(--ink)",fontWeight:600}}>{fmtStd(total)}</div>
                <div style={{fontSize:10.5,color:"var(--muted)"}}>{empEintraege.length} Einträge · {genehmigt?<span style={{color:"#3d6b2f",fontWeight:600}}>genehmigt</span>:<span style={{color:"#a06a2c"}}>offen</span>}</div>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button className="btn btn-sm" onClick={()=>neuerEintrag(e.id)}>+ Zeit</button>
                <button className="btn btn-sm" onClick={()=>setEmpModal({...e})}>Bearbeiten</button>
                {genehmigt
                  ? <button className="btn btn-sm" onClick={()=>{ if(confirm(`Freigabe für ${monatLabel} aufheben? Der Mitarbeiter kann den Monat dann wieder bearbeiten.`)) revokeMonth(e.id, jahrSel, monatSel); }}>Freigabe aufheben</button>
                  : <button className="btn btn-p btn-sm" onClick={()=>{ if(confirm(`Zeiten von ${`${e.vorname||""} ${e.nachname||""}`.trim()} für ${monatLabel} genehmigen? Danach ist der Monat für den Mitarbeiter gesperrt.`)) approveMonth(e.id, jahrSel, monatSel, benutzerMail); }}>Monat genehmigen</button>}
                <button className="btn btn-sm" onClick={()=>setOffen(auf?null:e.id)}>{auf?"▲":"▼"}</button>
              </div>
            </div>
            {auf && (
              <div style={{marginTop:14,borderTop:"1px solid var(--line)",paddingTop:12}}>
                <ZeitTimeline entries={empEintraege} onEdit={(t)=>setEntryModal({...t})} locked={false}/>
              </div>
            )}
          </div>
        );
      })}

      {Object.keys(proObjekt).length>0 && (
        <div style={card}>
          <div style={eyebrow}>Stunden pro Objekt · <span style={{textTransform:"capitalize"}}>{monatLabel}</span></div>
          {Object.entries(proObjekt).sort((a,b)=>b[1]-a[1]).map(([id,min])=>(
            <div key={id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid var(--line)",fontSize:13}}>
              <span style={{color:"var(--ink)"}}>{aptLabel(id)}</span>
              <span style={{fontWeight:600,color:"var(--ink)"}}>{fmtStd(min)}</span>
            </div>
          ))}
        </div>
      )}

      {inaktive.length>0 && (
        <div style={{...card,opacity:.7}}>
          <div style={eyebrow}>Inaktive Mitarbeiter</div>
          {inaktive.map(e=>(
            <div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",fontSize:13}}>
              <span>{`${e.vorname||""} ${e.nachname||""}`.trim()}</span>
              <button className="btn btn-sm" onClick={()=>setEmpModal({...e})}>Bearbeiten</button>
            </div>
          ))}
        </div>
      )}

      {empModal && (
        <div className="ov-x" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}} onClick={()=>setEmpModal(null)}>
          <div className="modal-x" style={{background:"var(--surface)",borderRadius:12,padding:22,width:"100%",maxWidth:460,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:"Georgia,serif",fontSize:19,color:"var(--ink)",marginBottom:16}}>{empModal.id?"Mitarbeiter bearbeiten":"Neuer Mitarbeiter"}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div><label className="fl">Vorname</label><input className="fi" value={empModal.vorname||""} onChange={e=>setEmpModal(p=>({...p,vorname:e.target.value}))}/></div>
              <div><label className="fl">Nachname</label><input className="fi" value={empModal.nachname||""} onChange={e=>setEmpModal(p=>({...p,nachname:e.target.value}))}/></div>
              <div><label className="fl">Funktion</label><input className="fi" value={empModal.funktion||""} onChange={e=>setEmpModal(p=>({...p,funktion:e.target.value}))} placeholder="z.B. Reinigung"/></div>
              <div><label className="fl">Stundenlohn (CHF)</label><input className="fi" type="number" value={empModal.stundenlohn??""} onChange={e=>setEmpModal(p=>({...p,stundenlohn:e.target.value}))}/></div>
              <div><label className="fl">E-Mail</label><input className="fi" value={empModal.email||""} readOnly title="E-Mail wird unter Team verwalten festgelegt" style={{background:"#f5f2ec",color:"var(--muted)"}}/></div>
              <div><label className="fl">Telefon</label><input className="fi" value={empModal.phone||""} onChange={e=>setEmpModal(p=>({...p,phone:e.target.value}))}/></div>
            </div>
            <label style={{display:"flex",alignItems:"center",gap:8,marginTop:12,fontSize:13,color:"var(--ink)"}}><input type="checkbox" checked={empModal.aktiv!==false} onChange={e=>setEmpModal(p=>({...p,aktiv:e.target.checked}))}/> Aktiv</label>
            <div style={{display:"flex",gap:8,marginTop:18,justifyContent:"space-between"}}>
              <div>{empModal.id && <button className="btn btn-sm" style={{color:"var(--error)"}} onClick={()=>{ if(confirm("Mitarbeiter und alle Zeiteinträge löschen?")){ deleteEmployee(empModal.id); setEmpModal(null); } }}>Löschen</button>}</div>
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-sm" onClick={()=>setEmpModal(null)}>Abbrechen</button>
                <button className="btn btn-p btn-sm" onClick={speichereEmp}>Speichern</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {entryModal && (
        <div className="ov-x" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}} onClick={()=>setEntryModal(null)}>
          <div className="modal-x" style={{background:"var(--surface)",borderRadius:12,padding:22,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:"Georgia,serif",fontSize:19,color:"var(--ink)",marginBottom:16}}>{entryModal.id?"Zeiteintrag bearbeiten":"Zeit erfassen"}</div>
            <label className="fl">Mitarbeiter</label>
            <select className="fi" style={{width:"100%",marginBottom:10}} value={entryModal.employeeId||""} onChange={e=>setEntryModal(p=>({...p,employeeId:e.target.value}))}>
              <option value="">Wählen…</option>
              {aktive.map(e=><option key={e.id} value={e.id}>{`${e.vorname||""} ${e.nachname||""}`.trim()}</option>)}
            </select>
            <label className="fl">Datum</label>
            <input className="fi" type="date" style={{width:"100%",marginBottom:10}} value={entryModal.datum||""} onChange={e=>setEntryModal(p=>({...p,datum:e.target.value}))}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              <div><label className="fl">Start</label><input className="fi" type="time" value={entryModal.startZeit||""} onChange={e=>setEntryModal(p=>({...p,startZeit:e.target.value}))}/></div>
              <div><label className="fl">Ende</label><input className="fi" type="time" value={entryModal.endZeit||""} onChange={e=>setEntryModal(p=>({...p,endZeit:e.target.value}))}/></div>
              <div><label className="fl">Pause (min)</label><input className="fi" type="number" value={entryModal.pauseMin??""} onChange={e=>setEntryModal(p=>({...p,pauseMin:e.target.value}))}/></div>
            </div>
            <div style={{fontSize:12,color:"var(--muted)",margin:"8px 0 12px"}}>Dauer: <strong style={{color:"var(--ink)"}}>{fmtDauer(berechneDauer(entryModal.startZeit,entryModal.endZeit,entryModal.pauseMin))}</strong></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div><label className="fl">Aufgabe</label>
                <select className="fi" value={entryModal.kategorie||""} onChange={e=>setEntryModal(p=>({...p,kategorie:e.target.value}))}>
                  <option value="">-</option>
                  {KATEGORIEN.map(k=><option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div><label className="fl">Wohnung (optional)</label>
                <select className="fi" value={entryModal.aptId||""} onChange={e=>setEntryModal(p=>({...p,aptId:e.target.value}))}>
                  <option value="">-</option>
                  {(apts||[]).map(a=><option key={a.id} value={a.id}>{a.adresse||a.id}</option>)}
                </select>
              </div>
            </div>
            <label className="fl" style={{marginTop:10,display:"block"}}>Notiz</label>
            <textarea className="fi" rows={2} style={{width:"100%",fontFamily:"inherit"}} value={entryModal.notiz||""} onChange={e=>setEntryModal(p=>({...p,notiz:e.target.value}))}/>
            <div style={{display:"flex",gap:8,marginTop:16,justifyContent:"space-between"}}>
              <div>{entryModal.id && <button className="btn btn-sm" style={{color:"var(--error)"}} onClick={()=>{ if(confirm("Eintrag löschen?")){ deleteTimeEntry(entryModal.id); setEntryModal(null); } }}>Löschen</button>}</div>
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-sm" onClick={()=>setEntryModal(null)}>Abbrechen</button>
                <button className="btn btn-p btn-sm" onClick={speichereEntry}>Speichern</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MitarbeiterZeit({employees, timeEntries, benutzerMail, insertTimeEntry, updateTimeEntry, deleteTimeEntry, timeApprovals}) {
  const [monat, setMonat] = useState(() => { const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [manModal, setManModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const parseHM = (s)=>{ if(!s) return null; const m=String(s).match(/^(\d{1,2}):(\d{2})$/); if(!m) return null; return (+m[1])*60+(+m[2]); };
  const berechneDauer=(a,b,p)=>{ const x=parseHM(a),y=parseHM(b); if(x==null||y==null) return null; let d=y-x; if(d<0)d+=1440; d-=(+p||0); return d>0?d:0; };
  const fmtDauer=(min)=>{ if(min==null) return "-"; const h=Math.floor(min/60),m=min%60; return m?`${h}h ${m}min`:`${h}h`; };
  const fmtStd=(min)=>(min/60).toFixed(2).replace(".",",")+" h";
  const nowHM=()=>{ const t=new Date(); return `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}`; };
  const todayISO=()=>{ const t=new Date(); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`; };
  const myEmp = (employees||[]).find(e => (e.email||"").toLowerCase() === (benutzerMail||"").toLowerCase()) || (employees||[])[0];
  const KATEGORIEN = ["Reinigung","Handwerk / Reparatur","Wohnungsübergabe","Administration","Besichtigung","Sonstiges"];
  const card = {border:"1px solid var(--line)",borderRadius:12,padding:"18px 18px",marginBottom:18,background:"var(--surface)"};

  if (!myEmp) {
    return (
      <div>
        <div style={{fontFamily:"Georgia,serif",fontSize:24,color:"var(--ink)",marginBottom:12}}>Zeiterfassung</div>
        <div style={{border:"1px solid var(--line)",borderRadius:12,padding:20,color:"var(--muted)",fontSize:13.5,lineHeight:1.6}}>Dein Konto ist noch nicht mit einem Mitarbeiter-Profil verknüpft. Bitte melde dich bei Daan, damit er deine E-Mail-Adresse ({benutzerMail||"-"}) beim Mitarbeiter hinterlegt.</div>
      </div>
    );
  }

  const meine = (timeEntries||[]).filter(t=>t.employeeId===myEmp.id);
  const laufend = meine.find(t=>t.startZeit && !t.endZeit);
  const imMonat=(d)=>{ const dt=new Date(d); return dt.getFullYear()===monat.getFullYear()&&dt.getMonth()===monat.getMonth(); };
  const monatLabel = monat.toLocaleDateString("de-CH",{month:"long",year:"numeric"});
  const monEintraege = meine.filter(t=>t.datum&&imMonat(t.datum)).sort((a,b)=>(a.datum<b.datum?1:a.datum>b.datum?-1:0));
  const dauerOf=(t)=>t.dauerMin!=null?t.dauerMin:berechneDauer(t.startZeit,t.endZeit,t.pauseMin);
  const monTotal = monEintraege.reduce((s,t)=>s+(t.endZeit?(dauerOf(t)||0):0),0);
  const jahrSel = monat.getFullYear(), monatSel = monat.getMonth()+1;
  const monatGenehmigt = (timeApprovals||[]).some(a=>a.employeeId===myEmp.id && a.jahr===jahrSel && a.monat===monatSel);
  const heuteD = new Date();
  const heuteGenehmigt = (timeApprovals||[]).some(a=>a.employeeId===myEmp.id && a.jahr===heuteD.getFullYear() && a.monat===heuteD.getMonth()+1);

  async function einstempeln(){ setBusy(true); try{ await insertTimeEntry({employeeId:myEmp.id, datum:todayISO(), startZeit:nowHM(), endZeit:"", pauseMin:"", createdBy:"self"}); } finally { setBusy(false); } }
  async function ausstempeln(){ if(!laufend) return; setBusy(true); try{ const ende=nowHM(); await updateTimeEntry(laufend.id, {endZeit:ende, dauerMin:berechneDauer(laufend.startZeit, ende, laufend.pauseMin)}); } finally { setBusy(false); } }
  async function speichereManuell(){ const f=manModal; if(!f.datum){alert("Bitte Datum angeben.");return;} const payload={...f, employeeId:myEmp.id, dauerMin:berechneDauer(f.startZeit,f.endZeit,f.pauseMin), createdBy:"self"}; if(f.id) await updateTimeEntry(f.id,payload); else await insertTimeEntry(payload); setManModal(null); }

  return (
    <div>
      <div style={{fontFamily:"Georgia,serif",fontSize:24,color:"var(--ink)",marginBottom:4}}>Zeiterfassung</div>
      <div style={{fontSize:13,color:"var(--muted)",marginBottom:18}}>Hallo {myEmp.vorname||myEmp.nachname||""}</div>

      <div style={{...card, textAlign:"center", padding:"26px 18px"}}>
        {laufend ? (
          <>
            <div style={{fontSize:13,color:"var(--muted)",marginBottom:4}}>Läuft seit {laufend.startZeit} Uhr{laufend.datum!==todayISO()?` (${new Date(laufend.datum).toLocaleDateString("de-CH")})`:""}</div>
            <div style={{fontSize:30,fontWeight:600,color:"var(--ink)",marginBottom:16}}>{fmtDauer(berechneDauer(laufend.startZeit, nowHM(), laufend.pauseMin))}</div>
            <button className="btn btn-p" style={{fontSize:16,padding:"12px 30px"}} disabled={busy||heuteGenehmigt} onClick={ausstempeln}>Ausstempeln</button>
          </>
        ) : (
          <>
            <div style={{fontSize:13,color:"var(--muted)",marginBottom:16}}>Du bist nicht eingestempelt.</div>
            <button className="btn btn-p" style={{fontSize:16,padding:"12px 34px"}} disabled={busy||heuteGenehmigt} onClick={einstempeln}>Einstempeln</button>
          </>
        )}
        {heuteGenehmigt && <div style={{fontSize:11.5,color:"#a06a2c",marginTop:12}}>Der aktuelle Monat ist bereits genehmigt und gesperrt.</div>}
        <div style={{marginTop:14}}><button className="btn btn-sm" onClick={()=>setManModal({datum:todayISO(),startZeit:"",endZeit:"",pauseMin:"",kategorie:"",notiz:""})}>Zeit manuell nachtragen</button></div>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,flexWrap:"wrap"}}>
        <button className="btn btn-sm" onClick={()=>setMonat(new Date(monat.getFullYear(),monat.getMonth()-1,1))}>‹</button>
        <div style={{minWidth:150,textAlign:"center",fontWeight:600,color:"var(--ink)",textTransform:"capitalize"}}>{monatLabel}</div>
        <button className="btn btn-sm" onClick={()=>setMonat(new Date(monat.getFullYear(),monat.getMonth()+1,1))}>›</button>
        <div style={{marginLeft:"auto",fontSize:13,color:"var(--muted)"}}>Total: <strong style={{color:"var(--ink)"}}>{fmtStd(monTotal)}</strong></div>
      </div>
      {monatGenehmigt && <div style={{border:"1px solid #cdddb8",background:"#eef3e9",borderRadius:12,padding:"12px 16px",marginBottom:14,color:"#3d5230",fontSize:12.5,lineHeight:1.5}}>Dieser Monat ist vom Admin genehmigt und für dich gesperrt. Änderungen sind nicht mehr möglich.</div>}
      <div style={card}>
        <ZeitTimeline entries={monEintraege} onEdit={(t)=>setManModal({...t})} locked={monatGenehmigt}/>
      </div>

      {manModal && (
        <div className="ov-x" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}} onClick={()=>setManModal(null)}>
          <div className="modal-x" style={{background:"var(--surface)",borderRadius:12,padding:22,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:"Georgia,serif",fontSize:19,color:"var(--ink)",marginBottom:16}}>{manModal.id?"Eintrag bearbeiten":"Zeit nachtragen"}</div>
            <label className="fl">Datum</label>
            <input className="fi" type="date" style={{width:"100%",marginBottom:10}} value={manModal.datum||""} onChange={e=>setManModal(p=>({...p,datum:e.target.value}))}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              <div><label className="fl">Start</label><input className="fi" type="time" value={manModal.startZeit||""} onChange={e=>setManModal(p=>({...p,startZeit:e.target.value}))}/></div>
              <div><label className="fl">Ende</label><input className="fi" type="time" value={manModal.endZeit||""} onChange={e=>setManModal(p=>({...p,endZeit:e.target.value}))}/></div>
              <div><label className="fl">Pause (min)</label><input className="fi" type="number" value={manModal.pauseMin??""} onChange={e=>setManModal(p=>({...p,pauseMin:e.target.value}))}/></div>
            </div>
            <div style={{fontSize:12,color:"var(--muted)",margin:"8px 0 12px"}}>Dauer: <strong style={{color:"var(--ink)"}}>{fmtDauer(berechneDauer(manModal.startZeit,manModal.endZeit,manModal.pauseMin))}</strong></div>
            <label className="fl">Aufgabe</label>
            <select className="fi" style={{width:"100%",marginBottom:10}} value={manModal.kategorie||""} onChange={e=>setManModal(p=>({...p,kategorie:e.target.value}))}>
              <option value="">-</option>
              {KATEGORIEN.map(k=><option key={k} value={k}>{k}</option>)}
            </select>
            <label className="fl" style={{display:"block"}}>Notiz</label>
            <textarea className="fi" rows={2} style={{width:"100%",fontFamily:"inherit"}} value={manModal.notiz||""} onChange={e=>setManModal(p=>({...p,notiz:e.target.value}))}/>
            <div style={{display:"flex",gap:8,marginTop:16,justifyContent:"space-between"}}>
              <div>{manModal.id && <button className="btn btn-sm" style={{color:"var(--error)"}} onClick={()=>{ if(confirm("Eintrag löschen?")){ deleteTimeEntry(manModal.id); setManModal(null); } }}>Löschen</button>}</div>
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-sm" onClick={()=>setManModal(null)}>Abbrechen</button>
                <button className="btn btn-p btn-sm" onClick={speichereManuell}>Speichern</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

