import { useState, useEffect, useRef } from "react";

const API = import.meta.env.VITE_API_URL ?? "";

function authHeaders() {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function formatTime(isoString) {
  if (!isoString) return "--:--";
  return new Date(isoString).toLocaleTimeString("de-AT", {
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDuration(minutes) {
  if (!minutes && minutes !== 0) return "--";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function totalMinutesToday(entries) {
  return entries.reduce((sum, e) => sum + (e.duration_minutes ?? 0), 0);
}

export default function Dashboard({ user, onLogout }) {
  const [status, setStatus]       = useState(null);   // { clocked_in, punch_in }
  const [entries, setEntries]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [punching, setPunching]   = useState(false);

  // Note modal
  const [showNote, setShowNote]   = useState(false);
  const [note, setNote]           = useState("");
  const noteRef                   = useRef(null);

  // Live clock while clocked in
  const [elapsed, setElapsed]     = useState("");

  useEffect(() => {
    fetchStatus();
    fetchEntries();
  }, []);

  // Tick elapsed time every 30s while clocked in
  useEffect(() => {
    if (!status?.clocked_in || !status?.punch_in) { setElapsed(""); return; }
    const tick = () => {
      const mins = Math.floor((Date.now() - new Date(status.punch_in)) / 60000);
      setElapsed(formatDuration(mins));
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [status]);

  // Focus textarea when note modal opens
  useEffect(() => {
    if (showNote && noteRef.current) noteRef.current.focus();
  }, [showNote]);

  async function fetchStatus() {
    try {
      const res = await fetch(`${API}/users/status`, { headers: authHeaders() });
      if (res.status === 401) { onLogout(); return; }
      setStatus(await res.json());
    } catch {}
  }

  async function fetchEntries() {
    try {
      const res = await fetch(`${API}/users/entries`, { headers: authHeaders() });
      if (res.ok) setEntries(await res.json());
    } catch {}
    setLoading(false);
  }

  // Pressing the big button
  function handlePunchPress() {
    if (status?.clocked_in) {
      // Show note modal before punching out
      setNote("");
      setShowNote(true);
    } else {
      doPunch(null);
    }
  }

  async function doPunch(noteText) {
    setPunching(true);
    setShowNote(false);
    try {
      const res = await fetch(`${API}/users/punch`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ note: noteText || null }),
      });
      if (res.ok) {
        await fetchStatus();
        await fetchEntries();
      }
    } catch {}
    setPunching(false);
  }

  const clockedIn = status?.clocked_in ?? false;
  const todayMins = totalMinutesToday(entries);

  return (
    <div style={s.root}>
      <div style={s.bg} aria-hidden="true" />

      {/* Header */}
      <header style={s.header}>
        <div style={s.brand}>
          <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
            <rect x="3" y="3" width="10" height="10" fill="#F5620F" />
            <rect x="15" y="3" width="10" height="10" fill="#F5620F" opacity=".4" />
            <rect x="3" y="15" width="10" height="10" fill="#F5620F" opacity=".4" />
            <rect x="15" y="15" width="10" height="10" fill="#F5620F" />
          </svg>
          <span style={s.brandText}>TIMEPUNCH</span>
        </div>
        <div style={s.headerRight}>
          <span style={s.userName}>{user.name}</span>
          <button style={s.logoutBtn} onClick={onLogout}>Abmelden</button>
        </div>
      </header>

      {/* Main content */}
      <main style={s.main}>

        {/* Status pill */}
        <div style={{ ...s.pill, ...(clockedIn ? s.pillActive : s.pillInactive) }}>
          <span style={{ ...s.pillDot, background: clockedIn ? "#22c55e" : "#6B6B6B" }} />
          {clockedIn ? "Eingestempelt" : "Ausgestempelt"}
        </div>

        {/* The big button */}
        <button
          style={{
            ...s.bigBtn,
            ...(clockedIn ? s.bigBtnOut : s.bigBtnIn),
            ...(punching ? s.bigBtnDisabled : {}),
          }}
          onClick={handlePunchPress}
          disabled={punching || loading}
        >
          {punching ? (
            <span style={s.spinner} />
          ) : clockedIn ? (
            <>
              <span style={s.bigBtnIcon}>■</span>
              <span style={s.bigBtnLabel}>AUSSTEMPELN</span>
            </>
          ) : (
            <>
              <span style={s.bigBtnIcon}>▶</span>
              <span style={s.bigBtnLabel}>EINSTEMPELN</span>
            </>
          )}
        </button>

        {/* Stats row */}
        <div style={s.statsRow}>
          <div style={s.stat}>
            <span style={s.statLabel}>Eingestempelt um</span>
            <span style={s.statValue}>
              {clockedIn ? formatTime(status.punch_in) : "--:--"}
            </span>
          </div>
          <div style={s.statDivider} />
          <div style={s.stat}>
            <span style={s.statLabel}>Heute gearbeitet</span>
            <span style={s.statValue}>
              {clockedIn && elapsed
                ? elapsed
                : todayMins > 0
                ? formatDuration(todayMins)
                : "--"}
            </span>
          </div>
        </div>

        {/* Today's entries log */}
        {entries.length > 0 && (
          <div style={s.log}>
            <p style={s.logTitle}>HEUTIGE EINTRÄGE</p>
            {entries.map(e => (
              <div key={e.id} style={s.logRow}>
                <span style={s.logTime}>
                  {formatTime(e.punch_in)} → {e.punch_out ? formatTime(e.punch_out) : "läuft"}
                </span>
                <span style={s.logDur}>
                  {e.duration_minutes != null ? formatDuration(e.duration_minutes) : ""}
                </span>
                {e.note && <span style={s.logNote}>"{e.note}"</span>}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Note modal (slide up) */}
      {showNote && (
        <div style={s.overlay} onClick={() => setShowNote(false)}>
          <div style={s.sheet} onClick={e => e.stopPropagation()}>
            <div style={s.sheetHandle} />
            <p style={s.sheetTitle}>Notiz hinzufügen</p>
            <p style={s.sheetSub}>Optional — wird zum Eintrag gespeichert</p>
            <textarea
              ref={noteRef}
              style={s.textarea}
              placeholder="z.B. Mittagspause, Überstunden..."
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
            />
            <button style={s.confirmBtn} onClick={() => doPunch(note)}>
              AUSSTEMPELN
            </button>
            <button style={s.skipBtn} onClick={() => doPunch(null)}>
              Ohne Notiz ausstempeln
            </button>
            <button style={s.cancelBtn} onClick={() => setShowNote(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const BLACK   = "#0D0D0D";
const SURFACE = "#161616";
const BORDER  = "#2A2A2A";
const ORANGE  = "#F5620F";
const TEXT    = "#EDEDED";
const MUTED   = "#6B6B6B";
const GREEN   = "#22c55e";

const s = {
  root: {
    minHeight: "100dvh",
    background: BLACK,
    fontFamily: "'DM Mono', 'Courier New', monospace",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    overflow: "hidden",
  },
  bg: {
    position: "fixed",
    inset: 0,
    backgroundImage: `linear-gradient(${BORDER} 1px, transparent 1px), linear-gradient(90deg, ${BORDER} 1px, transparent 1px)`,
    backgroundSize: "40px 40px",
    opacity: 0.35,
    pointerEvents: "none",
  },
  header: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: `1px solid ${BORDER}`,
    background: SURFACE,
  },
  brand: { display: "flex", alignItems: "center", gap: "8px" },
  brandText: { fontSize: "12px", fontWeight: "700", letterSpacing: "0.18em", color: TEXT },
  headerRight: { display: "flex", alignItems: "center", gap: "12px" },
  userName: { fontSize: "12px", color: MUTED },
  logoutBtn: {
    background: "none", border: `1px solid ${BORDER}`, borderRadius: "3px",
    padding: "5px 10px", fontSize: "11px", color: MUTED, cursor: "pointer",
    fontFamily: "inherit", letterSpacing: "0.08em",
  },
  main: {
    position: "relative",
    zIndex: 1,
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "40px 20px 32px",
    gap: "28px",
    maxWidth: "480px",
    margin: "0 auto",
    width: "100%",
  },
  pill: {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "6px 16px", borderRadius: "999px", border: `1px solid ${BORDER}`,
    fontSize: "12px", letterSpacing: "0.1em", fontWeight: "600",
  },
  pillActive:   { color: GREEN,  borderColor: "rgba(34,197,94,0.3)",  background: "rgba(34,197,94,0.07)"  },
  pillInactive: { color: MUTED,  borderColor: BORDER,                 background: "transparent"           },
  pillDot: { width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0 },

  bigBtn: {
    width: "220px", height: "220px", borderRadius: "50%",
    border: "none", cursor: "pointer",
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: "10px",
    boxShadow: "0 0 0 12px rgba(255,255,255,0.03), 0 0 0 24px rgba(255,255,255,0.015)",
    transition: "transform 0.12s, box-shadow 0.12s",
    WebkitTapHighlightColor: "transparent",
  },
  bigBtnIn: {
    background: "linear-gradient(145deg, #1a5c1a, #0f3d0f)",
    boxShadow: "0 0 0 12px rgba(34,197,94,0.06), 0 0 60px rgba(34,197,94,0.15)",
  },
  bigBtnOut: {
    background: "linear-gradient(145deg, #7a1f06, #4a1204)",
    boxShadow: "0 0 0 12px rgba(245,98,15,0.06), 0 0 60px rgba(245,98,15,0.15)",
  },
  bigBtnDisabled: { opacity: 0.5, cursor: "not-allowed" },
  bigBtnIcon:  { fontSize: "32px", color: "#fff", lineHeight: 1 },
  bigBtnLabel: { fontSize: "13px", fontWeight: "700", letterSpacing: "0.15em", color: "#fff" },
  spinner: {
    width: "28px", height: "28px",
    border: "3px solid rgba(255,255,255,0.2)",
    borderTopColor: "#fff", borderRadius: "50%",
    display: "inline-block", animation: "spin 0.7s linear infinite",
  },

  statsRow: {
    display: "flex", alignItems: "stretch",
    background: SURFACE, border: `1px solid ${BORDER}`,
    borderRadius: "6px", overflow: "hidden", width: "100%",
  },
  stat: {
    flex: 1, display: "flex", flexDirection: "column",
    alignItems: "center", padding: "18px 12px", gap: "6px",
  },
  statDivider: { width: "1px", background: BORDER, flexShrink: 0 },
  statLabel:   { fontSize: "10px", color: MUTED, letterSpacing: "0.12em", textTransform: "uppercase" },
  statValue:   { fontSize: "22px", fontWeight: "700", color: TEXT, letterSpacing: "-0.02em", fontFamily: "'DM Sans', sans-serif" },

  log: {
    width: "100%", background: SURFACE,
    border: `1px solid ${BORDER}`, borderRadius: "6px",
    padding: "16px", display: "flex", flexDirection: "column", gap: "10px",
  },
  logTitle: { margin: 0, fontSize: "10px", color: MUTED, letterSpacing: "0.15em" },
  logRow: {
    display: "flex", flexWrap: "wrap", alignItems: "center",
    gap: "8px", paddingBottom: "10px", borderBottom: `1px solid ${BORDER}`,
  },
  logTime: { fontSize: "13px", color: TEXT, flex: 1 },
  logDur:  { fontSize: "12px", color: ORANGE },
  logNote: { width: "100%", fontSize: "11px", color: MUTED, fontStyle: "italic" },

  // Note modal
  overlay: {
    position: "fixed", inset: 0, zIndex: 50,
    background: "rgba(0,0,0,0.7)",
    display: "flex", alignItems: "flex-end",
    animation: "fadeIn 0.15s ease",
  },
  sheet: {
    width: "100%", background: "#1a1a1a",
    borderTop: `3px solid ${ORANGE}`,
    borderRadius: "12px 12px 0 0",
    padding: "20px 24px 40px",
    display: "flex", flexDirection: "column", gap: "12px",
  },
  sheetHandle: {
    width: "36px", height: "4px", borderRadius: "2px",
    background: BORDER, margin: "0 auto 8px",
  },
  sheetTitle: { margin: 0, fontSize: "18px", fontWeight: "700", color: TEXT, fontFamily: "'DM Sans', sans-serif" },
  sheetSub:   { margin: 0, fontSize: "12px", color: MUTED },
  textarea: {
    background: BLACK, border: `1px solid ${BORDER}`, borderRadius: "4px",
    padding: "12px", fontSize: "14px", color: TEXT, resize: "none",
    fontFamily: "inherit", outline: "none",
  },
  confirmBtn: {
    background: ORANGE, border: "none", borderRadius: "4px",
    padding: "16px", fontSize: "13px", fontWeight: "700",
    letterSpacing: "0.12em", color: "#fff", cursor: "pointer",
    fontFamily: "inherit",
  },
  skipBtn: {
    background: "none", border: "none", fontSize: "12px",
    color: MUTED, cursor: "pointer", fontFamily: "inherit",
    textDecoration: "underline", textAlign: "center",
  },      
  cancelBtn: {
    background: "none", border: `1px solid ${BORDER}`, borderRadius: "4px",
    padding: "12px", fontSize: "12px", color: MUTED,
    cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.08em",
  },
};