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

  const Liste = (
    <div style={{ flex: "0 0 320px", minWidth: 0, maxWidth: "100%" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {[["offen", `Offen${anzOffen ? ` (${anzOffen})` : ""}`], ["eskaliert", "Weitergeleitet"], ["alle", "Alle"]].map(([id, l]) =>
          <button key={id} className={"btn btn-sm " + (filter === id ? "btn-p" : "btn-g")} style={{ width: "auto" }} onClick={() => setFilter(id)}>{l}</button>)}
      </div>
      <input className="fi" placeholder="Suchen (Name, Nummer, Text)" value={suche} onChange={e => setSuche(e.target.value)} style={{ marginBottom: 8 }} />
      {laden && <div className="card" style={{ color: "#8a8174" }}>Lädt…</div>}
      {!laden && !gefiltert.length && <div className="card" style={{ color: "#8a8174", fontSize: 13 }}>{filter === "offen" ? "Keine offenen Chats 🎉" : "Keine Chats"}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {gefiltert.map(x => {
          const kk = kontakte[x.telefon];
          return (
            <div key={x.telefon} onClick={() => oeffnen(x)} className="card" style={{ cursor: "pointer", padding: "9px 11px", border: x.telefon === aktiv ? "1.5px solid #c89653" : undefined, background: x.telefon === aktiv ? "#fbf6ec" : undefined }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(kk && kk.name) || x.name || x.telefon}</div>
                <div style={{ fontSize: 11, color: "#8a8174", whiteSpace: "nowrap" }}>{waZeit(x.letzte_at)}</div>
              </div>
              <div style={{ fontSize: 11, color: "#8a8174", marginTop: 1 }}>{kk ? `${kk.art} · ` : ""}{x.telefon}</div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4, alignItems: "center" }}>
                <div style={{ fontSize: 12.5, color: "#5a5448", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.letzte_richtung === "aus" ? "↩ " : ""}{x.letzte_text}</div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {x.eskaliert && istOffen(x) && <span title="Die KI hat an euch weitergeleitet" style={{ fontSize: 10.5, background: "#fbeae6", color: "#8a3a2e", borderRadius: 10, padding: "1px 7px" }}>⚠</span>}
                  {x.ungelesen > 0 && <span style={{ fontSize: 10.5, background: "#25d366", color: "#fff", borderRadius: 10, padding: "1px 7px", fontWeight: 600 }}>{x.ungelesen}</span>}
                </div>
              </div>
            </div>);
        })}
      </div>
    </div>
  );

  const Chat = c ? (
    <div style={{ flex: "1 1 420px", minWidth: 0 }}>
      <div className="card" style={{ padding: "10px 12px", marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 600 }}>{(k && k.name) || c.name || c.telefon}</div>
            <div style={{ fontSize: 12, color: "#8a8174" }}>{c.telefon}{c.name && k && k.name !== c.name ? ` · WhatsApp-Name: ${c.name}` : ""}{k ? ` · ${k.art}` : " · nicht zugeordnet"}</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {k && navigateTo && <button className="btn btn-g btn-sm" style={{ width: "auto" }} onClick={() => navigateTo(k.art === "Mieter" ? "mieter" : "bewerber", k.id)}>Zu {k.art === "Mieter" ? "Mieter" : "Bewerber"}</button>}
            <button className="btn btn-g btn-sm" style={{ width: "auto" }} title="Automatische KI-Antworten für diesen Chat" onClick={() => chatStatus(c.telefon, { ki_aus: !c.ki_aus })}>{c.ki_aus ? "🤖 KI aus" : "🤖 KI an"}</button>
            {istOffen(c) ? <button className="btn btn-p btn-sm" style={{ width: "auto" }} onClick={() => chatStatus(c.telefon, { erledigt_at: new Date().toISOString(), gelesen_at: new Date().toISOString() })}>✓ Erledigt</button>
              : <button className="btn btn-g btn-sm" style={{ width: "auto" }} onClick={() => chatStatus(c.telefon, { erledigt_at: null })}>Wieder öffnen</button>}
          </div>
        </div>
      </div>
      <div style={{ background: "#efeae2", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 6, height: "min(58vh, 560px)", overflowY: "auto" }}>
        {verlauf.map(m => {
          const aus = m.richtung === "aus";
          return (
            <div key={m.id} style={{ alignSelf: aus ? "flex-end" : "flex-start", maxWidth: "85%", background: aus ? (m.quelle === "ki_fehler" ? "#fbeae6" : "#d9fdd3") : "#fff", borderRadius: 8, padding: "7px 10px", fontSize: 13.5, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word", boxShadow: "0 1px 1px rgba(0,0,0,.06)" }}>
              {m.medien_pfad && <div style={{ marginBottom: m.text && !/^(📷|🎬|🎤|📄|Sticker)/.test(m.text) ? 4 : 0 }}><WaMedium m={m} /></div>}
              {m.medien_pfad && /^(📷 Bild|🎬 Video|🎤 Sprachnachricht|📄 |Sticker)/.test(m.text || "") ? null
                : m.typ === "unsupported" ? <span style={{ color: "#8a8174", fontStyle: "italic" }}>Nachricht von WhatsApp nicht übermittelt</span>
                : (m.text || `[${m.typ || "?"}]`)}
              <div style={{ fontSize: 10.5, color: "#8a8174", marginTop: 3, textAlign: "right" }}>{aus && WA_QUELLE[m.quelle] ? WA_QUELLE[m.quelle] + " · " : ""}{waZeit(m.created_at)}</div>
              {aus && m.ki_eskalieren && <div style={{ fontSize: 10.5, color: "#a4442e", marginTop: 2 }}>⚠ an euch weitergeleitet{m.ki_grund ? `: ${m.ki_grund}` : ""}</div>}
            </div>);
        })}
        <div ref={endeRef} />
      </div>
      <div className="card" style={{ marginTop: 8, padding: "10px 12px" }}>
        {!fensterOffen && <div style={{ fontSize: 12, color: "#a4442e", marginBottom: 6 }}>Die letzte Nachricht dieses Kontakts ist älter als 24 Stunden. WhatsApp erlaubt dann nur genehmigte Vorlagen, kein freier Text.</div>}
        {fensterOffen && <div style={{ fontSize: 11, color: "#8a8174", marginBottom: 6 }}>Freier Text möglich, noch ca. {restStd} Std. (24h-Fenster seit der letzten Kundennachricht)</div>}
        {vorschlag && <div style={{ fontSize: 11.5, marginBottom: 6, color: vorschlag.eskalieren ? "#a4442e" : "#3a5230" }}>🤖 KI-Vorschlag{vorschlag.eskalieren ? " · ⚠ KI würde weiterleiten" : ""}{vorschlag.grund ? ` · ${vorschlag.grund}` : ""}. Du kannst den Text anpassen.</div>}
        <textarea className="fi" rows={Math.min(10, Math.max(3, text.split("\n").length + 1))} value={text} onChange={e => setText(e.target.value)} placeholder="Antwort schreiben…" disabled={!fensterOffen} style={{ fontFamily: "inherit", lineHeight: 1.45 }} />
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <button className="btn btn-g btn-sm" style={{ width: "auto" }} disabled={!!busy || !fensterOffen} onClick={kiVorschlag}>{busy === "ki" ? "KI denkt…" : "🤖 KI-Vorschlag"}</button>
          <button className="btn btn-p btn-sm" style={{ width: "auto" }} disabled={!!busy || !fensterOffen || !text.trim()} onClick={senden}>{busy === "senden" ? "Sendet…" : "Senden"}</button>
          <input ref={dateiRef} type="file" accept="image/jpeg,image/png,video/mp4,application/pdf,.doc,.docx,.xls,.xlsx" style={{ display: "none" }} onChange={e => dateiSenden(e.target.files && e.target.files[0])} />
          <button className="btn btn-g btn-sm" style={{ width: "auto" }} disabled={!!busy || !fensterOffen} title="Bild, Video oder PDF senden. Der Text im Feld wird als Bildunterschrift mitgeschickt." onClick={() => dateiRef.current && dateiRef.current.click()}>{busy === "datei" ? "Sendet…" : "📎 Datei"}</button>
          {text && <button className="btn btn-g btn-sm" style={{ width: "auto" }} disabled={!!busy} onClick={() => { setText(""); setVorschlag(null); }}>Verwerfen</button>}
        </div>
      </div>
    </div>
  ) : (
    <div style={{ flex: "1 1 420px", minWidth: 0 }}><div className="card" style={{ color: "#8a8174", fontSize: 13 }}>Chat links auswählen.</div></div>
  );

  return (
    <div>
      <div className="pt">WhatsApp</div>
      <div className="ps">Alle Nachrichten an +41 76 688 70 91. Antworten von hier gehen von der D&amp;T-Nummer raus. Antwortet ihr selbst (hier oder vom Handy), pausiert die automatische KI für diesen Chat 6 Stunden.</div>
      <div style={{ display: "flex", gap: 14, marginTop: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
        {(!aktiv || window.innerWidth > 860) && Liste}
        {aktiv && window.innerWidth <= 860 && <button className="btn btn-g btn-sm" style={{ width: "auto", marginBottom: 6 }} onClick={() => setAktiv(null)}>← Alle Chats</button>}
        {(aktiv || window.innerWidth > 860) && Chat}
      </div>
    </div>
  );
}
