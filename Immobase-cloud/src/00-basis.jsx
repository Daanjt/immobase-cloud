(function() {

const { useState, useEffect, useCallback, useRef } = React;

// ─── SUPABASE CONFIG ─────────────────────────────────────────────────────────
const SUPABASE_URL = "https://aohcqrxpsqronlcwssrk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvaGNxcnhwc3Fyb25sY3dzc3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5ODM0MjEsImV4cCI6MjA5MzU1OTQyMX0.izqvV2CPiOyVXoCsFTq_k8KRzBgfomp8LXwwAx22XP4";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { experimental: { passkey: true } } });

    // Uebergabefotos liegen im privaten Speicher: Anzeige ueber kurzlebige signierte Links
    const __hoCache = {};
    function hoPath(u){ const m = /\/handover-photos\/([^?#]+)/.exec(String(u || "")); return m ? decodeURIComponent(m[1]) : null; }
    function useHoUrl(u){
      const p0 = hoPath(u);
      const [s, setS] = React.useState(p0 ? (__hoCache[p0] || null) : (u || null));
      React.useEffect(() => {
        const p = hoPath(u);
        if (!p) { setS(u || null); return; }
        if (__hoCache[p]) { setS(__hoCache[p]); return; }
        let alive = true;
        supabase.storage.from("handover-photos").createSignedUrl(p, 3600).then(({ data }) => {
          if (data && data.signedUrl) { __hoCache[p] = data.signedUrl; if (alive) setS(data.signedUrl); }
        }).catch(() => {});
        return () => { alive = false; };
      }, [u]);
      return s;
    }
    function HoImg({ url, ...rest }){
      const s = useHoUrl(url);
      return s ? <img src={s} {...rest}/> : <span style={{ display:"block", background:"#eee", ...(rest.style || {}) }}/>;
    }
    function HoLink({ url, children, ...rest }){ const s = useHoUrl(url); return <a href={s || "#"} {...rest}>{children}</a>; }
// Face ID / Passkeys: nur anbieten, wo das Geraet es kann
const PASSKEY_MOEGLICH = typeof window !== "undefined" && !!window.PublicKeyCredential && !!(supabase.auth && supabase.auth.signInWithPasskey);
function passkeyName(){ const ua=navigator.userAgent||""; if(/iPhone|iPad/i.test(ua)) return "Face ID"; if(/Mac/i.test(ua)) return "Touch ID"; if(/Android/i.test(ua)) return "Fingerabdruck"; if(/Windows/i.test(ua)) return "Windows Hello"; return "Passkey"; }
function passkeyFehlerText(error){
  const c=(error&&(error.code||error.error_code))||""; const m=(error&&error.message)||"";
  if(/NotAllowed|abort|cancel/i.test(c+" "+m)) return null; // vom Nutzer abgebrochen
  if(c==="webauthn_credential_not_found") return "Dieser Passkey ist nicht mehr hinterlegt. Bitte mit Passwort anmelden und neu einrichten.";
  if(c==="webauthn_credential_exists") return "Dieses Gerät ist bereits eingerichtet.";
  if(c==="passkey_disabled") return "Anmeldung mit Passkey ist im Moment nicht verfügbar.";
  return "Hat nicht geklappt: " + (m||c||"unbekannt");
}

// ── Fehlerueberwachung: meldet Fehler in die Tabelle system_fehler (Warnmail via system-check) ──
(function(){
  if (window.__ibFehlerAktiv) return; window.__ibFehlerAktiv = true;
  var gesendet = 0, zuletzt = {};
  var IGNORIEREN = /ResizeObserver loop|Script error\.?$|Load failed$|NetworkError when attempting|Failed to fetch$|AbortError|chrome-extension:|moz-extension:|safari-extension:/i;
  window.__ibLetzterFehler = "";
  var _ce = console.error.bind(console);
  console.error = function(){
    try { window.__ibLetzterFehler = Array.prototype.map.call(arguments, function(x){ return x && x.message ? x.message : (typeof x === "object" ? JSON.stringify(x) : String(x)); }).join(" ").slice(0, 1500); } catch(_e) {}
    _ce.apply(null, arguments);
  };
  window.meldeFehler = function(bereich, meldung, details){
    try {
      meldung = String(meldung || "").slice(0, 1900);
      if (!meldung || IGNORIEREN.test(meldung)) return;
      var key = bereich + "|" + meldung, now = Date.now();
      if (zuletzt[key] && now - zuletzt[key] < 60000) return;
      zuletzt[key] = now;
      if (++gesendet > 15) return;
      var seite = (location.pathname + location.hash).replace(/[0-9a-f]{20,}/gi, "…").slice(0, 480);
      Promise.resolve(supabase.auth.getSession().then(function(r){ return r && r.data && r.data.session && r.data.session.user ? r.data.session.user.email : null; })).catch(function(){ return null; }).then(function(benutzer){
        supabase.from("system_fehler").insert({ app: "admin", bereich: String(bereich || "").slice(0, 150), meldung: meldung,
          details: Object.assign({}, details || {}, window.__ibLetzterFehler ? { konsole: window.__ibLetzterFehler } : {}),
          seite: seite, geraet: (navigator.userAgent || "").slice(0, 390), benutzer: benutzer ? String(benutzer).slice(0, 190) : null }).then(function(){}, function(){});
      });
    } catch(_e) {}
  };
  window.addEventListener("error", function(e){ window.meldeFehler("JavaScript", e && e.message, { datei: e && e.filename, zeile: e && e.lineno }); });
  window.addEventListener("unhandledrejection", function(e){ var r = e && e.reason; window.meldeFehler("Promise", r && r.message ? r.message : String(r)); });
  var _alert = window.alert;
  window.alert = function(m){
    try { if (/fehler|fehlgeschlagen|failed|error|nicht möglich|konnte nicht/i.test(String(m || ""))) window.meldeFehler("Meldung an Nutzer", m); } catch(_e) {}
    try { if (typeof m === "string") m = window.fehlerText(m); } catch(_e) {}
    return _alert.call(window, m);
  };
})();

// ─── Verstaendliche Fehlermeldungen: technische Meldungen in klares Deutsch uebersetzen ───
(function(){
  var REGELN = [
    [/Failed to send a request to the Edge Function|Failed to fetch|Load failed|NetworkError|network error|ERR_INTERNET|ERR_NETWORK/i, "Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung und versuche es nochmals."],
    [/JWT expired|Invalid JWT|invalid claim|Missing authorization|Nicht berechtigt|Nicht autorisiert|not authorized|permission denied|row-level security/i, "Keine Berechtigung oder Anmeldung abgelaufen. Bitte lade die Seite neu und melde dich falls nötig nochmals an."],
    [/timed? ?out|timeout|504|Gateway Time/i, "Der Server hat zu lange gebraucht. Bitte versuche es in einem Moment nochmals."],
    [/PDF generation failed|pdf-generate/i, "Das PDF konnte nicht erstellt werden. Bitte versuche es nochmals."],
    [/duplicate key|already exists/i, "Dieser Eintrag existiert bereits."],
    [/non-2xx status code|Internal Server Error|status 5\d\d|\(5\d\d\)/i, "Auf dem Server ist ein Fehler aufgetreten. Bitte versuche es nochmals. Wir wurden automatisch informiert."],
  ];
  window.fehlerText = function(m){
    m = String(m == null ? "" : m);
    for (var i = 0; i < REGELN.length; i++) {
      var rx = REGELN[i][0];
      var pos = m.search(rx);
      if (pos < 0) continue;
      var schnitt = m.lastIndexOf(": ", pos);
      var vorne = schnitt >= 0 ? m.slice(0, schnitt + 2) : "";
      if (vorne && REGELN[i][1].indexOf(vorne) === 0) vorne = "";
      return vorne + REGELN[i][1];
    }
    return m;
  };
})();

// ─── Ladeanzeige + bessere Fehler fuer Server-Funktionen und PDF-Erstellung ───
(function(){
  var TEXTE = {
    "finalize-handover": "Protokoll wird erstellt…", "countersign-contract": "Vertrag wird gegengezeichnet…",
    "send-contract-email": "Vertrag wird gesendet…", "send-handover-invite": "Einladung wird gesendet…",
    "send-mahnung": "Mahnung wird erstellt…", "send-kautionsabrechnung": "Abrechnung wird gesendet…",
    "send-message": "Nachricht wird gesendet…", "send-campaign": "Kampagne wird verarbeitet…",
    "outlook-send": "E-Mail wird gesendet…", "draft-reply": "Antwort wird vorbereitet…",
    "generate-inserat": "Inserat wird erstellt…", "generate-beschreibung": "Beschreibung wird erstellt…",
    "edit-image": "Bild wird bearbeitet…", "import-listing-images": "Bilder werden importiert…",
    "bexio-invoice": "Rechnung wird erstellt…", "translate-clause": "Klausel wird übersetzt…",
    "bauradar-fetch": "Daten werden geladen…", "vault-recover": "Wird verarbeitet…", "pdf": "PDF wird erstellt…"
  };
  var STILL = { "outlook-thread": 1 };
  var laufend = [], el = null, timer = null;
  function zeichnen(){
    if (!el) {
      el = document.createElement("div");
      el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
      el.innerHTML = '<div class="ib-lade-bar"></div><div class="ib-lade-pill"><span class="ib-lade-spin"></span><span class="ib-lade-text"></span></div>';
      var st = document.createElement("style");
      st.textContent = ".ib-lade-bar{position:fixed;top:0;left:0;right:0;height:3px;z-index:5000;background:linear-gradient(90deg,transparent,#3a5230,transparent);background-size:40% 100%;background-repeat:no-repeat;animation:ibLade 1.1s ease-in-out infinite}"
        + "@keyframes ibLade{0%{background-position:-40% 0}100%{background-position:140% 0}}"
        + ".ib-lade-pill{position:fixed;left:50%;top:calc(14px + env(safe-area-inset-top));transform:translateX(-50%);z-index:5000;display:flex;align-items:center;gap:10px;background:#1a1814;color:#fefcf7;padding:10px 18px;border-radius:999px;font-size:13px;box-shadow:0 6px 24px rgba(0,0,0,.25);max-width:calc(100vw - 32px);pointer-events:none}"
        + ".ib-lade-spin{width:14px;height:14px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:ibDreh .8s linear infinite;flex-shrink:0}"
        + "@keyframes ibDreh{to{transform:rotate(360deg)}}"
        + "@media (prefers-reduced-motion: reduce){.ib-lade-bar,.ib-lade-spin{animation:none}}";
      document.head.appendChild(st);
      document.body.appendChild(el);
    }
    var aktiv = laufend.length > 0;
    el.style.display = aktiv ? "" : "none";
    if (aktiv) el.querySelector(".ib-lade-text").textContent = laufend[laufend.length - 1].text;
  }
  function start(name){
    var eintrag = { text: TEXTE[name] || "Wird verarbeitet…", t: Date.now() };
    laufend.push(eintrag);
    clearTimeout(timer); timer = setTimeout(zeichnen, 300);
    return function(){ var i = laufend.indexOf(eintrag); if (i >= 0) laufend.splice(i, 1); if (!laufend.length) clearTimeout(timer); zeichnen(); };
  }
  // supabase.functions.invoke: Ladeanzeige + Servermeldung statt "non-2xx" + verstaendlicher Text
  try {
    var proto = Object.getPrototypeOf(supabase.functions);
    if (proto && proto.invoke && !proto.__ibGepatcht) {
      var orig = proto.invoke;
      proto.invoke = async function(name, opts){
        var stop = STILL[name] ? function(){} : start(name);
        try {
          var r = await orig.call(this, name, opts);
          if (r && r.error) {
            var msg = r.error.message || String(r.error);
            try { if (r.error.context && typeof r.error.context.clone === "function") { var j = await r.error.context.clone().json(); if (j && (j.error || j.message)) msg = String(j.error || j.message); } } catch(_e) {}
            try { r.error.message = window.fehlerText(msg); } catch(_e) {}
          }
          return r;
        } finally { stop(); }
      };
      proto.__ibGepatcht = true;
    }
  } catch(_e) {}
  // direkte fetch-Aufrufe (PDF-Erstellung, Vertragsmail)
  var _f = window.fetch;
  window.fetch = function(u, o){
    var url = typeof u === "string" ? u : (u && u.url) || "";
    var name = /\/api\/pdf-generate/.test(url) ? "pdf" : ((url.match(/\/functions\/v1\/([a-z0-9-]+)/) || [])[1] || null);
    if (!name || STILL[name]) return _f.apply(this, arguments);
    var stop = start(name);
    return _f.apply(this, arguments).then(function(r){ stop(); return r; }, function(e){ stop(); throw e; });
  };
})();
window.__sb = supabase; // Debug-only: expose client for diagnostics

const DT_LOGO_DATA_URI = "data:image/png;base64,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";
const DT_QR_DATA_URI = "data:image/png;base64,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";
const DAAN_FAKSIMILE_DATA_URI = "data:image/png;base64,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";

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function Av({name,size=30}){const i=(name||"?").trim().split(" ").filter(Boolean).map(n=>n[0]).join("").slice(0,2).toUpperCase();return <div className="av" style={{width:size,height:size,fontSize:size*0.36}}>{i}</div>;}
const chf=n=>`CHF ${Number(n||0).toLocaleString("de-CH",{minimumFractionDigits:0,maximumFractionDigits:2})}`;
function Bdg({label,color="x"}){if(!label&&label!==0)return null;return <span className={`bx b-${color}`}>{label}</span>;}
const MERKMAL_VORSCHLAEGE = ["WLAN inkl.","Zentral","Aussicht","Seesicht","Nähe See","Balkon","Garten","Terrasse","Dachterrasse","Lift","Waschmaschine","Ruhige Lage","Gute ÖV-Anbindung","Nähe Bahnhof","Nähe Hochschulen","Neu renoviert","Altbau","Hell","Parkplatz"];
function MerkmalePicker({value, onChange, wohnung}){
  const sel = (Array.isArray(value) ? value : []).filter(x => !(wohnung && x === "WLAN inkl."));
  const [eigen, setEigen] = useState("");
  const MAX = 4;
  const toggle = m => { if (sel.includes(m)) onChange(sel.filter(x=>x!==m)); else if (sel.length < MAX) onChange([...sel, m]); else alert(`Maximal ${MAX} Merkmale. Bitte zuerst eines abwählen.`); };
  const add = () => { const v = eigen.trim(); if (!v || sel.includes(v)) { setEigen(""); return; } if (sel.length >= MAX) { alert(`Maximal ${MAX} Merkmale. Bitte zuerst eines abwählen.`); return; } onChange([...sel, v]); setEigen(""); };
  const alle = [...MERKMAL_VORSCHLAEGE.filter(x => !(wohnung && x === "WLAN inkl.")), ...sel.filter(x=>!MERKMAL_VORSCHLAEGE.includes(x))];
  return (<div>
    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
      {alle.map(m=>{ const on=sel.includes(m); return <button type="button" key={m} onClick={()=>toggle(m)} style={{fontSize:11.5,padding:"5px 10px",borderRadius:999,border:`1px solid ${on?"#a08864":"#d8c9a4"}`,background:on?"#a08864":"#fff",color:on?"#fff":"#5a5448",cursor:"pointer",fontFamily:"inherit"}}>{on?"✓ ":""}{m}</button>; })}
    </div>
    <div style={{display:"flex",gap:6,marginTop:8}}>
      <input className="fi" value={eigen} onChange={e=>setEigen(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); add(); } }} placeholder="Eigenes Merkmal hinzufügen" style={{margin:0}}/>
      <button type="button" className="btn btn-sm" onClick={add}>+ Hinzufügen</button>
    </div>
    <div style={{fontSize:10.5,color:"#8a8174",marginTop:5,fontStyle:"italic"}}>Maximal 4 Merkmale ({sel.length}/4). Erscheinen als Kärtchen auf der Webseite, zusammen mit der Zimmerzahl. {wohnung ? "Bei Wohnungen ist WLAN nicht inklusive." : "Nichts gewählt = WLAN inkl., Zentral, und Balkon automatisch, wenn ein Zimmer einen Balkon hat."}</div>
  </div>);
}
function TypeBadge({type}){
  const m={WG:["b","WG"],Wohnung:["g","Wohnung"],Airbnb:["p","Airbnb"],Evorest:["x","Evorest"],GoCaution:["x","GoCaution"],Firstcaution:["x","Firstcaution"],"Kautionsreduktion auf 0":["y","0-Kaution"],Versicherung:["b","Versicherung"],AOZ:["p","AOZ"],Student:["g","Student"],Arbeitnehmer:["g","Arbeitnehmer"],Selbstständig:["b","Selbst."]};
  if(!type||!m[type])return null;const [c,l]=m[type];return <span className={`bx b-${c}`}>{l}</span>;
}
// Kategorie einer Wohnung: "WG" (einzelne Zimmer), "Wohnung" (Wohnung) oder "Airbnb".
// Technisch sind Wohnungen type "WG" mit vermietungsart "wohnung".
function aptKat(a){ if(!a) return null; if(a.type==="Airbnb") return "Airbnb"; return a.vermietungsart==="wohnung" ? "Wohnung" : "WG"; }
const APT_KAT_LABEL = {WG:"WGs", Wohnung:"Wohnungen", Airbnb:"Airbnb"};
function Prog({val,max}){const p=max?Math.min(100,Math.round(val/max*100)):0;const bg=p===100?"#5a7c5e":p>60?"#a08864":"#c89653";return <div style={{height:4,background:"#e8e3d8",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${p}%`,background:bg,transition:"width .4s"}}/></div>;}
function initialen(mail){
  const name = (mail||"").split("@")[0].replace(/[._-]+/g," ").trim();
  if (!name) return "DT";
  const teile = name.split(/\s+/).filter(Boolean);
  const a = (teile[0] || "")[0] || "";
  const b = (teile[1] || "")[0] || "";
  return ((a + b) || "DT").toUpperCase();
}
function fmtDatum(v){
  const t=(v||"").toString().trim();
  if(!t) return "-";
  const m=t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${+m[3]}.${+m[2]}.${m[1]}` : t;
}
function parseDMY(s){if(!s)return null;const parts=s.split(".");if(parts.length===3)return new Date(+parts[2],+parts[1]-1,+parts[0]);return new Date(s);}
// ─── EVOREST KAUTION (URL-Vorausfüllung) ─────────────────────────────────────
// Baut den Evorest import-deposit-Link mit vorausgefüllten Mieterdaten.
// Doku: "Evorest x D&T - Contract Opening via URL". Alles was ImmoBase sicher
// hat wird vorausgefüllt, fehlende Felder ergänzt man in Evorest.
// TEST zuerst: EVOREST_USE_TEST=true -> Testumgebung (kein echtes Depot).
// Nach erfolgreicher Prüfung auf false setzen fuer Prod.
const EVOREST_USE_TEST = false;
const EVOREST_BASE = EVOREST_USE_TEST
  ? "https://www.test.pm-app.evorest.ch/import-deposit"
  : "https://www.pm-app.evorest.ch/import-deposit";
const EVOREST_NAT_ISO2 = {
  "schweiz":"CH","deutschland":"DE","österreich":"AT","oesterreich":"AT","italien":"IT",
  "frankreich":"FR","spanien":"ES","portugal":"PT","tschechien":"CZ","polen":"PL",
  "niederlande":"NL","belgien":"BE","grossbritannien":"GB","vereinigtes königreich":"GB",
  "usa":"US","vereinigte staaten":"US","türkei":"TR","tuerkei":"TR","griechenland":"GR",
  "ungarn":"HU","rumänien":"RO","kroatien":"HR","serbien":"RS","russland":"RU",
  "ukraine":"UA","indien":"IN","china":"CN","brasilien":"BR","ägypten":"EG","aegypten":"EG",
  "marokko":"MA","tunesien":"TN","kosovo":"XK","albanien":"AL","nordmazedonien":"MK",
  "bosnien und herzegowina":"BA","bosnien":"BA","slowakei":"SK","slowenien":"SI",
  "schweden":"SE","norwegen":"NO","dänemark":"DK","daenemark":"DK","finnland":"FI",
  "irland":"IE","luxemburg":"LU","syrien":"SY","iran":"IR","irak":"IQ","afghanistan":"AF",
  "eritrea":"ER","somalia":"SO","nigeria":"NG","sri lanka":"LK","pakistan":"PK",
};
function evSplitStreet(adresse){
  if(!adresse) return ["",""];
  const m = String(adresse).trim().match(/^(.*?)[\s,]+(\d+\s*[a-zA-Z]?)$/);
  if(m) return [m[1].trim(), m[2].replace(/\s+/g,"")];
  return [String(adresse).trim(), ""];
}
function evGender(g){
  const s=(g||"").toLowerCase().trim();
  if(s.startsWith("mann")||s==="m"||s.startsWith("männlich")||s.startsWith("maennlich")) return "Mann";
  if(s.startsWith("frau")||s==="f"||s==="w"||s.startsWith("weiblich")) return "Frau";
  return s ? "Divers" : "";
}
function evDMY(s){
  if(!s) return "";
  const str=String(s).trim();
  const pad=(n)=>String(n).padStart(2,"0");
  let m=str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if(m) return `${pad(m[1])}.${pad(m[2])}.${m[3]}`;
  m=str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m) return `${pad(m[3])}.${pad(m[2])}.${m[1]}`;
  return str;
}
const EVOREST_ZIVILSTAND = {
  "ledig":"1", "verheiratet":"4", "eingetragene partnerschaft":"3",
  "geschieden":"5", "verwitwet":"6", "getrennt":"3",
};
function buildEvorestUrl(tenant, apt, lessor){
  const t=tenant||{};
  const [objStreet,objNr]=evSplitStreet(apt&&apt.adresse);
  const [tStreet,tNr]=evSplitStreet(t.adresse);
  const parts=[];
  const add=(k,v)=>{ if(v!==undefined&&v!==null&&String(v).trim()!=="") parts.push(`${k}=${encodeURIComponent(String(v).trim())}`); };
  const addRaw=(k,v)=>{ if(v!==undefined&&v!==null&&String(v).trim()!=="") parts.push(`${k}=${String(v).trim()}`); };
  // Mietvertrag
  add("RentStart", evDMY(t.einzug));
  const warranty=String(t.kautionBetrag!=null?t.kautionBetrag:"").replace(/[^\d.]/g,"");
  if(warranty && +warranty>0) add("Warranty", warranty);
  add("Lang","de");
  // Mietobjekt
  add("Reference", apt&&apt.refnr);
  add("ObjectStreet", objStreet);
  add("ObjectStreetNumber", objNr);
  add("ObjectZipCode", apt&&apt.plz);
  add("ObjectCity", apt&&apt.ort);
  // Eigentümer/Vermieter = Eigentümer der Wohnung (aus der Partner-Sektion, sonst nur Name)
  add("LessorName", (lessor&&lessor.name)||(apt&&apt.eigentuemer));
  if(lessor){
    add("LessorAddressStreet", lessor.strasse); add("LessorStreet", lessor.strasse);
    add("LessorAddressStreetNumber", lessor.hausnummer); add("LessorStreetNumber", lessor.hausnummer);
    add("LessorZipCode", lessor.plz); add("LessorCity", lessor.ort);
  }
  // Mieter 1
  add("FirstName1", t.vorname);
  add("LastName1", t.nachname);
  add("Email1", t.email);
  addRaw("Phone1", (t.phone||"").replace(/\s+/g,""));
  add("AddressStreet1", tStreet);
  add("AddressStreetNumber1", tNr);
  add("ZipCode1", t.plz);
  add("City1", t.ort);
  add("Country1", EVOREST_NAT_ISO2[(t.land||"").toLowerCase().trim()] || (String(t.land||"").trim().length===2 ? String(t.land).trim().toUpperCase() : "CH"));
  add("TenantType1","natural_person");
  add("Gender1", evGender(t.gender));
  add("BirthDate1", evDMY(t.geburt));
  add("Nationality1", EVOREST_NAT_ISO2[(t.nat||"").toLowerCase().trim()]||"");
  add("CivilStatus1", EVOREST_ZIVILSTAND[(t.zivilstand||"").toLowerCase().trim()]||"");
  add("Source","CustomURL");
  return `${EVOREST_BASE}?${parts.join("&")}`;
}
// parseD: parses DD.MM.YYYY or YYYY-MM-DD, returns Date or null
function parseD(s) {
  if (!s) return null;
  const t = String(s).trim();
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(t)) {
    const [d,m,y] = t.split('.').map(n => parseInt(n,10));
    const dt = new Date(y, m-1, d);
    return isNaN(dt) ? null : dt;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const dt = new Date(t);
    return isNaN(dt) ? null : dt;
  }
  return null;
}
// fmtDateDE: zeigt Datum als TT.MM.JJJJ, akzeptiert beliebige Input-Formate
// Zentrale Datums-Parsing-Logik fuer toDateInputValue/fmtDateDE (vorher dupliziert).
// Erkennt ISO (YYYY-MM-DD, ggf. mit Zeitanteil) oder deutsches Format (T.M.JJJJ).
// validate=true prueft Wertebereiche (Monat 1-12, Tag 1-31) bei deutschem Format.
function _parseDateParts(s, validate){
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return {y:+m[1], mo:+m[2], d:+m[3]};
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const d=+m[1], mo=+m[2], y=+m[3];
    if (validate && (mo<1||mo>12||d<1||d>31)) return null;
    return {y, mo, d};
  }
  return null;
}

function toDateInputValue(v) {
  // Normalisiert verschiedene Datumsformate zu YYYY-MM-DD fuer <input type="date">
  if (!v) return "";
  const s = String(v).trim();
  if (!s) return "";
  const p = _parseDateParts(s, false);
  if (p) return `${p.y}-${String(p.mo).padStart(2,"0")}-${String(p.d).padStart(2,"0")}`;
  // Fallback: als Date parsen
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10);
  return "";
}

function fmtDateDE(input) {
  if (!input) return "";
  const s = String(input).trim();
  if (!s) return "";
  const p = _parseDateParts(s, true);
  if (p) return `${String(p.d).padStart(2,'0')}.${String(p.mo).padStart(2,'0')}.${p.y}`;
  // Fallback: versuche Date-Parsing
  const dt = new Date(s);
  if (!isNaN(dt) && dt.getFullYear() > 1900 && dt.getFullYear() < 2100) {
    return dt.toLocaleDateString("de-CH");
  }
  return s; // wenn nichts geht, original String zurückgeben (statt "Invalid Date")
}

// Normalize room size input: "14" → "14 m²", "14m2" → "14 m²", "14 qm" → "14 m²", "" → ""
function formatGroesse(input) {
  if (!input) return "";
  const str = String(input).trim();
  if (!str) return "";
  // Extract just the numeric value
  const match = str.match(/^(\d+(?:[.,]\d+)?)/);
  if (!match) return str; // No number found - return as-is
  const num = match[1].replace(",", ".");
  return `${num} m²`;
}

// Natural sort comparator (A1, A2, A10 instead of A1, A10, A2)
function natSort(a, b) {
  return String(a).localeCompare(String(b), undefined, {numeric:true, sensitivity:'base'});
}
function StatusBdg({status}){
  const m={"Neu":["b","● Neu"],"In Prüfung":["y","◐ In Prüfung"],"Bestätigt":["g","✓ Bestätigt"],"Abgelehnt":["r","✗ Abgelehnt"],"Zugeteilt":["g","🏠 Zugeteilt"]};
  const [c,l]=m[status]||["x",status];return <span className={`bx b-${c}`}>{l}</span>;
}

// ─── VALIDIERUNG ─────────────────────────────────────────────────────────────
// Email-Validierung (RFC-5322 vereinfacht)
function validateEmail(v) {
  if (!v) return { ok: true, value: "" };
  const trimmed = String(v).trim().toLowerCase();
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!re.test(trimmed)) return { ok: false, value: trimmed, error: "Ungültige E-Mail-Adresse" };
  return { ok: true, value: trimmed };
}

// Telefon-Validierung (CH/international)
function validatePhone(v) {
  if (!v) return { ok: true, value: "" };
  // Nur Zahlen, +, Leerzeichen erlauben
  const cleaned = String(v).replace(/[^\d+\s]/g, "").trim();
  // Mindestens 9 Ziffern (CH Mobile: 7891234567 = 10 Ziffern, ohne 0: 9)
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < 9) return { ok: false, value: cleaned, error: "Telefonnummer zu kurz (mind. 9 Ziffern)" };
  if (digits.length > 15) return { ok: false, value: cleaned, error: "Telefonnummer zu lang" };
  return { ok: true, value: cleaned };
}

// Format Schweizer Telefonnummer schön: 0781234567 → 078 123 45 67
function formatPhoneCH(v) {
  if (!v) return "";
  const digits = String(v).replace(/\D/g, "");
  // CH mobile/landline ohne Vorwahl: 0781234567 (10 Ziffern, beginnt mit 0)
  if (digits.length === 10 && digits[0] === "0") {
    return `${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6,8)} ${digits.slice(8,10)}`;
  }
  // CH mit Landesvorwahl: +41781234567 oder 41781234567 (11-12 Ziffern)
  if (digits.length === 11 && digits.startsWith("41")) {
    return `+41 ${digits.slice(2,4)} ${digits.slice(4,7)} ${digits.slice(7,9)} ${digits.slice(9,11)}`;
  }
  // Sonst: original mit + falls vorhanden
  return String(v).replace(/[^\d+\s]/g, "").trim();
}

// Datum-Validierung (DD.MM.YYYY)
function validateDate(v, opts = {}) {
  if (!v) return { ok: true, value: "" };
  const trimmed = String(v).trim();
  // Akzeptiere DD.MM.YYYY oder YYYY-MM-DD
  let day, month, year;
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split(".").map(n => parseInt(n, 10));
    day = d; month = m; year = y;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split("-").map(n => parseInt(n, 10));
    day = d; month = m; year = y;
  } else {
    return { ok: false, value: trimmed, error: "Format: TT.MM.JJJJ" };
  }
  
  if (month < 1 || month > 12) return { ok: false, value: trimmed, error: "Monat ungültig (1-12)" };
  if (day < 1 || day > 31) return { ok: false, value: trimmed, error: "Tag ungültig (1-31)" };
  if (year < 1900 || year > 2100) return { ok: false, value: trimmed, error: "Jahr ungültig" };
  
  // Tatsächlich gültiges Datum prüfen (z.B. 31.02. wäre invalid)
  const dt = new Date(year, month - 1, day);
  if (dt.getDate() !== day || dt.getMonth() !== month - 1 || dt.getFullYear() !== year) {
    return { ok: false, value: trimmed, error: "Datum existiert nicht" };
  }
  
  // Geburtstag-spezifische Checks
  if (opts.type === "birthday") {
    const today = new Date();
    const age = (today - dt) / (1000 * 60 * 60 * 24 * 365.25);
    if (age < 0) return { ok: false, value: trimmed, error: "Geburtstag in der Zukunft?" };
    if (age < 16) return { ok: false, value: trimmed, error: "Mindestalter 16 Jahre" };
    if (age > 120) return { ok: false, value: trimmed, error: "Alter unrealistisch (>120)" };
  }
  
  // Auf DD.MM.YYYY normalisieren
  const normalized = `${String(day).padStart(2,'0')}.${String(month).padStart(2,'0')}.${year}`;
  return { ok: true, value: normalized };
}

// PLZ-Validierung
function validatePLZ(v) {
  if (!v) return { ok: true, value: "" };
  const trimmed = String(v).trim();
  // CH: 4 Ziffern (1000-9999)
  if (/^\d{4}$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    if (n >= 1000 && n <= 9999) return { ok: true, value: trimmed };
  }
  // International: erlaubt 3-10 alphanumerisch
  if (/^[A-Z0-9 -]{3,10}$/i.test(trimmed)) return { ok: true, value: trimmed.toUpperCase() };
  return { ok: false, value: trimmed, error: "PLZ ungültig (4 Ziffern für CH)" };
}

// Nicht-negative Zahl
function validateNumber(v, opts = {}) {
  if (v === "" || v === null || v === undefined) return { ok: true, value: "" };
  const n = Number(String(v).replace(",", "."));
  if (isNaN(n)) return { ok: false, value: v, error: "Keine gültige Zahl" };
  if (opts.min !== undefined && n < opts.min) return { ok: false, value: v, error: `Mindestwert: ${opts.min}` };
  if (opts.max !== undefined && n > opts.max) return { ok: false, value: v, error: `Höchstwert: ${opts.max}` };
  if (opts.integer && !Number.isInteger(n)) return { ok: false, value: v, error: "Nur ganze Zahlen" };
  return { ok: true, value: n };
}

// Nationalitäten-Liste (CH/DE/IT/AT zuerst, dann alphabetisch)
const NATIONALITAETEN_TOP = ["Schweiz", "Deutschland", "Italien", "Österreich"];
const NATIONALITAETEN_REST = [
  "Afghanistan", "Albanien", "Algerien", "Argentinien", "Australien", "Ägypten", "Äthiopien",
  "Bangladesch", "Belarus", "Belgien", "Bosnien und Herzegowina", "Brasilien", "Bulgarien",
  "Chile", "China",
  "Dänemark",
  "Eritrea", "Estland",
  "Finnland", "Frankreich",
  "Ghana", "Griechenland",
  "Indien", "Indonesien", "Irak", "Iran", "Irland", "Island", "Israel",
  "Japan", "Jordanien",
  "Kanada", "Katar", "Kenia", "Kolumbien", "Kosovo", "Kroatien", "Kuwait",
  "Lettland", "Libanon", "Libyen", "Litauen", "Luxemburg",
  "Malaysia", "Malta", "Marokko", "Mexiko", "Moldau",
  "Neuseeland", "Niederlande", "Nigeria", "Nordkorea", "Nordmazedonien", "Norwegen",
  "Oman",
  "Pakistan", "Peru", "Philippinen", "Polen", "Portugal",
  "Rumänien", "Russland",
  "Saudi-Arabien", "Schweden", "Senegal", "Serbien", "Singapur", "Slowakei", "Slowenien", "Somalia",
  "Spanien", "Sri Lanka", "Südafrika", "Südkorea", "Syrien",
  "Thailand", "Tschechien", "Tunesien", "Türkei",
  "Ukraine", "Ungarn", "USA",
  "Vereinigte Arabische Emirate", "Vereinigtes Königreich", "Vietnam",
  "Zypern",
  "Andere"
];
const NATIONALITAETEN = [...NATIONALITAETEN_TOP, ...NATIONALITAETEN_REST];

