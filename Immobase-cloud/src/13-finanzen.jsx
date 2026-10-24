// ─── FINANZEN (Monats-KPIs) ──────────────────────────────────────────────────
// Belegungskalender Airbnb: pro Wohnung ein Monatsraster, belegte Nächte farbig nach Kanal
function AirbnbKalender({ bookings }){
  const heute = new Date(); heute.setHours(0,0,0,0);
  const [mo, setMo] = useState(()=>new Date(heute.getFullYear(), heute.getMonth(), 1));
  const KANAL = { "Airbnb":["#e8a598","Airbnb"], "Booking.com":["#9fb5d6","Booking.com"], "Direct booking":["#a9c29a","Direkt"], "Website":["#a9c29a","Direkt"] };
  const farbe = bk => bk.isBlocked ? ["#d8d2c8","Blockiert"] : (KANAL[bk.channelName] || ["#c9b28e", bk.channelName||"Andere"]);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const aktiv = (bookings||[]).filter(b=>!b.cancelled && b.arrival && b.departure);
  const wohnungen = [...new Map(aktiv.map(b=>[b.apartmentId, (b.apartmentName||"").replace(/^D&T Homes\s*/,"")||String(b.apartmentId)])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  const tage = new Date(mo.getFullYear(), mo.getMonth()+1, 0).getDate();
  const offset = (new Date(mo.getFullYear(), mo.getMonth(), 1).getDay()+6)%7;
  const titel = mo.toLocaleDateString("de-CH",{month:"long",year:"numeric"});
  const nav = n => setMo(new Date(mo.getFullYear(), mo.getMonth()+n, 1));
  const btn = {border:"1px solid var(--line)",background:"var(--surface)",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:13,color:"var(--ink)"};
  return (
    <div style={{marginBottom:22}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:10,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:10.5,color:"var(--muted)",fontWeight:600}}>Belegungskalender</div>
          {bookings && bookings.syncStatus && (()=>{ const s=bookings.syncStatus; const ok=s.last_ok?new Date(s.last_ok):null; const alt=!ok||(Date.now()-ok)>3600000;
            return <div style={{fontSize:10,color:alt?"#9b4a3e":"var(--muted)",marginTop:2}}>Elev8, Stand {ok?ok.toLocaleString("de-CH",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"-"}{alt&&s.last_error?` · ${s.last_error}`:""}</div>; })()}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <button style={btn} onClick={()=>nav(-1)} aria-label="Vorheriger Monat">‹</button>
          <span style={{fontSize:13,fontWeight:600,minWidth:120,textAlign:"center",textTransform:"capitalize"}}>{titel}</span>
          <button style={btn} onClick={()=>nav(1)} aria-label="Nächster Monat">›</button>
          {(mo.getMonth()!==heute.getMonth()||mo.getFullYear()!==heute.getFullYear()) && <button style={{...btn,fontSize:11}} onClick={()=>setMo(new Date(heute.getFullYear(),heute.getMonth(),1))}>Heute</button>}
        </div>
      </div>
      <div className="abkal-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(min(280px, 100%), 1fr))",gap:16}}>
        {wohnungen.map(([wid, name])=>{
          const bks = aktiv.filter(b=>b.apartmentId===wid);
          const nachtVon = {}; const anreise = {};
          bks.forEach(b=>{
            const a=new Date(b.arrival+"T00:00:00"), d=new Date(b.departure+"T00:00:00");
            for(let x=new Date(a); x<d; x.setDate(x.getDate()+1)) nachtVon[iso(x)] = b;
            anreise[b.arrival] = b;
          });
          let belegt=0, frei=0;
          const zellen=[];
          for(let i=0;i<offset;i++) zellen.push(<div key={"l"+i}/>);
          for(let t=1;t<=tage;t++){
            const d=new Date(mo.getFullYear(), mo.getMonth(), t); const k=iso(d); const b=nachtVon[k];
            const vorbei = d<heute; const istHeute = d.getTime()===heute.getTime();
            if(b && !b.isBlocked) belegt++; else if(!b) frei++;
            const [bg, label] = b ? farbe(b) : ["var(--surface)","Frei"];
            const start = b && b.arrival===k;
            const tip = b ? `${t}. ${titel}: ${label}${b.guestName&&!b.isBlocked?" · "+b.guestName:""} · ${new Date(b.arrival).toLocaleDateString("de-CH")} bis ${new Date(b.departure).toLocaleDateString("de-CH")}${b.adults?` · ${b.adults+(b.children||0)} Gäste`:""}` : `${t}. ${titel}: frei`;
            zellen.push(
              <div key={k} title={tip} style={{position:"relative",height:34,borderRadius:6,background:bg,border:b?"1px solid transparent":"1px solid var(--line-soft)",opacity:vorbei?.55:1,outline:istHeute?"2px solid var(--ink)":"none",outlineOffset:-2,display:"flex",flexDirection:"column",alignItems:"flex-start",justifyContent:"space-between",padding:"3px 4px",boxSizing:"border-box",overflow:"hidden"}}>
                <span style={{fontSize:10.5,fontWeight:istHeute?700:500,color:b?"#2f2a24":"var(--muted)"}}>{t}</span>
                {start && <span style={{fontSize:8,lineHeight:1,color:"#2f2a24",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%"}}>{b.isBlocked?"Block":(b.guestName||label).split(" ")[0]}</span>}
              </div>
            );
          }
          return (
            <div key={wid} style={{border:"1px solid var(--line-soft)",borderRadius:10,padding:"12px 12px 10px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:8,gap:8}}>
                <span style={{fontSize:13,fontWeight:600,color:"var(--ink)"}}>{name}</span>
                <span style={{fontSize:11,color:"var(--muted)"}}>{belegt} belegt · {frei} frei</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
                {["Mo","Di","Mi","Do","Fr","Sa","So"].map(w=><div key={w} style={{fontSize:9,color:"var(--muted)",textAlign:"center",paddingBottom:2}}>{w}</div>)}
                {zellen}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:12,marginTop:10,fontSize:10.5,color:"var(--muted)"}}>
        {[["#e8a598","Airbnb"],["#9fb5d6","Booking.com"],["#a9c29a","Direkt"],["#d8d2c8","Blockiert"],["var(--surface)","Frei"]].map(([c,l])=>(
          <span key={l} style={{display:"inline-flex",alignItems:"center",gap:5}}><span style={{width:11,height:11,borderRadius:3,background:c,border:"1px solid var(--line)"}}/>{l}</span>
        ))}
        <span>Farbige Tage = belegte Nacht (Anreisetag bis Nacht vor Abreise)</span>
      </div>
    </div>
  );
}

function FinanzenSection({ tenants, apts, rooms, smoobuBookings, parkplaetze=[] }){
  const [openTbl, setOpenTbl] = useState({});
  const curMonthRef = useRef({});
  // Wiederverwendbare Callback-Ref: zentriert den aktuellen Monat horizontal
  // im jeweiligen Balken-Container. Der aktuelle Balken traegt data-current.
  // Wird auf jedes Balkendiagramm gesetzt, damit ueberall der aktuelle Monat
  // sofort mittig steht, ohne Scrollen.
  const zentriereAktuellen = useCallback((c) => {
    if (!c) return;
    requestAnimationFrame(() => {
      const b = c.querySelector('[data-current="1"]');
      if (!b) return;
      const cRect = c.getBoundingClientRect();
      const bRect = b.getBoundingClientRect();
      const ziel = (bRect.left - cRect.left) + c.scrollLeft - (c.clientWidth / 2) + (bRect.width / 2);
      c.scrollTo({ left: Math.max(0, ziel), behavior: "auto" });
    });
  }, []);
  const GrpRow = ({label, value}) => (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"7px 0 3px"}}>
      <span style={{fontSize:9,textTransform:"uppercase",letterSpacing:".18em",color:"var(--muted)"}}>{label}</span>
      <span style={{fontSize:12.5,color:"var(--ink)"}}>{value}</span>
    </div>
  );
  const SubRow = ({label, value}) => (
    <div style={{display:"flex",justifyContent:"space-between",padding:"1.5px 0 1.5px 12px",fontSize:11.5,color:"var(--muted)"}}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
  const CardHead = ({title}) => (
    <div style={{paddingBottom:7,borderBottom:"1px solid var(--line-soft)"}}>
      <span style={{fontSize:12,color:"var(--ink)"}}>{title}</span>
    </div>
  );
  const SectionHead = ({title, sub}) => (
    <div style={{marginBottom:18}}>
      <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontWeight:400,fontSize:21,letterSpacing:"-.005em",color:"var(--ink)",lineHeight:1.25}}>{title}</div>
      {sub && <div style={{fontSize:11.5,fontWeight:300,color:"var(--muted)",marginTop:8,lineHeight:1.6,maxWidth:620}}>{sub}</div>}
    </div>
  );
  const SubHead = ({title, sub}) => (
    <div style={{margin:"30px 0 12px"}}>
      <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontWeight:400,fontSize:14.5,color:"var(--ink)",lineHeight:1.3}}>{title}</div>
      {sub && <div style={{fontSize:11.5,fontWeight:300,color:"var(--muted)",marginTop:6,lineHeight:1.6,maxWidth:620}}>{sub}</div>}
    </div>
  );
  const CardFoot = ({marge}) => (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginTop:9,paddingTop:9,borderTop:"1px solid var(--line-soft)"}}>
      <span style={{fontSize:9.5,textTransform:"uppercase",letterSpacing:".18em",color:"var(--muted)"}}>Marge</span>
      <span style={{fontSize:19,fontFamily:"'Manrope',sans-serif",color:marge>=0?"#3d4f2f":"#9b4a3e"}}>{marge>=0?"+":""}{chf(Math.round(marge))}</span>
    </div>
  );
  const toggleTbl = (k) => setOpenTbl(o=>{
    const next = {...o, [k]: !o[k]};
    if (next[k]) setTimeout(()=>{
      const el = curMonthRef.current[k];
      if (el && el.scrollIntoView) el.scrollIntoView({behavior:"smooth", block:"center"});
    }, 80);
    return next;
  });
  const tblBtn = (k, label) => (
    <button onClick={()=>toggleTbl(k)} style={{width:"100%",textAlign:"left",background:"transparent",border:"1px solid var(--line-soft)",borderRadius:8,padding:"9px 12px",fontSize:11.5,color:"var(--muted)",cursor:"pointer",fontFamily:"inherit",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span>{label}</span><span style={{fontSize:10}}>{openTbl[k]?"▲":"▼"}</span>
    </button>
  );
  const wgApts = (apts||[]).filter(a=>a.type==="WG" && !a.pipeline);
  const wgAptIds = new Set(wgApts.map(a=>a.id));
  const wgRooms = (rooms||[]).filter(r=>wgAptIds.has(r.aptId));
  const tenantById = (id) => (tenants||[]).find(t=>t.id===id);
  const aptById = (id) => (apts||[]).find(a=>a.id===id);
  const monthFin = (s, e, annahmeVoll=false, kat=null) => {
    let ausgaben=0;
    const activeApts = new Set();
    const aptFactor = new Map();
    wgApts.forEach(a=>{
      if (kat && aptKat(a)!==kat) return;
      const ab=parseDMY(a.mietbeginn), bis=parseDMY(a.mietende);
      if((!ab||ab<=e)&&(!bis||bis>=s)){
        // Teilmonat: Mietbeginn ab dem 15. oder Mietende bis und mit dem 15. -> halber Monat
        const beginInMonth = ab && ab>=s && ab<=e;
        const endInMonth = bis && bis>=s && bis<=e;
        const f = ((beginInMonth && ab.getDate()>=15) || (endInMonth && bis.getDate()<=15)) ? 0.5 : 1;
        aptFactor.set(a.id, f);
        ausgaben+=(+a.miete||0)*f; activeApts.add(a.id);
      }
    });
    let miete=0, strom=0, aufschlag=0, moebl=0, belegt=0, total=0, leerstandskosten=0;
    wgRooms.forEach(r=>{
      if (!activeApts.has(r.aptId)) return;
      const f = aptFactor.get(r.aptId) || 1;
      total++;
      // Wer war in DIESEM Monat in DIESEM Zimmer? Ueber Ein-/Auszug, aktiv ODER archiviert.
      const cand = (tenants||[]).filter(x => {
        const belongs = (x.roomId===r.id) || (r.tenantId && x.id===r.tenantId);
        if (!belongs) return false;
        const ein = parseDMY(x.einzug), aus = parseDMY(x.auszug);
        return (!ein || ein <= e) && (!aus || aus >= s);
      });
      const t = cand.sort((a,b)=>{ const ea=parseDMY(a.einzug)||new Date(0), eb=parseDMY(b.einzug)||new Date(0); return eb-ea; })[0] || null;
      const isOcc = !!t;
      // In Prognosemonaten wird Vollbelegung angenommen.
      if (isOcc || annahmeVoll) {
        belegt++;
        const rent = (t && t.mietzins!=null && t.mietzins!=="") ? (+t.mietzins||0) : (+r.miete||0);
        miete += rent*f; strom += stromVonZimmer(r,t,apts)*f;
        aufschlag += ((isOcc && t)?feeVon(t):0)*f;
        moebl += ((isOcc && t)?moeblVon(t):0)*f;
      } else { leerstandskosten += (+r.miete||0)*f; }
    });
    const einnahmen=miete+strom+aufschlag+moebl;
    return {miete,strom,aufschlag,moebl,einnahmen,ausgaben,marge:einnahmen-ausgaben,belegt,total,frei:total-belegt,leerstandskosten,auslastung: total?belegt/total:0};
  };
  const now = new Date();
  const floorFut = (v, fut) => (fut && v<0) ? 0 : v;
  const months = [];
  for (let i=-5; i<=6; i++){
    const d = new Date(now.getFullYear(), now.getMonth()+i, 1);
    const s = new Date(d.getFullYear(), d.getMonth(), 1);
    const e = new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999);
    const f = monthFin(s, e, i>0);
    months.push({ label: s.toLocaleDateString("de-CH",{month:"short",year:"2-digit"}), full: s.toLocaleDateString("de-CH",{month:"long",year:"numeric"}), ...f, future: i>0, current: i===0 });
  }
  // Jährliche Ergebnisse (Summe über 12 Monate)
  const years = [];
  for (let y=now.getFullYear(); y<=now.getFullYear()+2; y++){
    let einnahmen=0, ausgaben=0, marge=0;
    for (let m=0;m<12;m++){ const s=new Date(y,m,1); const e=new Date(y,m+1,0,23,59,59,999); const futM=new Date(y,m,1)>new Date(now.getFullYear(),now.getMonth(),1); const f=monthFin(s,e,futM); einnahmen+=f.einnahmen; ausgaben+=f.ausgaben; marge+=f.marge; }
    years.push({ y, einnahmen, ausgaben, marge, future: y>now.getFullYear() });
  }
  // Bewohner-Kennzahlen (aktive Mieter)
  const activeTenants = (tenants||[]).filter(t=>(t.status||"aktiv")!=="archiviert");
  const normNat = (s)=>{ const n=(s||"").trim(); if(!n) return "Unbekannt"; const low=n.toLowerCase(); if(low==="suisse") return "Schweiz"; if(low==="somalien") return "Somalia"; if(low==="greece") return "Griechenland"; return n; };
  const natCounts={}; activeTenants.forEach(t=>{ const n=normNat(t.nat); natCounts[n]=(natCounts[n]||0)+1; });
  const natList=Object.entries(natCounts).sort((a,b)=>b[1]-a[1]);
  const maxNat=Math.max(1, ...natList.map(x=>x[1]));
  const genderCounts={}; activeTenants.forEach(t=>{ const g=(t.gender||"").trim()||"Unbekannt"; genderCounts[g]=(genderCounts[g]||0)+1; });
  const genderList=Object.entries(genderCounts).sort((a,b)=>b[1]-a[1]);
  const ages=activeTenants.map(t=>{ const d=parseDMY(t.geburt); if(!d||isNaN(d.getTime())) return null; const a=(now-d)/(365.25*86400000); return (a>0&&a<120)?a:null; }).filter(a=>a!=null);
  const avgAge= ages.length ? Math.round(ages.reduce((sm,a)=>sm+a,0)/ages.length) : null;
  // Airbnb / Serviced Apartments (aus Smoobu)
  const hasAb = (smoobuBookings||[]).length>0;
  const abBookings = (smoobuBookings||[]).filter(x=>!x.cancelled && !x.isBlocked);
  const abApts = (apts||[]).filter(a=>a.type==="Airbnb" && !a.pipeline);
  const nightsOverlap = (arr, dep, s, eNext) => {
    if(!arr||!dep) return 0;
    const a=new Date(arr), d=new Date(dep);
    const from = a>s?a:s; const to = d<eNext?d:eNext;
    const n = Math.round((to-from)/86400000); return n>0?n:0;
  };
  const LAUNDRY_PER_GUEST = 12.5;
  // Reinigung pro Buchung: bis September 2026 CHF 100, ab Oktober 2026 CHF 120 (massgebend ist das Abreisedatum = Reinigungstag)
  const putzVon = (bk) => { const d = bk && bk.departure ? new Date(bk.departure) : null; return (d && d >= new Date(2026,9,1)) ? 120 : 100; };
  const airbnbFin = (s, e, eNext) => {
    let occNights=0, umsatz=0, putzen=0, waesche=0, anz=0, kommission=0;
    abBookings.forEach(bk=>{
      const tot = Math.max(1, bk.nights || Math.round((new Date(bk.departure)-new Date(bk.arrival))/86400000));
      const no = nightsOverlap(bk.arrival, bk.departure, s, eNext);
      if (no>0){
        const frac = no/tot;
        occNights += no;
        umsatz += (bk.price||0)*frac;
        kommission += (bk.commission||0)*frac;
        putzen += putzVon(bk)*frac;
        waesche += LAUNDRY_PER_GUEST*((bk.adults||0)+(bk.children||0))*frac;
        anz += frac;
      }
    });
    // Moebelmiete Myotaku (Feldeggstrasse 36): bis Juli 2026 CHF 900/Mt. (inkl. MWST),
    // ab August 2026 CHF 758.40 + 8.1% MWST = CHF 819.83/Mt. (Verlaengerung bis 31.01.2027, Angebot Carlos 24.07.2026)
    const moeblFeldegg = (monatStart) => (monatStart >= new Date(2026,7,1)) ? Math.round(758.40*1.081*100)/100 : 900;
    let miete=0, moeblierung=0, availNights=0;
    abApts.forEach(a=>{
      const ab=parseDMY(a.mietbeginn), bis=parseDMY(a.mietende);
      if((!ab||ab<=e)&&(!bis||bis>=s)){ miete+=(+a.miete||0); if(/feldegg/i.test(a.adresse||"")) moeblierung += moeblFeldegg(s); }
      // Verfuegbare Naechte: nur solange die Wohnung im Monat tatsaechlich gemietet war
      const von = (ab && ab>s) ? ab : s;
      const bisExkl = bis ? new Date(bis.getFullYear(), bis.getMonth(), bis.getDate()+1) : eNext;
      const zu = bisExkl < eNext ? bisExkl : eNext;
      const n = Math.round((zu - von)/86400000);
      if (n>0) availNights += n;
    });
    return { occNights, availNights, umsatz, anz, kommission, miete, moeblierung, putzen, waesche, marge: umsatz-kommission-miete-putzen-waesche-moeblierung,
      auslastung: availNights ? occNights/availNights : 0, adr: occNights? umsatz/occNights:0 };
  };
  const abMonths = [];
  { let cy=2025, cm=10; const endD=new Date(now.getFullYear(), now.getMonth()+6, 1);
    while (new Date(cy,cm,1) <= endD){
      const s=new Date(cy,cm,1); const e=new Date(cy,cm+1,0,23,59,59,999); const eNext=new Date(cy,cm+1,1);
      const f=airbnbFin(s,e,eNext);
      const fut = new Date(cy,cm,1) > new Date(now.getFullYear(),now.getMonth(),1);
      abMonths.push({ label:s.toLocaleDateString("de-CH",{month:"short",year:"2-digit"}), full:s.toLocaleDateString("de-CH",{month:"long",year:"numeric"}), ...f, marge: floorFut(f.marge, fut),
        future: fut, current: cy===now.getFullYear()&&cm===now.getMonth() });
      cm++; if(cm>11){cm=0;cy++;}
    }
  }
  const abCur = abMonths.find(m=>m.current)||abMonths[0];
  // Gesamt (WG + Airbnb), seit Dezember 2025
  const combinedMonths = [];
  { let cy=2025, cm=10; const endD=new Date(now.getFullYear(), now.getMonth()+6, 1);
    while (new Date(cy,cm,1) <= endD){
      const s=new Date(cy,cm,1); const e=new Date(cy,cm+1,0,23,59,59,999); const eNext=new Date(cy,cm+1,1);
      const fut = new Date(cy,cm,1) > new Date(now.getFullYear(),now.getMonth(),1);
      const wgF=monthFin(s,e,fut); const abF=airbnbFin(s,e,eNext);
      const wgZF=monthFin(s,e,fut,"WG"); const wgWF=monthFin(s,e,fut,"Wohnung");
      const wg=floorFut(wgF.marge, fut); const ab=floorFut(abF.marge, fut);
      const pkF=parkFin(parkplaetze,s,e);
      const umsatz=wgF.einnahmen+abF.umsatz+pkF.einnahmen; const mietausgaben=wgF.ausgaben+abF.miete;
      const uebrige=abF.kommission+abF.putzen+abF.waesche+abF.moeblierung;
      combinedMonths.push({ label:s.toLocaleDateString("de-CH",{month:"short",year:"2-digit"}), full:s.toLocaleDateString("de-CH",{month:"long",year:"numeric"}), y:cy, wg, ab, pkU:pkF.einnahmen, pkK:pkF.kosten, marge:wg+ab+pkF.marge, umsatz, umsatzWg:wgF.einnahmen, umsatzWgZ:wgZF.einnahmen, umsatzWohn:wgWF.einnahmen, umsatzAb:abF.umsatz, mietausgaben, uebrige,
        future: fut, current: cy===now.getFullYear()&&cm===now.getMonth() });
      cm++; if(cm>11){cm=0;cy++;}
    }
  }
  const combinedYears = [];
  for (let y=2025; y<=now.getFullYear()+2; y++){
    let pkUY=0, pkKY=0, wgY=0, abY=0, umsatzY=0, umsatzWgY=0, umsatzWgZY=0, umsatzWohnY=0, umsatzAbY=0, mietausgabenY=0, uebrigeY=0;
    for (let mo=0; mo<12; mo++){
      const s=new Date(y,mo,1), e=new Date(y,mo+1,0,23,59,59,999), eNext=new Date(y,mo+1,1);
      const fut = new Date(y,mo,1) > new Date(now.getFullYear(),now.getMonth(),1);
      const wgF=monthFin(s,e,fut); const abF=airbnbFin(s,e,eNext);
      wgY += floorFut(wgF.marge, fut); abY += floorFut(abF.marge, fut);
      umsatzY += wgF.einnahmen + abF.umsatz; umsatzWgY += wgF.einnahmen; umsatzAbY += abF.umsatz;
      umsatzWgZY += monthFin(s,e,fut,"WG").einnahmen; umsatzWohnY += monthFin(s,e,fut,"Wohnung").einnahmen;
      mietausgabenY += wgF.ausgaben + abF.miete;
      const pkF=parkFin(parkplaetze,s,e); pkUY+=pkF.einnahmen; pkKY+=pkF.kosten; umsatzY+=pkF.einnahmen;
      uebrigeY += abF.kommission + abF.putzen + abF.waesche + abF.moeblierung;
    }
    combinedYears.push({ y, wg:wgY, ab:abY, pkU:pkUY, pkK:pkKY, marge:wgY+abY+pkUY-pkKY, umsatz:umsatzY, umsatzWg:umsatzWgY, umsatzWgZ:umsatzWgZY, umsatzWohn:umsatzWohnY, umsatzAb:umsatzAbY, mietausgaben:mietausgabenY, uebrige:uebrigeY });
  }
  const cur = months.find(m=>m.current) || months[0];
  const maxAbs = Math.max(1, ...months.map(m=>Math.abs(m.marge)));
  const H = 86;
  const kfmt = (v)=>{ const a=Math.abs(v); const sg=v<0?"-":""; if(a>=10000) return sg+Math.round(a/1000)+"k"; if(a>=1000) return sg+(a/1000).toFixed(1)+"k"; return Math.round(v).toString(); };
  return (
    <div>
      <div style={{fontSize:22,fontWeight:300,letterSpacing:"-.01em",marginBottom:18}}>Finanzen</div>
      <div style={{border:"1px solid var(--line)",borderRadius:12,padding:"20px 18px",marginBottom:20,background:"var(--surface)",boxShadow:"0 1px 3px rgba(160,136,100,.10)"}}>
      <SectionHead title="Gesamt" sub="WGs, Wohnungen und Airbnb zusammen, pro Monat seit November 2025. Noch nicht gebuchte Zukunftsmonate werden auf null gesetzt statt negativ, damit die Prognose nicht verzerrt." />
      <div style={{fontSize:10.5,color:"var(--muted)",marginBottom:8,fontWeight:600}}>Umsatz pro Monat</div>
      <div ref={zentriereAktuellen} style={{display:"flex",alignItems:"flex-end",gap:4,height:H+52,boxSizing:"border-box",paddingTop:6,marginBottom:14,overflowX:"auto",paddingBottom:2}}>
        {(()=>{ const mx=Math.max(1,...combinedMonths.map(m=>m.umsatz)); return combinedMonths.map((m,i)=>{
          const h=Math.max(2,Math.round(m.umsatz/mx*H));
          return (
            <div key={i} data-current={m.current?"1":undefined} title={`${m.full}: Umsatz ${chf(Math.round(m.umsatz))} (WGs ${chf(Math.round(m.umsatzWgZ))} · Wohnungen ${chf(Math.round(m.umsatzWohn))} · Airbnb ${chf(Math.round(m.umsatzAb))})`} style={{flex:"1 0 32px",minWidth:32,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end"}}>
              <div style={{fontSize:8,color:m.current?"var(--ink)":"var(--muted)",fontWeight:m.current?700:400,marginBottom:2,whiteSpace:"nowrap"}}>{kfmt(m.umsatz)}</div>
              <div style={{width:"70%",height:h,background:m.future?"#cbb896":"#8a6d4a",borderRadius:"3px 3px 0 0"}}/>
              <div style={{fontSize:8,color:m.current?"var(--ink)":"var(--muted)",fontWeight:m.current?700:400,marginTop:4,whiteSpace:"nowrap"}}>{m.label}</div>
            </div>
          );
        }); })()}
      </div>
      <div style={{fontSize:10.5,color:"var(--muted)",marginBottom:8,fontWeight:600}}>Marge pro Monat</div>
      <div ref={zentriereAktuellen} style={{display:"flex",alignItems:"flex-end",gap:4,height:H+52,boxSizing:"border-box",paddingTop:6,marginBottom:14,overflowX:"auto",paddingBottom:2}}>
        {(()=>{ const mx=Math.max(1,...combinedMonths.map(m=>Math.abs(m.marge))); return combinedMonths.map((m,i)=>{
          const h=Math.max(2,Math.round(Math.abs(m.marge)/mx*H)); const neg=m.marge<0;
          return (
            <div key={i} data-current={m.current?"1":undefined} title={`${m.full}: Gesamt ${m.marge>=0?"+":""}${chf(Math.round(m.marge))} (WGs + Wohnungen ${chf(Math.round(m.wg))} · Airbnb ${chf(Math.round(m.ab))})`} style={{flex:"1 0 32px",minWidth:32,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end"}}>
              <div style={{fontSize:8,color:m.current?"var(--ink)":"var(--muted)",fontWeight:m.current?700:400,marginBottom:2,whiteSpace:"nowrap"}}>{kfmt(m.marge)}</div>
              <div style={{width:"70%",height:h,background:neg?(m.future?"#e0bcb0":"#9b4a3e"):(m.future?"#a9c088":"#4a6b2f"),borderRadius:"3px 3px 0 0"}}/>
              <div style={{fontSize:8,color:m.current?"var(--ink)":"var(--muted)",fontWeight:m.current?700:400,marginTop:4,whiteSpace:"nowrap"}}>{m.label}</div>
            </div>
          );
        }); })()}
      </div>
      {tblBtn("ges","Monatsdetails Gesamt")}
      {openTbl.ges && (
      <div style={{display:"grid",gap:8,marginTop:10}}>
        {combinedMonths.map((m,i)=>(
          <div key={i} ref={m.current?(el=>{curMonthRef.current.ges=el;}):null} style={{border:m.current?"1px solid var(--line)":"1px solid var(--line-soft)",borderRadius:9,padding:"11px 13px",background:m.current?"var(--beige-soft)":"transparent"}}>
            <CardHead title={`${m.full}${m.current?" · aktuell":m.future?" · Prognose":""}`} />
            <GrpRow label="Umsatz" value={chf(Math.round(m.umsatz))} />
            <SubRow label="WGs" value={chf(Math.round(m.umsatzWgZ))} />
            <SubRow label="Wohnungen" value={chf(Math.round(m.umsatzWohn))} />
            <SubRow label="Airbnb" value={chf(Math.round(m.umsatzAb))} />
            {(m.pkU||m.pkK)>0 && <SubRow label="Parkplätze" value={chf(Math.round(m.pkU))} />}
            <GrpRow label="Kosten" value={chf(Math.round(m.mietausgaben+m.uebrige+(m.pkK||0)))} />
            <SubRow label="Mietausgaben" value={chf(Math.round(m.mietausgaben))} />
            {(m.pkU||m.pkK)>0 && <SubRow label="Parkplätze" value={chf(Math.round(m.pkK))} />}
            <SubRow label="Übrige Kosten" value={chf(Math.round(m.uebrige))} />
            <CardFoot marge={m.marge} />
          </div>
        ))}
      </div>
      )}

      <SubHead title="Jährlich · alle Wohnungen" sub="Gesamtmarge pro Kalenderjahr. 2025 ab November." />
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(min(200px, 100%), 1fr))",gap:10}}>
        {combinedYears.map(yr=>(
          <div key={yr.y} style={{background:"var(--surface)",border:"1px solid var(--line-soft)",borderRadius:10,padding:"14px 16px"}}>
            <CardHead title={String(yr.y)} />
            <GrpRow label="Umsatz" value={chf(Math.round(yr.umsatz))} />
            <SubRow label="WGs" value={chf(Math.round(yr.umsatzWgZ))} />
            <SubRow label="Wohnungen" value={chf(Math.round(yr.umsatzWohn))} />
            <SubRow label="Airbnb" value={chf(Math.round(yr.umsatzAb))} />
            {(yr.pkU||yr.pkK)>0 && <SubRow label="Parkplätze" value={chf(Math.round(yr.pkU))} />}
            <GrpRow label="Kosten" value={chf(Math.round(yr.mietausgaben+yr.uebrige+(yr.pkK||0)))} />
            <SubRow label="Mietausgaben" value={chf(Math.round(yr.mietausgaben))} />
            {(yr.pkU||yr.pkK)>0 && <SubRow label="Parkplätze" value={chf(Math.round(yr.pkK))} />}
            <SubRow label="Übrige Kosten" value={chf(Math.round(yr.uebrige))} />
            <CardFoot marge={yr.marge} />
          </div>
        ))}
      </div>

      </div>
      <div style={{border:"1px solid var(--line)",borderRadius:12,padding:"20px 18px",marginBottom:20,background:"var(--surface)",boxShadow:"0 1px 3px rgba(160,136,100,.10)"}}>
      <SectionHead title="WGs und Wohnungen" sub="Ohne Airbnb. Einnahmen aus Zimmermiete, Strom und Kautions-Servicegebühr, minus Hauptmieten. Künftige Monate sind eine Prognose auf Basis der heutigen Belegung und der Vertragsenden." />
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(min(150px, 100%), 1fr))",gap:10,marginBottom:22}}>
        {[["Einnahmen / Mt.",cur.einnahmen,"#3d4f2f","var(--green-soft)",false],["Miete bezahlt / Mt.",cur.ausgaben,"#8a6d4a","#efe6d8",false],["Marge / Mt.",cur.marge,cur.marge>=0?"#3d4f2f":"#9b4a3e",cur.marge>=0?"var(--green-soft)":"#f7e4e0",true]].map(([l,v,fg,bg,plus])=>(
          <div key={l} style={{background:bg,borderRadius:10,padding:"14px 16px"}}>
            <div style={{fontSize:9,textTransform:"uppercase",letterSpacing:".2em",color:fg,fontWeight:600,marginBottom:8,opacity:.85}}>{l}</div>
            <div style={{fontSize:21,fontWeight:400,color:fg,fontFamily:"'Manrope',sans-serif",lineHeight:1}}>{plus&&v>=0?"+":""}{chf(v)}</div>
          </div>
        ))}
      </div>
      <div style={{fontSize:10.5,color:"var(--muted)",marginBottom:8,fontWeight:600}}>Marge pro Monat</div>
      <div ref={zentriereAktuellen} style={{display:"flex",alignItems:"flex-end",gap:4,height:H+52,boxSizing:"border-box",paddingTop:6,marginBottom:22,overflowX:"auto",paddingBottom:2}}>
        {months.map((m,i)=>{
          const h = Math.max(2, Math.round(Math.abs(m.marge)/maxAbs*H));
          const neg = m.marge<0;
          return (
            <div key={i} data-current={m.current?"1":undefined} title={`${m.full}: Marge ${m.marge>=0?"+":""}${chf(m.marge)} · Einnahmen ${chf(m.einnahmen)} (Strom ${chf(m.strom)}, Servicegebühr ${chf(m.aufschlag)}) · Hauptmiete ${chf(m.ausgaben)}`} style={{flex:"1 0 30px",minWidth:30,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end"}}>
              <div style={{fontSize:8,color:m.current?"var(--ink)":"var(--muted)",fontWeight:m.current?700:400,marginBottom:2,whiteSpace:"nowrap"}}>{kfmt(m.marge)}</div>
              <div style={{width:"68%",height:h,background:neg?(m.future?"#e0bcb0":"#9b4a3e"):(m.future?"#c5cda8":"#5a6e4a"),borderRadius:"3px 3px 0 0"}}/>
              <div style={{fontSize:8.5,color:m.current?"var(--ink)":"var(--muted)",fontWeight:m.current?700:400,marginTop:4,whiteSpace:"nowrap"}}>{m.label}</div>
            </div>
          );
        })}
      </div>
      {tblBtn("wg","Monatsdetails WG")}
      {openTbl.wg && (
      <div style={{display:"grid",gap:8,marginTop:10}}>
        {months.map((m,i)=>(
          <div key={i} ref={m.current?(el=>{curMonthRef.current.wg=el;}):null} style={{border:m.current?"1px solid var(--line)":"1px solid var(--line-soft)",borderRadius:9,padding:"11px 13px",background:m.current?"var(--beige-soft)":"transparent"}}>
            <CardHead title={`${m.full}${m.current?" · aktuell":m.future?" · Prognose":""}`} />
            <GrpRow label="Einnahmen" value={chf(m.einnahmen)} />
            <SubRow label="Zimmermieten" value={chf(m.miete)} />
            <SubRow label="Strom" value={chf(m.strom)} />
            <SubRow label="Kautions-Servicegebühr" value={chf(m.aufschlag)} />
            <GrpRow label="Hauptmiete" value={chf(m.ausgaben)} />
            <CardFoot marge={m.marge} />
          </div>
        ))}
      </div>
      )}

      <SubHead title="Jährliche Ergebnisse WGs" />
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(min(200px, 100%), 1fr))",gap:10}}>
        {years.map(yr=>(
          <div key={yr.y} style={{background:"var(--surface)",border:"1px solid var(--line-soft)",borderRadius:10,padding:"16px 18px"}}>
            <div style={{fontSize:13,fontWeight:700,color:"var(--ink)",marginBottom:10}}>{yr.y}{yr.future?" · Prognose":""}</div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12.5,padding:"3px 0",color:"var(--muted)"}}><span>Einnahmen</span><span style={{color:"var(--ink)"}}>{chf(yr.einnahmen)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12.5,padding:"3px 0",color:"var(--muted)"}}><span>Miete bezahlt</span><span style={{color:"var(--ink)"}}>{chf(yr.ausgaben)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13.5,padding:"7px 0 0",marginTop:5,borderTop:"1px solid var(--line-soft)",fontWeight:600}}><span>Marge</span><span style={{color:yr.marge>=0?"#3d4f2f":"#9b4a3e"}}>{yr.marge>=0?"+":""}{chf(yr.marge)}</span></div>
          </div>
        ))}
      </div>

      </div>
      {hasAb && (
        <>
          <div style={{border:"1px solid var(--line)",borderRadius:12,padding:"20px 18px",marginBottom:20,background:"var(--surface)",boxShadow:"0 1px 3px rgba(160,136,100,.10)"}}>
          <SectionHead title="Airbnb" sub="Serviced Apartments, aus Elev8, alle Kanäle. Marge = Umsatz minus Plattform-Kommission (bei Direktbuchungen keine; für neue Buchungen geschätzt: Airbnb 16.76%, Booking.com 15%), Hauptmiete, Möbelmiete Myotaku Feldeggstrasse (bis Juli 2026 CHF 900, ab August CHF 819.83 pro Monat inkl. MWST), Reinigung (CHF 100 pro Buchung, ab Oktober 2026 CHF 120) und Mietwäsche (CHF 12.50 pro Gast). Umsatz und Kosten sind anteilig auf die Übernachtungen im jeweiligen Monat verteilt." />
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(min(150px, 100%), 1fr))",gap:10,marginBottom:20}}>
            <div style={{background:"var(--surface)",border:"1px solid var(--line-soft)",borderRadius:10,padding:"14px 16px"}}>
              <div style={{fontSize:9,textTransform:"uppercase",letterSpacing:".2em",color:"var(--muted)",fontWeight:600,marginBottom:8}}>Auslastung / Mt.</div>
              <div style={{fontSize:21,fontWeight:400,fontFamily:"'Manrope',sans-serif",color:"var(--ink)",lineHeight:1}}>{Math.round(abCur.auslastung*100)}%</div>
            </div>
            <div style={{background:"var(--surface)",border:"1px solid var(--line-soft)",borderRadius:10,padding:"14px 16px"}}>
              <div style={{fontSize:9,textTransform:"uppercase",letterSpacing:".2em",color:"#3d4f2f",fontWeight:600,marginBottom:8}}>Umsatz / Mt.</div>
              <div style={{fontSize:21,fontWeight:400,fontFamily:"'Manrope',sans-serif",color:"var(--ink)",lineHeight:1}}>{chf(Math.round(abCur.umsatz))}</div>
            </div>
            <div style={{background:abCur.marge>=0?"var(--green-soft)":"#f7e4e0",borderRadius:10,padding:"14px 16px"}}>
              <div style={{fontSize:9,textTransform:"uppercase",letterSpacing:".2em",color:abCur.marge>=0?"#3d4f2f":"#9b4a3e",fontWeight:600,marginBottom:8}}>Marge / Mt.</div>
              <div style={{fontSize:21,fontWeight:400,fontFamily:"'Manrope',sans-serif",color:abCur.marge>=0?"#3d4f2f":"#9b4a3e",lineHeight:1}}>{abCur.marge>=0?"+":""}{chf(Math.round(abCur.marge))}</div>
            </div>
          </div>
          <AirbnbKalender bookings={smoobuBookings} />
          <div style={{fontSize:10.5,color:"var(--muted)",marginBottom:8,fontWeight:600}}>Auslastung pro Monat</div>
          <div ref={zentriereAktuellen} style={{display:"flex",alignItems:"flex-end",gap:4,height:H+52,boxSizing:"border-box",paddingTop:6,marginBottom:22,overflowX:"auto",paddingBottom:2}}>
            {abMonths.map((m,i)=>{
              const pct=Math.round(m.auslastung*100);
              const h=Math.max(2, Math.round(m.auslastung*H));
              return (
                <div key={i} data-current={m.current?"1":undefined} title={`${m.full}: ${pct}% · Umsatz ${chf(Math.round(m.umsatz))} · ${m.nights} Nächte · ADR ${chf(Math.round(m.adr))}`} style={{flex:"1 0 30px",minWidth:30,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end"}}>
                  <div style={{fontSize:8,color:m.current?"var(--ink)":"var(--muted)",fontWeight:m.current?700:400,marginBottom:2}}>{pct}</div>
                  <div style={{width:"68%",height:h,background:m.future?"#e2c9a8":"#c08a3e",borderRadius:"3px 3px 0 0"}}/>
                  <div style={{fontSize:8.5,color:m.current?"var(--ink)":"var(--muted)",fontWeight:m.current?700:400,marginTop:4,whiteSpace:"nowrap"}}>{m.label}</div>
                </div>
              );
            })}
          </div>
          <div style={{fontSize:10.5,color:"var(--muted)",marginBottom:8,fontWeight:600}}>Umsatz pro Monat</div>
          <div ref={zentriereAktuellen} style={{display:"flex",alignItems:"flex-end",gap:4,height:H+52,boxSizing:"border-box",paddingTop:6,marginBottom:22,overflowX:"auto",paddingBottom:2}}>
            {(()=>{ const mx=Math.max(1,...abMonths.map(m=>m.umsatz)); return abMonths.map((m,i)=>{
              const h=Math.max(2,Math.round(m.umsatz/mx*H));
              return (
                <div key={i} data-current={m.current?"1":undefined} title={`${m.full}: ${chf(Math.round(m.umsatz))} · ${Math.round(m.anz)} Buchungen · ADR ${chf(Math.round(m.adr))}`} style={{flex:"1 0 30px",minWidth:30,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end"}}>
                  <div style={{fontSize:8,color:m.current?"var(--ink)":"var(--muted)",fontWeight:m.current?700:400,marginBottom:2,whiteSpace:"nowrap"}}>{kfmt(m.umsatz)}</div>
                  <div style={{width:"68%",height:h,background:m.future?"#bcd0c0":"#5a8a6a",borderRadius:"3px 3px 0 0"}}/>
                  <div style={{fontSize:8.5,color:m.current?"var(--ink)":"var(--muted)",fontWeight:m.current?700:400,marginTop:4,whiteSpace:"nowrap"}}>{m.label}</div>
                </div>
              );
            }); })()}
          </div>
          <div style={{fontSize:10.5,color:"var(--muted)",marginBottom:8,fontWeight:600}}>Marge pro Monat</div>
          <div ref={zentriereAktuellen} style={{display:"flex",alignItems:"flex-end",gap:4,height:H+52,boxSizing:"border-box",paddingTop:6,marginBottom:22,overflowX:"auto",paddingBottom:2}}>
            {(()=>{ const mx=Math.max(1,...abMonths.map(m=>Math.abs(m.marge))); return abMonths.map((m,i)=>{
              const h=Math.max(2,Math.round(Math.abs(m.marge)/mx*H)); const neg=m.marge<0;
              return (
                <div key={i} data-current={m.current?"1":undefined} title={`${m.full}: Marge ${m.marge>=0?"+":""}${chf(Math.round(m.marge))} · Umsatz ${chf(Math.round(m.umsatz))} · Kommission ${chf(Math.round(m.kommission))} · Miete ${chf(Math.round(m.miete))} · Möbl. ${chf(Math.round(m.moeblierung))} · Putzen ${chf(Math.round(m.putzen))} · Wäsche ${chf(Math.round(m.waesche))}`} style={{flex:"1 0 30px",minWidth:30,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end"}}>
                  <div style={{fontSize:8,color:m.current?"var(--ink)":"var(--muted)",fontWeight:m.current?700:400,marginBottom:2,whiteSpace:"nowrap"}}>{kfmt(m.marge)}</div>
                  <div style={{width:"68%",height:h,background:neg?(m.future?"#e0bcb0":"#9b4a3e"):(m.future?"#c5cda8":"#5a6e4a"),borderRadius:"3px 3px 0 0"}}/>
                  <div style={{fontSize:8.5,color:m.current?"var(--ink)":"var(--muted)",fontWeight:m.current?700:400,marginTop:4,whiteSpace:"nowrap"}}>{m.label}</div>
                </div>
              );
            }); })()}
          </div>
          </div>
        </>
      )}

      <div style={{border:"1px solid var(--line)",borderRadius:12,padding:"20px 18px",marginBottom:20,background:"var(--surface)",boxShadow:"0 1px 3px rgba(160,136,100,.10)"}}>
      <SectionHead title="Bewohner" sub="Aktuelle Mieterinnen und Mieter der WGs." />
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(min(150px, 100%), 1fr))",gap:10,marginBottom:18}}>
        <div style={{background:"var(--surface)",border:"1px solid var(--line-soft)",borderRadius:10,padding:"14px 16px"}}>
          <div style={{fontSize:9,textTransform:"uppercase",letterSpacing:".2em",color:"var(--muted)",fontWeight:600,marginBottom:8}}>Anzahl Bewohner</div>
          <div style={{fontSize:24,fontWeight:400,fontFamily:"'Manrope',sans-serif",color:"var(--ink)"}}>{activeTenants.length}</div>
        </div>
        <div style={{background:"var(--surface)",border:"1px solid var(--line-soft)",borderRadius:10,padding:"14px 16px"}}>
          <div style={{fontSize:9,textTransform:"uppercase",letterSpacing:".2em",color:"var(--muted)",fontWeight:600,marginBottom:8}}>Ø Alter</div>
          <div style={{fontSize:24,fontWeight:400,fontFamily:"'Manrope',sans-serif",color:"var(--ink)"}}>{avgAge!=null?`${avgAge} J.`:"-"}</div>
        </div>
        <div style={{background:"var(--surface)",border:"1px solid var(--line-soft)",borderRadius:10,padding:"14px 16px"}}>
          <div style={{fontSize:9,textTransform:"uppercase",letterSpacing:".2em",color:"var(--muted)",fontWeight:600,marginBottom:8}}>Geschlecht</div>
          <div style={{fontSize:12.5,color:"var(--ink)",lineHeight:1.5}}>{genderList.map(([g,n])=>`${g}: ${n}`).join(" · ")||"-"}</div>
        </div>
      </div>
      <div style={{fontSize:10.5,color:"var(--muted)",marginBottom:8,fontWeight:600}}>Herkunft</div>
      <div style={{display:"grid",gap:5}}>
        {natList.map(([n,c])=>(
          <div key={n} style={{display:"flex",alignItems:"center",gap:10,fontSize:12}}>
            <span style={{minWidth:110,color:"var(--ink)"}}>{n}</span>
            <div style={{flex:1,height:14,background:"var(--line-soft)",borderRadius:7,overflow:"hidden"}}><div style={{width:`${Math.round(c/maxNat*100)}%`,height:"100%",background:"#8a9a6a",borderRadius:7}}/></div>
            <span style={{minWidth:22,textAlign:"right",color:"var(--muted)"}}>{c}</span>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

