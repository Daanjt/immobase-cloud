// ─── DATA HOOKS ──────────────────────────────────────────────────────────────
function useSupabaseData() {
  const [apts, setApts] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [bewerber, setBewerber] = useState([]);
  const [smoobuBookings, setSmoobuBookings] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [timeApprovals, setTimeApprovals] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadAll(still) {
    if (!still) setLoading(true);
    const [a, r, t, b] = await Promise.all([
      supabase.from("apartments").select("*").order("id"),
      supabase.from("rooms").select("*").order("id"),
      supabase.from("tenants").select("*").is("deleted_at",null).order("id"),
      supabase.from("applicants").select("*").order("created_at", {ascending:false}),
    ]);
    // Kurzzeitvermietung: Buchungen + Sperrzeiten aus Elev8 (Abgleich per Edge Function elev8-sync)
    Promise.all([
      supabase.from("elev8_bookings").select("*"),
      supabase.from("elev8_blocks").select("*"),
      supabase.from("elev8_sync_status").select("*").maybeSingle(),
    ]).then(([b, bl, st])=>{
      const KANAL={AIRBNB:"Airbnb",BOOKING_COM:"Booking.com",DIRECT:"Direct booking"};
      const sperren=(bl.data||[]).map(x=>({ id:"block-"+x.listing_name+"-"+x.start_date, channelName:"Blockiert", apartmentId:x.listing_name, apartmentName:x.listing_name,
        arrival:x.start_date, departure:x.end_exclusive, nights:0, price:0, commission:0, adults:0, children:0, guestName:"", isBlocked:true, cancelled:false }));
      const buchungen=(b.data||[]).map(x=>({
        id:x.id, channelName:KANAL[x.channel]||x.channel, apartmentId:x.listing_name, apartmentName:x.listing_name,
        arrival:x.arrival, departure:x.departure, nights:x.nights, price:+x.price||0, commission:+x.commission||0, commissionGeschaetzt:!!x.commission_geschaetzt,
        adults:+x.adults||0, children:+x.children||0, guestName:x.guest_name||"",
        isBlocked:false, cancelled:!!x.cancelled
      }));
      const arr=[...sperren, ...buchungen]; arr.syncStatus=st.data||null;
      setSmoobuBookings(arr);
    });
    supabase.from("employees").select("*").order("nachname").then(({data})=>{
      setEmployees((data||[]).map(x=>({...x})));
    });
    supabase.from("time_entries").select("*").order("datum",{ascending:false}).then(({data})=>{
      setTimeEntries((data||[]).map(x=>({...x, employeeId:x.employee_id, startZeit:x.start_zeit, endZeit:x.end_zeit, pauseMin:x.pause_min, dauerMin:x.dauer_min, aptId:x.apt_id, roomId:x.room_id})));
    });
    supabase.from("time_approvals").select("*").then(({data})=>{
      setTimeApprovals((data||[]).map(x=>({id:x.id, employeeId:x.employee_id, jahr:x.jahr, monat:x.monat, approvedAt:x.approved_at, approvedBy:x.approved_by})));
    });
    setApts((a.data||[]).map(x=>({...x, kautionType:x.kaution_type, refnr:x.refnr, schluesselAnzahl:x.schluessel_anzahl, extraSchluessel:x.extra_schluessel, matterportUrl:x.matterport_url, floorplanPath:x.floorplan_path, videoPath:x.video_path, beschreibung:x.beschreibung, photos:x.photos||[], pipeline:!!x.pipeline, ausschreiben:!!x.ausschreiben, nichtAusschreiben:!!x.nicht_ausschreiben})));
    setRooms((r.data||[]).map(x=>({...x, aptId:x.apt_id, tenantId:x.tenant_id, ausschreibOverride:x.ausschreib_override||"auto"})));
    setTenants((t.data||[]).map(x=>({
      ...x,
      vorname: (x.vorname||"").trim().replace(/\s+/g," "),
      nachname: (x.nachname||"").trim().replace(/\s+/g," "),
      kautionArt: x.kaution_art,
      schluesselNr: x.schluessel_nr,
      schluesselAnzahl: x.schluessel_anzahl,
      extraSchluessel: x.extra_schluessel,
      schluesselUebergeben: x.schluessel_uebergeben,
      drittmeldungStatus: x.drittmeldung_status || "offen",
      drittmeldungDatum: x.drittmeldung_datum,
      drittmeldungNotiz: x.drittmeldung_notiz,
      drittmeldungAuszugStatus: x.drittmeldung_auszug_status || "offen",
      drittmeldungAuszugDatum: x.drittmeldung_auszug_datum,
      drittmeldungAuszugNotiz: x.drittmeldung_auszug_notiz,
      uebergabeStatus: x.uebergabe_status || "offen",
      uebergabeNotiz: x.uebergabe_notiz,
      aptId: x.apt_id,
      roomId: x.room_id,
      kautionMonate: x.kaution_monate,
      kautionBetrag: x.kaution_betrag,
      kautionOpt: x.kaution_opt,
      kautionType: x.kaution_type,
      kautionAufschlag: x.kaution_aufschlag,
      bexioContactId: x.bexio_contact_id,
      kautionAbrechnung: x.kaution_abrechnung,
      moeblierungPauschale: x.moeblierung_pauschale, moeblierungModus: x.moeblierung_modus||"einmalig",
      zimmerWunsch: x.zimmer_wunsch,
      noDebt: x.no_debt,
      bewerberId: x.bewerber_id,
      archivedAt: x.archived_at,
      qrReference: x.qr_reference,
      qrBillStoragePath: x.qr_bill_storage_path,
      qrBillGeneratedAt: x.qr_bill_generated_at,
      qrBillSentAt: x.qr_bill_sent_at,
      qrBillAmount: x.qr_bill_amount,
    })));
    setBewerber((b.data||[]).map(x=>({
      ...x,
      vorname: (x.vorname||"").trim().replace(/\s+/g," "),
      nachname: (x.nachname||"").trim().replace(/\s+/g," "),
      kautionOpt:x.kaution_opt, kautionType:x.kaution_type, kautionAufschlag:x.kaution_aufschlag,
      moeblierungPauschale:x.moeblierung_pauschale, moeblierungModus:x.moeblierung_modus||"einmalig", zimmerWunsch:x.zimmer_wunsch,
      zugeteiltes_zimmer:x.zugeteiltes_zimmer, eingereichtAm:x.eingereicht_am, noDebt:x.no_debt,
      // Fallback for legacy fields
      beruf: x.beruf || x.job || "",
      anstellung: x.anstellung || x.type || "",
    })));
    setLoading(false);
  }

  useEffect(()=>{
    loadAll();
    // Real-time subscription
    const channels = ["apartments","rooms","tenants","applicants"].map(table =>
      supabase.channel(`public:${table}`)
        .on("postgres_changes", {event:"*", schema:"public", table}, () => loadAll())
        .subscribe()
    );
    return () => channels.forEach(c=>supabase.removeChannel(c));
  },[]);
  
  // ─── AUTO-ARCHIVIERUNG ─────────────────────────────────────────
  // Archiviert Mieter automatisch wenn:
  // 1. Ihr Auszug-Datum (auszug) in der Vergangenheit liegt
  // 2. Das Mietende der Wohnung (apt.mietendeUntermiete oder apt.mietende) abgelaufen ist
  const autoRejectCheckedRef = useRef(false);
  useEffect(() => {
    if (loading || autoRejectCheckedRef.current) return;
    if (!bewerber || bewerber.length === 0) return;
    autoRejectCheckedRef.current = true;
    const cutoff = new Date();
    cutoff.setHours(0,0,0,0);
    cutoff.setDate(cutoff.getDate() - 14); // Wunsch-Einzug mehr als 2 Wochen her
    (bewerber||[]).forEach(b => {
      if ((b.status === "Neu" || b.status === "In Prüfung") && b.einzug) {
        const d = new Date(b.einzug);
        if (!isNaN(d.getTime()) && d < cutoff) updateBewerber(b.id, { status: "Abgelehnt" });
      }
    });
  }, [bewerber, loading]);

  const autoArchiveCheckedRef = useRef(false);
  useEffect(() => {
    // Nur einmal pro Session ausführen (nach erstem erfolgreichem Load)
    if (loading || autoArchiveCheckedRef.current) return;
    if (tenants.length === 0) return;
    autoArchiveCheckedRef.current = true;
    
    // Helper: parse DD.MM.YYYY oder YYYY-MM-DD zu Date
    const parseDate = (s) => {
      if (!s) return null;
      const str = String(s).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(str)) return new Date(str);
      const m = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (m) return new Date(+m[3], +m[2]-1, +m[1]);
      const d = new Date(str);
      return isNaN(d) ? null : d;
    };
    
    const today = new Date();
    today.setHours(0,0,0,0); // Anfang des heutigen Tages: erst NACH dem Auszugstag archivieren, nicht am letzten Tag selbst
    
    const toArchive = [];
    
    for (const t of tenants) {
      // Nur aktive Mieter prüfen
      if (t.status === "archiviert") continue;
      
      let reason = null;
      
      // Check 1: Auszug-Datum des Mieters
      const auszugDate = parseDate(t.auszug);
      if (auszugDate && auszugDate < today) {
        reason = `Auszug ${t.auszug} liegt in der Vergangenheit`;
      }
      
      // Check 2: Mietende der Wohnung (befristeter Hauptmietvertrag)
      if (!reason) {
        const myRoom = rooms.find(r => r.tenantId === t.id) || rooms.find(r => r.id === t.roomId);
        const myApt = myRoom ? apts.find(a => a.id === myRoom.aptId) : (t.aptId ? apts.find(a => a.id === t.aptId) : null);
        if (myApt) {
          const aptEndeDate = parseDate(myApt.mietendeUntermiete) || parseDate(myApt.mietende) || parseDate(myApt.mietende_untermiete);
          if (aptEndeDate && aptEndeDate < today) {
            reason = `Mietende der Wohnung ${myApt.id} (${myApt.adresse}) am ${myApt.mietendeUntermiete||myApt.mietende} abgelaufen`;
          }
        }
      }
      
      if (reason) {
        toArchive.push({ tenant: t, reason });
      }
    }
    
    if (toArchive.length === 0) return;
    
    // Frage einmalig nach (statt für jeden einzeln) - User behält Kontrolle
    const list = toArchive.map(x => `• ${x.tenant.vorname} ${x.tenant.nachname} (${x.tenant.id}) - ${x.reason}`).join("\n");
    const confirmed = window.confirm(
      `📦 Auto-Archivierung\n\n${toArchive.length} Mieter sollte${toArchive.length>1?"n":""} archiviert werden:\n\n${list}\n\nJetzt automatisch archivieren? (Daten + Dokumente bleiben erhalten, Zimmer werden freigegeben)`
    );
    if (!confirmed) return;
    
    // Asynchron durchführen
    (async () => {
      let archivedCount = 0;
      for (const {tenant: t} of toArchive) {
        try {
          // Zimmer freigeben ODER direkt an Nachmieter uebergeben (kein Leerstand)
          const myRoom = rooms.find(r => r.tenantId === t.id);
          if (myRoom) {
            const nach = tenants.find(n => n.id !== t.id && (n.status||"aktiv")!=="archiviert" && n.roomId === myRoom.id);
            if (nach) {
              await supabase.from("rooms").update({tenant_id: nach.id, occupied: true, mieter_auszug: nach.auszug || null}).eq("id", myRoom.id);
            } else {
              await supabase.from("rooms").update({tenant_id:null, occupied:false}).eq("id", myRoom.id);
            }
          }
          // Mieter archivieren
          await supabase.from("tenants").update({
            status: "archiviert",
            archived_at: new Date().toISOString(),
            auszug: t.auszug || new Date().toLocaleDateString("de-CH"),
            room_id: (myRoom && myRoom.id) || t.roomId || null,   // Zimmer-Info fuer die Historie erhalten
            apt_id: (myRoom && myRoom.aptId) || t.aptId || null,
          }).eq("id", t.id);
          archivedCount++;
        } catch (e) {
          console.error("Auto-Archivierung fehlgeschlagen für", t.id, e);
        }
      }
      if (archivedCount > 0) {
        await loadAll();
        alert(`✓ ${archivedCount} Mieter wurde${archivedCount>1?"n":""} ins Archiv verschoben.`);
      }
    })();
  }, [loading, tenants, rooms, apts]);

  // Update functions
  // Helper: convert camelCase keys to snake_case + strip non-DB fields
  function toDbApt(fields) {
    const map = {
      kautionType: "kaution_type",
      schluesselAnzahl: "schluessel_anzahl",
      extraSchluessel: "extra_schluessel",
      matterportUrl: "matterport_url",
      floorplanPath: "floorplan_path",
      videoPath: "video_path",
      beschreibung: "beschreibung",
      nichtAusschreiben: "nicht_ausschreiben",
    };
    const strip = ["kaution_type"]; // some db schemas may differ; we'll use map below only
    const dbFields = {};
    for (const k of Object.keys(fields)) {
      if (fields[k] === undefined) continue;
      const dbKey = map[k] || k;
      dbFields[dbKey] = fields[k];
    }
    // Strip fields not in DB
    delete dbFields.created_at;
    delete dbFields.updated_at;
    return dbFields;
  }
  
  function toDbTenant(fields) {
    const map = {
      kautionArt: "kaution_art",
      schluesselNr: "schluessel_nr",
      schluesselAnzahl: "schluessel_anzahl",
      extraSchluessel: "extra_schluessel",
      schluesselUebergeben: "schluessel_uebergeben",
      drittmeldungStatus: "drittmeldung_status",
      drittmeldungDatum: "drittmeldung_datum",
      drittmeldungNotiz: "drittmeldung_notiz",
      drittmeldungAuszugStatus: "drittmeldung_auszug_status",
      drittmeldungAuszugDatum: "drittmeldung_auszug_datum",
      drittmeldungAuszugNotiz: "drittmeldung_auszug_notiz",
      uebergabeStatus: "uebergabe_status",
      uebergabeNotiz: "uebergabe_notiz",
      aptId: "apt_id",
      roomId: "room_id",
      kautionMonate: "kaution_monate",
      kautionAbrechnung: "kaution_abrechnung",
      kautionBetrag: "kaution_betrag",
      kautionOpt: "kaution_opt",
      kautionType: "kaution_type",
      kautionAufschlag: "kaution_aufschlag",
      moeblierungPauschale: "moeblierung_pauschale",
      moeblierungModus: "moeblierung_modus",
      zimmerWunsch: "zimmer_wunsch",
      noDebt: "no_debt",
      bewerberId: "bewerber_id",
      archivedAt: "archived_at",
    };
    const dbFields = {};
    for (const k of Object.keys(fields)) {
      if (fields[k] === undefined) continue;
      const dbKey = map[k] || k;
      dbFields[dbKey] = fields[k];
    }
    // Leere Zahlenfelder muessen null sein, sonst schlaegt das Speichern fehl
    for (const nf of ["einkommen","kaution_aufschlag","kaution_betrag","moeblierung_pauschale"]) {
      // nur Felder anfassen, die wirklich mitgeschickt werden (sonst loescht jedes Teil-Update Kaution etc.)
      if (Object.prototype.hasOwnProperty.call(dbFields, nf) && dbFields[nf] === "") dbFields[nf] = null;
    }
    // Strip system fields
    delete dbFields.created_at;
    delete dbFields.updated_at;
    // Strip bewerber-only fields that don't exist on tenants table
    // NICHT status komplett löschen - 'aktiv'/'archiviert' sind valide tenant-Werte!
    if (dbFields.status !== undefined && !["aktiv", "archiviert"].includes(dbFields.status)) {
      delete dbFields.status; // nur invalid bewerber-status verwerfen
    }
    delete dbFields.eingereicht_am;
    delete dbFields.eingereichtAm;
    delete dbFields.zugeteiltes_zimmer;
    delete dbFields.truthful;
    // Felder, die es nur bei Bewerbern gibt (sonst schlaegt das Anlegen des Mieters fehl)
    for (const f of ["aufenthalt","no_criminal_record","noCriminalRecord","empfohlen_von","quelle","notiz","whatsapp_followup_scheduled_at","whatsapp_followup_sent_at","whatsapp_followup_status","whatsapp_message_id","whatsapp_followup_error","whatsapp_followup_language"]) delete dbFields[f];
    if (dbFields.sprache !== undefined && !["de","en"].includes(dbFields.sprache)) dbFields.sprache = "de";
    // Strip removed-feature fields (lifestyle)
    delete dbFields.rauchen;
    delete dbFields.haustiere;
    delete dbFields.betreibung;
    return dbFields;
  }
  
  function toDbRoom(fields) {
    const map = {
      tenantId: "tenant_id",
      aptId: "apt_id",
      ausschreibOverride: "ausschreib_override",
    };
    const dbFields = {};
    for (const k of Object.keys(fields)) {
      if (fields[k] === undefined) continue;
      const dbKey = map[k] || k;
      dbFields[dbKey] = fields[k];
    }
    delete dbFields.created_at;
    delete dbFields.updated_at;
    return dbFields;
  }
  
  async function updateApt(id, fields) {
    const dbFields = toDbApt(fields);
    const {error} = await supabase.from("apartments").update(dbFields).eq("id", id);
    if (error) {
      console.error("updateApt error:", error);
      toast("Fehler beim Speichern", "error");
      return;
    }
    setApts(p => p.map(a => a.id === id ? {...a, ...fields} : a));
    toast("Gespeichert");
  }
  async function insertApt(a, roomDetails) {
    const dbA = toDbApt(a);
    const {error: aptErr} = await supabase.from("apartments").insert([dbA]);
    if (aptErr) {
      console.error("insertApt error:", aptErr);
      alert("Wohnung konnte nicht angelegt werden: " + aptErr.message);
      throw aptErr;
    }
    setApts(p => [...p, a]);
    if (a.type === "WG" && a.units > 0) {
      const newRooms = [];
      for (let i=1; i<=a.units; i++) {
        const detail = (roomDetails && roomDetails[i-1]) || {};
        newRooms.push({
          id: `${a.id}-${i}`,
          apt_id: a.id,
          occupied: false,
          miete: +detail.miete || 0,
          groesse: formatGroesse(detail.groesse),
          balkon: !!detail.balkon,
        });
      }
      const {error: roomErr} = await supabase.from("rooms").insert(newRooms);
      if (roomErr) {
        console.error("insertApt rooms error:", roomErr);
        alert("Zimmer konnten nicht angelegt werden: " + roomErr.message);
        throw roomErr;
      }
      setRooms(p => [...p, ...newRooms.map(r => ({
        id: r.id, aptId: r.apt_id, occupied: r.occupied,
        miete: r.miete, groesse: r.groesse, balkon: r.balkon,
        tenantId: null,
      }))]);
    }
  }
  async function deleteApt(id) {
    const {error: e1} = await supabase.from("rooms").delete().eq("apt_id", id);
    const {error: e2} = await supabase.from("apartments").delete().eq("id", id);
    if (e1 || e2) {
      console.error("deleteApt errors:", e1, e2);
      alert("Löschen fehlgeschlagen: " + ((e1||e2).message));
      return;
    }
    setApts(p => p.filter(a => a.id !== id));
    setRooms(p => p.filter(r => r.aptId !== id));
  }
  async function updateTenant(id, fields) {
    const dbFields = toDbTenant(fields);
    const {error} = await supabase.from("tenants").update(dbFields).eq("id", id);
    if (error) {
      console.error("updateTenant error:", error);
      toast("Fehler beim Speichern", "error");
      return;
    }
    setTenants(p => p.map(t => t.id === id ? {...t, ...fields} : t));
    toast("Gespeichert");
    // Auszugsdatum aufs Zimmer spiegeln, damit das Bewerbungsformular die 45-Tage-Regel selbst rechnen kann
    if (Object.prototype.hasOwnProperty.call(fields, "auszug")) {
      const rm = rooms.find(r => r.tenantId === id);
      if (rm) {
        const val = fields.auszug || null;
        await supabase.from("rooms").update({mieter_auszug: val}).eq("id", rm.id);
        setRooms(p => p.map(r => r.id === rm.id ? {...r, mieter_auszug: val} : r));
      }
    }
  }
  
  // Ändere Mieter-ID inkl. allen Foreign-Key-Bezügen (rooms.tenant_id)
  async function renameTenantId(oldId, newId) {
    if (oldId === newId) return true;
    // 1. Prüfen ob neue ID existiert
    const existing = tenants.find(t => t.id === newId);
    if (existing) {
      alert(`Mieter-ID "${newId}" existiert bereits (${existing.vorname} ${existing.nachname}).`);
      return false;
    }
    // 2. Format prüfen
    if (!/^T\d{2,}$/.test(newId)) {
      alert(`Mieter-ID muss Format T01, T02, … haben (gross-T + Zahl).`);
      return false;
    }
    // 3. Rooms: tenant_id auf NULL setzen (FK-Constraint umgehen)
    const linkedRoomsBefore = rooms.filter(r => r.tenantId === oldId).map(r => r.id);
    if (linkedRoomsBefore.length > 0) {
      const {error: e1} = await supabase.from("rooms").update({tenant_id: null}).eq("tenant_id", oldId);
      if (e1) { alert("Schritt 1 fehlgeschlagen: " + e1.message); return false; }
    }
    // 4. Tenant-ID ändern
    const {error: e2} = await supabase.from("tenants").update({id: newId}).eq("id", oldId);
    if (e2) {
      // Rollback: rooms re-link versuchen
      for (const rid of linkedRoomsBefore) {
        await supabase.from("rooms").update({tenant_id: oldId}).eq("id", rid);
      }
      alert("ID-Änderung fehlgeschlagen: " + e2.message);
      return false;
    }
    // 5. Rooms: tenant_id auf neue ID setzen
    for (const rid of linkedRoomsBefore) {
      const {error: e3} = await supabase.from("rooms").update({tenant_id: newId}).eq("id", rid);
      if (e3) console.error("Re-link room failed:", e3);
    }
    // 6. Local state aktualisieren
    setTenants(p => p.map(t => t.id === oldId ? {...t, id: newId} : t));
    setRooms(p => p.map(r => r.tenantId === oldId ? {...r, tenantId: newId} : r));
    return true;
  }
  async function insertTenant(t) {
    // Fixen Mietzins setzen, falls nicht vorhanden: aktueller Zimmerpreis des zugeteilten Zimmers
    if ((t.mietzins == null || t.mietzins === "") && t.roomId) {
      const rm = rooms.find(r => r.id === t.roomId);
      const ap = rm ? apts.find(a => a.id === rm.aptId) : null;
      if (rm && rm.miete != null && ap && ap.vermietungsart === "wohnung") {
        // Wohnung: Mietzins = Nettomiete + Nebenkosten pro Person; Strom pro Person separat
        const pers = +t.personen || 1;
        t = { ...t, mietzins: +rm.miete, strom: (t.strom != null && t.strom !== "") ? t.strom : 25 * pers };
      } else if (rm && rm.miete != null) t = { ...t, mietzins: +rm.miete };
    }
    const dbT = toDbTenant(t);
    const {error} = await supabase.from("tenants").insert([dbT]);
    if (error) {
      console.error("insertTenant error:", error);
      alert("Mieter konnte nicht angelegt werden: " + error.message);
      throw error;
    }
    setTenants(p => [...p, t]);
  }
  async function updateRoom(id, fields) {
    const dbFields = toDbRoom(fields);
    const {error} = await supabase.from("rooms").update(dbFields).eq("id", id);
    if (error) {
      console.error("updateRoom error:", error);
      toast("Speichern fehlgeschlagen", "error");
      return;
    }
    setRooms(p => p.map(r => r.id === id ? {...r, ...fields} : r));
  }
  async function insertRoom(aptId) {
    const nums = rooms.filter(r => r.aptId === aptId).map(r => { const m = String(r.id).match(/-(\d+)$/); return m ? +m[1] : 0; });
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    const id = `${aptId}-${next}`;
    const row = { id, apt_id: aptId, occupied: false, miete: 0, groesse: null, balkon: false };
    const { error } = await supabase.from("rooms").insert([row]);
    if (error) { console.error("insertRoom error:", error); alert("Zimmer konnte nicht angelegt werden: " + error.message); return null; }
    const nr = { id, aptId, occupied: false, miete: 0, groesse: null, balkon: false, tenantId: null, ausschreibOverride: "auto" };
    setRooms(p => [...p, nr]);
    return nr;
  }
  async function deleteRoom(id) {
    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) { console.error("deleteRoom error:", error); alert("Zimmer konnte nicht gelöscht werden: " + error.message); return false; }
    setRooms(p => p.filter(r => r.id !== id));
    return true;
  }
  async function insertRooms(aptId, roomList) {
    const list = (roomList||[]).filter(Boolean);
    if (!list.length) return [];
    const nums = rooms.filter(r => r.aptId === aptId).map(r => { const m = String(r.id).match(/-(\d+)$/); return m ? +m[1] : 0; });
    let n = nums.length ? Math.max(...nums) : 0;
    const dbRows = list.map(d => { n += 1; return { id: `${aptId}-${n}`, apt_id: aptId, occupied: false, miete: +d.miete||0, groesse: formatGroesse(d.groesse), balkon: !!d.balkon }; });
    const { error } = await supabase.from("rooms").insert(dbRows);
    if (error) { console.error("insertRooms error:", error); alert("Zimmer konnten nicht angelegt werden: " + error.message); return null; }
    const mapped = dbRows.map(r => ({ id: r.id, aptId: r.apt_id, occupied: false, miete: r.miete, groesse: r.groesse, balkon: r.balkon, tenantId: null, ausschreibOverride: "auto" }));
    setRooms(p => [...p, ...mapped]);
    return mapped;
  }
  async function updateBewerber(id, fields) {
    const dbFields = {};
    const map = {
      kautionOpt: "kaution_opt",
      kautionType: "kaution_type",
      kautionAufschlag: "kaution_aufschlag",
      moeblierungPauschale: "moeblierung_pauschale",
      moeblierungModus: "moeblierung_modus",
      zimmerWunsch: "zimmer_wunsch",
      eingereichtAm: "eingereicht_am",
      noDebt: "no_debt",
    };
    for (const k in fields) {
      const dbKey = map[k] || k;
      dbFields[dbKey] = fields[k];
    }
    // Strip non-DB fields
    delete dbFields.created_at;
    delete dbFields.updated_at;
    delete dbFields.beruf;       // legacy, not always in DB
    delete dbFields.anstellung;  // legacy, not always in DB
    const {error} = await supabase.from("applicants").update(dbFields).eq("id", id);
    if (error) {
      console.error("updateBewerber error:", error);
      toast("Speichern fehlgeschlagen", "error");
      return;
    }
    setBewerber(p => p.map(b => b.id === id ? {...b, ...fields} : b));
  }
  
  async function deleteBewerber(id) {
    const {error} = await supabase.from("applicants").delete().eq("id", id);
    if (error) {
      console.error("deleteBewerber error:", error);
      toast("Löschen fehlgeschlagen", "error");
      return;
    }
    setBewerber(p => p.filter(b => b.id !== id));
  }
  
  async function deleteTenant(id) {
    // Sanftes Löschen: in den Papierkorb, zugehörige Daten bleiben erhalten (wiederherstellbar)
    const {error} = await supabase.from("tenants").update({deleted_at: new Date().toISOString()}).eq("id", id);
    if (error) {
      console.error("deleteTenant error:", error);
      toast("Löschen fehlgeschlagen", "error");
      return false;
    }
    setTenants(p => p.filter(t => t.id !== id));
    return true;
  }
  async function restoreTenant(id) {
    const {error} = await supabase.from("tenants").update({deleted_at: null}).eq("id", id);
    if (error) { toast("Wiederherstellen fehlgeschlagen", "error"); return false; }
    await loadAll();
    return true;
  }
  async function purgeTenant(id) {
    try { await supabase.from("documents").delete().eq("tenant_id", id); } catch(e) {}
    try { await supabase.from("payments").delete().eq("tenant_id", id); } catch(e) {}
    try { await supabase.from("uebergabe_protokolle").delete().eq("tenant_id", id); } catch(e) {}
    const {error} = await supabase.from("tenants").delete().eq("id", id);
    if (error) { toast("Endgültiges Löschen fehlgeschlagen", "error"); return false; }
    return true;
  }
  const [deletedTenants, setDeletedTenants] = useState([]);
  async function loadDeleted() {
    const {data} = await supabase.from("tenants").select("*").not("deleted_at","is",null).order("deleted_at",{ascending:false});
    setDeletedTenants((data||[]).map(x=>({...x, deletedAt:x.deleted_at})));
  }

  // ─── DOCUMENTS ─────────────────────────────────────────
  const [documents, setDocuments] = useState([]);
  
  // ─── ÜBERGABE-PROTOKOLLE ──────────────────────────────────
  const [protokolle, setProtokolle] = useState([]);
  
  async function loadProtokolle() {
    try {
      const {data, error} = await supabase.from("uebergabe_protokolle").select("*").order("created_at", {ascending: false});
      if (error) {
        console.warn("Protokolle-Tabelle nicht eingerichtet (SQL-Setup ausführen):", error.message);
        return;
      }
      // Konvertiere snake_case → camelCase für JS
      setProtokolle((data || []).map(p => ({
        ...p,
        tenantId: p.tenant_id,
        aptId: p.apt_id,
        roomId: p.room_id,
        schluesselNr: p.schluessel_nr,
        extraSchluessel: p.extra_schluessel,
        customRaume: p.custom_raume || [],
        signatureMieter: p.signature_mieter,
        signatureVermieter: p.signature_vermieter,
        signedAt: p.signed_at,
        emailSentAt: p.email_sent_at,
        pdfStoragePath: p.pdf_storage_path,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      })));
    } catch (e) {
      console.warn("loadProtokolle failed:", e);
    }
  }
  
  async function insertProtokoll(p) {
    const dbRow = {
      tenant_id: p.tenantId || null,
      apt_id: p.aptId || null,
      room_id: p.roomId || null,
      datum: p.datum || null,
      schluessel_nr: p.schluesselNr || "",
      extra_schluessel: p.extraSchluessel || "",
      bemerkungen: p.bemerkungen || "",
      raume: p.raume || {},
      custom_raume: p.customRaume || [],
      signature_mieter: p.signatureMieter || null,
      signature_vermieter: p.signatureVermieter || null,
      signed_at: p.signedAt || null,
      status: p.status || "entwurf",
    };
    const {data, error} = await supabase.from("uebergabe_protokolle").insert([dbRow]).select().single();
    if (error) { console.error("insertProtokoll:", error); toast("Speichern fehlgeschlagen", "error"); throw error; }
    await loadProtokolle();
    return data;
  }
  
  async function updateProtokoll(id, fields) {
    const map = {
      tenantId: "tenant_id", aptId: "apt_id", roomId: "room_id",
      schluesselNr: "schluessel_nr", extraSchluessel: "extra_schluessel",
      customRaume: "custom_raume",
      signatureMieter: "signature_mieter", signatureVermieter: "signature_vermieter",
      signedAt: "signed_at",
      emailSentAt: "email_sent_at",
      pdfStoragePath: "pdf_storage_path",
    };
    const dbFields = {};
    for (const k of Object.keys(fields)) {
      if (fields[k] === undefined) continue;
      dbFields[map[k] || k] = fields[k];
    }
    const {error} = await supabase.from("uebergabe_protokolle").update(dbFields).eq("id", id);
    if (error) { console.error("updateProtokoll:", error); toast("Speichern fehlgeschlagen", "error"); throw error; }
    await loadProtokolle();
  }
  
  async function deleteProtokoll(id) {
    const {error} = await supabase.from("uebergabe_protokolle").delete().eq("id", id);
    if (error) { console.error("deleteProtokoll:", error); toast("Löschen fehlgeschlagen", "error"); throw error; }
    setProtokolle(p => p.filter(x => x.id !== id));
  }
  
  useEffect(() => { loadProtokolle(); }, []);
  
  // ─── PAYMENTS (Mietzahlungen) ──────────────────────────────────
  const [payments, setPayments] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [handoverProtocols, setHandoverProtocols] = useState([]);
  
  async function loadPayments() {
    try {
      const {data, error} = await supabase.from("payments").select("*").order("jahr", {ascending:false});
      if (error) {
        console.warn("Payments-Tabelle noch nicht eingerichtet (SQL ausführen):", error.message);
        return;
      }
      setPayments((data || []).map(p => ({
        id: p.id,
        tenantId: p.tenant_id,
        jahr: p.jahr,
        monat: p.monat,
        betragSoll: p.betrag_soll,
        betragIst: p.betrag_ist,
        uebertrag: p.uebertrag,
        status: p.status,
        bezahltAm: p.bezahlt_am,
        bezahltVia: p.bezahlt_via,
        markedBy: p.marked_by,
        bemerkung: p.bemerkung,
        mahnung1SentAt: p.mahnung_1_sent_at,
        mahnung2SentAt: p.mahnung_2_sent_at,
        mahnungFee: p.mahnung_fee,
        createdAt: p.created_at,
      })));
    } catch (e) {
      console.warn("loadPayments failed:", e);
    }
  }
  
  async function upsertPayment(payment) {
    // Erzeugt oder aktualisiert eine Zahlung für tenant_id + jahr + monat
    const id = payment.id || `PAY${payment.tenantId}-${payment.jahr}-${String(payment.monat).padStart(2,"0")}`;
    const dbRow = {
      id,
      tenant_id: payment.tenantId,
      jahr: payment.jahr,
      monat: payment.monat,
      betrag_soll: payment.betragSoll || null,
      betrag_ist: payment.betragIst || null,
      uebertrag: payment.uebertrag != null ? payment.uebertrag : (payments.find(x=>x.tenantId===payment.tenantId && x.jahr===payment.jahr && x.monat===payment.monat)?.uebertrag || 0),
      status: payment.status || "offen",
      bezahlt_am: payment.bezahltAm || null,
      bezahlt_via: payment.bezahltVia || null,
      marked_by: payment.markedBy || null,
      bemerkung: payment.bemerkung || null,
    };
    const {error} = await supabase.from("payments").upsert(dbRow, {onConflict:"tenant_id,jahr,monat"});
    if (error) { console.error("upsertPayment:", error); toast("Fehler beim Speichern", "error"); throw error; }
    await loadPayments();
    toast("Gespeichert");
  }
  
  async function deletePayment(id) {
    const {error} = await supabase.from("payments").delete().eq("id", id);
    if (error) { console.error("deletePayment:", error); toast("Löschen fehlgeschlagen", "error"); throw error; }
    setPayments(p => p.filter(x => x.id !== id));
  }

  // ─── PARTNER (Verwaltungen & Eigentümer) ──────────────────────
  const [partners, setPartners] = useState([]);
  const [parkplaetze, setParkplaetze] = useState([]);
  const [parkVertraege, setParkVertraege] = useState([]);
  async function loadParkVertraege() {
    const {data, error} = await supabase.from("contracts").select("id, token, tenant_id, apt_id, contract_type, status, mieter_email, mieter_vorname, mieter_nachname, sent_at, opened_at, signed_at, countersigned_at, expires_at, created_at, signed_pdfs, signed_pdf_path, unsigned_pdfs, parkplatz_id:contract_data->>parkplatz_id").eq("contract_type","parkplatz").order("created_at", {ascending:false});
    if (error) { console.warn("Parkplatzverträge:", error.message); return; }
    setParkVertraege((data||[]).map(c=>({id:c.id, token:c.token, tenantId:c.tenant_id, aptId:c.apt_id, roomId:null, bewerberId:null, contractType:c.contract_type, status:c.status,
      mieterEmail:c.mieter_email, mieterVorname:c.mieter_vorname, mieterNachname:c.mieter_nachname, sentAt:c.sent_at, openedAt:c.opened_at, signedAt:c.signed_at,
      countersignedAt:c.countersigned_at, expiresAt:c.expires_at, createdAt:c.created_at, signedPdfs:c.signed_pdfs, signedPdfPath:c.signed_pdf_path, unsignedPdfs:c.unsigned_pdfs,
      parkplatzId:c.parkplatz_id, signUrl:c.token?`https://mieter.dthomes.ch/${c.token}`:null})));
  }
  async function loadParkplaetze() {
    const {data, error} = await supabase.from("parkplaetze").select("*").order("adresse").order("bezeichnung");
    if (error) { console.warn("Parkplätze:", error.message); return; }
    setParkplaetze(data || []);
  }
  async function loadPartners() {
    try {
      const {data, error} = await supabase.from("partners").select("*").order("name", {ascending:true});
      if (error) { console.warn("Partners-Tabelle noch nicht eingerichtet:", error.message); return; }
      setPartners((data||[]).map(p => ({
        id:p.id, name:p.name, typ:p.typ, strasse:p.strasse, hausnummer:p.hausnummer,
        plz:p.plz, ort:p.ort, land:p.land, quelle:p.quelle, email:p.email, telefon:p.telefon,
        kontaktperson:p.kontaktperson, notizen:p.notizen, kontakte:p.kontakte||[], createdAt:p.created_at,
      })));
    } catch (e) { console.warn("loadPartners failed:", e); }
  }
  async function insertPartner(p) {
    const row = {
      id: p.id || `P${Date.now()}`,
      name: p.name || "", typ: p.typ || "Eigentümer",
      strasse: p.strasse || "", hausnummer: p.hausnummer || "",
      plz: p.plz || "", ort: p.ort || "", land: p.land || "", quelle: p.quelle || "", email: p.email || "",
      telefon: p.telefon || "", kontaktperson: p.kontaktperson || "", notizen: p.notizen || "", kontakte: p.kontakte || [],
    };
    const {data, error} = await supabase.from("partners").insert([row]).select().single();
    if (error) { console.error("insertPartner:", error); toast("Speichern fehlgeschlagen", "error"); throw error; }
    await loadPartners();
    return data;
  }
  async function updatePartner(id, fields) {
    const dbFields = {}; const map = {createdAt:"created_at"};
    for (const k of Object.keys(fields)) { if (fields[k]===undefined) continue; dbFields[map[k]||k] = fields[k]; }
    dbFields.updated_at = new Date().toISOString();
    const {error} = await supabase.from("partners").update(dbFields).eq("id", id);
    if (error) { console.error("updatePartner:", error); toast("Speichern fehlgeschlagen", "error"); throw error; }
    await loadPartners();
  }
  async function deletePartner(id) {
    const {error} = await supabase.from("partners").delete().eq("id", id);
    if (error) { console.error("deletePartner:", error); toast("Löschen fehlgeschlagen", "error"); throw error; }
    setPartners(p => p.filter(x => x.id !== id));
  }
  useEffect(() => { loadPartners(); }, []);
  useEffect(() => { loadParkplaetze(); loadParkVertraege(); }, []);

  // ─── TO-DOS (Kanban) ──────────────────────────────────────────
  const [todos, setTodos] = useState([]);
  const [todoDismissals, setTodoDismissals] = useState([]);
  async function loadTodoDismissals() {
    try {
      const {data, error} = await supabase.from("todo_dismissals").select("auto_id");
      if (error) { console.warn("todo_dismissals:", error.message); return; }
      setTodoDismissals((data||[]).map(x=>x.auto_id));
    } catch (e) { console.warn("loadTodoDismissals failed:", e); }
  }
  async function dismissAutoTodo(autoId) {
    setTodoDismissals(prev => prev.includes(autoId) ? prev : [...prev, autoId]);
    const {error} = await supabase.from("todo_dismissals").insert([{auto_id: autoId}]);
    if (error) { console.error("dismissAutoTodo:", error); await loadTodoDismissals(); }
  }
  async function loadTodos() {
    try {
      const {data, error} = await supabase.from("todos").select("*").order("created_at", {ascending:false});
      if (error) { console.warn("Todos-Tabelle noch nicht eingerichtet:", error.message); return; }
      setTodos((data||[]).map(t => ({id:t.id, title:t.title, notiz:t.notiz, status:t.status, prioritaet:t.prioritaet, zustaendig:t.zustaendig||"", faelligAm:t.faellig_am||"", createdAt:t.created_at})));
    } catch (e) { console.warn("loadTodos failed:", e); }
  }
  async function insertTodo(title, notiz, extras) {
    const e = extras || {};
    const row = {
      id:`TD${Date.now()}`,
      title:(title||"").trim()||"Neues To-do",
      notiz:notiz||"",
      status:"offen",
      prioritaet:e.prioritaet||"",
      zustaendig:e.zustaendig||null,
      faellig_am:e.faelligAm||null,
    };
    const {error} = await supabase.from("todos").insert([row]);
    if (error) { console.error("insertTodo:", error); toast("Speichern fehlgeschlagen", "error"); throw error; }
    await loadTodos();
  }
  async function updateTodo(id, fields) {
    setTodos(p => p.map(t => t.id===id ? {...t, ...fields} : t));
    const dbFields = {...fields}; delete dbFields.createdAt;
    if ('faelligAm' in dbFields) { dbFields.faellig_am = dbFields.faelligAm || null; delete dbFields.faelligAm; }
    if ('zustaendig' in dbFields) dbFields.zustaendig = dbFields.zustaendig || null;
    dbFields.updated_at = new Date().toISOString();
    const {error} = await supabase.from("todos").update(dbFields).eq("id", id);
    if (error) { console.error("updateTodo:", error); await loadTodos(); }
  }
  async function deleteTodo(id) {
    setTodos(p => p.filter(t => t.id!==id));
    const {error} = await supabase.from("todos").delete().eq("id", id);
    if (error) { console.error("deleteTodo:", error); await loadTodos(); }
  }
  useEffect(() => { loadTodos(); loadTodoDismissals(); }, []);
  
  async function sendMahnung(payment_id, stufe, betrag) {
    try {
      const { data, error } = await supabase.functions.invoke('send-mahnung', { body: { payment_id, stufe, betrag } });
      if (error) { alert("Fehler beim Senden: " + (error.message || error)); return false; }
      if (data?.error) { alert("Fehler beim Senden: " + (typeof data.error === 'string' ? data.error : JSON.stringify(data.error))); return false; }
      await loadPayments();
      const stufeLabel = stufe === 1 ? "1. Mahnung" : "2. Mahnung (inkl. Gebühr)";
      alert(`✓ ${stufeLabel} erfolgreich an ${data?.sent_to || "Mieter"} gesendet.`);
      return true;
    } catch (e) {
      alert("Fehler: " + (e.message || e));
      return false;
    }
  }
  
  useEffect(() => { loadPayments(); }, []);
  
  async function loadContracts() {
    try {
      const { data, error } = await supabase.from("contracts").select("id, token, bewerber_id, tenant_id, room_id, apt_id, contract_type, status, mieter_email, mieter_vorname, mieter_nachname, sent_at, opened_at, signed_at, expires_at, created_at, updated_at, bemerkung, signed_pdf_path, signed_pdfs, signed_ip, signed_user_agent").neq("contract_type", "parkplatz").order("created_at", { ascending: false });
      if (error) throw error;
      setContracts((data || []).map(c => ({
        id: c.id,
        token: c.token,
        bewerberId: c.bewerber_id,
        tenantId: c.tenant_id,
        roomId: c.room_id,
        aptId: c.apt_id,
        contractType: c.contract_type,
        status: c.status,
        mieterEmail: c.mieter_email,
        mieterVorname: c.mieter_vorname,
        mieterNachname: c.mieter_nachname,
        sentAt: c.sent_at,
        openedAt: c.opened_at,
        signedAt: c.signed_at,
        expiresAt: c.expires_at,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        bemerkung: c.bemerkung,
        signedPdfPath: c.signed_pdf_path,
        signedPdfs: c.signed_pdfs,
        signedIp: c.signed_ip,
        signedUserAgent: c.signed_user_agent,
        signUrl: c.token ? `https://mieter.dthomes.ch/${c.token}` : null,
      })));
    } catch (e) {
      console.warn("loadContracts failed:", e);
    }
  }
  useEffect(() => { loadContracts(); }, []);
  
  async function withdrawContract(contractId) {
    const { error } = await supabase.from("contracts").update({ 
      status: "zurueckgezogen", 
      updated_at: new Date().toISOString() 
    }).eq("id", contractId);
    if (error) { console.error("withdrawContract:", error); toast("Zurueckziehen fehlgeschlagen", "error"); throw error; }
    await loadContracts();
  }
  
  async function deleteContract(contractId) {
    const { error } = await supabase.from("contracts").delete().eq("id", contractId);
    if (error) { console.error("deleteContract:", error); toast("Loeschen fehlgeschlagen", "error"); throw error; }
    setContracts(c => c.filter(x => x.id !== contractId));
  }
  
  async function loadHandoverProtocols() {
    try {
      const { data, error } = await supabase.from("handover_protocols").select("*").order("started_at", { ascending: false });
      if (error) throw error;
      setHandoverProtocols((data || []).map(h => ({
        id: h.id,
        token: h.token,
        contractId: h.contract_id,
        bewerberId: h.bewerber_id,
        tenantId: h.tenant_id,
        aptId: h.apt_id,
        roomId: h.room_id,
        type: h.type,
        status: h.status,
        startedAt: h.started_at,
        deadline: h.deadline,
        openedAt: h.opened_at,
        submittedAt: h.submitted_at,
        autoAcceptedAt: h.auto_accepted_at,
        closedAt: h.closed_at,
        mieterEmail: h.mieter_email,
        mieterVorname: h.mieter_vorname,
        mieterNachname: h.mieter_nachname,
        photos: h.photos || [],
        mangelNotes: h.mangel_notes,
        tenantSignature: h.tenant_signature,
        bemerkung: h.bemerkung,
        createdAt: h.created_at,
        updatedAt: h.updated_at,
        schluesselInfo: h.schluessel_info,
        schluesselData: h.schluessel_data,
        schluesselUebergebenAm: h.schluessel_uebergeben_am,
        inviteSentAt: h.invite_sent_at,
        inviteEmailError: h.invite_email_error,
        signUrl: h.token ? `https://mieter.dthomes.ch/uebernahme/${h.token}` : null,
      })));
    } catch (e) {
      console.warn("loadHandoverProtocols failed:", e);
    }
  }
  useEffect(() => { loadHandoverProtocols(); }, []);
  // Runterziehen in der App: Daten still im Hintergrund neu laden (ohne Startbildschirm)
  useEffect(() => {
    // Jede Ladefunktion wird gestoppt, damit bei langsamem Netz sichtbar ist, welche bremst
    window.__ibNeuLaden = () => {
      const teile = {loadAll:()=>loadAll(true), loadContracts, loadHandoverProtocols, loadPayments, loadPartners, loadTodos, loadProtokolle, loadParkplaetze, loadParkVertraege, loadDocuments};
      return Promise.all(Object.entries(teile).map(([name, fn]) => { const t0 = Date.now(); return Promise.resolve().then(fn).then(() => ({name, ms: Date.now()-t0, ok: true}), () => ({name, ms: Date.now()-t0, ok: false})); }));
    };
    return () => { delete window.__ibNeuLaden; };
  }, []);
  // Live: Verträge und Übergaben kommen per Realtime-Push. Neue Unterschrift = Hinweis.
  useEffect(() => {
    let tc = null, th = null;
    const gemeldet = new Set();
    const ch = supabase.channel("live_vertraege_uebergaben")
      .on("postgres_changes", {event:"*", schema:"public", table:"contracts"}, (pl) => {
        clearTimeout(tc); tc = setTimeout(() => { loadContracts(); loadParkVertraege(); }, 400);
        const n = pl && pl.new;
        if (n && n.status === "mieter_signiert" && n.signed_at && !gemeldet.has(n.id) && (Date.now() - Date.parse(n.signed_at)) < 10*60000) {
          gemeldet.add(n.id);
          const name = `${n.mieter_vorname||""} ${n.mieter_nachname||""}`.trim() || "Ein Mieter";
          try { toast(`✍ ${name} hat unterschrieben${n.contract_type==="parkplatz" ? " (Parkplatz)" : n.room_id ? " ("+n.room_id+")" : ""}. Bitte gegenzeichnen.`); } catch (_) {}
        }
      })
      .on("postgres_changes", {event:"*", schema:"public", table:"handover_protocols"}, () => {
        clearTimeout(th); th = setTimeout(() => { loadHandoverProtocols(); }, 400);
      })
      .subscribe();
    return () => { clearTimeout(tc); clearTimeout(th); supabase.removeChannel(ch); };
  }, []);

  // Rückfall falls die Live-Verbindung schläft (z.B. iPhone im Hintergrund):
  // beim Zurückkehren (nach mind. 5 Min. weg) alles still nachladen und alle 15 Minuten Verträge/Übergaben holen. Sparsam wegen Supabase-Datenvolumen.
  useEffect(() => {
    let zuletzt = Date.now();
    const still = () => { zuletzt = Date.now(); try { window.__ibNeuLaden && window.__ibNeuLaden(); } catch (_) {} };
    const sichtbar = () => { if (document.visibilityState === "visible" && Date.now() - zuletzt > 5 * 60 * 1000) still(); };
    document.addEventListener("visibilitychange", sichtbar);
    window.addEventListener("focus", sichtbar);
    const iv = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      zuletzt = Date.now();
      Promise.allSettled([loadContracts(), loadHandoverProtocols(), loadParkVertraege()]);
    }, 15 * 60 * 1000);
    return () => { document.removeEventListener("visibilitychange", sichtbar); window.removeEventListener("focus", sichtbar); clearInterval(iv); };
  }, []);
  
  async function startHandoverProtocol({ bewerberId, contractId, aptId, roomId, mieterEmail, mieterVorname, mieterNachname, tenantId, schluesselInfo, schluesselData, mieterGeburtsdatum, mieterNationalitaet, mieterTelefon, mieterAdresse, aptAdresse, aptPlz, aptOrt, roomLabel, einzugDatum }) {
    const now = new Date();
    const deadline = new Date(now.getTime() + 14*24*60*60*1000);
    const { data, error } = await supabase.from("handover_protocols").insert({
      bewerber_id: bewerberId || null,
      contract_id: contractId || null,
      apt_id: aptId || null,
      room_id: roomId || null,
      tenant_id: tenantId || null,
      mieter_email: mieterEmail,
      mieter_vorname: mieterVorname,
      mieter_nachname: mieterNachname,
      mieter_geburtsdatum: mieterGeburtsdatum || null,
      mieter_nationalitaet: mieterNationalitaet || null,
      mieter_telefon: mieterTelefon || null,
      mieter_adresse: mieterAdresse || null,
      apt_adresse: aptAdresse || null,
      apt_plz: aptPlz || null,
      apt_ort: aptOrt || null,
      room_label: roomLabel || null,
      objekt_typ: ((apts||[]).find(x => x.id === aptId)?.vermietungsart === "wohnung") ? "wohnung" : "wg",
      einzug_datum: einzugDatum || null,
      status: "sent",
      started_at: now.toISOString(),
      deadline: deadline.toISOString(),
      schluessel_info: schluesselInfo || null,
      schluessel_data: schluesselData || null,
      schluessel_uebergeben_am: schluesselInfo ? now.toISOString() : null,
    }).select().single();
    if (error) { console.error("startHandoverProtocol:", error); throw error; }
    
    // Trigger Einladungs-Email an Mieter (fire-and-forget, blockiert nicht wenn fehlschlaegt)
    if (data?.id && data?.mieter_email) {
      supabase.functions.invoke("send-handover-invite", { body: { protocolId: data.id } })
        .then(({ error: emailError }) => {
          if (emailError) console.warn("send-handover-invite failed:", emailError);
          else console.log("Einladungs-Email versendet an", data.mieter_email);
          loadHandoverProtocols(); // Reload um invite_sent_at anzuzeigen
        })
        .catch(e => console.warn("send-handover-invite exception:", e));
    }
    
    await loadHandoverProtocols();
    return data;
  }
  
  async function resendHandoverInvite(id) {
    try {
      const { data, error } = await supabase.functions.invoke("send-handover-invite", { body: { protocolId: id } });
      if (error || (data && data.error)) alert("E-Mail konnte nicht gesendet werden: " + ((error && error.message) || (data && data.error) || "unbekannt"));
      else alert("Einladung wurde gesendet.");
    } catch (e) { alert("E-Mail konnte nicht gesendet werden: " + (e.message || e)); }
    await loadHandoverProtocols();
  }
  
  async function cancelHandoverProtocol(protocolId) {
    const { error } = await supabase.from("handover_protocols").update({
      status: "cancelled",
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", protocolId);
    if (error) { console.error("cancelHandoverProtocol:", error); throw error; }
    await loadHandoverProtocols();
  }
  
  async function acceptHandoverProtocol(protocolId) {
    // Schutz: nur ein eingereichtes Protokoll darf als "eingereicht" bestaetigt werden,
    // sonst ginge eine falsche "danke fuers Ausfuellen"-Mail fuer ein leeres Protokoll raus.
    const { data: pr } = await supabase.from("handover_protocols").select("status, tenant_signature").eq("id", protocolId).single();
    if (pr && !["submitted","accepted","auto_accepted"].includes(pr.status) && !(pr.tenant_signature && String(pr.tenant_signature).trim())) {
      alert("Dieses Protokoll wurde vom Mieter noch nicht ausgefüllt und eingereicht. Es kann erst nach Einreichung bestätigt werden. Nach Ablauf der 14-tägigen Frist wird es automatisch abgeschlossen.");
      return;
    }
    // finalize-handover: PDF serverseitig erzeugen, Bestaetigungs-Mail senden,
    // Dokument speichern und Protokoll abschliessen.
    let emailOk = false, emailErr = null;
    try {
      const { data, error } = await supabase.functions.invoke("finalize-handover", { body: { protocolId } });
      if (error || (data && data.error)) emailErr = (error && error.message) || (data && data.error) || "unbekannt";
      else emailOk = true;
    } catch (e) { emailErr = e.message || String(e); }
    if (!emailOk) {
      // Fallback: Status trotzdem setzen, damit das Akzeptieren nicht blockiert ist
      await supabase.from("handover_protocols").update({ status: "accepted", closed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", protocolId);
    }
    await loadHandoverProtocols();
    if (!emailOk) throw new Error("Protokoll akzeptiert, aber Bestätigungs-Mail/Dokument fehlgeschlagen: " + emailErr);
  }
  
  async function extendHandoverDeadline(protocolId, extraDays) {
    const proto = handoverProtocols.find(p => p.id === protocolId);
    if (!proto) return;
    const newDeadline = new Date(new Date(proto.deadline).getTime() + extraDays*24*60*60*1000);
    const { error } = await supabase.from("handover_protocols").update({
      deadline: newDeadline.toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", protocolId);
    if (error) { console.error("extendHandoverDeadline:", error); throw error; }
    await loadHandoverProtocols();
  }
  
  async function deleteHandoverProtocol(protocolId) {
    const { error } = await supabase.from("handover_protocols").delete().eq("id", protocolId);
    if (error) { console.error("deleteHandoverProtocol:", error); throw error; }
    setHandoverProtocols(p => p.filter(x => x.id !== protocolId));
  }
  
  async function loadDocuments() {
    try {
      const {data, error} = await supabase.from("documents").select("*").order("uploaded_at", {ascending:false});
      if (error) {
        console.warn("Documents-Tabelle noch nicht eingerichtet (SQL-Setup ausführen):", error.message);
        return;
      }
      setDocuments(data || []);
    } catch (e) {
      console.warn("loadDocuments failed:", e);
    }
  }
  
  async function uploadDocument(entityType, entityId, category, file) {
    if (!file) throw new Error("Keine Datei");
    if (file.size > 25 * 1024 * 1024) throw new Error("Datei zu groß (max. 25 MB)");
    
    const ext = file.name.split('.').pop().toLowerCase();
    
    // Build smart filename: e.g. "A6_Hauptmietvertrag.pdf" or "Berger_Anna_Untermietvertrag.pdf"
    function sanitize(str) {
      return (str || "")
        .replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue").replace(/[ß]/g, "ss")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
    }
    
    let baseName;
    if (entityType === "apartment") {
      baseName = `${sanitize(entityId)}_${sanitize(category)}`;
    } else {
      // For tenants: use Nachname_Vorname
      const tenant = tenants.find(t => t.id === entityId);
      if (tenant) {
        baseName = `${sanitize(tenant.nachname)}_${sanitize(tenant.vorname)}_${sanitize(category)}`;
      } else {
        baseName = `${sanitize(entityId)}_${sanitize(category)}`;
      }
    }
    
    // Check for collisions, append _2, _3, etc.
    const {data: existing} = await supabase.from("documents")
      .select("filename")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId);
    
    let finalName = `${baseName}.${ext}`;
    let counter = 2;
    const usedNames = new Set((existing || []).map(d => d.filename.toLowerCase()));
    while (usedNames.has(finalName.toLowerCase())) {
      finalName = `${baseName}_${counter}.${ext}`;
      counter++;
    }
    
    const ts = Date.now();
    const path = `${entityType}/${entityId}/${ts}_${finalName}`;
    const {error: upErr} = await supabase.storage.from("documents").upload(path, file);
    if (upErr) throw upErr;
    const user = (await supabase.auth.getUser()).data.user;
    const {data, error} = await supabase.from("documents").insert([{
      entity_type: entityType,
      entity_id: entityId,
      category,
      filename: finalName,
      storage_path: path,
      file_size: file.size,
      mime_type: file.type || `application/${ext}`,
      uploaded_by: user?.email || "unknown",
    }]).select().single();
    if (error) throw error;
    setDocuments(p => [data, ...p]);
    return data;
  }
  
  async function getDocumentUrl(storagePath) {
    // Bei kurzen Netzaussetzern (iPhone: "Load failed") bis zu 2x nachversuchen
    for (let versuch = 0; versuch < 3; versuch++) {
      try {
        const {data, error} = await supabase.storage.from("documents").createSignedUrl(storagePath, 3600);
        if (!error && data?.signedUrl) return data.signedUrl;
        if (error && !/load failed|failed to fetch|network/i.test(String(error.message || error))) { console.error(error); return null; }
      } catch (e) { if (!/load failed|failed to fetch|network/i.test(String(e && e.message || e))) { console.error(e); return null; } }
      await new Promise(r => setTimeout(r, 700 * (versuch + 1)));
    }
    console.error("Dokument-Link: Netzwerkfehler nach 3 Versuchen");
    return null;
  }
  
  async function deleteDocument(doc) {
    await supabase.storage.from("documents").remove([doc.storage_path]);
    await supabase.from("documents").delete().eq("id", doc.id);
    setDocuments(p => p.filter(d => d.id !== doc.id));
  }
  
  // Bewerber-Dokumente zu Mieter migrieren (beim Zuteilen)
  // entity_type: applicant → tenant, entity_id: bewerber_id → tenant_id
  // Storage path bleibt wie es ist (bucket+pfad sind nur Referenzen)
  async function migrateDocumentsToTenant(bewerberId, tenantId) {
    const { data, error } = await supabase
      .from("documents")
      .update({ entity_type: "tenant", entity_id: tenantId })
      .eq("entity_type", "applicant")
      .eq("entity_id", String(bewerberId))
      .select();
    if (error) {
      console.error("migrateDocumentsToTenant error:", error);
      return { migrated: 0, error };
    }
    // Lokalen State aktualisieren
    setDocuments(prev => prev.map(d => {
      if (d.entity_type === "applicant" && d.entity_id === String(bewerberId)) {
        return { ...d, entity_type: "tenant", entity_id: tenantId };
      }
      return d;
    }));
    return { migrated: (data || []).length, error: null };
  }

  // Mieter zurueck in die Bewerber-Sektion verschieben. Reaktiviert einen noch
  // vorhandenen Bewerber (Status Zugeteilt) oder legt aus den Mieterdaten einen
  // neuen an, migriert Dokumente zurueck, gibt das Zimmer frei und entfernt den
  // Mieter (deleteTenant loescht auch dessen Zahlungen und Uebergabeprotokolle).
  async function convertTenantToBewerber(tenant) {
    if (!tenant) return { ok: false };
    const norm = (s) => (s || "").trim().toLowerCase();
    const room = rooms.find(r => r.tenantId === tenant.id) || null;
    let applicant = null;
    if (tenant.email) applicant = bewerber.find(b => b.email && norm(b.email) === norm(tenant.email));
    if (!applicant && room) applicant = bewerber.find(b => b.zugeteiltes_zimmer === room.id && b.status === "Zugeteilt");
    let applicantId;
    if (applicant) {
      await updateBewerber(applicant.id, { status: "Neu", zugeteiltes_zimmer: null });
      applicantId = applicant.id;
    } else {
      applicantId = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `B${Date.now()}`;
      const einkNum = (tenant.einkommen === "" || tenant.einkommen === null || tenant.einkommen === undefined) ? null : Number(tenant.einkommen);
      const dbApplicant = {
        id: applicantId,
        vorname: tenant.vorname || "", nachname: tenant.nachname || "",
        email: tenant.email || "", phone: tenant.phone || "",
        geburt: tenant.geburt || "", gender: tenant.gender || "", nat: tenant.nat || "",
        zivilstand: tenant.zivilstand || "",
        adresse: tenant.adresse || "", plz: tenant.plz || "", ort: tenant.ort || "", land: tenant.land || "",
        type: tenant.type === "AOZ" ? "AOZ / Sozialhilfe" : (tenant.type || ""),
        job: tenant.job || "",
        arbeitgeber: tenant.arbeitgeber || "",
        einkommen: (einkNum !== null && !isNaN(einkNum)) ? einkNum : null,
        kaution_type: tenant.kautionArt || "",
        moebliert: (tenant.moebliert || tenant.furnished) ? "ja" : "nein",
        einzug: tenant.einzug || "",
        owner: tenant.owner || "",
        status: "Neu",
      };
      const { error } = await supabase.from("applicants").insert([dbApplicant]);
      if (error) { console.error("convertTenantToBewerber insert error:", error); toast("Anlegen des Bewerbers fehlgeschlagen", "error"); return { ok: false, error }; }
    }
    // Dokumente zurueck migrieren: tenant -> applicant (bleiben so erhalten)
    try {
      await supabase.from("documents").update({ entity_type: "applicant", entity_id: String(applicantId) })
        .eq("entity_type", "tenant").eq("entity_id", tenant.id);
      setDocuments(prev => prev.map(d => (d.entity_type === "tenant" && d.entity_id === tenant.id) ? { ...d, entity_type: "applicant", entity_id: String(applicantId) } : d));
    } catch (e) { console.error("Dokument-Ruecklauf fehlgeschlagen:", e); }
    // Zimmer freigeben
    if (room) await updateRoom(room.id, { occupied: false, tenantId: null });
    // Mieter entfernen
    await deleteTenant(tenant.id);
    await loadAll();
    return { ok: true, applicantId };
  }

  useEffect(() => { if (apts.length > 0) loadDocuments(); }, [apts.length]);
  useEffect(() => { window.__ibDokNeu = loadDocuments; return () => { delete window.__ibDokNeu; }; }, []);

  async function insertEmployee(e) {
    const row = {vorname:e.vorname||"", nachname:e.nachname||"", email:e.email||null, phone:e.phone||null, funktion:e.funktion||null, stundenlohn:(e.stundenlohn===""||e.stundenlohn==null)?null:+e.stundenlohn, pensum:(e.pensum===""||e.pensum==null)?null:+e.pensum, aktiv:e.aktiv!==false, notiz:e.notiz||null};
    const {data, error} = await supabase.from("employees").insert([row]).select();
    if (error) { console.error("insertEmployee", error); alert("Mitarbeiter konnte nicht angelegt werden: "+error.message); throw error; }
    const rec = (data&&data[0])||row;
    setEmployees(p => [...p, {...rec}]);
    return rec;
  }
  async function updateEmployee(id, fields) {
    const db = {};
    ["vorname","nachname","email","phone","funktion","aktiv","notiz"].forEach(k=>{ if(k in fields) db[k]=fields[k]; });
    if ("stundenlohn" in fields) db.stundenlohn = (fields.stundenlohn===""||fields.stundenlohn==null)?null:+fields.stundenlohn;
    if ("pensum" in fields) db.pensum = (fields.pensum===""||fields.pensum==null)?null:+fields.pensum;
    db.updated_at = new Date().toISOString();
    const {error} = await supabase.from("employees").update(db).eq("id", id);
    if (error) { console.error("updateEmployee", error); toast("Speichern fehlgeschlagen", "error"); return; }
    setEmployees(p => p.map(x => x.id===id ? {...x, ...fields} : x));
  }
  async function deleteEmployee(id) {
    const {error} = await supabase.from("employees").delete().eq("id", id);
    if (error) { console.error("deleteEmployee", error); toast("Löschen fehlgeschlagen", "error"); return; }
    setEmployees(p => p.filter(x => x.id!==id));
    setTimeEntries(p => p.filter(t => t.employeeId!==id));
  }
  const TE_MAP = {employeeId:"employee_id", datum:"datum", startZeit:"start_zeit", endZeit:"end_zeit", pauseMin:"pause_min", dauerMin:"dauer_min", aptId:"apt_id", roomId:"room_id", kategorie:"kategorie", notiz:"notiz", createdBy:"created_by"};
  function toDbTimeEntry(t, onlyPresent) {
    const db = {};
    for (const k in TE_MAP) {
      if (onlyPresent && !(k in t)) continue;
      let v = t[k];
      if (k==="pauseMin") v = (v===""||v==null)?0:+v;
      else if (k==="dauerMin") v = (v===""||v==null)?null:+v;
      else if (["startZeit","endZeit","aptId","roomId","kategorie","notiz","createdBy"].includes(k)) v = v||null;
      db[TE_MAP[k]] = v;
    }
    return db;
  }
  async function insertTimeEntry(t) {
    const {data, error} = await supabase.from("time_entries").insert([toDbTimeEntry(t, false)]).select();
    if (error) { console.error("insertTimeEntry", error); alert("Zeiteintrag konnte nicht gespeichert werden: "+error.message); throw error; }
    const rec = (data&&data[0])||{};
    setTimeEntries(p => [{...rec, employeeId:rec.employee_id, startZeit:rec.start_zeit, endZeit:rec.end_zeit, pauseMin:rec.pause_min, dauerMin:rec.dauer_min, aptId:rec.apt_id, roomId:rec.room_id}, ...p]);
    return rec;
  }
  async function updateTimeEntry(id, fields) {
    const db = toDbTimeEntry(fields, true);
    db.updated_at = new Date().toISOString();
    const {error} = await supabase.from("time_entries").update(db).eq("id", id);
    if (error) { console.error("updateTimeEntry", error); toast("Speichern fehlgeschlagen", "error"); return; }
    setTimeEntries(p => p.map(x => x.id===id ? {...x, ...fields} : x));
  }
  async function deleteTimeEntry(id) {
    const {error} = await supabase.from("time_entries").delete().eq("id", id);
    if (error) { console.error("deleteTimeEntry", error); toast("Löschen fehlgeschlagen", "error"); return; }
    setTimeEntries(p => p.filter(x => x.id!==id));
  }
  async function approveMonth(employeeId, jahr, monat, approvedBy) {
    const {data, error} = await supabase.from("time_approvals").upsert([{employee_id:employeeId, jahr, monat, approved_by:approvedBy||null, approved_at:new Date().toISOString()}], {onConflict:"employee_id,jahr,monat"}).select();
    if (error) { console.error("approveMonth", error); toast("Genehmigen fehlgeschlagen", "error"); return; }
    const rec = (data&&data[0])||{};
    setTimeApprovals(p => [...p.filter(a=>!(a.employeeId===employeeId&&a.jahr===jahr&&a.monat===monat)), {id:rec.id, employeeId, jahr, monat, approvedAt:rec.approved_at, approvedBy}]);
  }
  async function revokeMonth(employeeId, jahr, monat) {
    const {error} = await supabase.from("time_approvals").delete().eq("employee_id",employeeId).eq("jahr",jahr).eq("monat",monat);
    if (error) { console.error("revokeMonth", error); toast("Aufheben fehlgeschlagen", "error"); return; }
    setTimeApprovals(p => p.filter(a=>!(a.employeeId===employeeId&&a.jahr===jahr&&a.monat===monat)));
  }

  return {parkplaetze, loadParkplaetze, parkVertraege, loadParkVertraege, apts, rooms, tenants, bewerber, smoobuBookings, documents, protokolle, payments, partners, loadPartners, insertPartner, updatePartner, deletePartner, todos, loadTodos, insertTodo, updateTodo, deleteTodo, todoDismissals, loadTodoDismissals, dismissAutoTodo, loading, loadAll, updateApt, insertApt, deleteApt, updateTenant, insertTenant, renameTenantId, deleteTenant, restoreTenant, purgeTenant, deletedTenants, loadDeleted, updateRoom, insertRoom, insertRooms, deleteRoom, updateBewerber, deleteBewerber, uploadDocument, getDocumentUrl, deleteDocument, migrateDocumentsToTenant, convertTenantToBewerber, insertProtokoll, updateProtokoll, deleteProtokoll, upsertPayment, deletePayment, sendMahnung, contracts, loadContracts, withdrawContract, deleteContract, handoverProtocols, loadHandoverProtocols, startHandoverProtocol, cancelHandoverProtocol, acceptHandoverProtocol, extendHandoverDeadline, deleteHandoverProtocol, resendHandoverInvite, employees, timeEntries, insertEmployee, updateEmployee, deleteEmployee, insertTimeEntry, updateTimeEntry, deleteTimeEntry, timeApprovals, approveMonth, revokeMonth};
}

