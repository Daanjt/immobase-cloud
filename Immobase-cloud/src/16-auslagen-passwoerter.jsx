function AuslagenPage(){
  const PERS=["Daan","Martijn"];
  const KATS_BASIS=["Essen","Bahn / ÖV","Auto / Parking","Material","Software","Übernachtung","Zahlung Mieter","Sonstiges"];
  const [eigeneKats,setEigeneKats]=useState([]);
  const [neuKat,setNeuKat]=useState(null);
  const fmt=(n)=>"CHF "+(+n||0).toLocaleString("de-CH",{minimumFractionDigits:2,maximumFractionDigits:2});
  const heute=()=>{ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  const dDE=(s)=>{ if(!s) return ""; const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[3]}.${m[2]}.${m[1]}`:s; };
  const MON=["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [f,setF]=useState({datum:heute(),person:"Daan",betrag:"",kategorie:"Essen",beschreibung:""});
  const [zeit,setZeit]=useState("jahr");
  const [wer,setWer]=useState("alle");
  const [saving,setSaving]=useState(false);
  const ladeKats=()=>supabase.from("partner_auslagen_kategorien").select("name").order("created_at").then(({data,error})=>{ if(error) console.error(error); setEigeneKats((data||[]).map(k=>k.name)); });
  const KATS=[...KATS_BASIS.slice(0,-1),...eigeneKats.filter(k=>!KATS_BASIS.includes(k)),...[...new Set(rows.map(r=>r.kategorie).filter(Boolean))].filter(k=>!KATS_BASIS.includes(k)&&!eigeneKats.includes(k)),"Sonstiges"];
  const speichereKat=async()=>{
    const n=String(neuKat||"").trim().replace(/\s+/g," ");
    if(!n){ setNeuKat(null); return; }
    if(n.length>40){ alert("Bitte höchstens 40 Zeichen."); return; }
    const vorhanden=KATS.find(k=>k.toLowerCase()===n.toLowerCase());
    if(!vorhanden){ const {error}=await supabase.from("partner_auslagen_kategorien").insert({name:n}); if(error){ alert("Kategorie konnte nicht gespeichert werden: "+error.message); return; } await ladeKats(); }
    setF(p=>({...p,kategorie:vorhanden||n})); setNeuKat(null);
  };
  const lade=()=>supabase.from("partner_auslagen").select("*").order("datum",{ascending:false}).order("created_at",{ascending:false}).then(({data,error})=>{ if(error) console.error(error); setRows(data||[]); setLoading(false); });
  useEffect(()=>{ ladeKats(); },[]);
  useEffect(()=>{ lade(); const ch=supabase.channel("partner_auslagen_page").on("postgres_changes",{event:"*",schema:"public",table:"partner_auslagen"},lade).subscribe(); return ()=>{ supabase.removeChannel(ch); }; },[]);
  const now=new Date(), jj=String(now.getFullYear()), mm=jj+"-"+String(now.getMonth()+1).padStart(2,"0");
  const imZeitraum=(r)=>{ const d=String(r.datum||""); return zeit==="monat"?d.startsWith(mm):zeit==="jahr"?d.startsWith(jj):true; };
  const zeitLabel=zeit==="monat"?`${MON[now.getMonth()]} ${jj}`:zeit==="jahr"?`Jahr ${jj}`:"Gesamt";
  const imZ=rows.filter(imZeitraum);
  const summe=(list,p)=>list.filter(r=>!p||r.person===p).reduce((s,r)=>s+(+r.betrag||0),0);
  const sD=summe(imZ,"Daan"), sM=summe(imZ,"Martijn"), tot=sD+sM;
  const proKat=KATS.concat([""]).map(k=>[k||"Ohne Kategorie",imZ.filter(r=>(r.kategorie||"")===k||(!k&&!KATS.includes(r.kategorie||""))).reduce((s,r)=>s+(+r.betrag||0),0)]).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const add=async()=>{
    const b=parseFloat(String(f.betrag).replace(/'/g,"").replace(",","."));
    if(!(b>0)){ alert("Bitte einen gültigen Betrag eingeben."); return; }
    setSaving(true);
    const {error}=await supabase.from("partner_auslagen").insert({datum:heute(),person:f.person,betrag:Math.round(b*100)/100,kategorie:f.kategorie||null});
    setSaving(false);
    if(error){ alert("Speichern fehlgeschlagen: "+error.message); return; }
    setF(p=>({...p,betrag:"",beschreibung:""})); lade();
  };
  const del=async(r)=>{ if(!confirm(`Eintrag ${fmt(r.betrag)} (${r.person}) löschen?`)) return; await supabase.from("partner_auslagen").delete().eq("id",r.id); lade(); };
  const shown=imZ.filter(r=>wer==="alle"||r.person===wer);
  const card={flex:"1 1 180px",background:"var(--surface)",border:"1px solid var(--line)",borderRadius:8,padding:"18px 20px"};
  const box=(p,s)=>(
    <div style={card}>
      <div className="fl">{p}</div>
      <div style={{fontSize:24,fontWeight:600,color:"var(--ink)"}}>{fmt(s)}</div>
      <div style={{fontSize:11,color:"var(--muted)",marginTop:4}}>{(n=>n===1?"1 Ausgabe":n+" Ausgaben")(imZ.filter(r=>r.person===p).length)} · {tot>0?Math.round(s/tot*100):0} %</div>
    </div>);
  return (
    <div>
      <div className="ph"><div className="pt">Geschäftskarte</div>
        <div style={{fontSize:12.5,color:"var(--muted)"}}>Was Daan und Martijn mit der Geschäftskreditkarte ausgegeben haben, z. B. Geschäftsessen oder Bahn.</div></div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",margin:"16px 0 12px"}}>
        {[["monat","Dieser Monat"],["jahr","Dieses Jahr"],["alle","Gesamt"]].map(([k,l])=><button key={k} className={`btn btn-sm ${zeit===k?"btn-p":"btn-g"}`} onClick={()=>setZeit(k)}>{l}</button>)}
      </div>
      <div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:18}}>
        {box("Daan",sD)}{box("Martijn",sM)}
        <div style={card}>
          <div className="fl">Total · {zeitLabel}</div>
          <div style={{fontSize:24,fontWeight:600,color:"var(--ink)"}}>{fmt(tot)}</div>
          <div style={{fontSize:11,color:"var(--muted)",marginTop:4,lineHeight:1.6}}>{proKat.length?proKat.slice(0,3).map(([k,v])=>`${k} ${fmt(v)}`).join(" · "):"Noch keine Ausgaben"}</div>
        </div>
      </div>
      <div className="card" style={{padding:20}}>
        <div style={{display:"grid",gridTemplateColumns:"150px 160px 240px auto",gap:10,alignItems:"end",justifyContent:"start"}} className="auslagen-form">
          <div><label className="fl">Wer</label>
            <div style={{display:"flex",gap:6}}>{PERS.map(p=><button key={p} type="button" className={`btn btn-sm ${f.person===p?"btn-p":"btn-g"}`} onClick={()=>setF({...f,person:p})}>{p}</button>)}</div></div>
          <div><label className="fl">Betrag (CHF)</label><input className="fi" inputMode="decimal" placeholder="0.00" value={f.betrag} onChange={e=>setF({...f,betrag:e.target.value})} onKeyDown={e=>{ if(e.key==="Enter") add(); }}/></div>
          <div><label className="fl">Kategorie</label>
            {neuKat!==null
              ? <div style={{display:"flex",gap:6}}><input className="fi" autoFocus placeholder="Neue Kategorie" value={neuKat} onChange={e=>setNeuKat(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") speichereKat(); if(e.key==="Escape") setNeuKat(null); }}/><button type="button" className="btn btn-p btn-sm" onClick={speichereKat} title="Kategorie speichern">✓</button><button type="button" className="btn btn-g btn-sm" onClick={()=>setNeuKat(null)} title="Abbrechen">✕</button></div>
              : <select className="fi" value={f.kategorie} onChange={e=>{ if(e.target.value==="__neu") setNeuKat(""); else setF({...f,kategorie:e.target.value}); }}>{KATS.map(k=><option key={k} value={k}>{k}</option>)}<option value="__neu">＋ Neue Kategorie…</option></select>}</div>
          <div><button className="btn btn-p" disabled={saving} onClick={add}>{saving?"Speichern…":"Hinzufügen"}</button></div>
        </div>
      </div>
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginBottom:10}}>
        {[["alle","Alle"],["Daan","Daan"],["Martijn","Martijn"]].map(([k,l])=><button key={k} className={`btn btn-sm ${wer===k?"btn-p":"btn-g"}`} onClick={()=>setWer(k)}>{l}</button>)}
        <div style={{flex:1}}/><div style={{fontSize:12,color:"var(--muted)"}}>{zeitLabel}: {fmt(summe(shown))}</div>
      </div>
      <div className="card" style={{padding:0,overflow:"auto"}}>
        {loading ? <div style={{padding:20,color:"var(--muted)"}}>Lädt…</div> :
         shown.length===0 ? <div style={{padding:20,color:"var(--muted)",fontSize:13}}>Keine Ausgaben in diesem Zeitraum.</div> :
         <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{textAlign:"left",color:"var(--muted)",fontSize:10,letterSpacing:".15em",textTransform:"uppercase"}}>
            <th style={{padding:"12px 16px"}}>Wer</th><th style={{padding:"12px 8px",textAlign:"right"}}>Betrag</th><th style={{padding:"12px 8px 12px 24px"}}>Kategorie</th><th></th></tr></thead>
          <tbody>{shown.map(r=>(
            <tr key={r.id} style={{borderTop:"1px solid var(--line)"}}>
              <td style={{padding:"10px 16px"}}><span style={{background:r.person==="Daan"?"#e8efde":"#f2ecdb",color:r.person==="Daan"?"#3a5230":"#7c6a4e",fontSize:11,padding:"2px 9px",borderRadius:8,fontWeight:600}}>{r.person}</span></td>
              <td style={{padding:"10px 8px",textAlign:"right",whiteSpace:"nowrap",fontWeight:600}}>{fmt(r.betrag)}</td>
              <td style={{padding:"10px 8px 10px 24px",whiteSpace:"nowrap"}}>{r.kategorie||"–"}</td>
              <td style={{padding:"10px 16px",textAlign:"right"}}><button className="btn btn-g btn-sm" onClick={()=>del(r)} title="Löschen">✕</button></td>
            </tr>))}</tbody>
         </table>}
      </div>
    </div>);
}

// Passwort-Tresor: Ende-zu-Ende verschluesselt im Browser (AES-GCM).
// Ein zufaelliger Datenschluessel verschluesselt die Eintraege. Er wird zweimal gesichert abgelegt:
// mit dem Master-Passwort und mit einem Wiederherstellungsschluessel. Die Datenbank sieht nie Klartext.
const PWV = (()=>{
  const enc=new TextEncoder(), dec=new TextDecoder();
  const b64=(u8)=>btoa(String.fromCharCode(...new Uint8Array(u8)));
  const ub64=(s)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const rnd=(n)=>crypto.getRandomValues(new Uint8Array(n));
  async function kek(secret,saltB64,iter){
    const base=await crypto.subtle.importKey("raw",enc.encode(secret),"PBKDF2",false,["deriveKey"]);
    return crypto.subtle.deriveKey({name:"PBKDF2",salt:ub64(saltB64),iterations:iter,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  }
  async function seal(key,bytes){ const iv=rnd(12); const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,bytes); return b64(iv)+":"+b64(ct); }
  async function open(key,s){ const [iv,ct]=s.split(":"); return new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:ub64(iv)},key,ub64(ct))); }
  async function importDek(raw){ return crypto.subtle.importKey("raw",raw,{name:"AES-GCM"},true,["encrypt","decrypt"]); }
  function newRecoveryKey(){ const A="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const r=rnd(24); let s=""; for(let i=0;i<24;i++){ s+=A[r[i]%32]; if(i%4===3&&i<23) s+="-"; } return s; }
  const normRk=(s)=>String(s||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
  return {
    ITER:600000, RK_ITER:100000,
    newRecoveryKey, normRk, rndSalt:()=>b64(rnd(16)),
    async createVault(master){
      const dekRaw=rnd(32), rk=newRecoveryKey();
      const pw_salt=b64(rnd(16)), rk_salt=b64(rnd(16));
      const pw_wrapped=await seal(await kek(master,pw_salt,this.ITER),dekRaw);
      const rk_wrapped=await seal(await kek(normRk(rk),rk_salt,this.RK_ITER),dekRaw);
      return {meta:{id:1,pw_salt,pw_iter:this.ITER,pw_wrapped,rk_salt,rk_wrapped}, dek:await importDek(dekRaw), dekRaw, rk};
    },
    async unlockPw(meta,master){ const raw=await open(await kek(master,meta.pw_salt,meta.pw_iter),meta.pw_wrapped); return {dek:await importDek(raw),dekRaw:raw}; },
    async unlockRk(meta,rk){ const raw=await open(await kek(normRk(rk),meta.rk_salt,this.RK_ITER),meta.rk_wrapped); return {dek:await importDek(raw),dekRaw:raw}; },
    async rewrapPw(dekRaw,master){ const pw_salt=b64(rnd(16)); return {pw_salt,pw_iter:this.ITER,pw_wrapped:await seal(await kek(master,pw_salt,this.ITER),dekRaw)}; },
    async rewrapRk(dekRaw){ const rk=newRecoveryKey(), rk_salt=b64(rnd(16)); return {rk, fields:{rk_salt,rk_wrapped:await seal(await kek(normRk(rk),rk_salt,this.RK_ITER),dekRaw)}}; },
    b64, ub64,
    async encField(dek,txt){ if(txt==null||txt==="") return null; return seal(dek,enc.encode(String(txt))); },
    async decField(dek,s){ if(!s) return ""; try{ return dec.decode(await open(dek,s)); }catch(e){ return "⚠︎ nicht lesbar"; } },
  };
})();

function PasswoerterPage(){
  const [meta,setMeta]=useState(undefined);
  const [rows,setRows]=useState([]);
  const [dek,setDek]=useState(null);
  const [dekRaw,setDekRaw]=useState(null);
  const [plain,setPlain]=useState({});
  const [mpw,setMpw]=useState(""); const [mpw2,setMpw2]=useState("");
  const [rkIn,setRkIn]=useState("");
  const [mode,setMode]=useState("unlock"); // unlock | recover | setup | newpw
  const [busy,setBusy]=useState(false); const [err,setErr]=useState("");
  const [showRk,setShowRk]=useState(null);
  const [q,setQ]=useState(""); const [shown,setShown]=useState({}); const [edit,setEdit]=useState(null);
  const [copied,setCopied]=useState("");
  const [codeSent,setCodeSent]=useState(""); const [codeIn,setCodeIn]=useState("");
  const vaultFn=async(body)=>{ const {data,error}=await supabase.functions.invoke("vault-recover",{body}); if(error){ let m=error.message; try{ const j=await error.context.json(); if(j&&j.error) m=j.error; }catch(_){} throw new Error(m); } if(data&&data.error) throw new Error(data.error); return data; };
  const escrow=(raw)=>vaultFn({action:"escrow",dek:PWV.b64(raw)}).catch(e=>console.warn("Escrow fehlgeschlagen:",e));
  const ladeMeta=()=>supabase.from("passwort_tresor").select("*").eq("id",1).maybeSingle().then(({data})=>{ setMeta(data||null); if(!data) setMode("setup"); });
  const ladeRows=()=>supabase.from("passwoerter").select("*").order("name",{ascending:true}).then(({data})=>setRows(data||[]));
  useEffect(()=>{ ladeMeta(); ladeRows(); },[]);
  useEffect(()=>{ if(!dek) return; let alive=true; (async()=>{ const m={}; for(const r of rows){ m[r.id]={benutzer:r.benutzer_enc?await PWV.decField(dek,r.benutzer_enc):(r.benutzer||""), passwort:r.passwort_enc?await PWV.decField(dek,r.passwort_enc):(r.passwort||""), notiz:r.notiz_enc?await PWV.decField(dek,r.notiz_enc):(r.notiz||"")}; } if(alive) setPlain(m); })(); return ()=>{alive=false;}; },[dek,rows]);
  // Auto-Sperre nach 15 Minuten
  useEffect(()=>{ if(!dek) return; const t=setTimeout(()=>{ setDek(null); setDekRaw(null); setPlain({}); setMode("unlock"); },15*60*1000); return ()=>clearTimeout(t); },[dek,rows,q,shown]);
  const pwOk=(p)=>p.length>=10;
  const migratePlain=async(key)=>{ // vorhandene Klartext-Eintraege verschluesseln und Klartext loeschen
    const {data}=await supabase.from("passwoerter").select("*");
    for(const r of (data||[])){ if(r.benutzer==null&&r.passwort==null&&r.notiz==null) continue;
      const upd={benutzer:null,passwort:null,notiz:null,updated_at:new Date().toISOString()};
      if(r.benutzer!=null) upd.benutzer_enc=await PWV.encField(key,r.benutzer);
      if(r.passwort!=null) upd.passwort_enc=await PWV.encField(key,r.passwort);
      if(r.notiz!=null) upd.notiz_enc=await PWV.encField(key,r.notiz);
      const {error}=await supabase.from("passwoerter").update(upd).eq("id",r.id); if(error) throw error; }
  };
  const doSetup=async()=>{ setErr(""); if(!pwOk(mpw)) return setErr("Mindestens 10 Zeichen."); if(mpw!==mpw2) return setErr("Die Passwörter stimmen nicht überein.");
    setBusy(true); try{ const v=await PWV.createVault(mpw); const {error}=await supabase.from("passwort_tresor").insert(v.meta); if(error) throw error;
      await migratePlain(v.dek); await escrow(v.dekRaw); setMeta(v.meta); setDek(v.dek); setDekRaw(v.dekRaw); setMpw(""); setMpw2(""); ladeRows(); }
    catch(e){ setErr("Fehler: "+(e.message||e)); } setBusy(false); };
  const doUnlock=async()=>{ setErr(""); setBusy(true); try{ const r=await PWV.unlockPw(meta,mpw); setDek(r.dek); setDekRaw(r.dekRaw); setMpw(""); await migratePlain(r.dek); escrow(r.dekRaw); ladeRows(); }catch(e){ setErr("Master-Passwort falsch."); } setBusy(false); };
  const doRecover=async()=>{ setErr(""); if(!pwOk(mpw)) return setErr("Neues Master-Passwort: mindestens 10 Zeichen."); if(mpw!==mpw2) return setErr("Die Passwörter stimmen nicht überein.");
    setBusy(true); try{ const r=await PWV.unlockRk(meta,rkIn); const pwf=await PWV.rewrapPw(r.dekRaw,mpw); const rkf=await PWV.rewrapRk(r.dekRaw);
      const {error}=await supabase.from("passwort_tresor").update({...pwf,...rkf.fields,updated_at:new Date().toISOString()}).eq("id",1); if(error) throw error;
      setMeta({...meta,...pwf,...rkf.fields}); setDek(r.dek); setDekRaw(r.dekRaw); escrow(r.dekRaw); setShowRk(rkf.rk); setMpw(""); setMpw2(""); setRkIn(""); }
    catch(e){ setErr(e&&e.name==="OperationError"?"Wiederherstellungsschlüssel falsch.":"Fehler: "+(e.message||e)); } setBusy(false); };
  const sendCode=async()=>{ setErr(""); setBusy(true); try{ const d=await vaultFn({action:"request"}); setCodeSent(d.email||"deine E-Mail"); }catch(e){ setErr(e.message); } setBusy(false); };
  const doRecoverMail=async()=>{ setErr(""); if(!/^\d{6}$/.test(codeIn.trim())) return setErr("Bitte den 6-stelligen Code eingeben."); if(!pwOk(mpw)) return setErr("Neues Master-Passwort: mindestens 10 Zeichen."); if(mpw!==mpw2) return setErr("Die Passwörter stimmen nicht überein.");
    setBusy(true); try{ const d=await vaultFn({action:"verify",code:codeIn.trim()}); const raw=PWV.ub64(d.dek); const key=await crypto.subtle.importKey("raw",raw,{name:"AES-GCM"},true,["encrypt","decrypt"]);
      const pwf=await PWV.rewrapPw(raw,mpw); const {error}=await supabase.from("passwort_tresor").update({...pwf,updated_at:new Date().toISOString()}).eq("id",1); if(error) throw error;
      setMeta({...meta,...pwf}); setDek(key); setDekRaw(raw); setMpw(""); setMpw2(""); setCodeIn(""); setCodeSent(""); alert("Neues Master-Passwort gesetzt."); }
    catch(e){ setErr(e.message||String(e)); } setBusy(false); };
  const doNewPw=async()=>{ setErr(""); if(!pwOk(mpw)) return setErr("Mindestens 10 Zeichen."); if(mpw!==mpw2) return setErr("Die Passwörter stimmen nicht überein.");
    setBusy(true); try{ const pwf=await PWV.rewrapPw(dekRaw,mpw); const {error}=await supabase.from("passwort_tresor").update({...pwf,updated_at:new Date().toISOString()}).eq("id",1); if(error) throw error; setMeta({...meta,...pwf}); setMpw(""); setMpw2(""); setMode("unlock"); alert("Master-Passwort geändert."); }
    catch(e){ setErr("Fehler: "+(e.message||e)); } setBusy(false); };
  const doNewRk=async()=>{ if(!confirm("Einen Wiederherstellungsschlüssel als zusätzliche Absicherung erstellen? Ein früher erstellter wird ungültig.")) return; const rkf=await PWV.rewrapRk(dekRaw); const {error}=await supabase.from("passwort_tresor").update({...rkf.fields,updated_at:new Date().toISOString()}).eq("id",1); if(error) return alert(error.message); setMeta({...meta,...rkf.fields}); setShowRk(rkf.rk); };
  const lock=()=>{ setDek(null); setDekRaw(null); setPlain({}); setShown({}); setMode("unlock"); };
  const copy=async(txt,key)=>{ try{ await navigator.clipboard.writeText(txt); setCopied(key); setTimeout(()=>setCopied(""),1500); }catch(e){ prompt("Kopieren:",txt); } };
  const save=async()=>{ const e=edit; if(!(e.name||"").trim()) return alert("Bitte einen Namen angeben.");
    const row={name:e.name.trim(),benutzer:null,passwort:null,notiz:null,benutzer_enc:await PWV.encField(dek,e.benutzer),passwort_enc:await PWV.encField(dek,e.passwort),notiz_enc:await PWV.encField(dek,e.notiz),updated_at:new Date().toISOString()};
    const res=e.id?await supabase.from("passwoerter").update(row).eq("id",e.id):await supabase.from("passwoerter").insert(row);
    if(res.error) return alert(res.error.message); setEdit(null); ladeRows(); };
  const del=async(r)=>{ if(!confirm(`"${r.name}" löschen?`)) return; await supabase.from("passwoerter").delete().eq("id",r.id); setEdit(null); ladeRows(); };
  const genPw=()=>{ const A="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#$%&*?"; const r=crypto.getRandomValues(new Uint8Array(18)); return Array.from(r,x=>A[x%A.length]).join(""); };

  const wrap=(children)=>(<div><div className="ph"><div className="pt">Passwörter</div><div style={{fontSize:12.5,color:"var(--muted)"}}>Verschlüsselter Tresor. Die Einträge werden im Browser ver- und entschlüsselt, die Datenbank speichert nur unlesbaren Text.</div></div>{children}</div>);
  const box={maxWidth:440,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:8,padding:24,marginTop:16};
  const errEl=err?<div style={{color:"#a4442e",fontSize:12.5,marginTop:10}}>{err}</div>:null;

  if(meta===undefined) return wrap(<div style={{padding:20,color:"var(--muted)"}}>Lädt…</div>);

  if(showRk) return wrap(
    <div style={{...box,maxWidth:560,borderColor:"#c9a24a"}}>
      <div style={{fontWeight:600,fontSize:15,marginBottom:8}}>Dein Wiederherstellungsschlüssel</div>
      <div style={{fontSize:12.5,color:"var(--ink)",lineHeight:1.6,marginBottom:14}}>Zusätzliche Absicherung neben der E-Mail-Wiederherstellung, z. B. falls ihr keinen Zugriff auf eure E-Mail habt. Er wird <b>nur jetzt</b> angezeigt. Bewahrt ihn ausserhalb von ImmoBase auf, z. B. ausgedruckt im Büro und als Notiz auf beiden Handys.</div>
      <div style={{fontFamily:"monospace",fontSize:20,letterSpacing:".08em",background:"#faf6ec",border:"1px dashed #c9a24a",borderRadius:8,padding:"14px 16px",textAlign:"center",userSelect:"all"}}>{showRk}</div>
      <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}>
        <button className="btn btn-g btn-sm" onClick={()=>copy(showRk,"rk")}>{copied==="rk"?"Kopiert":"Kopieren"}</button>
        <button className="btn btn-g btn-sm" onClick={()=>{ const w=window.open("","_blank"); if(w){ w.document.write(`<html><body style="font-family:sans-serif;padding:40px"><h2>D&T Homes · ImmoBase Passwort-Tresor</h2><p>Wiederherstellungsschlüssel (erstellt ${new Date().toLocaleDateString("de-CH")}):</p><p style="font-family:monospace;font-size:26px;letter-spacing:2px;border:1px dashed #999;padding:16px;display:inline-block">${showRk}</p><p>Sicher aufbewahren. Damit kann ein neues Master-Passwort gesetzt werden.</p></body></html>`); w.document.close(); w.print(); } }}>Drucken</button>
        <div style={{flex:1}}/>
        <button className="btn btn-p btn-sm" onClick={()=>{ if(confirm("Hast du den Schlüssel sicher gespeichert?")) setShowRk(null); }}>Gespeichert, weiter</button>
      </div>
    </div>);

  if(!dek){
    if(mode==="setup"||!meta) return wrap(
      <div style={box}>
        <div style={{fontWeight:600,fontSize:15,marginBottom:6}}>Tresor einrichten</div>
        <div style={{fontSize:12.5,color:"var(--muted)",lineHeight:1.6,marginBottom:14}}>Wählt ein gemeinsames Master-Passwort (mindestens 10 Zeichen). Falls ihr es vergesst, könnt ihr es per E-Mail-Code zurücksetzen. Die {rows.length} importierten Einträge werden dabei verschlüsselt.</div>
        <label className="fl">Master-Passwort</label><input className="fi" type="password" value={mpw} onChange={e=>setMpw(e.target.value)} autoFocus/>
        <label className="fl" style={{marginTop:10}}>Wiederholen</label><input className="fi" type="password" value={mpw2} onChange={e=>setMpw2(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") doSetup(); }}/>
        {errEl}
        <button className="btn btn-p" style={{marginTop:14}} disabled={busy} onClick={doSetup}>{busy?"Verschlüsselt…":"Tresor einrichten"}</button>
      </div>);
    if(mode==="recover") return wrap(
      <div style={box}>
        <div style={{fontWeight:600,fontSize:15,marginBottom:6}}>Master-Passwort zurücksetzen</div>
        {!codeSent ? <>
          <div style={{fontSize:12.5,color:"var(--muted)",lineHeight:1.6,marginBottom:14}}>Wir senden dir einen 6-stelligen Code an die E-Mail-Adresse, mit der du in ImmoBase angemeldet bist. Damit kannst du ein neues Master-Passwort setzen.</div>
          {errEl}
          <div style={{display:"flex",gap:8,marginTop:14}}><button className="btn btn-p" disabled={busy} onClick={sendCode}>{busy?"Sendet…":"Code per E-Mail senden"}</button><button className="btn btn-g" onClick={()=>{setMode("unlock");setErr("");}}>Abbrechen</button></div>
        </> : <>
          <div style={{fontSize:12.5,color:"var(--muted)",lineHeight:1.6,marginBottom:14}}>Code gesendet an <b>{codeSent}</b>. Er ist 15 Minuten gültig.</div>
          <label className="fl">Code aus der E-Mail</label><input className="fi" inputMode="numeric" style={{fontFamily:"monospace",letterSpacing:".3em",fontSize:16}} maxLength={6} value={codeIn} onChange={e=>setCodeIn(e.target.value.replace(/\D/g,""))} autoFocus/>
          <label className="fl" style={{marginTop:10}}>Neues Master-Passwort</label><input className="fi" type="password" value={mpw} onChange={e=>setMpw(e.target.value)}/>
          <label className="fl" style={{marginTop:10}}>Wiederholen</label><input className="fi" type="password" value={mpw2} onChange={e=>setMpw2(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") doRecoverMail(); }}/>
          {errEl}
          <div style={{display:"flex",gap:8,marginTop:14,alignItems:"center"}}><button className="btn btn-p" disabled={busy} onClick={doRecoverMail}>{busy?"Prüft…":"Speichern"}</button><button className="btn btn-g" onClick={()=>{setMode("unlock");setErr("");setCodeSent("");}}>Abbrechen</button><div style={{flex:1}}/><a href="#" style={{fontSize:12,color:"var(--muted)",whiteSpace:"nowrap"}} onClick={e=>{e.preventDefault();sendCode();}}>Neuen Code senden</a></div>
        </>}
        <div style={{marginTop:16,paddingTop:12,borderTop:"1px solid var(--line)"}}><a href="#" style={{fontSize:12,color:"var(--muted)"}} onClick={e=>{e.preventDefault();setMode("recoverkey");setErr("");}}>Stattdessen Wiederherstellungsschlüssel verwenden</a></div>
      </div>);
    if(mode==="recoverkey") return wrap(
      <div style={box}>
        <div style={{fontWeight:600,fontSize:15,marginBottom:6}}>Master-Passwort zurücksetzen</div>
        <div style={{fontSize:12.5,color:"var(--muted)",lineHeight:1.6,marginBottom:14}}>Gib den Wiederherstellungsschlüssel ein und wähle ein neues Master-Passwort. Danach erhältst du einen neuen Wiederherstellungsschlüssel.</div>
        <label className="fl">Wiederherstellungsschlüssel</label><input className="fi" style={{fontFamily:"monospace"}} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" value={rkIn} onChange={e=>setRkIn(e.target.value)} autoFocus/>
        <label className="fl" style={{marginTop:10}}>Neues Master-Passwort</label><input className="fi" type="password" value={mpw} onChange={e=>setMpw(e.target.value)}/>
        <label className="fl" style={{marginTop:10}}>Wiederholen</label><input className="fi" type="password" value={mpw2} onChange={e=>setMpw2(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") doRecover(); }}/>
        {errEl}
        <div style={{display:"flex",gap:8,marginTop:14}}><button className="btn btn-p" disabled={busy} onClick={doRecover}>{busy?"Prüft…":"Zurücksetzen"}</button><button className="btn btn-g" onClick={()=>{setMode("unlock");setErr("");}}>Abbrechen</button></div>
      </div>);
    return wrap(
      <div style={box}>
        <div style={{fontWeight:600,fontSize:15,marginBottom:12}}>🔒 Tresor gesperrt</div>
        <label className="fl">Master-Passwort</label><input className="fi" type="password" value={mpw} onChange={e=>setMpw(e.target.value)} autoFocus onKeyDown={e=>{ if(e.key==="Enter") doUnlock(); }}/>
        {errEl}
        <div style={{display:"flex",gap:8,marginTop:14,alignItems:"center"}}><button className="btn btn-p" disabled={busy} onClick={doUnlock}>{busy?"Entsperrt…":"Entsperren"}</button><div style={{flex:1}}/><a href="#" style={{fontSize:12,color:"var(--muted)"}} onClick={e=>{e.preventDefault();setMode("recover");setErr("");setMpw("");setCodeSent("");}}>Master-Passwort vergessen?</a></div>
      </div>);
  }

  if(mode==="newpw") return wrap(
    <div style={box}>
      <div style={{fontWeight:600,fontSize:15,marginBottom:12}}>Master-Passwort ändern</div>
      <label className="fl">Neues Master-Passwort</label><input className="fi" type="password" value={mpw} onChange={e=>setMpw(e.target.value)} autoFocus/>
      <label className="fl" style={{marginTop:10}}>Wiederholen</label><input className="fi" type="password" value={mpw2} onChange={e=>setMpw2(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") doNewPw(); }}/>
      {errEl}
      <div style={{display:"flex",gap:8,marginTop:14}}><button className="btn btn-p" disabled={busy} onClick={doNewPw}>Speichern</button><button className="btn btn-g" onClick={()=>{setMode("unlock");setErr("");setMpw("");setMpw2("");}}>Abbrechen</button></div>
    </div>);

  const ql=q.trim().toLowerCase();
  const list=rows.filter(r=>{ if(!ql) return true; const p=plain[r.id]||{}; return (r.name+" "+(p.benutzer||"")+" "+(p.notiz||"")).toLowerCase().includes(ql); });
  const td={padding:"10px 8px",verticalAlign:"top"};
  return wrap(<>
    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",margin:"16px 0 12px"}}>
      <input className="fi" style={{maxWidth:280}} placeholder="Suchen…" value={q} onChange={e=>setQ(e.target.value)}/>
      <button className="btn btn-p btn-sm" onClick={()=>setEdit({name:"",benutzer:"",passwort:"",notiz:""})}>+ Neuer Eintrag</button>
      <div style={{flex:1}}/>
      <button className="btn btn-g btn-sm" onClick={()=>{setMode("newpw");setErr("");}}>Master-Passwort ändern</button>
      <button className="btn btn-g btn-sm" onClick={doNewRk}>Wiederherstellungsschlüssel (optional)</button>
      <button className="btn btn-g btn-sm" onClick={lock}>🔒 Sperren</button>
    </div>
    {edit && <div className="card" style={{padding:20}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}} className="auslagen-form">
        <div><label className="fl">Name</label><input className="fi" value={edit.name} onChange={e=>setEdit({...edit,name:e.target.value})} autoFocus/></div>
        <div><label className="fl">Benutzer / E-Mail</label><input className="fi" value={edit.benutzer} onChange={e=>setEdit({...edit,benutzer:e.target.value})}/></div>
        <div><label className="fl">Passwort</label><div style={{display:"flex",gap:6}}><input className="fi" value={edit.passwort} onChange={e=>setEdit({...edit,passwort:e.target.value})}/><button className="btn btn-g btn-sm" title="Sicheres Passwort erzeugen" onClick={()=>setEdit({...edit,passwort:genPw()})}>🎲</button></div></div>
      </div>
      <label className="fl" style={{marginTop:10}}>Notiz / Code</label><input className="fi" value={edit.notiz} onChange={e=>setEdit({...edit,notiz:e.target.value})}/>
      <div style={{display:"flex",gap:8,marginTop:14}}><button className="btn btn-p btn-sm" onClick={save}>Speichern</button><button className="btn btn-g btn-sm" onClick={()=>setEdit(null)}>Abbrechen</button>{edit.id&&<><div style={{flex:1}}/><button className="btn btn-g btn-sm" onClick={()=>del(edit)}>Löschen</button></>}</div>
    </div>}
    <div className="card" style={{padding:0,overflow:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
        <thead><tr style={{textAlign:"left",color:"var(--muted)",fontSize:10,letterSpacing:".15em",textTransform:"uppercase"}}><th style={{padding:"12px 16px"}}>Name</th><th style={{padding:"12px 8px"}}>Benutzer</th><th style={{padding:"12px 8px"}}>Passwort</th><th style={{padding:"12px 8px"}}>Notiz / Code</th><th></th></tr></thead>
        <tbody>{list.map(r=>{ const p=plain[r.id]||{}; const vis=!!shown[r.id]; const urlM=(p.notiz||"").match(/https?:\/\/\S+/);
          return <tr key={r.id} style={{borderTop:"1px solid var(--line)"}}>
            <td style={{...td,paddingLeft:16,fontWeight:600}}>{r.name}</td>
            <td style={td}>{p.benutzer?<span style={{cursor:"pointer"}} title="Kopieren" onClick={()=>copy(p.benutzer,r.id+"u")}>{p.benutzer} <span style={{fontSize:11,color:"var(--muted)"}}>{copied===r.id+"u"?"✓":"⧉"}</span></span>:<span style={{color:"var(--muted)"}}>–</span>}</td>
            <td style={{...td,whiteSpace:"nowrap"}}>{p.passwort?<>
              <span style={{fontFamily:"monospace"}}>{vis?p.passwort:"••••••••"}</span>
              <button className="btn btn-g btn-sm" style={{marginLeft:8,padding:"2px 8px"}} onClick={()=>setShown({...shown,[r.id]:!vis})}>{vis?"Verbergen":"Zeigen"}</button>
              <button className="btn btn-g btn-sm" style={{marginLeft:4,padding:"2px 8px"}} onClick={()=>copy(p.passwort,r.id+"p")}>{copied===r.id+"p"?"✓":"Kopieren"}</button></>:<span style={{color:"var(--muted)"}}>–</span>}</td>
            <td style={td}>{p.notiz?(urlM?<a href={urlM[0]} target="_blank" rel="noopener">{p.notiz.replace(urlM[0],"").replace(/:\s*$/,"")||"Link"} ↗</a>:<span style={{fontFamily:/^[\d\s\/:-]+$/.test(p.notiz)?"monospace":"inherit"}}>{p.notiz}</span>):<span style={{color:"var(--muted)"}}>–</span>}</td>
            <td style={{...td,paddingRight:16,textAlign:"right"}}><button className="btn btn-g btn-sm" onClick={()=>setEdit({id:r.id,name:r.name,benutzer:p.benutzer||"",passwort:p.passwort||"",notiz:p.notiz||""})}>Bearbeiten</button></td>
          </tr>; })}</tbody>
      </table>
    </div>
    <div style={{fontSize:11,color:"var(--muted)",marginTop:8}}>Der Tresor sperrt sich nach 15 Minuten ohne Aktivität und beim Neuladen der Seite.</div>
  </>);
}

