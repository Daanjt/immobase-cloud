function Nachvermietung({apts, rooms, tenants, bewerber, updateRoom, updateTenant, updateBewerber, convertTenantToBewerber, navigateTo}){
  const AUTO_TAGE = 45;
  const heute = new Date(); heute.setHours(0,0,0,0);
  const pd = (s)=>{ if(!s) return null; const str=String(s).trim(); if(/^\d{4}-\d{2}-\d{2}/.test(str)){const d=new Date(str);return isNaN(d.getTime())?null:d;} const m=str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); if(m){const d=new Date(+m[3],+m[2]-1,+m[1]);return isNaN(d.getTime())?null:d;} const d=new Date(str);return isNaN(d.getTime())?null:d; };
  const fmt = (d)=> d ? d.toLocaleDateString("de-CH") : "-";
  const wgApts = apts.filter(a=>a.type==="WG" && !a.pipeline).sort((a,b)=>(aptKat(a)===aptKat(b)?natSort(a.id,b.id):aptKat(a)==="WG"?-1:1));

  function roomInfo(r, apt){
    const t = r.tenantId ? tenants.find(x=>x.id===r.tenantId) : null;
    const aptEnde = pd(apt.mietende);
    const aus = pd(t && t.auszug) || (t ? aptEnde : null);
    const override = r.ausschreibOverride || "auto";
    let statusKey, statusLabel, statusColor;
    if (!r.occupied){ statusKey="frei"; statusLabel="Frei"; statusColor="#b8843e"; }
    else if (aptEnde && aus && aus >= aptEnde){ statusKey="bleibt"; statusLabel="Bleibt bis Ende"; statusColor="#5a7c5e"; }
    else if (aptEnde && aus && aus < aptEnde){ statusKey="zieht_aus"; statusLabel="Zieht aus"; statusColor="#c0392b"; }
    else if (t && !aus){ statusKey="offen"; statusLabel="Auszug offen"; statusColor="#8a8174"; }
    else { statusKey="bleibt"; statusLabel="Bleibt"; statusColor="#5a7c5e"; }
    // Nachmieter nur fuer Zimmer, die nachbesetzt werden (Auszug oder frei), nie fuer Bleiber.
    // Nur echte, aktuell zugeteilte Bewerber, und nie der aktuelle Mieter selbst.
    let nachmieter=null, nachmieterTyp=null;
    if (statusKey==="zieht_aus" || statusKey==="frei"){
      // Ist der Nachmieter schon als (zukuenftiger) Mieter angelegt, hat er Vorrang -> Klick fuehrt zum Mieter.
      const ft=(tenants||[]).find(x => x.id!==r.tenantId && x.roomId===r.id && (x.status||"aktiv")!=="archiviert");
      if (ft){ nachmieter=ft; nachmieterTyp="mieter"; }
      else {
        const bw = (bewerber||[]).find(b => b.zugeteiltes_zimmer===r.id && (b.status==="Zugeteilt" || (b.nachfolge_angenommen_at && b.status!=="Abgelehnt")) && (!t || (b.id!==t.bewerberId && (b.email||"").toLowerCase().trim()!==(t.email||"").toLowerCase().trim())));
        if (bw){ nachmieter=bw; nachmieterTyp="bewerber"; }
      }
    }
    const tage = aus ? Math.ceil((aus-heute)/86400000) : null;
    const autoAus = statusKey==="zieht_aus" && tage!==null && tage<=AUTO_TAGE;
    const ausgeschrieben = nachmieter ? false : (override==="ja" ? true : override==="nein" ? false : (apt.nicht_ausschreiben ? false : (statusKey==="frei" ? true : autoAus)));
    const ausschreibAb = (statusKey==="zieht_aus" && aus) ? new Date(aus.getTime()-AUTO_TAGE*86400000) : null;
    const wechselFaellig = nachmieterTyp==="mieter" && nachmieter && nachmieter.einzug && pd(nachmieter.einzug) && pd(nachmieter.einzug) <= heute;
    return {t, aptEnde, aus, override, nachmieter, nachmieterTyp, statusKey, statusLabel, statusColor, tage, autoAus, ausgeschrieben, ausschreibAb, wechselFaellig};
  }

  let tRooms=0, tAus=0, tAusMitNach=0, tAusg=0;
  wgApts.forEach(a=>{ rooms.filter(r=>r.aptId===a.id).forEach(r=>{ const i=roomInfo(r,a); tRooms++; if(i.statusKey==="zieht_aus"){tAus++; if(i.nachmieter)tAusMitNach++;} if(i.ausgeschrieben)tAusg++; }); });
  const tGesucht = tAus - tAusMitNach;

  async function mieterwechsel(r, alt, neu){
    if(!alt||!neu) return;
    if(!confirm(`Mieterwechsel für Zimmer ${r.id} vollziehen?\n\n${alt.vorname} ${alt.nachname} wird archiviert (ehemaliger Mieter).\n${neu.vorname} ${neu.nachname} wird zum aktuellen Mieter.`)) return;
    await updateTenant(alt.id, {status:"archiviert"});
    await updateRoom(r.id, {tenantId:neu.id, occupied:true, mieter_auszug: neu.auszug||null});
  }

  async function nachmieterZuruecknehmen(r, nm, typ){
    if(!nm) return;
    if(!confirm(`Nachmieter ${nm.vorname} ${nm.nachname} für Zimmer ${r.id} zurücknehmen?\n\nDie Zuteilung wird aufgehoben, die Person geht zurück zu den Bewerbern und das Zimmer wird wieder ausgeschrieben.`)) return;
    if(typ==="mieter" && convertTenantToBewerber){ await convertTenantToBewerber(nm); }
    else if(updateBewerber){ await updateBewerber(nm.id, {zugeteiltes_zimmer: null, status: "Neu"}); }
  }

  const ovBtn = (r, val, label)=>{ const on=(r.ausschreibOverride||"auto")===val; return (
    <button onClick={()=>updateRoom(r.id,{ausschreibOverride:val})} style={{fontSize:10,padding:"3px 7px",borderRadius:5,cursor:"pointer",border:`1px solid ${on?"#1a1814":"#d8d0c0"}`,background:on?"#1a1814":"#fff",color:on?"#fff":"#5a5249",whiteSpace:"nowrap"}}>{label}</button>
  ); };

  const renderApt = (a) => {
    const rs = rooms.filter(r=>r.aptId===a.id).sort((x,y)=>natSort(x.id,y.id));
    if (rs.length===0) return null;
    return (
      <div className="card" key={a.id} style={{marginBottom:16}}>
        <div className="ct" style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <span style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>{a.id} - {a.adresse} <TypeBadge type={aptKat(a)}/></span>
          <span style={{fontSize:11,color:"#8a8174",fontWeight:400}}>Wohnung endet: {fmt(pd(a.mietende))}</span>
        </div>
        <table><thead><tr><th>Zimmer</th><th>Aktueller Mieter</th><th>Auszug</th><th>Status</th><th>Nachmieter</th><th>Ausschreiben</th></tr></thead><tbody>
          {rs.map(r=>{
            const i = roomInfo(r,a);
            return (
              <tr key={r.id}>
                <td style={{fontWeight:600}}><button onClick={()=>navigateTo&&navigateTo("zimmer",r.id)} style={{background:"none",border:"none",color:"#1a1814",fontWeight:600,cursor:"pointer",padding:0,textDecoration:"underline",fontFamily:"inherit",fontSize:"inherit"}}>{objektLabel(r.id)}</button></td>
                <td data-label="Mieter">{i.t?<button onClick={()=>navigateTo&&navigateTo("mieter",i.t.id)} style={{background:"none",border:"none",color:"#1a1814",cursor:"pointer",padding:0,textDecoration:"underline",fontFamily:"inherit",fontSize:"inherit"}}>{i.t.vorname} {i.t.nachname}</button>:<span style={{color:"#8a8174"}}>frei</span>}</td>
                <td data-label="Auszug">{i.statusKey==="zieht_aus"?<>{fmt(i.aus)}{i.tage!==null?<span style={{color:"#8a8174",fontSize:10.5}}> · in {i.tage} T</span>:null}</>:(i.statusKey==="bleibt"?"bleibt":(i.statusKey==="offen"?"offen":"-"))}</td>
                <td data-label="Status"><span style={{display:"inline-block",padding:"3px 10px",borderRadius:12,fontSize:10.5,fontWeight:600,color:"#fff",background:i.statusColor}}>{i.statusLabel}</span>{i.t && i.statusKey!=="bleibt" && !i.nachmieter && <button onClick={async()=>{ if(!confirm(`${i.t.vorname} ${i.t.nachname} bleibt bis zum Wohnungsende?\n\nDas Auszugsdatum wird auf ${a.mietende?fmt(pd(a.mietende)):"das Wohnungsende"} gesetzt und das Zimmer nicht mehr ausgeschrieben.`)) return; await updateTenant(i.t.id,{auszug: a.mietende||""}); }} style={{marginLeft:8,fontSize:11,padding:"5px 13px",background:"transparent",color:"#5a7c5e",border:"1px solid #bcc9ac",borderRadius:6,cursor:"pointer",fontWeight:500,whiteSpace:"nowrap"}}>✓ Bleibt</button>}</td>
                <td data-label="Nachmieter">{i.nachmieter?<span style={{display:"inline-flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>{(bewerber||[]).some(bb=>bb.nachfolge_token&&bb.nachfolge_angenommen_at&&bb.zugeteiltes_zimmer===r.id)&&<span title="Der bisherige Mieter zieht vorzeitig aus und hat diese Person selbst gebracht" style={{fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:99,background:"#efebe3",color:"#5a5448",whiteSpace:"nowrap"}}>↻ vom Mieter gebracht</span>}<button onClick={()=>navigateTo&&navigateTo(i.nachmieterTyp,i.nachmieter.id)} style={{background:"none",border:"none",color:"#3a5230",cursor:"pointer",padding:0,textDecoration:"underline",fontFamily:"inherit",fontSize:"inherit",fontWeight:600}}>{i.nachmieter.vorname} {i.nachmieter.nachname}</button><button onClick={()=>nachmieterZuruecknehmen(r, i.nachmieter, i.nachmieterTyp)} title="Nachmieter zurücknehmen" style={{background:"none",border:"none",color:"#b8846e",cursor:"pointer",fontSize:12,padding:"0 2px",lineHeight:1}}>✕</button></span>:((i.statusKey==="zieht_aus"||i.statusKey==="frei")?<button onClick={()=>navigateTo&&navigateTo("bewerber",{nachmieterFor:r.id})} style={{fontSize:11,padding:"5px 13px",background:"transparent",color:"#3a352d",border:"1px solid #cbbfa8",borderRadius:6,cursor:"pointer",fontWeight:500,whiteSpace:"nowrap"}}>Nachmieter wählen</button>:<span style={{color:"#c8c0b0"}}>-</span>)}</td>
                <td data-label="Ausschreiben">
                  {i.statusKey==="bleibt" ? <span style={{fontSize:11,color:"#8a8174"}}>-</span>
                   : i.nachmieter ? (i.wechselFaellig
                       ? <button onClick={()=>mieterwechsel(r, i.t, i.nachmieter)} title="Passiert auch automatisch in der Nacht nach dem Auszug, sobald der Vertrag des Nachmieters gegengezeichnet ist" style={{fontSize:10.5,padding:"5px 11px",background:"#eef3e6",color:"#3a5230",border:"1px solid #94b878",borderRadius:6,cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}}>→ Wechsel vollziehen</button>
                       : <span style={{fontSize:11,color:"#3a5230",fontWeight:600,whiteSpace:"nowrap"}}>✓ Nachmieter gefunden</span>)
                   : <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <span onClick={()=>updateRoom(r.id,{ausschreibOverride: i.ausgeschrieben?"nein":"ja"})} title={i.ausgeschrieben?"Ausgeschrieben. Tippen zum Ausblenden.":"Nicht ausgeschrieben. Tippen zum Ausschreiben."} style={{position:"relative",display:"inline-block",width:40,height:23,borderRadius:12,background:i.ausgeschrieben?"#5a7c5e":"#d0c8b8",cursor:"pointer",flexShrink:0,transition:"background .15s"}}>
                      <span style={{position:"absolute",top:2,left:i.ausgeschrieben?19:2,width:19,height:19,borderRadius:"50%",background:"#fff",boxShadow:"0 1px 3px rgba(0,0,0,.3)",transition:"left .15s"}}/>
                    </span>
                    <span style={{fontSize:10.5,color:i.ausgeschrieben?"#3a5230":"#8a8174",whiteSpace:"nowrap"}}>{i.ausgeschrieben?"ausgeschrieben":"nicht ausgeschrieben"}</span>
                    {i.override==="auto"&&i.statusKey==="zieht_aus"&&!i.autoAus&&i.ausschreibAb?<span style={{fontSize:9.5,color:"#8a8174",whiteSpace:"nowrap"}}>· ab {fmt(i.ausschreibAb)} automatisch</span>:null}
                  </div>}
                </td>
              </tr>
            );
          })}
        </tbody></table>
      </div>
    );
  };
  const needsReletting = (a)=> rooms.filter(r=>r.aptId===a.id).some(r=>{ const i=roomInfo(r,a); return i.statusKey==="zieht_aus"; });
  const nachApts = wgApts.filter(needsReletting);
  const restApts = wgApts.filter(a=>!needsReletting(a));
  const swipeRef = useRef(null);
  const [swPage, setSwPage] = useState(0);
  const goSw = (i)=>{ setSwPage(i); const el=swipeRef.current; if(el) el.scrollTo({left:i*el.clientWidth,behavior:"smooth"}); };
  const onSwScroll = ()=>{ const el=swipeRef.current; if(el){ const i=Math.round(el.scrollLeft/Math.max(1,el.clientWidth)); if(i!==swPage) setSwPage(i); } };
  const swTab = (i,label)=>(
    <button onClick={()=>goSw(i)} style={{background:"transparent",border:"none",padding:"8px 14px",fontSize:12,fontWeight:swPage===i?600:400,color:swPage===i?"#1a1814":"#8a8174",cursor:"pointer",borderBottom:swPage===i?"2px solid #1a1814":"2px solid transparent",marginBottom:-1,whiteSpace:"nowrap"}}>{label}</button>
  );

  return (
    <div>
      <div className="pt">Nachvermietung</div>
      <div className="ps">Nur Wohnungen, bei denen Zimmer bald nachbesetzt werden müssen. Wische seitwärts für die übrigen Wohnungen. Zimmer werden automatisch {AUTO_TAGE} Tage vor Auszug ausgeschrieben, pro Zimmer übersteuerbar. Der Mieterwechsel passiert automatisch in der Nacht nach dem Auszug, sobald der Vertrag des Nachmieters gegengezeichnet ist.</div>
      <div style={{display:"flex",gap:12,marginTop:12,marginBottom:6,flexWrap:"wrap"}}>
        <div style={{border:"1px solid #e1d8c5",borderRadius:10,padding:"11px 20px",background:"#fefcf7",minWidth:120}}>
          <div style={{fontSize:11,color:"#8a8174",letterSpacing:".04em",marginBottom:4}}>Zimmer total</div>
          <div style={{fontSize:23,fontWeight:600,color:"#1a1814",lineHeight:1}}>{tRooms}</div>
        </div>
        <div style={{border:"1px solid #e8c5be",borderRadius:10,padding:"11px 20px",background:"#fdf5f3",minWidth:120}}>
          <div style={{fontSize:11,color:"#a05a4e",letterSpacing:".04em",marginBottom:4}}>Nachmieter gesucht</div>
          <div style={{fontSize:23,fontWeight:600,color:"#c0392b",lineHeight:1}}>{tGesucht}</div>
        </div>
      </div>
      <div style={{display:"flex",gap:0,margin:"16px 0 12px",borderBottom:"1px solid #e8e3d8",overflowX:"auto"}}>
        {swTab(0, `Nachzuvermieten (${nachApts.length})`)}
        {swTab(1, `Übrige Wohnungen (${restApts.length})`)}
      </div>
      <div ref={swipeRef} onScroll={onSwScroll} style={{display:"flex",overflowX:"auto",scrollSnapType:"x mandatory",WebkitOverflowScrolling:"touch",scrollbarWidth:"none",margin:"0 -4px"}}>
        <div style={{flex:"0 0 100%",minWidth:0,scrollSnapAlign:"start",padding:"0 4px"}}>
          {nachApts.length===0 ? <div style={{padding:"30px 8px",color:"#8a8174",fontSize:13}}>Aktuell muss kein Zimmer nachbesetzt werden. Wische nach links für die übrigen Wohnungen.</div> : nachApts.map(renderApt)}
        </div>
        <div style={{flex:"0 0 100%",minWidth:0,scrollSnapAlign:"start",padding:"0 4px"}}>
          {restApts.length===0 ? <div style={{padding:"30px 8px",color:"#8a8174",fontSize:13}}>Keine weiteren Wohnungen.</div> : restApts.map(renderApt)}
        </div>
      </div>
    </div>
  );
}

function PortfolioWatch(){
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState("neu");
  const [status,setStatus]=useState(null);
  const [inPl,setInPl]=useState({});
  const laden=()=>{
    supabase.from("flatfox_treffer").select("*").order("ff_created",{ascending:false}).limit(300)
      .then(({data})=>{ setItems(data||[]); setLoading(false); })
      .catch(()=>{ setItems([]); setLoading(false); });
  };
  useEffect(()=>{
    laden();
    supabase.from("flatfox_watch_state").select("last_run,homegate_last_run,homegate_error").eq("id",1).single().then(({data})=>setStatus(data)).catch(()=>{});
    const ch=supabase.channel("ff_treffer_page")
      .on("postgres_changes",{event:"*",schema:"public",table:"flatfox_treffer"},laden)
      .subscribe();
    return ()=>{ supabase.removeChannel(ch); };
  },[]);
  const markiere=(id)=>{
    supabase.from("flatfox_treffer").update({gesehen:true}).eq("id",id)
      .then(()=>setItems(xs=>xs.map(x=>x.id===id?{...x,gesehen:true}:x)));
  };
  const inPipeline=async(t)=>{
    if(t.agency_name) supabase.from("org_status").upsert({organisation:t.agency_name,typ:"verwaltung",updated_at:new Date().toISOString()},{onConflict:"organisation",ignoreDuplicates:true}).then(()=>{});
    const markSeen=()=>{ setInPl(m=>({...m,[t.id]:"ok"})); supabase.from("flatfox_treffer").update({gesehen:true}).eq("id",t.id).then(()=>setItems(xs=>xs.map(x=>x.id===t.id?{...x,gesehen:true}:x))); };
    if(t.strasse){ try{ const {data:ex}=await supabase.from("pipeline").select("id,zimmer,preis").ilike("strasse",t.strasse).eq("plz",t.plz); if((ex||[]).some(e=>String(e.zimmer??"")===String(t.zimmer??"")&&String(e.preis??"")===String(t.preis??""))){ markSeen(); return; } }catch(_e){} }
    supabase.from("pipeline").upsert({flatfox_pk:t.flatfox_pk,source:"portfoliowatch",strasse:t.strasse,plz:t.plz,ort:t.ort,zimmer:t.zimmer,preis:t.preis,agency_name:t.agency_name,url:t.url,wert:t.preis,stage:"neu"},{onConflict:"flatfox_pk",ignoreDuplicates:true}).then(({error})=>{ if(error){ setInPl(m=>({...m,[t.id]:"err"})); console.error("pipeline",error); } else { markSeen(); } });
  };
  const neu=items.filter(x=>!x.gesehen);
  const liste=tab==="neu"?neu:items;
  const frei=(t)=>{ const v=t.frei_ab; if(!v) return ""; const m={agr:"nach Vereinbarung",imm:"sofort",per:"per sofort"}; const d=/^\d{4}-\d{2}-\d{2}/.test(String(v))?String(v).slice(0,10).split("-").reverse().join("."):null; return " · frei ab "+(d||m[v]||v); };
  const tabBtn=(id,label)=>(
    <button onClick={()=>setTab(id)} style={{background:tab===id?"var(--ink)":"none",color:tab===id?"var(--surface)":"var(--muted)",border:"1px solid var(--line)",borderRadius:8,padding:"6px 14px",fontSize:12.5,cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>{label}</button>
  );
  return (
    <div style={{padding:"8px",maxWidth:900}}>
      <div style={{marginBottom:16}}>
        <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:24,color:"var(--ink)"}}>Portfolio-Watch</div>
        <div style={{fontSize:13,color:"var(--muted)",marginTop:4}}>Mietangebote im Albert-Grob-Portfolio auf Flatfox und Homegate</div>{status&&<div style={{fontSize:11,color:"#a0968a",marginTop:6}}>Quellen · Flatfox: {status.last_run?String(status.last_run).slice(0,10).split("-").reverse().join("."):"–"} · Homegate: {status.homegate_error?"blockiert":(status.homegate_last_run?String(status.homegate_last_run).slice(0,10).split("-").reverse().join("."):"–")}</div>}
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {tabBtn("neu","Neu"+(neu.length?" ("+neu.length+")":""))}
        {tabBtn("alle","Alle"+(items.length?" ("+items.length+")":""))}
      </div>
      {loading&&<div style={{padding:"30px 8px",color:"#8a8174",fontSize:13}}>Laedt...</div>}
      {!loading&&liste.length===0&&<div style={{padding:"30px 8px",color:"#8a8174",fontSize:13}}>{tab==="neu"?"Keine neuen Angebote.":"Noch keine Angebote."}</div>}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {liste.map(t=>(
          <div key={t.id} style={{border:"1px solid var(--line)",borderRadius:12,padding:"14px 16px",background:"var(--surface)",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,opacity:t.gesehen?0.6:1}}>
            <div style={{flex:1,minWidth:0}}>
              <a href={t.url} target="_blank" rel="noreferrer" style={{fontSize:15,color:"var(--ink)",fontWeight:600,textDecoration:"none"}}>{t.strasse}, {t.plz} {t.ort}</a>
              <div style={{fontSize:12.5,color:"var(--muted)",marginTop:5,lineHeight:1.6}}>
                {t.object_category}{t.zimmer?" · "+t.zimmer+" Zi":""}{t.preis?" · CHF "+t.preis+" inkl. NK":""}{frei(t)}
              </div>
              <div style={{fontSize:11.5,color:"#a0968a",marginTop:3}}>Inserent: {t.agency_name||"unbekannt"}{t.quelle?" · "+(t.quelle==="homegate"?"Homegate":"Flatfox"):""}{t.ff_created?" · gefunden "+String(t.ff_created).slice(0,10).split("-").reverse().join("."):""}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0,alignItems:"flex-end"}}>
              <button onClick={()=>inPipeline(t)} style={{background:"none",border:"1px solid var(--line)",borderRadius:8,padding:"6px 12px",fontSize:12,color:inPl[t.id]==="ok"?"#3a5230":inPl[t.id]==="err"?"#9b4a3e":"var(--muted)",cursor:"pointer",whiteSpace:"nowrap",fontFamily:"'Manrope',sans-serif"}}>{inPl[t.id]==="ok"?"✓ in Pipeline":inPl[t.id]==="err"?"Fehler":"→ Pipeline"}</button>
              {!t.gesehen
                ? <button onClick={()=>markiere(t.id)} style={{background:"none",border:"1px solid var(--line)",borderRadius:8,padding:"6px 12px",fontSize:12,color:"var(--muted)",cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>gesehen</button>
                : <span style={{fontSize:11,color:"#a0968a"}}>gesehen</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarktRadar(){
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [rubrik,setRubrik]=useState("bef");
  const [nurNeu,setNurNeu]=useState(true);
  const [orgStatus,setOrgStatus]=useState({});
  const laden=()=>{
    supabase.from("markt_radar").select("*").order("ff_created",{ascending:false}).limit(500)
      .then(({data})=>{ setItems(data||[]); setLoading(false); }).catch(()=>{ setItems([]); setLoading(false); });
  };
  useEffect(()=>{
    laden();
    supabase.from("org_status").select("organisation,status,referenz_kontakt").then(({data})=>{ const m={}; (data||[]).forEach(rr=>m[(rr.organisation||"").toLowerCase()]={status:rr.status,referenz:rr.referenz_kontakt}); setOrgStatus(m); }).catch(()=>{});
    const ch=supabase.channel("markt_radar_page").on("postgres_changes",{event:"*",schema:"public",table:"markt_radar"},laden).subscribe();
    return ()=>{ supabase.removeChannel(ch); };
  },[]);
  const markiere=(id)=>{ supabase.from("markt_radar").update({gesehen:true}).eq("id",id).then(()=>setItems(xs=>xs.map(x=>x.id===id?{...x,gesehen:true}:x))); };
  const [inPl,setInPl]=useState({});
  const inPipeline=async(t)=>{ if(t.agency_name) supabase.from("org_status").upsert({organisation:t.agency_name,typ:"verwaltung",updated_at:new Date().toISOString()},{onConflict:"organisation",ignoreDuplicates:true}).then(()=>{}); if(t.agency_email) supabase.from("kontakte").upsert({name:t.agency_contact_name,email:t.agency_email,organisation:t.agency_name,org_type:"verwaltung",rolle:"Bewirtschaftung",updated_at:new Date().toISOString()},{onConflict:"email",ignoreDuplicates:true}).then(()=>{}); const markSeen=()=>{ setInPl(m=>({...m,[t.id]:"ok"})); supabase.from("markt_radar").update({gesehen:true}).eq("id",t.id).then(()=>setItems(xs=>xs.map(x=>x.id===t.id?{...x,gesehen:true}:x))); }; if(t.strasse){ try{ const {data:ex}=await supabase.from("pipeline").select("id,zimmer,preis").ilike("strasse",t.strasse).eq("plz",t.plz); if((ex||[]).some(e=>String(e.zimmer??"")===String(t.zimmer??"")&&String(e.preis??"")===String(t.preis??""))){ markSeen(); return; } }catch(_e){} } supabase.from("pipeline").upsert({flatfox_pk:t.flatfox_pk,source:"marktradar",strasse:t.strasse,plz:t.plz,ort:t.ort,zimmer:t.zimmer,preis:t.preis,befristet:t.befristet,agency_name:t.agency_name,contact_name:t.agency_contact_name,contact_email:t.agency_email,url:t.url,wert:t.preis,stage:"neu"},{onConflict:"flatfox_pk",ignoreDuplicates:true}).then(({error})=>{ if(error){ setInPl(m=>({...m,[t.id]:"err"})); console.error("pipeline",error); } else { markSeen(); } }); };
  const bef=items.filter(x=>x.befristet);
  const unbef=items.filter(x=>!x.befristet);
  const base=rubrik==="bef"?bef:unbef;
  const liste=nurNeu?base.filter(x=>!x.gesehen):base;
  const uz=(a)=>a.filter(x=>!x.gesehen).length;
  const osBadge=(name)=>{ const st=(orgStatus[(name||"").toLowerCase()]||{}).status; const map={partner:["bereits Partner","#e8efde","#3a5230"],kein_interesse:["Kein Interesse, nicht kontaktieren","#f6e3df","#a4442e"],gespraech:["in Gespräch","#f2ecdb","#7c6a4e"]}; const c=map[st]; return c?<div style={{marginTop:4}}><span style={{background:c[1],color:c[2],fontSize:10,padding:"2px 8px",borderRadius:8,fontWeight:700}}>{c[0]}</span></div>:null; };
  const frei=(t)=>{ const v=t.frei_ab; if(!v) return ""; const m={agr:"nach Vereinbarung",imm:"sofort",per:"per sofort"}; const d=/^\d{4}-\d{2}-\d{2}/.test(String(v))?String(v).slice(0,10).split("-").reverse().join("."):null; return " · frei ab "+(d||m[v]||v); };
  const mSubject=(t)=>(t.strasse?t.strasse+", ":"Mietwohnung ")+t.plz+" "+(t.ort||"");
  const mBody=(t)=>{
    const adr=(t.strasse?t.strasse+", ":"")+t.plz+" "+(t.ort||"");
    const obj=t.strasse?("an der "+adr):("in "+t.plz+" "+(t.ort||""));
    const vn=(t.agency_contact_name||"").trim();
    const gruss=vn?("Guten Tag "+vn+","):"Guten Tag,";
    const _os=orgStatus[(t.agency_name||"").toLowerCase()]||{};
    if(_os.status==="partner"){ const ref=_os.referenz?(" (unter anderem mit "+_os.referenz+")"):""; return [gruss,"","Ich hoffe, es geht dir gut! 🙂","","Wir sind auf die freie Wohnung "+obj+" aufmerksam geworden und hätten grosses Interesse, diese anzumieten.","","Wir arbeiten bereits mit "+(t.agency_name||"euch")+" zusammen"+ref+" und bieten aktuell mehrere eurer Objekte möbliert an. Wir mieten zu marktüblichen Konditionen an und vermieten möbliert an Studierende und Young Professionals; für euch heisst das ein zuverlässiger Vertragspartner, planbare Mieteinnahmen und kein Leerstand.","","Wäre eine Vermietung an uns auch bei diesem Objekt denkbar? Über eine kurze Rückmeldung freue ich mich.","","Freundliche Grüsse","Daan Theijse","www.dthomes.ch"].join("\n"); }
    const objSatz=t.befristet
      ? "Wir sind auf die freie Wohnung "+obj+" aufmerksam geworden und hätten grosses Interesse daran, diese anzumieten. Da die Wohnung befristet vermietet wird, passt sie ideal zu unserem Konzept."
      : "Wir sind auf die freie Wohnung "+obj+" aufmerksam geworden und hätten grosses Interesse daran, diese anzumieten.";
    const nutzen=t.befristet
      ? "Für dich bedeutet das einen einzigen, zuverlässigen Vertragspartner, planbare Mieteinnahmen und keinen Leerstand. Ausserdem habt ihr die Sicherheit, nach der Befristung direkt mit eurem Projekt zu starten. Den gesamten operativen Aufwand, von der Vermarktung über die Betreuung der Mieter bis hin zur Rückgabe der Wohnung, übernehmen wir vollständig."
      : "Für dich bedeutet das einen einzigen, zuverlässigen Vertragspartner, planbare Mieteinnahmen und keinen Leerstand. Den gesamten operativen Aufwand, von der Vermarktung über die Betreuung der Mieter bis hin zur Rückgabe der Wohnung, übernehmen wir vollständig.";
    return [gruss,"","Ich hoffe, es geht dir gut und das direkte Du ist für dich in Ordnung. 🙂","",objSatz,"","Wir sind D&T Homes aus Zürich und mieten sowohl befristete als auch unbefristete Wohnungen zu marktüblichen Konditionen an. Anschliessend richten wir sie ein und vermieten sie möbliert an Studierende und Young Professionals.","",nutzen,"","Wäre eine Vermietung an uns grundsätzlich denkbar? Gerne stelle ich dir unser Konzept auch persönlich in einem kurzen Gespräch vor.","","Ich freue mich auf deine Rückmeldung.","","Freundliche Grüsse","Daan Theijse","www.dthomes.ch"].join("\n");
  };
  const mailto=(t)=>"mailto:"+(t.agency_email||"")+"?subject="+encodeURIComponent(mSubject(t))+"&body="+encodeURIComponent(mBody(t));
  const tabBtn=(id,label)=>(<button onClick={()=>setRubrik(id)} style={{background:rubrik===id?"var(--ink)":"none",color:rubrik===id?"var(--surface)":"var(--muted)",border:"1px solid var(--line)",borderRadius:8,padding:"6px 14px",fontSize:12.5,cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>{label}</button>);
  return (
    <div style={{padding:"8px",maxWidth:900}}>
      <div style={{marginBottom:16}}>
        <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:24,color:"var(--ink)"}}>Marktradar</div>
        <div style={{fontSize:13,color:"var(--muted)",marginTop:4}}>Unmöblierte Mietobjekte von Verwaltungen auf Flatfox (Zürich Stadt und Ring)</div>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
        {tabBtn("bef","Befristet"+(uz(bef)?" ("+uz(bef)+")":""))}
        {tabBtn("unbef","Unbefristet"+(uz(unbef)?" ("+uz(unbef)+")":""))}
        <label style={{fontSize:12,color:"var(--muted)",marginLeft:8,cursor:"pointer"}}><input type="checkbox" checked={nurNeu} onChange={e=>setNurNeu(e.target.checked)} style={{marginRight:5}}/>nur neue</label>
      </div>
      {rubrik==="unbef"&&<div style={{fontSize:11.5,color:"#a0968a",marginBottom:10}}>Preisgrenze: max. 1000 pro Zimmer (1 bis 1.5 Zi bis 1000, 2 bis 2.5 Zi bis 2000, usw.)</div>}
      {loading&&<div style={{padding:"30px 8px",color:"#8a8174",fontSize:13}}>Laedt...</div>}
      {!loading&&liste.length===0&&<div style={{padding:"30px 8px",color:"#8a8174",fontSize:13}}>Keine Objekte.</div>}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {liste.map(t=>(
          <div key={t.id} style={{border:"1px solid var(--line)",borderRadius:12,padding:"14px 16px",background:"var(--surface)",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,opacity:t.gesehen?0.6:1}}>
            <div style={{flex:1,minWidth:0}}>
              <a href={t.url} target="_blank" rel="noreferrer" style={{fontSize:15,color:"var(--ink)",fontWeight:600,textDecoration:"none"}}>{t.strasse||"Adresse auf Anfrage"}, {t.plz} {t.ort}</a>
              <div style={{fontSize:12.5,color:"var(--muted)",marginTop:5,lineHeight:1.6}}>
                {t.befristet&&<span style={{background:"#eae3d6",color:"#7c6a4e",fontSize:10,padding:"1px 6px",borderRadius:8,marginRight:6}}>befristet</span>}
                {t.object_category}{t.zimmer?" · "+t.zimmer+" Zi":""}{t.flaeche?" · "+t.flaeche+" m²":""}{t.preis?" · CHF "+t.preis+" inkl. NK":""}{frei(t)}
              </div>
              <div style={{fontSize:11.5,color:"#a0968a",marginTop:3}}>Inserent: {t.agency_name||"unbekannt"}{t.agency_contact_name?" · "+t.agency_contact_name:""}{t.agency_email?" · "+t.agency_email:""}{t.ff_created?" · gefunden "+String(t.ff_created).slice(0,10).split("-").reverse().join("."):""}</div>
              {osBadge(t.agency_name)}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0,alignItems:"flex-end"}}>
              <a href={mailto(t)} title={t.agency_email||"Vorbereitete Anfrage öffnen, Name und Adresse ergänzen"} style={{background:"var(--ink)",color:"var(--surface)",border:"1px solid var(--ink)",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer",textDecoration:"none",whiteSpace:"nowrap",fontFamily:"'Manrope',sans-serif"}}>E-Mail</a>
              <button onClick={()=>inPipeline(t)} style={{background:"none",border:"1px solid var(--line)",borderRadius:8,padding:"6px 12px",fontSize:12,color:inPl[t.id]==="ok"?"#5f6b4e":inPl[t.id]==="err"?"#a4442e":"var(--muted)",cursor:"pointer",whiteSpace:"nowrap",fontFamily:"'Manrope',sans-serif"}}>{inPl[t.id]==="ok"?"✓ Pipeline":inPl[t.id]==="err"?"Fehler, nochmal":"→ Pipeline"}</button>
              {!t.gesehen
                ? <button onClick={()=>markiere(t.id)} style={{background:"none",border:"1px solid var(--line)",borderRadius:8,padding:"6px 12px",fontSize:12,color:"var(--muted)",cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>gesehen</button>
                : <span style={{fontSize:11,color:"#a0968a"}}>gesehen</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Pipeline(){
  const STAGES=[["neu","Neu"],["kontaktiert","Kontaktiert"],["antwort","Antwort"],["gewonnen","Zusage"],["verloren","Absage"]];
  const LBL=Object.fromEntries(STAGES);
  const [deals,setDeals]=useState([]);
  const [newDeal,setNewDeal]=useState(null);
  const [loading,setLoading]=useState(true);
  const [stage,setStage]=useState("kontaktiert");
  const [selected,setSelected]=useState(null);
  const [thread,setThread]=useState(null);
  const [openMsg,setOpenMsg]=useState(null);
  const [compose,setCompose]=useState(null);
  const [sendMsg,setSendMsg]=useState("");
  const [scheduled,setScheduled]=useState([]);
  const [openSched,setOpenSched]=useState(null);
  const [q,setQ]=useState("");
  const [filt,setFilt]=useState("all");
  const [editForm,setEditForm]=useState(null);
  const ladenScheduled=()=>supabase.from("scheduled_mails").select("*").eq("status","pending").then(({data})=>setScheduled(data||[]));
  const [sig,setSig]=useState("Freundliche Grüsse\nDaan Theijse\nD&T Homes\nwww.dthomes.ch");
  const [sigEdit,setSigEdit]=useState(false);
  const [orgStatus,setOrgStatus]=useState({});
  const laden=()=>{ supabase.from("pipeline").select("*").order("updated_at",{ascending:false}).then(({data})=>{setDeals(data||[]);setLoading(false);}).catch(()=>{setDeals([]);setLoading(false);}); ladenScheduled(); };
  useEffect(()=>{ laden(); supabase.from("app_settings").select("value").eq("key","mail_signature").then(({data})=>{ if(data&&data[0]&&data[0].value) setSig(data[0].value); }).catch(()=>{}); supabase.from("org_status").select("organisation,status,referenz_kontakt").then(({data})=>{ const m={}; (data||[]).forEach(rr=>m[(rr.organisation||"").toLowerCase()]={status:rr.status,referenz:rr.referenz_kontakt}); setOrgStatus(m); }).catch(()=>{}); const ch=supabase.channel("pipeline_page").on("postgres_changes",{event:"*",schema:"public",table:"pipeline"},laden).subscribe(); return ()=>{supabase.removeChannel(ch);}; },[]);
  useEffect(()=>{ setOpenMsg(null); setEditForm(null); if(!selected){ setThread(null); return; } if(!selected.contact_email){ setThread({messages:[]}); return; } setThread({loading:true}); supabase.functions.invoke("outlook-thread",{body:{email:selected.contact_email}}).then(({data,error})=>{ setThread((error||!data||data.error)?{error:(data&&data.error)||"Fehler"}:{messages:data.messages||[]}); }).catch(()=>setThread({error:"Fehler"})); },[selected&&selected.id]);
  const heute=()=>new Date().toISOString().slice(0,10);
  const patch=(id,f)=>{ supabase.from("pipeline").update({...f,updated_at:new Date().toISOString()}).eq("id",id).then(()=>{ setDeals(ds=>ds.map(d=>d.id===id?{...d,...f}:d)); setSelected(s=>s&&s.id===id?{...s,...f}:s); }); };
  const setStageFn=(d,v)=>{
    patch(d.id, v==="kontaktiert"&&!d.kontaktiert_am?{stage:v,kontaktiert_am:heute()}:{stage:v});
    if(v==="gewonnen"){
      if(d.contact_email){ const _em=(d.contact_email||"").trim(); supabase.from("kontakte").select("id").ilike("email",_em).then(({data})=>{ if(data&&data.length){ supabase.from("kontakte").update({is_partner:true,updated_at:new Date().toISOString()}).eq("id",data[0].id).then(()=>{}); } else { supabase.from("kontakte").insert({name:d.contact_name||null,email:_em,organisation:d.agency_name||null,verwaltung:d.agency_name||null,org_type:"Verwaltung",rolle:"Ansprechperson Bewirtschaftung",is_partner:true,notizen:"Automatisch aus Pipeline-Zusage übernommen"}).then(()=>{}); } }); }
      if(d.agency_name){ supabase.from("org_status").upsert({organisation:d.agency_name,status:"partner",updated_at:new Date().toISOString()},{onConflict:"organisation"}).then(()=>{}); } if(d.agency_name) supabase.from("partners").select("id,kontakte").eq("name",d.agency_name).then(({data})=>{ const entry={name:d.contact_name||"",email:(d.contact_email||"").toLowerCase(),telefon:"",funktion:"Bewirtschaftung"}; if(data&&data.length){ const pt=data[0]; const arr=Array.isArray(pt.kontakte)?pt.kontakte:[]; if(d.contact_email&&!arr.some(x=>((x.email||"").toLowerCase()===(d.contact_email||"").toLowerCase()))) supabase.from("partners").update({kontakte:[...arr,entry],updated_at:new Date().toISOString()}).eq("id",pt.id).then(()=>{}); } else { supabase.from("partners").insert({id:"P"+Date.now(),name:d.agency_name,typ:"Verwaltung",email:(d.contact_email||""),kontaktperson:d.contact_name||"",kontakte:d.contact_email?[entry]:[]}).then(()=>{}); } });
      if(!d.won_apartment_id){ supabase.from("apartments").select("id").then(({data})=>{ const nums=(data||[]).map(z=>parseInt(String(z.id).replace(/\D/g,""),10)).filter(x=>!isNaN(x)); const nid="A"+((nums.length?Math.max(...nums):0)+1); supabase.from("apartments").insert({id:nid,adresse:d.strasse||null,plz:(d.plz!=null?String(d.plz):null),ort:d.ort||null,type:"WG",zimmer:(d.zimmer!=null?String(d.zimmer):null),miete:(d.preis?Number(d.preis):null),verwaltung:d.agency_name||null,pipeline:true,extra:"Aus Pipeline-Zusage · Kontakt: "+(d.contact_name||"")+(d.contact_email?(" <"+d.contact_email+">"):"")}).then(({error})=>{ if(!error){ supabase.from("pipeline").update({won_apartment_id:nid}).eq("id",d.id).then(()=>{}); setDeals(ds=>ds.map(x=>x.id===d.id?{...x,won_apartment_id:nid}:x)); setSelected(s=>s?{...s,won_apartment_id:nid}:s); alert("🎉 Zusage! Wohnung "+nid+" wurde als Pipeline-Wohnung angelegt. Bitte im Bereich Wohnungen Typ, Zimmer, Mietbeginn und Details ergaenzen."); } else { alert("Wohnung konnte nicht angelegt werden: "+error.message); } }); }); }
    }
  };
  const entfernen=(id)=>{ if(!confirm("Aus der Pipeline entfernen?"))return; supabase.from("pipeline").delete().eq("id",id).then(()=>{setDeals(ds=>ds.filter(d=>d.id!==id)); setSelected(null);}); };
  const saveNewDeal=()=>{ const nd=newDeal; if(!nd) return; if(!(nd.agency_name||nd.strasse||nd.contact_name)){ alert("Bitte mindestens Verwaltung, Adresse oder Ansprechperson angeben."); return; } const rec={ flatfox_pk:null, source:"manual", agency_name:nd.agency_name||null, contact_name:nd.contact_name||null, contact_email:nd.contact_email||null, strasse:nd.strasse||null, plz:nd.plz||null, ort:nd.ort||null, zimmer:nd.zimmer?Number(nd.zimmer):null, preis:nd.preis?Number(nd.preis):null, befristet:!!nd.befristet, url:nd.url||null, stage:nd.stage||"neu", notizen:nd.notizen||null }; supabase.from("pipeline").insert(rec).select().then(({data,error})=>{ if(error){ toast("Anlegen fehlgeschlagen", "error"); return; } setNewDeal(null); if(data&&data[0]) setDeals(ds=>[data[0],...ds]); else laden(); }); };
  const patchAbsage=(d,g)=>{ patch(d.id,{verlust_grund:g}); if(d.agency_name && g==="Kein Interesse am Modell") supabase.from("org_status").upsert({organisation:d.agency_name,status:"kein_interesse",grund:g||null,updated_at:new Date().toISOString()},{onConflict:"organisation"}).then(()=>{}); };
  const defaultTpl=(d)=>{ const _os=orgStatus[(d.agency_name||"").toLowerCase()]||{}; return _os.status==="partner"?"warm":"kalt"; };
  const _htmlEsc=(x)=>String(x||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const SIG_HTML='<div style="font-family:Aptos,Calibri,Helvetica,sans-serif;font-size:12pt;color:#000000"><br><div>Freundliche Gr&uuml;sse</div><br><div>Daan Theijse</div><div><a href="http://www.dthomes.ch" style="color:#000000">www.dthomes.ch</a></div><div><img src="https://admin.dthomes.ch/dt-sig-logo.png" width="104" height="104" style="width:104px;height:104px" alt="D&amp;T Homes"></div></div>';
  const buildHtml=(text)=>'<div style="font-family:Aptos,Calibri,Helvetica,sans-serif;font-size:12pt;color:#000000">'+_htmlEsc(text).replace(/\n/g,"<br>")+'</div>'+SIG_HTML;
  const openCompose=(d)=>{ setSendMsg(""); const tpl=defaultTpl(d); const em=(d.contact_email||"").toLowerCase(); const sibs=em?deals.filter(x=>(x.contact_email||"").toLowerCase()===em):[d]; const bundle=sibs.length>1; setCompose({to:d.contact_email||"",subject:bundle?("Mehrere Mietobjekte · "+sibs.length+" Wohnungen"):mSubject(d),body:bundle?mBodyBundle(sibs,tpl):mBody(d,tpl),tpl,attach:tpl==="kalt",_t:d,_sibs:sibs,bundle,catchup:true}); };
  const toggleBundle=(on)=>{ setCompose(c=>{ if(!c) return c; const sibs=c._sibs||[c._t]; return {...c,bundle:on,body:on?mBodyBundle(sibs,c.tpl):mBody(c._t,c.tpl),subject:on?("Mehrere Mietobjekte · "+sibs.length+" Wohnungen"):mSubject(c._t)}; }); };
  const [drafting,setDrafting]=useState(false);
  const draftReply=(dd)=>{ setDrafting(true); supabase.functions.invoke("draft-reply",{body:{deal_id:dd.id}}).then(({data,error})=>{ setDrafting(false); if(error||!data||data.error){ alert((data&&data.error==="not_configured")?"Die KI-Antwort ist noch nicht aktiv: Anthropic-API-Schlüssel fehlt.":("Entwurf fehlgeschlagen"+(data&&data.error?(": "+(typeof data.error==="string"?data.error:JSON.stringify(data.error))):""))); return; } setSendMsg(""); setCompose({to:dd.contact_email||"",subject:mSubject(dd),body:data.draft||"",tpl:"warm",attach:false,_t:dd,_sibs:[dd],bundle:false,catchup:false}); }); };
  const setTpl=(tpl)=>{ setCompose(c=>{ if(!c) return c; const body=c.bundle?mBodyBundle(c._sibs||[c._t],tpl):mBody(c._t||{},tpl); return {...c,tpl,body,attach:tpl==="kalt"}; }); };
  const mCatchup=(t,bundle)=>{ const vn=(t.contact_name||"").trim(); const gruss=vn?("Guten Tag "+vn+","):"Guten Tag,"; const adr=(t.strasse?t.strasse+", ":"")+(t.plz||"")+" "+(t.ort||""); const obj=bundle?"zu meinen angefragten Wohnungen":(t.strasse?("zur Wohnung "+adr.trim()):"zu meiner Anfrage"); return [gruss,"","ich wollte kurz nachfragen, ob meine Nachricht "+obj+" bei dir angekommen ist. 🙂","","Falls die Wohnung noch verfügbar ist, hätten wir weiterhin grosses Interesse, sie anzumieten. Über eine kurze Rückmeldung freue ich mich sehr.","","Ich freue mich, von dir zu hören."].join("\n"); };
  const createFollowup=(baseMs)=>{ if(!compose||!compose.to) return; const t=compose._t||{}; const txt=mCatchup(t, compose.bundle); const _gs=new Date(baseMs).toLocaleString("de-CH",{weekday:"long",day:"2-digit",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}); const _an=(t.contact_name||compose.to); const fuBody=txt+"\n\n________________________________\nVon: Daan Theijse <daan.theijse@dthomes.ch>\nGesendet: "+_gs+"\nAn: "+_an+" <"+compose.to+">\nBetreff: "+(compose.subject||"")+"\n\n"+(compose.body||""); const fuHtml=buildHtml(txt)+'<div style="font-family:Aptos,Calibri,sans-serif;font-size:11pt;color:#000000;border-top:1px solid #ccc;padding-top:10px;margin-top:14px"><b>Von:</b> Daan Theijse &lt;daan.theijse@dthomes.ch&gt;<br><b>Gesendet:</b> '+_gs+'<br><b>An:</b> '+_htmlEsc(_an)+' &lt;'+_htmlEsc(compose.to)+'&gt;<br><b>Betreff:</b> '+_htmlEsc(compose.subject||"")+'</div>'+buildHtml(compose.body); const send_at=new Date(baseMs+7*86400000).toISOString(); supabase.from("scheduled_mails").insert({deal_id:(selected&&selected.id)||null,to_addr:compose.to,subject:compose.subject,body:fuBody,html:fuHtml,attachments:null,send_at,status:"pending",is_followup:true,reply_check_after:new Date(baseMs).toISOString()}).then(()=>ladenScheduled()); };
  const doSend=()=>{ if(!compose)return; const _html=buildHtml(compose.body); const _att=compose.attach?[{name:"D&T Homes Pitch.pdf",url:"https://admin.dthomes.ch/DT_Homes_Pitch.pdf",contentType:"application/pdf"}]:null; if(compose.schedAt){ const when=new Date(compose.schedAt); if(isNaN(when.getTime())||when<=new Date()){ setSendMsg("Sendezeit muss in der Zukunft liegen"); return; } setSendMsg("plane ..."); supabase.from("scheduled_mails").insert({deal_id:(selected&&selected.id)||null,to_addr:compose.to,subject:compose.subject,body:compose.body,html:_html,attachments:_att,send_at:when.toISOString(),status:"pending"}).then(({error})=>{ if(error){ setSendMsg("Planen fehlgeschlagen: "+error.message); } else { setSendMsg("Geplant für "+when.toLocaleString("de-CH",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})); ladenScheduled(); if(compose.catchup) createFollowup(when.getTime()); if(selected&&selected.stage==="neu") setStageFn(selected,"kontaktiert"); setTimeout(()=>{setCompose(null);setSendMsg("");},1800); } }); return; } setSendMsg("sende ..."); const _payload={to:compose.to,subject:compose.subject,body:compose.body,html:_html}; if(_att) _payload.attachments=_att; supabase.functions.invoke("outlook-send",{body:_payload}).then(({data,error})=>{ if(error||!data||data.error){ setSendMsg((data&&data.error==="not_configured")?"Outlook noch nicht verbunden":"Senden fehlgeschlagen"); } else { setSendMsg("Gesendet"); if(selected){ supabase.from("pipeline").update({reply_pending:false}).eq("id",selected.id); setDeals(ds=>ds.map(x=>x.id===selected.id?{...x,reply_pending:false}:x)); } if(compose.catchup) createFollowup(Date.now()); if(selected&&selected.stage==="neu") setStageFn(selected,"kontaktiert"); setCompose(null); if(selected&&selected.contact_email===compose.to){ setThread({loading:true}); supabase.functions.invoke("outlook-thread",{body:{email:compose.to}}).then(({data})=>setThread(data&&!data.error?{messages:data.messages||[]}:{error:"x"})); } } }).catch(()=>setSendMsg("Senden fehlgeschlagen")); };
  const saveSig=()=>{ supabase.from("app_settings").upsert({key:"mail_signature",value:sig,updated_at:new Date().toISOString()},{onConflict:"key"}).then(()=>setSigEdit(false)); };
  const mSubject=(t)=>(t.strasse?t.strasse+", ":"Mietwohnung ")+t.plz+" "+(t.ort||"");
  const mBody=(t,tpl)=>{
    const adr=(t.strasse?t.strasse+", ":"")+t.plz+" "+(t.ort||"");
    const obj=t.strasse?("an der "+adr):("in "+t.plz+" "+(t.ort||""));
    const vn=(t.contact_name||"").trim();
    const gruss=vn?("Guten Tag "+vn+","):"Guten Tag,";
    const _os=orgStatus[(t.agency_name||"").toLowerCase()]||{};
    const mode = tpl || (_os.status==="partner"?"warm":"kalt");
    if(mode==="warm"){ const ref=_os.referenz?(" (unter anderem mit "+_os.referenz+")"):""; return [gruss,"","Ich hoffe, es geht dir gut! 🙂","","Wir sind auf die freie Wohnung "+obj+" aufmerksam geworden und hätten grosses Interesse, diese anzumieten.","","Wir arbeiten bereits mit "+(t.agency_name||"euch")+" zusammen"+ref+" und bieten aktuell mehrere eurer Objekte möbliert an. Wir mieten zu marktüblichen Konditionen an und vermieten möbliert an Studierende und Young Professionals; für euch heisst das ein zuverlässiger Vertragspartner, planbare Mieteinnahmen und kein Leerstand.","","Wäre eine Vermietung an uns auch bei diesem Objekt denkbar? Über eine kurze Rückmeldung freue ich mich."].join("\n"); }
    const objSatz=t.befristet? "Wir sind auf die freie Wohnung "+obj+" aufmerksam geworden und hätten grosses Interesse daran, diese anzumieten. Da die Wohnung befristet vermietet wird, passt sie ideal zu unserem Konzept." : "Wir sind auf die freie Wohnung "+obj+" aufmerksam geworden und hätten grosses Interesse daran, diese anzumieten.";
    const nutzen=t.befristet? "Für dich bedeutet das einen einzigen, zuverlässigen Vertragspartner, planbare Mieteinnahmen und keinen Leerstand. Ausserdem habt ihr die Sicherheit, nach der Befristung direkt mit eurem Projekt zu starten. Den gesamten operativen Aufwand, von der Vermarktung über die Betreuung der Mieter bis hin zur Rückgabe der Wohnung, übernehmen wir vollständig." : "Für dich bedeutet das einen einzigen, zuverlässigen Vertragspartner, planbare Mieteinnahmen und keinen Leerstand. Den gesamten operativen Aufwand, von der Vermarktung über die Betreuung der Mieter bis hin zur Rückgabe der Wohnung, übernehmen wir vollständig.";
    return [gruss,"","Ich hoffe, es geht dir gut und das direkte Du ist für dich in Ordnung. 🙂","",objSatz,"","Wir sind D&T Homes aus Zürich und mieten sowohl befristete als auch unbefristete Wohnungen zu marktüblichen Konditionen an. Anschliessend richten wir sie ein und vermieten sie möbliert an Studierende und Young Professionals.","",nutzen,"","Wäre eine Vermietung an uns grundsätzlich denkbar? Gerne stelle ich dir unser Konzept auch persönlich in einem kurzen Gespräch vor. Anbei findest du unser kurzes Pitch-Deck mit den wichtigsten Infos.","","Ich freue mich auf deine Rückmeldung."].join("\n");
  };
  const mBodyBundle=(list,tpl)=>{
    const t=list[0]||{};
    const vn=(t.contact_name||"").trim();
    const gruss=vn?("Guten Tag "+vn+","):"Guten Tag,";
    const _os=orgStatus[(t.agency_name||"").toLowerCase()]||{};
    const mode=tpl||(_os.status==="partner"?"warm":"kalt");
    const objList=list.map(o=>{const ad=(o.strasse?o.strasse+", ":"")+(o.plz||"")+" "+(o.ort||"");return "- "+ad.trim()+(o.zimmer?(" ("+o.zimmer+" Zimmer)"):"")+(o.preis?(", CHF "+o.preis):"");}).join("\n");
    if(mode==="warm"){ const ref=_os.referenz?(" (unter anderem mit "+_os.referenz+")"):""; return [gruss,"","Ich hoffe, es geht dir gut! 🙂","","Wir sind auf folgende freie Wohnungen aufmerksam geworden und hätten grosses Interesse, diese anzumieten:","",objList,"","Wir arbeiten bereits mit "+(t.agency_name||"euch")+" zusammen"+ref+" und bieten aktuell mehrere eurer Objekte möbliert an. Wir mieten zu marktüblichen Konditionen an und vermieten möbliert an Studierende und Young Professionals; für euch heisst das ein zuverlässiger Vertragspartner, planbare Mieteinnahmen und kein Leerstand.","","Wäre eine Vermietung an uns bei einem oder mehreren dieser Objekte denkbar? Über eine kurze Rückmeldung freue ich mich."].join("\n"); }
    return [gruss,"","Ich hoffe, es geht dir gut und das direkte Du ist für dich in Ordnung. 🙂","","Wir sind auf folgende freie Wohnungen aufmerksam geworden und hätten grosses Interesse, diese anzumieten:","",objList,"","Wir sind D&T Homes aus Zürich und mieten sowohl befristete als auch unbefristete Wohnungen zu marktüblichen Konditionen an. Anschliessend richten wir sie ein und vermieten sie möbliert an Studierende und Young Professionals.","","Für dich bedeutet das einen einzigen, zuverlässigen Vertragspartner, planbare Mieteinnahmen und keinen Leerstand. Den gesamten operativen Aufwand, von der Vermarktung über die Betreuung der Mieter bis zur Rückgabe, übernehmen wir vollständig.","","Wäre eine Vermietung an uns bei einem oder mehreren dieser Objekte grundsätzlich denkbar? Gerne stelle ich dir unser Konzept auch persönlich vor. Anbei findest du unser kurzes Pitch-Deck mit den wichtigsten Infos.","","Ich freue mich auf deine Rückmeldung."].join("\n");
  };
  const mailto=(t)=>"mailto:"+(t.contact_email||"")+"?subject="+encodeURIComponent(mSubject(t))+"&body="+encodeURIComponent(mBody(t)+"\n\n"+sig);
  const fmt=(d)=>d?String(d).slice(0,10).split("-").reverse().join("."):"";
  const inpS={border:"1px solid var(--line)",borderRadius:8,padding:"6px 8px",fontSize:12,fontFamily:"'Manrope',sans-serif",background:"var(--surface)",color:"var(--ink)",boxSizing:"border-box",width:"100%"};
  const heuteISO=()=>new Date().toISOString().slice(0,10);
  const dTage=(iso)=>iso?Math.floor((Date.now()-new Date(iso).getTime())/86400000):null;
  const dueTag=(w)=>{ if(!w)return null; const t=heuteISO(); const c= w<t?["überfällig","#f6e3df","#a4442e"]: w===t?["heute fällig","#f2ecdb","#8a6d1e"]:["Wiedervorlage "+fmt(w),"#eef1f6","#3a4a63"]; return <span style={{background:c[1],color:c[2],fontSize:10,padding:"1px 7px",borderRadius:8,fontWeight:600}}>{c[0]}</span>; };
  const cardMeta=(x)=>{ const aktiv=!["gewonnen","verloren"].includes(x.stage); const idle=aktiv?dTage(x.updated_at):null; if(!x.naechster_schritt&&!(idle!=null&&idle>=14))return null; return (<div style={{marginTop:5,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>{x.naechster_schritt&&<span style={{fontSize:11.5,color:"var(--muted)"}}>{x.naechster_schritt}</span>}{aktiv&&idle!=null&&idle>=14&&<span style={{fontSize:10,color:"#b08968"}}>seit {idle} Tagen ruhig</span>}</div>); };
  const cnt=(s)=>deals.filter(d=>d.stage===s).length;
  const liste=deals.filter(d=>d.stage===stage);
  const NDI={border:"1px solid var(--line)",borderRadius:8,padding:"7px 9px",fontSize:12.5,fontFamily:"'Manrope',sans-serif",background:"var(--surface)",color:"var(--ink)",width:"100%",boxSizing:"border-box"};
  const LBL2={fontSize:10,color:"var(--muted)",fontWeight:700,letterSpacing:"0.4px",textTransform:"uppercase",display:"block",marginBottom:3};
  const ndField=(label,key,span)=>(<div style={span?{gridColumn:span}:{}}><label style={LBL2}>{label}</label><input value={(newDeal&&newDeal[key])||""} onChange={e=>setNewDeal({...newDeal,[key]:e.target.value})} style={NDI}/></div>);
  const _q=(q||"").toLowerCase().trim();
  const visibleDeals=deals.filter(z=>{ if(filt==="reply"&&!z.reply_pending) return false; if(filt==="scheduled"&&!scheduled.some(s=>s.deal_id===z.id)) return false; if(!_q) return true; return [z.strasse,z.ort,z.plz,z.agency_name,z.contact_name,z.contact_email,z.notizen].filter(Boolean).some(v=>String(v).toLowerCase().includes(_q)); });
  const saveEdit=()=>{ if(!editForm) return; const f=editForm; const upd={agency_name:f.agency_name||null,contact_name:f.contact_name||null,contact_email:f.contact_email||null,strasse:f.strasse||null,plz:(f.plz?(Number(f.plz)||null):null),ort:f.ort||null,zimmer:(f.zimmer?Number(f.zimmer):null),preis:(f.preis?Number(f.preis):null),url:f.url||null,befristet:!!f.befristet,notizen:f.notizen||null}; supabase.from("pipeline").update(upd).eq("id",f.id).then(({error})=>{ if(error){toast("Speichern fehlgeschlagen", "error");return;} setDeals(ds=>ds.map(x=>x.id===f.id?{...x,...upd}:x)); setSelected(s=>s?{...s,...upd}:s); setEditForm(null); }); };
  const d=selected;
  return (
    <div style={{padding:"8px",maxWidth:1300}}>
      <div style={{marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
        <div>
          <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:24,color:"var(--ink)"}}>Pipeline</div>
          <div style={{fontSize:13,color:"var(--muted)",marginTop:4}}>Kontaktierte Objekte, Status und Mailverlauf. Klicke einen Deal für Details.</div>
        </div>
        <button onClick={()=>setNewDeal({stage:"neu"})} style={{background:"var(--ink)",color:"var(--surface)",border:"1px solid var(--ink)",borderRadius:8,padding:"8px 14px",fontSize:13,cursor:"pointer",fontFamily:"'Manrope',sans-serif",whiteSpace:"nowrap"}}>+ Neuer Deal</button>
      </div>

      <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:12,fontSize:12,color:"var(--muted)"}}>
        <span>Offen: <b style={{color:"var(--ink)"}}>{deals.filter(z=>!["gewonnen","verloren"].includes(z.stage)).length}</b></span>
      </div>
      {newDeal&&(
        <div className="ov-x" onClick={()=>setNewDeal(null)} style={{position:"fixed",inset:0,background:"rgba(26,24,20,.45)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,zIndex:2000}}>
          <div className="modal-x" onClick={e=>e.stopPropagation()} style={{background:"var(--bg)",borderRadius:14,maxWidth:560,width:"100%",maxHeight:"92vh",overflow:"auto",padding:"18px",boxShadow:"0 12px 40px rgba(0,0,0,0.18)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:18,color:"var(--ink)"}}>Neuer Deal</div>
              <div onClick={()=>setNewDeal(null)} style={{cursor:"pointer",fontSize:20,color:"var(--muted)"}}>×</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
              {ndField("Verwaltung","agency_name","1 / -1")}
              {ndField("Ansprechperson","contact_name")}
              {ndField("E-Mail","contact_email")}
              {ndField("Adresse","strasse","1 / -1")}
              {ndField("PLZ","plz")}
              {ndField("Ort","ort")}
              {ndField("Zimmer","zimmer")}
              {ndField("Preis (CHF)","preis")}
              {ndField("Link (URL)","url","1 / -1")}
              <div style={{gridColumn:"1 / -1"}}><label style={LBL2}>Phase</label><select value={newDeal.stage||"neu"} onChange={e=>setNewDeal({...newDeal,stage:e.target.value})} style={NDI}>{STAGES.map(([v,l])=>(<option key={v} value={v}>{l}</option>))}</select></div>
              <label style={{gridColumn:"1 / -1",display:"flex",alignItems:"center",gap:8,fontSize:12.5,color:"var(--ink)"}}><input type="checkbox" checked={!!newDeal.befristet} onChange={e=>setNewDeal({...newDeal,befristet:e.target.checked})}/> befristet</label>
              <div style={{gridColumn:"1 / -1"}}><label style={LBL2}>Notizen</label><textarea value={newDeal.notizen||""} onChange={e=>setNewDeal({...newDeal,notizen:e.target.value})} style={{...NDI,minHeight:44,resize:"vertical"}}/></div>
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:14}}>
              <button onClick={()=>setNewDeal(null)} style={{background:"#f0ebe1",color:"#4a4439",border:"1px solid var(--line)",borderRadius:8,padding:"7px 14px",fontSize:12.5,cursor:"pointer"}}>Abbrechen</button>
              <button onClick={saveNewDeal} style={{background:"var(--ink)",color:"var(--surface)",border:"1px solid var(--ink)",borderRadius:8,padding:"7px 16px",fontSize:12.5,cursor:"pointer"}}>Deal anlegen</button>
            </div>
          </div>
        </div>
      )}
      {loading&&<div style={{padding:"30px 8px",color:"#8a8174",fontSize:13}}>Laedt...</div>}
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:14}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Suche: Adresse, Verwaltung, Person, E-Mail …" style={{flex:1,minWidth:200,border:"1px solid var(--line)",borderRadius:8,padding:"8px 12px",fontSize:13,fontFamily:"'Manrope',sans-serif",background:"var(--surface)",color:"var(--ink)"}} />
        {[["all","Alle"],["reply","💬 Antwort offen"],["scheduled","📅 Geplant"]].map(([v,l])=>(<button key={v} onClick={()=>setFilt(v)} style={{background:filt===v?"var(--ink)":"var(--surface)",color:filt===v?"var(--surface)":"var(--muted)",border:"1px solid var(--line)",borderRadius:8,padding:"7px 11px",fontSize:12,cursor:"pointer",fontFamily:"'Manrope',sans-serif",whiteSpace:"nowrap"}}>{l}</button>))}
      </div>
      <div style={{display:"flex",gap:12,overflowX:"auto",paddingBottom:8}}>
        {STAGES.map(([sid,slbl],si)=>{ const col=visibleDeals.filter(z=>z.stage===sid); const wsum=col.reduce((sm,z)=>sm+(Number(z.wert)||0),0); return (
          <div key={sid} style={{minWidth:232,width:232,flexShrink:0,background:"#f3efe6",borderRadius:12,padding:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"3px 6px 8px"}}>
              <span style={{fontSize:12.5,fontWeight:700,color:"var(--ink)"}}>{slbl}</span>
              <span style={{fontSize:10.5,color:"var(--muted)"}}>{col.length}</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {col.map(x=>(
                <div key={x.id} style={{background:"var(--surface)",border:"1px solid var(--line)",borderRadius:10,padding:"10px 11px"}}>
                  <div onClick={()=>setSelected(x)} style={{cursor:"pointer"}}>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--ink)",lineHeight:1.35}}>{x.strasse||"Adresse"}, {x.ort}</div>
                    <div style={{fontSize:11,color:"#a0968a",marginTop:3}}>{x.agency_name||""}{x.contact_name?" · "+x.contact_name:""}</div>
                    {scheduled.some(s=>s.deal_id===x.id)&&<div style={{fontSize:10.5,color:"#3a5230",marginTop:3,fontWeight:600}}>📅 Mail geplant</div>}
                    {x.reply_pending&&<div style={{fontSize:10.5,color:"#b5651d",marginTop:3,fontWeight:700}}>💬 Antwort offen</div>}
                    
                    {cardMeta(x)}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
                    <button onClick={()=>{ if(si>0) setStageFn(x,STAGES[si-1][0]); }} disabled={si===0} style={{background:"none",border:"1px solid var(--line)",borderRadius:6,padding:"1px 8px",fontSize:11,color:"var(--muted)",cursor:si===0?"default":"pointer",opacity:si===0?0.3:1}}>◀</button>
                    <button onClick={()=>{ if(si<STAGES.length-1) setStageFn(x,STAGES[si+1][0]); }} disabled={si===STAGES.length-1} style={{background:"none",border:"1px solid var(--line)",borderRadius:6,padding:"1px 8px",fontSize:11,color:"var(--muted)",cursor:si===STAGES.length-1?"default":"pointer",opacity:si===STAGES.length-1?0.3:1}}>▶</button>
                  </div>
                </div>
              ))}
              {col.length===0&&<div style={{fontSize:11,color:"#b9b0a2",padding:"6px"}}>leer</div>}
            </div>
          </div>
        ); })}
      </div>
      {d&&(
        <div className="ov-x" onClick={()=>setSelected(null)} style={{position:"fixed",inset:0,background:"rgba(40,36,30,0.45)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"24px 12px",zIndex:1000,overflow:"auto"}}>
          <div className="modal-x" onClick={e=>e.stopPropagation()} style={{background:"var(--surface)",border:"1px solid var(--line)",borderRadius:14,maxWidth:560,width:"100%",padding:"20px",boxShadow:"0 12px 40px rgba(0,0,0,0.18)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
              <div style={{minWidth:0}}>
                <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:19,color:"var(--ink)"}}>{d.strasse||"Adresse"}, {d.plz} {d.ort}</div>
                <div style={{fontSize:12.5,color:"var(--muted)",marginTop:2}}>{d.zimmer?d.zimmer+" Zi":""}{d.befristet?((d.zimmer?" · ":"")+"befristet"):""}</div>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                {!editForm&&<button onClick={()=>setEditForm({...d})} style={{background:"none",border:"1px solid var(--line)",borderRadius:8,padding:"4px 10px",fontSize:11.5,color:"var(--muted)",cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>✎ Bearbeiten</button>}
                <button onClick={()=>setSelected(null)} style={{background:"none",border:"none",fontSize:22,color:"var(--muted)",cursor:"pointer",lineHeight:1}}>×</button>
              </div>
            </div>
            <div style={{display:"flex",gap:2,margin:"14px 0 4px"}}>
              {STAGES.map(([sid,slbl],i)=>{ const idx=STAGES.findIndex(z=>z[0]===d.stage); const cur=i===idx; const passed=i<idx; const bg=cur?(sid==="gewonnen"?"#3a5230":sid==="verloren"?"#a4442e":"var(--ink)"):passed?"#d8cfbe":"#ece5d8"; const col=cur?"#fff":"#8a7c66"; return <button key={sid} onClick={()=>setStageFn(d,sid)} title={slbl} style={{flex:1,minWidth:0,border:"none",background:bg,color:col,fontSize:10,fontWeight:cur?700:500,padding:"7px 2px",cursor:"pointer",clipPath:"polygon(0 0, calc(100% - 7px) 0, 100% 50%, calc(100% - 7px) 100%, 0 100%, 7px 50%)",marginLeft:i===0?0:-7,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{slbl}</button>; })}
            </div>
            <div style={{fontSize:12.5,color:"var(--muted)",marginTop:6,lineHeight:1.7}}>
              {d.befristet&&<span style={{background:"#eae3d6",color:"#7c6a4e",fontSize:10,padding:"1px 6px",borderRadius:8,marginRight:6}}>befristet</span>}{d.zimmer?d.zimmer+" Zi":""}{d.preis?" · CHF "+d.preis+" inkl. NK":""}
              {d.url&&<> · <a href={d.url} target="_blank" rel="noreferrer" style={{color:"#3a5230"}}>↗ Inserat</a></>}
            </div>
            {editForm ? (
              <div style={{marginTop:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,background:"#f6f2ea",border:"1px solid var(--line)",borderRadius:10,padding:"12px"}}>
                <div style={{gridColumn:"1 / -1"}}><label style={LBL2}>Verwaltung</label><input value={editForm.agency_name||""} onChange={e=>setEditForm({...editForm,agency_name:e.target.value})} style={NDI}/></div>
                <div><label style={LBL2}>Ansprechperson</label><input value={editForm.contact_name||""} onChange={e=>setEditForm({...editForm,contact_name:e.target.value})} style={NDI}/></div>
                <div><label style={LBL2}>E-Mail</label><input value={editForm.contact_email||""} onChange={e=>setEditForm({...editForm,contact_email:e.target.value})} style={NDI}/></div>
                <div style={{gridColumn:"1 / -1"}}><label style={LBL2}>Adresse</label><input value={editForm.strasse||""} onChange={e=>setEditForm({...editForm,strasse:e.target.value})} style={NDI}/></div>
                <div><label style={LBL2}>PLZ</label><input value={editForm.plz||""} onChange={e=>setEditForm({...editForm,plz:e.target.value})} style={NDI}/></div>
                <div><label style={LBL2}>Ort</label><input value={editForm.ort||""} onChange={e=>setEditForm({...editForm,ort:e.target.value})} style={NDI}/></div>
                <div><label style={LBL2}>Zimmer</label><input value={editForm.zimmer||""} onChange={e=>setEditForm({...editForm,zimmer:e.target.value})} style={NDI}/></div>
                <div><label style={LBL2}>Preis (CHF)</label><input value={editForm.preis||""} onChange={e=>setEditForm({...editForm,preis:e.target.value})} style={NDI}/></div>
                <div style={{gridColumn:"1 / -1"}}><label style={LBL2}>Link</label><input value={editForm.url||""} onChange={e=>setEditForm({...editForm,url:e.target.value})} style={NDI}/></div>
                <label style={{gridColumn:"1 / -1",display:"flex",alignItems:"center",gap:8,fontSize:12.5,color:"var(--ink)"}}><input type="checkbox" checked={!!editForm.befristet} onChange={e=>setEditForm({...editForm,befristet:e.target.checked})}/> befristet</label>
                <div style={{gridColumn:"1 / -1"}}><label style={LBL2}>Notizen</label><textarea value={editForm.notizen||""} onChange={e=>setEditForm({...editForm,notizen:e.target.value})} style={{...NDI,minHeight:44,resize:"vertical"}}/></div>
                <div style={{gridColumn:"1 / -1",display:"flex",justifyContent:"flex-end",gap:8}}>
                  <button onClick={()=>setEditForm(null)} style={{background:"#f0ebe1",color:"#4a4439",border:"1px solid var(--line)",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>Abbrechen</button>
                  <button onClick={saveEdit} style={{background:"var(--ink)",color:"var(--surface)",border:"1px solid var(--ink)",borderRadius:8,padding:"6px 14px",fontSize:12,cursor:"pointer"}}>Speichern</button>
                </div>
              </div>
            ) : (
            <div style={{fontSize:12.5,color:"var(--ink)",marginTop:12,lineHeight:1.9,background:"#f6f2ea",border:"1px solid var(--line)",borderRadius:10,padding:"10px 12px"}}>
              <div><span style={{color:"var(--muted)"}}>Verwaltung:</span> {d.agency_name||"unbekannt"}</div>
              <div><span style={{color:"var(--muted)"}}>Ansprechperson:</span> {d.contact_name||"unbekannt"}</div>
              <div><span style={{color:"var(--muted)"}}>E-Mail:</span> {d.contact_email||"nicht hinterlegt"}</div>
              {d.kontaktiert_am&&<div><span style={{color:"var(--muted)"}}>Kontaktiert am:</span> {fmt(d.kontaktiert_am)}</div>}
            </div>
            )}
            <div style={{display:"flex",gap:8,alignItems:"center",marginTop:12,flexWrap:"wrap"}}>
              <button onClick={()=>openCompose(d)} style={{background:"var(--ink)",color:"var(--surface)",border:"1px solid var(--ink)",borderRadius:8,padding:"7px 18px",fontSize:12.5,cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>E-Mail</button>
            </div>
            {d.reply_pending&&(
              <div style={{marginTop:10,fontSize:12,color:"#8a5a1d",background:"#fbf0df",border:"1px solid #e6cfa0",borderRadius:8,padding:"8px 11px",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span>💬 <strong>Antwort erhalten</strong> · deine Antwort steht noch offen</span>
                <button onClick={()=>{ supabase.from("pipeline").update({reply_pending:false}).eq("id",d.id).then(()=>{ setDeals(ds=>ds.map(x=>x.id===d.id?{...x,reply_pending:false}:x)); setSelected(s=>s?{...s,reply_pending:false}:s); }); }} style={{marginLeft:"auto",background:"none",border:"none",color:"#6a604f",fontSize:11,cursor:"pointer",textDecoration:"underline"}}>erledigt</button>
              </div>
            )}
            {scheduled.filter(s=>s.deal_id===d.id).map(s=>(
              <div key={s.id} style={{marginTop:10,background:"#eef5e8",border:"1px solid #cfe0c4",borderRadius:8,padding:"8px 11px"}}>
                <div style={{fontSize:12,color:"#2f5a2a",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span onClick={()=>setOpenSched(openSched===s.id?null:s.id)} style={{cursor:"pointer"}}>📅 <strong>Geplant</strong> für {new Date(s.send_at).toLocaleString("de-CH",{weekday:"short",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})} · {s.subject} <span style={{color:"#6a8a5a"}}>{openSched===s.id?"▲ Inhalt":"▼ Inhalt"}</span></span>
                  <button onClick={()=>{ if(!confirm("Geplante Mail abbrechen?"))return; supabase.from("scheduled_mails").delete().eq("id",s.id).then(({error})=>{ if(error){toast("Abbrechen fehlgeschlagen", "error");return;} setScheduled(sc=>sc.filter(x=>x.id!==s.id)); if(openSched===s.id)setOpenSched(null); }); }} style={{marginLeft:"auto",background:"none",border:"none",color:"#9b4a3e",fontSize:11.5,cursor:"pointer",textDecoration:"underline"}}>abbrechen</button>
                </div>
                {openSched===s.id&&<iframe title="geplante-mail" srcDoc={s.html||('<pre style="font-family:sans-serif;white-space:pre-wrap;font-size:13px;padding:8px;margin:0">'+((s.body||"").replace(/&/g,"&amp;").replace(/</g,"&lt;"))+'</pre>')} sandbox="" style={{width:"100%",height:340,border:"1px solid #cfe0c4",borderRadius:6,background:"#fff",marginTop:8}}/>}
              </div>
            ))}
            {compose&&(
              <div style={{marginTop:12,border:"1px solid var(--line)",borderRadius:10,padding:12,background:"#faf8f3"}}>
                <select value={compose.tpl||"kalt"} onChange={e=>setTpl(e.target.value)} style={{...inpS,marginBottom:6,fontWeight:600}}><option value="kalt">Vorlage: Kalt · neuer Partner (mit Pitch-Deck)</option><option value="warm">Vorlage: Warm · bestehender Partner</option></select>
                {compose._sibs&&compose._sibs.length>1&&<label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#3a5230",marginBottom:6,cursor:"pointer",background:"#eef5e8",padding:"6px 8px",borderRadius:6}}><input type="checkbox" checked={!!compose.bundle} onChange={e=>toggleBundle(e.target.checked)} /> 📦 {compose._sibs.length} Objekte dieser Ansprechperson gebündelt anfragen</label>}
                <input value={compose.to} onChange={e=>setCompose({...compose,to:e.target.value})} placeholder="An" style={{...inpS,marginBottom:6}} />
                <input value={compose.subject} onChange={e=>setCompose({...compose,subject:e.target.value})} placeholder="Betreff" style={{...inpS,marginBottom:6}} />
                <textarea value={compose.body} onChange={e=>setCompose({...compose,body:e.target.value})} style={{...inpS,minHeight:170,resize:"vertical",marginBottom:6}} />
                {compose.attach&&<div style={{fontSize:11.5,color:"#3a5230",marginBottom:6,display:"flex",alignItems:"center",gap:6}}>📎 D&T Homes Pitch.pdf wird angehängt</div>}
                <div style={{marginBottom:6,fontSize:11,color:"var(--muted)",display:"flex",alignItems:"center",gap:6}}>📧 Deine Outlook-Signatur (Daan Theijse · www.dthomes.ch · Logo) wird automatisch angehängt.</div>
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginBottom:8,fontSize:12,color:"var(--muted)"}}>
                  <span>🕒 Später senden:</span>
                  <input type="datetime-local" value={compose.schedAt||""} onChange={e=>setCompose({...compose,schedAt:e.target.value})} style={{border:"1px solid var(--line)",borderRadius:6,padding:"5px 8px",fontSize:12,fontFamily:"'Manrope',sans-serif",background:"var(--surface)",color:"var(--ink)"}} />
                  <button onClick={()=>{const d=new Date();d.setDate(d.getDate()+1);d.setHours(8,0,0,0);const p=x=>String(x).padStart(2,"0");setCompose({...compose,schedAt:d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T08:00"});}} style={{background:"#f0ebe1",border:"1px solid var(--line)",borderRadius:6,padding:"5px 9px",fontSize:11,cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>Morgen 08:00</button>
                  {compose.schedAt&&<button onClick={()=>setCompose({...compose,schedAt:""})} style={{background:"none",border:"none",color:"var(--muted)",fontSize:11,cursor:"pointer",textDecoration:"underline"}}>sofort senden</button>}
                </div>
                <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"var(--muted)",marginBottom:8,cursor:"pointer"}}><input type="checkbox" checked={compose.catchup!==false} onChange={e=>setCompose({...compose,catchup:e.target.checked})} /> 📮 Nach 1 Woche nachfassen, falls keine Antwort</label>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  {sendMsg&&<span style={{fontSize:11.5,color:sendMsg==="Gesendet"?"#3a5230":"#a4442e"}}>{sendMsg}</span>}
                  <button onClick={()=>setCompose(null)} style={{marginLeft:"auto",background:"none",border:"1px solid var(--line)",borderRadius:8,padding:"6px 12px",fontSize:12,color:"var(--muted)",cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>Abbrechen</button>
                  <button onClick={doSend} style={{background:"var(--ink)",color:"var(--surface)",border:"1px solid var(--ink)",borderRadius:8,padding:"6px 14px",fontSize:12,cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>{compose.schedAt?"Planen":"Senden"}</button>
                </div>
              </div>
            )}
            <div style={{marginTop:14}}>
              <label style={{fontSize:10,color:"var(--muted)",fontWeight:700,letterSpacing:"0.4px",textTransform:"uppercase",display:"flex",flexDirection:"column",gap:4}}>Nächster Schritt<input defaultValue={d.naechster_schritt||""} onBlur={e=>{if(e.target.value!==(d.naechster_schritt||""))patch(d.id,{naechster_schritt:e.target.value});}} placeholder="z. B. Nachfassen per Telefon" style={inpS} /></label>
              {d.stage==="verloren"&&(<div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
                <select value="" onChange={e=>{ if(e.target.value) patchAbsage(d,e.target.value); }} style={{...inpS,width:"auto",flex:"1 1 170px"}}><option value="">Absagegrund wählen ...</option>{["Untervermietung nicht erlaubt","Objekt bereits vergeben","Keine Rückmeldung","Kein Interesse am Modell","Konditionen zu hoch","Anderes"].map(g=>(<option key={g} value={g}>{g}</option>))}</select>
                <input key={d.verlust_grund||"x"} defaultValue={d.verlust_grund||""} onBlur={e=>patchAbsage(d,e.target.value)} placeholder="Grund / Notiz" style={{...inpS,flex:"1 1 170px",width:"auto"}} />
              </div>)}
            </div>
            <textarea defaultValue={d.notizen||""} onBlur={e=>{if(e.target.value!==(d.notizen||""))patch(d.id,{notizen:e.target.value});}} placeholder="Notizen ..." style={{width:"100%",marginTop:12,border:"1px solid var(--line)",borderRadius:8,padding:"8px 10px",fontSize:12.5,fontFamily:"'Manrope',sans-serif",minHeight:52,resize:"vertical",boxSizing:"border-box",color:"var(--ink)",background:"var(--surface)"}} />
            <div style={{marginTop:16,borderTop:"1px solid var(--line)",paddingTop:12}}>
              <div style={{fontSize:12,color:"var(--muted)",marginBottom:8,fontWeight:600}}>Mailverlauf mit {d.contact_name||d.contact_email||"dem Kontakt"}</div>
              {(!thread||thread.loading)&&<div style={{fontSize:12,color:"#8a8174"}}>Lädt Mailverlauf ...</div>}
              {thread&&thread.error==="not_configured"&&<div style={{fontSize:12,color:"#8a8174"}}>Outlook ist noch nicht verbunden.</div>}
              {thread&&thread.error&&thread.error!=="not_configured"&&<div style={{fontSize:12,color:"#a4442e"}}>Mailverlauf nicht verfügbar.</div>}
              {thread&&thread.messages&&thread.messages.length===0&&<div style={{fontSize:12,color:"#8a8174"}}>Keine Mails mit dieser Adresse gefunden.</div>}
              {thread&&thread.messages&&thread.messages.map((m,i)=>(
                <div key={i} style={{padding:"6px 0",borderBottom:"1px solid #f0ebe1"}}>
                  <div onClick={()=>setOpenMsg(openMsg===i?null:i)} style={{display:"flex",gap:8,alignItems:"baseline",cursor:"pointer"}}>
                    <span style={{flexShrink:0,fontSize:9.5,padding:"1px 6px",borderRadius:8,background:m.direction==="gesendet"?"#e8efde":"#eef1f6",color:m.direction==="gesendet"?"#3a5230":"#3a4a63"}}>{m.direction}</span>
                    <span style={{flexShrink:0,color:"#a0968a",fontSize:11}}>{fmt(m.date)}</span>
                    <span style={{flex:1,color:"var(--ink)",fontSize:12.5,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.subject}</span>
                    <span style={{flexShrink:0,color:"#b9b0a2",fontSize:11}}>{openMsg===i?"▲":"▼"}</span>
                  </div>
                  {openMsg!==i&&m.preview&&<div onClick={()=>setOpenMsg(i)} style={{fontSize:11.5,color:"#8a8174",marginTop:2,lineHeight:1.4,cursor:"pointer"}}>{m.preview}</div>}
                  {openMsg===i&&<iframe title="mail" srcDoc={m.body||("<div style=\"font-family:sans-serif;font-size:13px;padding:8px\">"+(m.preview||"(kein Inhalt)")+"</div>")} sandbox="" style={{width:"100%",height:300,border:"1px solid var(--line)",borderRadius:6,background:"#fff",marginTop:6}}/>}
                </div>
              ))}
            </div>
            <div style={{marginTop:14,display:"flex",justifyContent:"flex-end"}}>
              <button onClick={()=>entfernen(d.id)} style={{background:"none",border:"none",color:"#b9b0a2",fontSize:11.5,cursor:"pointer"}}>aus Pipeline entfernen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kontakte(){
  const TYP=[["verwaltung","Verwaltung"],["eigentuemer","Eigentümer"],["partner","Partner"],["andere","Andere"]];
  const typLabel=(t)=>({verwaltung:"Verwaltung",eigentuemer:"Eigentümer",partner:"Partner",andere:"Andere"}[t]||t);
  const ST=[["prospect","Neu"],["gespraech","In Gespräch"],["partner","Partner"],["kein_interesse","Kein Interesse"]];
  const stMap={partner:["Partner","#e8efde","#3a5230"],kein_interesse:["Kein Interesse","#f6e3df","#a4442e"],gespraech:["In Gespräch","#f2ecdb","#7c6a4e"]};
  const osTag=(st)=>{ const c=stMap[st]; return c?<span style={{background:c[1],color:c[2],fontSize:10,padding:"1px 8px",borderRadius:8,fontWeight:600}}>{c[0]}</span>:null; };
  const [ks,setKs]=useState([]);
  const [orgs,setOrgs]=useState({});
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState("alle");
  const [q,setQ]=useState("");
  const [firm,setFirm]=useState(null);
  const [fd,setFd]=useState(null);
  const [cf,setCf]=useState(null);
  const [acts,setActs]=useState([]);
  const [note,setNote]=useState("");
  const [mergeT,setMergeT]=useState("");
  // Erst ansehen, dann bearbeiten
  const [bearb,setBearb]=useState(false);
  const [cfEdit,setCfEdit]=useState(false);
  const [lgs,setLgs]=useState([]);
  const [partnerListe,setPartnerListe]=useState([]);
  useEffect(()=>{ supabase.from("liegenschaften").select("adresse,kontakt_id").then(({data})=>setLgs(data||[])); supabase.from("partners").select("name,typ,strasse,hausnummer,plz,ort").then(({data})=>setPartnerListe(data||[])); },[]);
  const partnerVon=(org)=>partnerListe.find(p=>gleicheFirma(p.name,org));
  const partnerAdr=(p)=>p?[[p.strasse,p.hausnummer].filter(Boolean).join(" "),[p.plz,p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "):"";
  const lgVon=(id)=>lgs.filter(l=>id&&l.kontakt_id===id).map(l=>l.adresse);
  const ladeK=()=>supabase.from("kontakte").select("*").order("name",{ascending:true}).then(({data})=>{setKs(data||[]);setLoading(false);}).catch(()=>{setKs([]);setLoading(false);});
  const ladeOrgs=()=>supabase.from("org_status").select("*").then(({data})=>{ const m={}; (data||[]).forEach(rr=>m[rr.organisation]=rr); setOrgs(m); });
  useEffect(()=>{ ladeK(); ladeOrgs(); const ch=supabase.channel("kontakte_page").on("postgres_changes",{event:"*",schema:"public",table:"kontakte"},ladeK).on("postgres_changes",{event:"*",schema:"public",table:"org_status"},ladeOrgs).subscribe(); return ()=>{supabase.removeChannel(ch);}; },[]);
  const ladeActs=(id)=>supabase.from("kontakt_aktivitaet").select("*").eq("kontakt_id",id).order("datum",{ascending:false}).then(({data})=>setActs(data||[]));
  const firmNames=Array.from(new Set([...ks.map(k=>k.organisation||"Ohne Organisation"),...Object.keys(orgs)])).filter(Boolean);
  const firmType=(org)=>{ if(orgs[org]&&orgs[org].typ) return orgs[org].typ; const k=ks.find(x=>(x.organisation||"Ohne Organisation")===org); return k?k.org_type:"verwaltung"; };
  const firmStatus=(org)=>orgs[org]?orgs[org].status:null;
  const firmKontakte=(org)=>ks.filter(k=>(k.organisation||"Ohne Organisation")===org);
  const pass=(org,f)=>{ const t=firmType(org),st=firmStatus(org); if(f==="partner"&&st!=="partner")return false; if(f==="kein_interesse"&&st!=="kein_interesse")return false; if(f==="gespraech"&&st!=="gespraech")return false; if(f==="verwaltung"&&t!=="verwaltung")return false; if(f==="eigentuemer"&&t!=="eigentuemer")return false; return true; };
  const cntTab=(f)=>firmNames.filter(org=>pass(org,f)).length;
  const firmen=firmNames.filter(org=>{ if(!pass(org,tab))return false; if(q){ const persons=firmKontakte(org).map(k=>(k.name||"")+" "+(k.email||"")+" "+(k.rolle||"")).join(" "); const s=(org+" "+persons+" "+((orgs[org]&&orgs[org].email)||"")).toLowerCase(); if(!s.includes(q.toLowerCase()))return false; } return true; }).sort((a,b)=>a.localeCompare(b));
  const openFirm=(org)=>{ const rr=orgs[org]||{}; setFd({organisation:org,isNew:false,status:rr.status||"prospect",grund:rr.grund||"",typ:rr.typ||firmType(org),adresse:rr.adresse||"",email:rr.email||"",telefon:rr.telefon||"",notizen:rr.notizen||"",website:rr.website||""}); setFirm(org); setCf(null); setBearb(false); };
  const neueFirma=()=>{ setFd({organisation:"",isNew:true,status:"prospect",grund:"",typ:"verwaltung",adresse:"",email:"",telefon:"",notizen:"",website:""}); setFirm("*neu*"); setCf(null); setBearb(true); };
  const saveFirm=()=>{ if(!fd.organisation||!fd.organisation.trim()){alert("Bitte Firmennamen angeben.");return;} supabase.from("org_status").upsert({organisation:fd.organisation.trim(),status:fd.status,grund:fd.grund||null,typ:fd.typ||null,adresse:fd.adresse||null,email:fd.email||null,telefon:fd.telefon||null,notizen:fd.notizen||null,website:fd.website||null,updated_at:new Date().toISOString()},{onConflict:"organisation"}).then(({error})=>{ if(error){toast("Speichern fehlgeschlagen", "error");return;} const nm=fd.organisation.trim(); setOrgs(m=>({...m,[nm]:{...(m[nm]||{}),organisation:nm,status:fd.status,grund:fd.grund,typ:fd.typ,adresse:fd.adresse,email:fd.email,telefon:fd.telefon,notizen:fd.notizen,website:fd.website}})); setFd({...fd,organisation:nm,isNew:false}); setFirm(nm); setBearb(false); toast("Gespeichert"); }); };
  const mergeFirm=(target)=>{ if(!target||target===fd.organisation)return; if(!confirm('Firma "'+fd.organisation+'" in "'+target+'" zusammenführen? Alle Kontakte werden übernommen.'))return; supabase.from("kontakte").update({organisation:target,updated_at:new Date().toISOString()}).eq("organisation",fd.organisation).then(()=>{ supabase.from("org_status").delete().eq("organisation",fd.organisation).then(()=>{ setFirm(null); setCf(null); setMergeT(""); ladeK(); ladeOrgs(); }); }); };
  const openContact=(k)=>{ if(k){ setCf({...k}); setCfEdit(false); setNote(""); if(k.id) ladeActs(k.id); else setActs([]); } else { setCf({organisation:firm,org_type:(fd&&fd.typ)||"verwaltung"}); setCfEdit(true); setActs([]); setNote(""); } };
  const saveContact=()=>{ const k=cf; if(!k.name&&!k.email){alert("Bitte Name oder E-Mail angeben.");return;} const row={name:k.name||null,email:k.email?k.email.toLowerCase():null,phone:k.phone||null,organisation:fd.organisation,org_type:k.org_type||(fd&&fd.typ)||"verwaltung",rolle:k.rolle||null,verwaltung:k.verwaltung||null,is_partner:!!k.is_partner,notizen:k.notizen||null,updated_at:new Date().toISOString()}; const op=k.id?supabase.from("kontakte").update(row).eq("id",k.id):supabase.from("kontakte").insert(row); op.then(({error})=>{ if(error){toast("Speichern fehlgeschlagen", "error");return;} setCf(null); setCfEdit(false); ladeK(); try{ ladeKontakte(true); }catch(_){} toast("Gespeichert"); }); };
  const delContact=(id)=>{ if(!confirm("Kontakt löschen?"))return; supabase.from("kontakte").delete().eq("id",id).then(()=>{ setCf(null); ladeK(); }); };
  const addNote=()=>{ if(!note.trim()||!cf||!cf.id)return; supabase.from("kontakt_aktivitaet").insert({kontakt_id:cf.id,typ:"notiz",text:note.trim()}).then(({error})=>{ if(!error){ setNote(""); ladeActs(cf.id); } }); };
  const delNote=(aid)=>supabase.from("kontakt_aktivitaet").delete().eq("id",aid).then(()=>ladeActs(cf.id));
  const fmt=(d)=>d?new Date(d).toLocaleDateString("de-CH",{day:"2-digit",month:"2-digit",year:"numeric"}):"";
  const inp={border:"1px solid var(--line)",borderRadius:8,padding:"7px 9px",fontSize:12.5,fontFamily:"'Manrope',sans-serif",background:"var(--surface)",color:"var(--ink)",width:"100%",boxSizing:"border-box"};
  const CI={...inp,fontSize:12,padding:"6px 9px"};
  const LBL={fontSize:9.5,color:"var(--muted)",fontWeight:700,letterSpacing:"0.4px",textTransform:"uppercase",display:"block",marginBottom:3};
  return (
    <div style={{padding:"8px",maxWidth:900}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        <div>
          <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:24,color:"var(--ink)"}}>Kontakte</div>
          <div style={{fontSize:13,color:"var(--muted)",marginTop:4}}>Firmen und ihre Ansprechpersonen. Klicke eine Firma für alle Angaben.</div>
        </div>
        <button onClick={neueFirma} style={{background:"var(--ink)",color:"var(--surface)",border:"1px solid var(--ink)",borderRadius:8,padding:"7px 14px",fontSize:12.5,cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>+ Firma</button>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        {[["alle","Alle"],["verwaltung","Verwaltungen"],["eigentuemer","Eigentümer"],["partner","Partner"],["kein_interesse","Kein Interesse"]].map(([f,lbl])=>(
          <button key={f} onClick={()=>setTab(f)} style={{background:tab===f?"var(--ink)":"none",color:tab===f?"var(--surface)":"var(--muted)",border:"1px solid var(--line)",borderRadius:8,padding:"6px 12px",fontSize:12.5,cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>{lbl}{cntTab(f)?" ("+cntTab(f)+")":""}</button>
        ))}
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Suchen ..." style={{...inp,width:"auto",flex:"1 1 160px",marginLeft:"auto"}} />
      </div>
      {loading&&<div style={{padding:"30px 8px",color:"#8a8174",fontSize:13}}>Laedt...</div>}
      {!loading&&firmen.length===0&&<div style={{padding:"30px 8px",color:"#8a8174",fontSize:13}}>Keine Firmen.</div>}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {firmen.map(org=>(
          <div key={org} onClick={()=>openFirm(org)} style={{border:"1px solid var(--line)",borderRadius:12,padding:"13px 15px",background:"var(--surface)",cursor:"pointer",display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:14.5,fontWeight:600,color:"var(--ink)"}}>{org}</div>
              <div style={{fontSize:11.5,color:"#a0968a",marginTop:2}}>{typLabel(firmType(org))} · {firmKontakte(org).length} {firmKontakte(org).length===1?"Person":"Personen"}</div>
            </div>
            {osTag(firmStatus(org))}
          </div>
        ))}
      </div>
      {firm&&fd&&(
        <div className="ov-x" onClick={()=>{setFirm(null);setCf(null);}} style={{position:"fixed",inset:0,background:"rgba(40,36,30,0.45)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"24px 12px",zIndex:1000,overflow:"auto"}}>
          <div className="modal-x" onClick={e=>e.stopPropagation()} style={{background:"var(--surface)",border:"1px solid var(--line)",borderRadius:14,maxWidth:560,width:"100%",padding:"18px",boxShadow:"0 12px 40px rgba(0,0,0,0.18)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:12}}>
              {fd.isNew
                ? <input value={fd.organisation} onChange={e=>setFd({...fd,organisation:e.target.value})} placeholder="Firmenname" style={{...inp,fontSize:15,fontWeight:600}} />
                : <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:18,color:"var(--ink)"}}>{fd.organisation} {osTag(fd.status)}</div>}
              <button onClick={()=>{setFirm(null);setCf(null);}} style={{background:"none",border:"none",fontSize:20,color:"var(--muted)",cursor:"pointer",lineHeight:1}}>×</button>
            </div>
            {!bearb ? (<div>
              {(()=>{ const z=(l,v)=>v?<div style={{display:"flex",gap:12,padding:"7px 0",borderBottom:"1px solid #f0ebe1",fontSize:12.5}}><span style={{width:90,flexShrink:0,color:"var(--muted)"}}>{l}</span><span style={{color:"var(--ink)",minWidth:0,overflowWrap:"anywhere"}}>{v}</span></div>:null; const web=fd.website?(/^https?:/.test(fd.website)?fd.website:"https://"+fd.website):""; return (<>
                {z("Typ",typLabel(fd.typ))}
                {z("Status",(ST.find(x=>x[0]===fd.status)||[])[1])}
                {z("Adresse",fd.adresse||partnerAdr(partnerVon(fd.organisation)))}
                {partnerVon(fd.organisation)&&z("Partner",<span style={{color:"#3a5230"}}>✓ Bei uns als {partnerVon(fd.organisation).typ||"Partner"} erfasst</span>)}
                {z("E-Mail",fd.email&&<a href={"mailto:"+fd.email} style={{color:"inherit"}}>{fd.email}</a>)}
                {z("Telefon",fd.telefon&&<a href={"tel:"+fd.telefon.replace(/\s/g,"")} style={{color:"inherit"}}>{fd.telefon}</a>)}
                {z("Website",web&&<a href={web} target="_blank" rel="noopener noreferrer" style={{color:"inherit"}}>{fd.website}</a>)}
                {fd.status==="kein_interesse"&&z("Grund",fd.grund)}
                {z("Notizen",fd.notizen&&<span style={{whiteSpace:"pre-wrap"}}>{fd.notizen}</span>)}
                {!fd.adresse&&!partnerVon(fd.organisation)&&!fd.email&&!fd.telefon&&!fd.website&&!fd.notizen&&<div style={{fontSize:12,color:"#a0968a",padding:"6px 0"}}>Noch keine Firmenangaben erfasst.</div>}
              </>); })()}
              <div style={{display:"flex",justifyContent:"flex-end",marginTop:10}}>
                <button onClick={()=>setBearb(true)} style={{background:"none",border:"1px solid var(--line)",borderRadius:8,padding:"6px 14px",fontSize:12,color:"var(--ink)",cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>✏ Bearbeiten</button>
              </div>
            </div>) : (<>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"9px 10px"}}>
              <div><label style={LBL}>Typ</label><select value={fd.typ} onChange={e=>setFd({...fd,typ:e.target.value})} style={CI}>{TYP.map(([v,l])=>(<option key={v} value={v}>{l}</option>))}</select></div>
              <div><label style={LBL}>Status</label><select value={fd.status} onChange={e=>setFd({...fd,status:e.target.value})} style={CI}>{ST.map(([v,l])=>(<option key={v} value={v}>{l}</option>))}</select></div>
              <div style={{gridColumn:"1 / -1"}}><label style={LBL}>Adresse</label><input value={fd.adresse||""} onChange={e=>setFd({...fd,adresse:e.target.value})} placeholder="Strasse, PLZ Ort" style={CI} /></div>
              <div><label style={LBL}>E-Mail</label><input value={fd.email||""} onChange={e=>setFd({...fd,email:e.target.value})} placeholder="info@firma.ch" style={CI} /></div>
              <div><label style={LBL}>Telefon</label><input value={fd.telefon||""} onChange={e=>setFd({...fd,telefon:e.target.value})} placeholder="+41 ..." style={CI} /></div>
              <div style={{gridColumn:"1 / -1"}}><label style={LBL}>Website</label><input value={fd.website||""} onChange={e=>setFd({...fd,website:e.target.value})} placeholder="www.firma.ch" style={CI} /></div>
              {fd.status==="kein_interesse"&&<div style={{gridColumn:"1 / -1"}}><label style={LBL}>Grund (Kein Interesse)</label><input value={fd.grund||""} onChange={e=>setFd({...fd,grund:e.target.value})} style={CI} /></div>}
              <div style={{gridColumn:"1 / -1"}}><label style={LBL}>Notizen</label><textarea value={fd.notizen||""} onChange={e=>setFd({...fd,notizen:e.target.value})} placeholder="Notizen zur Firma ..." style={{...CI,minHeight:44,resize:"vertical"}} /></div>
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",marginTop:12}}>
              {!fd.isNew&&<button onClick={()=>{openFirm(fd.organisation);}} style={{background:"none",border:"1px solid var(--line)",borderRadius:8,padding:"6px 12px",fontSize:12,color:"var(--muted)",cursor:"pointer",fontFamily:"'Manrope',sans-serif",marginRight:8}}>Abbrechen</button>}
              <button onClick={saveFirm} style={{background:"var(--ink)",color:"var(--surface)",border:"1px solid var(--ink)",borderRadius:8,padding:"6px 16px",fontSize:12,cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>Firma speichern</button>
            </div>
            </>)}
            {bearb&&!fd.isNew&&firmen.length>1&&(
              <div style={{marginTop:10,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",borderTop:"1px solid var(--line)",paddingTop:10}}>
                <span style={{fontSize:11,color:"var(--muted)"}}>Zusammenführen mit:</span>
                <select value={mergeT} onChange={e=>setMergeT(e.target.value)} style={{...inp,width:"auto",flex:"1 1 160px"}}><option value="">Firma wählen ...</option>{firmen.filter(o=>o!==fd.organisation).map(o=>(<option key={o} value={o}>{o}</option>))}</select>
                <button onClick={()=>mergeFirm(mergeT)} style={{background:"none",border:"1px solid var(--line)",borderRadius:8,padding:"6px 12px",fontSize:11.5,color:"var(--muted)",cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>Zusammenführen</button>
              </div>
            )}
            {!fd.isNew&&(
              <div style={{marginTop:16,borderTop:"1px solid var(--line)",paddingTop:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:12,fontWeight:600,color:"var(--ink)"}}>Kontaktpersonen</span>
                  <button onClick={()=>openContact(null)} style={{background:"none",border:"1px solid var(--line)",borderRadius:8,padding:"4px 10px",fontSize:11.5,color:"var(--muted)",cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>+ Person</button>
                </div>
                {firmKontakte(fd.organisation).length===0&&!cf&&<div style={{fontSize:11.5,color:"#a0968a"}}>Noch keine Personen.</div>}
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {firmKontakte(fd.organisation).map(k=>(
                    <div key={k.id} onClick={()=>openContact(k)} style={{border:"1px solid var(--line)",borderRadius:10,padding:"9px 11px",background:cf&&cf.id===k.id?"#f3efe6":"var(--surface)",cursor:"pointer"}}>
                      <div style={{fontSize:13.5,color:"var(--ink)",fontWeight:600}}>{k.name||"(ohne Name)"}{k.is_partner&&<span style={{marginLeft:8,background:"#e8efde",color:"#3a5230",fontSize:9.5,padding:"1px 7px",borderRadius:8}}>Partner</span>}</div>
                      <div style={{fontSize:11.5,color:"#a0968a",marginTop:2}}>{k.rolle?k.rolle+" · ":""}{k.email||""}{k.phone?" · "+k.phone:""}</div>
                      {lgVon(k.id).length>0&&<div style={{fontSize:11,color:"#3d4f2f",marginTop:2}}>Ansprechperson für {lgVon(k.id).join(", ")}</div>}
                    </div>
                  ))}
                </div>
                {cf&&(
                  <div style={{border:"1px solid var(--line)",borderRadius:10,padding:12,marginTop:10,background:"#faf8f3"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <div style={{fontSize:12,fontWeight:600,color:"var(--ink)"}}>{!cf.id?"Neue Person":cfEdit?"Person bearbeiten":(cf.name||"Person")}</div>
                      {cf.id&&!cfEdit&&<button onClick={()=>setCfEdit(true)} style={{background:"none",border:"1px solid var(--line)",borderRadius:8,padding:"4px 12px",fontSize:11.5,color:"var(--ink)",cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>✏ Bearbeiten</button>}
                    </div>
                    {cf.id&&!cfEdit&&<div style={{fontSize:12.5,color:"var(--ink)",lineHeight:1.7}}>
                      {cf.rolle&&<div style={{color:"var(--muted)"}}>{cf.rolle}</div>}
                      {cf.email&&<div><a href={"mailto:"+cf.email} style={{color:"inherit"}}>{cf.email}</a></div>}
                      {cf.phone&&<div><a href={"tel:"+cf.phone.replace(/\s/g,"")} style={{color:"inherit"}}>{cf.phone}</a></div>}
                      {cf.verwaltung&&<div style={{color:"var(--muted)"}}>Zuständige Verwaltung: {cf.verwaltung}</div>}
                      {lgVon(cf.id).length>0&&<div style={{color:"#3d4f2f"}}>Ansprechperson für {lgVon(cf.id).join(", ")}</div>}
                      {cf.is_partner&&<div style={{color:"#3a5230"}}>Partner</div>}
                    </div>}
                    {(cfEdit||!cf.id)&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      <input value={cf.name||""} onChange={e=>setCf({...cf,name:e.target.value})} placeholder="Name" style={inp} />
                      <input value={cf.rolle||""} onChange={e=>setCf({...cf,rolle:e.target.value})} placeholder="Rolle" style={inp} />
                      <input value={cf.email||""} onChange={e=>setCf({...cf,email:e.target.value})} placeholder="E-Mail" style={inp} />
                      <input value={cf.phone||""} onChange={e=>setCf({...cf,phone:e.target.value})} placeholder="Telefon" style={inp} />
                      {(fd.typ==="eigentuemer")&&<input value={cf.verwaltung||""} onChange={e=>setCf({...cf,verwaltung:e.target.value})} placeholder="Zuständige Verwaltung" style={{...inp,gridColumn:"1 / -1"}} />}
                      <label style={{fontSize:11.5,color:"var(--muted)",display:"flex",alignItems:"center",gap:6,cursor:"pointer",gridColumn:"1 / -1"}}><input type="checkbox" checked={!!cf.is_partner} onChange={e=>setCf({...cf,is_partner:e.target.checked})} /> Partner</label>
                    </div>}
                    {cf.id&&(
                      <div style={{marginTop:10,borderTop:"1px solid var(--line)",paddingTop:8}}>
                        <div style={{fontSize:11.5,fontWeight:600,color:"var(--ink)",marginBottom:6}}>Verlauf</div>
                        <div style={{display:"flex",gap:6,marginBottom:8}}>
                          <input value={note} onChange={e=>setNote(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addNote();}} placeholder="Notiz oder Aktivität ..." style={{...inp,flex:1}} />
                          <button onClick={addNote} style={{background:"var(--ink)",color:"var(--surface)",border:"1px solid var(--ink)",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>+</button>
                        </div>
                        {acts.map(av=>(
                          <div key={av.id} style={{display:"flex",gap:8,alignItems:"baseline",fontSize:11.5,padding:"4px 0",borderBottom:"1px solid #f0ebe1"}}>
                            <span style={{flexShrink:0,color:"#a0968a"}}>{fmt(av.datum)}</span>
                            <span style={{color:"var(--ink)",flex:1}}>{av.text}</span>
                            <button onClick={()=>delNote(av.id)} style={{background:"none",border:"none",color:"#c9c0b2",fontSize:11,cursor:"pointer"}}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {(cfEdit||!cf.id) ? <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:10}}>
                      {cf.id&&<button onClick={()=>delContact(cf.id)} style={{background:"none",border:"none",color:"#b9b0a2",fontSize:11.5,cursor:"pointer",marginRight:"auto"}}>löschen</button>}
                      <button onClick={()=>{ if(cf.id){ const o=ks.find(x=>x.id===cf.id); setCf(o?{...o}:null); setCfEdit(false); } else setCf(null); }} style={{background:"none",border:"1px solid var(--line)",borderRadius:8,padding:"6px 12px",fontSize:12,color:"var(--muted)",cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>Abbrechen</button>
                      <button onClick={saveContact} style={{background:"var(--ink)",color:"var(--surface)",border:"1px solid var(--ink)",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>Speichern</button>
                    </div> : <div style={{display:"flex",justifyContent:"flex-end",marginTop:10}}><button onClick={()=>setCf(null)} style={{background:"none",border:"1px solid var(--line)",borderRadius:8,padding:"5px 12px",fontSize:12,color:"var(--muted)",cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>Schliessen</button></div>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Bauradar(){
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [q,setQ]=useState("");
  const [stat,setStat]=useState("alle");
  const [msg,setMsg]=useState("");
  async function load(){
    setLoading(true);
    try{
      const {data,error}=await supabase.from("baugesuche").select("*").order("publication_date",{ascending:false}).limit(800);
      if(error) throw error;
      setRows(data||[]);
    }catch(e){ setMsg("Laden fehlgeschlagen: "+(e.message||e)); }
    setLoading(false);
  }
  useEffect(()=>{ load(); },[]);
  async function refresh(){
    setRefreshing(true); setMsg("");
    try{
      const {data,error}=await supabase.functions.invoke("bauradar-fetch",{body:{}});
      if(error) throw error;
      if(data&&data.error) throw new Error(data.error);
      setMsg("Aktualisiert: "+(data&&data.matched!=null?data.matched:"?")+" Vorhaben in der Region.");
      await load();
    }catch(e){ setMsg("Aktualisierung fehlgeschlagen: "+(e.message||e)); }
    setRefreshing(false);
  }
  async function setStatus(pub, s){
    setRows(rs=>rs.map(r=>r.publication_number===pub?{...r,status:s}:r));
    try{ await supabase.from("baugesuche").update({status:s}).eq("publication_number",pub); }catch(e){}
  }
  function pitch(r){
    const addr=[r.street,r.house_number].filter(Boolean).join(" ");
    const ort=[r.zip,r.town].filter(Boolean).join(" ");
    const ol=(addr?addr+", ":"")+ort;
    const subject="Zwischennutzung Ihrer Liegenschaft "+(ol||r.municipality||"");
    const body=[
      "Guten Tag",
      "",
      "wir haben Ihr Bauvorhaben an der Adresse "+(ol||("in "+(r.municipality||"")))+" gesehen ("+(r.category||"Umbau/Neubau")+").",
      "",
      "Wir sind D&T Homes und betreiben möblierten Wohnraum in der ganzen Schweiz. Für die Zeit bis zum Baustart übernehmen wir Ihre Liegenschaft als Zwischennutzung: feste Miete, kein Leerstand, kein Vermietungsaufwand, klar befristet, und wir tragen das ganze Vermietungsrisiko.",
      "",
      "Gerne bespreche ich mit Ihnen unverbindlich, ob sich Ihr Objekt dafür eignet.",
      "",
      "Freundliche Grüsse",
      "Daan Theijse · D&T Homes · daan.theijse@dthomes.ch",
    ].join("\n");
    window.open("mailto:?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body));
  }
  const filtered=rows.filter(r=>{
    if(stat!=="alle" && (r.status||"neu")!==stat) return false;
    if(q){ const t=((r.project_description||"")+" "+(r.street||"")+" "+(r.town||"")+" "+(r.municipality||"")+" "+(r.zip||"")).toLowerCase(); if(!t.includes(q.toLowerCase())) return false; }
    return true;
  });
  const catColor={"Abbruch/Rückbau":"#b45b3e","Ersatzneubau":"#8a6d3b","Sanierung":"#6a5b8a"};
  return (
    <div style={{padding:"8px 4px 40px",maxWidth:1080}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12,marginBottom:6}}>
        <div>
          <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:24,color:"var(--ink)"}}>Bauradar</div>
          <div style={{fontSize:12.5,color:"var(--ink-soft)",marginTop:2,maxWidth:640}}>Neue Bauvorhaben in Zürich und Umgebung, bei denen ein Gebäude vor den Arbeiten frei wird. Kandidaten für eine Zwischennutzung. Den Namen der Bauherrschaft findest du über den Amtsblatt-Link.</div>
        </div>
        <button className="btn btn-p btn-sm" disabled={refreshing} onClick={refresh}>{refreshing?"⏳ lädt Daten …":"↻ Aktualisieren"}</button>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",margin:"10px 0"}}>
        <input className="fi" style={{flex:"1 1 260px",margin:0}} placeholder="Suche nach Adresse, Ort, Beschreibung …" value={q} onChange={e=>setQ(e.target.value)}/>
        <select className="fi" style={{margin:0,maxWidth:170}} value={stat} onChange={e=>setStat(e.target.value)}>
          <option value="alle">Alle Status</option>
          <option value="neu">Neu</option>
          <option value="kontaktiert">Kontaktiert</option>
          <option value="ignoriert">Ignoriert</option>
        </select>
        <span style={{fontSize:12,color:"var(--ink-soft)"}}>{filtered.length} Vorhaben</span>
      </div>
      {msg && <div style={{fontSize:12,color:"var(--ink-soft)",marginBottom:10}}>{msg}</div>}
      {loading ? <div style={{padding:20,color:"var(--ink-soft)"}}>Lädt …</div> : (
        rows.length===0 ? <div style={{padding:20,color:"var(--ink-soft)"}}>Noch keine Daten. Klick auf „Aktualisieren", um die aktuellen Baugesuche zu laden.</div> :
        <div style={{display:"grid",gap:10}}>
          {filtered.map(function(r){
            const addr=[r.street,r.house_number].filter(Boolean).join(" ");
            const ort=[r.zip,r.town].filter(Boolean).join(" ");
            return (
            <div key={r.publication_number} style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"12px 14px",opacity:(r.status==="ignoriert")?.55:1}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
                <div style={{fontWeight:600,fontSize:14,color:"var(--ink)"}}>{addr||"(Adresse im Gesuch)"}{ort?", "+ort:""}</div>
                <span style={{fontSize:10,fontWeight:600,color:"#fff",background:catColor[r.category]||"#54503f",borderRadius:20,padding:"2px 9px",alignSelf:"flex-start"}}>{r.category}</span>
              </div>
              <div style={{fontSize:12.5,color:"var(--ink-soft)",margin:"5px 0 8px",lineHeight:1.45}}>{(r.project_description||"").replace(/^BG Nr\.?\s*[\d-]+:?\s*/,"")}</div>
              <div style={{fontSize:11.5,color:"#8a8174",display:"flex",gap:14,flexWrap:"wrap",marginBottom:10}}>
                <span>{r.municipality}</span>
                <span>Publiziert {r.publication_date||"-"}</span>
                {r.entry_deadline && <span>Frist {r.entry_deadline}</span>}
                {r.building_zone && <span>Zone {String(r.building_zone).slice(0,40)}</span>}
                {r.contractor_town && <span>Bauherr-Ort {r.contractor_town}</span>}
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                <a className="btn btn-sm" href={r.amtsblatt_url} target="_blank" rel="noopener">Amtsblatt (Name)</a>
                <button className="btn btn-p btn-sm" onClick={()=>pitch(r)}>Pitch-Mail</button>
                <select className="fi" style={{margin:0,maxWidth:150,fontSize:12}} value={r.status||"neu"} onChange={e=>setStatus(r.publication_number,e.target.value)}>
                  <option value="neu">Neu</option>
                  <option value="kontaktiert">Kontaktiert</option>
                  <option value="ignoriert">Ignoriert</option>
                </select>
              </div>
            </div>);
          })}
        </div>
      )}
    </div>
  );
}


// Geschaeftskarte: Ausgaben von Daan und Martijn mit der Geschaeftskreditkarte
