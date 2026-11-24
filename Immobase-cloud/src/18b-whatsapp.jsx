// ─── WHATSAPP-POSTEINGANG ────────────────────────────────────────────────────
// Alle Chats der D&T-Nummer (wa_nachrichten), KI-Vorschlag zum Freigeben, Senden innerhalb des 24h-Fensters.
function waNorm(t) {
  let s = String(t || "").replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!s.startsWith("+")) { if (s.startsWith("0")) s = "+41" + s.slice(1); else return null; }
  return /^\+\d{8,15}$/.test(s) ? s : null;
}
function waZeit(d) {
  if (!d) return "";
  const x = new Date(d), h = new Date();
  const gleicherTag = x.toDateString() === h.toDateString();
  return gleicherTag ? x.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }) : x.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" }) + " " + x.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
}
async function waFn(body) {
  const tok = ((await supabase.auth.getSession()).data.session || {}).access_token || "";
  const res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${tok}` }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(j.error || `Fehler ${res.status}`);
  return j;
}
// Bild, Audio, Video oder Datei aus dem privaten Bucket "whatsapp" anzeigen
function WaMedium({ m }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let weg = false; supabase.storage.from("whatsapp").createSignedUrl(m.medien_pfad, 3600).then(({ data }) => { if (!weg && data) setUrl(data.signedUrl); }); return () => { weg = true; }; }, [m.medien_pfad]);
  if (!url) return <div style={{ fontSize: 12, color: "#8a8174" }}>Lädt…</div>;
  const mime = m.medien_mime || "";
  if (mime.startsWith("image/")) return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="" style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 6, display: "block" }} /></a>;
  if (mime.startsWith("audio/")) return <audio controls src={url} style={{ maxWidth: 260 }} />;
  if (mime.startsWith("video/")) return <video controls src={url} style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 6 }} />;
  return <a href={url} target="_blank" rel="noreferrer" style={{ color: "#3a5f8a" }}>📄 {m.medien_name || "Datei öffnen"}</a>;
}
const WA_QUELLE = { ki: "🤖 KI automatisch", ki_fehler: "⚠ KI-Fehler", handy: "📱 vom Handy", immobase: "💻 ImmoBase", immobase_ki: "💻 ImmoBase (KI-Vorschlag)", vorlage: "📋 Vorlage" };

function WhatsAppPage({ tenants, bewerber, navigateTo }) {
  const [chats, setChats] = useState([]);
  const [laden, setLaden] = useState(true);
  const [filter, setFilter] = useState("offen");
  const [suche, setSuche] = useState("");
  // Direktlink aus der Benachrichtigungs-Mail: ?seite=whatsapp&chat=41791234567
  const [aktiv, setAktiv] = useState(() => { try { const q = new URLSearchParams(window.location.search).get("chat"); if (q) { window.history.replaceState(null, "", window.location.pathname); return "+" + q.replace(/[^\d]/g, ""); } } catch (e) {} return null; });
  const [verlauf, setVerlauf] = useState([]);
  const [text, setText] = useState("");
  const [vorschlag, setVorschlag] = useState(null);
  const [busy, setBusy] = useState("");
  const dateiRef = React.useRef(null);
  const endeRef = React.useRef(null);

  // Telefonnummer -> Mieter / Bewerber
  const kontakte = React.useMemo(() => {
    const m = {};
    (bewerber || []).forEach(b => { const n = waNorm(b.phone || b.telefon); if (n && !m[n]) m[n] = { art: "Bewerber", name: [b.vorname, b.nachname].filter(Boolean).join(" "), id: b.id }; });
    (tenants || []).forEach(t => { const n = waNorm(t.phone); if (n) m[n] = { art: "Mieter", name: [t.vorname, t.nachname].filter(Boolean).join(" ") || t.name, id: t.id }; });
    return m;
  }, [tenants, bewerber]);

  const ladeChats = async () => {
    const { data, error } = await supabase.from("wa_chat_liste").select("*").order("letzte_at", { ascending: false }).limit(300);
    if (!error) setChats(data || []);
    setLaden(false);
  };
  const ladeVerlauf = async (tel) => {
    if (!tel) return;
    const { data } = await supabase.from("wa_nachrichten").select("id, richtung, text, typ, quelle, ki_eskalieren, ki_grund, created_at, name, medien_pfad, medien_mime, medien_name").eq("telefon", tel).order("created_at", { ascending: true }).limit(300);
    setVerlauf(data || []);
  };
  useEffect(() => { ladeChats(); const iv = setInterval(ladeChats, 15000); return () => clearInterval(iv); }, []);
  useEffect(() => { if (!aktiv) return; ladeVerlauf(aktiv); const iv = setInterval(() => ladeVerlauf(aktiv), 10000); return () => clearInterval(iv); }, [aktiv]);
  useEffect(() => { if (endeRef.current) endeRef.current.scrollIntoView({ block: "end" }); }, [verlauf.length, aktiv]);

  // Schadenmeldungen der Wohnung des Mieters (auch von Mitbewohnern), damit man sie im Chat sieht
  const [schaeden, setSchaeden] = useState([]);
  useEffect(() => {
    setSchaeden([]);
    const k = aktiv ? kontakte[waNorm(aktiv)] : null;
    if (!k || k.art !== "Mieter") return;
    (async () => {
      const { data: rm } = await supabase.from("rooms").select("apt_id").eq("tenant_id", k.id).limit(1);
      const t = (tenants || []).find(x => x.id === k.id) || {};
      const aptId = (rm && rm[0] && rm[0].apt_id) || t.apt_id || t.aptId || null;
      const q = supabase.from("schadenmeldungen").select("id, titel, status, created_at, tenant_id").neq("status", "erledigt").order("created_at", { ascending: false }).limit(10);
      const { data } = aptId ? await q.or(`apt_id.eq.${aptId},tenant_id.eq.${k.id}`) : await q.eq("tenant_id", k.id);
      setSchaeden(data || []);
    })().catch(() => {});
  }, [aktiv, kontakte]);

  const chatStatus = async (tel, felder) => {
    const { error } = await supabase.from("wa_chats").upsert({ telefon: tel, ...felder, updated_at: new Date().toISOString(), updated_by: "ImmoBase" }, { onConflict: "telefon" });
    if (error) toast("Speichern fehlgeschlagen", "error");
    ladeChats();
  };
  const oeffnen = (c) => {
    setAktiv(c.telefon); setText(""); setVorschlag(null); setVerlauf([]);
    if (c.ungelesen > 0) chatStatus(c.telefon, { gelesen_at: new Date().toISOString() });
  };

  const istOffen = (c) => !c.erledigt_at || new Date(c.letzte_ein_at || 0) > new Date(c.erledigt_at);
  const braucht = (c) => istOffen(c) && (c.letzte_richtung === "ein" || c.eskaliert);
  const gefiltert = chats.filter(c => {
    if (filter === "offen" && !braucht(c)) return false;
    if (filter === "eskaliert" && !(c.eskaliert && istOffen(c))) return false;
    if (suche.trim()) { const q = suche.toLowerCase(); const k = kontakte[c.telefon]; if (![c.telefon, c.name, k && k.name, c.letzte_text].some(x => String(x || "").toLowerCase().includes(q))) return false; }
    return true;
  });
  const anzOffen = chats.filter(braucht).length;
  const c = chats.find(x => x.telefon === aktiv);
  const k = aktiv ? kontakte[aktiv] : null;
  const letzteEin = c && c.letzte_ein_at ? new Date(c.letzte_ein_at) : null;
  const fensterOffen = letzteEin && (Date.now() - letzteEin.getTime()) < 24 * 3600000;
  const restStd = letzteEin ? Math.max(0, Math.floor((24 * 3600000 - (Date.now() - letzteEin.getTime())) / 3600000)) : 0;

  const kiVorschlag = async () => {
    const ein = [...verlauf].reverse().find(x => x.richtung === "ein" && x.typ === "text");
    if (!ein) { toast("Keine Kundennachricht zum Beantworten", "error"); return; }
    setBusy("ki");
    try {
      const idx = verlauf.indexOf(ein);
      // alle Kundennachrichten seit unserer letzten Antwort zusammen beantworten
      let start = idx; while (start > 0 && verlauf[start - 1].richtung === "ein") start--;
      const offen = verlauf.slice(start, idx + 1).filter(x => x.typ === "text").map(x => x.text).join("\n");
      const vorher = verlauf.slice(Math.max(0, start - 12), start).filter(x => x.text).map(x => ({ von: x.richtung === "ein" ? "kunde" : "wir", text: x.text }));
      const r = await kiAntwortHolen(offen, vorher);
      setVorschlag(r); setText(r.antwort || "");
    } catch (e) { toast(e.message || "KI-Fehler", "error"); }
    setBusy("");
  };
  const senden = async () => {
    const t = text.trim(); if (!t || !aktiv) return;
    setBusy("senden");
    try {
      await waFn({ aktion: "senden", telefon: aktiv, text: t, ki: vorschlag && t === String(vorschlag.antwort || "").trim() ? { eskalieren: vorschlag.eskalieren, grund: vorschlag.grund } : (vorschlag ? { eskalieren: false, grund: "KI-Vorschlag bearbeitet" } : null) });
      setText(""); setVorschlag(null); toast("Gesendet");
      await ladeVerlauf(aktiv); ladeChats();
    } catch (e) { toast(e.message, "error"); }
    setBusy("");
  };

  const dateiSenden = async (f) => {
    if (!f || !aktiv) return;
    if (f.size > 16 * 1024 * 1024) { toast("Datei zu gross (max. 16 MB)", "error"); return; }
    setBusy("datei");
    try {
      const name = f.name.replace(/[^\w.\-]+/g, "_").slice(-80);
      const pfad = `${aktiv.replace("+", "")}/aus-${Date.now()}-${name}`;
      const { error } = await supabase.storage.from("whatsapp").upload(pfad, f, { contentType: f.type || "application/octet-stream" });
      if (error) throw new Error("Upload fehlgeschlagen: " + error.message);
      await waFn({ aktion: "senden_datei", telefon: aktiv, pfad, mime: f.type || "", name: f.name, caption: text.trim() });
      setText(""); setVorschlag(null); toast("Datei gesendet");
      await ladeVerlauf(aktiv); ladeChats();
    } catch (e) { toast(e.message, "error"); }
    setBusy("");
    if (dateiRef.current) dateiRef.current.value = "";
  };

  // Initialen fuer den runden Avatar
  const initialen = (n) => { const t = String(n || "").replace(/[^\p{L}\s]/gu, "").trim().split(/\s+/).filter(Boolean); return t.length ? (t[0][0] + (t.length > 1 ? t[t.length - 1][0] : "")).toUpperCase() : "#"; };
  const tagLabel = (d) => { const x = new Date(d), h = new Date(); const g = new Date(); g.setDate(h.getDate() - 1);
    if (x.toDateString() === h.toDateString()) return "Heute"; if (x.toDateString() === g.toDateString()) return "Gestern";
    return x.toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long" }); };
  const nurZeit = (d) => new Date(d).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  const schmal = window.innerWidth <= 860;

  const Liste = (
    <div className="wa-liste">
      <div className="wa-kopf">
        <div className="seg voll klein">{[["offen", `Offen${anzOffen ? ` · ${anzOffen}` : ""}`], ["eskaliert", "Weitergeleitet"], ["alle", "Alle"]].map(([id, l]) =>
          <button key={id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>{l}</button>)}</div>
        <input className="fi" placeholder="Suchen: Name, Nummer, Text" value={suche} onChange={e => setSuche(e.target.value)} style={{ margin: "8px 0 0" }} />
      </div>
      <div className="wa-scroll">
        {laden && <div className="wa-leer">Lädt…</div>}
        {!laden && !gefiltert.length && <div className="wa-leer">{filter === "offen" ? "Keine offenen Chats 🎉" : "Keine Chats"}</div>}
        {gefiltert.map(x => {
          const kk = kontakte[x.telefon];
          const name = (kk && kk.name) || x.name || x.telefon;
          const ung = x.ungelesen > 0, esk = x.eskaliert && istOffen(x);
          return (
            <div key={x.telefon} onClick={() => oeffnen(x)} className={"wa-zeile" + (x.telefon === aktiv ? " aktiv" : "")}>
              <div className={"wa-av" + (kk ? " " + (kk.art === "Mieter" ? "mieter" : "bewerber") : "")}>{initialen(kk ? kk.name : x.name)}</div>
              <div className="wa-mitte">
                <div className="wa-z1"><span className={"wa-name" + (ung ? " fett" : "")}>{name}</span><span className={"wa-zeit" + (ung ? " neu" : "")}>{waZeit(x.letzte_at)}</span></div>
                <div className="wa-z2">
                  <span className="wa-vorschau">{x.letzte_richtung === "aus" ? "Du: " : ""}{x.letzte_text}</span>
                  {ung && <span className="wa-badge">{x.ungelesen}</span>}
                </div>
                {(kk || esk) && <div className="wa-art">{kk ? kk.art : ""}{esk && <span className="wa-tag warn" title="Die KI hat an euch weitergeleitet">Weitergeleitet</span>}</div>}
              </div>
            </div>);
        })}
      </div>
    </div>
  );

  // Nachrichten mit Tagestrennern
  const zeilen = []; let letzterTag = "";
  verlauf.forEach(m => { const t = new Date(m.created_at).toDateString(); if (t !== letzterTag) { zeilen.push({ trenner: tagLabel(m.created_at), key: "t" + m.id }); letzterTag = t; } zeilen.push(m); });

  const Chat = c ? (
    <div className="wa-chat">
      <div className="wa-chatkopf">
        {schmal && <button className="wa-zurueck" onClick={() => setAktiv(null)} aria-label="Zurück">←</button>}
        <div className={"wa-av" + (k ? " " + (k.art === "Mieter" ? "mieter" : "bewerber") : "")}>{initialen(k ? k.name : c.name)}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="wa-titel">{(k && k.name) || c.name || c.telefon}</div>
          <div className="wa-sub">{c.telefon}{k ? ` · ${k.art}` : " · nicht zugeordnet"}{c.name && k && k.name !== c.name ? ` · WhatsApp: ${c.name}` : ""}</div>
          {schaeden.length > 0 && <div className="wa-sub" style={{ cursor: navigateTo ? "pointer" : "default", color: "#8a3a2e" }} title={schaeden.map(x => `${x.titel} (${x.status === "in_arbeit" ? "in Bearbeitung" : x.status})`).join("\n")} onClick={() => navigateTo && navigateTo("schaeden", null)}>🔧 {schaeden.length} offene Schadenmeldung{schaeden.length > 1 ? "en" : ""}: {schaeden.map(x => x.titel).join(", ")}</div>}
        </div>
        <div className="wa-aktionen">
          {k && navigateTo && <button className="btn btn-g btn-sm" style={{ width: "auto" }} onClick={() => navigateTo(k.art === "Mieter" ? "mieter" : "bewerber", k.id)}>Profil</button>}
          <button className={"btn btn-sm " + (c.ki_aus ? "btn-g" : "btn-g")} style={{ width: "auto" }} title="Automatische KI-Antworten für diesen Chat" onClick={() => chatStatus(c.telefon, { ki_aus: !c.ki_aus })}>{c.ki_aus ? "KI aus" : "KI an"}</button>
          {istOffen(c) ? <button className="btn btn-p btn-sm" style={{ width: "auto" }} onClick={() => chatStatus(c.telefon, { erledigt_at: new Date().toISOString(), gelesen_at: new Date().toISOString() })}>Erledigt</button>
            : <button className="btn btn-g btn-sm" style={{ width: "auto" }} onClick={() => chatStatus(c.telefon, { erledigt_at: null })}>Wieder öffnen</button>}
        </div>
      </div>
      <div className="wa-verlauf">
        {zeilen.map(m => {
          if (m.trenner) return <div key={m.key} className="wa-tagtrenner"><span>{m.trenner}</span></div>;
          const aus = m.richtung === "aus";
          return (
            <div key={m.id} className={"wa-blase " + (aus ? "aus" : "ein") + (m.quelle === "ki_fehler" ? " fehler" : "")}>
              {m.medien_pfad && <div style={{ marginBottom: m.text && !/^(📷|🎬|🎤|📄|Sticker)/.test(m.text) ? 4 : 0 }}><WaMedium m={m} /></div>}
              {m.medien_pfad && /^(📷 Bild|🎬 Video|🎤 Sprachnachricht|📄 |Sticker)/.test(m.text || "") ? null
                : m.typ === "unsupported" ? <span style={{ color: "#8a8174", fontStyle: "italic" }}>Nachricht von WhatsApp nicht übermittelt</span>
                : (m.text || `[${m.typ || "?"}]`)}
              <div className="wa-meta">{aus && WA_QUELLE[m.quelle] ? WA_QUELLE[m.quelle] + " · " : ""}{nurZeit(m.created_at)}</div>
              {aus && m.ki_eskalieren && <div className="wa-esk">An euch weitergeleitet{m.ki_grund ? `: ${m.ki_grund}` : ""}</div>}
            </div>);
        })}
        <div ref={endeRef} />
      </div>
      <div className="wa-eingabe">
        {!fensterOffen && <div className="wa-hinweis warn">Letzte Nachricht des Kontakts ist älter als 24 Stunden. Freier Text ist erst wieder möglich, wenn der Kontakt schreibt.</div>}
        {vorschlag && <div className="wa-hinweis" style={{ color: vorschlag.eskalieren ? "#a4442e" : "#3a5230" }}>KI-Vorschlag{vorschlag.eskalieren ? " · KI würde weiterleiten" : ""}{vorschlag.grund ? ` · ${vorschlag.grund}` : ""}. Du kannst den Text anpassen.</div>}
        <textarea className="fi" rows={Math.min(8, Math.max(2, text.split("\n").length))} value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (!busy && fensterOffen && text.trim()) senden(); } }}
          placeholder={fensterOffen ? "Nachricht schreiben…" : "Kein freier Text möglich"} disabled={!fensterOffen} style={{ fontFamily: "inherit", lineHeight: 1.45, margin: 0, resize: "none" }} />
        <div className="wa-knoepfe">
          <button className="btn btn-g btn-sm" style={{ width: "auto" }} disabled={!!busy || !fensterOffen} onClick={kiVorschlag}>{busy === "ki" ? "KI denkt…" : "KI-Vorschlag"}</button>
          <input ref={dateiRef} type="file" accept="image/jpeg,image/png,video/mp4,application/pdf,.doc,.docx,.xls,.xlsx" style={{ display: "none" }} onChange={e => dateiSenden(e.target.files && e.target.files[0])} />
          <button className="btn btn-g btn-sm" style={{ width: "auto" }} disabled={!!busy || !fensterOffen} title="Bild, Video oder PDF senden. Der Text im Feld wird als Bildunterschrift mitgeschickt." onClick={() => dateiRef.current && dateiRef.current.click()}>{busy === "datei" ? "Sendet…" : "Datei"}</button>
          {text && <button className="btn btn-g btn-sm" style={{ width: "auto" }} disabled={!!busy} onClick={() => { setText(""); setVorschlag(null); }}>Verwerfen</button>}
          <span style={{ flex: 1 }} />
          {fensterOffen && <span className="wa-fenster">noch {restStd} Std.</span>}
          <button className="btn btn-p btn-sm" style={{ width: "auto" }} disabled={!!busy || !fensterOffen || !text.trim()} onClick={senden}>{busy === "senden" ? "Sendet…" : "Senden"}</button>
        </div>
      </div>
    </div>
  ) : (
    <div className="wa-chat wa-nichts"><span>Chat links auswählen</span></div>
  );

  return (
    <div>
      <div className="pt">WhatsApp</div>
      {!(schmal && aktiv) && <div className="ps">Alle Nachrichten an +41 76 688 70 91. Antwortet ihr selbst, pausiert die automatische KI für diesen Chat 6 Stunden.</div>}
      <div className={"wa-rahmen" + (schmal ? " schmal" : "")}>
        {(!aktiv || !schmal) && Liste}
        {(aktiv || !schmal) && Chat}
      </div>
    </div>
  );
}
