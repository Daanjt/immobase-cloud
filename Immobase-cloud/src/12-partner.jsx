// ─── APP ─────────────────────────────────────────────────────────────────────
function PartnerPage({partners, insertPartner, updatePartner, deletePartner, apts, navigateTo, tenants}){
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [f, setF] = useState({});
  const partnerDetailRef = useRef(null);
  useEffect(()=>{
    if (selected && partnerDetailRef.current) {
      partnerDetailRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selected]);
  const F = (k)=>(e)=>setF(p=>({...p,[k]:e.target.value}));
  // Personen kommen aus den Kontakten (Firma = Partnername), damit alles verknüpft ist.
  const [kontakte, kontakteNeu] = useKontakte();
  const [lgs, setLgs] = useState([]);
  const ladeLgs = ()=>supabase.from("liegenschaften").select("adresse, kontakt_id, kontakt_name, kontakt_email, kontakt_telefon").then(({data})=>setLgs(data||[]));
  useEffect(()=>{ ladeLgs(); },[]);
  const [personen, setPersonen] = useState([]);
  const [busy, setBusy] = useState(false);
  // Personen eines Partners: Kontakte dieser Firma plus alte Einträge aus dem Partner, die (noch) nicht bei den Kontakten sind
  function personenVon(p){
    if(!p) return [];
    const aus = (kontakte||[]).filter(k=>gleicheFirma(k.organisation,p.name)).map(k=>({id:k.id,name:k.name||"",rolle:k.rolle||"",email:k.email||"",phone:k.phone||""}));
    const alt = (p.kontakte&&p.kontakte.length) ? p.kontakte : ((p.kontaktperson||p.email||p.telefon) ? [{name:p.kontaktperson||"",email:p.email||"",telefon:p.telefon||""}] : []);
    alt.forEach(k=>{ const em=String(k.email||"").toLowerCase(); if(aus.some(x=>(em&&String(x.email).toLowerCase()===em)||(!em&&k.name&&x.name===k.name))) return; aus.push({id:null,name:k.name||"",rolle:k.funktion||"",email:k.email||"",phone:k.telefon||""}); });
    return aus;
  }
  function startNew(){ setF({typ:"Eigentümer",kontakte:[]}); setPersonen([]); setEditing({}); }
  function startEdit(p){ setF({...p}); setPersonen([]); setEditing(p); setPersonOffen(null); }
  // Einzelne Person direkt in der Detailansicht ansehen und bearbeiten
  const [personOffen, setPersonOffen] = useState(null);   // Index in personenVon(...) oder "neu"
  const [pf, setPf] = useState(null);                      // Formularwerte, null = Ansicht
  async function personSpeichern(partner){
    const x = pf || {};
    const row={ name:String(x.name||"").trim()||null, rolle:String(x.rolle||"").trim()||null, email:String(x.email||"").trim().toLowerCase()||null, phone:String(x.phone||"").trim()||null, updated_at:new Date().toISOString() };
    if(!row.name && !row.email){ alert("Bitte Name oder E-Mail angeben."); return; }
    setBusy(true);
    try{
      let id = x.id || null;
      if(!id && row.email){ const {data:da}=await supabase.from("kontakte").select("id").ilike("email",row.email).limit(1); if(da&&da.length) id=da[0].id; }
      const {error} = id ? await supabase.from("kontakte").update({...row, organisation:partner.name}).eq("id",id)
        : await supabase.from("kontakte").insert({...row, organisation:partner.name, org_type:(partner.typ||"Eigentümer")==="Eigentümer"?"eigentuemer":"verwaltung"});
      if(error) throw error;
      await kontakteNeu(); await ladeLgs(); setPf(null); setPersonOffen(null); toast("Gespeichert");
    }catch(e){ toast("Speichern fehlgeschlagen: "+(e.message||e),"error"); }
    setBusy(false);
  }
  async function personLoesen(partner, k){
    if(!k.id){ setPersonOffen(null); setPf(null); return; }
    if(!confirm(`${k.name||k.email} von ${partner.name} lösen? Der Kontakt selbst bleibt bei den Kontakten erhalten.`)) return;
    await supabase.from("kontakte").update({organisation:null,updated_at:new Date().toISOString()}).eq("id",k.id);
    await kontakteNeu(); setPf(null); setPersonOffen(null);
  }
  const addK = ()=>setPersonen(l=>[...l,{id:null,name:"",rolle:"",email:"",phone:""}]);
  const updK = (i,key,val)=>setPersonen(l=>l.map((x,j)=>j===i?{...x,[key]:val}:x));
  const rmK = (i)=>setPersonen(l=>l.map((x,j)=>j===i?{...x,_weg:true}:x).filter(x=>x.id||!x._weg));
  async function save(){
    const name=(f.name||"").trim();
    if(!name){ alert("Name ist erforderlich."); return; }
    setBusy(true);
    try {
      const neu = !(editing && editing.id);
      const aktiv = personen.filter(x=>!x._weg && (String(x.name||"").trim()||String(x.email||"").trim()));
      const daten = neu ? {...f, name, kontakte: aktiv.map(x=>({name:x.name||"",funktion:x.rolle||"",email:x.email||"",telefon:x.phone||""}))} : {...f, name};
      const alt = editing && editing.id ? editing.name : null;
      if(editing && editing.id) await updatePartner(editing.id, daten);
      else await insertPartner(daten);
      const orgType = (f.typ||"Eigentümer")==="Eigentümer" ? "eigentuemer" : "verwaltung";
      for(const x of (neu ? personen : [])){
        const row={ name:String(x.name||"").trim()||null, rolle:String(x.rolle||"").trim()||null, email:String(x.email||"").trim().toLowerCase()||null, phone:String(x.phone||"").trim()||null, updated_at:new Date().toISOString() };
        if(x._weg){ if(x.id) await supabase.from("kontakte").update({organisation:null,updated_at:row.updated_at}).eq("id",x.id); continue; }
        if(!row.name && !row.email) continue;
        if(x.id){ await supabase.from("kontakte").update({...row, organisation:name}).eq("id",x.id); continue; }
        const {data:da} = row.email ? await supabase.from("kontakte").select("id").ilike("email",row.email).limit(1) : {data:[]};
        if(da&&da.length) await supabase.from("kontakte").update({...row, organisation:name}).eq("id",da[0].id);
        else await supabase.from("kontakte").insert({...row, organisation:name, org_type:orgType});
      }
      // Umbenannt: Kontakte und Wohnungen ziehen mit, damit alles verknüpft bleibt
      if(alt && alt!==name){
        await supabase.from("kontakte").update({organisation:name}).eq("organisation",alt);
        await supabase.from("apartments").update({verwaltung:name}).eq("verwaltung",alt);
        await supabase.from("apartments").update({eigentuemer:name}).eq("eigentuemer",alt);
        try{ window.__ibNeuLaden && window.__ibNeuLaden(); }catch(_){}
      }
      await kontakteNeu(); await ladeLgs();
      setEditing(null); setF({}); setPersonen([]);
      toast("Gespeichert");
    } catch(e) { toast("Speichern fehlgeschlagen: "+(e.message||e),"error"); }
    setBusy(false);
  }
  async function remove(p){
    const used = (apts||[]).filter(a=>a.eigentuemer===p.name||a.verwaltung===p.name).length;
    let msg = `${p.name} löschen?`;
    if(used>0) msg += `\n\nAchtung: ${used} Wohnung(en) verweisen aktuell auf diesen Eintrag.`;
    if(!confirm(msg)) return;
    try { await deletePartner(p.id); } catch(e) {}
  }
  const byName = (a,b)=>(a.name||"").localeCompare(b.name||"");
  const addrOf = (p)=>[p.strasse&&`${p.strasse} ${p.hausnummer||""}`.trim(), [p.plz,p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const linkedApts = (p)=>(apts||[]).filter(a=>a.eigentuemer===p.name||a.verwaltung===p.name).sort((a,b)=>natSort(a.id,b.id));
  const all = [...(partners||[])];
  const verwaltungen = all.filter(p=>p.typ==="Verwaltung"||p.typ==="Beides").sort(byName);
  const eigentuemer = all.filter(p=>!p.typ||p.typ==="Eigentümer"||p.typ==="Beides").sort(byName);
  // Kautionsversicherungen: unsere eigene Mietkaution je Wohnung, gruppiert nach Anbieter
  const normA = (v)=>(v||"").toString().trim().toLowerCase().replace(/[^a-z]/g,"");
  const kautionBetragOf = (a)=>parseFloat(String(a.kaution||"").replace(/[^\d.]/g,""))||0;
  const anbieterListe = (()=>{
    const bekannt = ["FirstCaution","goCaution","Evorest"];
    const gefunden = [...new Set((apts||[]).map(a=>(a.kautionType||"").trim()).filter(Boolean))];
    const extra = gefunden.filter(g => !bekannt.some(b => normA(b)===normA(g)));
    return [...bekannt, ...extra];
  })();
  const kautionStats = anbieterListe.map(name => {
    const treffer = (apts||[]).filter(a => normA(a.kautionType) === normA(name));
    const laufend = treffer.filter(a => !a.pipeline);
    return {
      name,
      anzahl: treffer.length,
      laufend: laufend.length,
      summe: treffer.reduce((s,a)=>s + kautionBetragOf(a), 0),
      objekte: treffer.slice().sort((a,b)=>natSort(a.id,b.id)),
    };
  }).filter(k => k.anzahl > 0);
  const kautionGesamt = kautionStats.reduce((s,k)=>s + k.summe, 0);
  const ohneAnbieter = (apts||[]).filter(a => !a.pipeline && !(a.kautionType||"").trim()).length;
  const chfP = (n)=>"CHF " + Math.round(n||0).toLocaleString("de-CH");

  const selPartner = selected ? all.find(p=>p.id===selected) : null;
  function formular(eingebettet){
    return (
        <div className={eingebettet?"":"card"} style={eingebettet?{}:{marginBottom:16,padding:18}}>
          <div style={{fontWeight:700,marginBottom:12}}>{editing.id?"Partner bearbeiten":"Neuer Partner"}</div>
          <div className="frow">
            <div className="fg" style={{flex:2}}><label className="fl">Name *</label><input className="fi" value={f.name||""} onChange={F("name")} placeholder="z.B. Bilaya Wohnbau AG"/></div>
            <div className="fg"><label className="fl">Typ</label><select className="fi" value={f.typ||"Eigentümer"} onChange={F("typ")}><option>Eigentümer</option><option>Verwaltung</option><option>Beides</option></select></div>
          </div>
          <div className="frow">
            <div className="fg" style={{flex:2}}><label className="fl">Strasse</label><input className="fi" value={f.strasse||""} onChange={F("strasse")}/></div>
            <div className="fg"><label className="fl">Nr.</label><input className="fi" value={f.hausnummer||""} onChange={F("hausnummer")}/></div>
          </div>
          <div className="frow">
            <div className="fg"><label className="fl">PLZ</label><input className="fi" value={f.plz||""} onChange={F("plz")}/></div>
            <div className="fg" style={{flex:2}}><label className="fl">Ort</label><input className="fi" value={f.ort||""} onChange={F("ort")}/></div>
          </div>
          {!editing.id && <div style={{marginTop:6,marginBottom:6}}>
            <label className="fl">Personen</label>
            <div style={{display:"grid",gap:8}}>
            {personen.map((k,i)=>k._weg?null:(
              <div key={i} style={{position:"relative",border:"1px solid var(--line-soft)",borderRadius:10,padding:"10px 44px 10px 10px",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(180px,100%),1fr))",gap:6}}>
                <input className="fi" placeholder="Name" value={k.name||""} onChange={e=>updK(i,"name",e.target.value)}/>
                <input className="fi" placeholder="Funktion (z.B. Bewirtschafterin)" value={k.rolle||""} onChange={e=>updK(i,"rolle",e.target.value)}/>
                <input className="fi" placeholder="E-Mail" value={k.email||""} onChange={e=>updK(i,"email",e.target.value)}/>
                <input className="fi" placeholder="Telefon" value={k.phone||""} onChange={e=>updK(i,"phone",e.target.value)}/>
                <button onClick={()=>rmK(i)} title="Von diesem Partner entfernen" style={{position:"absolute",top:10,right:8,width:28,height:28,border:"1px solid #e0bcb0",borderRadius:7,background:"#fff",color:"#9b4a3e",cursor:"pointer"}}>✕</button>
              </div>
            ))}
            </div>
            <button className="btn btn-g btn-sm" onClick={addK} style={{marginTop:4}}>＋ Person</button>
            <div style={{fontSize:11,color:"var(--muted)",marginTop:6}}>Die Personen werden auch bei den Kontakten gespeichert. Später bearbeitest du sie einzeln in der Ansicht des Partners.</div>
          </div>}
          <div className="frow">
            <div className="fg" style={{flex:1}}><label className="fl">Notizen</label><textarea className="fi" rows={2} value={f.notizen||""} onChange={F("notizen")}/></div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <button className="btn btn-p btn-sm" onClick={save} disabled={busy}>{busy?"Speichert…":"Speichern"}</button>
            <button className="btn btn-sm" onClick={()=>{setEditing(null);setF({});setPersonen([]);}}>Abbrechen</button>
          </div>
        </div>
    );
  }
  const lgVonPerson = (id)=>lgs.filter(l=>id&&l.kontakt_id===id).map(l=>l.adresse);
  const lgVonPartner = (p)=>{ const adr=[...new Set(linkedApts(p).map(a=>a.adresse).filter(Boolean))]; return adr.map(a=>lgs.find(l=>l.adresse===a)||{adresse:a}); };
  return (
    <div className="ph">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
        <div className="pt">Verwaltungen & Eigentümer</div>
        <button className="btn btn-p" onClick={startNew}>＋ Neuer Partner</button>
      </div>
      <p style={{fontSize:12,color:"#8a8174",margin:"4px 0 16px"}}>Partner, mit denen wir zusammenarbeiten. Die Adresse des Eigentümers wird beim Evorest-Link automatisch verwendet.</p>

      {editing && !editing.id && formular()}

      {all.length===0 && !editing && (
        <div style={{padding:"40px 20px",textAlign:"center",color:"#8a8174",fontSize:13}}>Noch keine Partner erfasst. Lege den ersten mit "Neuer Partner" an.</div>
      )}

      <div style={{display:"flex",gap:24,flexWrap:"wrap",marginTop:4}}>
        {[["Verwaltungen",verwaltungen],["Eigentümer",eigentuemer]].map(([title,items])=>(
          <div key={title} style={{flex:1,minWidth:240}}>
            <div className="pcol-h"><span className="t">{title}</span><span className="c">{items.length}</span></div>
            <div style={{display:"grid",gap:2}}>
              {items.length===0 && <div style={{fontSize:12.5,color:"var(--muted-light)",padding:"10px 2px"}}>Noch keine erfasst</div>}
              {items.map(p=>(
                <button key={p.id} onClick={()=>{setSelected(p.id);setPersonOffen(null);setPf(null);}} className={`pcard${selected===p.id?" sel":""}`}>
                  <Av name={p.name} size={34}/>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{fontSize:13.5,fontWeight:600,color:"var(--ink)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                    <div style={{fontSize:11,color:"var(--muted)",marginTop:1}}>{linkedApts(p).length} Wohnung{linkedApts(p).length===1?"":"en"}{p.typ==="Beides"?" · beides":""}</div>
                  </div>
                  <span style={{color:"var(--muted-light)",fontSize:16,lineHeight:1}}>›</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selPartner && (
        <div className="card" style={{marginTop:16,padding:24}} ref={partnerDetailRef}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:14,minWidth:0}}>
              <Av name={selPartner.name} size={46}/>
              <div style={{minWidth:0}}>
                <div style={{fontFamily:"'Manrope',sans-serif",fontSize:20,fontWeight:500,color:"var(--ink)",letterSpacing:".01em"}}>{selPartner.name}</div>
                <span className="bx b-x" style={{marginTop:5,display:"inline-block"}}>{selPartner.typ||"-"}</span>
              </div>
            </div>
            <div style={{display:"flex",gap:6}}>
              {!(editing&&editing.id===selPartner.id) && <button className="btn btn-g btn-sm" onClick={()=>startEdit(selPartner)}>Bearbeiten</button>}
              <button className="btn btn-sm" onClick={()=>{remove(selPartner);setSelected(null);}} style={{color:"var(--error)",borderColor:"var(--error-soft)"}}>Löschen</button>
              <button className="btn btn-sm" onClick={()=>setSelected(null)} title="Schliessen">✕</button>
            </div>
          </div>
          <div style={{height:1,background:"var(--line-soft)",margin:"18px 0"}}/>
          {editing&&editing.id===selPartner.id ? formular(true) :
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(230px, 100%), 1fr))",gap:28}}>
            <div>
              <div className="psec">Adresse</div>
              <div style={{fontSize:13.5,color:"var(--text)",lineHeight:1.55}}>{addrOf(selPartner)||<span style={{color:"var(--muted-light)"}}>keine Adresse hinterlegt</span>}</div>

              <div className="psec" style={{marginTop:22,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span>Personen · {personenVon(selPartner).length}</span>
                <button className="btn btn-g btn-sm" style={{width:"auto"}} onClick={()=>{setPersonOffen("neu");setPf({id:null,name:"",rolle:"",email:"",phone:""});}}>＋ Person</button></div>
              {(()=>{
                const liste = personenVon(selPartner);
                const feld = (key,ph)=><input className="fi" placeholder={ph} value={(pf&&pf[key])||""} onChange={e=>setPf(v=>({...v,[key]:e.target.value}))}/>;
                const formP = (k)=>(<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(170px,100%),1fr))",gap:6,marginTop:8}}>
                  {feld("name","Name")}{feld("rolle","Funktion")}{feld("email","E-Mail")}{feld("phone","Telefon")}
                  <div style={{display:"flex",gap:6,gridColumn:"1 / -1",marginTop:2,flexWrap:"wrap"}}>
                    <button className="btn btn-p btn-sm" style={{width:"auto"}} disabled={busy} onClick={()=>personSpeichern(selPartner)}>{busy?"Speichert…":"Speichern"}</button>
                    <button className="btn btn-sm" style={{width:"auto"}} onClick={()=>{ setPf(null); if(personOffen==="neu") setPersonOffen(null); }}>Abbrechen</button>
                    {k&&k.id&&<button className="btn btn-sm" style={{width:"auto",marginLeft:"auto",color:"#9b4a3e",borderColor:"#e0bcb0"}} onClick={()=>personLoesen(selPartner,k)}>Von {selPartner.name} lösen</button>}
                  </div>
                </div>);
                return (<div style={{display:"grid",gap:8}}>
                  {personOffen==="neu" && <div style={{border:"1px solid var(--line)",borderRadius:10,padding:"10px 12px",background:"var(--surface)"}}><div style={{fontSize:12.5,fontWeight:600}}>Neue Person</div>{formP(null)}</div>}
                  {liste.length===0 && personOffen!=="neu" && <div style={{fontSize:12.5,color:"var(--muted-light)"}}>keine erfasst</div>}
                  {liste.map((k,i)=>{ const zust=lgVonPerson(k.id); const offen=personOffen===i; return (
                    <div key={(k.id||"x")+":"+i} style={{border:"1px solid "+(offen?"var(--line)":"transparent"),borderRadius:10,padding:offen?"10px 12px":"4px 2px",background:offen?"var(--surface)":"transparent"}}>
                      <div onClick={()=>{ if(!offen){ setPersonOffen(i); setPf(null); } }} style={{display:"flex",alignItems:"flex-start",gap:10,cursor:offen?"default":"pointer"}}>
                        <Av name={k.name||"?"} size={30}/>
                        <div style={{minWidth:0,flex:1}}>
                          <div style={{fontSize:13,color:"var(--ink)",fontWeight:500}}>{k.name||"-"}{k.rolle&&<span style={{color:"var(--muted)",fontWeight:400}}> · {k.rolle}</span>}</div>
                          {(k.email||k.phone)&&<div style={{fontSize:11.5,color:"var(--muted)",marginTop:1}}>{k.email&&<a href={"mailto:"+k.email} onClick={e=>e.stopPropagation()} style={{color:"inherit"}}>{k.email}</a>}{k.email&&k.phone?" · ":""}{k.phone&&<a href={"tel:"+k.phone.replace(/\s/g,"")} onClick={e=>e.stopPropagation()} style={{color:"inherit"}}>{k.phone}</a>}</div>}
                          {zust.length>0&&<div style={{fontSize:11,color:"#3d4f2f",marginTop:2}}>Ansprechperson für {zust.join(", ")}</div>}
                        </div>
                        {offen && !pf && <div style={{display:"flex",gap:6}}>
                          <button className="btn btn-g btn-sm" style={{width:"auto"}} onClick={()=>setPf({...k})}>Bearbeiten</button>
                          <button className="btn btn-sm" style={{width:"auto"}} onClick={()=>setPersonOffen(null)} title="Schliessen">✕</button>
                        </div>}
                        {!offen && <span style={{color:"var(--muted-light)",fontSize:16,lineHeight:1}}>›</span>}
                      </div>
                      {offen && pf && formP(k)}
                    </div>); })}
                </div>);
              })()}

              {selPartner.notizen&&<><div className="psec" style={{marginTop:22}}>Notizen</div><div style={{fontSize:13,color:"var(--text)",lineHeight:1.55}}>{selPartner.notizen}</div></>}
            </div>
            <div>
              {lgVonPartner(selPartner).length>0 && <>
                <div className="psec">Liegenschaften · {lgVonPartner(selPartner).length}</div>
                <div style={{display:"grid",gap:6,marginBottom:22}}>{lgVonPartner(selPartner).map(l=>(
                  <div key={l.adresse} style={{fontSize:12.5,padding:"8px 11px",border:"1px solid var(--line-soft)",borderRadius:8}}>
                    <div style={{fontWeight:500,color:"var(--ink)"}}>{l.adresse}</div>
                    <div style={{fontSize:11,color:l.kontakt_name?"var(--muted)":"#9b4a3e",marginTop:1}}>{l.kontakt_name?`Ansprechperson: ${l.kontakt_name}${l.kontakt_email?" · "+l.kontakt_email:""}`:"Keine Ansprechperson hinterlegt (unter Schäden › Liegenschaften oder bei der Wohnung erfassen)"}</div>
                  </div>))}</div>
              </>}
              <div className="psec">Verknüpfte Wohnungen · {linkedApts(selPartner).length}</div>
              <div style={{display:"grid",gap:6}}>
                {linkedApts(selPartner).length===0 && <div style={{fontSize:12.5,color:"var(--muted-light)"}}>keine</div>}
                {linkedApts(selPartner).map(a=>{
                  const roles=[a.eigentuemer===selPartner.name&&"Eigentümer",a.verwaltung===selPartner.name&&"Verwaltung"].filter(Boolean).join(" + ");
                  return (
                    <button key={a.id} onClick={()=>navigateTo&&navigateTo("wohnungen",a.id)} className="pcard" style={{padding:"9px 11px"}}>
                      <span style={{flexShrink:0,height:24,display:"inline-flex",alignItems:"center",justifyContent:"center",padding:"0 9px",borderRadius:6,background:"var(--beige-soft)",color:"var(--muted)",fontSize:10.5,fontWeight:600,letterSpacing:".05em"}}>{a.id}</span>
                      <div style={{minWidth:0,flex:1}}>
                        <div style={{fontSize:13,fontWeight:500,color:"var(--ink)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.adresse}</div>
                        {roles&&<div style={{fontSize:10.5,color:"var(--muted)",marginTop:1}}>{roles}</div>}
                      </div>
                      <span style={{color:"var(--muted-light)",fontSize:16,lineHeight:1}}>›</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>}
        </div>
      )}

      <div style={{marginTop:26}}>
        <div className="pcol-h" style={{marginBottom:10}}>
          <span className="t">Kautionsversicherungen</span>
          <span className="c">{chfP(kautionGesamt)}</span>
        </div>
        <div style={{fontSize:12,color:"var(--muted)",marginBottom:12,lineHeight:1.55}}>
          Unsere hinterlegte Mietkaution je Wohnung, gruppiert nach Anbieter.
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(min(230px, 100%), 1fr))",gap:10}}>
          {kautionStats.map(k=>(
            <div key={k.name} style={{border:"1px solid var(--line)",borderRadius:10,padding:"14px 16px",background:"var(--surface)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10}}>
                <span style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:16,color:"var(--ink)"}}>{k.name}</span>
                <span style={{fontSize:11,color:"var(--muted)"}}>{k.laufend} Wohnung{k.laufend===1?"":"en"}</span>
              </div>
              {k.objekte.map(a=>(
                <div key={a.id} style={{display:"flex",justifyContent:"space-between",gap:8,fontSize:11.5,padding:"2px 0",color:"var(--muted)"}}>
                  <span style={{minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.id} · {a.adresse}{a.pipeline?" (Pipeline)":""}</span>
                  <span style={{color:"var(--ink)",whiteSpace:"nowrap"}}>{chfP(kautionBetragOf(a))}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"8px 0 0",marginTop:6,borderTop:"1px solid var(--line-soft)"}}>
                <span style={{fontSize:9.5,textTransform:"uppercase",letterSpacing:".18em",color:"var(--muted)"}}>Total</span>
                <span style={{fontSize:17,fontFamily:"'Manrope',sans-serif",color:"#3d4f2f"}}>{chfP(k.summe)}</span>
              </div>
            </div>
          ))}
        </div>
        {ohneAnbieter > 0 && (
          <div style={{fontSize:11.5,color:"#8a6d4a",marginTop:10,lineHeight:1.5}}>
            Bei {ohneAnbieter} laufenden Wohnung{ohneAnbieter===1?"":"en"} ist kein Kautionsanbieter hinterlegt.
          </div>
        )}
      </div>
    </div>
  );
}

