function MainApp({rolle}) {
  const sichtbareSeiten = seitenFuerRolle(rolle);
  const [navOffen, setNavOffen] = useState(() => { try { return JSON.parse(localStorage.getItem("immobase_nav_offen")||"{}")||{}; } catch(_) { return {}; } });
  const [page, setPage] = useState(() => { try { const s = localStorage.getItem("immobase_page"); if (s && sichtbareSeiten.some(x=>x.id===s)) return s; } catch(e){} return sichtbareSeiten[0]?.id || "dashboard"; });
  const [navTarget, setNavTarget] = useState(null);
  useEffect(() => { try { localStorage.setItem("immobase_page", page); } catch(e){} }, [page]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const [pkOpen, setPkOpen] = useState(false);
  const [benutzerMail, setBenutzerMail] = useState("");
  const acctRef = useRef(null);
  const data = useSupabaseData();
  const [portfolioWatchOffen, setPortfolioWatchOffen] = useState(0);
  const [marktRadarOffen, setMarktRadarOffen] = useState(0);
  const [pipelineOffen, setPipelineOffen] = useState(0);
  const refreshPortfolioWatch = () => {
    supabase.from("flatfox_treffer").select("id",{count:"exact",head:true}).eq("gesehen",false)
      .then(({count})=>setPortfolioWatchOffen(count||0)).catch(()=>{});
    supabase.from("markt_radar").select("id",{count:"exact",head:true}).eq("gesehen",false)
      .then(({count})=>setMarktRadarOffen(count||0)).catch(()=>{});
    supabase.from("pipeline").select("id",{count:"exact",head:true}).eq("stage","antwort")
      .then(({count})=>setPipelineOffen(count||0)).catch(()=>{});
  };
  useEffect(() => {
    refreshPortfolioWatch();
    const ch = supabase.channel("ff_treffer_badge")
      .on("postgres_changes",{event:"*",schema:"public",table:"flatfox_treffer"},refreshPortfolioWatch)
      .on("postgres_changes",{event:"*",schema:"public",table:"markt_radar"},refreshPortfolioWatch)
      .on("postgres_changes",{event:"*",schema:"public",table:"pipeline"},refreshPortfolioWatch)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({data}) => setBenutzerMail(data?.user?.email || ""));
  }, []);

  // Menue schliessen, wenn daneben geklickt oder Escape gedrueckt wird
  useEffect(() => {
    if (!acctOpen) return;
    const beiKlick = (e) => { if (acctRef.current && !acctRef.current.contains(e.target)) setAcctOpen(false); };
    const beiTaste = (e) => { if (e.key === "Escape") setAcctOpen(false); };
    document.addEventListener("mousedown", beiKlick);
    document.addEventListener("keydown", beiTaste);
    return () => { document.removeEventListener("mousedown", beiKlick); document.removeEventListener("keydown", beiTaste); };
  }, [acctOpen]);

  // Bei jedem Seitenwechsel wieder nach ganz oben, sonst startet die neue Seite mitten drin
  useEffect(() => {
    const el = document.querySelector(".main");
    if (el && el.scrollTo) el.scrollTo({top:0, left:0, behavior:"auto"});
    else if (el) el.scrollTop = 0;
    if (window.scrollTo) window.scrollTo(0,0);
  }, [page]);

  if (data.loading) return <div className="loading"><div className="ib-splash-logo">ImmoBase</div><div className="ib-splash-sub">D&amp;T Homes</div><div className="ib-splash-bar"><span></span></div></div>;

  const seiteErlaubt = sichtbareSeiten.some(p => p.id === page);
  const Page = seiteErlaubt
    ? {dashboard:Dashboard,bewerber:Bewerber,nachvermietung:Nachvermietung,portfoliowatch:PortfolioWatch,marktradar:MarktRadar,bauradar:Bauradar,pipeline:Pipeline,kontakte:Kontakte,werbung:WerbungTab,dokumente:DokumenteSection,wohnungen:Wohnungen,zimmer:Zimmer,parkplaetze:ParkplaetzePage,reinigung:ReinigungPage,mieter:Mieter,uebergaben:Uebergaben,zahlungen:Zahlungen,partner:PartnerPage,todos:TodoPage,finanzen:FinanzenSection,auslagen:AuslagenPage,passwoerter:PasswoerterPage,zeit:(rolle==="admin"?Zeiterfassung:MitarbeiterZeit)}[page]
    : KeinZugriff;
  const freeCount=data.rooms.filter(r=>!r.occupied).length;
  const nachvermietungOffen=(()=>{
    const pdN=(s)=>{ if(!s) return null; const t=String(s).trim(); if(/^\d{4}-\d{2}-\d{2}/.test(t)){const d=new Date(t);return isNaN(d.getTime())?null:d;} const m=t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); if(m){const d=new Date(+m[3],+m[2]-1,+m[1]);return isNaN(d.getTime())?null:d;} const d=new Date(t);return isNaN(d.getTime())?null:d; };
    let cnt=0;
    (data.apts||[]).filter(a=>a.type==="WG" && !a.pipeline).forEach(a=>{
      const ende=pdN(a.mietende);
      (data.rooms||[]).filter(r=>r.aptId===a.id && r.occupied).forEach(r=>{
        const t=r.tenantId?(data.tenants||[]).find(x=>x.id===r.tenantId):null;
        const aus=pdN(t&&t.auszug)||(t?ende:null);
        if(!aus||!ende||aus>=ende) return; // bleibt oder unbekannt
        const hatMieter=(data.tenants||[]).some(x=>x.id!==r.tenantId && x.roomId===r.id && (x.status||"aktiv")!=="archiviert");
        const hatBewerber=(data.bewerber||[]).some(b=>b.zugeteiltes_zimmer===r.id && b.status==="Zugeteilt");
        if(!hatMieter && !hatBewerber) cnt++;
      });
    });
    return cnt;
  })();
  const neueBewerber=data.bewerber.filter(b=>b.status==="Neu").length;
  // Offene Zahlungen für aktuellen + vorherigen Zahlungs-Monat zählen (ab 25. = nächster Monat)
  const now2 = new Date();
  let aktJ = now2.getFullYear();
  let aktM = now2.getMonth() + 1;
  if (now2.getDate() >= 25) {
    aktM += 1;
    if (aktM > 12) { aktM = 1; aktJ += 1; }
  }
  let vorJ = aktJ, vorM = aktM - 1;
  if (vorM < 1) { vorM = 12; vorJ -= 1; }
  const parseDate2 = (s) => {
    if (!s) return null;
    const str = String(s).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return new Date(str);
    const m = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) return new Date(+m[3], +m[2]-1, +m[1]);
    const d = new Date(str);
    return isNaN(d) ? null : d;
  };
  // Mieter die im gegebenen Zahlungs-Monat (j/m) aktiv waren, also Miete schulden
  const relevantTenantsForMonth = (j, m) => {
    const monatsStart = new Date(j, m-1, 1);
    const monatsEnde = new Date(j, m, 0, 23, 59, 59);
    return data.tenants.filter(t => {
      const einzug = parseDate2(t.einzug);
      const auszug = parseDate2(t.auszug);
      // Abgesagte Miete: Auszug am oder vor dem Einzug, also nie eingezogen.
      // Nur ausblenden, wenn dazu keine Zahlung erfasst ist (gleiche Regel wie in der Zahlungsseite).
      if (einzug && auszug && auszug <= einzug && !(data.payments||[]).some(pay => pay.tenantId === t.id)) return false;
      if (!einzug) return (t.status||"aktiv") === "aktiv";
      if (einzug > monatsEnde) return false;
      if (auszug && auszug < monatsStart) return false;
      return true;
    });
  };
  // Zaehlt offene Zahlungen (kein Payment-Datensatz oder Status "offen") fuer einen Zahlungs-Monat
  const countOffeneZahlungen = (j, m) => relevantTenantsForMonth(j, m).filter(t => {
    const p = data.payments.find(pay => pay.tenantId === t.id && pay.jahr === j && pay.monat === m);
    return !p || p.status === "offen";
  }).length;
  const offeneUebergaben = data.tenants.filter(t => {
    if ((t.status||"aktiv") !== "aktiv") return false;
    const room = data.rooms.find(r => r.tenantId === t.id) || (t.roomId ? data.rooms.find(r => r.id === t.roomId) : null);
    if (!room) return false;
    const meine = (data.handoverProtocols||[]).filter(h => h.tenantId === t.id)
      .sort((a,b) => new Date(b.startedAt) - new Date(a.startedAt));
    const latest = meine[0];
    if (latest && ["accepted","auto_accepted"].includes(latest.status)) return false;
    if ((t.uebergabeStatus||"offen") === "erledigt") return false;
    const hatAltesProtokoll = (data.documents||[]).some(d => d.entity_type==="tenant" && d.entity_id===t.id && (d.category||"").toLowerCase().includes("übergabeprotokoll"));
    if (hatAltesProtokoll) return false;
    return true;
  }).length;

  const offeneAuszuege = data.tenants.filter(t => {
    if (t.status !== "archiviert") return false;
    if (!(t.auszug && t.auszug.trim())) return false;
    if (t.kautionAbrechnung && (t.kautionAbrechnung.gesendet_am || t.kautionAbrechnung.erledigt_am)) return false;
    const d = parseDate2(t.auszug); if(!d) return false;
    const diff = (new Date() - d)/(1000*60*60*24); return diff >= 0 && diff <= 180;
  }).length;

  const offeneZahlungen = countOffeneZahlungen(aktJ, aktM) + countOffeneZahlungen(vorJ, vorM);

  function navigateTo(targetPage, targetId) {
    if (!sichtbareSeiten.some(p => p.id === targetPage)) return;
    setPage(targetPage);
    setNavTarget({id: targetId, type: targetPage});
    setSidebarOpen(false); // close sidebar after navigation on mobile
  }
  // Fuer Komponenten ohne navigateTo-Prop (z.B. Gegenzeichnen-Knopf): direkt weiter zur Zimmerzuteilung
  window.__ibNavigate = navigateTo;

  async function logout() {
    try { await supabase.auth.signOut(); } catch (e) { console.warn("signOut:", e); }
    window.location.reload();
  }

  return (
    <div className="app">
      <button className="mobile-menu-btn" onClick={()=>setSidebarOpen(true)} aria-label="Menü öffnen">☰</button>
      <div className={`sidebar-overlay${sidebarOpen?" open":""}`} onClick={()=>setSidebarOpen(false)}></div>
      <div className={`sidebar${sidebarOpen?" open":""}`}>
        <div className="logo" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <h1>ImmoBase</h1>
            <p>D&T HOMES</p>
          </div>
          <button onClick={()=>setSidebarOpen(false)} style={{display:"none",background:"none",border:"none",fontSize:22,color:"var(--muted)",cursor:"pointer",padding:"0 4px"}} className="sidebar-close" aria-label="Menü schliessen">✕</button>
        </div>
        <div className="nav">
          {(()=>{
            const badges={bewerber:[neueBewerber,"#f5efe4","#a08864"],nachvermietung:[nachvermietungOffen,"#fbeae6","#8a3a2e"],portfoliowatch:[portfolioWatchOffen,"#eae3d6","#7c6a4e"],marktradar:[marktRadarOffen,"#e7e0d3","#7c6a4e"],pipeline:[pipelineOffen,"#d9e0d0","#5f6b4e"],zimmer:[freeCount,"#f6ecd8","#c89653"],zahlungen:[offeneZahlungen,"#fbeae6","#8a3a2e"],uebergaben:[(offeneUebergaben||0)+(offeneAuszuege||0),"#fbeae6","#8a3a2e"]};
            const badge=(id)=>{ const b=badges[id]; return (b&&b[0]>0)?<span style={{background:b[1],color:b[2],fontSize:9,padding:"1px 5px",borderRadius:10,fontWeight:700}}>{b[0]}</span>:null; };
            const knopf=(p,sub)=>(<button key={p.id} className={`nb${page===p.id?" on":""}${sub?" nb-sub":""}`} onClick={()=>{setPage(p.id);setNavTarget(null);setSidebarOpen(false);}}>
              <span className="ni">{p.icon}</span><span style={{flex:1}}>{p.label}</span>{badge(p.id)}
            </button>);
            const oben=sichtbareSeiten.filter(p=>!p.group);
            return (<>
              {oben.map(p=>knopf(p,false))}
              {NAV_GRUPPEN.map(g=>{
                const seiten=sichtbareSeiten.filter(p=>p.group===g.id);
                if(!seiten.length) return null;
                const aktiv=seiten.some(p=>p.id===page);
                const offen=aktiv||!!navOffen[g.id];
                const summe=seiten.reduce((n,p)=>{ const b=badges[p.id]; return n+((b&&b[0]>0)?b[0]:0); },0);
                return (<div key={g.id} className="nav-gruppe">
                  <button className={`nb nb-gruppe${aktiv?" aktiv":""}`} aria-expanded={offen} onClick={()=>{ if(aktiv) return; setNavOffen(o=>{ const n={...o,[g.id]:!o[g.id]}; try{localStorage.setItem("immobase_nav_offen",JSON.stringify(n));}catch(_){} return n; }); }}>
                    <span className="ni">{g.icon}</span><span style={{flex:1}}>{g.label}</span>
                    {!offen&&summe>0&&<span style={{background:"#f0ebe1",color:"#8a8174",fontSize:9,padding:"1px 5px",borderRadius:10,fontWeight:700}}>{summe}</span>}
                    <span className="nb-pfeil" style={{transform:offen?"rotate(90deg)":"none"}}>›</span>
                  </button>
                  {offen && seiten.map(p=>knopf(p,true))}
                </div>);
              })}
            </>);
          })()}
        </div>
        <div className="user-info" ref={acctRef}>
          {acctOpen && (
            <div className="acct-menu">
              {rolle === "admin" && <button onClick={()=>{setAcctOpen(false);setTeamOpen(true);}}>Team verwalten</button>}
              <button onClick={()=>{setAcctOpen(false);setPwOpen(true);}}>Passwort ändern</button>
              <button onClick={()=>{setAcctOpen(false);setPkOpen(true);}}>{passkeyName()}</button>
              <button className="gefahr" onClick={()=>{setAcctOpen(false);logout();}}>Abmelden</button>
            </div>
          )}
          <button className={`acct-btn${acctOpen?" on":""}`} onClick={()=>setAcctOpen(o=>!o)} title={benutzerMail||""}>
            <span className="acct-av">{initialen(benutzerMail)}</span>
            <span className="acct-txt">
              <span className="acct-name">{benutzerMail ? benutzerMail.split("@")[0] : "Konto"}</span>
              <span className="acct-sub">Konto</span>
            </span>
            <span className="acct-caret">▲</span>
          </button>
        </div>
      </div>
      <div className="main">{(window.__IB_DATA=data, null)}<div key={page} className="seite-anim"><Page {...data} rolle={rolle} benutzerMail={benutzerMail} istAdmin={rolle !== "operations"} navigateTo={navigateTo} navTarget={navTarget}/></div></div>
      {pwOpen && <PasswortAendern onClose={()=>setPwOpen(false)}/>}
      {pkOpen && <PasskeysVerwalten onClose={()=>setPkOpen(false)}/>}
      <PasskeyAngebot/>
      {teamOpen && <TeamVerwaltung onClose={()=>setTeamOpen(false)} eigeneMail={benutzerMail} insertEmployee={data.insertEmployee} employees={data.employees}/>}
    </div>
  );
}

// Team-Verwaltung: Admins schalten Mitarbeiter frei, aendern Rollen und
// entfernen Zugaenge. Die Person registriert sich danach selbst ueber
// "Konto erstellen" im Login, der Datenbank-Trigger laesst nur
// freigeschaltete Adressen durch.
// Nachricht an Mieter/Bewerber senden: Vorlage waehlen, Platzhalter werden
// automatisch gefuellt, Text vor dem Senden anpassbar. Versand per E-Mail
// (Resend, ueber Edge Function) oder WhatsApp (wa.me-Link mit vorgefuelltem Text).
let __meNameCache = null;
async function resolveMeName(){
  if (__meNameCache !== null) return __meNameCache;
  try {
    const { data: u } = await supabase.auth.getUser();
    const email = ((u && u.user && u.user.email) || "").toLowerCase();
    if (!email) { __meNameCache = ""; return ""; }
    const { data: emps } = await supabase.from("employees").select("vorname,email");
    const me = (emps||[]).find(e => (e.email||"").toLowerCase() === email);
    __meNameCache = (me && me.vorname) ? String(me.vorname).trim() : "";
  } catch (e) { __meNameCache = ""; }
  return __meNameCache;
}

function feeVon(t){
  if (!t) return 0;
  const raw = t.kautionAufschlag;
  if (raw !== null && raw !== undefined && raw !== "") return +raw || 0;   // gespeicherter Wert gilt, auch 0
  if (t.kautionOpt === "0x") return 150;                                    // sonst aus Kautionswahl ableiten
  if (t.kautionOpt === "1x") return 100;
  if (t.kautionOpt === "2x") return 50;
  return 0;
}

function moeblVon(t){
  if (!t) return 0;
  const m = (t.moebliert===true || t.moebliert==="ja") && t.moeblierungModus==="monatlich";
  return m ? (+t.moeblierungPauschale || 0) : 0;   // nur monatliche Moeblierung zaehlt, wie im Soll
}

// Vorlagentext waehlen: bei ganzen Wohnungen die Wohnungs-Variante (falls vorhanden)
function vorlageTexte(v, spr, istW) {
  const en = spr === "en";
  const W = !!istW;
  const betreff = en ? ((W && v.betreff_wohnung_en) || v.betreff_en || (W && v.betreff_wohnung) || v.betreff) : ((W && v.betreff_wohnung) || v.betreff);
  const inhalt = en ? ((W && v.inhalt_wohnung_en) || v.inhalt_en || v.inhalt) : ((W && v.inhalt_wohnung) || v.inhalt);
  return { betreff: betreff || "", inhalt: inhalt || "" };
}
function aptIstWohnung(apt){ return !!(apt && apt.vermietungsart === "wohnung"); }
function platzhalterFuellen(text, empfaenger) {
  if (!text) return "";
  const map = {
    vorname: empfaenger.vorname || "",
    nachname: empfaenger.nachname || "",
    adresse: empfaenger.adresse || "",
    zimmer: empfaenger.zimmer || "",
    einzug: empfaenger.einzug || "",
    auszug: empfaenger.auszug || "",
    uebergabe_link: empfaenger.uebergabe_link || "",
    mitbewohner: empfaenger.mitbewohner || "",
    zimmerpreis: empfaenger.zimmerpreis || "",
    moeblierung: empfaenger.moeblierung || "",
    kautionswahl: empfaenger.kautionswahl || "",
    tour_link: empfaenger.tour_link || "",
    vormieter_name: empfaenger.vormieter_name || "",
    vormieter_telefon: empfaenger.vormieter_telefon || "",
    nachmieter_name: empfaenger.nachmieter_name || "",
    nachmieter_telefon: empfaenger.nachmieter_telefon || "",
    absender: empfaenger.absender || "",
  };
  return text.replace(/\{(\w+)\}/g, (m, key) => (key in map ? map[key] : m));
}

function KommunikationTab({empfaenger, zielgruppe}) {
  const [templates, setTemplates] = useState(null);
  const [selId, setSelId] = useState("");
  const [betreff, setBetreff] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState(null);
  const [sprache, setSprache] = useState(empfaenger && empfaenger.sprache==="en" ? "en" : "de");
  const [keyboxen, setKeyboxen] = useState([]);
  const [kbBusy, setKbBusy] = useState(false);
  useEffect(() => {
    if (!empfaenger || !empfaenger.aptId) { setKeyboxen([]); return; }
    supabase.from("keyboxes").select("id,bezeichnung,code,bild_path,notiz").eq("apartment_id", empfaenger.aptId).order("sort").order("created_at")
      .then(({data}) => setKeyboxen((data||[]).filter(k => (k.code||"").trim() || k.bild_path)));
  }, [empfaenger && empfaenger.aptId]);
  async function keyboxEinfuegen(k) {
    setKbBusy(true);
    try {
      const en = sprache === "en";
      const link = k.bild_path ? await keyboxBildLink(k.bild_path, KEYBOX_LINK_TAGE*86400) : "";
      if (k.bild_path && !link) { setMsg({t:"err", m:"Bild-Link konnte nicht erstellt werden."}); return; }
      const name = (k.bezeichnung||"Keybox").trim();
      const zeilen = [
        (/^keybox$/i.test(name) ? (en ? "Key box" : "Keybox") : (en ? `Key box (${name})` : `Keybox (${name})`)),
        (k.code||"").trim() ? (en ? `Code: ${k.code.trim()}` : `Code: ${k.code.trim()}`) : "",
        link ? (en ? `Photo of the key box: ${link}` : `Bild der Keybox: ${link}`) : "",
      ].filter(Boolean);
      setText(t => (t && t.trim() ? t.replace(/\s+$/,"") + "\n\n" : "") + zeilen.join("\n"));
      setMsg(link ? {t:"ok", m:`Keybox eingefügt. Der Bild-Link ist ${KEYBOX_LINK_TAGE} Tage gültig.`} : {t:"ok", m:"Keybox eingefügt."});
    } finally { setKbBusy(false); }
  }

  useEffect(() => {
    supabase.from("message_templates").select("*").eq("aktiv", true).order("sortierung")
      .then(({data, error}) => {
        if (error) { setMsg({t:"err", m:"Vorlagen konnten nicht geladen werden: " + error.message}); setTemplates([]); }
        else setTemplates((data||[]).filter(v => (v.zielgruppe === zielgruppe || v.zielgruppe === "beide") && !(empfaenger && empfaenger.istWohnung && v.nur_wg)));
      });
  }, [zielgruppe]);

  function waehle(id, lang) {
    setSelId(id);
    const spr = lang || sprache;
    const v = (templates||[]).find(x => x.id === id);
    if (v) {
      const { betreff: bet, inhalt: inh } = vorlageTexte(v, spr, empfaenger && empfaenger.istWohnung);
      setBetreff(platzhalterFuellen(bet||"", empfaenger));
      setText(platzhalterFuellen(inh||"", empfaenger));
      if ((inh||"").includes("{uebergabe_link}") && !empfaenger.uebergabe_link) {
        setMsg({t:"err", m:"Achtung: Diese Vorlage enthält einen Übergabe-Link, aber für diesen Mieter läuft noch kein Übergabeprotokoll. Starte es zuerst im Tab Übergabe."});
      } else {
        setMsg(null);
      }
    } else { setBetreff(""); setText(""); setMsg(null); }
  }
  function wechsleSprache(spr) {
    setSprache(spr);
    if (selId) waehle(selId, spr);
  }

  const cleanPhone = String(empfaenger.phone||"").replace(/\D/g, "");
  const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;

  async function sendeEmail() {
    if (!empfaenger.email) { setMsg({t:"err", m:"Keine E-Mail-Adresse hinterlegt."}); return; }
    if (!text.trim()) { setMsg({t:"err", m:"Der Text ist leer."}); return; }
    setSending(true); setMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-message", {
        body: { to: empfaenger.email, betreff: betreff || (sprache==="en" ? "Message from D&T Homes" : "Mitteilung von D&T Homes"), text, sprache }
      });
      if (error) { let m=error.message; try{ const j=await error.context.json(); if(j&&j.error) m=j.error; }catch(_){} throw new Error(m); }
      if (data && data.error) throw new Error(data.error);
      setMsg({t:"ok", m:`E-Mail an ${empfaenger.email} verschickt.`});
    } catch(err) {
      setMsg({t:"err", m:"Konnte nicht gesendet werden: " + (err.message||err)});
    } finally { setSending(false); }
  }

  return (
    <div>
      <div style={{fontSize:12,color:"var(--muted)",marginBottom:16}}>
        An {empfaenger.vorname} {empfaenger.nachname}{empfaenger.email?` · ${empfaenger.email}`:" · keine E-Mail"}{cleanPhone?" · ☏ vorhanden":" · keine Nummer"}
      </div>

      <div style={{fontSize:9.5,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".22em",marginBottom:6,fontWeight:500}}>Sprache</div>
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        <button type="button" onClick={()=>wechsleSprache("de")} className="btn btn-sm" style={{flex:1,justifyContent:"center",background:sprache==="de"?"#1a1814":"transparent",color:sprache==="de"?"#fff":"var(--ink)",borderColor:sprache==="de"?"#1a1814":"var(--line)"}}>Deutsch</button>
        <button type="button" onClick={()=>wechsleSprache("en")} className="btn btn-sm" style={{flex:1,justifyContent:"center",background:sprache==="en"?"#1a1814":"transparent",color:sprache==="en"?"#fff":"var(--ink)",borderColor:sprache==="en"?"#1a1814":"var(--line)"}}>English</button>
      </div>

      <div style={{fontSize:9.5,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".22em",marginBottom:6,fontWeight:500}}>Vorlage</div>
      <select className="fi" value={selId} onChange={e=>waehle(e.target.value)} style={{width:"100%",marginBottom:14,fontSize:11.5}}>
        <option value="">Vorlage wählen oder frei schreiben…</option>
        {(templates||[]).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>

      <div style={{fontSize:9.5,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".22em",marginBottom:6,fontWeight:500}}>Betreff (nur E-Mail)</div>
      <input className="fi" value={betreff} onChange={e=>setBetreff(e.target.value)} placeholder="Betreff" style={{width:"100%",marginBottom:14,fontSize:11.5}}/>

      <div style={{fontSize:9.5,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".22em",marginBottom:6,fontWeight:500}}>Nachricht</div>
      {keyboxen.length>0 && (
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
          {keyboxen.map(k => (
            <button key={k.id} type="button" className="btn btn-sm" disabled={kbBusy} onClick={()=>keyboxEinfuegen(k)} style={{width:"auto",background:"#f3eee4",borderColor:"#e0d5c2",color:"var(--ink)"}}>
              🔐 {(keyboxen.length>1 ? (k.bezeichnung||"Keybox") : "Keybox")} einfügen{k.bild_path?" (Code + Bild)":" (Code)"}
            </button>
          ))}
        </div>
      )}
      <textarea className="fi" value={text} onChange={e=>setText(e.target.value)} rows={11} placeholder="Text der Nachricht…" style={{width:"100%",marginBottom:16,fontSize:11.5,lineHeight:1.5,resize:"vertical",fontFamily:"inherit"}}/>

      {msg && <div ref={el=>{ if(el) try{ el.scrollIntoView({block:"nearest",behavior:"smooth"}); }catch(_){} }} style={{fontSize:12.5,marginBottom:12,lineHeight:1.5,padding:"10px 12px",borderRadius:8,background:msg.t==="ok"?"#e8eadb":"#f6e3dd",border:"1px solid "+(msg.t==="ok"?"#c5cda8":"#e0bcb0"),color:msg.t==="ok"?"#3d4f2f":"#9b4a3e"}}>{msg.t==="ok"?"✓ ":"⚠ "}{msg.m}</div>}
      {!empfaenger.email && <div style={{fontSize:12,marginBottom:10,color:"#9b4a3e"}}>Für diesen Kontakt ist keine E-Mail-Adresse hinterlegt, darum ist «Per E-Mail senden» ausgegraut.</div>}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button className="btn btn-p" onClick={sendeEmail} disabled={sending||!empfaenger.email} style={{flex:1,minWidth:150,justifyContent:"center"}}>
          {sending ? "Sende…" : "✉ Per E-Mail senden"}
        </button>
        <a href={cleanPhone && text ? waUrl : undefined}
           target="_blank" rel="noopener noreferrer"
           onClick={e=>{ if(!cleanPhone||!text){ e.preventDefault(); setMsg({t:"err", m:"Für WhatsApp braucht es eine Nummer und Text."}); } }}
           className="btn"
           style={{flex:1,minWidth:150,justifyContent:"center",textDecoration:"none",background:"#e8efde",color:"#3a5230",border:"1px solid #c5d5b0",display:"inline-flex",alignItems:"center",gap:6,opacity:(cleanPhone&&text)?1:.5}}>
          💬 WhatsApp öffnen
        </a>
      </div>
      <div style={{fontSize:10.5,color:"var(--muted-light)",marginTop:10,lineHeight:1.5}}>
        WhatsApp öffnet die App mit vorbereitetem Text, gesendet wird erst mit deinem Tippen dort.
      </div>
    </div>
  );
}

const ROLLEN_LABELS = {
  admin: "Admin (Vollzugriff)",
  operations: "Operations (Besichtigungen & Übergaben)",
  mitarbeiter: "Mitarbeiter (nur eigene Zeiterfassung)",
};

function TeamVerwaltung({onClose, eigeneMail, insertEmployee, employees}) {
  const [liste, setListe] = useState(null);
  const [neuMail, setNeuMail] = useState("");
  const [neuRolle, setNeuRolle] = useState("mitarbeiter");
  const [neuVorname, setNeuVorname] = useState("");
  const [neuNachname, setNeuNachname] = useState("");
  const [neuFunktion, setNeuFunktion] = useState("");
  const [neuLohn, setNeuLohn] = useState("");
  const [neuPhone, setNeuPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const inp = {padding:"9px 12px",border:"1px solid var(--line)",borderRadius:6,fontSize:13,fontFamily:"inherit",width:"100%",boxSizing:"border-box"};

  async function laden() {
    const {data, error} = await supabase.from("allowed_users").select("*").order("added_at", {ascending: true});
    if (error) setMsg({t:"err", m:"Team konnte nicht geladen werden: " + error.message});
    else setListe(data || []);
  }
  useEffect(() => { laden(); }, []);

  async function hinzufuegen() {
    const mail = neuMail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { setMsg({t:"err", m:"Bitte eine gültige E-Mail-Adresse eingeben."}); return; }
    setBusy(true); setMsg(null);
    const {error} = await supabase.from("allowed_users").insert([{email: mail, role: neuRolle}]);
    if (error && error.code !== "23505") {
      setBusy(false);
      setMsg({t:"err", m: "Fehler: " + error.message});
      return;
    }
    const schonFreigeschaltet = error && error.code === "23505";
    const schonMitarbeiter = (employees||[]).some(e => (e.email||"").toLowerCase() === mail);
    if (!schonMitarbeiter && insertEmployee) {
      try { await insertEmployee({vorname:neuVorname, nachname:neuNachname, email:mail, phone:neuPhone, funktion:neuFunktion, stundenlohn:neuLohn, aktiv:true}); } catch(e) { /* Login besteht, Mitarbeiter kann spaeter ergaenzt werden */ }
    }
    setBusy(false);
    setNeuMail(""); setNeuVorname(""); setNeuNachname(""); setNeuFunktion(""); setNeuLohn(""); setNeuPhone("");
    if (schonMitarbeiter) setMsg({t:"ok", m:`${mail} ist bereits als Mitarbeiter angelegt.`});
    else if (schonFreigeschaltet) setMsg({t:"ok", m:`${mail} war bereits freigeschaltet und ist jetzt auch als Mitarbeiter in der Zeiterfassung angelegt.`});
    else setMsg({t:"ok", m:`${mail} ist hinzugefügt und erscheint in der Zeiterfassung. Die Person registriert sich im Login über "Konto erstellen".`});
    laden();
  }

  async function rolleAendern(mail, rolle) {
    if (mail.toLowerCase() === (eigeneMail || "").toLowerCase() && rolle !== "admin") {
      const ok = confirm("Achtung: du stufst gerade deine eigene Rolle herab und verlierst damit den Admin-Zugriff. Wirklich fortfahren?");
      if (!ok) { laden(); return; }
    }
    const {error} = await supabase.from("allowed_users").update({role: rolle}).eq("email", mail);
    if (error) setMsg({t:"err", m:"Fehler: " + error.message});
    else setMsg(null);
    laden();
  }

  async function entfernen(mail) {
    if (!confirm(`${mail} wirklich entfernen? Die Person sieht danach keine Daten mehr.`)) return;
    const {error} = await supabase.from("allowed_users").delete().eq("email", mail);
    if (error) setMsg({t:"err", m:"Fehler: " + error.message});
    else setMsg({t:"ok", m:`${mail} wurde entfernt.`});
    laden();
  }

  const istIch = (mail) => mail.toLowerCase() === (eigeneMail || "").toLowerCase();

  return (
    <div className="ov-x" onClick={()=>{ if(!busy) onClose(); }} style={{position:"fixed",inset:0,background:"rgba(26,24,20,.45)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,zIndex:2000}}>
      <div className="modal-x" onClick={e=>e.stopPropagation()} style={{background:"var(--surface)",borderRadius:12,padding:"22px 22px 18px",maxWidth:560,width:"100%",maxHeight:"85vh",overflowY:"auto",boxShadow:"0 10px 40px rgba(0,0,0,.2)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:18,color:"var(--ink)"}}>Team verwalten</div>
          <button className="btn btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{fontSize:12,color:"var(--muted)",lineHeight:1.55,marginBottom:16}}>
          Freigeschaltete Personen registrieren sich selbst über "Konto erstellen" im Login. Die Rolle bestimmt, welche Bereiche sichtbar sind.
        </div>

        {liste === null && <div style={{fontSize:13,color:"var(--muted)",padding:"14px 0"}}>Lade…</div>}

        {liste && liste.map(u => (
          <div key={u.email} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid var(--line-soft)",flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:180}}>
              <div style={{fontSize:13.5,color:"var(--ink)",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis"}}>{u.email}{istIch(u.email) && <span style={{marginLeft:6,fontSize:10,color:"var(--muted)"}}>(du)</span>}</div>
              {u.added_at && <div style={{fontSize:10.5,color:"var(--muted-light)"}}>seit {new Date(u.added_at).toLocaleDateString("de-CH")}</div>}
            </div>
            <select className="team-fi" value={u.role || "admin"} onChange={e=>rolleAendern(u.email, e.target.value)}
              style={{fontSize:12,padding:"6px 8px",border:"1px solid var(--line)",borderRadius:6,background:"var(--surface)",color:"var(--ink)",fontFamily:"inherit",maxWidth:220}}>
              {Object.entries(ROLLEN_LABELS).map(([wert, label]) => <option key={wert} value={wert}>{label}</option>)}
            </select>
            {!istIch(u.email) && (
              <button className="btn btn-sm" onClick={()=>entfernen(u.email)} style={{color:"var(--error)",borderColor:"var(--error-soft)"}}>Entfernen</button>
            )}
          </div>
        ))}

        <div style={{marginTop:18}}>
          <div style={{fontSize:9.5,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".22em",marginBottom:8,fontWeight:500}}>Neue Person hinzufügen</div>
          <div style={{fontSize:11,color:"var(--muted)",marginBottom:10,lineHeight:1.5}}>Wird als Login freigeschaltet und automatisch als Mitarbeiter in der Zeiterfassung angelegt.</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <input className="team-fi" placeholder="Vorname" value={neuVorname} onChange={e=>setNeuVorname(e.target.value)} style={inp}/>
            <input className="team-fi" placeholder="Nachname" value={neuNachname} onChange={e=>setNeuNachname(e.target.value)} style={inp}/>
            <input className="team-fi" type="email" placeholder="E-Mail-Adresse" value={neuMail} onChange={e=>setNeuMail(e.target.value)} style={inp}/>
            <input className="team-fi" placeholder="Telefon" value={neuPhone} onChange={e=>setNeuPhone(e.target.value)} style={inp}/>
            <input className="team-fi" placeholder="Funktion (z.B. Reinigung)" value={neuFunktion} onChange={e=>setNeuFunktion(e.target.value)} style={inp}/>
            <input className="team-fi" type="number" placeholder="Stundenlohn CHF" value={neuLohn} onChange={e=>setNeuLohn(e.target.value)} style={inp}/>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <select className="team-fi" value={neuRolle} onChange={e=>setNeuRolle(e.target.value)}
              style={{fontSize:12,padding:"9px 10px",border:"1px solid var(--line)",borderRadius:6,background:"var(--surface)",color:"var(--ink)",fontFamily:"inherit"}}>
              {Object.entries(ROLLEN_LABELS).map(([wert, label]) => <option key={wert} value={wert}>{label}</option>)}
            </select>
            <button className="btn btn-p btn-sm" disabled={busy || !neuMail.trim()} onClick={hinzufuegen}>{busy ? "Speichere…" : "Hinzufügen"}</button>
          </div>
        </div>

        {msg && <div style={{fontSize:12,marginTop:12,lineHeight:1.5,color:msg.t==="ok"?"#3d4f2f":"#9b4a3e"}}>{msg.m}</div>}
      </div>
    </div>
  );
}

// Face ID / Passkeys verwalten: auflisten, hinzufuegen, entfernen
function PasskeysVerwalten({onClose}) {
  const [liste, setListe] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  async function laden(){ const {data,error}=await supabase.auth.passkey.list(); if(error){ setMsg({t:"err",m:"Konnte nicht geladen werden."}); setListe([]); } else setListe(data||[]); }
  useEffect(()=>{ laden(); },[]);
  async function hinzufuegen(){
    setBusy(true); setMsg(null);
    try{ const {error}=await supabase.auth.registerPasskey(); if(error){ const t=passkeyFehlerText(error); if(t) setMsg({t:"err",m:t}); } else { try{localStorage.setItem("ib_passkey","1");}catch(_){} setMsg({t:"ok",m:`${passkeyName()} ist eingerichtet. Ab jetzt kannst du dich damit anmelden.`}); await laden(); } }
    catch(e){ const t=passkeyFehlerText(e); if(t) setMsg({t:"err",m:t}); }
    setBusy(false);
  }
  async function entfernen(p){
    if(!confirm(`«${p.friendly_name||"Passkey"}» entfernen? Danach geht die Anmeldung mit diesem Gerät nur noch mit Passwort.`)) return;
    setBusy(true); const {error}=await supabase.auth.passkey.delete({passkeyId:p.id}); setBusy(false);
    if(error) setMsg({t:"err",m:"Entfernen fehlgeschlagen."}); else { await laden(); }
  }
  const dat=(d)=>{ try{ return new Date(d).toLocaleDateString("de-CH"); }catch(_){ return ""; } };
  return (
    <div className="ov-x" onClick={()=>{ if(!busy) onClose(); }} style={{position:"fixed",inset:0,background:"rgba(26,24,20,.45)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,zIndex:2000}}>
      <div className="modal-x klein" onClick={e=>e.stopPropagation()} style={{background:"var(--surface)",borderRadius:12,padding:"22px 22px 18px",maxWidth:420,width:"100%",boxShadow:"0 10px 40px rgba(0,0,0,.2)"}}>
        <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:18,color:"var(--ink)",marginBottom:6}}>{passkeyName()}</div>
        <div style={{fontSize:12,color:"var(--muted)",lineHeight:1.55,marginBottom:14}}>Melde dich ohne Passwort an, mit Gesicht oder Fingerabdruck. Das Passwort bleibt als Ersatz bestehen.</div>
        {liste===null ? <div style={{fontSize:12,color:"var(--muted)"}}>Lädt…</div> : liste.length===0 ? (
          <div style={{fontSize:12.5,color:"var(--muted)",marginBottom:12}}>Noch kein Gerät eingerichtet.</div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
            {liste.map(p=>(
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,border:"1px solid var(--line)",borderRadius:8,padding:"9px 12px"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600}}>{p.friendly_name||"Passkey"}</div>
                  <div style={{fontSize:11,color:"var(--muted)"}}>Eingerichtet {dat(p.created_at)}{p.last_used_at?` · zuletzt ${dat(p.last_used_at)}`:""}</div>
                </div>
                <button className="btn btn-g btn-sm" style={{width:"auto",color:"#9b4a3e"}} disabled={busy} onClick={()=>entfernen(p)}>Entfernen</button>
              </div>
            ))}
          </div>
        )}
        {msg && <div style={{fontSize:12,marginBottom:10,color:msg.t==="ok"?"#3d4f2f":"#9b4a3e"}}>{msg.m}</div>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}>
          <button className="btn btn-g btn-sm" style={{width:"auto"}} disabled={busy} onClick={onClose}>Schliessen</button>
          {PASSKEY_MOEGLICH && <button className="btn btn-sm" style={{width:"auto"}} disabled={busy} onClick={hinzufuegen}>{busy?"Bitte warten…":"+ Dieses Gerät einrichten"}</button>}
        </div>
      </div>
    </div>
  );
}

// Nach einer Anmeldung mit Passwort einmal anbieten, Face ID einzurichten
function PasskeyAngebot() {
  const [zeigen, setZeigen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(()=>{
    let pw=false; try{ pw=sessionStorage.getItem("ib_pw_login")==="1"; sessionStorage.removeItem("ib_pw_login"); }catch(_){}
    let nein=false; try{ nein=localStorage.getItem("ib_passkey_nein")==="1"; }catch(_){}
    if(!pw || nein || !PASSKEY_MOEGLICH) return;
    supabase.auth.passkey.list().then(({data})=>{ if(!data || data.length===0) setZeigen(true); else { try{localStorage.setItem("ib_passkey","1");}catch(_){} } }).catch(()=>{});
  },[]);
  if(!zeigen) return null;
  async function ja(){
    setBusy(true); setMsg(null);
    try{ const {error}=await supabase.auth.registerPasskey(); if(error){ const t=passkeyFehlerText(error); if(t) setMsg(t); setBusy(false); return; } try{localStorage.setItem("ib_passkey","1");}catch(_){} toast(`${passkeyName()} eingerichtet`); setZeigen(false); }
    catch(e){ const t=passkeyFehlerText(e); if(t) setMsg(t); }
    setBusy(false);
  }
  function spaeter(nie){ if(nie){ try{localStorage.setItem("ib_passkey_nein","1");}catch(_){} } setZeigen(false); }
  return (
    <div className="ov-x" onClick={()=>!busy&&spaeter(false)} style={{position:"fixed",inset:0,background:"rgba(26,24,20,.45)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,zIndex:2000}}>
      <div className="modal-x klein" onClick={e=>e.stopPropagation()} style={{background:"var(--surface)",borderRadius:12,padding:"22px 22px 18px",maxWidth:400,width:"100%",boxShadow:"0 10px 40px rgba(0,0,0,.2)"}}>
        <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:18,color:"var(--ink)",marginBottom:8}}>Nächstes Mal mit {passkeyName()}?</div>
        <div style={{fontSize:12.5,color:"var(--muted)",lineHeight:1.55,marginBottom:14}}>Richte dieses Gerät ein, dann meldest du dich künftig ohne Passwort an. Das Passwort bleibt als Ersatz bestehen.</div>
        {msg && <div style={{fontSize:12,marginBottom:10,color:"#9b4a3e"}}>{msg}</div>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}>
          <button className="btn btn-g btn-sm" style={{width:"auto"}} disabled={busy} onClick={()=>spaeter(true)}>Nicht mehr fragen</button>
          <button className="btn btn-g btn-sm" style={{width:"auto"}} disabled={busy} onClick={()=>spaeter(false)}>Später</button>
          <button className="btn btn-sm" style={{width:"auto"}} disabled={busy} onClick={ja}>{busy?"Bitte warten…":"Einrichten"}</button>
        </div>
      </div>
    </div>
  );
}

function PasswortAendern({onClose, pflicht}) {
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  async function speichern() {
    if (pw1.length < 10) { setMsg({t:"err", m:"Bitte mindestens 10 Zeichen verwenden."}); return; }
    if (pw1 !== pw2) { setMsg({t:"err", m:"Die beiden Eingaben stimmen nicht überein."}); return; }
    setBusy(true); setMsg(null);
    const {error} = await supabase.auth.updateUser({password: pw1});
    setBusy(false);
    if (error) setMsg({t:"err", m:"Fehler: " + error.message});
    else { setMsg({t:"ok", m:"Passwort geändert."}); setPw1(""); setPw2(""); setTimeout(onClose, 1200); }
  }
  return (
    <div className="ov-x" onClick={()=>{ if(!busy && !pflicht) onClose(); }} style={{position:"fixed",inset:0,background:pflicht?"var(--bg)":"rgba(26,24,20,.45)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,zIndex:2000}}>
      <div className="modal-x klein" onClick={e=>e.stopPropagation()} style={{background:"var(--surface)",borderRadius:12,padding:"22px 22px 18px",maxWidth:400,width:"100%",boxShadow:"0 10px 40px rgba(0,0,0,.2)"}}>
        <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:18,color:"var(--ink)",marginBottom:pflicht?8:14}}>{pflicht ? "Neues Passwort festlegen" : "Passwort ändern"}</div>
        {pflicht && <div style={{fontSize:12,color:"var(--muted)",lineHeight:1.55,marginBottom:14}}>Du bist über den Link aus der E-Mail angemeldet. Bitte lege jetzt ein neues Passwort fest, danach steht die App zur Verfügung.</div>}
        <input type="password" placeholder="Neues Passwort" autoComplete="new-password" value={pw1} onChange={e=>setPw1(e.target.value)}
          style={{width:"100%",padding:"10px 12px",border:"1px solid var(--line)",borderRadius:6,fontSize:13,marginBottom:10,fontFamily:"inherit"}}/>
        <input type="password" placeholder="Neues Passwort wiederholen" autoComplete="new-password" value={pw2} onChange={e=>setPw2(e.target.value)}
          style={{width:"100%",padding:"10px 12px",border:"1px solid var(--line)",borderRadius:6,fontSize:13,marginBottom:12,fontFamily:"inherit"}}/>
        {msg && <div style={{fontSize:12,marginBottom:10,color:msg.t==="ok"?"#3d4f2f":"#9b4a3e"}}>{msg.m}</div>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          {!pflicht && <button className="btn btn-g btn-sm" disabled={busy} onClick={onClose}>Abbrechen</button>}
          {pflicht && <button className="btn btn-g btn-sm" disabled={busy} onClick={async()=>{ await supabase.auth.signOut(); window.location.href = window.location.pathname; }}>Abmelden</button>}
          <button className="btn btn-sm" disabled={busy||!pw1||!pw2} onClick={speichern}>{busy?"Speichere…":"Speichern"}</button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [authed, setAuthed] = useState(undefined);
  const [rolle, setRolle] = useState(null);
  const [recovery, setRecovery] = useState(
    typeof window !== "undefined" && /type=recovery/.test(window.location.hash || "")
  );

  useEffect(() => {
    // Alte Passwort-Merker aufraeumen
    localStorage.removeItem("immobase_auth");
    localStorage.removeItem("immobase_auth_time");
    let aktiv = true;
    supabase.auth.getSession().then(({data}) => {
      if (aktiv) setAuthed(!!data?.session);
    });
    const {data: sub} = supabase.auth.onAuthStateChange((ereignis, session) => {
      if (!aktiv) return;
      // Der Link aus der Zuruecksetzen-Mail meldet direkt an.
      // Deshalb erzwingen wir hier ein neues Passwort, bevor die App nutzbar ist.
      if (ereignis === "PASSWORD_RECOVERY") setRecovery(true);
      if (ereignis === "SIGNED_OUT") setRecovery(false);
      setAuthed(!!session);
    });
    return () => { aktiv = false; sub?.subscription?.unsubscribe(); };
  }, []);

  // Rolle des angemeldeten Nutzers laden. Die Datenbank setzt die Rechte
  // ohnehin selbst durch, das hier steuert nur, was in der Oberflaeche
  // angezeigt wird. Bei einem Fehler zeigen wir bewusst alles an, sonst
  // wuerde ein kurzer Netzwerkaussetzer die Navigation leeren.
  useEffect(() => {
    if (!authed) { setRolle(null); return; }
    let aktiv = true;
    supabase.rpc("current_user_role").then(({data, error}) => {
      if (!aktiv) return;
      if (error) { console.warn("Rolle konnte nicht geladen werden:", error); setRolle("admin"); }
      else setRolle(data || "admin");
    });
    return () => { aktiv = false; };
  }, [authed]);

  if (authed === undefined) return <div className="loading"><div className="ib-splash-logo">ImmoBase</div><div className="ib-splash-sub">D&amp;T Homes</div><div className="ib-splash-bar"><span></span></div></div>;
  if (!authed) return <Login onLogin={()=>setAuthed(true)}/>;
  if (recovery) return <PasswortAendern pflicht onClose={()=>{
    setRecovery(false);
    if (window.history.replaceState) window.history.replaceState(null, "", window.location.pathname);
  }}/>;
  if (rolle === null) return <div className="loading"><div className="ib-splash-logo">ImmoBase</div><div className="ib-splash-sub">D&amp;T Homes</div><div className="ib-splash-bar"><span></span></div></div>;
  return <React.Fragment><MainApp rolle={rolle}/><Toast/></React.Fragment>;
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = {error: null, info: null}; }
  static getDerivedStateFromError(error) { return {error}; }
  componentDidCatch(error, info) { console.error("React error:", error, info); this.setState({info}); }
  render() {
    if (this.state.error) {
      return (
        <div style={{padding:"40px 32px",maxWidth:800,margin:"40px auto",fontFamily:"Manrope,sans-serif",background:"#fff",border:"1px solid #e1d8c5",borderRadius:8}}>
          <h2 style={{fontWeight:600,fontSize:20,marginBottom:14,color:"#9b4a3e"}}>⚠️ Ein Fehler ist aufgetreten</h2>
          <p style={{fontSize:13,color:"#4a4439",lineHeight:1.6,marginBottom:14}}>Die Anwendung konnte nicht geladen werden. Mögliche Ursachen:</p>
          <ul style={{fontSize:13,color:"#4a4439",lineHeight:1.7,marginLeft:20,marginBottom:18}}>
            <li>Supabase-Setup unvollständig (z.B. Documents-Tabelle fehlt)</li>
            <li>Browser-Cache veraltet → mit Strg+F5 neu laden</li>
            <li>Datenbankspalten passen nicht - schick uns den Fehler</li>
          </ul>
          <details style={{marginBottom:14}}>
            <summary style={{cursor:"pointer",fontWeight:600,fontSize:13,color:"#1a1814"}}>Technische Details (zum Kopieren)</summary>
            <pre style={{marginTop:10,padding:12,background:"#fafaf7",borderRadius:6,fontSize:11,whiteSpace:"pre-wrap",overflow:"auto"}}>{String(this.state.error)}{"\n\n"}{this.state.info?.componentStack||""}</pre>
          </details>
          <button onClick={() => location.reload()} style={{padding:"10px 20px",background:"#1a1814",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:500}}>↻ Seite neu laden</button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(<ErrorBoundary><App/></ErrorBoundary>);
})();
