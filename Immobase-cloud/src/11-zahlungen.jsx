// ─── FINANZEN & FRISTEN ──────────────────────────────────────────────────────
function Finanzen({apts,rooms,tenants=[]}){
  const wgRooms=rooms.filter(r=>["A2","A3","A5","A6","A7","A8"].includes(r.aptId));
  const soll=wgRooms.filter(r=>r.occupied).reduce((s,r)=>{const _t=tenants.find(x=>x.id===r.tenantId);return s+((_t&&_t.mietzins!=null&&_t.mietzins!=="")?+_t.mietzins:(+r.miete||0));},0);
  const pot=wgRooms.reduce((s,r)=>s+(+r.miete||0),0);
  const byApt=apts.filter(a=>a.type==="WG" && !a.pipeline).map(a=>{const rs=rooms.filter(r=>r.aptId===a.id);return{...a,soll:rs.filter(r=>r.occupied).reduce((s,r)=>{const _t=tenants.find(x=>x.id===r.tenantId);return s+((_t&&_t.mietzins!=null&&_t.mietzins!=="")?+_t.mietzins:(+r.miete||0));},0),pot:rs.reduce((s,r)=>s+(+r.miete||0),0)};});
  return(
    <div>
      <div className="pt">Finanzen</div>
      <div className="sg">
        <div className="sc"><div className="sl">Ist-Miete</div><div className="sv" style={{fontSize:20,color:"#5a7c5e"}}>{Math.round(soll/1000)}k</div><div className="sn">CHF/Mt.</div></div>
        <div className="sc"><div className="sl">Potenzial</div><div className="sv" style={{fontSize:20}}>{Math.round(pot/1000)}k</div><div className="sn">CHF/Mt.</div></div>
        <div className="sc"><div className="sl">Ausfall</div><div className="sv" style={{fontSize:20,color:"#c89653"}}>{chf(pot-soll)}</div></div>
        <div className="sc"><div className="sl">Auslastung</div><div className="sv" style={{fontSize:20}}>{pot?Math.round(soll/pot*100):0}%</div></div>
      </div>
      <div className="card">
        <div className="ct">Pro Wohnung</div>
        <table><thead><tr><th>WG</th><th>Adresse</th><th>Ist</th><th>Pot.</th><th>Auslastung</th></tr></thead><tbody>
          {byApt.map(a=>{const p=a.pot?Math.round(a.soll/a.pot*100):0;return(<tr key={a.id}><td style={{fontWeight:700}}>{a.id}</td><td style={{fontSize:11.5,color:"#8a8478"}}>{a.adresse}</td><td style={{color:"#5a7c5e"}}>{chf(a.soll)}</td><td style={{color:"#8a8478"}}>{chf(a.pot)}</td><td style={{width:170,minWidth:130,maxWidth:200}}><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{flex:"1 1 0",minWidth:0}}><Prog val={a.soll} max={a.pot}/></div><span style={{fontSize:10.5}}>{p}%</span></div></td></tr>);})}
        </tbody></table>
      </div>
    </div>
  );
}

function Fristen({apts,tenants,rooms}){
  const heute=new Date();
  const aptEnds=apts.filter(a=>!a.pipeline && a.mietende).map(a=>{const d=parseDMY(a.mietende);return{...a,tage:Math.ceil((d-heute)/86400000)};}).sort((a,b)=>a.tage-b.tage);
  return(
    <div>
      <div className="pt">Fristen</div>
      <div className="card">
        <div className="ct">Wohnungs-Mietenden</div>
        <table><thead><tr><th>ID</th><th>Adresse</th><th>Ende</th><th>Verbleibend</th></tr></thead><tbody>
          {aptEnds.map(a=>{const c=a.tage<30?"r":a.tage<90?"y":"g";return(<tr key={a.id}><td style={{fontWeight:700}}>{a.id}</td><td>{a.adresse}</td><td>{a.mietende}</td><td><Bdg label={`${a.tage}d`} color={c}/></td></tr>);})}
        </tbody></table>
      </div>
    </div>
  );
}

// ─── ZAHLUNGEN ───────────────────────────────────────────────────────────────
function Zahlungen({tenants, rooms, apts, payments, upsertPayment, deletePayment, sendMahnung, navigateTo}){
  const now = new Date();
  
  // Mieten werden vor dem Monatsbeginn überwiesen (typisch bis 25. des Vormonats).
  // Daher: ab dem 25. des aktuellen Monats wird der "Zahlungs-Monat" = nächster Kalendermonat.
  // Beispiel: 26. Mai → wir tracken bereits die Juni-Mieten
  function getPaymentMonth(date) {
    let j = date.getFullYear();
    let m = date.getMonth() + 1;  // 1-12
    if (date.getDate() >= 25) {
      m += 1;
      if (m > 12) { m = 1; j += 1; }
    }
    return { jahr: j, monat: m };
  }
  
  const initialPm = getPaymentMonth(now);
  const [jahr, setJahr] = useState(initialPm.jahr);
  const [monat, setMonat] = useState(initialPm.monat); // 1-12
  const [search, setSearch] = useState("");
  const [showOnlyOffen, setShowOnlyOffen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null); // { tenantId, ... }
  const [showMore, setShowMore] = useState(false);
  const [showUeb, setShowUeb] = useState(false);
  const [mahnungConfirm, setMahnungConfirm] = useState(null); // { row, stufe, monatLabel }
  const [mahnBetrag, setMahnBetrag] = useState("");
  const [mahnVorschau, setMahnVorschau] = useState(null); // { posten, total_offen } oder { laden:true }
  const [mahnBetragStart, setMahnBetragStart] = useState("");
  
  const MONATS_NAMEN = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
  // Zusammensetzung eines Monats-Solls: eigener Monat + Uebertrag, aufgeteilt auf die Monate, aus denen er stammt.
  // Zahlungen decken immer zuerst den aeltesten Betrag. Gleiche Logik wie in der Mahnung.
  const gebuehrVon = (v) => (v && v.mahnung2SentAt && v.status !== "erlassen") ? (v.mahnungFee != null && v.mahnungFee !== "" ? +v.mahnungFee : 30) : 0;
  const zusammensetzung = (tenantId, j, m, eigenSoll, ue, gebuehr = 0) => {
    const mine = payments.filter(x=>x.tenantId===tenantId);
    const key = (jj,mm)=>jj*12+(mm-1);
    const byKey = {}; mine.forEach(x=>{ byKey[key(x.jahr,x.monat)] = x; });
    const posten = [{ jahr:j, monat:m, betrag:+eigenSoll||0, rest:false, aktuell:true }];
    if (gebuehr > 0) posten.push({ jahr:j, monat:m, betrag:gebuehr, gebuehr:true, aktuell:true });
    let carried = +ue||0;
    if (carried < 0) { posten.push({ jahr:j, monat:m, betrag:carried, guthaben:true }); carried = 0; }
    let k = key(j,m)-1, guard = 0; const besucht = new Set([key(j,m)]);
    while (carried > 0.009 && guard++ < 24) {
      const v = byKey[k];
      if (!v) { posten.unshift({ frueher:true, betrag:Math.round(carried*100)/100 }); break; }
      besucht.add(k);
      const vs = (+v.betragSoll||0) + gebuehrVon(v); const eigen = Math.min(vs, carried);
      if (eigen > 0) posten.unshift({ jahr:v.jahr, monat:v.monat, betrag:Math.round(eigen*100)/100, rest: eigen < vs-0.009 });
      carried = Math.round((carried-eigen)*100)/100; k--;
    }
    const andere = mine.filter(v=>{ const kv=key(v.jahr,v.monat); return !besucht.has(kv) && kv<key(j,m) && v.status!=="bezahlt" && v.status!=="erlassen" && ((+v.betragSoll||0)+(+v.uebertrag||0)+gebuehrVon(v)-(+v.betragIst||0))>0.009; })
      .map(v=>({ jahr:v.jahr, monat:v.monat, betrag:Math.round(((+v.betragSoll||0)+(+v.uebertrag||0)+gebuehrVon(v)-(+v.betragIst||0))*100)/100, rest:(+v.betragIst||0)>0 }));
    return { posten, andere };
  };
  const postenText = (x) => x.frueher ? "frühere Monate" : x.guthaben ? "Guthaben" : x.gebuehr ? "Mahngebühr" : `${MONATS_NAMEN[x.monat-1]}${x.jahr!==jahr?" "+x.jahr:""}${x.rest?" (Rest)":""}`;
  const chfK = (n) => (n<0?"−":"")+"CHF "+Math.abs(+n).toLocaleString("de-CH",{minimumFractionDigits:0,maximumFractionDigits:2});
  
  // Helper: parse DD.MM.YYYY oder YYYY-MM-DD zu Date
  function parseDate(s) {
    if (!s) return null;
    const str = String(s).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return new Date(str);
    const m = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) return new Date(+m[3], +m[2]-1, +m[1]);
    const d = new Date(str);
    return isNaN(d) ? null : d;
  }
  
  // Mieter die in DIESEM Monat (jahr/monat) aktiv waren - also Miete zahlen müssten
  // Logik: Mieter erscheint wenn
  //  • Einzug ≤ letzter Tag des Monats  (also vor oder im Monat eingezogen)
  //  • UND: Auszug fehlt ODER Auszug ≥ erster Tag des Monats  (also nicht vor diesem Monat ausgezogen)
  // Archivierte Mieter werden ebenfalls einbezogen falls sie im Monat noch da waren!
  const monatsStart = new Date(jahr, monat-1, 1);  // erster Tag
  const monatsEnde  = new Date(jahr, monat, 0, 23, 59, 59); // letzter Tag des Monats
  
  const activeTenants = tenants.filter(t => {
    const einzug = parseDate(t.einzug);
    const auszug = parseDate(t.auszug);

    // Abgesagte Miete: Auszug am oder vor dem Einzug, also nie eingezogen.
    // Nur ausblenden, wenn dazu keine Zahlung erfasst ist.
    if (einzug && auszug && auszug <= einzug && !(payments||[]).some(p => p.tenantId === t.id)) return false;

    // Wenn kein Einzug-Datum → annehmen dass Mieter seit Anfang da ist (aber nur aktiv)
    if (!einzug) {
      return (t.status||"aktiv") === "aktiv";
    }
    
    // Einzug muss vor/im Monat liegen
    if (einzug > monatsEnde) return false;
    
    // Wenn Auszug-Datum existiert: muss ≥ Monatsanfang sein (sonst war Mieter vor diesem Monat schon weg)
    if (auszug && auszug < monatsStart) return false;
    
    return true;
  });
  
  // Helper: Erwartete Miete pro Mieter aus Room (auch für archivierte Mieter - über Mieter-Daten)
  // Soll = Bruttomiete (Zimmer-Miete + 25 CHF Strom) + Kautions-Servicegebühr (falls vorhanden)
  function getExpectedMiete(tenant) {
    let bruttomiete = 0;
    
    // Zuerst aktuelles Zimmer (für aktive Mieter)
    let room = rooms.find(r => r.tenantId === tenant.id);
    // Fallback: tenant.roomId (für archivierte Mieter - Zimmer-Verknüpfung ist gelöst aber roomId bleibt evtl)
    if (!room && tenant.roomId) {
      room = rooms.find(r => r.id === tenant.roomId);
    }
    // Wohnung (unmoebliert): Nebenkosten gemaess bisherigem Mietvertrag, Strom pauschal pro Person
    const _apt = room ? (apts||[]).find(a => a.id === room.aptId) : null;
    const _wohn = !!(_apt && _apt.vermietungsart === "wohnung");
    const _pers = +tenant.personen || 1;
    const _strom = (tenant.strom!=null && tenant.strom!=="") ? +tenant.strom : (_wohn ? 25 * _pers : 25);
    if (tenant.mietzins != null && tenant.mietzins !== "") {
      // Fixer Mietzins des Mieters hat immer Vorrang (Zimmer kann fuer Nachmieter neu bepreist sein)
      bruttomiete = (+tenant.mietzins || 0) + _strom;
    } else if (room) {
      bruttomiete = (+room.miete || 0) + _strom;
    } else if (tenant.kautionBetrag && tenant.kautionMonate) {
      // Letzter Fallback für archivierte: aus Kautions-Betrag rückrechnen
      bruttomiete = Math.round((+tenant.kautionBetrag || 0) / (+tenant.kautionMonate || 3));
    }
    
    // Monatliche Moeblierungsgebuehr dazurechnen (nur wenn moebliert und Modus monatlich)
    const istMoebliert = tenant.moebliert === true || tenant.moebliert === "ja";
    const moeblMonatlich = moeblVon(tenant);
    // Kautions-Servicegebühr (monatlicher Aufpreis bei reduzierter Kaution) gehoert in den monatlichen Soll
    const aufschlag = feeVon(tenant);
    return bruttomiete + aufschlag + moeblMonatlich;
  }
  
  // Helper: Payment für Mieter + Monat
  function getPayment(tenantId) {
    return payments.find(p => p.tenantId === tenantId && p.jahr === jahr && p.monat === monat);
  }
  
  // Daten zusammenstellen
  const rows = activeTenants.map(t => {
    const p = getPayment(t.id);
    let soll = getExpectedMiete(t);
    const room = rooms.find(r => r.tenantId === t.id) || rooms.find(r => r.id === t.roomId);
    const apt = room ? apts.find(a => a.id === room.aptId) : null;
    // Teilmonat: halbmonatlich. Einzug ab dem 15. bzw. Auszug bis und mit dem 15. -> halbe Miete
    const einzug = parseDate(t.einzug);
    const auszug = parseDate(t.auszug);
    const einzugInMonth = einzug && einzug >= monatsStart && einzug <= monatsEnde;
    const auszugInMonth = auszug && auszug >= monatsStart && auszug <= monatsEnde;
    const isPartialMonth = einzugInMonth || auszugInMonth;
    let partialNote = "";
    if (isPartialMonth) {
      const half = (einzugInMonth && einzug.getDate() >= 15) || (auszugInMonth && auszug.getDate() <= 15);
      if (half) soll = soll / 2;
      const parts = [];
      if (einzugInMonth) parts.push(`Einzug ${fmtDateDE(t.einzug)}`);
      if (auszugInMonth) parts.push(`Auszug ${fmtDateDE(t.auszug)}`);
      partialNote = `${parts.join(" · ")}${half ? " · halbe Miete" : " · voller Monat"}`;
    }
    const uebertrag = +(p?.uebertrag) || 0;
    // Mahngebuehr der 2. Mahnung gehoert zum offenen Betrag (ausser sie wurde erlassen: mahnung_fee = 0)
    const gebuehr = (p?.mahnung2SentAt && p?.status !== "erlassen") ? (p?.mahnungFee != null && p?.mahnungFee !== "" ? +p.mahnungFee : 30) : 0;
    const effektivSoll = soll + uebertrag + gebuehr;
    const ist = (p?.betragIst != null && p?.betragIst !== "") ? +p.betragIst : null;
    // Differenz gegen den tatsaechlich gebuchten Soll der Zahlung (nicht gegen den neu berechneten),
    // damit spaetere Miet-/Zimmeraenderungen alte, korrekt bezahlte Monate nicht faelschlich als Fehlbetrag markieren.
    const paySoll = (p?.betragSoll != null && p?.betragSoll !== "") ? +p.betragSoll : null;
    const diff = (ist != null) ? (ist - effektivSoll) : null; // <0 = zu wenig, >0 = zu viel (immer gegen effektiven Soll)
    return {
      tenant: t,
      room,
      apt,
      payment: p,
      baseSoll: soll,
      uebertrag,
      gebuehr,
      soll: effektivSoll,
      ist,
      diff,
      status: p?.status || "offen",
      isPartialMonth,
      partialNote,
    };
  });
  
  const filtered = rows
    .filter(r => `${r.tenant.vorname} ${r.tenant.nachname} ${r.tenant.id}`.toLowerCase().includes(search.toLowerCase()))
    .filter(r => !showOnlyOffen || r.status === "offen")
    .sort((a,b) => {
      // Zahlungen mit Differenz zuoberst, dann offene, dann nach ID
      const aDiff = (a.diff != null && a.diff !== 0) || a.status === "teilweise";
      const bDiff = (b.diff != null && b.diff !== 0) || b.status === "teilweise";
      if (aDiff !== bDiff) return aDiff ? -1 : 1;
      if (a.status !== b.status) {
        const order = {offen:0, teilweise:1, bezahlt:2, erlassen:3};
        return (order[a.status]||0) - (order[b.status]||0);
      }
      return natSort(a.tenant.id, b.tenant.id);
    });
  
  // Statistiken - IMMER mit Strom + Servicegebühr (getExpectedMiete liefert das schon)
  // Soll-Total = ALLE Mieter dieses Monats (egal welcher Status)
  const totalSoll = rows.reduce((s,r) => s + r.soll, 0);
  // Bezahlt-Total = was tatsächlich reingekommen ist
  // WICHTIG: Pro Mieter wird auf das aktuelle SOLL gecapped - so kann eine Überzahlung von Mieter A
  // nicht eine fehlende Zahlung von Mieter B "ausgleichen" (sonst wäre Marge IST > Marge SOLL)
  const totalBezahlt = rows.reduce((s,r) => {
    if (r.status === "bezahlt") {
      const ist = (+r.payment?.betragIst > 0 ? +r.payment.betragIst : r.soll);
      return s + Math.min(ist, r.soll);
    }
    if (r.status === "teilweise") {
      const ist = +r.payment?.betragIst || 0;
      return s + Math.min(ist, r.soll);
    }
    return s;
  }, 0);
  // Offen-Total = was noch fehlt
  const totalOffen = rows.reduce((s,r) => {
    if (r.status === "offen") return s + r.soll;
    if (r.status === "teilweise") return s + Math.max(0, r.soll - (+r.payment?.betragIst || 0));
    return s;
  }, 0);
  const anzahlBezahlt = rows.filter(r => r.status === "bezahlt").length;
  const anzahlOffen = rows.filter(r => r.status === "offen").length;
  const anzahlTeilweise = rows.filter(r => r.status === "teilweise").length;
  const unterzahler = rows.filter(r => r.ist != null && r.diff < 0);
  
  // AUSGABEN: Hauptmiete für alle Wohnungen die im aktuellen Monat aktive Mieter haben
  // (also Wohnungen die wir bezahlen müssen weil sie vermietet sind)
  const aptIdsInUse = [...new Set(rows.map(r => r.apt?.id).filter(Boolean))];
  const totalAusgaben = aptIdsInUse.reduce((s, aptId) => {
    const apt = apts.find(a => a.id === aptId);
    return s + (+apt?.miete || 0);
  }, 0);
  
  // MARGE: Eingenommen (was tatsächlich da ist) minus Ausgaben (was wir an Hauptvermieter zahlen)
  const margeIst = totalBezahlt - totalAusgaben;
  // Erwartete Marge wenn alle bezahlen
  const margeSoll = totalSoll - totalAusgaben;
  
  function parseSwissDate(str) {
    if (!str) return null;
    const parts = str.trim().split(".");
    if (parts.length !== 3) return null;
    const [d, m, y] = parts.map(Number);
    if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
    return new Date(y, m - 1, d);
  }
  
  function calcProrataBetrag(einzugStr, jahr, monat, bruttomiete) {
    const einzug = parseSwissDate(einzugStr);
    if (!einzug) return null;
    // Einzug muss im gleichen Monat sein
    if (einzug.getFullYear() !== jahr || einzug.getMonth() + 1 !== monat) return null;
    const daysInMonth = new Date(jahr, monat, 0).getDate();
    const einzugTag = einzug.getDate();
    const verbleibendTage = daysInMonth - einzugTag + 1;
    if (verbleibendTage >= daysInMonth) return null; // voller Monat, keine Anpassung noetig
    const proTag = bruttomiete / daysInMonth;
    const betrag = Math.round(proTag * verbleibendTage * 20) / 20; // gerundet auf 5 Rappen
    return { betrag, verbleibendTage, daysInMonth, einzug };
  }
  
  async function toggleBezahlt(row) {
    const newStatus = row.status === "bezahlt" ? "offen" : "bezahlt";
    await upsertPayment({
      tenantId: row.tenant.id,
      jahr,
      monat,
      betragSoll: row.baseSoll,
      betragIst: newStatus === "bezahlt" ? row.soll : null,
      status: newStatus,
      bezahltAm: newStatus === "bezahlt" ? new Date().toISOString().slice(0,10) : null,
      bezahltVia: newStatus === "bezahlt" ? (row.payment?.bezahltVia || "Überweisung") : null,
      markedBy: row.tenant.owner || null,
      bemerkung: row.payment?.bemerkung || null,
    });
  }
  
  function sendNextMahnung(row) {
    const p = row.payment;
    
    if (p?.mahnung1SentAt && p?.mahnung2SentAt) {
      const d1 = new Date(p.mahnung1SentAt).toLocaleDateString("de-CH");
      const d2 = new Date(p.mahnung2SentAt).toLocaleDateString("de-CH");
      alert(`Beide Mahnungen wurden bereits gesendet:\n• 1. Mahnung: ${d1}\n• 2. Mahnung: ${d2}\n\nFür weitere Schritte (Betreibung) bitte manuell vorgehen.`);
      return;
    }
    
    if (!row.tenant.email) {
      alert(`Keine Email-Adresse für ${row.tenant.vorname} ${row.tenant.nachname} hinterlegt.`);
      return;
    }
    
    const stufe = p?.mahnung1SentAt ? 2 : 1;
    const monatLabel = `${MONATS_NAMEN[monat-1]} ${jahr}`;
    
    // Modal öffnen (statt direkt senden)
    const _offen = Math.max(0, (row.soll||0) - (+(row.payment&&row.payment.betragIst)||0));
    setMahnBetrag(_offen.toFixed(2)); setMahnBetragStart(_offen.toFixed(2));
    setMahnungConfirm({ row, stufe, monatLabel });
    setMahnVorschau(null);
    if (row.payment?.id) {
      setMahnVorschau({ laden: true });
      supabase.functions.invoke("send-mahnung", { body: { payment_id: row.payment.id, stufe, preview: true } }).then(({ data }) => {
        if (data && Array.isArray(data.posten)) { setMahnVorschau(data); const t = (+data.total_offen||0).toFixed(2); setMahnBetrag(t); setMahnBetragStart(t); }
        else setMahnVorschau(null);
      }).catch(() => setMahnVorschau(null));
    }
  }
  
  async function executeMahnung() {
    if (!mahnungConfirm) return;
    const { row, stufe } = mahnungConfirm;
    setMahnungConfirm(null);
    
    // Sicherstellen dass Payment existiert
    let paymentId = row.payment?.id;
    if (!paymentId) {
      paymentId = `PAY${row.tenant.id}-${jahr}-${String(monat).padStart(2,"0")}`;
      await upsertPayment({
        tenantId: row.tenant.id,
        jahr, monat,
        betragSoll: row.baseSoll,
        status: "offen",
        markedBy: row.tenant.owner || null,
      });
    }
    
    // Betrag nur mitschicken, wenn er von Hand angepasst wurde (sonst rechnet die Mail die Aufschluesselung selbst)
    const _geaendert = String(mahnBetrag) !== String(mahnBetragStart);
    await sendMahnung(paymentId, stufe, _geaendert ? (+mahnBetrag || undefined) : undefined);
  }
  
  function openDetails(row) {
    setEditingPayment({
      tenantId: row.tenant.id,
      tenant: row.tenant,
      jahr,
      monat,
      betragSoll: row.baseSoll,
      uebertrag: +(row.payment?.uebertrag) || 0,
      betragIst: row.payment?.betragIst || row.soll,
      istGespeichert: row.payment?.betragIst ?? null,
      bezahltAmGespeichert: row.payment?.bezahltAm ?? null,
      mahnung2SentAt: row.payment?.mahnung2SentAt || null,
      mahnungFee: row.payment?.mahnungFee,
      paymentStatus: row.payment?.status || null,
      status: row.status,
      bezahltAm: row.payment?.bezahltAm || new Date().toISOString().slice(0,10),
      bezahltVia: row.payment?.bezahltVia || "Überweisung",
      bemerkung: row.payment?.bemerkung || "",
    });
  }
  
  async function saveDetails() {
    await upsertPayment({
      ...editingPayment,
      markedBy: editingPayment.tenant?.owner || null,
    });
    setEditingPayment(null);
  }

  // Einen einzelnen Posten (z.B. Rest September) als bezahlt verbuchen:
  // Der Betrag wird beim Ursprungsmonat als bezahlt erfasst und aus dem Uebertrag aller Folgemonate bis zum aktuellen entfernt.
  async function postenBezahlt(x) {
    const ep = editingPayment; if (!ep) return;
    const label = x.frueher ? "Übertrag aus früheren Monaten" : `Rest ${MONATS_NAMEN[x.monat-1]} ${x.jahr}`;
    const eingabe = prompt(`${label}: wie viel wurde bezahlt? (CHF)`, String(x.betrag));
    if (eingabe == null) return;
    const amt = Math.round((+String(eingabe).replace(/'/g,"").replace(",", ".")||0)*100)/100;
    if (!(amt > 0) || amt > x.betrag + 0.009) { alert("Bitte einen Betrag zwischen 0 und " + x.betrag + " eingeben."); return; }
    const heute = new Date(); const datum = heute.toLocaleDateString("de-CH");
    const key = (j,m)=>j*12+(m-1);
    const kCur = key(ep.jahr, ep.monat);
    const kStart = x.frueher ? null : key(x.jahr, x.monat);
    try {
      if (!x.frueher) {
        const v = payments.find(p=>p.tenantId===ep.tenantId && p.jahr===x.jahr && p.monat===x.monat);
        if (v) await upsertPayment({ ...v, betragIst: Math.round(((+v.betragIst||0)+amt)*100)/100, bemerkung: [v.bemerkung, `Nachzahlung CHF ${amt} am ${datum}`].filter(Boolean).join(" · ") });
      }
      // Uebertrag in allen Zwischenmonaten reduzieren
      // Bei "fruehere Monate" ohne Datensatz wird nur der aktuelle Monat angepasst
      const zwischen = kStart == null ? [] : payments.filter(p=>p.tenantId===ep.tenantId && key(p.jahr,p.monat) > kStart && key(p.jahr,p.monat) < kCur && (+p.uebertrag||0) > 0);
      for (const w of zwischen) await upsertPayment({ ...w, uebertrag: Math.max(0, Math.round(((+w.uebertrag||0)-amt)*100)/100) });
      const neuUe = Math.max(0, Math.round(((+ep.uebertrag||0)-amt)*100)/100);
      const notiz = [ep.bemerkung, `${label}: CHF ${amt} bezahlt am ${datum}`].filter(Boolean).join(" · ");
      // Nur Uebertrag und Notiz aendern. "Bezahlt" des aktuellen Monats bleibt wie gespeichert (das Feld im Fenster ist nur vorausgefuellt).
      const cur = payments.find(p=>p.tenantId===ep.tenantId && p.jahr===ep.jahr && p.monat===ep.monat);
      await upsertPayment({ ...(cur||{}), tenantId: ep.tenantId, jahr: ep.jahr, monat: ep.monat, betragSoll: ep.betragSoll, betragIst: cur ? cur.betragIst : null, bezahltAm: cur ? cur.bezahltAm : null, status: cur ? cur.status : "offen", uebertrag: neuUe, bemerkung: notiz, markedBy: (cur && cur.markedBy) || ep.tenant?.owner || null });
      const gebuehrEP = gebuehrVon({ mahnung2SentAt: ep.mahnung2SentAt, mahnungFee: ep.mahnungFee, status: ep.status });
      const istAlt = cur && cur.betragIst != null && cur.betragIst !== "" ? +cur.betragIst : null;
      setEditingPayment({ ...ep, uebertrag: neuUe, bemerkung: notiz, betragIst: istAlt != null ? istAlt : Math.round(((+ep.betragSoll||0)+neuUe+gebuehrEP)*100)/100 });
      toast(`${label}: CHF ${amt} als bezahlt verbucht`);
    } catch (e) { alert("Fehler: " + (e.message || e)); }
  }
  async function gebuehrErlassen() {
    const ep = editingPayment; if (!ep) return;
    if (!confirm("Mahngebühr erlassen? Sie zählt dann nicht mehr zum offenen Betrag.")) return;
    const id = `PAY${ep.tenantId}-${ep.jahr}-${String(ep.monat).padStart(2,"0")}`;
    const { error } = await supabase.from("payments").update({ mahnung_fee: 0 }).eq("id", id);
    if (error) { alert("Fehler: " + error.message); return; }
    setEditingPayment({ ...ep, mahnungFee: 0, betragIst: (+ep.betragIst||0) });
    toast("Mahngebühr erlassen");
  }
  // Separat offenen Monat (ohne Uebertrag) als vollstaendig bezahlt markieren
  async function monatBezahlt(x) {
    const ep = editingPayment; if (!ep) return;
    const v = payments.find(p=>p.tenantId===ep.tenantId && p.jahr===x.jahr && p.monat===x.monat); if (!v) return;
    if (!confirm(`${MONATS_NAMEN[x.monat-1]} ${x.jahr}: CHF ${x.betrag} als bezahlt markieren?`)) return;
    const voll = Math.round(((+v.betragSoll||0)+(+v.uebertrag||0)+gebuehrVon(v))*100)/100;
    await upsertPayment({ ...v, betragIst: voll, status: "bezahlt", bezahltAm: v.bezahltAm || new Date().toISOString().slice(0,10), bemerkung: [v.bemerkung, `Rest CHF ${x.betrag} nachbezahlt am ${new Date().toLocaleDateString("de-CH")}`].filter(Boolean).join(" · ") });
  }

  async function carryOverToNextMonth() {
    const ep = editingPayment;
    const sollEff = (+ep.betragSoll||0) + (+ep.uebertrag||0) + gebuehrVon({ mahnung2SentAt: ep.mahnung2SentAt, mahnungFee: ep.mahnungFee, status: ep.status });
    const ist = +ep.betragIst||0;
    const rest = Math.round((sollEff - ist) * 100) / 100; // positiv = Nachzahlung, negativ = Guthaben
    if (rest === 0) { alert("Keine offene Differenz zum Übertragen."); return; }
    // Aktuellen Monat als bezahlt abschliessen (Ist-Betrag festgehalten, Differenz bleibt sichtbar)
    await upsertPayment({ ...ep, status: "bezahlt", bezahltAm: ep.bezahltAm || new Date().toISOString().slice(0,10), markedBy: ep.tenant?.owner || null });
    // Nächster Monat
    let nMonat = ep.monat + 1, nJahr = ep.jahr;
    if (nMonat > 12) { nMonat = 1; nJahr += 1; }
    const existing = payments.find(x => x.tenantId===ep.tenantId && x.jahr===nJahr && x.monat===nMonat);
    const neuUebertrag = Math.round(((+existing?.uebertrag||0) + rest) * 100) / 100;
    await upsertPayment({ ...(existing||{}), tenantId: ep.tenantId, jahr: nJahr, monat: nMonat, uebertrag: neuUebertrag, status: existing?.status||"offen", markedBy: ep.tenant?.owner||null });
    alert(`Als bezahlt markiert. CHF ${Math.abs(rest).toLocaleString("de-CH",{minimumFractionDigits:2,maximumFractionDigits:2})} ${rest>0?"Nachzahlung":"Guthaben"} als Übertrag in ${MONATS_NAMEN[nMonat-1]} ${nJahr} übernommen.`);
    setEditingPayment(null);
  }
  
  // Monats-Navigation
  function changeMonth(delta) {
    let m = monat + delta;
    let j = jahr;
    if (m > 12) { m = 1; j++; }
    if (m < 1) { m = 12; j--; }
    setMonat(m); setJahr(j);
  }
  
  return (
    <div style={{padding:"22px 26px",maxWidth:1280,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,flexWrap:"wrap",gap:12}}>
        <div>
          <div className="pt">Zahlungen</div>
          <div className="ps">Monatliche Mietzahlungen tracken</div>
        </div>
        {/* MONATS-NAVIGATION */}
        <div className="zahlungen-monatsnav" style={{display:"flex",alignItems:"center",gap:8,background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"6px 8px",flexWrap:"wrap",maxWidth:"100%",boxSizing:"border-box"}}>
          <button onClick={()=>changeMonth(-1)} className="btn btn-g btn-sm" style={{minWidth:32,padding:"4px 8px"}}>‹</button>
          <div style={{width:132,minWidth:132,flexShrink:0,textAlign:"center",fontWeight:600,fontSize:14}}>{MONATS_NAMEN[monat-1]} {jahr}</div>
          <button onClick={()=>changeMonth(1)} className="btn btn-g btn-sm" style={{minWidth:32,padding:"4px 8px"}}>›</button>
          <button onClick={()=>{const pm = getPaymentMonth(new Date()); setMonat(pm.monat); setJahr(pm.jahr);}} className="btn btn-g btn-sm" style={{fontSize:11,flex:"1 1 100%"}}>Aktueller Monat</button>
        </div>
      </div>
      
      {unterzahler.length > 0 && (
        <div style={{background:"#fdf0ec",border:"1px solid #e8c4b8",borderRadius:8,padding:"9px 14px",marginTop:12,fontSize:12,color:"#8a3a2e",display:"flex",alignItems:"flex-start",gap:8,flexWrap:"wrap",lineHeight:1.5}}>
          <span style={{fontWeight:600,whiteSpace:"nowrap"}}>⚠ Zu wenig bezahlt:</span>
          <span>{unterzahler.map(r => `${r.tenant.vorname} ${r.tenant.nachname} (CHF ${Math.abs(r.diff).toLocaleString("de-CH",{minimumFractionDigits:2,maximumFractionDigits:2})} fehlt)`).join(" · ")}</span>
        </div>
      )}
      
      {/* STAT-CARDS: Status-Übersicht */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(min(180px, 100%), 1fr))",gap:12,margin:"18px 0 10px"}}>
        <div className="card" style={{margin:0}}>
          <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:6,fontWeight:500}}>Bezahlt</div>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,color:"#5a6e4a"}}>{anzahlBezahlt} <span style={{fontSize:13,color:"#8a8174",fontWeight:400}}>/ {rows.length}</span></div>
          <div style={{fontSize:12,color:"#5a6e4a",marginTop:4}}>+ CHF {totalBezahlt.toLocaleString("de-CH", {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
        </div>
        <div className="card" style={{margin:0}}>
          <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:6,fontWeight:500}}>Offen</div>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,color:anzahlOffen>0?"#9b4a3e":"#5a6e4a"}}>{anzahlOffen}</div>
          <div style={{fontSize:12,color:anzahlOffen>0?"#9b4a3e":"#8a8174",marginTop:4}}>CHF {totalOffen.toLocaleString("de-CH", {minimumFractionDigits:2, maximumFractionDigits:2})} ausstehend</div>
        </div>
        <div className="card" style={{margin:0}}>
          <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:6,fontWeight:500}}>Soll-Total</div>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,color:"#1a1814"}}>CHF {totalSoll.toLocaleString("de-CH", {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
          <div style={{fontSize:11,color:"#8a8174",marginTop:4}}>inkl. Strom + Servicegebühr</div>
        </div>
        <div className="card" style={{margin:0}}>
          <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:6,fontWeight:500}}>Quote</div>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,color:"#1a1814"}}>{rows.length>0?Math.round((anzahlBezahlt/rows.length)*100):0}%</div>
          <div style={{width:"100%",height:6,background:"#e8e3d8",borderRadius:3,marginTop:6,overflow:"hidden"}}>
            <div style={{width:`${rows.length>0?(anzahlBezahlt/rows.length)*100:0}%`,height:"100%",background:"#5a6e4a",transition:"width .3s"}}/>
          </div>
        </div>
      </div>
      
      {/* STAT-CARDS: Finanz-Übersicht */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(min(220px, 100%), 1fr))",gap:12,marginBottom:18}}>
        <div className="card" style={{margin:0,background:"#f5f8f1",borderColor:"#d4ddc8"}}>
          <div style={{fontSize:9.5,color:"#5a6e4a",textTransform:"uppercase",letterSpacing:".25em",marginBottom:6,fontWeight:500}}>💰 Eingenommen</div>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:24,color:"#3a5230"}}>CHF {totalBezahlt.toLocaleString("de-CH", {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
          <div style={{fontSize:11,color:"#5a6e4a",marginTop:4}}>tatsächlich auf Konto · {totalSoll>0?Math.min(100,Math.round((totalBezahlt/totalSoll)*100)):0}% vom Soll</div>
        </div>
        <div className="card" style={{margin:0}}>
          <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:6,fontWeight:500}}>📤 Ausgaben</div>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:24,color:"#1a1814"}}>CHF {totalAusgaben.toLocaleString("de-CH", {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
          <div style={{fontSize:11,color:"#8a8174",marginTop:4}}>Hauptmieten {aptIdsInUse.length} Wohnung{aptIdsInUse.length!==1?"en":""}</div>
        </div>
        <div className="card" style={{margin:0,background:margeIst>=0?"#f5f8f1":"#fbeae6",borderColor:margeIst>=0?"#d4ddc8":"#e8c5be"}}>
          <div style={{fontSize:9.5,color:margeIst>=0?"#5a6e4a":"#9b4a3e",textTransform:"uppercase",letterSpacing:".25em",marginBottom:6,fontWeight:500}}>📈 Marge (Ist)</div>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:24,color:margeIst>=0?"#3a5230":"#7a3a2e"}}>{margeIst>=0?"+":""}CHF {margeIst.toLocaleString("de-CH", {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
          <div style={{fontSize:11,color:margeIst>=0?"#5a6e4a":"#9b4a3e",marginTop:4}}>Eingenommen − Ausgaben</div>
        </div>
        <div className="card" style={{margin:0}}>
          <div style={{fontSize:9.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".25em",marginBottom:6,fontWeight:500}}>🎯 Marge (Soll)</div>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:24,color:margeSoll>=0?"#1a1814":"#9b4a3e"}}>{margeSoll>=0?"+":""}CHF {margeSoll.toLocaleString("de-CH", {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
          <div style={{fontSize:11,color:"#8a8174",marginTop:4}}>wenn alle bezahlen</div>
        </div>
      </div>
      
      {/* SUCHE + FILTER */}
      <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
        <input className="fi" type="text" placeholder="Suche Mieter…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:"1 1 220px",maxWidth:320}}/>
        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#4a4439",cursor:"pointer"}}>
          <input type="checkbox" checked={showOnlyOffen} onChange={e=>setShowOnlyOffen(e.target.checked)}/>
          Nur offene zeigen
        </label>
      </div>
      
      {/* TABELLE */}
      <div className="card" style={{margin:0,padding:0,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table className="finance-table" style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{borderBottom:"1px solid #e8e3d8",background:"#fefcf7"}}>
                <th style={{textAlign:"left",padding:"12px 14px",fontSize:10,letterSpacing:".15em",textTransform:"uppercase",color:"#8a8174",fontWeight:600}}>Mieter</th>
                <th style={{textAlign:"left",padding:"12px 10px",fontSize:10,letterSpacing:".15em",textTransform:"uppercase",color:"#8a8174",fontWeight:600}}>Zimmer</th>
                <th style={{textAlign:"right",padding:"12px 10px",fontSize:10,letterSpacing:".15em",textTransform:"uppercase",color:"#8a8174",fontWeight:600}}>Soll</th>
                <th style={{textAlign:"center",padding:"12px 10px",fontSize:10,letterSpacing:".15em",textTransform:"uppercase",color:"#8a8174",fontWeight:600}}>Status</th>
                <th style={{textAlign:"right",padding:"12px 14px",fontSize:10,letterSpacing:".15em",textTransform:"uppercase",color:"#8a8174",fontWeight:600}}>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} style={{textAlign:"center",padding:30,color:"#8a8174",fontStyle:"italic"}}>Keine Mieter gefunden</td></tr>
              ) : filtered.map(row => {
                const isPaid = row.status === "bezahlt";
                const isErlassen = row.status === "erlassen";
                const hatDiff = (row.diff != null && row.diff !== 0) || row.status === "teilweise";
                return (
                  <tr key={row.tenant.id} style={{borderBottom:"1px solid #f0ebe1",background:hatDiff?"#fdf1e3":isPaid?"#f5f8f1":isErlassen?"#fefcf7":"transparent"}}>
                    <td style={{padding:"12px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <Av name={row.tenant.vorname} size={32}/>
                        <div>
                          <div style={{fontSize:13,fontWeight:600,color:"#1a1814",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                            <span>{row.tenant.vorname} {row.tenant.nachname}</span>
                            {row.tenant.status==="archiviert" && <span style={{fontSize:9,fontWeight:600,padding:"1.5px 6px",borderRadius:3,background:"#e8e3d8",color:"#5a5249",letterSpacing:".05em"}}>📦 ARCHIV</span>}
                            {row.isPartialMonth && <span style={{fontSize:9,fontWeight:600,padding:"1.5px 6px",borderRadius:3,background:"#fdf2e0",color:"#7a5c3c",letterSpacing:".05em"}}>TEILMONAT</span>}
                          </div>
                          <div style={{fontSize:10.5,color:"#8a8174"}}>{row.tenant.id}{row.tenant.owner && ` · 👤 ${row.tenant.owner}`}{row.partialNote && ` · ${row.partialNote}`}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{padding:"12px 10px",fontSize:11.5,color:"#4a4439"}}>{row.room?.id || "-"}<div style={{fontSize:10.5,color:"#8a8174"}}>{row.apt?.adresse || ""}</div></td>
                    <td style={{padding:"12px 10px",textAlign:"right",fontSize:13,fontWeight:500,color:"#1a1814"}}>
                      CHF {row.soll.toLocaleString("de-CH", {minimumFractionDigits:2, maximumFractionDigits:2})}
                      {(()=>{ const z = zusammensetzung(row.tenant.id, jahr, monat, row.baseSoll, row.uebertrag, row.gebuehr); const zeigen = row.uebertrag!==0 || row.gebuehr>0 || z.andere.length>0; if (!zeigen) return null; return (
                        <div style={{marginTop:3,fontSize:10,lineHeight:1.45,textAlign:"right"}}>
                          {(row.uebertrag!==0 || row.gebuehr>0) && z.posten.map((x,i)=>(<div key={i} style={{color:x.aktuell?"#8a8174":x.guthaben?"#3a5230":"#8a3a2e",fontWeight:x.aktuell?400:500,whiteSpace:"nowrap"}}>{postenText(x)}: {chfK(x.betrag)}</div>))}
                          {z.andere.length>0 && <div style={{color:"#8a3a2e",fontWeight:600,marginTop:2,whiteSpace:"nowrap"}}>⚠ zusätzlich offen: {z.andere.map(x=>`${postenText(x)} ${chfK(x.betrag)}`).join(", ")}</div>}
                        </div>
                      ); })()}
                      {(+row.tenant.kautionAufschlag||0)>0 && (
                        <div style={{fontSize:10,color:"#8a8174",fontWeight:400,marginTop:2}}>inkl. +{(+row.tenant.kautionAufschlag).toLocaleString("de-CH", {minimumFractionDigits:2, maximumFractionDigits:2})} Servicegebühr</div>
                      )}
                      {(row.tenant.moebliert===true||row.tenant.moebliert==="ja") && row.tenant.moeblierungModus==="monatlich" && (+row.tenant.moeblierungPauschale||0)>0 && (
                        <div style={{fontSize:10,color:"#8a8174",fontWeight:400,marginTop:2}}>inkl. +{(+row.tenant.moeblierungPauschale).toLocaleString("de-CH", {minimumFractionDigits:2, maximumFractionDigits:2})} Möblierung</div>
                      )}
                    </td>
                    <td style={{padding:"12px 10px",textAlign:"center"}}>
                      {row.status === "bezahlt" && <span style={{display:"inline-block",padding:"3px 9px",borderRadius:11,background:"#e8efde",color:"#3a5230",fontSize:10.5,fontWeight:600,letterSpacing:".03em"}}>✓ Bezahlt</span>}
                      {row.status === "offen" && <span style={{display:"inline-block",padding:"3px 9px",borderRadius:11,background:"#fbeae6",color:"#8a3a2e",fontSize:10.5,fontWeight:600,letterSpacing:".03em"}}>Offen</span>}
                      {row.status === "teilweise" && <span style={{display:"inline-block",padding:"3px 9px",borderRadius:11,background:"#fdf2e0",color:"#7a5c3c",fontSize:10.5,fontWeight:600,letterSpacing:".03em"}}>Teilweise</span>}
                      {row.status === "erlassen" && <span style={{display:"inline-block",padding:"3px 9px",borderRadius:11,background:"#e8e3d8",color:"#5a5249",fontSize:10.5,fontWeight:600,letterSpacing:".03em"}}>Erlassen</span>}
                      {row.ist!=null && row.diff!=null && row.diff!==0 && (
                        <div style={{fontSize:10,fontWeight:600,marginTop:4,color:row.diff<0?"#c0392b":"#2f6b3a"}}>
                          CHF {row.ist.toLocaleString("de-CH",{minimumFractionDigits:2,maximumFractionDigits:2})} bezahlt · {row.diff<0?`${Math.abs(row.diff).toLocaleString("de-CH",{minimumFractionDigits:2,maximumFractionDigits:2})} zu wenig`:`${row.diff.toLocaleString("de-CH",{minimumFractionDigits:2,maximumFractionDigits:2})} zu viel`}
                        </div>
                      )}
                      {row.payment?.mahnung1SentAt && row.status !== "bezahlt" && (
                        <div style={{fontSize:9.5,color:"#9b4a3e",marginTop:4,letterSpacing:".02em"}}>
                          ⚠ 1. Mahnung {new Date(row.payment.mahnung1SentAt).toLocaleDateString("de-CH",{day:"2-digit",month:"2-digit"})}
                        </div>
                      )}
                      {row.payment?.mahnung2SentAt && row.status !== "bezahlt" && (
                        <div style={{fontSize:9.5,color:"#7a3a2e",fontWeight:600,marginTop:2,letterSpacing:".02em"}}>
                          🚨 2. Mahnung {new Date(row.payment.mahnung2SentAt).toLocaleDateString("de-CH",{day:"2-digit",month:"2-digit"})}
                        </div>
                      )}
                    </td>
                    <td style={{padding:"12px 14px",textAlign:"right"}}>
                      <div style={{display:"inline-flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
                        <button onClick={()=>toggleBezahlt(row)} className={`btn btn-sm ${isPaid?"btn-g":"btn-p"}`} style={{fontSize:11,padding:"5px 10px"}}>
                          {isPaid ? "↺ Zurücksetzen" : "✓ Bezahlt"}
                        </button>
                        {!isErlassen && (((row.soll||0) - (+(row.payment&&row.payment.betragIst)||0)) > 0.01) && (() => {
                          const both = row.payment?.mahnung1SentAt && row.payment?.mahnung2SentAt;
                          const nextStufe = row.payment?.mahnung1SentAt ? 2 : 1;
                          const label = both ? "✓ Mahnungen" : (nextStufe === 1 ? "⚠ 1. Mahnung" : "🚨 2. Mahnung");
                          const bg = both ? "#e8e3d8" : (nextStufe === 1 ? "#fdf2e0" : "#fbeae6");
                          const color = both ? "#5a5249" : (nextStufe === 1 ? "#7a5c3c" : "#8a3a2e");
                          const border = both ? "1px solid #d8d0c0" : (nextStufe === 1 ? "1px solid #e8c89c" : "1px solid #e8c5be");
                          return (
                            <button onClick={()=>sendNextMahnung(row)} disabled={both} title={both ? "Beide Mahnungen wurden bereits gesendet" : `${nextStufe}. Mahnung per Email senden`} style={{fontSize:11,padding:"5px 10px",background:bg,color:color,border:border,borderRadius:6,cursor:both?"not-allowed":"pointer",opacity:both?0.6:1,fontWeight:500}}>
                              {label}
                            </button>
                          );
                        })()}
                        <button onClick={()=>openDetails(row)} className="btn btn-g btn-sm" style={{fontSize:11,padding:"5px 10px"}} title="Zahlung bearbeiten (Betrag anpassen, Status, Bemerkung)">✏ Bearbeiten</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* HINWEIS UNTEN */}
      <div style={{marginTop:18,padding:"12px 16px",background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,fontSize:11.5,color:"#6a6358",lineHeight:1.55}}>
        💡 <strong>Hinweis:</strong> Manuelles Tracking - Klicke "✓ Bezahlt" sobald eine Zahlung auf dem Konto eingeht. Für Details (anderes Datum, andere Zahlungsart, Bemerkung) auf "⋯" klicken. 
        Spätere Optimierung möglich: Bank-CSV-Import oder Auto-Reminder per WhatsApp/Email für überfällige Zahlungen.
      </div>
      
      {/* MAHNUNG-CONFIRM-MODAL */}
      {mahnungConfirm && (
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setMahnungConfirm(null)}>
          <div className="modal" style={{width:560,maxHeight:"90vh",overflowY:"auto"}}>
            <div className="mt" style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <span style={{fontSize:24}}>{mahnungConfirm.stufe === 1 ? "⚠" : "🚨"}</span>
              <span>{mahnungConfirm.stufe}. Mahnung versenden</span>
            </div>
            
            <div style={{background:mahnungConfirm.stufe===1?"#fdf2e0":"#fbeae6",border:`1px solid ${mahnungConfirm.stufe===1?"#e8c89c":"#e8c5be"}`,borderRadius:8,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontSize:10.5,fontWeight:600,color:mahnungConfirm.stufe===1?"#7a5c3c":"#8a3a2e",marginBottom:4,letterSpacing:".05em",textTransform:"uppercase"}}>
                Bitte sorgfältig prüfen
              </div>
              <div style={{fontSize:12.5,color:"#4a4439",lineHeight:1.55}}>
                Diese Aktion sendet eine Email direkt an den Mieter und kann nicht rückgängig gemacht werden.
              </div>
            </div>
            
            <div style={{background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,padding:"14px 18px",marginBottom:16}}>
              <div style={{display:"grid",gridTemplateColumns:"130px 1fr",gap:"8px 12px",fontSize:13,alignItems:"baseline"}}>
                <div style={{color:"#8a8174"}}>Empfänger</div>
                <div style={{color:"#1a1814",fontWeight:600}}>{mahnungConfirm.row.tenant.vorname} {mahnungConfirm.row.tenant.nachname}</div>
                <div style={{color:"#8a8174"}}>Email</div>
                <div style={{color:"#1a1814",wordBreak:"break-all"}}>{mahnungConfirm.row.tenant.email}</div>
                <div style={{color:"#8a8174"}}>Monat</div>
                <div style={{color:"#1a1814"}}>{mahnVorschau && mahnVorschau.monat ? mahnVorschau.monat : mahnungConfirm.monatLabel}</div>
                {mahnVorschau && mahnVorschau.laden && (<><div style={{color:"#8a8174"}}>Aufstellung</div><div style={{color:"#8a8174",fontSize:12}}>wird berechnet …</div></>)}
                {mahnVorschau && Array.isArray(mahnVorschau.posten) && mahnVorschau.posten.length>0 && (<>
                  <div style={{color:"#8a8174"}}>Aufstellung</div>
                  <div style={{fontSize:12.5}}>
                    {mahnVorschau.posten.map((x,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",gap:10,padding:"3px 0",borderTop:i?"1px solid #f0eadd":"none"}}>
                      <span style={{color:"#4a4439"}}>{x.label==="frueher"?"Übertrag aus früheren Monaten":x.label==="guthaben"?"Guthaben aus Vormonat":`${MONATS_NAMEN[x.monat-1]} ${x.jahr}`}{x.rest && <span style={{color:"#8a8174",fontSize:11}}> (Rest)</span>}</span>
                      <span style={{fontWeight:600,whiteSpace:"nowrap"}}>{x.betrag<0?"− ":""}CHF {Math.abs(+x.betrag).toLocaleString("de-CH",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                    </div>))}
                    {mahnVorschau.posten.length>1 && <div style={{fontSize:11,color:"#7a5c3c",marginTop:4}}>Die Mail listet diese Monate einzeln auf.</div>}
                  </div>
                </>)}
                <div style={{color:"#8a8174"}}>Offener Betrag</div>
                <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,color:"#8a8174"}}>CHF</span><input type="number" step="0.01" value={mahnBetrag} onChange={e=>setMahnBetrag(e.target.value)} style={{width:110,padding:"5px 8px",border:"1px solid #d8d0c0",borderRadius:6,fontSize:13,fontWeight:600,fontFamily:"inherit"}}/>{String(mahnBetrag)!==String(mahnBetragStart) && <span style={{fontSize:11,color:"#9b4a3e"}}>angepasst: Mail ohne Aufstellung</span>}</div>
                {mahnungConfirm.stufe === 2 && (
                  <>
                    <div style={{color:"#8a8174"}}>Mahnungsgebühr</div>
                    <div style={{color:"#9b4a3e",fontWeight:600}}>+ CHF 30</div>
                    <div style={{color:"#1a1814",fontWeight:700,borderTop:"1.5px solid #1a1814",paddingTop:10,marginTop:4}}>Total fällig</div>
                    <div style={{color:"#1a1814",fontWeight:700,fontSize:15,borderTop:"1.5px solid #1a1814",paddingTop:10,marginTop:4}}>CHF {((+mahnBetrag||0) + 30).toLocaleString("de-CH", {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
                  </>
                )}
                {mahnungConfirm.row.payment?.mahnung1SentAt && (
                  <>
                    <div style={{color:"#8a8174"}}>1. Mahnung am</div>
                    <div style={{color:"#4a4439"}}>{new Date(mahnungConfirm.row.payment.mahnung1SentAt).toLocaleDateString("de-CH")}</div>
                  </>
                )}
              </div>
            </div>
            
            <div style={{background:"#faf8f3",borderRadius:6,padding:"12px 16px",marginBottom:18,fontSize:12,color:"#4a4439",lineHeight:1.55}}>
              {mahnungConfirm.stufe === 1 ? (
                <span><strong>Inhalt:</strong> Freundliche Erinnerung an ausstehende Miete, Frist 10 Tage, mit Hinweis auf CHF 30 Gebühr bei 2. Mahnung.</span>
              ) : (
                <span><strong>Inhalt:</strong> Bestimmter Ton, inkl. CHF 30 Gebühr aufgeschlüsselt, 10-Tage-Frist, mit Hinweis auf weitere rechtliche Schritte (Betreibung).</span>
              )}
            </div>
            
            <div style={{display:"flex",gap:10,justifyContent:"flex-end",flexWrap:"wrap"}}>
              <button onClick={()=>setMahnungConfirm(null)} className="btn btn-g" style={{padding:"10px 22px",fontSize:13}}>
                Abbrechen
              </button>
              <button onClick={executeMahnung} style={{padding:"10px 22px",fontSize:13,background:mahnungConfirm.stufe===1?"#7a5c3c":"#8a3a2e",color:"#fff",border:"none",borderRadius:6,fontWeight:600,cursor:"pointer"}}>
                ✉ {mahnungConfirm.stufe}. Mahnung jetzt senden
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* DETAIL-MODAL */}
      {editingPayment && (
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setEditingPayment(null)}>
          <div className="modal" style={{width:520,maxHeight:"90vh",overflowY:"auto"}}>
            <div className="mt">💰 Zahlung bearbeiten</div>
            <div style={{fontSize:13,color:"#4a4439",marginBottom:14}}>
              <strong>{editingPayment.tenant.vorname} {editingPayment.tenant.nachname}</strong> ({editingPayment.tenant.id}) · {MONATS_NAMEN[editingPayment.monat-1]} {editingPayment.jahr}
            </div>
            
            <div className="frow">
              <div className="fg">
                <label className="fl">Soll-Betrag (CHF)</label>
                <input className="fi" type="number" step="0.01" value={editingPayment.betragSoll||""} onChange={e=>setEditingPayment({...editingPayment, betragSoll:+e.target.value})}/>
              </div>
              <div className="fg">
                <label className="fl">Bezahlt (CHF)</label>
                <input className="fi" type="number" step="0.01" value={editingPayment.betragIst||""} onChange={e=>setEditingPayment({...editingPayment, betragIst:+e.target.value})}/>
              </div>
            </div>

            {(() => {
              const ue = +editingPayment.uebertrag||0;
              const gebuehrEP = gebuehrVon({ mahnung2SentAt: editingPayment.mahnung2SentAt, mahnungFee: editingPayment.mahnungFee, status: editingPayment.status });
              const soll = (+editingPayment.betragSoll||0) + ue + gebuehrEP;
              const ist = +editingPayment.betragIst||0;
              const diff = ist - soll;
              const fmt = (n) => n.toLocaleString("de-CH",{minimumFractionDigits:0,maximumFractionDigits:2});
              return (
                <div style={{padding:"14px 16px",background:"#fefcf7",border:"1px solid #e1d8c5",borderRadius:8,fontSize:13,marginBottom:12}}>
                  {(ue !== 0 || gebuehrEP > 0) && (()=>{ const z = zusammensetzung(editingPayment.tenantId, editingPayment.jahr, editingPayment.monat, +editingPayment.betragSoll||0, ue, gebuehrEP); return (
                    <div style={{marginBottom:8,paddingBottom:8,borderBottom:"1px solid #eee5d6"}}>
                      <div style={{fontSize:10.5,color:"#8a8174",textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Zusammensetzung</div>
                      {z.posten.map((x,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,padding:"3px 0",color:x.aktuell?"#4a4439":x.guthaben?"#3a5230":"#8a3a2e"}}><span>{x.gebuehr?"Mahngebühr (2. Mahnung)":x.aktuell?`Miete ${MONATS_NAMEN[x.monat-1]}`:x.frueher?"Übertrag aus früheren Monaten":x.guthaben?"Guthaben aus Vormonat":`Rest ${MONATS_NAMEN[x.monat-1]} ${x.jahr}${x.rest?"":" (ganzer Monat)"}`}</span><span style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontWeight:600}}>{chfK(x.betrag)}</span>{x.gebuehr && <button type="button" onClick={gebuehrErlassen} style={{background:"#fff",border:"1px solid #d8d0c0",color:"#8a7f6a",borderRadius:5,fontSize:10.5,fontWeight:600,padding:"2px 7px",cursor:"pointer"}}>erlassen</button>}{!x.aktuell && !x.guthaben && <button type="button" onClick={()=>postenBezahlt(x)} style={{background:"#eef5ec",border:"1px solid #bcd6b8",color:"#2f6b3a",borderRadius:5,fontSize:10.5,fontWeight:600,padding:"2px 7px",cursor:"pointer"}}>✓ bezahlt</button>}</span></div>))}
                    </div>); })()}
                  {(()=>{ const z = zusammensetzung(editingPayment.tenantId, editingPayment.jahr, editingPayment.monat, +editingPayment.betragSoll||0, +editingPayment.uebertrag||0); if (!z.andere.length) return null; return (
                    <div style={{marginBottom:8,paddingBottom:8,borderBottom:"1px solid #eee5d6"}}>
                      <div style={{fontSize:10.5,color:"#8a3a2e",textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Weitere offene Monate</div>
                      {z.andere.map((x,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,padding:"3px 0",color:"#8a3a2e"}}><span>{MONATS_NAMEN[x.monat-1]} {x.jahr}{x.rest?" (Rest)":""}</span><span style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontWeight:600}}>{chfK(x.betrag)}</span><button type="button" onClick={()=>monatBezahlt(x)} style={{background:"#eef5ec",border:"1px solid #bcd6b8",color:"#2f6b3a",borderRadius:5,fontSize:10.5,fontWeight:600,padding:"2px 7px",cursor:"pointer"}}>✓ bezahlt</button></span></div>))}
                    </div>); })()}
                  {ue !== 0 && <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}><span style={{color:"#8a8174"}}>Übertrag aus Vormonaten</span><span style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontWeight:600}}>{ue>0?"+":"−"}CHF {fmt(Math.abs(ue))}</span><button type="button" onClick={()=>setShowUeb(true)} style={{background:"none",border:"none",color:"#8a7f6a",fontSize:10,cursor:"pointer",padding:0,textDecoration:"underline"}}>ändern</button><button type="button" onClick={()=>{setEditingPayment({...editingPayment, uebertrag:0}); setShowUeb(false);}} style={{background:"none",border:"none",color:"#c0392b",fontSize:10,cursor:"pointer",padding:0,textDecoration:"underline"}}>entfernen</button></span></div>}
                  <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"#8a8174"}}>Effektiver Soll</span><span style={{fontWeight:700}}>CHF {fmt(soll)}</span></div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:6,paddingTop:8,borderTop:"1px solid #eee5d6"}}><span style={{color:"#8a8174"}}>Differenz</span><span style={{fontWeight:700,fontSize:14,color:diff<0?"#c0392b":diff>0?"#2f6b3a":"#8a8174"}}>{diff===0?"ausgeglichen":`${diff<0?"−":"+"}CHF ${fmt(Math.abs(diff))}${diff<0?" zu wenig":" zu viel"}`}</span></div>
                  <div style={{marginTop:8}}>
                    {ue === 0 && <button type="button" onClick={()=>setShowUeb(!showUeb)} style={{background:"none",border:"none",color:"#8a7f6a",fontSize:10.5,cursor:"pointer",padding:0,textDecoration:"underline"}}>Übertrag manuell hinzufügen</button>}
                    {showUeb && <input className="fi" type="number" step="0.01" placeholder="+ Nachzahlung, − Guthaben" value={editingPayment.uebertrag||""} onChange={e=>setEditingPayment({...editingPayment, uebertrag:e.target.value===""?0:+e.target.value})} style={{marginTop:6}}/>}
                  </div>
                </div>
              );
            })()}
            {(() => { const rest = Math.round(((+editingPayment.betragSoll||0)+(+editingPayment.uebertrag||0)+gebuehrVon({ mahnung2SentAt: editingPayment.mahnung2SentAt, mahnungFee: editingPayment.mahnungFee, status: editingPayment.status }) - (+editingPayment.betragIst||0))*100)/100; if (rest === 0) return null; return (
              <button onClick={carryOverToNextMonth} style={{width:"100%",padding:"14px 16px",marginBottom:14,background:"#4e7d55",color:"#fff",border:"none",borderRadius:9,cursor:"pointer",fontSize:14,fontWeight:700,lineHeight:1.35,boxShadow:"0 2px 8px rgba(78,125,85,.28)"}}>
                ↪ Differenz in den nächsten Monat übertragen<br/><span style={{fontSize:12,fontWeight:500,opacity:.92}}>{rest>0?"Nachzahlung":"Guthaben"} CHF {Math.abs(rest).toLocaleString("de-CH",{minimumFractionDigits:0,maximumFractionDigits:2})}</span>
              </button>
            ); })()}

            <button type="button" onClick={()=>setShowMore(!showMore)} style={{background:"none",border:"none",color:"#8a7f6a",fontSize:11.5,cursor:"pointer",padding:"4px 0",marginBottom:showMore?8:12}}>Weitere Angaben {showMore?"\u25b2":"\u25bc"}</button>
            {showMore && (
              <div style={{marginBottom:4}}>
                <div className="frow">
                  <div className="fg">
                    <label className="fl">Status</label>
                    <select className="fi" value={editingPayment.status} onChange={e=>setEditingPayment({...editingPayment, status:e.target.value})}>
                      <option value="offen">Offen</option>
                      <option value="bezahlt">Bezahlt</option>
                      <option value="teilweise">Teilweise bezahlt</option>
                      <option value="erlassen">Erlassen</option>
                    </select>
                  </div>
                  <div className="fg">
                    <label className="fl">Zahlungsart</label>
                    <select className="fi" value={editingPayment.bezahltVia} onChange={e=>setEditingPayment({...editingPayment, bezahltVia:e.target.value})}>
                      <option value="\u00dcberweisung">\u00dcberweisung</option>
                      <option value="TWINT">TWINT</option>
                      <option value="Bar">Bar</option>
                      <option value="Andere">Andere</option>
                    </select>
                  </div>
                </div>
                <div className="fg">
                  <label className="fl">Bezahlt am</label>
                  <input className="fi" type="date" value={editingPayment.bezahltAm||""} onChange={e=>setEditingPayment({...editingPayment, bezahltAm:e.target.value})}/>
                </div>
                <div className="fg">
                  <label className="fl">Bemerkung</label>
                  <textarea className="fi" rows={2} value={editingPayment.bemerkung||""} onChange={e=>setEditingPayment({...editingPayment, bemerkung:e.target.value})} style={{resize:"vertical",fontFamily:"inherit"}}/>
                </div>
              </div>
            )}

            <div className="ma" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              {editingPayment.id ? (
                <button className="btn" onClick={async()=>{
                  if (!confirm(`Zahlung wirklich loeschen?\n\n${editingPayment.tenant.vorname} ${editingPayment.tenant.nachname}\n${MONATS_NAMEN[editingPayment.monat-1]} ${editingPayment.jahr}\n\nDies kann nicht rueckgaengig gemacht werden.`)) return;
                  try {
                    await deletePayment(editingPayment.id);
                    setEditingPayment(null);
                  } catch (e) { /* alert kommt aus deletePayment */ }
                }} style={{background:"#fbeae6",color:"#8a3a2e",border:"1px solid #e8c5be",padding:"8px 14px",borderRadius:6,cursor:"pointer",fontSize:12}}>
                  Zahlung loeschen
                </button>
              ) : <span/>}
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-g" onClick={()=>setEditingPayment(null)}>Abbrechen</button>
                <button className="btn btn-p" onClick={saveDetails}>Speichern</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

