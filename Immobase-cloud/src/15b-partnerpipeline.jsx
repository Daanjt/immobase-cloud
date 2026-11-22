// ── Akquise-Team: Zuständig, Absender, Verlauf (für Wohnungs- und Partner-Pipeline) ──
// Jede Person sendet aus dem eigenen @dthomes.ch-Postfach (outlook-send nimmt den Login).
// Wer kein eigenes Postfach hat, sendet über das Standardpostfach (Daan).
const AKQ_STANDARD_POSTFACH = "daan.theijse@dthomes.ch";
function useAkquiseTeam(){
  const [team,setTeam]=useState([]);
  useEffect(()=>{ supabase.rpc("akquise_team").then(({data})=>setTeam(data||[])).catch(()=>{}); },[]);
  return team;
}
function akqName(team,email){ const e=String(email||"").toLowerCase(); const t=(team||[]).find(x=>x.email===e); return t?t.name:(e?e.split("@")[0]:""); }
function akqKuerzel(name){ return String(name||"?").split(/[\s.]+/).filter(Boolean).slice(0,2).map(s=>s[0].toUpperCase()).join("")||"?"; }
function akqEigenesPostfach(email){ return /^[a-z0-9._-]+@dthomes\.ch$/.test(String(email||"").toLowerCase()); }
function akqAbsender(email){ return akqEigenesPostfach(email)?String(email).toLowerCase():AKQ_STANDARD_POSTFACH; }
function akqAbsenderName(team,email){ const a=akqAbsender(email); if(a===AKQ_STANDARD_POSTFACH){ const n=akqName(team,a); return n&&n!=="daan.theijse"?n:"Daan Theijse"; } return akqName(team,a); }
function akqEsc(x){ return String(x||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function akqSigHtml(name){ return '<div style="font-family:Aptos,Calibri,Helvetica,sans-serif;font-size:12pt;color:#000000"><br><div>Freundliche Gr&uuml;sse</div><br><div>'+akqEsc(name)+'</div><div><a href="http://www.dthomes.ch" style="color:#000000">www.dthomes.ch</a></div><div><img src="https://admin.dthomes.ch/dt-sig-logo.png" width="104" height="104" style="width:104px;height:104px" alt="D&amp;T Homes"></div></div>'; }
function akqMailHtml(text,name){ return '<div style="font-family:Aptos,Calibri,Helvetica,sans-serif;font-size:12pt;color:#000000">'+akqEsc(text).replace(/\n/g,"<br>")+'</div>'+akqSigHtml(name); }
function akqLog(row){ return supabase.from("akquise_log").insert(row).then(()=>{}).catch(()=>{}); }
function akqDatum(iso){ if(!iso) return ""; const d=new Date(iso); return isNaN(d.getTime())?"":d.toLocaleString("de-CH",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}); }


const AKQ_PHASEN={prospect:["Neu","#ece5d8","#6e6a62"],angeschrieben:["Angeschrieben","#eef1f6","#3a4a63"],gespraech:["Im Gespräch","#f2ecdb","#7c6a4e"],partner:["Partner","#e8efde","#3a5230"],kein_interesse:["Kein Interesse","#f6e3df","#a4442e"]};
function AkqPhaseTag({status}){ const f=AKQ_PHASEN[status||"prospect"]||AKQ_PHASEN.prospect; return <span style={{background:f[1],color:f[2],fontSize:10,padding:"1px 7px",borderRadius:8,fontWeight:600}}>{f[0]}</span>; }
const AKQ_TYP={verwaltung:["Verwaltung","#eef1f6","#3a4a63"],eigentuemer:["Eigentümer","#e8efde","#3a5230"],andere:["Andere","#f2ecdb","#7c6a4e"]};
function AkqTypTag({typ}){ const f=AKQ_TYP[typ||"verwaltung"]||AKQ_TYP.andere; return <span style={{background:f[1],color:f[2],fontSize:10,padding:"1px 7px",borderRadius:8,fontWeight:600}}>{f[0]}</span>; }
// Firmennamen vergleichen (Bilaya = Bilaya Wohnbau AG), gleiche Regeln wie firma_norm in der Datenbank
function akqFirmaNorm(t){ return String(t||"").toLowerCase().replace(/\b(ag|gmbh|sa|sàrl|ltd|immobilien|immo|verwaltung|verwaltungs|treuhand|und|real estate|wohnbau|management|bau|group|gruppe)\b/g," ").replace(/[^a-z0-9äöüé]+/g," ").trim(); }
function akqAehnlicheFirmen(name,liste){ const n=akqFirmaNorm(name); if(!n) return []; const erstes=n.split(" ")[0]; return (liste||[]).filter(o=>{ const m=akqFirmaNorm(o); return m===n||(erstes.length>=4&&m.split(" ")[0]===erstes); }); }

function AkqChip({name,leer}){
  if(!name) return leer?<span title="Nicht zugewiesen" style={{fontSize:10,color:"#b9b0a2",border:"1px dashed #d8cfbe",borderRadius:10,padding:"0 7px"}}>offen</span>:null;
  return <span title={"Zuständig: "+name} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:22,height:22,borderRadius:11,background:"#e8e1d3",color:"#4a4439",fontSize:10,fontWeight:700,padding:"0 5px"}}>{akqKuerzel(name)}</span>;
}

function AkqZustaendig({value,team,onChange,ich}){
  const v=String(value||"").toLowerCase();
  const inTeam=(team||[]).some(t=>t.email===v);
  return (
    <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
      <select value={v} onChange={e=>onChange(e.target.value||null)} style={{border:"1px solid var(--line)",borderRadius:8,padding:"6px 8px",fontSize:12.5,fontFamily:"'Manrope',sans-serif",background:"var(--surface)",color:"var(--ink)",minWidth:170}}>
        <option value="">Nicht zugewiesen</option>
        {(team||[]).map(t=><option key={t.email} value={t.email}>{t.name}</option>)}
        {v&&!inTeam&&<option value={v}>{v}</option>}
      </select>
      {ich&&v!==String(ich).toLowerCase()&&<button onClick={()=>onChange(String(ich).toLowerCase())} style={{background:"none",border:"1px solid var(--line)",borderRadius:8,padding:"5px 10px",fontSize:11.5,color:"var(--muted)",cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>Mir zuweisen</button>}
    </div>
  );
}

function AkqPersonFilter({team,value,onChange,ich}){
  const opts=[["alle","Alle"],["meine","Meine"],["offen","Nicht zugewiesen"]];
  return (
    <select value={value} onChange={e=>onChange(e.target.value)} style={{border:"1px solid var(--line)",borderRadius:8,padding:"7px 10px",fontSize:12.5,fontFamily:"'Manrope',sans-serif",background:"var(--surface)",color:"var(--ink)"}}>
      {opts.map(([v,l])=><option key={v} value={v} disabled={v==="meine"&&!ich}>{l}</option>)}
      {(team||[]).map(t=><option key={t.email} value={t.email}>{t.name}</option>)}
    </select>
  );
}
function akqPasstPerson(filter,zust,ich){
  const z=String(zust||"").toLowerCase();
  if(!filter||filter==="alle") return true;
  if(filter==="meine") return !!ich && z===String(ich).toLowerCase();
  if(filter==="offen") return !z;
  return z===filter;
}

// Verlauf: wer hat wann was gemacht, plus eigene Notizen
function AkqVerlauf({bereich,dealId,organisation,dealIds,deals,ich,team,neu}){
  const [rows,setRows]=useState(null);
  const [txt,setTxt]=useState("");
  const idsKey=(dealIds||[]).join(",");
  const laden=()=>{
    let q=supabase.from("akquise_log").select("*").eq("bereich",bereich).order("created_at",{ascending:false}).limit(60); q=dealId?q.eq("deal_id",dealId):q.eq("organisation",organisation);
    const zusatz=(!dealId&&dealIds&&dealIds.length)?supabase.from("akquise_log").select("*").eq("bereich","wohnung").in("deal_id",dealIds).order("created_at",{ascending:false}).limit(60):Promise.resolve({data:[]});
    Promise.all([q,zusatz]).then(([a,b])=>{ const alle=[...(a.data||[]),...(b.data||[])]; alle.sort((x,y)=>String(y.created_at).localeCompare(String(x.created_at))); setRows(alle.slice(0,80)); }).catch(()=>setRows([]));
  };
  useEffect(()=>{ laden(); },[dealId,organisation,neu,idsKey]);
  const dealName=(id)=>{ const d=(deals||[]).find(x=>x.id===id); return d?("🏠 "+(d.strasse||"Wohnung")+": "):""; };
  const add=()=>{ const t=txt.trim(); if(!t) return; akqLog({bereich,deal_id:dealId||null,organisation:organisation||null,typ:"notiz",text:t,von:ich||null}).then(()=>{ setTxt(""); laden(); }); };
  const ICON={notiz:"📝",mail:"✉️",phase:"➜",zustaendig:"👤",antwort:"💬",schritt:"⏭"};
  return (
    <div style={{marginTop:16,borderTop:"1px solid var(--line)",paddingTop:12}}>
      <div style={{fontSize:12,color:"var(--muted)",marginBottom:8,fontWeight:600}}>Verlauf</div>
      <div style={{display:"flex",gap:6,marginBottom:8}}>
        <input value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") add(); }} placeholder="Notiz hinzufügen, z.B. Telefonat mit …" style={{flex:1,border:"1px solid var(--line)",borderRadius:8,padding:"7px 9px",fontSize:12.5,fontFamily:"'Manrope',sans-serif",background:"var(--surface)",color:"var(--ink)"}}/>
        <button onClick={add} style={{background:"var(--ink)",color:"var(--surface)",border:"1px solid var(--ink)",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>Hinzufügen</button>
      </div>
      {rows===null&&<div style={{fontSize:12,color:"#8a8174"}}>Lädt …</div>}
      {rows&&rows.length===0&&<div style={{fontSize:12,color:"#8a8174"}}>Noch keine Einträge.</div>}
      {rows&&rows.map(r=>(
        <div key={r.id} style={{display:"flex",gap:8,padding:"5px 0",borderBottom:"1px solid #f0ebe1",fontSize:12.5,alignItems:"baseline"}}>
          <span style={{flexShrink:0,width:16,textAlign:"center"}}>{ICON[r.typ]||"•"}</span>
          <span style={{flex:1,color:"var(--ink)",lineHeight:1.45}}>{!dealId&&r.bereich==="wohnung"?dealName(r.deal_id):""}{r.text}</span>
          <span style={{flexShrink:0,fontSize:10.5,color:"#a0968a",whiteSpace:"nowrap"}}>{r.von&&r.von!=="system"?akqName(team,r.von)+" · ":""}{akqDatum(r.created_at)}</span>
        </div>
      ))}
    </div>
  );
}


// Vorschau vor dem Senden: zeigt die Mail genau so, wie sie rausgeht (mit Signatur und Anhang)
function AkqMailVorschau({absender,an,betreff,html,anhang,geplant,nachfass,antwort,meldung,onZurueck,onSenden}){
  const zeile=(l,v)=>(<div style={{display:"flex",gap:8,fontSize:12.5,padding:"2px 0"}}><span style={{width:62,flexShrink:0,color:"var(--muted)"}}>{l}</span><span style={{color:"var(--ink)",wordBreak:"break-all"}}>{v}</span></div>);
  return (
    <div style={{marginTop:12,border:"2px solid var(--ink)",borderRadius:10,padding:12,background:"#fff"}}>
      <div style={{fontSize:12,fontWeight:700,color:"var(--ink)",marginBottom:8}}>Vorschau: so wird die Mail gesendet</div>
      {zeile("Von",absender)}{zeile("An",an||"(fehlt)")}{zeile("Betreff",betreff||"(kein Betreff)")}
      {antwort&&zeile("Art","↩ Antwort im bestehenden Mailverlauf, die bisherige Mail wird darunter zitiert")}
      {anhang&&zeile("Anhang","📎 D&T Homes Pitch.pdf")}
      {geplant&&zeile("Versand",new Date(geplant).toLocaleString("de-CH",{weekday:"short",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}))}
      {nachfass&&zeile("Nachfass","nach 7 Tagen, falls keine Antwort kommt")}
      <iframe title="vorschau" srcDoc={'<div style="padding:10px">'+html+'</div>'} sandbox="" style={{width:"100%",height:380,border:"1px solid var(--line)",borderRadius:8,marginTop:8,background:"#fff"}}/>
      <div style={{display:"flex",gap:8,alignItems:"center",marginTop:10}}>
        {meldung&&<span style={{fontSize:11.5,color:meldung==="Gesendet"?"#3a5230":"#a4442e"}}>{meldung}</span>}
        <button onClick={onZurueck} style={{marginLeft:"auto",background:"none",border:"1px solid var(--line)",borderRadius:8,padding:"6px 12px",fontSize:12,color:"var(--muted)",cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>Zurück bearbeiten</button>
        <button onClick={onSenden} disabled={!an} style={{background:"var(--ink)",color:"var(--surface)",border:"1px solid var(--ink)",borderRadius:8,padding:"6px 14px",fontSize:12,cursor:an?"pointer":"default",opacity:an?1:0.5,fontFamily:"'Manrope',sans-serif"}}>{geplant?"Jetzt planen":"Jetzt senden"}</button>
      </div>
    </div>
  );
}

// ── Partner-Pipeline: Verwaltungen und Eigentümer, die wir direkt anschreiben ──
function PartnerPipeline({benutzerMail,navTarget,navigateTo,istAdmin}){
  const STAGES=[["prospect","Neu"],["angeschrieben","Angeschrieben"],["gespraech","Im Gespräch"],["partner","Partner"],["kein_interesse","Kein Interesse"]];
  const LBL=Object.fromEntries(STAGES);
  const TYP={verwaltung:"Verwaltung",eigentuemer:"Eigentümer",partner:"Partner",andere:"Andere"};
  const TYPFARBE={verwaltung:["#eef1f6","#3a4a63"],eigentuemer:["#e8efde","#3a5230"],andere:["#f2ecdb","#7c6a4e"],partner:["#f2ecdb","#7c6a4e"]};
  const TypTag=({typ})=>{ const t=typ||"verwaltung"; const f=TYPFARBE[t]||TYPFARBE.andere; return <span style={{background:f[0],color:f[1],fontSize:10,padding:"1px 7px",borderRadius:8,fontWeight:600,marginRight:2}}>{TYP[t]||t}</span>; };
  const ich=String(benutzerMail||"").toLowerCase();
  const team=useAkquiseTeam();
  const [orgs,setOrgs]=useState([]);
  const [ks,setKs]=useState([]);
  const [deals,setDeals]=useState([]);
  const [scheduled,setScheduled]=useState([]);
  const [loading,setLoading]=useState(true);
  const [q,setQ]=useState("");
  const [typF,setTypF]=useState("alle");
  const [wer,setWer]=useState("alle");
  const [nurAntwort,setNurAntwort]=useState(false);
  const [selName,setSelName]=useState(null);
  const [neu,setNeu]=useState(null);
  const [compose,setCompose]=useState(null);
  const [sendMsg,setSendMsg]=useState("");
  const [thread,setThread]=useState(null);
  const [openMsg,setOpenMsg]=useState(null);
  const [logTick,setLogTick]=useState(0);
  const laden=()=>{
    supabase.from("org_status").select("*").then(({data})=>{ setOrgs(data||[]); setLoading(false); }).catch(()=>setLoading(false));
    supabase.from("kontakte").select("id,name,email,phone,rolle,organisation").then(({data})=>setKs(data||[])).catch(()=>{});
    supabase.from("pipeline").select("id,agency_name,stage,strasse,ort,zustaendig").then(({data})=>setDeals(data||[])).catch(()=>{});
    supabase.from("scheduled_mails").select("id,organisation,send_at,subject,is_followup,status").eq("status","pending").not("organisation","is",null).then(({data})=>setScheduled(data||[])).catch(()=>{});
  };
  useEffect(()=>{ laden(); const ch=supabase.channel("partner_pipeline").on("postgres_changes",{event:"*",schema:"public",table:"org_status"},laden).subscribe(); return ()=>{supabase.removeChannel(ch);}; },[]);
  const sel=selName?orgs.find(o=>o.organisation===selName)||null:null;
  useEffect(()=>{ if(navTarget&&navTarget.type==="partnerpipeline"&&navTarget.id&&orgs.length){ const t=String(navTarget.id).toLowerCase().trim(); const f=orgs.find(x=>x.organisation.toLowerCase().trim()===t)||orgs.find(x=>akqFirmaNorm(x.organisation)===akqFirmaNorm(t)); if(f) setSelName(f.organisation); } },[navTarget,orgs.length]);
  const [wohnungen,setWohnungen]=useState([]);
  useEffect(()=>{ setWohnungen([]); if(selName) supabase.rpc("org_wohnungen",{p_org:selName}).then(({data})=>setWohnungen(data||[])).catch(()=>{}); },[selName]);
  const kontakteVon=(org)=>ks.filter(k=>(k.organisation||"").toLowerCase()===String(org||"").toLowerCase());
  const empfaengerVon=(o)=>{ const list=kontakteVon(o.organisation).filter(k=>k.email); if(o.email&&!list.some(k=>(k.email||"").toLowerCase()===o.email.toLowerCase())) list.push({id:"firma",name:"",email:o.email,rolle:"Firmen-Adresse"}); return list; };
  const dealsVon=(org)=>deals.filter(d=>(d.agency_name||"").toLowerCase()===String(org||"").toLowerCase());
  const heute=()=>new Date().toISOString().slice(0,10);
  const patch=(org,f,log)=>{ const upd={...f,updated_at:new Date().toISOString()}; setOrgs(os=>os.map(o=>o.organisation===org?{...o,...upd}:o)); return supabase.from("org_status").update(upd).eq("organisation",org).then(({error})=>{ if(error){ toast("Speichern fehlgeschlagen","error"); laden(); return; } if(log){ akqLog({bereich:"partner",organisation:org,von:ich||null,...log}).then(()=>setLogTick(t=>t+1)); } }); };
  const setStage=(o,v)=>{ if(o.status===v) return; const f={status:v}; if(v==="angeschrieben"&&!o.kontaktiert_am) f.kontaktiert_am=heute(); if(!o.zustaendig&&ich) f.zustaendig=ich; patch(o.organisation,f,{typ:"phase",text:"Phase: "+(LBL[o.status]||"Neu")+" → "+LBL[v]}); };
  const setZust=(o,v)=>patch(o.organisation,{zustaendig:v||null},{typ:"zustaendig",text:v?("Zuständig: "+akqName(team,v)):"Zuständigkeit entfernt"});
  const _q=q.toLowerCase().trim();
  const sichtbar=orgs.filter(o=>{
    if(typF!=="alle"&&(o.typ||"verwaltung")!==typF) return false;
    if(!akqPasstPerson(wer,o.zustaendig,ich)) return false;
    if(nurAntwort&&!o.reply_pending) return false;
    if(!_q) return true;
    const persons=kontakteVon(o.organisation).map(k=>(k.name||"")+" "+(k.email||"")).join(" ");
    return (o.organisation+" "+(o.email||"")+" "+(o.notizen||"")+" "+persons).toLowerCase().includes(_q);
  });
  const fmtD=(d)=>d?String(d).slice(0,10).split("-").reverse().join("."):"";
  const dTage=(iso)=>iso?Math.floor((Date.now()-new Date(iso).getTime())/86400000):null;
  const vorname=(k)=>{ const n=String((k&&k.name)||"").trim(); return n.split(/\s+/)[0]||""; };
  const tplKalt=(k,typ)=>{ const n=vorname(k); if(typ==="eigentuemer") return [n?("Guten Tag "+n+","):"Guten Tag,","","Ich hoffe, es geht dir gut und das direkte Du ist für dich in Ordnung. 🙂","","Mit D&T Homes mieten wir in Zürich Wohnungen direkt von Eigentümern an, befristet wie unbefristet und zu marktüblichen Konditionen. Wir richten sie ein und vermieten sie möbliert an Studierende und Young Professionals. Besonders gut passen wir, wenn eine Liegenschaft vor einer Sanierung, einem Umbau oder einem Neubau steht und die Wohnungen bis dahin sinnvoll genutzt werden sollen.","","Für euch bedeutet das einen einzigen Mieter für mehrere Wohnungen, sichere Mieteinnahmen ohne Leerstand und keinen Verwaltungsaufwand. Vermarktung, Betreuung der Bewohner und die Rückgabe der Wohnungen übernehmen wir vollständig, auf Wunsch auch in Absprache mit eurer Verwaltung.","","Habt ihr aktuell oder in nächster Zeit Wohnungen oder Liegenschaften, bei denen das für euch interessant wäre? Gerne stelle ich euch unser Modell in einem kurzen Gespräch vor.","","Im Anhang findest du unser kurzes Pitch-Deck mit den wichtigsten Informationen.","","Ich freue mich auf deine Rückmeldung!"].join("\n"); return [n?("Guten Tag "+n+","):"Guten Tag,","","Ich hoffe, es geht dir gut und das direkte Du ist für dich in Ordnung. 🙂","","Mit D&T Homes mieten wir in Zürich Wohnungen zu marktüblichen Konditionen an, befristet wie unbefristet. Wir richten sie ein und vermieten sie möbliert an Studierende und Young Professionals. Besonders gut passen wir bei Zwischennutzungen, zum Beispiel vor einer Sanierung oder einem Neubau.","","Für euch bedeutet das einen einzigen, zuverlässigen Vertragspartner, planbare Mieteinnahmen und keinen Leerstand. Den gesamten operativen Aufwand, von der Vermarktung über die Betreuung der Mieter bis zur Rückgabe der Wohnung, übernehmen wir vollständig.","","Habt ihr aktuell oder in nächster Zeit Wohnungen oder Liegenschaften, bei denen eine Zusammenarbeit für euch interessant wäre? Gerne stelle ich euch unser Modell auch in einem kurzen Gespräch vor.","","Im Anhang findest du unser kurzes Pitch-Deck mit den wichtigsten Informationen.","","Ich freue mich auf deine Rückmeldung!"].join("\n"); };
  const tplNachfass=(k)=>{ const n=vorname(k); return [n?("Guten Tag "+n+","):"Guten Tag,","","ich wollte kurz nachfragen, ob meine Nachricht bei dir angekommen ist. Gerne stelle ich euch unser Modell auch in einem kurzen Gespräch vor.","","Ich freue mich auf deine Rückmeldung!"].join("\n"); };
  const tplWarm=(k)=>{ const n=vorname(k); return [n?("Hoi "+n+","):"Hallo,","","Ich hoffe, es geht dir gut! 🙂","","Ich wollte mich kurz melden: Habt ihr aktuell oder demnächst Wohnungen, die frei werden oder befristet vermietet werden? Wir hätten weiterhin grosses Interesse, weitere Objekte von euch anzumieten.","","Lass mich gerne wissen, falls etwas passt.","","Danke dir!"].join("\n"); };
  const openCompose=(o,k)=>{ const emp=empfaengerVon(o); const kk=k||emp[0]||null; const warm=o.status==="partner"; setSendMsg(""); setCompose({org:o.organisation,kontakt:kk,to:(kk&&kk.email)||"",subject:warm?"Freie Wohnungen":"Zusammenarbeit mit D&T Homes",tpl:warm?"warm":"kalt",body:warm?tplWarm(kk):tplKalt(kk,o.typ),attach:!warm,catchup:!warm,schedAt:""}); };
  const setTpl=(tpl)=>setCompose(c=>c?{...c,tpl,body:tpl==="warm"?tplWarm(c.kontakt):tpl==="nachfass"?tplNachfass(c.kontakt):tplKalt(c.kontakt,(orgs.find(x=>x.organisation===c.org)||{}).typ),attach:tpl==="kalt",catchup:tpl==="kalt",subject:tpl==="warm"?"Freie Wohnungen":tpl==="nachfass"?("AW: "+(c.subject||"Zusammenarbeit mit D&T Homes").replace(/^AW:\s*/,"")):"Zusammenarbeit mit D&T Homes"}:c);
  const absMail=akqAbsender(ich), absName=akqAbsenderName(team,ich);
  const nachfassPlanen=(c,baseMs)=>{ const txt=tplNachfass(c.kontakt); const gs=new Date(baseMs).toLocaleString("de-CH",{weekday:"long",day:"2-digit",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}); const html=akqMailHtml(txt,absName)+'<div style="font-family:Aptos,Calibri,sans-serif;font-size:11pt;color:#000000;border-top:1px solid #ccc;padding-top:10px;margin-top:14px"><b>Von:</b> '+akqEsc(absName)+' &lt;'+akqEsc(absMail)+'&gt;<br><b>Gesendet:</b> '+gs+'<br><b>An:</b> '+akqEsc(c.to)+'<br><b>Betreff:</b> '+akqEsc(c.subject)+'</div>'+akqMailHtml(c.body,absName); return supabase.from("scheduled_mails").insert({organisation:c.org,to_addr:c.to,subject:"AW: "+c.subject,body:txt,html,attachments:null,send_at:new Date(baseMs+7*86400000).toISOString(),status:"pending",is_followup:true,reply_check_after:new Date(baseMs).toISOString(),absender:absMail}); };
  const nachSenden=(c,geplant)=>{ const o=orgs.find(x=>x.organisation===c.org)||{}; const f={reply_pending:false}; if(!geplant&&(o.status==="prospect"||!o.status)){ f.status="angeschrieben"; f.kontaktiert_am=heute(); } if(!o.zustaendig&&ich) f.zustaendig=ich; patch(c.org,f,null); };
  const doSend=()=>{ const c=compose; if(!c) return; if(!c.to){ setSendMsg("Bitte Empfänger angeben"); return; } const html=akqMailHtml(c.body,absName); const att=c.attach?[{name:"D&T Homes Pitch.pdf",url:"https://admin.dthomes.ch/DT_Homes_Pitch.pdf",contentType:"application/pdf"}]:null;
    if(c.schedAt){ const when=new Date(c.schedAt); if(isNaN(when.getTime())||when<=new Date()){ setSendMsg("Sendezeit muss in der Zukunft liegen"); return; } setSendMsg("plane …"); supabase.from("scheduled_mails").insert({organisation:c.org,to_addr:c.to,subject:c.subject,body:c.body,html,attachments:att,send_at:when.toISOString(),status:"pending",absender:absMail}).then(({error})=>{ if(error){ setSendMsg("Planen fehlgeschlagen: "+error.message); return; } if(c.catchup) nachfassPlanen(c,when.getTime()); akqLog({bereich:"partner",organisation:c.org,typ:"mail",text:"Mail geplant für "+when.toLocaleString("de-CH",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})+" an "+c.to+": "+c.subject,von:ich||null}).then(()=>setLogTick(t=>t+1)); nachSenden(c,true); setCompose(null); laden(); }); return; }
    setSendMsg("sende …"); const payload={to:c.to,subject:c.subject,body:c.body,html}; if(att) payload.attachments=att; if(c.replyTo){ payload.replyTo=c.replyTo; payload.postfach=c.postfach; }
    supabase.functions.invoke("outlook-send",{body:payload}).then(({data,error})=>{ if(error||!data||data.error){ setSendMsg((data&&data.error==="not_configured")?"Outlook noch nicht verbunden":"Senden fehlgeschlagen"); return; } akqLog({bereich:"partner",organisation:c.org,typ:"mail",text:"Mail gesendet an "+c.to+": "+c.subject+(data.absender&&data.absender!==ich?" (über "+data.absender+")":""),von:ich||null}).then(()=>setLogTick(t=>t+1)); if(c.catchup) nachfassPlanen(c,Date.now()).then(()=>laden()); nachSenden(c,false); setCompose(null); ladeThread(c.to); }).catch(()=>setSendMsg("Senden fehlgeschlagen")); };
  const [drafting,setDrafting]=useState(false);
  const antworten=(m)=>{ if(!sel) return; setSendMsg(""); const kk=kontakteVon(sel.organisation).find(k=>(k.email||"").toLowerCase()===(m.from||"").toLowerCase())||{name:m.fromName||"",email:m.from}; setCompose({org:sel.organisation,kontakt:kk,to:m.from||"",subject:/^(aw|re|wg|fw):/i.test(m.subject||"")?m.subject:"AW: "+(m.subject||""),tpl:"antwort",body:"",attach:false,catchup:false,schedAt:"",replyTo:m.id,postfach:(thread&&thread.postfach)||undefined,_bezug:m}); };
  const kiAntwort=()=>{ if(!compose||!compose.replyTo) return; setDrafting(true); setSendMsg(""); supabase.functions.invoke("draft-reply",{body:{organisation:compose.org,message_id:compose.replyTo,postfach:compose.postfach}}).then(({data,error})=>{ setDrafting(false); if(error||!data||data.error){ setSendMsg(data&&data.error==="not_configured"?"KI-Antwort nicht aktiv (API-Schlüssel fehlt)":"KI-Entwurf fehlgeschlagen"); return; } setCompose(c=>c?{...c,body:data.draft||""}:c); }).catch(()=>{ setDrafting(false); setSendMsg("KI-Entwurf fehlgeschlagen"); }); };
  const ladeThread=(email)=>{ setOpenMsg(null); if(!email){ setThread({messages:[]}); return; } setThread({loading:true,email}); const o=sel||{}; supabase.functions.invoke("outlook-thread",{body:{email,postfach:o.zustaendig||undefined}}).then(({data,error})=>setThread((error||!data||data.error)?{error:"x",email}:{messages:data.messages||[],email,postfach:data.postfach})).catch(()=>setThread({error:"x",email})); };
  useEffect(()=>{ setCompose(null); setThread(null); if(sel){ const e=empfaengerVon(sel)[0]; if(e) ladeThread(e.email); } },[selName]);
  const neuSpeichern=()=>{ const n=neu; const name=(n.organisation||"").trim(); if(!name){ alert("Bitte Firmennamen angeben."); return; } if(orgs.some(o=>o.organisation.toLowerCase()===name.toLowerCase())){ alert("Diese Firma gibt es schon."); return; } const aehnlich=akqAehnlicheFirmen(name,orgs.map(o=>o.organisation)); if(aehnlich.length&&!confirm("Ähnliche Firma schon erfasst: "+aehnlich.join(", ")+".\n\nTrotzdem als neue Firma anlegen?")) return; if(n.kemail&&ks.some(k=>(k.email||"").toLowerCase()===n.kemail.trim().toLowerCase())){ const k=ks.find(k=>(k.email||"").toLowerCase()===n.kemail.trim().toLowerCase()); alert("Die E-Mail "+n.kemail+" gehört schon zu "+(k.name||"einem Kontakt")+(k.organisation?" bei "+k.organisation:"")+"."); return; } const row={organisation:name,typ:n.typ||"verwaltung",status:"prospect",email:n.email||null,telefon:n.telefon||null,website:n.website||null,zustaendig:ich||null,updated_at:new Date().toISOString()}; supabase.from("org_status").insert(row).then(({error})=>{ if(error){ toast("Speichern fehlgeschlagen","error"); return; } const fertig=()=>{ akqLog({bereich:"partner",organisation:name,typ:"phase",text:"Firma erfasst",von:ich||null}); setNeu(null); laden(); setSelName(name); }; if(n.kname||n.kemail){ supabase.from("kontakte").insert({name:n.kname||null,email:n.kemail?n.kemail.toLowerCase():null,organisation:name,org_type:n.typ||"verwaltung",rolle:n.krolle||null}).then(fertig); } else fertig(); }); };
  const kontaktNeu=(o)=>{ const name=prompt("Name der Ansprechperson:"); if(name===null) return; const email=prompt("E-Mail:"); if(email===null) return; if(!name.trim()&&!email.trim()) return; const dup=email.trim()&&ks.find(k=>(k.email||"").toLowerCase()===email.trim().toLowerCase()); if(dup){ alert("Die E-Mail gehört schon zu "+(dup.name||"einem Kontakt")+(dup.organisation?" bei "+dup.organisation:"")+"."); return; } supabase.from("kontakte").insert({name:name.trim()||null,email:email.trim().toLowerCase()||null,organisation:o.organisation,org_type:o.typ||"verwaltung"}).then(({error})=>{ if(error){ toast("Speichern fehlgeschlagen","error"); return; } akqLog({bereich:"partner",organisation:o.organisation,typ:"notiz",text:"Ansprechperson erfasst: "+(name.trim()||email.trim()),von:ich||null}).then(()=>setLogTick(t=>t+1)); laden(); }); };
  const inp={border:"1px solid var(--line)",borderRadius:8,padding:"7px 9px",fontSize:12.5,fontFamily:"'Manrope',sans-serif",background:"var(--surface)",color:"var(--ink)",width:"100%",boxSizing:"border-box"};
  const LBL2={fontSize:10,color:"var(--muted)",fontWeight:700,letterSpacing:"0.4px",textTransform:"uppercase",display:"block",marginBottom:3};
  const knopf={background:"var(--ink)",color:"var(--surface)",border:"1px solid var(--ink)",borderRadius:8,padding:"7px 14px",fontSize:12.5,cursor:"pointer",fontFamily:"'Manrope',sans-serif",whiteSpace:"nowrap"};
  const knopf2={background:"none",border:"1px solid var(--line)",borderRadius:8,padding:"6px 12px",fontSize:12,color:"var(--muted)",cursor:"pointer",fontFamily:"'Manrope',sans-serif"};
  const o=sel;
  return (
    <div style={{padding:"8px",maxWidth:1300}}>
      <div style={{marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
        <div>
          <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:24,color:"var(--ink)"}}>Partner-Pipeline</div>
          <div style={{fontSize:13,color:"var(--muted)",marginTop:4}}>Verwaltungen und Eigentümer, die wir direkt anschreiben. Wer ist dran, wer wurde schon angeschrieben, wer hat kein Interesse.</div>
        </div>
        <button onClick={()=>setNeu({typ:"verwaltung"})} style={knopf}>+ Neue Firma</button>
      </div>
      <div style={{display:"flex",gap:0,marginBottom:12,border:"1px solid var(--line)",borderRadius:10,overflow:"hidden",width:"fit-content",maxWidth:"100%"}}>
        {[["alle","Alle"],["verwaltung","Verwaltungen"],["eigentuemer","Eigentümer"],["andere","Andere"]].filter(([v])=>v!=="andere"||orgs.some(x=>x.typ==="andere")).map(([v,l])=>{ const n=v==="alle"?orgs.length:orgs.filter(x=>(x.typ||"verwaltung")===v).length; const an=typF===v; return <button key={v} onClick={()=>setTypF(v)} style={{background:an?"var(--ink)":"var(--surface)",color:an?"var(--surface)":"var(--ink)",border:"none",borderRight:"1px solid var(--line)",padding:"8px 16px",fontSize:13,fontWeight:an?700:500,cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>{l} <span style={{opacity:0.6,fontWeight:500}}>{n}</span></button>; })}
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:14}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Suche: Firma, Person, E-Mail …" style={{...inp,flex:1,minWidth:200,width:"auto",padding:"8px 12px",fontSize:13}}/>
        <AkqPersonFilter team={team} value={wer} onChange={setWer} ich={ich}/>
        <button onClick={()=>setNurAntwort(v=>!v)} style={{...knopf2,background:nurAntwort?"var(--ink)":"var(--surface)",color:nurAntwort?"var(--surface)":"var(--muted)"}}>💬 Antwort offen</button>
      </div>
      {loading&&<div style={{padding:"30px 8px",color:"#8a8174",fontSize:13}}>Lädt …</div>}
      <div style={{display:"flex",gap:12,overflowX:"auto",paddingBottom:8}}>
        {STAGES.map(([sid,slbl],si)=>{ const col=sichtbar.filter(x=>(x.status||"prospect")===sid).sort((a,b)=>String(b.updated_at||"").localeCompare(String(a.updated_at||""))); return (
          <div key={sid} style={{minWidth:232,width:232,flexShrink:0,background:"#f3efe6",borderRadius:12,padding:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"3px 6px 8px"}}>
              <span style={{fontSize:12.5,fontWeight:700,color:"var(--ink)"}}>{slbl}</span>
              <span style={{fontSize:10.5,color:"var(--muted)"}}>{col.length}</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {col.map(x=>{ const kz=kontakteVon(x.organisation).length; const dz=dealsVon(x.organisation).length; const idle=["angeschrieben","gespraech"].includes(sid)?dTage(x.updated_at):null; const geplant=scheduled.some(s=>s.organisation===x.organisation); return (
                <div key={x.organisation} style={{background:"var(--surface)",border:"1px solid var(--line)",borderRadius:10,padding:"10px 11px"}}>
                  <div onClick={()=>setSelName(x.organisation)} style={{cursor:"pointer"}}>
                    <div style={{display:"flex",justifyContent:"space-between",gap:6,alignItems:"flex-start"}}>
                      <div style={{fontSize:13,fontWeight:600,color:"var(--ink)",lineHeight:1.35}}>{x.organisation}</div>
                      <AkqChip name={x.zustaendig?akqName(team,x.zustaendig):""} leer/>
                    </div>
                    <div style={{fontSize:11,color:"#a0968a",marginTop:3}}><TypTag typ={x.typ}/>{kz?" "+kz+" Kontakt"+(kz>1?"e":""):" kein Kontakt"}{dz?" · "+dz+" Wohnung"+(dz>1?"en":""):""}</div>
                    {x.kontaktiert_am&&<div style={{fontSize:10.5,color:"var(--muted)",marginTop:3}}>Angeschrieben {fmtD(x.kontaktiert_am)}</div>}
                    {x.reply_pending&&<div style={{fontSize:10.5,color:"#b5651d",marginTop:3,fontWeight:700}}>💬 Antwort offen</div>}
                    {geplant&&<div style={{fontSize:10.5,color:"#3a5230",marginTop:3,fontWeight:600}}>📅 Mail geplant</div>}
                    {x.naechster_schritt&&<div style={{fontSize:11.5,color:"var(--muted)",marginTop:4}}>⏭ {x.naechster_schritt}</div>}
                    {x.wiedervorlage&&<div style={{fontSize:10.5,marginTop:3,color:x.wiedervorlage<=heute()?"#a4442e":"#3a4a63",fontWeight:600}}>{x.wiedervorlage<heute()?"überfällig":x.wiedervorlage===heute()?"heute fällig":"Wiedervorlage "+fmtD(x.wiedervorlage)}</div>}
                    {idle!=null&&idle>=14&&!x.reply_pending&&<div style={{fontSize:10.5,color:"#a0968a",marginTop:3}}>seit {idle} Tagen ruhig</div>}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
                    <button onClick={()=>{ if(si>0) setStage(x,STAGES[si-1][0]); }} disabled={si===0} style={{background:"none",border:"1px solid var(--line)",borderRadius:6,padding:"1px 8px",fontSize:11,color:"var(--muted)",cursor:si===0?"default":"pointer",opacity:si===0?0.35:1}}>←</button>
                    <button onClick={()=>{ if(si<STAGES.length-1) setStage(x,STAGES[si+1][0]); }} disabled={si===STAGES.length-1} style={{background:"none",border:"1px solid var(--line)",borderRadius:6,padding:"1px 8px",fontSize:11,color:"var(--muted)",cursor:si===STAGES.length-1?"default":"pointer",opacity:si===STAGES.length-1?0.35:1}}>→</button>
                  </div>
                </div>
              ); })}
              {col.length===0&&<div style={{fontSize:11,color:"#b9b0a2",padding:"6px"}}>leer</div>}
            </div>
          </div>
        ); })}
      </div>

      {neu&&(
        <div className="ov-x" onClick={()=>setNeu(null)} style={{position:"fixed",inset:0,background:"rgba(26,24,20,.45)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,zIndex:2000}}>
          <div className="modal-x" onClick={e=>e.stopPropagation()} style={{background:"var(--surface)",borderRadius:14,maxWidth:520,width:"100%",padding:20,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div style={{gridColumn:"1 / -1",fontFamily:"Georgia,'Times New Roman',serif",fontSize:19,color:"var(--ink)"}}>Neue Firma</div>
            <div style={{gridColumn:"1 / -1"}}><label style={LBL2}>Firma</label><input value={neu.organisation||""} onChange={e=>setNeu({...neu,organisation:e.target.value})} style={inp}/></div>
            <div><label style={LBL2}>Typ</label><select value={neu.typ} onChange={e=>setNeu({...neu,typ:e.target.value})} style={inp}><option value="verwaltung">Verwaltung</option><option value="eigentuemer">Eigentümer</option><option value="andere">Andere</option></select></div>
            <div><label style={LBL2}>Website</label><input value={neu.website||""} onChange={e=>setNeu({...neu,website:e.target.value})} style={inp}/></div>
            <div><label style={LBL2}>Firmen-E-Mail</label><input value={neu.email||""} onChange={e=>setNeu({...neu,email:e.target.value})} style={inp}/></div>
            <div><label style={LBL2}>Telefon</label><input value={neu.telefon||""} onChange={e=>setNeu({...neu,telefon:e.target.value})} style={inp}/></div>
            <div style={{gridColumn:"1 / -1",fontSize:11.5,color:"var(--muted)",marginTop:4}}>Ansprechperson (optional)</div>
            <div><label style={LBL2}>Name</label><input value={neu.kname||""} onChange={e=>setNeu({...neu,kname:e.target.value})} style={inp}/></div>
            <div><label style={LBL2}>E-Mail</label><input value={neu.kemail||""} onChange={e=>setNeu({...neu,kemail:e.target.value})} style={inp}/></div>
            <div style={{gridColumn:"1 / -1"}}><label style={LBL2}>Funktion</label><input value={neu.krolle||""} onChange={e=>setNeu({...neu,krolle:e.target.value})} placeholder="z.B. Leiterin Bewirtschaftung" style={inp}/></div>
            <div style={{gridColumn:"1 / -1",display:"flex",justifyContent:"flex-end",gap:8,marginTop:6}}>
              <button onClick={()=>setNeu(null)} style={knopf2}>Abbrechen</button>
              <button onClick={neuSpeichern} style={knopf}>Erfassen</button>
            </div>
          </div>
        </div>
      )}

      {o&&(
        <div className="ov-x" onClick={()=>setSelName(null)} style={{position:"fixed",inset:0,background:"rgba(40,36,30,0.45)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"24px 12px",zIndex:1000,overflow:"auto"}}>
          <div className="modal-x" onClick={e=>e.stopPropagation()} style={{background:"var(--surface)",border:"1px solid var(--line)",borderRadius:14,maxWidth:600,width:"100%",padding:"20px",boxShadow:"0 12px 40px rgba(0,0,0,0.18)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
              <div style={{minWidth:0}}>
                <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:19,color:"var(--ink)"}}>{o.organisation}</div>
                <div style={{fontSize:12.5,color:"var(--muted)",marginTop:4,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}><select value={o.typ||"verwaltung"} onChange={e=>patch(o.organisation,{typ:e.target.value},{typ:"notiz",text:"Typ: "+TYP[e.target.value]})} style={{border:"1px solid var(--line)",borderRadius:8,padding:"3px 6px",fontSize:12,fontFamily:"'Manrope',sans-serif",background:(TYPFARBE[o.typ||"verwaltung"]||TYPFARBE.andere)[0],color:(TYPFARBE[o.typ||"verwaltung"]||TYPFARBE.andere)[1],fontWeight:600}}><option value="verwaltung">Verwaltung</option><option value="eigentuemer">Eigentümer</option><option value="andere">Andere</option></select>{o.website?<> · <a href={/^https?:/.test(o.website)?o.website:"https://"+o.website} target="_blank" rel="noreferrer" style={{color:"#3a5230"}}>Website ↗</a></>:null}{o.telefon?" · "+o.telefon:""}</div>
              </div>
              <button onClick={()=>setSelName(null)} style={{background:"none",border:"none",fontSize:22,color:"var(--muted)",cursor:"pointer",lineHeight:1}}>×</button>
            </div>
            <div style={{display:"flex",gap:2,margin:"14px 0 4px"}}>
              {STAGES.map(([sid,slbl],i)=>{ const idx=STAGES.findIndex(z=>z[0]===(o.status||"prospect")); const cur=i===idx; const passed=i<idx&&sid!=="kein_interesse"; const bg=cur?(sid==="partner"?"#3a5230":sid==="kein_interesse"?"#a4442e":"var(--ink)"):passed?"#d8cfbe":"#ece5d8"; return <button key={sid} onClick={()=>setStage(o,sid)} style={{flex:1,background:bg,color:cur?"#fff":"#6e6a62",border:"none",padding:"6px 2px",fontSize:11,cursor:"pointer",fontFamily:"'Manrope',sans-serif",borderRadius:i===0?"8px 0 0 8px":i===STAGES.length-1?"0 8px 8px 0":0}}>{slbl}</button>; })}
            </div>
            <div style={{marginTop:12}}><label style={LBL2}>Zuständig</label><AkqZustaendig value={o.zustaendig} team={team} ich={ich} onChange={v=>setZust(o,v)}/></div>
            {o.reply_pending&&(
              <div style={{marginTop:10,fontSize:12,color:"#8a5a1d",background:"#fbf0df",border:"1px solid #e6cfa0",borderRadius:8,padding:"8px 11px",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span>💬 <strong>Antwort erhalten</strong>{o.last_reply_at?" am "+akqDatum(o.last_reply_at):""}</span>
                <button onClick={()=>patch(o.organisation,{reply_pending:false},null)} style={{marginLeft:"auto",...knopf2,padding:"3px 10px",fontSize:11}}>erledigt</button>
              </div>
            )}
            <div style={{marginTop:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}><label style={LBL2}>Ansprechpersonen</label><button onClick={()=>kontaktNeu(o)} style={{background:"none",border:"none",color:"#3a5230",fontSize:11.5,cursor:"pointer"}}>+ Person</button></div>
              {empfaengerVon(o).length===0&&<div style={{fontSize:12,color:"#a4442e"}}>Noch keine E-Mail-Adresse. Erfasse zuerst eine Ansprechperson.</div>}
              {empfaengerVon(o).map(k=>(
                <div key={k.id+(k.email||"")} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid #f0ebe1",fontSize:12.5}}>
                  <div style={{flex:1,minWidth:0}}><span style={{color:"var(--ink)",fontWeight:600}}>{k.name||k.rolle||"Firmen-Adresse"}</span><span style={{color:"var(--muted)"}}>{k.name&&k.rolle?" · "+k.rolle:""} · {k.email}</span></div>
                  <button onClick={()=>ladeThread(k.email)} title="Mailverlauf" style={{...knopf2,padding:"3px 8px",fontSize:11}}>Verlauf</button>
                  <button onClick={()=>openCompose(o,k)} style={{...knopf,padding:"4px 10px",fontSize:11.5}}>E-Mail</button>
                </div>
              ))}
              {dealsVon(o.organisation).length>0&&(<div style={{marginTop:12}}>
                <label style={LBL2}>Wohnungs-Pipeline ({dealsVon(o.organisation).length})</label>
                {dealsVon(o.organisation).map(dd=>(<div key={dd.id} onClick={()=>navigateTo&&navigateTo("pipeline",dd.id)} style={{display:"flex",gap:8,alignItems:"center",padding:"5px 0",borderBottom:"1px solid #f0ebe1",fontSize:12.5,cursor:navigateTo?"pointer":"default"}}><span style={{flex:1,color:"var(--ink)"}}>🏠 {dd.strasse||"Adresse"}{dd.ort?", "+dd.ort:""}</span><span style={{fontSize:10.5,color:"var(--muted)"}}>{({neu:"Neu",kontaktiert:"Kontaktiert",antwort:"Antwort",gewonnen:"Zusage",verloren:"Absage"})[dd.stage]||dd.stage}</span><AkqChip name={dd.zustaendig?akqName(team,dd.zustaendig):""}/>{navigateTo&&<span style={{color:"#3a5230",fontSize:11}}>→</span>}</div>))}
              </div>)}
              {wohnungen.length>0&&(<div style={{marginTop:12}}>
                <label style={LBL2}>Bestehende Wohnungen mit {o.organisation} ({wohnungen.length})</label>
                {wohnungen.map(w=>(<div key={w.id} onClick={()=>istAdmin&&navigateTo&&navigateTo("wohnungen",w.id)} style={{display:"flex",gap:8,alignItems:"center",padding:"5px 0",borderBottom:"1px solid #f0ebe1",fontSize:12.5,cursor:istAdmin?"pointer":"default"}}><span style={{flex:1,color:"var(--ink)"}}>🔑 {w.id} · {w.adresse||""}{w.ort?", "+w.ort:""}</span><span style={{fontSize:10.5,color:"var(--muted)"}}>{w.rolle}{w.mietende?" · bis "+w.mietende:""}</span>{istAdmin&&navigateTo&&<span style={{color:"#3a5230",fontSize:11}}>→</span>}</div>))}
              </div>)}
            </div>
            {scheduled.filter(s=>s.organisation===o.organisation).map(s=>(
              <div key={s.id} style={{marginTop:10,background:"#eef5e8",border:"1px solid #cfe0c4",borderRadius:8,padding:"8px 11px",fontSize:12,color:"#2f5a2a",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <span>📅 <strong>{s.is_followup?"Nachfass geplant":"Geplant"}</strong> für {new Date(s.send_at).toLocaleString("de-CH",{weekday:"short",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})} · {s.subject}</span>
                <button onClick={()=>{ if(!confirm("Geplante Mail abbrechen?")) return; supabase.from("scheduled_mails").delete().eq("id",s.id).then(()=>laden()); }} style={{marginLeft:"auto",...knopf2,padding:"2px 8px",fontSize:11}}>abbrechen</button>
              </div>
            ))}
            {compose&&compose.org===o.organisation&&compose.vorschau&&(
              <AkqMailVorschau absender={absName+" <"+absMail+">"} an={compose.to} betreff={compose.subject} html={akqMailHtml(compose.body,absName)} anhang={compose.attach} geplant={compose.schedAt||""} nachfass={!compose.replyTo&&compose.catchup} antwort={!!compose.replyTo} meldung={sendMsg} onZurueck={()=>{ setSendMsg(""); setCompose({...compose,vorschau:false}); }} onSenden={doSend}/>
            )}
            {compose&&compose.org===o.organisation&&!compose.vorschau&&(
              <div style={{marginTop:12,border:"1px solid var(--line)",borderRadius:10,padding:12,background:"#faf8f3"}}>
                {compose.replyTo&&(<div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:6,fontSize:12,color:"var(--ink)",background:"#eef1f6",padding:"6px 8px",borderRadius:6}}><span>↩ Antwort auf «{compose._bezug&&compose._bezug.subject}»</span><button onClick={kiAntwort} disabled={drafting} style={{marginLeft:"auto",...knopf2,padding:"3px 10px",fontSize:11.5}}>{drafting?"KI schreibt …":"✨ KI-Entwurf"}</button></div>)}
                {!compose.replyTo&&<select value={compose.tpl} onChange={e=>setTpl(e.target.value)} style={{...inp,marginBottom:6,fontWeight:600}}><option value="kalt">Vorlage: Erstkontakt {(o.typ||"verwaltung")==="eigentuemer"?"Eigentümer":"Verwaltung"} (mit Pitch-Deck)</option><option value="warm">Vorlage: Bestehender Partner</option><option value="nachfass">Vorlage: Nachfassen</option></select>}
                <input value={compose.to} onChange={e=>setCompose({...compose,to:e.target.value})} placeholder="An" style={{...inp,marginBottom:6}}/>
                <input value={compose.subject} onChange={e=>setCompose({...compose,subject:e.target.value})} placeholder="Betreff" style={{...inp,marginBottom:6}}/>
                <textarea value={compose.body} onChange={e=>setCompose({...compose,body:e.target.value})} style={{...inp,minHeight:200,resize:"vertical",marginBottom:6}}/>
                <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"var(--muted)",marginBottom:6,cursor:"pointer"}}><input type="checkbox" checked={!!compose.attach} onChange={e=>setCompose({...compose,attach:e.target.checked})}/> Pitch-Deck anhängen</label>
                <div style={{marginBottom:6,fontSize:11,color:"var(--muted)"}}>📧 Gesendet von {absMail} mit Signatur «{absName}».{absMail!==ich&&ich?" Du hast kein eigenes D&T-Postfach, deshalb geht die Mail über das Standardpostfach.":""}</div>
                {!compose.replyTo&&<div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginBottom:8,fontSize:12,color:"var(--muted)"}}>
                  <span>🕒 Später senden:</span>
                  <input type="datetime-local" value={compose.schedAt||""} onChange={e=>setCompose({...compose,schedAt:e.target.value})} style={{...inp,width:"auto",padding:"5px 8px",fontSize:12}}/>
                  {compose.schedAt&&<button onClick={()=>setCompose({...compose,schedAt:""})} style={{background:"none",border:"none",color:"var(--muted)",fontSize:11,cursor:"pointer",textDecoration:"underline"}}>sofort senden</button>}
                </div>}
                {!compose.replyTo&&<label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"var(--muted)",marginBottom:8,cursor:"pointer"}}><input type="checkbox" checked={!!compose.catchup} onChange={e=>setCompose({...compose,catchup:e.target.checked})}/> Nach 7 Tagen automatisch nachfassen, falls keine Antwort kommt</label>}
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  {sendMsg&&<span style={{fontSize:11.5,color:"#a4442e"}}>{sendMsg}</span>}
                  <button onClick={()=>setCompose(null)} style={{marginLeft:"auto",...knopf2}}>Abbrechen</button>
                  <button onClick={()=>{ if(!compose.to){ setSendMsg("Bitte Empfänger angeben"); return; } setSendMsg(""); setCompose({...compose,vorschau:true}); }} style={knopf}>Vorschau</button>
                </div>
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 150px",gap:10,marginTop:14}}>
              <div><label style={LBL2}>Nächster Schritt</label><input key={"ns"+o.organisation} defaultValue={o.naechster_schritt||""} onBlur={e=>{ const v=e.target.value.trim(); if(v!==(o.naechster_schritt||"")) patch(o.organisation,{naechster_schritt:v||null},v?{typ:"schritt",text:"Nächster Schritt: "+v}:null); }} placeholder="z.B. Anrufen und Termin vereinbaren" style={inp}/></div>
              <div><label style={LBL2}>Wiedervorlage</label><input type="date" key={"wv"+o.organisation} defaultValue={o.wiedervorlage||""} onChange={e=>patch(o.organisation,{wiedervorlage:e.target.value||null},null)} style={inp}/></div>
            </div>
            {o.status==="kein_interesse"&&<div style={{marginTop:10}}><label style={LBL2}>Grund</label><input key={"gr"+o.organisation} defaultValue={o.grund||""} onBlur={e=>{ if(e.target.value!==(o.grund||"")) patch(o.organisation,{grund:e.target.value||null},{typ:"notiz",text:"Grund: "+e.target.value}); }} placeholder="z.B. Untervermietung nicht erlaubt" style={inp}/></div>}
            <textarea key={"no"+o.organisation} defaultValue={o.notizen||""} onBlur={e=>{ if(e.target.value!==(o.notizen||"")) patch(o.organisation,{notizen:e.target.value||null},null); }} placeholder="Notizen zur Firma …" style={{...inp,marginTop:12,minHeight:54,resize:"vertical"}}/>
            <AkqVerlauf bereich="partner" organisation={o.organisation} dealIds={dealsVon(o.organisation).map(x=>x.id)} deals={dealsVon(o.organisation)} ich={ich} team={team} neu={logTick}/>
            <div style={{marginTop:16,borderTop:"1px solid var(--line)",paddingTop:12}}>
              <div style={{fontSize:12,color:"var(--muted)",marginBottom:8,fontWeight:600}}>Mailverlauf{thread&&thread.email?" mit "+thread.email:""}</div>
              {!thread&&<div style={{fontSize:12,color:"#8a8174"}}>Keine E-Mail-Adresse hinterlegt.</div>}
              {thread&&thread.loading&&<div style={{fontSize:12,color:"#8a8174"}}>Lädt Mailverlauf …</div>}
              {thread&&thread.error&&<div style={{fontSize:12,color:"#a4442e"}}>Mailverlauf nicht verfügbar.</div>}
              {thread&&thread.messages&&thread.messages.length===0&&<div style={{fontSize:12,color:"#8a8174"}}>Keine Mails mit dieser Adresse gefunden.</div>}
              {thread&&thread.messages&&thread.messages.map((m,i)=>(
                <div key={i} style={{padding:"6px 0",borderBottom:"1px solid #f0ebe1"}}>
                  <div onClick={()=>setOpenMsg(openMsg===i?null:i)} style={{display:"flex",gap:8,alignItems:"baseline",cursor:"pointer"}}>
                    <span style={{flexShrink:0,fontSize:9.5,padding:"1px 6px",borderRadius:8,background:m.direction==="gesendet"?"#e8efde":"#eef1f6",color:m.direction==="gesendet"?"#3a5230":"#3a4a63"}}>{m.direction}</span>
                    <span style={{flexShrink:0,color:"#a0968a",fontSize:11}}>{fmtD(m.date)}</span>
                    <span style={{flex:1,color:"var(--ink)",fontSize:12.5,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.subject}</span>
                    {m.direction==="erhalten"&&m.id&&<button onClick={e=>{ e.stopPropagation(); antworten(m); }} style={{flexShrink:0,...knopf2,padding:"1px 8px",fontSize:11,color:"var(--ink)"}}>↩ Antworten</button>}
                  </div>
                  {openMsg===i&&<iframe title="mail" srcDoc={m.body||("<div style=\"font-family:sans-serif;font-size:13px;padding:8px\">"+akqEsc(m.preview||"(kein Inhalt)")+"</div>")} sandbox="" style={{width:"100%",height:300,border:"1px solid var(--line)",borderRadius:8,marginTop:6,background:"#fff"}}/>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
