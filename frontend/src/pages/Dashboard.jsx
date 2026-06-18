import { useState, useEffect, useRef } from "react";
import Dienstplan from "./Dienstplan";

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

  // Lunch modal
  const [showLunch,   setShowLunch]   = useState(false);
  const [lunchFrom,   setLunchFrom]   = useState("12:00");
  const [lunchTill,   setLunchTill]   = useState("13:00");
  const [lunchSaving, setLunchSaving] = useState(false);
  const [lunchError,  setLunchError]  = useState("");

  // Message compose
  const [showCompose, setShowCompose] = useState(false);
  const [msgBody,     setMsgBody]     = useState("");
  const [msgSending,  setMsgSending]  = useState(false);
  const [msgSent,     setMsgSent]     = useState(false);

  async function sendMessage() {
    if (!msgBody.trim()) return;
    setMsgSending(true);
    try {
      await fetch(`${API}/messages`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ body: msgBody.trim() }),
      });
      setMsgSent(true);
      setMsgBody("");
    } catch {}
    setMsgSending(false);
  }

  function openCompose() { setMsgBody(""); setMsgSent(false); setShowCompose(true); }

  async function doSetLunch() {
    setLunchSaving(true);
    setLunchError("");
    try {
      const res = await fetch(`${API}/users/lunch`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ lunch_start: lunchFrom, lunch_end: lunchTill }),
      });
      if (!res.ok) {
        const d = await res.json();
        setLunchError(d.detail ?? "Fehler beim Speichern");
        setLunchSaving(false);
        return;
      }
      setShowLunch(false);
      await fetchEntries();
    } catch {
      setLunchError("Netzwerkfehler");
    }
    setLunchSaving(false);
  }

  // Swipe navigation
  const [page, setPage]           = useState("dashboard"); // "dashboard" | "dienstplan"
  const touchStartX               = useRef(null);

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

  function handlePunchPress() {
    if (status?.clocked_in) {
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

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (diff < -60 && page === "dashboard") setPage("dienstplan");
    if (diff > 60  && page === "dienstplan") setPage("dashboard");
  }

  const clockedIn    = status?.clocked_in ?? false;
  const todayMins    = totalMinutesToday(entries);
  const slideOffset  = page === "dienstplan" ? "-50%" : "0%";

  return (
    <div
      style={s.slideViewport}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div style={{ ...s.slideTrack, transform: `translateX(${slideOffset})` }}>

        {/* ── Dashboard panel ── */}
        <div style={s.slidePanel}>
          <div style={s.root}>
            <div style={s.bg} aria-hidden="true" />

            {/* Header */}
            <header style={s.header}>
              <img src="/cathedral.png" alt="Stephansdom" style={s.logo} />
              <div style={s.headerRight}>
                <span style={s.userName}>{user.name}</span>
                <button style={s.logoutBtn} onClick={() => setPage("dienstplan")}>Dienstplan</button>
                <button style={s.logoutBtn} onClick={openCompose}>✉</button>
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

              {/* Button area: big button centered, lunch button floats left */}
              <div style={s.btnArea}>
                <button
                  style={s.lunchBtn}
                  onClick={() => { setLunchError(""); setShowLunch(true); }}
                  disabled={loading}
                >
                  <span style={{ fontSize: "20px", lineHeight: 1 }}>☕</span>
                  <span>MITTAGS-</span>
                  <span>PAUSE</span>
                </button>
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
              </div>

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
                      {e.lunch_start && e.lunch_end && (
                        <span style={s.logLunch}>
                          ☕ {formatTime(e.lunch_start)} – {formatTime(e.lunch_end)}
                        </span>
                      )}
                      {e.note && <span style={s.logNote}>"{e.note}"</span>}
                    </div>
                  ))}
                </div>
              )}
            </main>

          </div>
        </div>

        {/* ── Dienstplan panel ── */}
        <div style={s.slidePanel}>
          <Dienstplan onSwipeBack={() => setPage("dashboard")} />
        </div>

      </div>

      {/* Lunch modal */}
      {showLunch && (
        <div style={s.overlay} onClick={() => setShowLunch(false)}>
          <div style={s.sheet} onClick={e => e.stopPropagation()}>
            <div style={s.sheetHandle} />
            <p style={s.sheetTitle}>☕ Mittagspause eintragen</p>
            <p style={s.sheetSub}>Wird zum heutigen Eintrag gespeichert</p>
            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={s.timeLabel}>Von</label>
                <input
                  type="time"
                  style={s.timeInput}
                  value={lunchFrom}
                  onChange={e => setLunchFrom(e.target.value)}
                />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={s.timeLabel}>Bis</label>
                <input
                  type="time"
                  style={s.timeInput}
                  value={lunchTill}
                  onChange={e => setLunchTill(e.target.value)}
                />
              </div>
            </div>
            {lunchError && <p style={{ margin: 0, fontSize: "12px", color: ORANGE }}>{lunchError}</p>}
            <button
              style={{ ...s.confirmBtn, ...(lunchSaving ? s.bigBtnDisabled : {}) }}
              onClick={doSetLunch}
              disabled={lunchSaving}
            >
              {lunchSaving ? <span style={s.spinner} /> : "SPEICHERN"}
            </button>
            <button style={s.cancelBtn} onClick={() => setShowLunch(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Note modal outside transformed slideTrack so position:fixed works correctly */}
      {showNote && (
        <div style={s.overlay} onClick={() => setShowNote(false)}>
          <div style={s.sheet} onClick={e => e.stopPropagation()}>
            <div style={s.sheetHandle} />
            <p style={s.sheetTitle}>Notiz hinzufügen</p>
            <p style={s.sheetSub}>Optional — wird zum Eintrag gespeichert</p>
            <textarea
              ref={noteRef}
              style={s.textarea}
              placeholder="(Notiz hinzufügen)"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
            />
            <button style={s.confirmBtn} onClick={() => doPunch(note)}>
              AUSSTEMPELN
            </button>
            <button style={s.cancelBtn} onClick={() => setShowNote(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Compose message modal */}
      {showCompose && (
        <div style={s.overlay} onClick={() => setShowCompose(false)}>
          <div style={s.sheet} onClick={e => e.stopPropagation()}>
            <div style={s.sheetHandle} />
            <p style={s.sheetTitle}>Nachricht an Admin</p>
            <p style={s.sheetSub}>Wird in den Admin-Posteingang gesendet</p>
            {msgSent ? (
              <>
                <p style={{ margin: 0, fontSize: "14px", color: "#22c55e" }}>
                  Nachricht erfolgreich gesendet.
                </p>
                <button style={s.confirmBtn} onClick={() => setShowCompose(false)}>
                  Schließen
                </button>
              </>
            ) : (
              <>
                <textarea
                  style={s.textarea}
                  placeholder="Ihre Nachricht..."
                  value={msgBody}
                  onChange={e => setMsgBody(e.target.value)}
                  rows={4}
                  autoFocus
                />
                <button
                  style={{ ...s.confirmBtn, ...(msgSending ? s.bigBtnDisabled : {}) }}
                  onClick={sendMessage}
                  disabled={msgSending || !msgBody.trim()}
                >
                  {msgSending ? <span style={s.spinner} /> : "SENDEN"}
                </button>
                <button style={s.cancelBtn} onClick={() => setShowCompose(false)}>
                  Abbrechen
                </button>
              </>
            )}
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
  // ── Swipe slide container ──────────────────────────────────────────────────
  slideViewport: {
    width: "100vw",
    height: "100dvh",
    overflow: "hidden",
    position: "relative",
  },
  slideTrack: {
    display: "flex",
    width: "200%",
    height: "100%",
    transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    willChange: "transform",
  },
  slidePanel: {
    width: "50%",
    height: "100%",
    flexShrink: 0,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
  },

  // ── Page structure ─────────────────────────────────────────────────────────
  root: {
    minHeight: "100%",
    background: BLACK,
    fontFamily: "'DM Mono', 'Courier New', monospace",
    display: "flex",
    flexDirection: "column",
    position: "relative",
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
    gap: "8px",
    padding: "12px 14px",
    paddingTop: "max(12px, env(safe-area-inset-top, 12px))",
    borderBottom: `1px solid ${BORDER}`,
    background: SURFACE,
    flexWrap: "wrap",
    flexShrink: 0,
  },
  logo: { height: "34px", width: "auto", objectFit: "contain", flexShrink: 0 },
  headerRight: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" },
  userName: { fontSize: "11px", color: MUTED, marginRight: "2px" },
  logoutBtn: {
    background: "none",
    border: `1px solid ${BORDER}`,
    borderRadius: "4px",
    padding: "9px 11px",
    fontSize: "11px",
    color: MUTED,
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
    minHeight: "38px",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
  },
  main: {
    position: "relative",
    zIndex: 1,
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "28px 16px",
    paddingBottom: "max(32px, env(safe-area-inset-bottom, 32px))",
    gap: "22px",
    maxWidth: "480px",
    margin: "0 auto",
    width: "100%",
    boxSizing: "border-box",
  },

  // ── Status pill ────────────────────────────────────────────────────────────
  pill: {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "7px 18px", borderRadius: "999px", border: `1px solid ${BORDER}`,
    fontSize: "12px", letterSpacing: "0.1em", fontWeight: "600",
  },
  pillActive:   { color: GREEN, borderColor: "rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.07)" },
  pillInactive: { color: MUTED, borderColor: BORDER,                background: "transparent"          },
  pillDot: { width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0 },

  // ── Button area: big button stays centered, lunch is absolute-left ─────────
  btnArea: {
    position: "relative",
    // clamp keeps it proportional on small phones (min 175px, max 210px)
    width: "clamp(175px, 54vw, 210px)",
    height: "clamp(175px, 54vw, 210px)",
    flexShrink: 0,
  },
  lunchBtn: {
    position: "absolute",
    // right edge of lunch btn sits 14px to the left of btnArea's left edge
    right: "calc(100% + 14px)",
    top: "50%",
    transform: "translateY(-50%)",
    width: "clamp(64px, 19vw, 82px)",
    height: "clamp(64px, 19vw, 82px)",
    borderRadius: "12px",
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "3px",
    cursor: "pointer",
    color: MUTED,
    fontFamily: "inherit",
    fontSize: "8px",
    letterSpacing: "0.1em",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
  },
  bigBtn: {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    transition: "transform 0.12s, box-shadow 0.12s",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
  },
  bigBtnIn: {
    background: "linear-gradient(145deg, #1a5c1a, #0f3d0f)",
    boxShadow: "0 0 0 10px rgba(34,197,94,0.06), 0 0 50px rgba(34,197,94,0.15)",
  },
  bigBtnOut: {
    background: "linear-gradient(145deg, #7a1f06, #4a1204)",
    boxShadow: "0 0 0 10px rgba(245,98,15,0.06), 0 0 50px rgba(245,98,15,0.15)",
  },
  bigBtnDisabled: { opacity: 0.5, cursor: "not-allowed" },
  bigBtnIcon:     { fontSize: "28px", color: "#fff", lineHeight: 1 },
  bigBtnLabel:    { fontSize: "12px", fontWeight: "700", letterSpacing: "0.15em", color: "#fff" },
  spinner: {
    width: "26px", height: "26px",
    border: "3px solid rgba(255,255,255,0.2)",
    borderTopColor: "#fff", borderRadius: "50%",
    display: "inline-block", animation: "spin 0.7s linear infinite",
  },

  // ── Stats row ──────────────────────────────────────────────────────────────
  statsRow: {
    display: "flex", alignItems: "stretch",
    background: SURFACE, border: `1px solid ${BORDER}`,
    borderRadius: "6px", overflow: "hidden", width: "100%",
  },
  stat: {
    flex: 1, display: "flex", flexDirection: "column",
    alignItems: "center", padding: "16px 12px", gap: "6px",
  },
  statDivider: { width: "1px", background: BORDER, flexShrink: 0 },
  statLabel:   { fontSize: "10px", color: MUTED, letterSpacing: "0.12em", textTransform: "uppercase" },
  statValue:   { fontSize: "22px", fontWeight: "700", color: TEXT, letterSpacing: "-0.02em", fontFamily: "'DM Sans', sans-serif" },

  // ── Today's log ────────────────────────────────────────────────────────────
  log: {
    width: "100%", background: SURFACE,
    border: `1px solid ${BORDER}`, borderRadius: "6px",
    padding: "14px", display: "flex", flexDirection: "column", gap: "10px",
  },
  logTitle: { margin: 0, fontSize: "10px", color: MUTED, letterSpacing: "0.15em" },
  logRow: {
    display: "flex", flexWrap: "wrap", alignItems: "center",
    gap: "8px", paddingBottom: "10px", borderBottom: `1px solid ${BORDER}`,
  },
  logTime:  { fontSize: "13px", color: TEXT, flex: 1 },
  logDur:   { fontSize: "12px", color: ORANGE },
  logLunch: { width: "100%", fontSize: "11px", color: MUTED },
  logNote:  { width: "100%", fontSize: "11px", color: MUTED, fontStyle: "italic" },

  // ── Time inputs (lunch modal) ──────────────────────────────────────────────
  timeLabel: {
    fontSize: "10px", color: MUTED,
    letterSpacing: "0.1em", textTransform: "uppercase",
  },
  timeInput: {
    background: BLACK,
    border: `1px solid ${BORDER}`,
    borderRadius: "3px",
    padding: "13px 12px",
    fontSize: "18px",
    color: TEXT,
    fontFamily: "inherit",
    outline: "none",
    colorScheme: "dark",
    width: "100%",
    boxSizing: "border-box",
  },

  // ── Bottom-sheet modals ────────────────────────────────────────────────────
  overlay: {
    position: "fixed", inset: 0, zIndex: 50,
    background: "rgba(0,0,0,0.75)",
    display: "flex", alignItems: "flex-end",
  },
  sheet: {
    width: "100%",
    background: "#1a1a1a",
    borderTop: `3px solid ${ORANGE}`,
    borderRadius: "16px 16px 0 0",
    padding: "20px 20px",
    paddingBottom: "max(28px, env(safe-area-inset-bottom, 28px))",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    maxHeight: "90dvh",
    overflowY: "auto",
  },
  sheetHandle: {
    width: "36px", height: "4px", borderRadius: "2px",
    background: BORDER, margin: "0 auto",
    flexShrink: 0,
  },
  sheetTitle: { margin: 0, fontSize: "18px", fontWeight: "700", color: TEXT, fontFamily: "'DM Sans', sans-serif" },
  sheetSub:   { margin: 0, fontSize: "12px", color: MUTED },
  textarea: {
    background: BLACK,
    border: `1px solid ${BORDER}`,
    borderRadius: "4px",
    padding: "14px",
    fontSize: "16px",
    color: TEXT,
    resize: "none",
    fontFamily: "inherit",
    outline: "none",
  },
  confirmBtn: {
    background: ORANGE,
    border: "none",
    borderRadius: "6px",
    padding: "0 16px",
    minHeight: "52px",
    fontSize: "13px",
    fontWeight: "700",
    letterSpacing: "0.12em",
    color: "#fff",
    cursor: "pointer",
    fontFamily: "inherit",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
  },
  skipBtn: {
    background: "none", border: "none", fontSize: "13px",
    color: MUTED, cursor: "pointer", fontFamily: "inherit",
    textDecoration: "underline", textAlign: "center",
    minHeight: "44px", touchAction: "manipulation",
  },
  cancelBtn: {
    background: "none",
    border: `1px solid ${BORDER}`,
    borderRadius: "6px",
    padding: "0 16px",
    minHeight: "48px",
    fontSize: "13px",
    color: MUTED,
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "0.08em",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
  },
};
