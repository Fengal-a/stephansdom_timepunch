import { useState } from "react";

const API = import.meta.env.VITE_API_URL ?? "";

export default function ForgotPassword({ onBack }) {
  const [email,     setEmail]     = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading,   setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    await fetch(`${API}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setSubmitted(true);
    setLoading(false);
  }

  return (
    <div style={s.root}>
      <div style={s.grid} aria-hidden="true" />
      <div style={s.card}>
        <div style={s.brand}>
          <img src="/cathedral.png" alt="Stephansdom" style={s.logo} />
        </div>

        <h1 style={s.heading}>Passwort vergessen</h1>

        {submitted ? (
          <>
            <p style={s.sub}>
              Falls eine E-Mail-Adresse mit diesem Konto verknüpft ist, erhalten Sie in Kürze eine E-Mail mit einem Link zum Zurücksetzen Ihres Passworts.
            </p>
            <button style={s.btn} onClick={onBack}>Zurück zur Anmeldung</button>
          </>
        ) : (
          <>
            <p style={s.sub}>Geben Sie Ihre E-Mail-Adresse ein.</p>
            <form onSubmit={handleSubmit} style={s.form}>
              <div style={s.field}>
                <label style={s.label} htmlFor="email">E-Mail-Adresse</label>
                <input
                  id="email"
                  style={s.input}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="name@beispiel.at"
                />
              </div>
              <button
                type="submit"
                style={{ ...s.btn, ...(loading ? s.btnDisabled : {}) }}
                disabled={loading}
              >
                {loading ? <span style={s.spinner} /> : "LINK SENDEN"}
              </button>
              <button type="button" style={s.backLink} onClick={onBack}>
                Zurück zur Anmeldung
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
  backLink: {
    background: "none", border: "none", padding: 0,
    fontSize: "12px", color: MUTED, textAlign: "center",
    cursor: "pointer", fontFamily: "'DM Mono', 'Courier New', monospace",
    textDecoration: "underline", alignSelf: "center",
  },
  footer: { position: "relative", zIndex: 1, marginTop: "24px", fontSize: "11px", color: MUTED, letterSpacing: "0.08em" },
};
