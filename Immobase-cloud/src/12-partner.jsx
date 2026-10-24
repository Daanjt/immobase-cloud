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
  function startNew(){ setF({typ:"Eigentümer",kontakte:[]}); setEditing({}); }
  function startEdit(p){
    const seeded = (p.kontakte&&p.kontakte.length) ? p.kontakte
      : ((p.kontaktperson||p.email||p.telefon) ? [{name:p.kontaktperson||"",funktion:"",email:p.email||"",telefon:p.telefon||""}] : []);
    setF({...p,kontakte:seeded}); setEditing(p);
  }
  const addK = ()=>setF(p=>({...p,kontakte:[...(p.kontakte||[]),{name:"",funktion:"",email:"",telefon:""}]}));
  const updK = (i,key,val)=>setF(p=>{const k=[...(p.kontakte||[])];k[i]={...k[i],[key]:val};return {...p,kontakte:k};});
  const rmK = (i)=>setF(p=>({...p,kontakte:(p.kontakte||[]).filter((_,j)=>j!==i)}));
  async function save(){
    if(!(f.name||"").trim()){ alert("Name ist erforderlich."); return; }
    try {
      if(editing && editing.id) await updatePartner(editing.id, f);
      else await insertPartner(f);
      setEditing(null); setF({});
    } catch(e) {}
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
  return (
    <div className="ph">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
        <div className="pt">Verwaltungen & Eigentümer</div>
        <button className="btn btn-p" onClick={startNew}>＋ Neuer Partner</button>
      </div>
      <p style={{fontSize:12,color:"#8a8174",margin:"4px 0 16px"}}>Partner, mit denen wir zusammenarbeiten. Die Adresse des Eigentümers wird beim Evorest-Link automatisch verwendet.</p>

      {editing && (
        <div className="card" style={{marginBottom:16,padding:18}}>
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
          <div style={{marginTop:6,marginBottom:6}}>
            <label className="fl">Kontaktpersonen</label>
            {(f.kontakte||[]).map((k,i)=>(
              <div key={i} className="frow" style={{alignItems:"flex-end",gap:6}}>
                <div className="fg"><input className="fi" placeholder="Name" value={k.name||""} onChange={e=>updK(i,"name",e.target.value)}/></div>
                <div className="fg"><input className="fi" placeholder="Funktion (z.B. Bewirtschafter)" value={k.funktion||""} onChange={e=>updK(i,"funktion",e.target.value)}/></div>
                <div className="fg"><input className="fi" placeholder="E-Mail" value={k.email||""} onChange={e=>updK(i,"email",e.target.value)}/></div>
                <div className="fg"><input className="fi" placeholder="Telefon" value={k.telefon||""} onChange={e=>updK(i,"telefon",e.target.value)}/></div>
                <button className="btn btn-sm" onClick={()=>rmK(i)} title="Entfernen" style={{color:"#9b4a3e",borderColor:"#e0bcb0",marginBottom:2}}>✕</button>
              </div>
            ))}
            <button className="btn btn-g btn-sm" onClick={addK} style={{marginTop:4}}>＋ Kontaktperson</button>
          </div>
          <div className="frow">
            <div className="fg" style={{flex:1}}><label className="fl">Notizen</label><textarea className="fi" rows={2} value={f.notizen||""} onChange={F("notizen")}/></div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <button className="btn btn-p btn-sm" onClick={save}>Speichern</button>
            <button className="btn btn-sm" onClick={()=>{setEditing(null);setF({});}}>Abbrechen</button>
          </div>
        </div>
      )}

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
                <button key={p.id} onClick={()=>setSelected(p.id)} className={`pcard${selected===p.id?" sel":""}`}>
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
              <button className="btn btn-g btn-sm" onClick={()=>startEdit(selPartner)}>Bearbeiten</button>
              <button className="btn btn-sm" onClick={()=>{remove(selPartner);setSelected(null);}} style={{color:"var(--error)",borderColor:"var(--error-soft)"}}>Löschen</button>
              <button className="btn btn-sm" onClick={()=>setSelected(null)} title="Schliessen">✕</button>
            </div>
          </div>
          <div style={{height:1,background:"var(--line-soft)",margin:"18px 0"}}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(230px, 100%), 1fr))",gap:28}}>
            <div>
              <div className="psec">Adresse</div>
              <div style={{fontSize:13.5,color:"var(--text)",lineHeight:1.55}}>{addrOf(selPartner)||<span style={{color:"var(--muted-light)"}}>keine Adresse hinterlegt</span>}</div>

              <div className="psec" style={{marginTop:22}}>Kontaktpersonen</div>
              {(selPartner.kontakte&&selPartner.kontakte.length>0)
                ? <div style={{display:"grid",gap:11}}>{selPartner.kontakte.map((k,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
                      <Av name={k.name||"?"} size={28}/>
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:13,color:"var(--ink)"}}>{k.name||"-"}{k.funktion&&<span style={{color:"var(--muted)"}}> · {k.funktion}</span>}</div>
                        {(k.email||k.telefon)&&<div style={{fontSize:11,color:"var(--muted)"}}>{[k.email,k.telefon].filter(Boolean).join(" · ")}</div>}
                      </div>
                    </div>
                  ))}</div>
                : <div style={{fontSize:12.5,color:"var(--muted-light)"}}>keine erfasst</div>}

              {selPartner.notizen&&<><div className="psec" style={{marginTop:22}}>Notizen</div><div style={{fontSize:13,color:"var(--text)",lineHeight:1.55}}>{selPartner.notizen}</div></>}
            </div>
            <div>
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
          </div>
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

