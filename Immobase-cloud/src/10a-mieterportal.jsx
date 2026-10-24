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

function SchadenKarte({ s, tenantName, onTenant, onGeaendert, onWeiterleiten, onInformieren }) {
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
          <div style={{ fontWeight: 600, fontSize: 14 }}>{s.titel}{s.kontakt_freigabe ? <span title="Mieter ist einverstanden, dass seine Kontaktdaten für die Terminvereinbarung weitergegeben werden" style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 600, padding: "2px 7px", borderRadius: 99, background: "#e6eedc", color: "#3a5230", verticalAlign: "middle" }}>✓ Kontakt freigegeben</span> : null}</div>
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
        {onInformieren && s.weitergeleitet_at && <button className="btn btn-g btn-sm" style={{ width: "auto" }} onClick={() => onInformieren(s)}>📨 {s.mieter_informiert_at ? "Mieter nochmals informieren" : "Mieter informieren"}</button>}
        {s.weitergeleitet_at && <span style={{ fontSize: 11.5, color: "#5a6e4a" }}>✓ Weitergeleitet an {s.weitergeleitet_an} am {fmtZeitP(s.weitergeleitet_at)}</span>}
        {s.mieter_informiert_at && <span style={{ fontSize: 11.5, color: "#5a6e4a" }}>✓ Mieter informiert am {fmtZeitP(s.mieter_informiert_at)}</span>}
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

// Zeigt eine E-Mail so, wie sie ankommt (Vorschau vor dem Senden)
function MailVorschau({ an, cc, betreff, text, anhaenge }) {
  const zeile = (l, v) => v ? <div style={{ display: "flex", gap: 10, fontSize: 12.5, padding: "3px 0" }}><span style={{ width: 54, color: "#8a8174", flexShrink: 0 }}>{l}</span><span style={{ color: "#1a1814", minWidth: 0, overflowWrap: "anywhere" }}>{v}</span></div> : null;
  return (
    <div style={{ border: "1px solid #e1d8c5", borderRadius: 10, background: "#fff", overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #efe8da", background: "#faf8f3" }}>
        {zeile("An", an)}{zeile("CC", cc)}{zeile("Betreff", <b>{betreff}</b>)}
      </div>
      <div style={{ padding: "14px 16px", fontFamily: "Calibri,Arial,Helvetica,sans-serif", fontSize: 14, color: "#1a1814", lineHeight: 1.5, maxHeight: 360, overflow: "auto" }}>
        {String(text || "").split("\n").map((z, i) => z.trim() === "" ? <div key={i}><br /></div> : <div key={i}>{z}</div>)}
      </div>
      {anhaenge && anhaenge.length > 0 && <div style={{ padding: "8px 14px", borderTop: "1px solid #efe8da", fontSize: 12, color: "#5a5448", display: "flex", gap: 6, flexWrap: "wrap" }}>{anhaenge.map((a) => <span key={a} style={{ background: "#f3efe6", borderRadius: 6, padding: "3px 8px" }}>📎 {a}</span>)}</div>}
    </div>
  );
}

// Mieter informieren, dass die Meldung weitergeleitet wurde (mit Vorschau, Text änderbar)
function MieterInformierenDialog({ s, tenant, onClose, onGesendet }) {
  const en = tenant?.sprache === "en";
  const vn = tenant?.vorname || "";
  const textDe = [
    `Hallo ${vn},`, "",
    `danke für deine Schadenmeldung „${s.titel}“.`, "",
    s.kontakt_freigabe
      ? "Wir haben sie an die zuständige Verwaltung weitergeleitet. Die Verwaltung bzw. der Handwerker meldet sich direkt bei dir, um einen Termin zu vereinbaren."
      : "Wir haben sie an die zuständige Verwaltung weitergeleitet und melden uns bei dir, sobald wir mehr wissen.",
    "", "Falls du Fragen hast, melde dich gerne bei uns.", "",
    "Liebe Grüsse", "Dein D&T Homes Team",
  ].join("\n");
  const textEn = [
    `Hi ${vn},`, "",
    `thank you for your damage report "${s.titel}".`, "",
    s.kontakt_freigabe
      ? "We have forwarded it to the property management. The property management or the tradesperson will contact you directly to arrange an appointment."
      : "We have forwarded it to the property management and will get back to you as soon as we know more.",
    "", "If you have any questions, feel free to contact us.", "",
    "Best regards", "Your D&T Homes Team",
  ].join("\n");
  const [betreff, setBetreff] = useState(en ? `Your damage report: ${s.titel}` : `Deine Schadenmeldung: ${s.titel}`);
  const [text, setText] = useState(en ? textEn : textDe);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [busy, setBusy] = useState(false);
  async function senden() {
    if (!tenant?.email) { toast("Beim Mieter ist keine E-Mail hinterlegt", "error"); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("send-message", { body: { to: tenant.email, betreff, text, sprache: en ? "en" : "de" } });
    if (error || data?.error) { setBusy(false); toast(data?.error || "Versand fehlgeschlagen", "error"); return; }
    await supabase.from("schadenmeldungen").update({ mieter_informiert_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", s.id);
    setBusy(false); toast("Mieter informiert");
    onGesendet && onGesendet(); onClose();
  }
  return (
    <div className="ov" onClick={onClose}>
      <div className="modal" style={{ width: 640, padding: "26px 28px" }} onClick={(e) => e.stopPropagation()}>
        <div className="ct" style={{ marginTop: 0 }}>Mieter informieren</div>
        <div style={{ fontSize: 12, color: "#8a8174", marginBottom: 10 }}>Kurze Mail an {[tenant?.vorname, tenant?.nachname].filter(Boolean).join(" ") || "den Mieter"}, dass die Meldung weitergeleitet wurde{en ? " (auf Englisch, wie im Vertrag)" : ""}.</div>
        {!bearbeiten ? <MailVorschau an={tenant?.email || "(keine E-Mail hinterlegt)"} betreff={betreff} text={text} />
          : <>
            <div className="fg"><label className="fl">Betreff</label><input className="fi" value={betreff} onChange={(e) => setBetreff(e.target.value)} /></div>
            <div className="fg"><label className="fl">Text</label><textarea className="fi" rows={12} value={text} onChange={(e) => setText(e.target.value)} style={{ fontFamily: "inherit", lineHeight: 1.5 }} /></div>
          </>}
        <div style={{ fontSize: 11.5, color: "#8a8174", marginTop: 8 }}>Im D&amp;T-Mail-Design, Antworten gehen an info@dthomes.ch.</div>
        <div className="ma">
          <button className="btn btn-g" disabled={busy} onClick={onClose}>Abbrechen</button>
          <button className="btn btn-g" disabled={busy} onClick={() => setBearbeiten((b) => !b)}>{bearbeiten ? "Zur Vorschau" : "✏ Text ändern"}</button>
          <button className="btn btn-p" disabled={busy || !tenant?.email} onClick={senden}>{busy ? "Sendet…" : "Senden"}</button>
        </div>
      </div>
    </div>
  );
}

function WeiterleitenDialog({ s, tenant, apt, liegenschaft, onClose, onGesendet }) {
  const kontakt = liegenschaft || {};
  const anrede = kontakt.kontakt_name ? `Hallo ${String(kontakt.kontakt_name).trim().split(/\s+/)[0]}` : "Guten Tag";
  const wo = [apt?.adresse, [apt?.plz, apt?.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const mieterName = tenant ? `${tenant.vorname || ""} ${tenant.nachname || ""}`.trim() : "";
  const zeilen = [
    `${anrede},`, "",
    `Bei uns ist an der ${wo || "Liegenschaft"} folgende Schadenmeldung eingegangen:`, "",
    `Schaden: ${s.titel}`,
    s.ort_im_objekt ? `Ort: ${s.ort_im_objekt}${apt?.stockwerk ? ` (${apt.stockwerk})` : ""}` : (apt?.stockwerk ? `Stockwerk: ${apt.stockwerk}` : null),
    s.dringlichkeit && s.dringlichkeit !== "normal" ? `Dringlichkeit: ${DRINGLICHKEIT[s.dringlichkeit][0]}` : null,
    s.beschreibung ? `Beschreibung: ${s.beschreibung}` : null,
    "",
    ...(s.kontakt_freigabe && mieterName ? [
      "Kontakt für die Terminvereinbarung:",
      `Name: ${mieterName}`,
      tenant?.phone ? `Telefon: ${tenant.phone}` : null,
      tenant?.email ? `E-Mail: ${tenant.email}` : null,
      "",
    ] : []),
    (s.fotos || []).length ? `Die Fotos findest du im Anhang.` : null,
    s.kontakt_freigabe
      ? "Wäre es möglich, dass ihr das anschaut und einen Handwerker organisiert? Die Bewohnerin bzw. der Bewohner ist einverstanden, dass ihr oder der Handwerker sich direkt für einen Termin meldet."
      : "Wäre es möglich, dass ihr das anschaut und einen Handwerker organisiert? Für den Zugang zur Wohnung meldet euch gerne bei uns.", "",
    "Danke dir im Voraus!", "",
    "Liebe Grüsse", "Daan Theijse", "Co-Founder | D&T Homes",
  ].filter((z) => z !== null);
  const [an, setAn] = useState(kontakt.kontakt_email || "");
  const [cc, setCc] = useState("");
  const [betreff, setBetreff] = useState(`Schadenmeldung ${apt?.adresse || ""}: ${s.titel}`.replace(/\s+/g, " ").trim());
  const [text, setText] = useState(zeilen.join("\n"));
  const [fotos, setFotos] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bearbeiten, setBearbeiten] = useState(!kontakt.kontakt_email);
  async function senden() {
    if (!an.trim()) { toast("Bitte Empfänger angeben", "error"); setBearbeiten(true); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("schaden-weiterleiten", { body: { id: s.id, an, cc, betreff, text, fotos } });
    setBusy(false);
    if (error || data?.error) { toast(data?.error || "Versand fehlgeschlagen", "error"); return; }
    toast(`Weitergeleitet${data.fotos ? ` mit ${data.fotos} Foto(s)` : ""}${data.ausgelassen ? ` (${data.ausgelassen} Foto(s) zu gross)` : ""}${data.weg === "outlook" ? " · aus deinem Outlook" : " · von daan.theijse@dthomes.ch (Kopie an dich)"}`);
    onGesendet && onGesendet(); onClose();
  }
  return (
    <div className="ov" onClick={onClose}>
      <div className="modal" style={{ width: 640, padding: "26px 28px" }} onClick={(e) => e.stopPropagation()}>
        <div className="ct" style={{ marginTop: 0 }}>Schaden an Verwaltung weiterleiten</div>
        {!kontakt.kontakt_email && <div style={{ fontSize: 12, color: "#9b4a3e", marginBottom: 10 }}>Für {apt?.adresse || "diese Liegenschaft"} ist noch keine Ansprechperson hinterlegt. Du kannst sie unter „Liegenschaften“ erfassen oder hier eine Adresse eingeben.</div>}
        {kontakt.kontakt_email && <div style={{ fontSize: 12, color: "#8a8174", marginBottom: 10 }}>Ansprechperson: {[kontakt.kontakt_name, kontakt.kontakt_firma].filter(Boolean).join(", ")}{kontakt.kontakt_telefon ? ` · ${kontakt.kontakt_telefon}` : ""}</div>}
        {!bearbeiten ? <MailVorschau an={an} cc={cc} betreff={betreff} text={text} anhaenge={fotos ? (s.fotos || []).map((_, i) => `Foto_${i + 1}`) : []} /> : <>
        <div className="frow">
          <div className="fg"><label className="fl">An</label><input className="fi" value={an} onChange={(e) => setAn(e.target.value)} placeholder="verwaltung@beispiel.ch" /></div>
          <div className="fg"><label className="fl">CC (optional)</label><input className="fi" value={cc} onChange={(e) => setCc(e.target.value)} /></div>
        </div>
        <div className="fg"><label className="fl">Betreff</label><input className="fi" value={betreff} onChange={(e) => setBetreff(e.target.value)} /></div>
        <div className="fg"><label className="fl">Text</label><textarea className="fi" rows={14} value={text} onChange={(e) => setText(e.target.value)} style={{ fontFamily: "inherit", lineHeight: 1.5 }} /></div>
        </>}
        {(s.fotos || []).length > 0 && <label style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={fotos} onChange={(e) => setFotos(e.target.checked)} /> {s.fotos.length} Foto(s) als Anhang mitschicken</label>}
        <div style={{ fontSize: 11.5, color: "#8a8174", marginTop: 8 }}>Geht persönlich von daan.theijse@dthomes.ch raus, ohne D&amp;T-Design. Antworten kommen direkt zu Daan. Status wechselt auf „In Arbeit“.</div>
        <div className="ma">
          <button className="btn btn-g" disabled={busy} onClick={onClose}>Abbrechen</button>
          <button className="btn btn-g" disabled={busy} onClick={() => setBearbeiten((b) => !b)}>{bearbeiten ? "Zur Vorschau" : "✏ Bearbeiten"}</button>
          <button className="btn btn-p" disabled={busy} onClick={senden}>{busy ? "Sendet…" : "Senden"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Kontakte (Personen bei Verwaltungen/Eigentümern) ───────────────────────
// Ein Cache für alle Komponenten, damit die Liste nicht dauernd neu geladen wird
let __kontakteCache = null;
async function ladeKontakte(neu) {
  if (__kontakteCache && !neu) return __kontakteCache;
  const { data } = await supabase.from("kontakte").select("id, name, email, phone, organisation, org_type, rolle").order("name", { ascending: true });
  __kontakteCache = data || [];
  return __kontakteCache;
}
function useKontakte() {
  const [liste, setListe] = useState(__kontakteCache || []);
  const neuLaden = async () => setListe([...(await ladeKontakte(true))]);
  useEffect(() => { ladeKontakte().then((l) => setListe([...l])); }, []);
  return [liste, neuLaden];
}
const gleicheFirma = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

// Auswahl einer Ansprechperson aus den Kontakten, die Personen der vorgeschlagenen Firma zuerst
function KontaktWahl({ kontakte, value, firma, onWahl }) {
  const vorne = (kontakte || []).filter((k) => gleicheFirma(k.organisation, firma));
  const rest = (kontakte || []).filter((k) => !gleicheFirma(k.organisation, firma));
  const gruppen = {};
  rest.forEach((k) => { const g = k.organisation || "Ohne Firma"; (gruppen[g] = gruppen[g] || []).push(k); });
  const label = (k) => [k.name || k.email, k.rolle].filter(Boolean).join(" · ");
  return (
    <select className="fi" value={value ? String(value) : ""} onChange={(e) => { const v = e.target.value; onWahl(v === "neu" ? "neu" : v ? (kontakte || []).find((k) => String(k.id) === v) : null); }}>
      <option value="">- Person wählen -</option>
      {vorne.length > 0 && <optgroup label={firma}>{vorne.map((k) => <option key={k.id} value={k.id}>{label(k)}</option>)}</optgroup>}
      {Object.keys(gruppen).sort((a, b) => a.localeCompare(b, "de")).map((g) => <optgroup key={g} label={g}>{gruppen[g].map((k) => <option key={k.id} value={k.id}>{label(k)}</option>)}</optgroup>)}
      <option value="neu">＋ Neue Person erfassen…</option>
    </select>
  );
}

// Speichert die Ansprechperson einer Liegenschaft: legt die Person bei Bedarf in den Kontakten an
// bzw. aktualisiert sie dort (die Liegenschaften werden per Trigger mitgezogen) und verknüpft sie.
async function liegenschaftKontaktSpeichern(adresse, p, extra) {
  let id = p.kontakt_id || null;
  const person = { name: String(p.kontakt_name || "").trim() || null, email: String(p.kontakt_email || "").trim().toLowerCase() || null, phone: String(p.kontakt_telefon || "").trim() || null, organisation: String(p.kontakt_firma || "").trim() || null };
  if (!id && (person.name || person.email)) {
    const { data: vorhanden } = person.email ? await supabase.from("kontakte").select("id").ilike("email", person.email).limit(1) : { data: [] };
    if (vorhanden && vorhanden.length) id = vorhanden[0].id;
    else {
      const { data: neu, error } = await supabase.from("kontakte").insert({ ...person, org_type: "verwaltung", rolle: "Bewirtschaftung" }).select("id").single();
      if (error) throw error;
      id = neu.id;
    }
  }
  if (id) { const { error } = await supabase.from("kontakte").update({ ...person, updated_at: new Date().toISOString() }).eq("id", id); if (error) throw error; }
  const row = { adresse, kontakt_id: id, kontakt_name: person.name, kontakt_firma: person.organisation, kontakt_email: person.email, kontakt_telefon: person.phone, updated_at: new Date().toISOString(), ...(extra || {}) };
  const { error } = await supabase.from("liegenschaften").upsert(row, { onConflict: "adresse" });
  if (error) throw error;
  await ladeKontakte(true);
  return id;
}

// Ansprechperson der Verwaltung beim Anlegen/Bearbeiten einer Wohnung.
// Zeigt die hinterlegte Person der Liegenschaft (gleiche Adresse) und lässt eine andere wählen oder neu erfassen.
// value: null = unverändert, sonst { kontakt_id, kontakt_name, kontakt_email, kontakt_telefon, kontakt_firma, neu }
function AnsprechpersonFeld({ adresse, verwaltung, value, onChange, onLiegenschaft }) {
  const [kontakte] = useKontakte();
  const [lg, setLg] = useState(null);
  useEffect(() => {
    const adr = String(adresse || "").trim();
    if (!adr) { setLg(null); return; }
    const tm = setTimeout(async () => {
      const { data } = await supabase.from("liegenschaften").select("adresse, kontakt_id, kontakt_name, kontakt_firma, kontakt_email, kontakt_telefon").eq("adresse", adr).maybeSingle();
      setLg(data || null); onLiegenschaft && onLiegenschaft(data || null);
    }, 350);
    return () => clearTimeout(tm);
  }, [adresse]);
  const v = value || (lg ? { kontakt_id: lg.kontakt_id, kontakt_name: lg.kontakt_name || "", kontakt_email: lg.kontakt_email || "", kontakt_telefon: lg.kontakt_telefon || "", kontakt_firma: lg.kontakt_firma || "" } : null);
  function wahl(k) {
    if (k === "neu") { onChange({ kontakt_id: null, kontakt_name: "", kontakt_email: "", kontakt_telefon: "", kontakt_firma: verwaltung || "", neu: true }); return; }
    if (!k) { onChange(null); return; }
    onChange({ kontakt_id: k.id, kontakt_name: k.name || "", kontakt_email: k.email || "", kontakt_telefon: k.phone || "", kontakt_firma: k.organisation || "" });
  }
  const setF = (key) => (e) => onChange({ ...(v || {}), [key]: e.target.value });
  return (
    <div className="fg">
      <label className="fl">Ansprechperson Verwaltung{lg ? " (Liegenschaft " + lg.adresse + ")" : ""}</label>
      <KontaktWahl kontakte={kontakte} value={value && value.neu ? "neu" : (v && v.kontakt_id) || ""} firma={verwaltung} onWahl={wahl} />
      {value && value.neu && <div className="frow" style={{ marginTop: 6 }}>
        <div className="fg"><input className="fi" placeholder="Name" value={value.kontakt_name} onChange={setF("kontakt_name")} /></div>
        <div className="fg"><input className="fi" placeholder="E-Mail" value={value.kontakt_email} onChange={setF("kontakt_email")} /></div>
        <div className="fg"><input className="fi" placeholder="Telefon" value={value.kontakt_telefon} onChange={setF("kontakt_telefon")} /></div>
        <div className="fg"><input className="fi" placeholder="Firma" value={value.kontakt_firma} onChange={setF("kontakt_firma")} /></div>
      </div>}
      {v && !(value && value.neu) && v.kontakt_name && <div style={{ fontSize: 11.5, color: "#8a8174", marginTop: 4 }}>{[v.kontakt_firma, v.kontakt_email, v.kontakt_telefon].filter(Boolean).join(" · ")}</div>}
      <div style={{ fontSize: 11, color: "#8a8174", marginTop: 4 }}>Gilt für alle Wohnungen an dieser Adresse (Schadenmeldungen gehen an diese Person).</div>
    </div>
  );
}

function LiegenschaftKarte({ adresse, wert, apts, onGespeichert }) {
  const leer = { kontakt_id: null, kontakt_name: "", kontakt_firma: "", kontakt_email: "", kontakt_telefon: "", hausinfos: "", hausinfos_en: "" };
  const [f, setF] = useState({ ...leer, ...Object.fromEntries(Object.entries(wert || {}).map(([k, v]) => [k, v ?? (k === "kontakt_id" ? null : "")])) });
  const [offen, setOffen] = useState(false);
  const [neuePerson, setNeuePerson] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kontakte] = useKontakte();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const verwaltung = ((apts || []).find((a) => a.adresse === adresse && a.verwaltung) || {}).verwaltung || "";
  function wahl(k) {
    if (k === "neu") { setNeuePerson(true); setF((x) => ({ ...x, kontakt_id: null, kontakt_name: "", kontakt_email: "", kontakt_telefon: "", kontakt_firma: verwaltung || x.kontakt_firma })); return; }
    setNeuePerson(false);
    if (!k) { setF((x) => ({ ...x, kontakt_id: null })); return; }
    setF((x) => ({ ...x, kontakt_id: k.id, kontakt_name: k.name || "", kontakt_email: k.email || "", kontakt_telefon: k.phone || "", kontakt_firma: k.organisation || "" }));
  }
  async function speichern() {
    setBusy(true);
    try {
      await liegenschaftKontaktSpeichern(adresse, f, { hausinfos: String(f.hausinfos || "").trim() || null, hausinfos_en: String(f.hausinfos_en || "").trim() || null });
      toast("Gespeichert"); setOffen(false); setNeuePerson(false); onGespeichert && onGespeichert();
    } catch (e) { toast("Speichern fehlgeschlagen: " + (e.message || e), "error"); }
    setBusy(false);
  }
  const k = wert || {};
  return (
    <div style={{ borderTop: "1px solid #efe8da", padding: "12px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 13 }}>
          <b>{adresse}</b>{verwaltung ? <span style={{ color: "#8a8174" }}> · Verwaltung: {verwaltung}</span> : null}
          <div style={{ fontSize: 12, color: k.kontakt_email ? "#5a5448" : "#9b4a3e", marginTop: 2 }}>
            {k.kontakt_email ? [k.kontakt_name, k.kontakt_firma, k.kontakt_email, k.kontakt_telefon].filter(Boolean).join(" · ") : "Keine Ansprechperson hinterlegt"}
            {k.kontakt_id ? " · 🔗 verknüpft" : ""}{k.hausinfos ? " · Hausinfos ✓" : ""}
          </div>
        </div>
        <button className="btn btn-g btn-sm" style={{ width: "auto" }} onClick={() => setOffen((o) => !o)}>{offen ? "Schliessen" : "Bearbeiten"}</button>
      </div>
      {offen && (
        <div style={{ marginTop: 10 }}>
          <div className="fg"><label className="fl">Ansprechperson der Verwaltung</label>
            <KontaktWahl kontakte={kontakte} value={neuePerson ? "neu" : f.kontakt_id} firma={verwaltung || f.kontakt_firma} onWahl={wahl} />
          </div>
          {(f.kontakt_id || neuePerson) && <>
            <div className="frow">
              <div className="fg"><label className="fl">Name</label><input className="fi" value={f.kontakt_name} onChange={set("kontakt_name")} placeholder="z.B. Laura Muster" /></div>
              <div className="fg"><label className="fl">Firma / Verwaltung</label><input className="fi" value={f.kontakt_firma} onChange={set("kontakt_firma")} /></div>
            </div>
            <div className="frow">
              <div className="fg"><label className="fl">E-Mail (für Schadenmeldungen)</label><input className="fi" value={f.kontakt_email} onChange={set("kontakt_email")} /></div>
              <div className="fg"><label className="fl">Telefon</label><input className="fi" value={f.kontakt_telefon} onChange={set("kontakt_telefon")} /></div>
            </div>
            <div style={{ fontSize: 11.5, color: "#8a8174", marginBottom: 8 }}>{neuePerson ? "Die Person wird auch bei den Kontakten und beim Partner angelegt." : "Änderungen gelten auch bei den Kontakten und allen Liegenschaften dieser Person."}</div>
          </>}
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
  const [info, setInfo] = useState(null);
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
              <SchadenKarte s={s} tenantName={name(s.tenant_id)} onTenant={() => navigateTo && navigateTo("mieter", s.tenant_id)} onGeaendert={laden} onWeiterleiten={istAdmin ? setFwd : null} onInformieren={istAdmin ? setInfo : null} />
            </div>
          ))}
        </div>
      )}
      {tab === "liegenschaften" && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="ct" style={{ marginTop: 0 }}>Ansprechperson pro Liegenschaft</div>
          <div style={{ fontSize: 12, color: "#8a8174", marginBottom: 6 }}>An diese Adresse werden Schäden weitergeleitet. Die Hausinfos erscheinen im Mieterportal.</div>
          {adressen.map((a) => <LiegenschaftKarte key={a + ":" + (lg[a]?.updated_at || "")} adresse={a} wert={lg[a]} apts={apts} onGespeichert={laden} />)}
        </div>
      )}
      {fwd && <WeiterleitenDialog s={fwd} tenant={tenantVon(fwd.tenant_id)} apt={fwdApt} liegenschaft={lg[fwdApt?.adresse]} onClose={() => setFwd(null)} onGesendet={() => { const x = fwd; laden(); if (x && tenantVon(x.tenant_id)?.email) setInfo(x); }} />}
      {info && <MieterInformierenDialog s={info} tenant={tenantVon(info.tenant_id)} onClose={() => setInfo(null)} onGesendet={laden} />}
    </div>
  );
}

// ─── KÜNDIGUNGEN & NACHMIETER (aus dem Mieterportal) ──────────────────────
const KD_STATUS = { eingereicht: ["Neu", "#8a6d3b", "#f6eedb"], bestaetigt: ["Bestätigt", "#3d4f2f", "#e8eadb"], abgelehnt: ["Abgelehnt", "#8a8174", "#efeae1"] };

function KuendigungBestaetigen({ k, tenant, apt, updateTenant, onClose, onFertig }) {
  const en = tenant?.sprache === "en";
  const wohnung = apt?.vermietungsart === "wohnung";
  const portalLink = tenant?.portal_token && !tenant?.portal_gesperrt ? `${PORTAL_BASIS}/p/${tenant.portal_token}` : "";
  const [text, setText] = useState(en
    ? `Hi ${tenant?.vorname || ""},\n\nthank you again for your notice. We hereby confirm the termination of your rental agreement effective ${k.datum}.\n\nWe are sorry to see you go and would like to thank you for the good time${wohnung ? "" : " with us"}. It was a pleasure having you as our tenant!\n\nWe will get in touch with you in good time to arrange the handover${wohnung ? " of the apartment" : " of the room"}. If you would like to move out earlier, you can suggest a successor tenant in the tenant portal. With your successor link they can apply for your ${wohnung ? "apartment" : "room"} directly. If we can help you with the final cleaning or your move, just send us a request in the tenant portal under "Cleaning & moving".${portalLink ? `\n\nTenant portal: ${portalLink}` : ""}\n\nWe wish you all the best for the future and for your new home. If you have any questions, we are always happy to help.\n\nBest regards\nYour D&T Homes Team`
    : `Hallo ${tenant?.vorname || ""},\n\nnochmals danke für deine Nachricht. Hiermit bestätigen wir deine Kündigung per ${k.datum}.\n\nSchade, dass du gehst! Wir bedanken uns herzlich für die schöne Zeit und dass du bei uns gewohnt hast.\n\nWir melden uns rechtzeitig bei dir, um die Übergabe ${wohnung ? "der Wohnung" : "des Zimmers"} zu vereinbaren. Falls du früher ausziehen möchtest, kannst du im Mieterportal einen Nachmieter vorschlagen. Über deinen Nachfolge-Link kann sich die Person direkt ${wohnung ? "auf deine Wohnung" : "auf dein Zimmer"} bewerben. Und wenn wir dir bei der Endreinigung oder beim Umzug helfen können, schick uns einfach eine Anfrage im Mieterportal unter "Reinigung & Umzug".${portalLink ? `\n\nMieterportal: ${portalLink}` : ""}\n\nWir wünschen dir alles Gute für die Zukunft und viel Freude im neuen Zuhause. Bei Fragen sind wir jederzeit gerne für dich da.\n\nLiebe Grüsse\nDein D&T Homes Team`);
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
        <div style={{ fontSize: 12, color: k.quelle === "manuell" ? "#9b4a3e" : "#5a6e4a", marginBottom: 10 }}>{k.quelle === "manuell" ? "Manuell erfasst: bitte selbst prüfen, ob der Termin laut Vertrag möglich ist (Frist, Befristung, nicht Ende Dezember)." : "✓ Im Mieterportal eingereicht: der Termin wurde dort nach den Regeln des unterschriebenen Vertrags geprüft."}</div>
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
  const [erfassen, setErfassen] = useState(null);
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
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-g btn-sm" style={{ width: "auto" }} onClick={() => setAlle((v) => !v)}>{alle ? "Nur offene" : "Alle anzeigen"}</button>
          <button className="btn btn-p btn-sm" style={{ width: "auto" }} onClick={() => setErfassen({ tenant_id: "", datum: "", grund: "" })}>+ Kündigung erfassen</button>
        </div>
      </div>
      {erfassen && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="ct" style={{ marginTop: 0 }}>Kündigung erfassen (z.B. per Mail oder Brief eingegangen)</div>
          <div className="frow">
            <div className="fg"><label className="fl">Mieter</label>
              <select className="fi" value={erfassen.tenant_id} onChange={(e) => setErfassen({ ...erfassen, tenant_id: e.target.value })}>
                <option value="">Bitte wählen</option>
                {(tenants || []).filter((t) => (t.status || "aktiv") !== "archiviert").slice().sort((a, b) => `${a.nachname}`.localeCompare(`${b.nachname}`, "de")).map((t) => <option key={t.id} value={t.id}>{t.nachname} {t.vorname} · {t.roomId || t.aptId || ""}</option>)}
              </select></div>
            <div className="fg"><label className="fl">Kündigung per</label><input className="fi" type="date" value={erfassen.datum} onChange={(e) => setErfassen({ ...erfassen, datum: e.target.value })} /></div>
          </div>
          <div className="fg"><label className="fl">Bemerkung (optional)</label><input className="fi" value={erfassen.grund} onChange={(e) => setErfassen({ ...erfassen, grund: e.target.value })} /></div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-g btn-sm" style={{ width: "auto" }} onClick={() => setErfassen(null)}>Abbrechen</button>
            <button className="btn btn-p btn-sm" style={{ width: "auto" }} disabled={!erfassen.tenant_id || !erfassen.datum} onClick={async () => {
              const [y, m, d] = erfassen.datum.split("-");
              const { error } = await supabase.from("kuendigungen").insert({ tenant_id: erfassen.tenant_id, art: "kuendigung", datum: `${d}.${m}.${y}`, grund: erfassen.grund.trim() || null, status: "eingereicht", quelle: "manuell" });
              if (error) { toast("Speichern fehlgeschlagen", "error"); return; }
              toast("Erfasst. Jetzt prüfen und bestätigen."); setErfassen(null); laden();
            }}>Erfassen</button>
          </div>
        </div>
      )}
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
                  <b>{k.art === "kuendigung" ? `Kündigung per ${k.datum}` : `Nachmieter: ${k.nachmieter_name}`}</b>{k.quelle === "manuell" && <span style={{ fontSize: 10.5, color: "#8a8174", marginLeft: 6 }}>manuell erfasst</span>}
                  <span style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 8, color: col, background: bg, marginLeft: 6 }}>{k.art === "nachmieter" && k.status === "bestaetigt" ? "Erledigt" : l}</span>
                </div>
                <div style={{ color: "#5a5448" }}>
                  von <span style={{ textDecoration: "underline", cursor: "pointer" }} onClick={() => navigateTo && navigateTo("mieter", k.tenant_id)}>{t ? `${t.vorname} ${t.nachname}` : k.tenant_id}</span>
                  {t?.roomId ? ` · ${t.roomId}` : (t?.aptId ? ` · ${t.aptId}` : "")}{apt?.adresse ? ` · ${apt.adresse}` : ""} · eingegangen {fmtZeitP(k.created_at)}
                </div>
                {k.art === "nachmieter" && <div><a href={`mailto:${k.nachmieter_email}`}>{k.nachmieter_email}</a>{k.nachmieter_telefon ? <> · <a href={`tel:${k.nachmieter_telefon}`}>{k.nachmieter_telefon}</a></> : null}{hatBeworben(k.nachmieter_email) ? <span style={{ color: "#3d4f2f", marginLeft: 6 }}>✓ hat sich beworben</span> : <span style={{ color: "#8a8174", marginLeft: 6 }}>noch keine Bewerbung</span>}</div>}
                {k.grund && <div style={{ color: "#5a5448", whiteSpace: "pre-wrap" }}>Grund: {k.grund}</div>}
                {k.art === "kuendigung" && t?.nachfolge_token && (() => { const nb = (bewerber || []).filter((b) => b.nachfolge_token === t.nachfolge_token); return nb.length ? <div style={{ color: "#5a5448" }}>↻ Bewerbungen über den Nachfolge-Link: {nb.map((b) => `${b.vorname} ${b.nachname}`).join(", ")}</div> : null; })()}
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

// ── Datencheck: Widersprüche zwischen Verträgen und ImmoBase laufend anzeigen ──
// Die Prüfungen laufen in der Datenbank (Funktion datencheck). "Ist korrekt" blendet einen Punkt dauerhaft aus.
function DatencheckPage({ navigateTo }) {
  const [liste, setListe] = useState(null);
  const [fehler, setFehler] = useState("");
  const [ausn, setAusn] = useState([]);
  const [zeigAusn, setZeigAusn] = useState(false);
  async function laden() {
    setFehler("");
    const [r, a] = await Promise.all([supabase.rpc("datencheck"), supabase.from("datencheck_ausnahmen").select("*").order("created_at", { ascending: false })]);
    if (r.error) { setFehler(r.error.message); setListe([]); } else setListe(r.data || []);
    setAusn(a.data || []);
  }
  useEffect(() => { laden(); }, []);
  async function okMarkieren(x) {
    const notiz = prompt(`"${x.art}" bei ${x.name || x.tenant_id} als korrekt markieren?\n\nKurz notieren, warum (optional):`, "");
    if (notiz === null) return;
    const { error } = await supabase.from("datencheck_ausnahmen").insert({ tenant_id: x.tenant_id, art: x.art, notiz: notiz.trim() || null });
    if (error) toast("Speichern fehlgeschlagen", "error"); else { toast("Ausgeblendet"); laden(); }
  }
  async function wiederEinblenden(a) {
    const { error } = await supabase.from("datencheck_ausnahmen").delete().eq("id", a.id);
    if (error) toast("Speichern fehlgeschlagen", "error"); else laden();
  }
  const STUFEN = [
    { id: "fehler", label: "Fehler", farbe: "#a33a2b", bg: "#fbeae6" },
    { id: "warnung", label: "Prüfen", farbe: "#8a6420", bg: "#fbf3e6" },
    { id: "info", label: "Hinweis", farbe: "#5f5a50", bg: "#f3efe7" },
  ];
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div><div className="pt">Datencheck</div><div className="ps">Widersprüche zwischen unterschriebenen Verträgen und den Daten in ImmoBase (aktive Mieter)</div></div>
        <button className="btn btn-g btn-sm" style={{ width: "auto" }} onClick={() => { setListe(null); laden(); }}>↻ Neu prüfen</button>
      </div>
      {fehler && <div className="card" style={{ marginTop: 14, color: "#a33a2b" }}>Datencheck konnte nicht geladen werden: {fehler}</div>}
      {liste === null ? <div className="card" style={{ marginTop: 14 }}>Wird geprüft…</div>
        : liste.length === 0 && !fehler ? <div className="card" style={{ marginTop: 14 }}>✓ Keine Widersprüche gefunden.</div>
        : STUFEN.map((s) => {
          const teil = liste.filter((x) => x.schwere === s.id);
          if (!teil.length) return null;
          return (
            <div key={s.id} style={{ marginTop: 18 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: s.farbe, fontWeight: 600, marginBottom: 8 }}>{s.label} ({teil.length})</div>
              {teil.map((x, i) => (
                <div key={i} className="card" style={{ marginBottom: 8, padding: "12px 16px", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", borderLeft: `3px solid ${s.farbe}` }}>
                  <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{x.art}</div>
                    <div style={{ fontSize: 12.5, color: "#4a4439", marginTop: 2 }}>
                      {x.name ? <a href="#" onClick={(e) => { e.preventDefault(); navigateTo && navigateTo("mieter", x.tenant_id); }} style={{ color: "#1a1814" }}>{x.name}</a> : x.tenant_id}
                      {x.objekt ? ` · ${x.objekt}` : ""}
                    </div>
                    {x.detail && <div style={{ fontSize: 12, color: "#8a8174", marginTop: 2 }}>{x.detail}</div>}
                  </div>
                  <button className="btn btn-g btn-sm" style={{ width: "auto" }} onClick={() => okMarkieren(x)}>Ist korrekt</button>
                </div>
              ))}
            </div>
          );
        })}
      {ausn.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <button className="btn btn-g btn-sm" style={{ width: "auto" }} onClick={() => setZeigAusn((v) => !v)}>{zeigAusn ? "Ausgeblendete verbergen" : `Ausgeblendete anzeigen (${ausn.length})`}</button>
          {zeigAusn && ausn.map((a) => (
            <div key={a.id} className="card" style={{ marginTop: 8, padding: "10px 16px", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: 12.5 }}><b>{a.art}</b> · {a.tenant_id}{a.notiz ? ` · ${a.notiz}` : ""}<div style={{ fontSize: 11, color: "#8a8174" }}>{new Date(a.created_at).toLocaleDateString("de-CH")}{a.created_by ? ` · ${a.created_by}` : ""}</div></div>
              <button className="btn btn-g btn-sm" style={{ width: "auto" }} onClick={() => wiederEinblenden(a)}>Wieder anzeigen</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
