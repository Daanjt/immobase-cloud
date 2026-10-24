function KeinZugriff() {
  return (
    <div style={{padding:"40px 8px",maxWidth:520}}>
      <div style={{fontSize:34,marginBottom:14}}>🔒</div>
      <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:22,color:"var(--ink)",marginBottom:10}}>Kein Zugriff</div>
      <div style={{fontSize:13.5,color:"var(--muted)",lineHeight:1.6}}>
        Für diesen Bereich fehlt deinem Konto die Berechtigung. Wende dich an Daan oder Tijn, wenn du Zugriff brauchst.
      </div>
    </div>
  );
}

function DokumenteSection({documents, uploadDocument, getDocumentUrl, deleteDocument}){
  const KAT=["Vertrag","Versicherung","Rechnung","Behörde","Bank","Sonstiges"];
  const [kat,setKat]=useState("Vertrag");
  const [newKat,setNewKat]=useState("");
  const [addingKat,setAddingKat]=useState(false);
  const [busy,setBusy]=useState(false);
  const [drag,setDrag]=useState(false);
  const [q,setQ]=useState("");
  const [filt,setFilt]=useState("alle");
  const docs=(documents||[]).filter(d=>d.entity_type==="firma"&&d.entity_id==="dthomes");
  const allKats=Array.from(new Set([...KAT, ...docs.map(d=>d.category).filter(Boolean)]));
  const shown=docs.filter(d=>{ if(filt!=="alle"&&(d.category||"Sonstiges")!==filt) return false; if(q&&!((d.filename||"")+" "+(d.category||"")).toLowerCase().includes(q.toLowerCase())) return false; return true; }).sort((x,y)=>new Date(y.uploaded_at||0)-new Date(x.uploaded_at||0));
  const doUpload=async(f)=>{ if(!f) return; const useKat=(addingKat?(newKat.trim()||"Sonstiges"):kat); setBusy(true); try{ await uploadDocument("firma","dthomes",useKat,f); if(addingKat&&newKat.trim()){ setKat(newKat.trim()); setAddingKat(false); setNewKat(""); } }catch(err){ alert("Upload fehlgeschlagen: "+(err&&err.message||err)); } setBusy(false); };
  const onUpload=(e)=>{ const f=e.target.files&&e.target.files[0]; doUpload(f); e.target.value=""; };
  const onDrop=(e)=>{ e.preventDefault(); setDrag(false); const fs=e.dataTransfer&&e.dataTransfer.files; if(fs&&fs.length){ Array.from(fs).forEach(f=>doUpload(f)); } };
  const open=async(d)=>{ const u=await getDocumentUrl(d.storage_path); if(u) window.open(u,"_blank"); else alert("Datei nicht abrufbar."); };
  const del=(d)=>{ if(!confirm("Dokument \""+(d.filename||"")+"\" löschen?")) return; deleteDocument(d); };
  const fmt=(d)=>d?new Date(d).toLocaleDateString("de-CH",{day:"2-digit",month:"2-digit",year:"numeric"}):"";
  const fsize=(b)=>b?(b>1048576?(b/1048576).toFixed(1)+" MB":Math.round(b/1024)+" KB"):"";
  const inp={border:"1px solid var(--line)",borderRadius:8,padding:"7px 9px",fontSize:12.5,fontFamily:"'Manrope',sans-serif",background:"var(--surface)",color:"var(--ink)"};
  const badge={Vertrag:["#e8efde","#3a5230"],Versicherung:["#e5edf3","#365068"],Rechnung:["#f5ecd8","#7c6a3e"],"Behörde":["#f0e6f0","#6a4a68"],Bank:["#e6efe9","#2f5a4a"],Sonstiges:["#efeae1","#6a6456"]};
  return (
    <div style={{padding:"8px",maxWidth:900}}>
      <div style={{marginBottom:16}}>
        <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:24,color:"var(--ink)"}}>Dokumente</div>
        <div style={{fontSize:13,color:"var(--muted)",marginTop:4}}>Allgemeine Ablage für Verträge, Versicherungen, Rechnungen und mehr.</div>
      </div>
      <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragEnter={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={onDrop} style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:14,background:drag?"#eef5e8":"#faf8f3",border:drag?"2px dashed #6a8a5a":"1px dashed var(--line)",borderRadius:12,padding:"14px",transition:"background .15s"}}>
        <label style={{fontSize:12,color:"var(--muted)"}}>Kategorie</label>
        <select value={addingKat?"__new__":kat} onChange={e=>{ if(e.target.value==="__new__"){ setAddingKat(true); } else { setAddingKat(false); setKat(e.target.value); } }} style={{...inp,width:"auto"}}>{allKats.map(k=>(<option key={k} value={k}>{k}</option>))}<option value="__new__">＋ neue Kategorie …</option></select>
        {addingKat&&<input value={newKat} onChange={e=>setNewKat(e.target.value)} placeholder="Name der neuen Kategorie" style={{...inp,width:"auto"}} />}
        <label style={{background:"var(--ink)",color:"var(--surface)",border:"1px solid var(--ink)",borderRadius:8,padding:"8px 14px",fontSize:12.5,cursor:busy?"wait":"pointer",fontFamily:"'Manrope',sans-serif",whiteSpace:"nowrap"}}>{busy?"lädt hoch …":"+ Dokument hochladen"}<input type="file" onChange={onUpload} disabled={busy} style={{display:"none"}}/></label>
        <span style={{fontSize:11,color:drag?"#3a5230":"var(--muted)",fontWeight:drag?600:400}}>{drag?"📥 Loslassen zum Hochladen":"oder Datei hierher ziehen · max. 25 MB"}</span>
      </div>
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginBottom:12}}>
        {["alle",...allKats].map(f=>(<button key={f} onClick={()=>setFilt(f)} style={{background:filt===f?"var(--ink)":"none",color:filt===f?"var(--surface)":"var(--muted)",border:"1px solid var(--line)",borderRadius:8,padding:"6px 11px",fontSize:12,cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>{f==="alle"?"Alle":f}{f!=="alle"&&docs.filter(d=>(d.category||"Sonstiges")===f).length?" ("+docs.filter(d=>(d.category||"Sonstiges")===f).length+")":""}</button>))}
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Suchen ..." style={{...inp,flex:"1 1 160px",marginLeft:"auto"}}/>
      </div>
      {shown.length===0&&<div style={{padding:"28px 8px",color:"#8a8174",fontSize:13}}>Noch keine Dokumente. Lade oben dein erstes hoch.</div>}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {shown.map(d=>{ const bc=badge[d.category||"Sonstiges"]||badge.Sonstiges; return (
          <div key={d.id} style={{border:"1px solid var(--line)",borderRadius:12,padding:"12px 14px",background:"var(--surface)",display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{minWidth:0,flex:1}}>
              <div onClick={()=>open(d)} style={{fontSize:13.5,fontWeight:600,color:"var(--ink)",cursor:"pointer",textDecoration:"underline",wordBreak:"break-all"}}>{d.filename}</div>
              <div style={{fontSize:11,color:"#a0968a",marginTop:3,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><span style={{background:bc[0],color:bc[1],padding:"1px 8px",borderRadius:8,fontWeight:700,fontSize:10}}>{d.category||"Sonstiges"}</span><span>{fsize(d.file_size)}</span><span>· {fmt(d.uploaded_at)}</span></div>
            </div>
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              <button onClick={()=>open(d)} style={{background:"none",border:"1px solid var(--line)",borderRadius:8,padding:"6px 12px",fontSize:11.5,color:"var(--ink)",cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>Öffnen</button>
              <button onClick={()=>del(d)} style={{background:"none",border:"1px solid var(--line)",borderRadius:8,padding:"6px 10px",fontSize:11.5,color:"#9b4a3e",cursor:"pointer",fontFamily:"'Manrope',sans-serif"}}>Löschen</button>
            </div>
          </div>
        );})}
      </div>
    </div>
  );
}

let _toastFn = null;
function toast(msg, type){ if(type==="error" && window.meldeFehler) window.meldeFehler("Meldung an Nutzer", msg); if(type==="error" && window.fehlerText) msg = window.fehlerText(msg); if(_toastFn) _toastFn(msg, type||"ok"); }
function Toast(){
  const [t, setT] = React.useState(null);
  React.useEffect(()=>{ _toastFn = (msg, type)=>setT({msg, type, id:Date.now()}); return ()=>{ _toastFn = null; }; },[]);
  React.useEffect(()=>{ if(!t) return; const to=setTimeout(()=>setT(null), t.type==="error"?4000:1800); return ()=>clearTimeout(to); },[t]);
  if(!t) return null;
  return (
    <div key={t.id} style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:(t.type==="error"?"#c0392b":"#2f6b3a"),color:"#fff",padding:"10px 18px",borderRadius:8,fontSize:13,fontWeight:600,boxShadow:"0 4px 16px rgba(0,0,0,.2)",zIndex:99999,maxWidth:"90vw"}}>
      {(t.type==="error"?"\u26a0 ":"\u2713 ")+t.msg}
    </div>
  );
}

function WerbungTab(){
  const [group,setGroup]=React.useState("mieter");
  const [subject,setSubject]=React.useState("");
  const [text,setText]=React.useState("");
  const [includeFuture,setIncludeFuture]=React.useState(false);
  const [nurOhneZuteilung,setNurOhneZuteilung]=React.useState(false);
  const [list,setList]=React.useState([]);
  const [excluded,setExcluded]=React.useState({});
  const [sending,setSending]=React.useState(false);
  const [log,setLog]=React.useState([]);
  const [saved,setSaved]=React.useState([]);
  const [apts,setApts]=React.useState([]);
  const [openN,setOpenN]=React.useState({});
  const [showPicker,setShowPicker]=React.useState(false);
  const [q,setQ]=React.useState("");
  const [erfolg,setErfolg]=React.useState(null);
  const [files,setFiles]=React.useState([]);
  const [plan,setPlan]=React.useState("");
  const [geplant,setGeplant]=React.useState([]);
  const [eyebrow,setEyebrow]=React.useState("");
  const [btnText,setBtnText]=React.useState("");
  const [btnUrl,setBtnUrl]=React.useState("");
  const [vorschau,setVorschau]=React.useState("");
  const design=()=>({eyebrow:eyebrow.trim(),button_text:btnText.trim(),button_url:btnUrl.trim()});
  const ladeVorlage=(v)=>{ setSubject(v.subject||v.betreff||""); setText(v.text||""); const d=v.design||{}; setEyebrow(d.eyebrow||""); setBtnText(d.button_text||""); setBtnUrl(d.button_url||""); setVorschau(""); };
  const zeigeVorschau=async()=>{ if(!text.trim()){ toast("Text ausf\u00fcllen","error"); return; } const {data,error}=await supabase.functions.invoke("send-campaign",{body:{subject:subject||"Vorschau",text,design:design(),preview:"Vorname"}}); if(error||!data||!data.html){ toast("Vorschau nicht m\u00f6glich","error"); return; } setVorschau(data.html); };
  const pd=(x)=>{const m=(x||"").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);return m?new Date(+m[3],+m[2]-1,+m[1]).getTime():null;};
  const ladeLog=async()=>{ try{ const {data}=await supabase.from("kampagnen").select("*").order("created_at",{ascending:false}).limit(20); setLog(data||[]); }catch(_e){} };
  const ladeVorlagen=async()=>{ try{ const {data}=await supabase.from("kampagnen_vorlagen").select("*").order("created_at",{ascending:true}); setSaved(data||[]); }catch(_e){} };
  const ladeErfolg=async()=>{ try{ const [ap,km]=await Promise.all([ supabase.from("applicants").select("empfohlen_von,created_at"), supabase.from("kampagnen").select("created_at").order("created_at",{ascending:false}).limit(1) ]); const ref=(ap.data||[]).filter(a=>a.empfohlen_von&&String(a.empfohlen_von).trim()); const last=km.data&&km.data[0]&&km.data[0].created_at; const seit=last?ref.filter(a=>a.created_at&&new Date(a.created_at)>=new Date(last)).length:null; setErfolg({total:ref.length,seit}); }catch(_e){} };
  const ladeGeplant=async()=>{ try{ const {data}=await supabase.from("kampagnen_geplant").select("*").eq("status","geplant").order("scheduled_for",{ascending:true}); setGeplant(data||[]); }catch(_e){} };
  const planen=async()=>{ if(!subject.trim()||!text.trim()){ toast("Betreff und Text ausf\u00fcllen","error"); return; } if(!plan){ toast("Zeitpunkt w\u00e4hlen","error"); return; } if(aktiveEmpf.length===0){ toast("Keine Empf\u00e4nger","error"); return; } const when=new Date(plan); if(isNaN(when.getTime())||when<=new Date()){ toast("Zeitpunkt muss in der Zukunft liegen","error"); return; } const {error}=await supabase.from("kampagnen_geplant").insert({scheduled_for:when.toISOString(),gruppe:group,betreff:subject,text,recipients:aktiveEmpf.map(r=>({email:r.email,vorname:r.vorname||""})),attachments:files,design:design()}); if(error){ toast("Fehler beim Planen","error"); return; } toast("Kampagne geplant"); setPlan(""); ladeGeplant(); };
  const abbrechenGeplant=async(id)=>{ if(!confirm("Geplante Kampagne abbrechen?")) return; await supabase.from("kampagnen_geplant").delete().eq("id",id); ladeGeplant(); };
  const speichernVorlage=async()=>{ if(!subject.trim()&&!text.trim()){ toast("Nichts zu speichern","error"); return; } const name=prompt("Name der Vorlage:"); if(!name||!name.trim()) return; const {error}=await supabase.from("kampagnen_vorlagen").insert({name:name.trim(),betreff:subject,text,design:design()}); if(error){ toast("Fehler beim Speichern","error"); return; } toast("Vorlage gespeichert"); ladeVorlagen(); };
  const loeschenVorlage=async(id)=>{ if(!confirm("Vorlage löschen?")) return; await supabase.from("kampagnen_vorlagen").delete().eq("id",id); ladeVorlagen(); };
  React.useEffect(()=>{ ladeLog(); ladeVorlagen(); ladeErfolg(); ladeGeplant(); (async()=>{ try{ const {data}=await supabase.from("apartments").select("id,adresse,etage,type").eq("type","WG"); setApts(data||[]); }catch(_e){} })(); },[]);
  React.useEffect(()=>{(async()=>{
    setExcluded({}); setOpenN({});
    try{
      if(group==="mieter"){
        const [td,rd]=await Promise.all([
          supabase.from("tenants").select("id,vorname,nachname,email,status,einzug,apt_id,room_id").not("email","is",null),
          supabase.from("rooms").select("id,apt_id,tenant_id"),
        ]);
        const rooms=rd.data||[]; const byTenant={},byId={}; rooms.forEach(ro=>{ if(ro.tenant_id) byTenant[ro.tenant_id]=ro; byId[ro.id]=ro; });
        const heute=Date.now();
        let r=(td.data||[]).filter(t=>(t.status||"aktiv")==="aktiv"&&t.email&&t.email.includes("@"));
        if(!includeFuture) r=r.filter(t=>{const ez=pd(t.einzug);return !(ez&&ez>heute);});
        const seen=new Set(); r=r.filter(t=>{const k=t.email.trim().toLowerCase();if(seen.has(k))return false;seen.add(k);return true;});
        setList(r.map(t=>{ const apt=t.apt_id||(byTenant[t.id]&&byTenant[t.id].apt_id)||(t.room_id&&byId[t.room_id]&&byId[t.room_id].apt_id)||null; const _ez=pd(t.einzug); return {email:t.email.trim(),vorname:(t.vorname||"").trim(),name:((t.vorname||"")+" "+(t.nachname||"")).trim()||t.email,aptId:apt,status:t.status,future:!!(_ez&&_ez>heute)}; }));
      } else {
        const [m,b]=await Promise.all([
          supabase.from("tenants").select("email"),
          supabase.from("applicants").select("vorname,nachname,email,status,created_at").not("email","is",null),
        ]);
        const tm=new Set((m.data||[]).filter(t=>t.email).map(t=>t.email.trim().toLowerCase()));
        const aktiv=["Neu","In Prüfung","Zugeteilt","Kontaktiert"]; const cutoff=Date.now()-31*86400000; const seen=new Set();
        const r=(b.data||[]).filter(x=>{ if(!(x.email&&x.email.includes("@")))return false; if(!(!x.status||aktiv.includes(x.status)))return false; if(!(x.created_at&&new Date(x.created_at).getTime()>=cutoff))return false; const k=x.email.trim().toLowerCase(); if(tm.has(k)||seen.has(k))return false; seen.add(k); return true; });
        setList(r.map(x=>({email:x.email.trim(),vorname:(x.vorname||"").trim(),name:((x.vorname||"")+" "+(x.nachname||"")).trim()||x.email,aptId:null,status:x.status})));
      }
    }catch(_e){ setList([]); }
  })();},[group,includeFuture]);

  const aptMap={}; apts.forEach(a=>{aptMap[a.id]=a.adresse;});
  const etageMap={}; apts.forEach(a=>{etageMap[a.id]=a.etage;});
  const visible = group==="bewerber" && nurOhneZuteilung ? list.filter(r=>r.status!=="Zugeteilt") : list;
  const isOn=(r)=>!excluded[r.email.toLowerCase()];
  const aktiveEmpf = visible.filter(isOn);
  // Baum Adresse -> Wohnung -> Bewohner
  const qv=q.trim().toLowerCase(); const searched = qv ? visible.filter(r=>(r.name+" "+r.email).toLowerCase().includes(qv)) : visible;
  const byApt={}; searched.forEach(r=>{ const k=r.aptId||"_ohne"; (byApt[k]=byApt[k]||[]).push(r); });
  const byAddr={};
  Object.keys(byApt).forEach(aid=>{ const addr=aid==="_ohne"?"Ohne Zuordnung":(aptMap[aid]||aid); (byAddr[addr]=byAddr[addr]||[]).push({aid,rows:byApt[aid]}); });
  const addrList=Object.keys(byAddr).sort();

  const setRowsExcluded=(rows,exclude)=>{ setExcluded(p=>{const n={...p}; rows.forEach(r=>{ n[r.email.toLowerCase()]=exclude; }); return n;}); };
  const nurDiese=(rows)=>{ setExcluded(p=>{const n={...p}; visible.forEach(r=>{ n[r.email.toLowerCase()]=true; }); rows.forEach(r=>{ n[r.email.toLowerCase()]=false; }); return n;}); };

  const vorlagen={
    empfehlung:{design:{eyebrow:"Empfehlungsprogramm",button_text:"Freie Zimmer ansehen",button_url:"https://www.dthomes.ch/zimmer"},subject:"Verdiene 100 Franken: empfiehl uns weiter",text:"kennst du jemanden, der ein cooles Zimmer in Zürich sucht? Dann haben wir ein Angebot für dich.\n\nFür jede Person, die du uns empfiehlst und die bei uns einzieht, bekommst du 100 Franken geschenkt, direkt abgezogen von deiner nächsten Miete. Und das Beste: Es gibt keine Obergrenze. Empfiehl drei Freunde, spar 300 Franken.\n\nSo einfach geht es:\n1. Sag deinen Freunden Bescheid.\n2. Sie bewerben sich auf www.dthomes.ch/zimmer und geben deinen Namen im Feld \"Empfohlen von\" an.\n3. Sobald sie unterschreiben, schreiben wir dir 100 Franken auf der nächsten Miete gut.\n\nOb Studienkolleg:innen, Arbeitskolleg:innen oder Freunde, je mehr desto besser. Danke, dass du D&T Homes weiterempfiehlst!"},
    freieZimmer:{design:{eyebrow:"Freie Zimmer",button_text:"Zimmer ansehen",button_url:"https://www.dthomes.ch/zimmer"},subject:"Hast du schon ein Zimmer gefunden?",text:"hast du bereits ein passendes Zimmer gefunden? Bei uns sind aktuell noch einige schöne Zimmer frei.\n\nSchau sie dir an und bewirb dich direkt auf www.dthomes.ch/zimmer. Wir freuen uns auf dich!"},
    zugang:{design:{eyebrow:"Information"},subject:"Ankündigung: Arbeiten in deiner Wohnung",text:"wir möchten dich kurz informieren, dass bei dir Arbeiten anstehen.\n\nDatum und Uhrzeit: [bitte eintragen]\nWas: [kurz beschreiben]\n\nBitte ermögliche an diesem Termin den Zugang zur Wohnung. Falls es dir nicht passt, melde dich kurz, dann finden wir einen anderen Termin.\n\nDanke dir!"},
  };
  const senden=async(testEmail)=>{
    if(!subject.trim()||!text.trim()){ toast("Betreff und Text ausfüllen","error"); return; }
    if(!testEmail && aktiveEmpf.length===0){ toast("Keine Empfänger ausgewählt","error"); return; }
    if(!testEmail && !confirm("E-Mail an "+aktiveEmpf.length+" "+(group==="mieter"?"Mieter":"Bewerber")+" senden?")) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke("send-campaign",{ body:{ group, subject, text, test_email: testEmail||undefined, recipients: testEmail?undefined:aktiveEmpf.map(r=>({email:r.email,vorname:r.vorname||""})), attachments: files, design: design() }});
    setSending(false);
    if(error||(data&&data.error)){ toast("Fehler: "+((data&&data.error)||(error&&error.message)||"unbekannt"),"error"); return; }
    toast(testEmail?"Testmail an dich gesendet":("Gesendet an "+data.sent+" von "+data.total));
    if(!testEmail){ ladeLog(); ladeErfolg(); }
  };
  const onFiles=(e)=>{ const fl=Array.from(e.target.files||[]); Promise.all(fl.map(fi=>new Promise(res=>{const rd=new FileReader();rd.onload=()=>res({filename:fi.name,content:String(rd.result).split(",")[1]});rd.onerror=()=>res(null);rd.readAsDataURL(fi);}))).then(arr=>setFiles(arr.filter(Boolean))); };
  const seg=(active)=>({flex:1,textAlign:"center",background:active?"var(--ink)":"transparent",color:active?"#fff":"var(--ink)",border:"none",borderRadius:7,padding:"9px 0",fontSize:13.5,fontWeight:active?600:500,cursor:"pointer",fontFamily:"inherit"});
  const chip={background:"#fff",color:"var(--ink)",border:"1px solid var(--line)",borderRadius:20,padding:"7px 14px",fontSize:12.5,cursor:"pointer",fontFamily:"inherit"};
  const inp={width:"100%",padding:"11px 13px",border:"1px solid var(--line)",borderRadius:10,fontSize:14.5,fontFamily:"inherit",boxSizing:"border-box"};
  const Chevron=({open})=><span style={{fontSize:14,color:"var(--muted)",display:"inline-block",transform:open?"rotate(180deg)":"none",flexShrink:0}}>⌄</span>;
  const Cb=({checked,onChange,sz})=><input type="checkbox" checked={checked} onChange={onChange} onClick={e=>e.stopPropagation()} style={{width:sz||17,height:sz||17,flexShrink:0}}/>;
  const MONATE=["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
  const fmtD=(iso)=>{try{const d=new Date(iso);return d.getDate()+". "+MONATE[d.getMonth()]+" "+d.getFullYear()+", "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");}catch(_e){return iso;}};
  return (<div style={{maxWidth:620,margin:"0 auto"}}>
    <div className="pt">Werbung</div>
    <div style={{fontSize:13,color:"var(--muted)",marginTop:2,marginBottom:18}}>Gebündelte E-Mails an Mieter oder Bewerber, mit persönlicher Anrede und im D&T-Design.</div>

    <div style={{display:"flex",background:"#f1ece2",borderRadius:9,padding:3,marginBottom:14}}>
      <button onClick={()=>setGroup("mieter")} style={seg(group==="mieter")}>Mieter</button>
      <button onClick={()=>setGroup("bewerber")} style={seg(group==="bewerber")}>Bewerber</button>
    </div>

    <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"center",marginBottom:12}}>
      {group==="mieter" && <label style={{fontSize:13,display:"flex",alignItems:"center",gap:7,cursor:"pointer"}}><input type="checkbox" checked={includeFuture} onChange={e=>setIncludeFuture(e.target.checked)}/>künftige Mieter einbeziehen</label>}
      {group==="bewerber" && <label style={{fontSize:13,display:"flex",alignItems:"center",gap:7,cursor:"pointer"}}><input type="checkbox" checked={nurOhneZuteilung} onChange={e=>setNurOhneZuteilung(e.target.checked)}/>Nur ohne Zimmerzusage</label>}
    </div>

    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,border:"1px solid var(--line)",borderRadius:12,padding:"13px 15px",marginBottom:showPicker?12:18,background:"#faf8f3"}}>
      <div style={{fontSize:13.5,fontWeight:600}}>{aktiveEmpf.length===visible.length?("Alle "+visible.length+" "+(group==="mieter"?"Mieter":"Bewerber")+" ausgewählt"):(aktiveEmpf.length+" von "+visible.length+" ausgewählt")}</div>
      <button onClick={()=>setShowPicker(!showPicker)} style={{...chip,whiteSpace:"nowrap"}}>{showPicker?"Fertig":"Eingrenzen"}</button>
    </div>
    {showPicker && <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Suchen nach Name oder E-Mail" style={{...inp,marginBottom:12}}/>}

    {showPicker && (group==="bewerber"
      ? <div style={{border:"1px solid var(--line)",borderRadius:12,overflow:"hidden",marginBottom:18,maxHeight:300,overflowY:"auto"}}>
          {searched.length===0 && <div style={{fontSize:13,color:"var(--muted)",padding:"12px 14px"}}>Keine Empfänger.</div>}
          {searched.map((r,i)=>(<label key={r.email} style={{display:"flex",alignItems:"center",gap:11,padding:"9px 14px",cursor:"pointer",borderTop:i?"1px solid #f3eee4":"none"}}>
            <Cb checked={isOn(r)} onChange={e=>setExcluded(p=>({...p,[r.email.toLowerCase()]:!e.target.checked}))} sz={16}/>
            <span style={{display:"flex",flexDirection:"column",minWidth:0}}><span style={{fontSize:13.5,fontWeight:500}}>{r.name}</span><span style={{fontSize:11.5,color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.email}</span></span>
          </label>))}
        </div>
      : <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:18}}>
          {addrList.length===0 && <div style={{fontSize:13,color:"var(--muted)",padding:"8px 0"}}>Keine Empfänger.</div>}
          {addrList.map(addr=>{
            const whs=byAddr[addr]; const addrRows=whs.reduce((a,w)=>a.concat(w.rows),[]);
            const addrAktiv=addrRows.filter(isOn).length; const addrAlle=addrAktiv===addrRows.length;
            const ak="addr:"+addr; const aOpen=qv?true:!!openN[ak];
            return (<div key={addr} style={{border:"1px solid var(--line)",borderRadius:12,overflow:"hidden"}}>
              <div style={{display:"flex",alignItems:"center",gap:11,padding:"12px 14px",background:"#f5f1e8"}}>
                <Cb checked={addrAlle} onChange={e=>setRowsExcluded(addrRows,!e.target.checked)}/>
                <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>setOpenN(p=>({...p,[ak]:!p[ak]}))}>
                  <div style={{fontSize:14,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{addr}</div>
                  <div style={{fontSize:11.5,color:"var(--muted)"}}>{whs.length} Wohnung{whs.length>1?"en":""} · {addrAktiv}/{addrRows.length} ausgewählt</div>
                </div>
                <span onClick={()=>setOpenN(p=>({...p,[ak]:!p[ak]}))} style={{cursor:"pointer"}}><Chevron open={aOpen}/></span>
              </div>
              {aOpen && <div style={{borderTop:"1px solid var(--line)",padding:"6px 0 6px 0"}}>
                {whs.map((w,wi)=>{
                  const wAktiv=w.rows.filter(isOn).length; const wAlle=wAktiv===w.rows.length;
                  const wk="apt:"+w.aid; const wOpen=qv?true:!!openN[wk];
                  return (<div key={w.aid} style={{margin:"0 10px 6px 10px",border:"1px solid #eee5d6",borderRadius:9,overflow:"hidden"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px"}}>
                      <Cb checked={wAlle} onChange={e=>setRowsExcluded(w.rows,!e.target.checked)} sz={15}/>
                      <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>setOpenN(p=>({...p,[wk]:!p[wk]}))}>
                        <div style={{fontSize:13,fontWeight:600}}>{etageMap[w.aid]?etageMap[w.aid]:("Wohnung "+w.aid)}</div>
                        <div style={{fontSize:11,color:"var(--muted)"}}>{wAktiv}/{w.rows.length} ausgewählt</div>
                      </div>
                      <button onClick={()=>nurDiese(w.rows)} style={{...chip,padding:"4px 10px",fontSize:11}}>nur diese</button>
                      <span onClick={()=>setOpenN(p=>({...p,[wk]:!p[wk]}))} style={{cursor:"pointer"}}><Chevron open={wOpen}/></span>
                    </div>
                    {wOpen && <div style={{borderTop:"1px solid #eee5d6"}}>
                      {w.rows.map((r,i)=>(<label key={r.email} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px 8px 14px",cursor:"pointer",borderTop:i?"1px solid #f5f0e6":"none"}}>
                        <Cb checked={isOn(r)} onChange={e=>setExcluded(p=>({...p,[r.email.toLowerCase()]:!e.target.checked}))} sz={15}/>
                        <span style={{display:"flex",flexDirection:"column",minWidth:0}}><span style={{fontSize:13,fontWeight:500}}>{r.name}{r.future && <span style={{marginLeft:6,fontSize:10,color:"#8a6a2e",background:"#fdf1e3",padding:"1px 6px",borderRadius:4,fontWeight:600}}>künftig</span>}</span><span style={{fontSize:11,color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.email}</span></span>
                      </label>))}
                    </div>}
                  </div>);
                })}
              </div>}
            </div>);
          })}
        </div>)}

    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
      <button style={chip} onClick={()=>ladeVorlage(vorlagen.empfehlung)}>Empfehlung</button>
      <button style={chip} onClick={()=>ladeVorlage(vorlagen.freieZimmer)}>Freie Zimmer</button>
      <button style={chip} onClick={()=>ladeVorlage(vorlagen.zugang)}>Zugang/Arbeiten</button>
      {saved.map(v=>(<span key={v.id} style={{display:"inline-flex",alignItems:"center"}}><button style={{...chip,borderRadius:"20px 0 0 20px"}} onClick={()=>ladeVorlage(v)}>{v.name}</button><button onClick={()=>loeschenVorlage(v.id)} style={{border:"1px solid var(--line)",borderLeft:"none",borderRadius:"0 20px 20px 0",background:"#fff",color:"#b06a5a",cursor:"pointer",padding:"7px 10px",fontSize:12}}>×</button></span>))}
      <button style={{...chip,borderStyle:"dashed",color:"var(--muted)"}} onClick={speichernVorlage}>+ speichern</button>
    </div>

    <div style={{marginBottom:12}}><label style={{display:"block",fontSize:12.5,fontWeight:600,marginBottom:6}}>Betreff</label><input value={subject} onChange={e=>setSubject(e.target.value)} style={inp}/></div>
    <div style={{marginBottom:10}}><label style={{display:"block",fontSize:12.5,fontWeight:600,marginBottom:6}}>Nachricht</label><textarea rows={11} value={text} onChange={e=>setText(e.target.value)} placeholder="Text der Nachricht. Anrede (Hi Vorname,) und Gruss werden automatisch ergänzt." style={{...inp,lineHeight:1.5,resize:"vertical"}}/></div>
    <div style={{fontSize:12,color:"var(--muted)",lineHeight:1.5,marginBottom:14}}>Jede Mail kommt im D&T-Design mit Logo, persönlicher Anrede und Gruss. Gestaltung im Text: Zeilen mit „1.“ werden nummerierte Schritte, Zeilen mit „-“ eine Liste, mehrere Zeilen „Titel: Wert“ eine beige Infobox, **fett** wird fett, Links und E-Mails werden klickbar. Kopie per BCC an dich.</div>
    <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
      <div style={{flex:"1 1 160px"}}><label style={{display:"block",fontSize:12.5,fontWeight:600,marginBottom:6}}>Kleiner Titel</label><input value={eyebrow} onChange={e=>setEyebrow(e.target.value)} placeholder="z.B. Information" style={inp}/></div>
      <div style={{flex:"1 1 160px"}}><label style={{display:"block",fontSize:12.5,fontWeight:600,marginBottom:6}}>Button-Text (optional)</label><input value={btnText} onChange={e=>setBtnText(e.target.value)} placeholder="z.B. Zimmer ansehen" style={inp}/></div>
      <div style={{flex:"2 1 220px"}}><label style={{display:"block",fontSize:12.5,fontWeight:600,marginBottom:6}}>Button-Link (optional)</label><input value={btnUrl} onChange={e=>setBtnUrl(e.target.value)} placeholder="https://www.dthomes.ch/zimmer" style={inp}/></div>
    </div>
    <div style={{marginBottom:16}}>
      <label style={{display:"block",fontSize:12.5,fontWeight:600,marginBottom:6}}>Anhang (optional)</label>
      <input type="file" multiple onChange={onFiles} style={{fontSize:13}}/>
      {files.length>0 && <div style={{marginTop:7,display:"flex",flexWrap:"wrap",gap:6}}>{files.map((fl,i)=>(<span key={i} style={{fontSize:12,background:"#f1ece2",borderRadius:6,padding:"4px 9px",display:"inline-flex",gap:7,alignItems:"center"}}>{fl.filename}<span onClick={()=>setFiles(p=>p.filter((_,j)=>j!==i))} style={{cursor:"pointer",color:"#b06a5a",fontWeight:600}}>×</span></span>))}</div>}
    </div>

    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
      <button style={{...chip,borderRadius:10,padding:"12px 18px",flex:"1 1 110px"}} onClick={()=>vorschau?setVorschau(""):zeigeVorschau()}>{vorschau?"Vorschau schliessen":"Vorschau"}</button>
      <button style={{...chip,borderRadius:10,padding:"12px 18px",flex:"1 1 140px"}} disabled={sending} onClick={()=>senden("daan.theijse@dthomes.ch")}>Test an mich</button>
      <button style={{flex:"2 1 180px",background:"var(--ink)",color:"#fff",border:"none",borderRadius:10,padding:"12px 18px",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:sending?0.6:1}} disabled={sending} onClick={()=>senden()}>{sending?"Sende …":("An "+aktiveEmpf.length+" senden")}</button>
    </div>
    {vorschau && <iframe title="Vorschau" srcDoc={vorschau} style={{width:"100%",height:640,border:"1px solid var(--line)",borderRadius:12,marginTop:12,background:"#f7f3eb"}}/>}
    <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginTop:12}}>
      <input type="datetime-local" value={plan} onChange={e=>setPlan(e.target.value)} style={{...inp,width:"auto",flex:"1 1 190px",padding:"9px 12px",fontSize:13.5}}/>
      <button style={{...chip,padding:"10px 16px"}} onClick={planen}>Für später planen</button>
    </div>
    {geplant.length>0 && <div style={{marginTop:18}}>
      <div style={{fontSize:13.5,fontWeight:700,marginBottom:6}}>Geplante Kampagnen</div>
      {geplant.map(g=>(<div key={g.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,padding:"9px 0",borderTop:"1px solid #f0eadd",fontSize:12.5}}>
        <div style={{minWidth:0}}><div style={{fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.betreff}</div><div style={{color:"var(--muted)"}}>{fmtD(g.scheduled_for)} · {g.gruppe==="mieter"?"Mieter":"Bewerber"} · {(g.recipients||[]).length} Empf.</div></div>
        <button onClick={()=>abbrechenGeplant(g.id)} style={{...chip,padding:"5px 11px",fontSize:11.5,color:"#b06a5a"}}>abbrechen</button>
      </div>))}
    </div>}

    {erfolg && <div style={{marginTop:24,border:"1px solid #e8d2a8",background:"#fdf7e8",borderRadius:12,padding:"13px 16px"}}>
      <div style={{fontSize:13,fontWeight:700,color:"#8a6a2e"}}>Empfehlungs-Erfolg</div>
      <div style={{fontSize:12.5,color:"#8a6a2e",marginTop:3}}>{erfolg.total} Bewerbung{erfolg.total!==1?"en":""} über Empfehlungen insgesamt{erfolg.seit!=null?(" · "+erfolg.seit+" seit der letzten Kampagne"):""}</div>
    </div>}
    <div style={{marginTop:erfolg?18:28}}>
      <div style={{fontSize:13.5,fontWeight:700,marginBottom:6}}>Logbuch</div>
      {log.length===0 && <div style={{fontSize:12.5,color:"var(--muted)"}}>Noch keine Kampagnen gesendet.</div>}
      {log.map(k=>(<div key={k.id} style={{display:"flex",justifyContent:"space-between",gap:12,padding:"10px 0",borderTop:"1px solid #f0eadd",fontSize:12.5}}>
        <div style={{minWidth:0}}><div style={{fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{k.betreff}</div><div style={{color:"var(--muted)"}}>{fmtD(k.created_at)} · {k.gruppe==="mieter"?"Mieter":"Bewerber"}</div></div>
        <div style={{color:"var(--muted)",whiteSpace:"nowrap"}}>{k.gesendet}/{k.empfaenger_anzahl}</div>
      </div>))}
    </div>
  </div>);
}

function KautionsAbrechnung({tenant,onDone,updateTenant}){
  const [betrag,setBetrag]=React.useState("");
  const [abzuege,setAbzuege]=React.useState([]);
  const [sent,setSent]=React.useState(null);
  const [erledigt,setErledigt]=React.useState(null);
  const [busy,setBusy]=React.useState(false);
  const [preview,setPreview]=React.useState(false);
  const [mailText,setMailText]=React.useState("");
  const [neu,setNeu]=React.useState(false);
  React.useEffect(()=>{(async()=>{ try{ const {data}=await supabase.from("tenants").select("kaution_abrechnung,kaution_betrag,kaution_monate,mietzins,personen").eq("id",tenant.id).single(); const _kb=(data&&data.kaution_betrag!=null&&data.kaution_betrag!=="")?+data.kaution_betrag:((data&&+data.kaution_monate>0&&data.mietzins)?(+data.kaution_monate*(+data.mietzins+25*Math.max(1,+data.personen||1))):null); const k=data&&data.kaution_abrechnung; if(k){ setBetrag(k.betrag!=null?String(k.betrag):(_kb!=null?String(_kb):"")); setAbzuege((k.abzuege||[]).map(a=>({grund:a.grund||"",betrag:a.betrag!=null?String(a.betrag):""}))); setSent(k.gesendet_am||null); setErledigt(k.erledigt_am||null); } else if(_kb!=null){ setBetrag(String(_kb)); } }catch(_e){} })();},[tenant.id]);
  const summe=abzuege.reduce((s,a)=>s+(+a.betrag||0),0);
  const rueck=Math.max(0,(+betrag||0)-summe);
  const addZeile=(grund)=>setAbzuege(p=>[...p,{grund:grund||"",betrag:""}]);
  const setZeile=(i,k,v)=>setAbzuege(p=>p.map((a,j)=>j===i?{...a,[k]:v}:a));
  const delZeile=(i)=>setAbzuege(p=>p.filter((_,j)=>j!==i));
  const clean=()=>abzuege.filter(a=>(+a.betrag||0)>0).map(a=>({grund:(a.grund||"Abzug").trim(),betrag:+a.betrag||0}));
  const chf=(n)=>"CHF "+(+n||0).toLocaleString("de-CH",{minimumFractionDigits:2,maximumFractionDigits:2});
  const defaultText=()=>{ const v=tenant.vorname||""; const r=chf(rueck); return summe>0 ? ("Hallo "+v+",\n\nvielen Dank für deine Zeit bei D&T Homes, wir hoffen, du hattest eine schöne Zeit bei uns. Unten findest du die Abrechnung deiner Kaution.\n\nNach Abzug der aufgeführten Positionen erhältst du "+r+" zurück. Die Verrechnung und Rückzahlung werden direkt über Evorest abgewickelt.\n\nSchön, dass du Teil von D&T Homes warst. Alles Gute für die Zukunft.") : ("Hallo "+v+",\n\nvielen Dank für deine Zeit bei D&T Homes. Es freut uns, dir deine volle Kaution von "+r+" zurückzuzahlen, die Rückzahlung läuft direkt über Evorest.\n\nSchön, dass du Teil von D&T Homes warst. Wir wünschen dir viel Erfolg und alles Gute für die Zukunft."); };
  const abschliessen=async()=>{ if(!confirm("Auszug ohne Mail als erledigt markieren?")) return; await updateTenant(tenant.id, {kautionAbrechnung:{betrag:+betrag||0,abzuege:clean(),rueckzahlung:rueck,erledigt_am:new Date().toISOString()}}); setErledigt(new Date().toISOString()); setNeu(false); onDone && onDone(); };
  const speichern=async()=>{ await updateTenant(tenant.id, {kautionAbrechnung:{betrag:+betrag||0,abzuege:clean(),rueckzahlung:rueck}}); };
  const senden=async()=>{ if(!(+betrag>0)){ toast("Kautionsbetrag eintragen","error"); return; } setMailText(defaultText()); setPreview(true); };
  const wirklichSenden=async()=>{ setBusy(true); const {data,error}=await supabase.functions.invoke("send-kautionsabrechnung",{body:{tenant_id:tenant.id,betrag:+betrag||0,abzuege:clean(),nachricht:mailText}}); setBusy(false); if(error||(data&&data.error)){ toast("Fehler beim Senden","error"); return; } await updateTenant(tenant.id, {kautionAbrechnung:{betrag:+betrag||0,abzuege:clean(),rueckzahlung:rueck,gesendet_am:new Date().toISOString()}}); setSent(new Date().toISOString()); setPreview(false); setNeu(false); toast("Abrechnung gesendet"); onDone && onDone(); };
  const inp={padding:"9px 11px",border:"1px solid var(--line)",borderRadius:8,fontSize:13.5,fontFamily:"inherit",boxSizing:"border-box"};
  const chipb={background:"#fff",color:"var(--ink)",border:"1px solid var(--line)",borderRadius:20,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit"};
  const fmt=(iso)=>{try{const d=new Date(iso);return d.toLocaleDateString("de-CH");}catch(_e){return "";}};
  return (<div style={{border:"1px solid var(--line)",borderRadius:14,padding:"20px 22px",marginTop:18,background:"#fff"}}>
    {(sent||erledigt) && <div style={{border:"1px solid #cdebd4",background:"#f0f9f2",borderRadius:12,padding:"16px 18px",marginBottom:18}}>
      <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:13,flexWrap:"wrap"}}>
        <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:20,height:20,borderRadius:"50%",background:"#2e7d4f",color:"#fff",fontSize:12,fontWeight:700}}>✓</span>
        <span style={{fontSize:14,fontWeight:700,color:"#1f5e3a"}}>Erledigt</span>
        <span style={{fontSize:12,color:"#5a8a6e"}}>{sent?("per Mail gesendet am "+fmt(sent)):("ohne Mail abgeschlossen am "+fmt(erledigt))}</span>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#3a4a40",padding:"5px 0"}}><span>Kaution</span><span>{chf(betrag)}</span></div>
      {clean().map((a,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12.5,color:"#9a6a3a",padding:"4px 0"}}><span>{a.grund}</span><span>- {chf(a.betrag)}</span></div>))}
      {clean().length===0 && <div style={{fontSize:12.5,color:"#6e8a78",padding:"4px 0",fontStyle:"italic"}}>Keine Abzüge</div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginTop:9,paddingTop:11,borderTop:"2px solid #bfe0cb"}}><span style={{fontSize:14,fontWeight:700,color:"#1f5e3a"}}>Rückzahlung</span><span style={{fontSize:17,fontWeight:800,color:"#1f5e3a"}}>{chf(rueck)}</span></div>
    </div>}
    {(sent||erledigt) && !neu && <button onClick={()=>setNeu(true)} style={{...chipb,borderRadius:9,padding:"9px 15px",marginTop:2}}>Neue Abrechnung starten</button>}
    {(!(sent||erledigt) || neu) && <React.Fragment>
    <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>Kautionsabrechnung</div>
    <div style={{fontSize:12.5,color:"var(--muted)",marginBottom:16}}>Abzüge beim Auszug erfassen, Rückzahlung berechnen und dem Mieter die Abrechnung senden. Rückzahlung erfolgt über Evorest.</div>
    <div style={{maxWidth:420}}>
      <div style={{marginBottom:14}}><label style={{display:"block",fontSize:12.5,fontWeight:600,marginBottom:6}}>Kaution (CHF)</label><input type="number" step="0.01" value={betrag} onChange={e=>setBetrag(e.target.value)} style={{...inp,width:160}} placeholder="z.B. 2400"/></div>
      <div style={{fontSize:12.5,fontWeight:600,marginBottom:8}}>Abzüge</div>
      {abzuege.length===0 && <div style={{fontSize:12.5,color:"var(--muted)",marginBottom:8}}>Keine Abzüge. Volle Kaution wird zurückerstattet.</div>}
      {abzuege.map((a,i)=>(<div key={i} style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
        <input value={a.grund} onChange={e=>setZeile(i,"grund",e.target.value)} placeholder="Grund, z.B. Schaden Wand" style={{...inp,flex:1}}/>
        <input type="number" step="0.01" value={a.betrag} onChange={e=>setZeile(i,"betrag",e.target.value)} placeholder="CHF" style={{...inp,width:100}}/>
        <button onClick={()=>delZeile(i)} style={{border:"none",background:"none",color:"#b06a5a",cursor:"pointer",fontSize:18,padding:"0 4px"}}>×</button>
      </div>))}
      <div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:4,marginBottom:16}}>
        <button style={chipb} onClick={()=>addZeile("Schaden")}>+ Schaden</button>
        <button style={chipb} onClick={()=>addZeile("Mahnungsgebühr")}>+ Mahnungsgebühr</button>
        <button style={chipb} onClick={()=>addZeile("Fehlender Schlüssel")}>+ Fehlender Schlüssel</button>
        <button style={chipb} onClick={()=>addZeile("Reinigung")}>+ Reinigung</button>
        <button style={{...chipb,borderStyle:"dashed"}} onClick={()=>addZeile("")}>+ eigener Abzug</button>
      </div>
      <div style={{borderTop:"1px solid var(--line)",paddingTop:12,marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"var(--muted)",marginBottom:4}}><span>Abzüge gesamt</span><span>- CHF {summe.toLocaleString("de-CH",{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:15,fontWeight:700}}><span>Rückzahlung</span><span>CHF {rueck.toLocaleString("de-CH",{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button onClick={speichern} style={{...chipb,borderRadius:9,padding:"10px 16px"}}>Speichern</button>
        <button onClick={abschliessen} style={{...chipb,borderRadius:9,padding:"10px 16px"}}>Ohne Mail abschliessen</button>
        <button onClick={senden} disabled={busy} style={{background:"var(--ink)",color:"#fff",border:"none",borderRadius:9,padding:"10px 18px",fontSize:13.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:busy?0.6:1}}>{busy?"Sende …":"Abrechnung per Mail senden"}</button>
      </div>
      {sent ? <div style={{fontSize:11.5,color:"var(--muted)",marginTop:8}}>Zuletzt gesendet am {fmt(sent)}</div> : (erledigt && <div style={{fontSize:11.5,color:"var(--muted)",marginTop:8}}>Ohne Mail abgeschlossen am {fmt(erledigt)}</div>)}
      {preview && <div style={{marginTop:16,border:"1px solid var(--line)",borderRadius:12,padding:16,background:"#faf8f3"}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>Vorschau der Mail</div>
        <div style={{fontSize:12,color:"var(--muted)",marginBottom:10}}>Du kannst den Text frei anpassen. Aufstellung, Logo und Signatur werden automatisch ergänzt.</div>
        <textarea value={mailText} onChange={e=>setMailText(e.target.value)} rows={11} style={{...inp,width:"100%",boxSizing:"border-box",resize:"vertical",lineHeight:1.5}}/>
        <div style={{marginTop:10,fontSize:12,color:"var(--muted)"}}>Darunter folgt automatisch: Kaution {chf(betrag)}{summe>0?(", Abzüge -"+chf(summe)):""}, Rückzahlung {chf(rueck)}.</div>
        <div style={{display:"flex",gap:10,marginTop:14,flexWrap:"wrap"}}>
          <button onClick={wirklichSenden} disabled={busy} style={{background:"var(--ink)",color:"#fff",border:"none",borderRadius:9,padding:"10px 18px",fontSize:13.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:busy?0.6:1}}>{busy?"Sende …":"Jetzt senden"}</button>
          <button onClick={()=>setPreview(false)} style={{...chipb,borderRadius:9,padding:"10px 16px"}}>Abbrechen</button>
        </div>
      </div>}
    </div>
    </React.Fragment>}
  </div>);
}

