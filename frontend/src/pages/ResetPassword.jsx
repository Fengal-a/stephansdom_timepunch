import { useState } from "react";

const API = import.meta.env.VITE_API_URL ?? "";

export default function ResetPassword({ onDone }) {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [error,    setError]    = useState("");
  const [done,     setDone]     = useState(false);
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwörter stimmen nicht überein"); return; }
    if (password.length < 4)  { setError("Mindestens 4 Zeichen erforderlich"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        setDone(true);
      } else {
        const d = await res.json();
        setError(d.detail ?? "Fehler beim Zurücksetzen");
      }
    } catch {
      setError("Verbindungsfehler");
    }
    setLoading(false);
  }

  return (
    <div style={s.root}>
      <div style={s.grid} aria-hidden="true" />
      <div style={s.card}>
        <div style={s.brand}>
          <img src="/cathedral.png" alt="Stephansdom" style={s.logo} />
        </div>

        <h1 style={s.heading}>Neues Passwort</h1>

        {done ? (
          <>
            <p style={s.sub}>Ihr Passwort wurde erfolgreich gesetzt. Sie können sich jetzt anmelden.</p>
            <button style={s.btn} onClick={onDone}>Zur Anmeldung</button>
          </>
        ) : !token ? (
          <>
            <p style={s.sub}>Ungültiger Link. Bitte fordern Sie einen neuen Link an.</p>
            <button style={s.btn} onClick={onDone}>Zur Anmeldung</button>
          </>
        ) : (
          <>
            <p style={s.sub}>Wählen Sie ein neues Passwort.</p>
            <form onSubmit={handleSubmit} style={s.form}>
              <div style={s.field}>
                <label style={s.label} htmlFor="pw">Neues Passwort</label>
                <input
                  id="pw" style={s.input} type="password"
                  autoComplete="new-password" placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)}
                  required disabled={loading}
                />
              </div>
              <div style={s.field}>
                <label style={s.label} htmlFor="pw2">Passwort bestätigen</label>
                <input
                  id="pw2" style={s.input} type="password"
                  autoComplete="new-password" placeholder="••••••••"
                  value={confirm} onChange={e => setConfirm(e.target.value)}
                  required disabled={loading}
                />
              </div>
              {error && <p style={s.error}>{error}</p>}
              <button
                type="submit"
                style={{ ...s.btn, ...(loading ? s.btnDisabled : {}) }}
                disabled={loading}
              >
                {loading ? <span style={s.spinner} /> : "PASSWORT SETZEN"}
              </button>
            </form>
          </>
        )}
      </div>
      <p style={s.footer}>TimePunch &copy; {new Date().getFullYear()}</p>
    </div>
  );
}

const ORANGE  = "#F5620F";
const BLACK   = "#0D0D0D";
const SURFACE = "#161616";
const BORDER  = "#2A2A2A";
const TEXT    = "#EDEDED";
const MUTED   = "#6B6B6B";

const s = {
  root: {
    minHeight: "100dvh", background: BLACK,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    padding: "24px 16px", fontFamily: "'DM Mono', 'Courier New', monospace",
    position: "relative", overflow: "hidden",
  },
  grid: {
    position: "absolute", inset: 0,
    backgroundImage: `linear-gradient(${BORDER} 1px, transparent 1px), linear-gradient(90deg, ${BORDER} 1px, transparent 1px)`,
    backgroundSize: "40px 40px", opacity: 0.5, pointerEvents: "none",
  },
  card: {
    position: "relative", zIndex: 1, background: SURFACE,
    border: `1px solid ${BORDER}`, borderTop: `3px solid ${ORANGE}`,
    borderRadius: "4px", padding: "36px 28px", width: "100%", maxWidth: "380px",
    boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
  },
  brand: { display: "flex", justifyContent: "center", marginBottom: "28px" },
  logo: { height: "64px", width: "auto", objectFit: "contain" },
  heading: {
    margin: "0 0 4px", fontSize: "26px", fontWeight: "700", color: TEXT,
    letterSpacing: "-0.02em", fontFamily: "'DM Sans', sans-serif",
  },
  sub: { margin: "0 0 28px", fontSize: "13px", color: MUTED, lineHeight: "1.6" },
  form: { display: "flex", flexDirection: "column", gap: "16px" },
  field: { display: "flex", flexDirection: "column", gap: "6px" },
  label: { fontSize: "11px", fontWeight: "600", letterSpacing: "0.12em", color: MUTED, textTransform: "uppercase" },
  input: {
    background: BLACK, border: `1px solid ${BORDER}`, borderRadius: "3px",
    padding: "13px 14px", fontSize: "15px", color: TEXT,
    fontFamily: "'DM Mono', 'Courier New', monospace", outline: "none",
    WebkitAppearance: "none",
  },
  error: {
    margin: 0, padding: "10px 14px",
    background: "rgba(245,98,15,0.1)", border: `1px solid rgba(245,98,15,0.3)`,
    borderRadius: "3px", fontSize: "13px", color: ORANGE,
  },
  btn: {
    background: ORANGE, border: "none", borderRadius: "3px",
    padding: "15px", fontSize: "13px", fontWeight: "700",
    letterSpacing: "0.15em", color: "#fff",
    fontFamily: "'DM Mono', 'Courier New', monospace",
    cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", minHeight: "52px",
  },
  btnDisabled: { background: "#7a3107", cursor: "not-allowed" },
  spinner: {
    width: "18px", height: "18px",
    border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff",
    borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite",
  },
  footer: { position: "relative", zIndex: 1, marginTop: "24px", fontSize: "11px", color: MUTED, letterSpacing: "0.08em" },
};
