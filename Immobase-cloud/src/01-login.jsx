// ─── LOGIN ───────────────────────────────────────────────────────────────────
// Echte Anmeldung ueber Supabase Auth. Kein Passwort mehr im Quelltext.

function Login({onLogin}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [resetMode, setResetMode] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true); setMsg(null);
    if (resetMode) {
      const {error} = await supabase.auth.resetPasswordForEmail(email.trim(), {redirectTo: window.location.origin});
      setMsg(error ? {type:"error", text:"Konnte nicht gesendet werden: " + error.message}
                   : {type:"ok", text:"Wenn die Adresse hinterlegt ist, wurde eine E-Mail zum Zuruecksetzen verschickt."});
      setLoading(false);
      return;
    }
    if (registerMode) {
      if (password.length < 10) {
        setMsg({type:"error", text:"Bitte mindestens 10 Zeichen fuer das Passwort verwenden."});
        setLoading(false);
        return;
      }
      const {data, error} = await supabase.auth.signUp({email: email.trim(), password});
      if (error) {
        setMsg({type:"error", text: /freigeschaltet/i.test(error.message || "")
          ? "Diese E-Mail-Adresse ist nicht freigeschaltet. Bitte wende dich an Daan oder Tijn."
          : ("Konto konnte nicht erstellt werden: " + (error.message || "unbekannt"))});
      } else if (data?.session) {
        onLogin();
      } else {
        setMsg({type:"ok", text:"Konto erstellt. Bitte bestaetige deine E-Mail-Adresse ueber den Link, den wir dir geschickt haben, und melde dich danach an."});
        setRegisterMode(false);
        setPassword("");
      }
      setLoading(false);
      return;
    }
    const {data, error} = await supabase.auth.signInWithPassword({email: email.trim(), password});
    if (error || !data?.session) {
      setMsg({type:"error", text: error?.message === "Invalid login credentials"
        ? "E-Mail oder Passwort stimmt nicht."
        : ("Anmeldung fehlgeschlagen: " + (error?.message || "unbekannt"))});
      setPassword("");
    } else {
      try { sessionStorage.setItem("ib_pw_login","1"); } catch(_) {}
      onLogin();
    }
    setLoading(false);
  }

  async function mitPasskey() {
    setLoading(true); setMsg(null);
    try {
      const {data, error} = await supabase.auth.signInWithPasskey();
      if (error || !data?.session) { const t = passkeyFehlerText(error); if (t) setMsg({type:"error", text:t}); }
      else { try { localStorage.setItem("ib_passkey","1"); } catch(_) {} onLogin(); }
    } catch (e) { const t = passkeyFehlerText(e); if (t) setMsg({type:"error", text:t}); }
    setLoading(false);
  }
  const hatPasskey = (()=>{ try { return localStorage.getItem("ib_passkey")==="1"; } catch(_) { return false; } })();
  const pkKnopf = PASSKEY_MOEGLICH && !resetMode && !registerMode && (
    <button type="button" className="login-btn" onClick={mitPasskey} disabled={loading}
      style={hatPasskey ? {marginTop:0,marginBottom:14} : {marginTop:10,background:"transparent",color:"var(--ink)",border:"1px solid var(--line)"}}>
      {loading ? "Bitte warten…" : `Mit ${passkeyName()} anmelden`}
    </button>
  );

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo"><h1>ImmoBase</h1><p>D&T HOMES</p></div>
        <h2>{resetMode ? "Passwort zuruecksetzen" : (registerMode ? "Konto erstellen" : "Anmelden")}</h2>
        <p className="desc">{resetMode
          ? "Gib deine E-Mail-Adresse ein, wir schicken dir einen Link."
          : (registerMode
            ? "Nur fuer freigeschaltete Adressen. Waehle ein Passwort mit mindestens 10 Zeichen."
            : "Melde dich mit deiner D&T-Adresse an.")}</p>
        {hatPasskey && pkKnopf}
        {hatPasskey && PASSKEY_MOEGLICH && !resetMode && !registerMode && <div style={{fontSize:11,color:"var(--muted)",textAlign:"center",margin:"-4px 0 12px"}}>oder mit Passwort</div>}
        <form onSubmit={handleLogin}>
          <input className="login-input" type="email" required placeholder="E-Mail" autoFocus={!hatPasskey} autoComplete="username webauthn"
            value={email} onChange={e=>setEmail(e.target.value)} disabled={loading}/>
          {!resetMode && (
            <input className="login-input" type="password" required placeholder="Passwort" autoComplete={registerMode?"new-password":"current-password"}
              value={password} onChange={e=>setPassword(e.target.value)} disabled={loading}/>
          )}
          <button className="login-btn" type="submit" disabled={loading||!email||(!resetMode&&!password)}>
            {loading ? "Bitte warten…" : (resetMode ? "Link senden" : (registerMode ? "Konto erstellen →" : "Anmelden →"))}
          </button>
        </form>
        {!hatPasskey && pkKnopf}
        {msg && <div className={`login-msg ${msg.type}`}>{msg.text}</div>}
        <div style={{display:"flex",gap:16,justifyContent:"center"}}>
          <button onClick={()=>{setResetMode(!resetMode);setRegisterMode(false);setMsg(null);}}
            style={{background:"none",border:"none",color:"var(--muted)",fontSize:11.5,marginTop:14,cursor:"pointer",textDecoration:"underline",fontFamily:"inherit"}}>
            {resetMode ? "Zurueck zur Anmeldung" : "Passwort vergessen?"}
          </button>
          {!resetMode && (
            <button onClick={()=>{setRegisterMode(!registerMode);setMsg(null);}}
              style={{background:"none",border:"none",color:"var(--muted)",fontSize:11.5,marginTop:14,cursor:"pointer",textDecoration:"underline",fontFamily:"inherit"}}>
              {registerMode ? "Zurueck zur Anmeldung" : "Neu hier? Konto erstellen"}
            </button>
          )}
        </div>
        <div className="login-foot">D&T Homes Verwaltungs-System</div>
      </div>
    </div>
  );
}

