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
  const [adminMsgs, setAdminMsgs]     = useState([]);
  const [confirmDeleteMsg, setConfirmDeleteMsg] = useState(null); // message id to delete

  // Note modal
  const [note, setNote]           = useState("");

  // Live clock while clocked in

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
  const [winFrom,   setWinFrom]   = useState("08:00");
  const [winTill,   setWinTill]   = useState("16:00");
  const [winError,  setWinError]  = useState("");
  const [winSaving, setWinSaving] = useState(false);
  const [editId,    setEditId]    = useState(null);
  const touchStartX               = useRef(null);

  useEffect(() => {
    fetchStatus();
    fetchEntries();
    if (!user.is_admin) fetchInbox();
  }, []);


  async function fetchStatus() {
    try {
      const res = await fetch(`${API}/users/status`, { headers: authHeaders() });
      if (res.status === 401) { onLogout(); return; }
      if (res.ok) setStatus(await res.json());
    } catch {}
  }

  async function fetchEntries() {
    try {
      const res = await fetch(`${API}/users/entries`, { headers: authHeaders() });
      if (res.ok) setEntries(await res.json());
    } catch {}
    setLoading(false);
  }

  async function fetchInbox() {
    try {
      const res = await fetch(`${API}/messages/mine`, { headers: authHeaders() });
      if (res.ok) setAdminMsgs(await res.json());
    } catch {}
  }

  async function markMsgRead(id) {
    try {
      await fetch(`${API}/messages/mine/${id}/read`, {
        method: "PATCH",
        headers: authHeaders(),
      });
      setAdminMsgs(prev => prev.map(m => m.id === id ? { ...m, is_read: true } : m));
    } catch {}
  }

  async function deleteMineMsg(id) {
    try {
      await fetch(`${API}/messages/mine/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      setAdminMsgs(prev => prev.filter(m => m.id !== id));
    } catch {}
    setConfirmDeleteMsg(null);
  }

  function startEdit(e) {
    const hhmm = iso => {
      const d = new Date(iso);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    };
    setEditId(e.id);
    setWinFrom(hhmm(e.punch_in));
    setWinTill(e.punch_out ? hhmm(e.punch_out) : "16:00");
    setNote(e.note ?? "");
    setWinError("");
  }

  async function saveWindow() {
    setWinSaving(true); setWinError("");
    try {
      const url    = editId ? `${API}/users/entries/${editId}` : `${API}/users/entries`;
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method, headers: authHeaders(),
        body: JSON.stringify({ punch_in: winFrom, punch_out: winTill, note }),
      });
      if (res.status === 401) { onLogout(); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setWinError(d.detail || "Konnte nicht gespeichert werden");
        return;
      }
      setEditId(null);
      setWinFrom("08:00"); setWinTill("16:00"); setNote("");
      fetchEntries();
    } catch {
      setWinError("Keine Verbindung zum Server");
    } finally {
      setWinSaving(false);
    }
  }

  async function deleteWindow(id) {
    if (!confirm("Diesen Zeitraum wirklich löschen?")) return;
    setWinError("");
    try {
      const res = await fetch(`${API}/users/entries/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setWinError(d.detail || "Konnte nicht gelöscht werden");
        return;
      }
      if (editId === id) setEditId(null);
      fetchEntries();
    } catch {
      setWinError("Keine Verbindung zum Server");
    }
  }

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    // Opening the Dienstplan by swipe is disabled: it was too easy to
    // trigger while scrolling. The header button still opens it, and
    // swiping back out (below) still works.
    if (diff > 60  && page === "dienstplan") setPage("dashboard");
  }

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
                <button className="btn-ghost-hover" style={s.logoutBtn} onClick={onLogout}>Abmelden</button>
              </div>
            </header>

            {/* Main content */}
            <main style={s.main}>

              {/* Compose button (employees only) */}
              {!user.is_admin && (
                <div style={{ width: "100%", display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn-ghost-hover" style={s.composeFloatBtn} onClick={openCompose} title="Nachricht an Admin">
                    ✉ Nachricht
                  </button>
                </div>
              )}


              {/* Today's time windows — entered by the employee */}
              <div style={s.windowCard}>
                <p style={s.windowTitle}>Arbeitszeit heute eintragen</p>
                <div style={s.windowForm}>
                  <div style={s.windowField}>
                    <label style={s.windowLabel}>Von</label>
                    <input type="time" style={s.windowInput}
                      value={winFrom} onChange={e => setWinFrom(e.target.value)} />
                  </div>
                  <div style={s.windowField}>
                    <label style={s.windowLabel}>Bis</label>
                    <input type="time" style={s.windowInput}
                      value={winTill} onChange={e => setWinTill(e.target.value)} />
                  </div>
                  <button
                    className="btn-orange-hover"
                    style={{ ...s.windowSaveBtn, ...(winSaving ? s.bigBtnDisabled : {}) }}
                    onClick={saveWindow} disabled={winSaving}
                  >
                    {winSaving ? "..." : editId ? "Ändern" : "+ Eintragen"}
                  </button>
                  {editId && (
                    <button className="btn-ghost-hover" style={s.windowCancelBtn}
                      onClick={() => { setEditId(null); setWinFrom("08:00"); setWinTill("16:00"); setNote(""); setWinError(""); }}>
                      Abbrechen
                    </button>
                  )}
                </div>
                <input
                  type="text" style={s.windowNote}
                  value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Notiz (optional)"
                />
                {winError && <p style={s.punchErr}>{winError}</p>}

                {entries.length === 0 ? (
                  <p style={s.windowEmpty}>Noch keine Zeiten für heute eingetragen.</p>
                ) : (
                  <div style={s.windowList}>
                    {entries.map(e => (
                      <div key={e.id} style={s.windowRow}>
                        <span style={s.windowRowTime}>
                          {formatTime(e.punch_in)} – {e.punch_out ? formatTime(e.punch_out) : "offen"}
                        </span>
                        <span style={s.windowRowDur}>
                          {e.duration_minutes != null ? formatDuration(e.duration_minutes) : ""}
                        </span>
                        <button className="btn-ghost-hover" style={s.windowRowBtn}
                          onClick={() => startEdit(e)}>✎</button>
                        <button className="btn-danger-hover" style={s.windowRowBtn}
                          onClick={() => deleteWindow(e.id)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  className="btn-ghost-hover" style={s.windowLunchBtn}
                  onClick={() => { setLunchError(""); setShowLunch(true); }}
                  disabled={loading || entries.length === 0}
                >
                  ☕ Mittagspause eintragen
                </button>
              </div>

              {/* Stats row */}
              <div style={s.statsRow}>
                <div style={s.stat}>
                  <span style={s.statLabel}>Zeiträume heute</span>
                  <span style={s.statValue}>{entries.length || "--"}</span>
                </div>
                <div style={s.statDivider} />
                <div style={s.stat}>
                  <span style={s.statLabel}>Heute gearbeitet</span>
                  <span style={s.statValue}>
                    {todayMins > 0 ? formatDuration(todayMins) : "--"}
                  </span>
                </div>
              </div>

              {/* Admin messages inbox (employees only) */}
              {!user.is_admin && adminMsgs.length > 0 && (
                <div style={s.inboxBox}>
                  <p style={s.logTitle}>NACHRICHTEN VOM ADMIN</p>
                  {adminMsgs.map(m => (
                    <div
                      key={m.id}
                      style={{ ...s.inboxMsg, ...(m.is_read ? {} : s.inboxMsgUnread) }}
                      onClick={() => !m.is_read && markMsgRead(m.id)}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={s.inboxDate}>
                          {new Date(m.sent_at).toLocaleString("de-AT", {
                            day: "2-digit", month: "2-digit", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                          {!m.is_read && <span style={s.unreadDot} />}
                        </span>
                        <button
                          className="btn-danger-hover"
                          style={s.inboxDeleteBtn}
                          onClick={e => { e.stopPropagation(); setConfirmDeleteMsg(m.id); }}
                        >
                          ✕
                        </button>
                      </div>
                      <span style={s.inboxBody}>{m.body}</span>
                    </div>
                  ))}
                </div>
              )}

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
            {lunchError && <p style={{ margin: 0, fontSize: "12px", color: "#E05030" }}>{lunchError}</p>}
            <button
              className="btn-orange-hover" style={{ ...s.confirmBtn, ...(lunchSaving ? s.bigBtnDisabled : {}) }}
              onClick={doSetLunch}
              disabled={lunchSaving}
            >
              {lunchSaving ? <span style={s.spinner} /> : "SPEICHERN"}
            </button>
            <button className="btn-ghost-hover" style={s.cancelBtn} onClick={() => setShowLunch(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Note modal outside transformed slideTrack so position:fixed works correctly */}

      {/* Confirm delete message modal */}
      {confirmDeleteMsg !== null && (
        <div style={s.overlay} onClick={() => setConfirmDeleteMsg(null)}>
          <div style={s.sheet} onClick={e => e.stopPropagation()}>
            <div style={s.sheetHandle} />
            <p style={s.sheetTitle}>Löschen bestätigen</p>
            <p style={s.sheetSub}>Diese Nachricht wird unwiderruflich gelöscht.</p>
            <button
              className="btn-danger-hover"
              style={{ ...s.confirmBtn, background: "#c0392b" }}
              onClick={() => deleteMineMsg(confirmDeleteMsg)}
            >
              Löschen
            </button>
            <button className="btn-ghost-hover" style={s.cancelBtn} onClick={() => setConfirmDeleteMsg(null)}>
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
                <button className="btn-orange-hover" style={s.confirmBtn} onClick={() => setShowCompose(false)}>
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
                  className="btn-orange-hover" style={{ ...s.confirmBtn, ...(msgSending ? s.bigBtnDisabled : {}) }}
                  onClick={sendMessage}
                  disabled={msgSending || !msgBody.trim()}
                >
                  {msgSending ? <span style={s.spinner} /> : "SENDEN"}
                </button>
                <button className="btn-ghost-hover" style={s.cancelBtn} onClick={() => setShowCompose(false)}>
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
const ORANGE  = "#2D7A4F";
const TEXT    = "#EDEDED";
const MUTED   = "#9A9A9A";
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

  // ── Compose float button ───────────────────────────────────────────────────
  composeFloatBtn: {
    background: "none",
    border: `1px solid ${BORDER}`,
    borderRadius: "4px",
    padding: "6px 12px",
    fontSize: "11px",
    color: MUTED,
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "0.06em",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
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
    boxShadow: "0 0 0 10px rgba(180,40,40,0.08), 0 0 50px rgba(180,40,40,0.18)",
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

  punchErr: {
    margin: 0, fontSize: "12px", color: "#E05030",
    textAlign: "center", maxWidth: "280px",
    padding: "8px 14px", borderRadius: "4px",
    background: "rgba(224,80,48,0.08)", border: "1px solid rgba(224,80,48,0.2)",
  },

  // ── Time windows (entered by the employee) ─────────────────────────────────
  windowCard: {
    background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "6px",
    padding: "18px 16px", display: "flex", flexDirection: "column", gap: "12px",
  },
  windowTitle: {
    margin: 0, fontSize: "11px", color: MUTED, letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  // Stacked and centred: a native time input has an intrinsic minimum width
  // (HH:MM plus the clock icon), so side by side they overflowed on a phone.
  // The form spans the card and centres its own children, so nothing relies on
  // auto margins in a flex column — that is what kept coming out off-centre.
  windowForm: {
    display: "flex", flexDirection: "column", gap: "8px", alignItems: "center",
  },
  // Row spans the card; the three columns are "1fr auto 1fr", so the input sits
  // dead-centre in the frame regardless of how wide the label is, while the
  // label stays pinned left — flush with the section title above it.
  windowField: {
    display: "grid", gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center", width: "100%",
  },
  windowLabel: {
    fontSize: "12px", color: MUTED, letterSpacing: "0.06em",
    justifySelf: "start",
  },
  windowInput: {
    background: BLACK, border: `1px solid ${BORDER}`, borderRadius: "3px",
    padding: "11px 10px", fontSize: "16px", color: TEXT,
    fontFamily: "inherit", outline: "none", colorScheme: "dark",
    width: "150px", minWidth: 0, textAlign: "center",
  },
  windowNote: {
    background: BLACK, border: `1px solid ${BORDER}`, borderRadius: "3px",
    padding: "9px 11px", fontSize: "13px", color: TEXT,
    fontFamily: "inherit", outline: "none", width: "100%",
  },
  windowSaveBtn: {
    background: ORANGE, border: "none", borderRadius: "3px",
    padding: "12px 16px", fontSize: "12px", fontWeight: "700", color: "#fff",
    cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.08em",
    width: "150px", maxWidth: "100%", minHeight: "44px", marginTop: "4px",
  },
  windowCancelBtn: {
    background: "none", border: `1px solid ${BORDER}`, borderRadius: "3px",
    padding: "12px 14px", fontSize: "12px", color: MUTED, cursor: "pointer",
    fontFamily: "inherit", minHeight: "44px", width: "150px", maxWidth: "100%",
  },
  windowEmpty: { margin: 0, fontSize: "12px", color: MUTED, textAlign: "center", padding: "6px 0" },
  windowList: { display: "flex", flexDirection: "column", gap: "6px" },
  windowRow: {
    display: "flex", alignItems: "center", gap: "10px",
    background: BLACK, border: `1px solid ${BORDER}`, borderRadius: "3px",
    padding: "10px 12px",
  },
  windowRowTime: { fontSize: "15px", color: TEXT, fontWeight: "600" },
  windowRowDur:  { fontSize: "12px", color: MUTED, marginLeft: "auto" },
  windowRowBtn: {
    background: "none", border: `1px solid ${BORDER}`, borderRadius: "3px",
    padding: "6px 9px", fontSize: "12px", color: MUTED, cursor: "pointer",
    fontFamily: "inherit", minWidth: "34px",
  },
  windowLunchBtn: {
    background: "none", border: `1px solid ${BORDER}`, borderRadius: "3px",
    padding: "11px", fontSize: "12px", color: MUTED, cursor: "pointer",
    fontFamily: "inherit", letterSpacing: "0.06em",
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

  // ── Admin inbox (employee view) ────────────────────────────────────────────
  inboxBox: {
    width: "100%", background: SURFACE,
    border: `1px solid ${BORDER}`, borderRadius: "6px",
    padding: "14px", display: "flex", flexDirection: "column", gap: "10px",
  },
  inboxMsg: {
    display: "flex", flexDirection: "column", gap: "4px",
    padding: "10px 12px", borderRadius: "4px",
    background: BLACK, border: `1px solid ${BORDER}`,
    cursor: "default",
  },
  inboxMsgUnread: {
    borderColor: "rgba(45,122,79,0.5)",
    background: "rgba(45,122,79,0.06)",
    cursor: "pointer",
  },
  inboxDeleteBtn: {
    background: "none",
    border: `1px solid rgba(255,80,80,0.2)`,
    borderRadius: "3px",
    padding: "2px 7px",
    fontSize: "10px",
    color: "#ff5050",
    cursor: "pointer",
    fontFamily: "inherit",
    flexShrink: 0,
  },
  inboxDate: {
    fontSize: "10px", color: MUTED, letterSpacing: "0.08em",
    display: "flex", alignItems: "center", gap: "6px",
  },
  inboxBody: { fontSize: "13px", color: TEXT, lineHeight: "1.5" },
  unreadDot: {
    display: "inline-block", width: "7px", height: "7px",
    borderRadius: "50%", background: ORANGE, flexShrink: 0,
  },

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
