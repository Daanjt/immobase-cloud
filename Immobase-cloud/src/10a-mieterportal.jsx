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

function SchadenKarte({ s, tenantName, onTenant, onGeaendert, onWeiterleiten }) {
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
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {(antwort !== (s.antwort || "") || notiz !== (s.notiz_intern || "")) &&
          <button className="btn btn-p btn-sm" style={{ width: "auto" }} disabled={busy} onClick={() => speichern({ antwort: antwort.trim() || null, notiz_intern: notiz.trim() || null })}>Speichern</button>}
        {onWeiterleiten && <button className="btn btn-g btn-sm" style={{ width: "auto" }} onClick={() => onWeiterleiten(s)}>✉️ {s.weitergeleitet_at ? "Nochmals weiterleiten" : "An Verwaltung weiterleiten"}</button>}
        {s.weitergeleitet_at && <span style={{ fontSize: 11.5, color: "#5a6e4a" }}>✓ Weitergeleitet an {s.weitergeleitet_an} am {fmtZeitP(s.weitergeleitet_at)}</span>}
      </div>
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


// ─── SCHÄDEN (eigene Seite) ───────────────────────────────────────────────
const aptAdresse = (apts, aptId) => { const a = (apts || []).find((x) => x.id === aptId); return a ? (a.adresse || "") : ""; };

function WeiterleitenDialog({ s, tenant, apt, liegenschaft, onClose, onGesendet }) {
  const kontakt = liegenschaft || {};
  const anrede = kontakt.kontakt_name ? `Hallo ${kontakt.kontakt_name}` : "Guten Tag";
  const wo = [apt?.adresse, [apt?.plz, apt?.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const mieterName = tenant ? `${tenant.vorname || ""} ${tenant.nachname || ""}`.trim() : "";
  const zeilen = [
    `${anrede},`, "",
    `Bei uns ist an der ${wo || "Liegenschaft"} folgende Schadenmeldung eingegangen:`, "",
    `Schaden: ${s.titel}`,
    s.ort_im_objekt ? `Ort: ${s.ort_im_objekt}${apt?.stockwerk ? ` (${apt.stockwerk})` : ""}` : (apt?.stockwerk ? `Stockwerk: ${apt.stockwerk}` : null),
    s.dringlichkeit && s.dringlichkeit !== "normal" ? `Dringlichkeit: ${DRINGLICHKEIT[s.dringlichkeit][0]}` : null,
    s.beschreibung ? `Beschreibung: ${s.beschreibung}` : null,
    mieterName ? `Bewohner/in: ${mieterName}${tenant?.phone ? `, ${tenant.phone}` : ""}` : null,
    "",
    (s.fotos || []).length ? `Die Fotos findest du im Anhang.` : null,
    "Wäre es möglich, dass ihr das anschaut und einen Handwerker organisiert? Für den Zugang zur Wohnung kann sich der Handwerker gerne direkt bei der Bewohnerin bzw. dem Bewohner oder bei uns melden.", "",
    "Danke dir im Voraus!", "",
    "Liebe Grüsse", "Daan Theijse", "Co-Founder | D&T Homes",
  ].filter((z) => z !== null);
  const [an, setAn] = useState(kontakt.kontakt_email || "");
  const [cc, setCc] = useState("");
  const [betreff, setBetreff] = useState(`Schadenmeldung ${apt?.adresse || ""}: ${s.titel}`.replace(/\s+/g, " ").trim());
  const [text, setText] = useState(zeilen.join("\n"));
  const [fotos, setFotos] = useState(true);
  const [busy, setBusy] = useState(false);
  async function senden() {
    if (!an.trim()) { toast("Bitte Empfänger angeben", "error"); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("schaden-weiterleiten", { body: { id: s.id, an, cc, betreff, text, fotos } });
    setBusy(false);
    if (error || data?.error) { toast(data?.error || "Versand fehlgeschlagen", "error"); return; }
    toast(`Weitergeleitet${data.fotos ? ` mit ${data.fotos} Foto(s)` : ""}${data.ausgelassen ? ` (${data.ausgelassen} Foto(s) zu gross)` : ""}`);
    onGesendet && onGesendet(); onClose();
  }
  return (
    <div className="ov" onClick={onClose}>
      <div className="modal" style={{ width: 640, padding: "26px 28px" }} onClick={(e) => e.stopPropagation()}>
        <div className="ct" style={{ marginTop: 0 }}>Schaden an Verwaltung weiterleiten</div>
        {!kontakt.kontakt_email && <div style={{ fontSize: 12, color: "#9b4a3e", marginBottom: 10 }}>Für {apt?.adresse || "diese Liegenschaft"} ist noch keine Ansprechperson hinterlegt. Du kannst sie unter „Liegenschaften“ erfassen oder hier eine Adresse eingeben.</div>}
        {kontakt.kontakt_email && <div style={{ fontSize: 12, color: "#8a8174", marginBottom: 10 }}>Ansprechperson: {[kontakt.kontakt_name, kontakt.kontakt_firma].filter(Boolean).join(", ")}{kontakt.kontakt_telefon ? ` · ${kontakt.kontakt_telefon}` : ""}</div>}
        <div className="frow">
          <div className="fg"><label className="fl">An</label><input className="fi" value={an} onChange={(e) => setAn(e.target.value)} placeholder="verwaltung@beispiel.ch" /></div>
          <div className="fg"><label className="fl">CC (optional)</label><input className="fi" value={cc} onChange={(e) => setCc(e.target.value)} /></div>
        </div>
        <div className="fg"><label className="fl">Betreff</label><input className="fi" value={betreff} onChange={(e) => setBetreff(e.target.value)} /></div>
        <div className="fg"><label className="fl">Text</label><textarea className="fi" rows={14} value={text} onChange={(e) => setText(e.target.value)} style={{ fontFamily: "inherit", lineHeight: 1.5 }} /></div>
        {(s.fotos || []).length > 0 && <label style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={fotos} onChange={(e) => setFotos(e.target.checked)} /> {s.fotos.length} Foto(s) als Anhang mitschicken</label>}
        <div style={{ fontSize: 11.5, color: "#8a8174", marginTop: 8 }}>Absender noreply@dthomes.ch, Antworten gehen an info@dthomes.ch, Daan in BCC. Status wechselt auf „In Arbeit“.</div>
        <div className="ma">
          <button className="btn btn-g" disabled={busy} onClick={onClose}>Abbrechen</button>
          <button className="btn btn-p" disabled={busy} onClick={senden}>{busy ? "Sendet…" : "Senden"}</button>
        </div>
      </div>
    </div>
  );
}

function LiegenschaftKarte({ adresse, wert, onGespeichert }) {
  const leer = { kontakt_name: "", kontakt_firma: "", kontakt_email: "", kontakt_telefon: "", hausinfos: "", hausinfos_en: "" };
  const [f, setF] = useState({ ...leer, ...Object.fromEntries(Object.entries(wert || {}).map(([k, v]) => [k, v ?? ""])) });
  const [offen, setOffen] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function speichern() {
    setBusy(true);
    const row = { adresse, updated_at: new Date().toISOString() };
    Object.keys(leer).forEach((k) => { row[k] = String(f[k] || "").trim() || null; });
    const { error } = await supabase.from("liegenschaften").upsert(row, { onConflict: "adresse" });
    setBusy(false);
    if (error) { toast("Speichern fehlgeschlagen", "error"); return; }
    toast("Gespeichert"); setOffen(false); onGespeichert && onGespeichert();
  }
  const k = wert || {};
  return (
    <div style={{ borderTop: "1px solid #efe8da", padding: "12px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 13 }}>
          <b>{adresse}</b>
          <div style={{ fontSize: 12, color: k.kontakt_email ? "#5a5448" : "#9b4a3e", marginTop: 2 }}>
            {k.kontakt_email ? [k.kontakt_name, k.kontakt_firma, k.kontakt_email, k.kontakt_telefon].filter(Boolean).join(" · ") : "Keine Ansprechperson hinterlegt"}
            {k.hausinfos ? " · Hausinfos ✓" : ""}
          </div>
        </div>
        <button className="btn btn-g btn-sm" style={{ width: "auto" }} onClick={() => setOffen((o) => !o)}>{offen ? "Schliessen" : "Bearbeiten"}</button>
      </div>
      {offen && (
        <div style={{ marginTop: 10 }}>
          <div className="frow">
            <div className="fg"><label className="fl">Ansprechperson</label><input className="fi" value={f.kontakt_name} onChange={set("kontakt_name")} placeholder="z.B. Laura Muster" /></div>
            <div className="fg"><label className="fl">Firma / Verwaltung</label><input className="fi" value={f.kontakt_firma} onChange={set("kontakt_firma")} /></div>
          </div>
          <div className="frow">
            <div className="fg"><label className="fl">E-Mail (für Schadenmeldungen)</label><input className="fi" value={f.kontakt_email} onChange={set("kontakt_email")} /></div>
            <div className="fg"><label className="fl">Telefon</label><input className="fi" value={f.kontakt_telefon} onChange={set("kontakt_telefon")} /></div>
          </div>
          <div className="frow">
            <div className="fg"><label className="fl">Hausinfos für Mieter (Deutsch)</label><textarea className="fi" rows={5} value={f.hausinfos} onChange={set("hausinfos")} placeholder={"z.B. Abfall: Dienstag und Freitag, Container im Hof\nWaschküche: Plan hängt im Keller\nWLAN: Name und Passwort"} /></div>
            <div className="fg"><label className="fl">Hausinfos (Englisch)</label><textarea className="fi" rows={5} value={f.hausinfos_en} onChange={set("hausinfos_en")} /></div>
          </div>
          <div style={{ fontSize: 11.5, color: "#8a8174", marginBottom: 8 }}>Die Hausinfos sehen alle Mieter dieser Adresse im Portal. Keine Türcodes oder Passwörter, die nicht alle wissen dürfen.</div>
          <button className="btn btn-p btn-sm" style={{ width: "auto" }} disabled={busy} onClick={speichern}>{busy ? "Speichert…" : "Speichern"}</button>
        </div>
      )}
    </div>
  );
}

function SchaedenPage({ tenants, apts, navigateTo, istAdmin = true }) {
  const [tab, setTab] = useState("meldungen");
  const [liste, setListe] = useState(null);
  const [lg, setLg] = useState({});
  const [filter, setFilter] = useState("offen");
  const [adr, setAdr] = useState("");
  const [fwd, setFwd] = useState(null);
  async function laden() {
    const [{ data: m }, { data: l }] = await Promise.all([
      supabase.from("schadenmeldungen").select("*").order("created_at", { ascending: false }),
      supabase.from("liegenschaften").select("*"),
    ]);
    setListe(m || []); setLg(Object.fromEntries((l || []).map((x) => [x.adresse, x])));
  }
  useEffect(() => { laden(); }, []);
  const tenantVon = (id) => (tenants || []).find((x) => x.id === id);
  const name = (id) => { const t = tenantVon(id); return t ? `${t.vorname || ""} ${t.nachname || ""}`.trim() : id; };
  const adressen = [...new Set((apts || []).filter((a) => !a.pipeline && a.adresse).map((a) => a.adresse))].sort((a, b) => a.localeCompare(b, "de"));
  const alle = liste || [];
  const zeigen = alle.filter((s) => (filter === "alle" || (filter === "offen" ? s.status !== "erledigt" : s.status === filter)) && (!adr || aptAdresse(apts, s.apt_id) === adr));
  const nNeu = alle.filter((s) => s.status === "neu").length, nOffen = alle.filter((s) => s.status !== "erledigt").length;
  const fwdApt = fwd ? (apts || []).find((a) => a.id === fwd.apt_id) : null;
  const tabBtn = (id, l) => <button className={`btn btn-sm ${tab === id ? "btn-p" : "btn-g"}`} style={{ width: "auto" }} onClick={() => setTab(id)}>{l}</button>;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div><div className="pt">Schäden</div><div className="ps">{nOffen} offen{nNeu ? ` · ${nNeu} neu` : ""} · Meldungen aus dem Mieterportal</div></div>
        <div style={{ display: "flex", gap: 6 }}>{tabBtn("meldungen", "Meldungen")}{tabBtn("liegenschaften", "Liegenschaften & Ansprechpersonen")}</div>
      </div>
      {tab === "meldungen" && (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <select className="fi" style={{ width: "auto" }} value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="offen">Offen</option><option value="neu">Neu</option><option value="in_arbeit">In Arbeit</option><option value="erledigt">Erledigt</option><option value="alle">Alle</option>
            </select>
            <select className="fi" style={{ width: "auto" }} value={adr} onChange={(e) => setAdr(e.target.value)}>
              <option value="">Alle Liegenschaften</option>{adressen.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          {liste === null && <div style={{ fontSize: 12.5, color: "#8a8174" }}>Lädt…</div>}
          {liste !== null && zeigen.length === 0 && <div style={{ fontSize: 12.5, color: "#8a8174" }}>Keine Meldungen.</div>}
          {zeigen.map((s) => (
            <div key={s.id + ":" + s.updated_at}>
              <div style={{ fontSize: 11, color: "#8a8174", margin: "4px 0 4px 2px" }}>{aptAdresse(apts, s.apt_id) || "–"}</div>
              <SchadenKarte s={s} tenantName={name(s.tenant_id)} onTenant={() => navigateTo && navigateTo("mieter", s.tenant_id)} onGeaendert={laden} onWeiterleiten={istAdmin ? setFwd : null} />
            </div>
          ))}
        </div>
      )}
      {tab === "liegenschaften" && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="ct" style={{ marginTop: 0 }}>Ansprechperson pro Liegenschaft</div>
          <div style={{ fontSize: 12, color: "#8a8174", marginBottom: 6 }}>An diese Adresse werden Schäden weitergeleitet. Die Hausinfos erscheinen im Mieterportal.</div>
          {adressen.map((a) => <LiegenschaftKarte key={a + ":" + (lg[a]?.updated_at || "")} adresse={a} wert={lg[a]} onGespeichert={laden} />)}
        </div>
      )}
      {fwd && <WeiterleitenDialog s={fwd} tenant={tenantVon(fwd.tenant_id)} apt={fwdApt} liegenschaft={lg[fwdApt?.adresse]} onClose={() => setFwd(null)} onGesendet={laden} />}
    </div>
  );
}

// ─── KÜNDIGUNGEN & NACHMIETER (aus dem Mieterportal) ──────────────────────
const KD_STATUS = { eingereicht: ["Neu", "#8a6d3b", "#f6eedb"], bestaetigt: ["Bestätigt", "#3d4f2f", "#e8eadb"], abgelehnt: ["Abgelehnt", "#8a8174", "#efeae1"] };

function KuendigungBestaetigen({ k, tenant, apt, updateTenant, onClose, onFertig }) {
  const en = tenant?.sprache === "en";
  const wohnung = apt?.vermietungsart === "wohnung";
  const [text, setText] = useState(en
    ? `Hi ${tenant?.vorname || ""},\n\nwe hereby confirm your notice of termination effective ${k.datum}.\n\nWe will get in touch with you in good time to arrange the handover${wohnung ? " of the apartment" : " of the room"}. If you know someone who would like to take over, they are welcome to apply on our website.\n\nBest regards\nYour D&T Homes Team`
    : `Hallo ${tenant?.vorname || ""},\n\nhiermit bestätigen wir deine Kündigung per ${k.datum}.\n\nWir melden uns rechtzeitig bei dir, um die Übergabe ${wohnung ? "der Wohnung" : "des Zimmers"} zu vereinbaren. Falls du jemanden kennst, der übernehmen möchte, kann sie oder er sich gerne auf unserer Webseite bewerben.\n\nLiebe Grüsse\nDein D&T Homes Team`);
  const [auszug, setAuszug] = useState(true);
  const [mail, setMail] = useState(!!tenant?.email);
  const [busy, setBusy] = useState(false);
  async function los() {
    setBusy(true);
    if (mail) {
      const { data, error } = await supabase.functions.invoke("send-message", { body: { to: tenant.email, betreff: en ? "Confirmation of your notice" : "Bestätigung deiner Kündigung", text, sprache: en ? "en" : "de" } });
      if (error || data?.error) { setBusy(false); toast("Mail konnte nicht gesendet werden", "error"); return; }
    }
    const { error } = await supabase.from("kuendigungen").update({ status: "bestaetigt", antwort: mail ? text : null, updated_at: new Date().toISOString() }).eq("id", k.id);
    if (!error && auszug && tenant && updateTenant) await updateTenant(tenant.id, { auszug: k.datum });
    setBusy(false);
    if (error) { toast("Speichern fehlgeschlagen", "error"); return; }
    toast("Kündigung bestätigt"); onFertig && onFertig(); onClose();
  }
  return (
    <div className="ov" onClick={onClose}>
      <div className="modal" style={{ width: 600, padding: "26px 28px" }} onClick={(e) => e.stopPropagation()}>
        <div className="ct" style={{ marginTop: 0 }}>Kündigung bestätigen</div>
        <div style={{ fontSize: 12.5, marginBottom: 10 }}>{tenant ? `${tenant.vorname} ${tenant.nachname}` : k.tenant_id} · per <b>{k.datum}</b>{tenant?.auszug ? ` · bisher eingetragener Auszug: ${tenant.auszug}` : ""}</div>
        <label style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}><input type="checkbox" checked={auszug} onChange={(e) => setAuszug(e.target.checked)} /> Auszug beim Mieter auf {k.datum} setzen</label>
        <label style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}><input type="checkbox" checked={mail} disabled={!tenant?.email} onChange={(e) => setMail(e.target.checked)} /> Bestätigung per Mail an {tenant?.email || "–"}</label>
        {mail && <textarea className="fi" rows={11} value={text} onChange={(e) => setText(e.target.value)} style={{ fontFamily: "inherit", lineHeight: 1.5 }} />}
        <div className="ma">
          <button className="btn btn-g" disabled={busy} onClick={onClose}>Abbrechen</button>
          <button className="btn btn-p" disabled={busy} onClick={los}>{busy ? "…" : "Bestätigen"}</button>
        </div>
      </div>
    </div>
  );
}

function KuendigungenPage({ tenants, apts, bewerber, updateTenant, navigateTo }) {
  const [liste, setListe] = useState(null);
  const [alle, setAlle] = useState(false);
  const [best, setBest] = useState(null);
  async function laden() { const { data } = await supabase.from("kuendigungen").select("*").order("created_at", { ascending: false }); setListe(data || []); }
  useEffect(() => { laden(); }, []);
  const tenantVon = (id) => (tenants || []).find((x) => x.id === id);
  async function status(k, st, antwort) {
    const { error } = await supabase.from("kuendigungen").update({ status: st, ...(antwort !== undefined ? { antwort } : {}), updated_at: new Date().toISOString() }).eq("id", k.id);
    if (error) toast("Speichern fehlgeschlagen", "error"); else laden();
  }
  async function ablehnen(k) {
    const t = tenantVon(k.tenant_id);
    const grund = prompt("Antwort an den Mieter (wird per Mail gesendet und im Portal angezeigt):", "");
    if (grund === null || !grund.trim()) return;
    if (t?.email) {
      const en = t.sprache === "en";
      const text = en ? `Hi ${t.vorname || ""},\n\n${grund.trim()}\n\nBest regards\nYour D&T Homes Team` : `Hallo ${t.vorname || ""},\n\n${grund.trim()}\n\nLiebe Grüsse\nDein D&T Homes Team`;
      const { data, error } = await supabase.functions.invoke("send-message", { body: { to: t.email, betreff: en ? "Your notice of termination" : "Deine Kündigung", text, sprache: en ? "en" : "de" } });
      if (error || data?.error) { toast("Mail konnte nicht gesendet werden", "error"); return; }
    }
    status(k, "abgelehnt", grund.trim());
  }
  const alleL = liste || [];
  const zeigen = alle ? alleL : alleL.filter((k) => k.status === "eingereicht");
  const hatBeworben = (mail) => !!mail && (bewerber || []).some((b) => String(b.email || "").toLowerCase() === String(mail).toLowerCase());
  const bestTenant = best ? tenantVon(best.tenant_id) : null;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div><div className="pt">Kündigungen</div><div className="ps">Kündigungen und Nachmieter-Vorschläge aus dem Mieterportal</div></div>
        <button className="btn btn-g btn-sm" style={{ width: "auto" }} onClick={() => setAlle((v) => !v)}>{alle ? "Nur offene" : "Alle anzeigen"}</button>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        {liste === null && <div style={{ fontSize: 12.5, color: "#8a8174" }}>Lädt…</div>}
        {liste !== null && zeigen.length === 0 && <div style={{ fontSize: 12.5, color: "#8a8174" }}>{alle ? "Noch keine Einträge." : "Nichts offen."}</div>}
        {zeigen.map((k) => {
          const t = tenantVon(k.tenant_id); const [l, col, bg] = KD_STATUS[k.status] || [k.status, "#8a8174", "#efeae1"];
          const apt = t ? (apts || []).find((a) => a.id === t.aptId) : null;
          return (
            <div key={k.id} style={{ borderTop: "1px solid #efe8da", padding: "12px 0", display: "flex", gap: 12, justifyContent: "space-between", flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ fontSize: 12.5, lineHeight: 1.6, minWidth: 240, flex: 1 }}>
                <div>
                  <b>{k.art === "kuendigung" ? `Kündigung per ${k.datum}` : `Nachmieter: ${k.nachmieter_name}`}</b>
                  <span style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 8, color: col, background: bg, marginLeft: 6 }}>{k.art === "nachmieter" && k.status === "bestaetigt" ? "Erledigt" : l}</span>
                </div>
                <div style={{ color: "#5a5448" }}>
                  von <span style={{ textDecoration: "underline", cursor: "pointer" }} onClick={() => navigateTo && navigateTo("mieter", k.tenant_id)}>{t ? `${t.vorname} ${t.nachname}` : k.tenant_id}</span>
                  {t?.roomId ? ` · ${t.roomId}` : (t?.aptId ? ` · ${t.aptId}` : "")}{apt?.adresse ? ` · ${apt.adresse}` : ""} · eingegangen {fmtZeitP(k.created_at)}
                </div>
                {k.art === "nachmieter" && <div><a href={`mailto:${k.nachmieter_email}`}>{k.nachmieter_email}</a>{k.nachmieter_telefon ? <> · <a href={`tel:${k.nachmieter_telefon}`}>{k.nachmieter_telefon}</a></> : null}{hatBeworben(k.nachmieter_email) ? <span style={{ color: "#3d4f2f", marginLeft: 6 }}>✓ hat sich beworben</span> : <span style={{ color: "#8a8174", marginLeft: 6 }}>noch keine Bewerbung</span>}</div>}
                {k.grund && <div style={{ color: "#5a5448", whiteSpace: "pre-wrap" }}>Grund: {k.grund}</div>}
                {k.art === "kuendigung" && t?.nachfolge_token && (() => { const nb = (bewerber || []).filter((b) => b.nachfolge_token === t.nachfolge_token); return nb.length ? <div style={{ color: "#5a3e8a" }}>↻ Bewerbungen über den Nachfolge-Link: {nb.map((b) => `${b.vorname} ${b.nachname}`).join(", ")}</div> : null; })()}
                {k.antwort && k.status === "abgelehnt" && <div style={{ color: "#8a8174", whiteSpace: "pre-wrap" }}>Antwort: {k.antwort}</div>}
              </div>
              {k.status === "eingereicht" && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {k.art === "kuendigung"
                    ? <><button className="btn btn-p btn-sm" style={{ width: "auto" }} onClick={() => setBest(k)}>Bestätigen</button><button className="btn btn-g btn-sm" style={{ width: "auto" }} onClick={() => ablehnen(k)}>Ablehnen</button></>
                    : <><button className="btn btn-p btn-sm" style={{ width: "auto" }} onClick={() => status(k, "bestaetigt")}>Erledigt</button><button className="btn btn-g btn-sm" style={{ width: "auto" }} onClick={() => status(k, "abgelehnt")}>Verwerfen</button></>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {best && <KuendigungBestaetigen k={best} tenant={bestTenant} apt={bestTenant ? (apts || []).find((a) => a.id === bestTenant.aptId) : null} updateTenant={updateTenant} onClose={() => setBest(null)} onFertig={laden} />}
    </div>
  );
}
