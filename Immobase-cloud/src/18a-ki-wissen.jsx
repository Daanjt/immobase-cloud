// ─── KI-WISSEN ───────────────────────────────────────────────────────────────
// Was die KI bei Antworten an Interessenten (WhatsApp) wissen darf. Nur dieses Wissen
// plus die Live-Daten (freie Zimmer/Wohnungen) werden verwendet. Unten: Testen / Trockenlauf.
const KI_BEISPIELE = [
  "Guten Tag, ich fand das Inserat sehr ansprechend und würde euch gerne kennenlernen. Wann wäre dies möglich?",
  "Servus! Ich hätte Interesse, die Wohnung ab 01.12 zu übernehmen. Ich ziehe aus München nach Zürich und bin Software-Projektleiter, starte aber erst am 01.01.27.",
  "Hi, is the room still available? How much is it per month in total?",
  "Hallo, wie hoch ist die Kaution? Kann ich die auch in Raten bezahlen?",
  "Kann ich das Zimmer auch nur für 3 Monate mieten?",
  "Hello, can my girlfriend and I rent one room together?",
  "Darf ich meine Katze mitnehmen?",
  "Ist das Zimmer möbliert und ist Internet dabei?",
  "Can you do 900 instead of 1090? I am a student.",
  "Kann ich am Samstag vorbeikommen und das Zimmer anschauen?",
  "Ich wohne schon bei euch an der Josefstrasse, meine Heizung geht nicht.",
  "Brauche ich einen Betreibungsauszug für ein WG-Zimmer?",
];

async function kiAntwortHolen(nachricht, verlauf) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ki-antwort`, { method:"POST", headers:{ "Content-Type":"application/json", "apikey":SUPABASE_ANON_KEY, "Authorization":`Bearer ${((await supabase.auth.getSession()).data.session||{}).access_token||""}` }, body: JSON.stringify({ nachricht, verlauf: verlauf||[] }) });
  const j = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(j.error || `Fehler ${res.status}`);
  return j;
}

function KiAntwortKarte({frage, r}) {
  return (
    <div style={{border:"1px solid #efe7d6",borderRadius:8,padding:"10px 12px",marginTop:8,background:"#fff"}}>
      {frage && <div style={{fontSize:12,color:"#8a8174",marginBottom:6,whiteSpace:"pre-wrap"}}>💬 {frage}</div>}
      {r.error ? <div style={{color:"#a4442e",fontSize:13}}>{r.error}</div> : <>
        <div style={{fontSize:13.5,whiteSpace:"pre-wrap",lineHeight:1.5}}>{r.antwort}</div>
        <div style={{fontSize:11,marginTop:6,color:r.eskalieren?"#a4442e":"#3a5230"}}>{r.eskalieren ? "⚠ würde an euch weitergeleitet" : "✓ würde automatisch gesendet"}{r.grund ? ` · ${r.grund}` : ""}</div>
      </>}
    </div>
  );
}

function KiWissenPage() {
  const [liste, setListe] = useState([]);
  const [laden, setLaden] = useState(true);
  const [geaendert, setGeaendert] = useState({});
  const [test, setTest] = useState("");
  const [testR, setTestR] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lauf, setLauf] = useState([]);
  const [laufBusy, setLaufBusy] = useState(false);

  const lade = async () => { setLaden(true); const { data, error } = await supabase.from("ki_wissen").select("*").order("sort"); if (error) toast("Laden fehlgeschlagen", "error"); setListe(data || []); setGeaendert({}); setLaden(false); };
  useEffect(() => { lade(); }, []);
  const feld = (id, k, v) => { setListe(l => l.map(x => x.id === id ? { ...x, [k]: v } : x)); setGeaendert(g => ({ ...g, [id]: true })); };
  const speichern = async (w) => {
    const { error } = await supabase.from("ki_wissen").update({ titel: w.titel, inhalt: w.inhalt, aktiv: w.aktiv, sort: w.sort, updated_at: new Date().toISOString(), updated_by: "ImmoBase" }).eq("id", w.id);
    if (error) { toast("Speichern fehlgeschlagen", "error"); return; }
    setGeaendert(g => { const n = { ...g }; delete n[w.id]; return n; }); toast("Gespeichert");
  };
  const neu = async () => {
    const sort = (liste.reduce((m, x) => Math.max(m, x.sort || 0), 0) || 0) + 10;
    const { error } = await supabase.from("ki_wissen").insert({ titel: "Neuer Abschnitt", inhalt: "", sort, updated_by: "ImmoBase" });
    if (error) { toast("Anlegen fehlgeschlagen", "error"); return; } lade();
  };
  const loeschen = async (w) => { if (!confirm(`Abschnitt "${w.titel}" löschen?`)) return; const { error } = await supabase.from("ki_wissen").delete().eq("id", w.id); if (error) { toast("Löschen fehlgeschlagen", "error"); return; } lade(); };
  const testen = async () => { setBusy(true); setTestR(null); try { setTestR(await kiAntwortHolen(test.trim())); } catch (e) { setTestR({ error: e.message }); } setBusy(false); };
  const trockenlauf = async () => {
    setLaufBusy(true); setLauf([]);
    for (const f of KI_BEISPIELE) { let r; try { r = await kiAntwortHolen(f); } catch (e) { r = { error: e.message }; } setLauf(l => [...l, { frage: f, r }]); }
    setLaufBusy(false);
  };
  const offen = Object.keys(geaendert).length;

  return (
    <div>
      <div className="pt">KI-Wissen</div>
      <div className="ps">Das darf die KI bei Antworten an Interessenten verwenden, zusätzlich zu den freien Zimmern und Wohnungen aus ImmoBase. Was hier nicht steht, beantwortet sie nicht selbst, sondern leitet es an euch weiter.</div>

      <div className="card" style={{marginTop:14,marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:600,color:"#5a5448",marginBottom:8}}>Testen</div>
        <textarea className="fi" rows={3} value={test} onChange={e => setTest(e.target.value)} placeholder="Nachricht eines Interessenten eingeben, z.B. «Ist das Zimmer noch frei?»"/>
        <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
          <button className="btn btn-p btn-sm" style={{width:"auto"}} disabled={busy || test.trim().length < 2} onClick={testen}>{busy ? "Denkt…" : "Antwort vorschlagen"}</button>
          <button className="btn btn-g btn-sm" style={{width:"auto"}} disabled={laufBusy} onClick={trockenlauf}>{laufBusy ? `Trockenlauf… ${lauf.length}/${KI_BEISPIELE.length}` : `Trockenlauf mit ${KI_BEISPIELE.length} Beispielen`}</button>
        </div>
        {testR && <KiAntwortKarte r={testR}/>}
        {lauf.map((x, i) => <KiAntwortKarte key={i} frage={x.frage} r={x.r}/>)}
      </div>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"6px 0 10px"}}>
        <div style={{fontSize:13,fontWeight:600,color:"#5a5448"}}>Wissen ({liste.length} Abschnitte){offen ? ` · ${offen} ungespeichert` : ""}</div>
        <button className="btn btn-g btn-sm" style={{width:"auto"}} onClick={neu}>+ Abschnitt</button>
      </div>
      {laden && <div className="card" style={{color:"#8a8174"}}>Lädt…</div>}
      {liste.map(w => (
        <div key={w.id} className="card" style={{marginBottom:10,opacity:w.aktiv ? 1 : .55}}>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <input className="fi" style={{flex:"1 1 220px",fontWeight:600}} value={w.titel} onChange={e => feld(w.id, "titel", e.target.value)}/>
            <label style={{fontSize:12,color:"#5a5448",display:"flex",gap:4,alignItems:"center"}}><input type="checkbox" checked={!!w.aktiv} onChange={e => feld(w.id, "aktiv", e.target.checked)}/> aktiv</label>
          </div>
          <textarea className="fi" rows={Math.min(14, Math.max(3, String(w.inhalt || "").split("\n").length + 1))} style={{marginTop:8,fontFamily:"inherit",lineHeight:1.5}} value={w.inhalt} onChange={e => feld(w.id, "inhalt", e.target.value)}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6,gap:8,flexWrap:"wrap"}}>
            <div style={{fontSize:11,color:"#8a8174"}}>{w.updated_by ? `${w.updated_by} · ` : ""}{w.updated_at ? new Date(w.updated_at).toLocaleDateString("de-CH") : ""}</div>
            <div style={{display:"flex",gap:6}}>
              <button className="btn btn-g btn-sm" style={{width:"auto"}} onClick={() => loeschen(w)}>Löschen</button>
              <button className="btn btn-p btn-sm" style={{width:"auto"}} disabled={!geaendert[w.id]} onClick={() => speichern(w)}>Speichern</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
