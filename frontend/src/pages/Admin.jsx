import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL ?? "";

function authHeaders() {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function formatTime(iso) {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDuration(mins) {
  if (!mins && mins !== 0) return "--";
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function exportCSV(entries, users) {
  const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));
  const rows = [
    ["Name", "Einstempeln", "Ausstempeln", "Dauer", "Notiz"],
    ...entries.map(e => [
      userMap[e.user_id] ?? e.user_id,
      e.punch_in ? new Date(e.punch_in).toLocaleString("de-AT") : "",
      e.punch_out ? new Date(e.punch_out).toLocaleString("de-AT") : "läuft",
      e.duration_minutes != null ? formatDuration(e.duration_minutes) : "",
      e.note ?? "",
    ])
  ];
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `timepunch_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Add User Modal ────────────────────────────────────────────────────────────

function AddUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", username: "", password: "", is_admin: false });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    console.log("token:", localStorage.getItem("token"));
    console.log("API:", API);
    console.log("url:", `${API}/admin/users`);
    if (!form.name || !form.username || !form.password) {
      setError("Alle Felder sind erforderlich"); return;
    }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/admin/users`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail); }
      onCreated();
      onClose();
    } catch(e) { setError(e.message); }
    setLoading(false);
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <p style={s.modalTitle}>Neuer Mitarbeiter</p>
        {error && <p style={s.errorBox}>{error}</p>}
        {[
          { key: "name",     label: "Name",         type: "text",     placeholder: "Max Mustermann" },
          { key: "username", label: "Benutzername",  type: "text",     placeholder: "mustermann" },
          { key: "password", label: "Passwort",      type: "password", placeholder: "••••••••" },
        ].map(f => (
          <div key={f.key} style={s.field}>
            <label style={s.label}>{f.label}</label>
            <input
              style={s.input} type={f.type} placeholder={f.placeholder}
              value={form[f.key]}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
            />
          </div>
        ))}
        <div style={s.checkRow}>
          <input
            id="is_admin" type="checkbox" checked={form.is_admin}
            onChange={e => setForm(p => ({ ...p, is_admin: e.target.checked }))}
          />
          <label htmlFor="is_admin" style={{ ...s.label, margin: 0 }}>Administrator</label>
        </div>
        <div style={s.modalBtns}>
          <button style={s.cancelBtn} onClick={onClose}>Abbrechen</button>
          <button style={s.confirmBtn} onClick={handleSubmit} disabled={loading}>
            {loading ? "..." : "Erstellen"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Admin Component ──────────────────────────────────────────────────────

export default function Admin({ user, onLogout }) {
  const [users,         setUsers]         = useState([]);
  const [entries,       setEntries]       = useState([]);
  const [activeEntries, setActiveEntries] = useState([]);
  const [expandedUser,  setExpandedUser]  = useState(null);
  const [showAddUser,   setShowAddUser]   = useState(false);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const [uRes, eRes, aRes] = await Promise.all([
        fetch(`${API}/admin/users`,          { headers: authHeaders() }),
        fetch(`${API}/admin/entries/today`,  { headers: authHeaders() }),
        fetch(`${API}/admin/entries/active`, { headers: authHeaders() }),
      ]);
      if (uRes.status === 401) { onLogout(); return; }
      setUsers(await uRes.json());
      setEntries(await eRes.json());
      setActiveEntries(await aRes.json());
    } catch {}
    setLoading(false);
  }

  async function handleAdminPunch(userId) {
    await fetch(`${API}/admin/users/${userId}/punch`, {
      method: "POST", headers: authHeaders(),
    });
    fetchAll();
  }

  async function handleDeleteEntry(entryId) {
    if (!confirm("Eintrag wirklich löschen?")) return;
    await fetch(`${API}/admin/entries/${entryId}`, {
      method: "DELETE", headers: authHeaders(),
    });
    fetchAll();
  }

  // Group today's entries by user
  const entriesByUser = entries.reduce((acc, e) => {
    if (!acc[e.user_id]) acc[e.user_id] = [];
    acc[e.user_id].push(e);
    return acc;
  }, {});

  const activeUserIds = new Set(activeEntries.map(e => e.user_id));

  return (
    <div style={s.root}>
      <div style={s.bg} aria-hidden="true" />

      {/* Header */}
      <header style={s.header}>
        <div style={s.brand}>
          <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
            <rect x="3"  y="3"  width="10" height="10" fill="#F5620F" />
            <rect x="15" y="3"  width="10" height="10" fill="#F5620F" opacity=".4" />
            <rect x="3"  y="15" width="10" height="10" fill="#F5620F" opacity=".4" />
            <rect x="15" y="15" width="10" height="10" fill="#F5620F" />
          </svg>
          <span style={s.brandText}>TIMEPUNCH</span>
          <span style={s.adminBadge}>ADMIN</span>
        </div>
        <div style={s.headerRight}>
          <span style={s.userName}>{user.name}</span>
          <button style={s.logoutBtn} onClick={onLogout}>Abmelden</button>
        </div>
      </header>

      <main style={s.main}>

        {/* ── Active users ── */}
        <section style={s.section}>
          <div style={s.sectionHeader}>
            <p style={s.sectionTitle}>AKTIV JETZT</p>
            <span style={s.badge}>{activeEntries.length}</span>
          </div>
          {activeEntries.length === 0 ? (
            <p style={s.empty}>Niemand eingestempelt</p>
          ) : (
            <div style={s.activeList}>
              {activeEntries.map(ae => (
                <div key={ae.entry_id} style={s.activeRow}>
                  <div style={s.activeLeft}>
                    <span style={s.activeDot} />
                    <span style={s.activeName}>{ae.user_name}</span>
                    <span style={s.activeSince}>seit {formatTime(ae.punch_in)}</span>
                  </div>
                  <button
                    style={s.punchOutBtn}
                    onClick={() => handleAdminPunch(ae.user_id)}
                  >
                    Ausstempeln
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Toolbar ── */}
        <div style={s.toolbar}>
          <p style={s.sectionTitle}>HEUTE — {formatDate(new Date().toISOString())}</p>
          <div style={s.toolbarBtns}>
            <button style={s.ghostBtn} disabled title="Demnächst verfügbar">
              📅 Vergangene Tage
            </button>
            <button style={s.ghostBtn} onClick={() => exportCSV(entries, users)}>
              ↓ CSV Export
            </button>
            <button style={s.orangeBtn} onClick={() => setShowAddUser(true)}>
              + Mitarbeiter
            </button>
          </div>
        </div>

        {/* ── Users & entries table ── */}
        <section style={s.section}>
          {loading ? (
            <p style={s.empty}>Laden...</p>
          ) : users.filter(u => !u.is_admin).length === 0 ? (
            <p style={s.empty}>Keine Mitarbeiter vorhanden</p>
          ) : (
            users.filter(u => !u.is_admin).map(u => {
              const uEntries = entriesByUser[u.id] ?? [];
              const isExpanded = expandedUser === u.id;
              const isActive = activeUserIds.has(u.id);
              const totalMins = uEntries.reduce((s, e) => s + (e.duration_minutes ?? 0), 0);

              return (
                <div key={u.id} style={s.userBlock}>
                  {/* User row header */}
                  <div
                    style={{ ...s.userRow, ...(isActive ? s.userRowActive : {}) }}
                    onClick={() => setExpandedUser(isExpanded ? null : u.id)}
                  >
                    <div style={s.userLeft}>
                      {isActive && <span style={s.activeDot} />}
                      <span style={s.userNameCell}>{u.name}</span>
                      <span style={s.userUsername}>@{u.username}</span>
                    </div>
                    <div style={s.userRight}>
                      {uEntries.length > 0 && (
                        <span style={s.totalDur}>{formatDuration(totalMins)}</span>
                      )}
                      <span style={s.entryCount}>{uEntries.length} Einträge</span>
                      <span style={s.chevron}>{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {/* Expanded entries */}
                  {isExpanded && (
                    <div style={s.entriesBlock}>
                      {uEntries.length === 0 ? (
                        <p style={s.emptySmall}>Keine Einträge heute</p>
                      ) : (
                        uEntries.map(e => (
                          <div key={e.id} style={s.entryRow}>
                            <div style={s.entryTimes}>
                              <span style={s.entryTime}>
                                {formatTime(e.punch_in)} → {e.punch_out ? formatTime(e.punch_out) : <span style={{ color: "#22c55e" }}>läuft</span>}
                              </span>
                              {e.duration_minutes != null && (
                                <span style={s.entryDur}>{formatDuration(e.duration_minutes)}</span>
                              )}
                            </div>
                            {e.note && <p style={s.entryNote}>"{e.note}"</p>}
                            <button
                              style={s.deleteBtn}
                              onClick={() => handleDeleteEntry(e.id)}
                            >
                              Löschen
                            </button>
                          </div>
                        ))
                      )}
                      {/* Manual punch button */}
                      <button
                        style={s.manualPunchBtn}
                        onClick={() => handleAdminPunch(u.id)}
                      >
                        {isActive ? "⏹ Manuell ausstempeln" : "▶ Manuell einstempeln"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </section>
      </main>

      {showAddUser && (
        <AddUserModal
          onClose={() => setShowAddUser(false)}
          onCreated={fetchAll}
        />
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
    minHeight: "100dvh", background: BLACK,
    fontFamily: "'DM Mono', 'Courier New', monospace",
    display: "flex", flexDirection: "column", position: "relative",
  },
  bg: {
    position: "fixed", inset: 0,
    backgroundImage: `linear-gradient(${BORDER} 1px, transparent 1px), linear-gradient(90deg, ${BORDER} 1px, transparent 1px)`,
    backgroundSize: "40px 40px", opacity: 0.3, pointerEvents: "none",
  },
  header: {
    position: "relative", zIndex: 1,
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "16px 20px", borderBottom: `1px solid ${BORDER}`, background: SURFACE,
  },
  brand:      { display: "flex", alignItems: "center", gap: "8px" },
  brandText:  { fontSize: "12px", fontWeight: "700", letterSpacing: "0.18em", color: TEXT },
  adminBadge: {
    fontSize: "9px", fontWeight: "700", letterSpacing: "0.15em",
    background: ORANGE, color: "#fff", padding: "2px 6px", borderRadius: "2px",
  },
  headerRight: { display: "flex", alignItems: "center", gap: "12px" },
  userName:    { fontSize: "12px", color: MUTED },
  logoutBtn: {
    background: "none", border: `1px solid ${BORDER}`, borderRadius: "3px",
    padding: "5px 10px", fontSize: "11px", color: MUTED, cursor: "pointer", fontFamily: "inherit",
  },
  main: {
    position: "relative", zIndex: 1, flex: 1,
    padding: "24px 16px", display: "flex", flexDirection: "column", gap: "20px",
    maxWidth: "720px", margin: "0 auto", width: "100%",
  },
  section: {
    background: SURFACE, border: `1px solid ${BORDER}`,
    borderRadius: "6px", overflow: "hidden",
  },
  sectionHeader: {
    display: "flex", alignItems: "center", gap: "10px",
    padding: "14px 16px", borderBottom: `1px solid ${BORDER}`,
  },
  sectionTitle: { margin: 0, fontSize: "10px", color: MUTED, letterSpacing: "0.15em" },
  badge: {
    background: ORANGE, color: "#fff", fontSize: "10px",
    fontWeight: "700", padding: "1px 7px", borderRadius: "999px",
  },
  empty:      { margin: 0, padding: "20px 16px", fontSize: "12px", color: MUTED, textAlign: "center" },
  emptySmall: { margin: 0, padding: "12px 16px", fontSize: "11px", color: MUTED },

  // Active users
  activeList: { display: "flex", flexDirection: "column" },
  activeRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 16px", borderBottom: `1px solid ${BORDER}`,
  },
  activeLeft:  { display: "flex", alignItems: "center", gap: "10px" },
  activeDot:   { width: "8px", height: "8px", borderRadius: "50%", background: GREEN, flexShrink: 0 },
  activeName:  { fontSize: "14px", color: TEXT, fontWeight: "600" },
  activeSince: { fontSize: "11px", color: MUTED },
  punchOutBtn: {
    background: "rgba(245,98,15,0.15)", border: `1px solid rgba(245,98,15,0.3)`,
    borderRadius: "3px", padding: "6px 12px", fontSize: "11px",
    color: ORANGE, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.06em",
  },

  // Toolbar
  toolbar: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    flexWrap: "wrap", gap: "10px",
  },
  toolbarBtns: { display: "flex", gap: "8px", flexWrap: "wrap" },
  ghostBtn: {
    background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "3px",
    padding: "8px 14px", fontSize: "11px", color: MUTED, cursor: "pointer",
    fontFamily: "inherit", letterSpacing: "0.06em",
  },
  orangeBtn: {
    background: ORANGE, border: "none", borderRadius: "3px",
    padding: "8px 14px", fontSize: "11px", fontWeight: "700",
    color: "#fff", cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.08em",
  },

  // Users table
  userBlock: { borderBottom: `1px solid ${BORDER}` },
  userRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 16px", cursor: "pointer",
    transition: "background 0.1s",
  },
  userRowActive: { background: "rgba(34,197,94,0.04)" },
  userLeft:      { display: "flex", alignItems: "center", gap: "10px" },
  userNameCell:  { fontSize: "14px", color: TEXT, fontWeight: "600" },
  userUsername:  { fontSize: "11px", color: MUTED },
  userRight:     { display: "flex", alignItems: "center", gap: "12px" },
  totalDur:      { fontSize: "13px", color: ORANGE, fontWeight: "700" },
  entryCount:    { fontSize: "11px", color: MUTED },
  chevron:       { fontSize: "10px", color: MUTED },

  // Entry rows
  entriesBlock: {
    background: BLACK, borderTop: `1px solid ${BORDER}`,
    padding: "8px 16px 12px", display: "flex", flexDirection: "column", gap: "8px",
  },
  entryRow: {
    padding: "10px 12px", background: SURFACE,
    border: `1px solid ${BORDER}`, borderRadius: "4px",
    display: "flex", flexDirection: "column", gap: "4px",
  },
  entryTimes: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  entryTime:  { fontSize: "13px", color: TEXT },
  entryDur:   { fontSize: "12px", color: ORANGE },
  entryNote:  { margin: 0, fontSize: "11px", color: MUTED, fontStyle: "italic" },
  deleteBtn: {
    alignSelf: "flex-end", background: "none",
    border: `1px solid rgba(255,80,80,0.2)`, borderRadius: "3px",
    padding: "4px 10px", fontSize: "10px", color: "#ff5050",
    cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.06em",
  },
  manualPunchBtn: {
    margin: "4px 0 0", background: "none",
    border: `1px solid ${BORDER}`, borderRadius: "3px",
    padding: "8px 14px", fontSize: "11px", color: MUTED,
    cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.06em",
    alignSelf: "flex-start",
  },

  // Add user modal
  overlay: {
    position: "fixed", inset: 0, zIndex: 50,
    background: "rgba(0,0,0,0.75)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "24px",
  },
  modal: {
    background: "#1a1a1a", border: `1px solid ${BORDER}`,
    borderTop: `3px solid ${ORANGE}`, borderRadius: "6px",
    padding: "28px 24px", width: "100%", maxWidth: "380px",
    display: "flex", flexDirection: "column", gap: "14px",
  },
  modalTitle: { margin: 0, fontSize: "18px", fontWeight: "700", color: TEXT, fontFamily: "'DM Sans', sans-serif" },
  field:      { display: "flex", flexDirection: "column", gap: "6px" },
  label:      { fontSize: "10px", color: MUTED, letterSpacing: "0.12em", textTransform: "uppercase" },
  input: {
    background: BLACK, border: `1px solid ${BORDER}`, borderRadius: "3px",
    padding: "11px 12px", fontSize: "14px", color: TEXT,
    fontFamily: "inherit", outline: "none",
  },
  checkRow:   { display: "flex", alignItems: "center", gap: "10px" },
  modalBtns:  { display: "flex", gap: "10px", marginTop: "4px" },
  cancelBtn: {
    flex: 1, background: "none", border: `1px solid ${BORDER}`,
    borderRadius: "3px", padding: "12px", fontSize: "12px",
    color: MUTED, cursor: "pointer", fontFamily: "inherit",
  },
  confirmBtn: {
    flex: 2, background: ORANGE, border: "none", borderRadius: "3px",
    padding: "12px", fontSize: "12px", fontWeight: "700",
    color: "#fff", cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.1em",
  },
  errorBox: {
    margin: 0, padding: "10px 12px",
    background: "rgba(245,98,15,0.1)", border: `1px solid rgba(245,98,15,0.3)`,
    borderRadius: "3px", fontSize: "12px", color: ORANGE,
  },
};