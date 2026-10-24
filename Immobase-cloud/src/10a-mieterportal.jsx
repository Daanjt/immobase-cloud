// ─── MIETERPORTAL (Tab beim Mieter + offene Schadenmeldungen) ───────────────
// Portal: mieter.dthomes.ch/p/<portal_token>. Login per Code an die Mieter-Mail oder Face ID.
const PORTAL_BASIS = "https://mieter.dthomes.ch";
const SCHADEN_STATUS = [["neu", "Neu"], ["in_arbeit", "In Arbeit"], ["erledigt", "Erledigt"]];
const DRINGLICHKEIT = { normal: ["Normal", "#ece8df", "#5a5448"], dringend: ["Dringend", "#f6edd6", "#7a5b14"], notfall: ["Notfall", "#f6e3df", "#9b4a3e"] };
const fmtZeitP = (v) => { const d = new Date(v || ""); return isNaN(d) ? "" : d.toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); };

function neuerPortalToken() {
  const a = new Uint8Array(16); crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function SchadenKarte({ s, tenantName, onTenant, onGeaendert }) {
  const [antwort, setAntwort] = useState(s.antwort || "");
  const [notiz, setNotiz] = useState(s.notiz_intern || "");
  const [fotos, setFotos] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dr, drBg, drC] = DRINGLICHKEIT[s.dringlichkeit] || DRINGLICHKEIT.normal;
  async function speichern(felder) {
    setBusy(true);
    const patch = { ...felder, updated_at: new Date().toISOString() };
    if (felder.status === "erledigt") patch.erledigt_at = new Date().toISOString();
    if (felder.status && felder.status !== "erledigt") patch.erledigt_at = null;
    const { error } = await supabase.from("schadenmeldungen").update(patch).eq("id", s.id);
    setBusy(false);
    if (error) { toast("Speichern fehlgeschlagen", "error"); return; }
    toast("Gespeichert"); onGeaendert && onGeaendert();
  }
  async function fotosLaden() {
    const urls = [];
    for (const p of (s.fotos || [])) { const { data } = await supabase.storage.from("documents").createSignedUrl(p, 600); if (data?.signedUrl) urls.push(data.signedUrl); }
    setFotos(urls);
  }
  return (
    <div style={{ border: "1px solid var(--line-soft,#e8e3d8)", borderRadius: 10, padding: "12px 14px", marginBottom: 10, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{s.titel}</div>
          <div style={{ fontSize: 11.5, color: "#8a8174", marginTop: 2 }}>
            {fmtZeitP(s.created_at)}{s.ort_im_objekt ? ` · ${s.ort_im_objekt}` : ""}{tenantName ? <> · <span style={{ textDecoration: "underline", cursor: "pointer" }} onClick={onTenant}>{tenantName}</span></> : null}{s.room_id ? ` · ${s.room_id}` : (s.apt_id ? ` · ${s.apt_id}` : "")}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: drBg, color: drC }}>{dr}</span>
          <select className="fi" style={{ width: "auto", padding: "4px 8px", fontSize: 12 }} value={s.status} disabled={busy} onChange={(e) => speichern({ status: e.target.value })}>
            {SCHADEN_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      </div>
      {s.beschreibung && <div style={{ fontSize: 13, marginTop: 8, whiteSpace: "pre-wrap" }}>{s.beschreibung}</div>}
      {(s.fotos || []).length > 0 && (fotos
        ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>{fotos.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 6, border: "1px solid #e8e3d8" }} /></a>)}</div>
        : <button className="btn btn-g btn-sm" style={{ width: "auto", marginTop: 8 }} onClick={fotosLaden}>📷 {s.fotos.length} Foto(s) anzeigen</button>)}
      <div className="frow" style={{ marginTop: 10 }}>
        <div className="fg"><label className="fl">Antwort an Mieter (im Portal sichtbar)</label>
          <input className="fi" value={antwort} onChange={(e) => setAntwort(e.target.value)} placeholder="z.B. Der Sanitär kommt am Dienstag" /></div>
        <div className="fg"><label className="fl">Interne Notiz</label>
          <input className="fi" value={notiz} onChange={(e) => setNotiz(e.target.value)} /></div>
      </div>
      {(antwort !== (s.antwort || "") || notiz !== (s.notiz_intern || "")) &&
        <button className="btn btn-p btn-sm" style={{ width: "auto" }} disabled={busy} onClick={() => speichern({ antwort: antwort.trim() || null, notiz_intern: notiz.trim() || null })}>Speichern</button>}
    </div>
  );
}

function MieterPortalTab({ tenant }) {
  const [p, setP] = useState(null);
  const [sitz, setSitz] = useState([]);
  const [sch, setSch] = useState([]);
  const [busy, setBusy] = useState(false);
  async function laden() {
    const [{ data: t }, { data: s }, { data: m }] = await Promise.all([
      supabase.from("tenants").select("portal_token, portal_gesperrt").eq("id", tenant.id).maybeSingle(),
      supabase.from("portal_sitzungen").select("id, geraet, art, created_at, zuletzt, ablauf, widerrufen").eq("tenant_id", tenant.id).eq("widerrufen", false).gte("ablauf", new Date().toISOString()).order("zuletzt", { ascending: false }),
      supabase.from("schadenmeldungen").select("*").eq("tenant_id", tenant.id).order("created_at", { ascending: false }),
    ]);
    setP(t || {}); setSitz(s || []); setSch(m || []);
  }
  useEffect(() => { laden(); }, [tenant.id]);
  if (!p) return <div style={{ fontSize: 13, color: "#8a8174" }}>Lädt…</div>;
  const link = p.portal_token ? `${PORTAL_BASIS}/p/${p.portal_token}` : "";
  const en = tenant.sprache === "en";
  async function kopieren() { try { await navigator.clipboard.writeText(link); toast("Link kopiert"); } catch (_) { prompt("Link kopieren:", link); } }
  async function senden() {
    if (!tenant.email) { toast("Keine E-Mail hinterlegt", "error"); return; }
    if (!confirm(`Portal-Link an ${tenant.email} senden?`)) return;
    setBusy(true);
    const text = en
      ? `Hi ${tenant.vorname || ""},\n\nfrom now on you can find everything about your rental in our tenant portal: your contract and documents, and you can report damage there directly.\n\nYour personal link:\n${link}\n\nWhen you open it for the first time on a device, we send you a short code by email to confirm it's you. You can also set up Face ID.\n\nBest regards\nYour D&T Homes Team`
      : `Hallo ${tenant.vorname || ""},\n\nab sofort findest du alles zu deiner Miete in unserem Mieterportal: deinen Vertrag und deine Dokumente, und du kannst dort direkt Schäden melden.\n\nDein persönlicher Link:\n${link}\n\nBeim ersten Öffnen auf einem Gerät schicken wir dir kurz einen Code per E-Mail, damit wir sicher sind, dass du es bist. Danach kannst du auch Face ID einrichten.\n\nLiebe Grüsse\nDein D&T Homes Team`;
    const { data, error } = await supabase.functions.invoke("send-message", { body: { to: tenant.email, betreff: en ? "Your D&T Homes tenant portal" : "Dein D&T Homes Mieterportal", text, sprache: en ? "en" : "de" } });
    setBusy(false);
    if (error || data?.error) toast("Versand fehlgeschlagen", "error"); else toast("Link gesendet");
  }
  async function sperren(an) {
    setBusy(true);
    const { error } = await supabase.from("tenants").update({ portal_gesperrt: an }).eq("id", tenant.id);
    setBusy(false); if (error) toast("Fehlgeschlagen", "error"); else { toast(an ? "Portal gesperrt" : "Portal entsperrt"); laden(); }
  }
  async function neuerLink() {
    if (!confirm("Neuen Link ausstellen? Der alte Link funktioniert dann nicht mehr und alle Geräte werden abgemeldet.")) return;
    setBusy(true);
    const { error } = await supabase.from("tenants").update({ portal_token: neuerPortalToken() }).eq("id", tenant.id);
    if (!error) await supabase.from("portal_sitzungen").update({ widerrufen: true }).eq("tenant_id", tenant.id);
    setBusy(false); if (error) toast("Fehlgeschlagen", "error"); else { toast("Neuer Link ausgestellt"); laden(); }
  }
  async function geraetAbmelden(id) {
    const { error } = await supabase.from("portal_sitzungen").update({ widerrufen: true }).eq("id", id);
    if (error) toast("Fehlgeschlagen", "error"); else laden();
  }
  const box = { border: "1px solid var(--line-soft,#e8e3d8)", borderRadius: 10, padding: "14px 16px", marginBottom: 14, background: "var(--surface,#fff)" };
  const h = (t) => <div style={{ fontSize: 10.5, letterSpacing: ".18em", textTransform: "uppercase", color: "#8a8174", fontWeight: 600, marginBottom: 10 }}>{t}</div>;
  return (
    <div>
      <div style={box}>
        {h("Zugang zum Mieterportal")}
        {p.portal_gesperrt && <div style={{ fontSize: 12.5, color: "#9b4a3e", fontWeight: 600, marginBottom: 8 }}>🔒 Gesperrt: Der Mieter kann sich nicht anmelden.</div>}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <code style={{ fontSize: 12, background: "#f4f0e8", padding: "6px 10px", borderRadius: 6, wordBreak: "break-all", flex: "1 1 260px" }}>{link || "–"}</code>
          <button className="btn btn-g btn-sm" style={{ width: "auto" }} onClick={kopieren} disabled={!link}>Kopieren</button>
          <button className="btn btn-p btn-sm" style={{ width: "auto" }} onClick={senden} disabled={busy || !link || p.portal_gesperrt}>Per Mail senden</button>
        </div>
        <div style={{ fontSize: 11.5, color: "#8a8174", marginTop: 8, lineHeight: 1.5 }}>Beim ersten Öffnen auf einem Gerät bekommt der Mieter einen Code an {tenant.email || "seine E-Mail"}. Ein weitergeleiteter Link allein reicht also nicht. Zugang endet automatisch 90 Tage nach dem Auszug.</div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button className="btn btn-g btn-sm" style={{ width: "auto" }} disabled={busy} onClick={() => sperren(!p.portal_gesperrt)}>{p.portal_gesperrt ? "Entsperren" : "Sperren"}</button>
          <button className="btn btn-g btn-sm" style={{ width: "auto" }} disabled={busy} onClick={neuerLink}>Neuen Link ausstellen</button>
        </div>
      </div>
      <div style={box}>
        {h(`Angemeldete Geräte (${sitz.length})`)}
        {sitz.length === 0 && <div style={{ fontSize: 12.5, color: "#8a8174" }}>Noch kein Gerät angemeldet.</div>}
        {sitz.map((s) => (
          <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid #f0eadd", fontSize: 12.5 }}>
            <span><b>{s.geraet || "Gerät"}</b> · {s.art === "passkey" ? "Face ID" : "Code"} · zuletzt {fmtZeitP(s.zuletzt)}</span>
            <button className="btn btn-g btn-sm" style={{ width: "auto" }} onClick={() => geraetAbmelden(s.id)}>Abmelden</button>
          </div>
        ))}
      </div>
      <div style={box}>
        {h(`Schadenmeldungen (${sch.length})`)}
        {sch.length === 0 && <div style={{ fontSize: 12.5, color: "#8a8174" }}>Keine Meldungen.</div>}
        {sch.map((s) => <SchadenKarte key={s.id + ":" + s.updated_at} s={s} onGeaendert={laden} />)}
      </div>
    </div>
  );
}

// Offene Schadenmeldungen aller Mieter (oben auf der Todo-Seite)
function OffeneSchadenmeldungen({ tenants, navigateTo }) {
  const [liste, setListe] = useState([]);
  async function laden() {
    const { data } = await supabase.from("schadenmeldungen").select("*").neq("status", "erledigt").order("created_at", { ascending: true });
    setListe(data || []);
  }
  useEffect(() => { laden(); }, []);
  if (!liste.length) return null;
  const name = (id) => { const t = (tenants || []).find((x) => x.id === id); return t ? `${t.vorname || ""} ${t.nachname || ""}`.trim() : id; };
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🔧 Offene Schadenmeldungen ({liste.length})</div>
      {liste.map((s) => <SchadenKarte key={s.id + ":" + s.updated_at} s={s} tenantName={name(s.tenant_id)} onTenant={() => navigateTo && navigateTo("mieter", s.tenant_id)} onGeaendert={laden} />)}
    </div>
  );
}
