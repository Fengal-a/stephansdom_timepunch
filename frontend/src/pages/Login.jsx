import { useState } from "react";

const API = import.meta.env.VITE_API_URL ?? "";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const body = new URLSearchParams({ username: username.toLowerCase(), password });
      const res  = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error("Zu viele Anmeldeversuche. Bitte warten Sie einen Moment.");
        }
        const data = await res.json();
        throw new Error(data.detail ?? "Anmeldung fehlgeschlagen.");
      }

      const data = await res.json();
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.root}>
      {/* Background grid */}
      <div style={styles.grid} aria-hidden="true" />

      <div style={styles.card}>
        {/* Logo / brand */}
        <div style={styles.brand}>
          <img src="/cathedral.png" alt="Stephansdom" style={styles.logo} />
        </div>

        <h1 style={styles.heading}>Anmelden</h1>
        <p style={styles.sub}>Geben Sie Ihre Zugangsdaten ein</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label} htmlFor="username">Benutzername</label>
            <input
              id="username"
              style={styles.input}
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              disabled={loading}
              placeholder="mustermann"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="password">Passwort</label>
            <input
              id="password"
              style={styles.input}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              disabled={loading}
              placeholder="••••••••"
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button
            type="submit"
            style={{ ...styles.btn, ...(loading ? styles.btnDisabled : {}) }}
            disabled={loading}
          >
            {loading ? (
              <span style={styles.spinner} />
            ) : (
              "EINLOGGEN"
            )}
          </button>

          <p style={styles.forgotHint}>
            Passwort vergessen? Bitte wenden Sie sich an Ihren Administrator.
          </p>
        </form>
      </div>

      <p style={styles.footer}>TimePunch &copy; {new Date().getFullYear()}</p>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const ORANGE  = "#F5620F";
const BLACK   = "#0D0D0D";
const SURFACE = "#161616";
const BORDER  = "#2A2A2A";
const TEXT    = "#EDEDED";
const MUTED   = "#6B6B6B";

const styles = {
  root: {
    minHeight: "100dvh",
    background: BLACK,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
    fontFamily: "'DM Mono', 'Courier New', monospace",
    position: "relative",
    overflow: "hidden",
  },
  grid: {
    position: "absolute",
    inset: 0,
    backgroundImage: `
      linear-gradient(${BORDER} 1px, transparent 1px),
      linear-gradient(90deg, ${BORDER} 1px, transparent 1px)
    `,
    backgroundSize: "40px 40px",
    opacity: 0.5,
    pointerEvents: "none",
  },
  card: {
    position: "relative",
    zIndex: 1,
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderTop: `3px solid ${ORANGE}`,
    borderRadius: "4px",
    padding: "36px 28px",
    width: "100%",
    maxWidth: "380px",
    boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
  },
  brand: {
    display: "flex",
    justifyContent: "center",
    marginBottom: "28px",
  },
  logo: {
    height: "64px",
    width: "auto",
    objectFit: "contain",
  },
  heading: {
    margin: "0 0 4px",
    fontSize: "26px",
    fontWeight: "700",
    color: TEXT,
    letterSpacing: "-0.02em",
    fontFamily: "'DM Sans', sans-serif",
  },
  sub: {
    margin: "0 0 28px",
    fontSize: "13px",
    color: MUTED,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontSize: "11px",
    fontWeight: "600",
    letterSpacing: "0.12em",
    color: MUTED,
    textTransform: "uppercase",
  },
  input: {
    background: BLACK,
    border: `1px solid ${BORDER}`,
    borderRadius: "3px",
    padding: "13px 14px",
    fontSize: "15px",
    color: TEXT,
    fontFamily: "'DM Mono', 'Courier New', monospace",
    outline: "none",
    transition: "border-color 0.15s",
    WebkitAppearance: "none",
  },
  error: {
    margin: 0,
    padding: "10px 14px",
    background: "rgba(245,98,15,0.1)",
    border: `1px solid rgba(245,98,15,0.3)`,
    borderRadius: "3px",
    fontSize: "13px",
    color: ORANGE,
  },
  btn: {
    marginTop: "8px",
    background: ORANGE,
    border: "none",
    borderRadius: "3px",
    padding: "15px",
    fontSize: "13px",
    fontWeight: "700",
    letterSpacing: "0.15em",
    color: "#fff",
    fontFamily: "'DM Mono', 'Courier New', monospace",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "52px",
    transition: "background 0.15s, transform 0.1s",
  },
  btnDisabled: {
    background: "#7a3107",
    cursor: "not-allowed",
  },
  spinner: {
    width: "18px",
    height: "18px",
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    display: "inline-block",
    animation: "spin 0.7s linear infinite",
  },
  forgotHint: {
    margin: 0,
    fontSize: "11px",
    color: MUTED,
    textAlign: "center",
    lineHeight: "1.5",
  },
  footer: {
    position: "relative",
    zIndex: 1,
    marginTop: "24px",
    fontSize: "11px",
    color: MUTED,
    letterSpacing: "0.08em",
  },
};