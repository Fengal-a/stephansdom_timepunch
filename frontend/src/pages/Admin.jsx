import { useState, useEffect, useRef } from "react";
import Dienstplan from "./Dienstplan";

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

// ── Monthly Export Modal ──────────────────────────────────────────────────────

function MonthlyExportModal({ users, onClose }) {
  const now = new Date();
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [year,   setYear]   = useState(now.getFullYear());
  const [month,  setMonth]  = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(false);

  const MONTHS = [
    "Jänner","Februar","März","April","Mai","Juni",
    "Juli","August","September","Oktober","November","Dezember"
  ];

  async function handleExport() {
    setLoading(true);
    const token = localStorage.getItem("token");
    const url = `${API}/admin/export/monthly?user_id=${userId}&year=${year}&month=${month}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : "export.csv";
      a.click();
      URL.revokeObjectURL(a.href);
      onClose();
    }
    setLoading(false);
  }

  // Build year options: current year and two prior
  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <p style={s.modalTitle}>Monatsexport</p>
        <p style={{ margin: 0, fontSize: "12px", color: MUTED }}>
          CSV-Export für einen Mitarbeiter über einen vollen Monat
        </p>
        <div style={s.field}>
          <label style={s.label}>Mitarbeiter</label>
          <select
            style={s.input}
            value={userId}
            onChange={e => setUserId(Number(e.target.value))}
          >
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <div style={{ ...s.field, flex: 2 }}>
            <label style={s.label}>Monat</label>
            <select
              style={s.input}
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
            >
              {MONTHS.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div style={{ ...s.field, flex: 1 }}>
            <label style={s.label}>Jahr</label>
            <select
              style={s.input}
              value={year}
              onChange={e => setYear(Number(e.target.value))}
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={s.modalBtns}>
          <button style={s.cancelBtn} onClick={onClose}>Abbrechen</button>
          <button style={s.confirmBtn} onClick={handleExport} disabled={loading || !userId}>
            {loading ? "..." : "↓ CSV herunterladen"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reset Password Modal ──────────────────────────────────────────────────────

function ResetPasswordModal({ user: targetUser, onClose }) {
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);

  async function handleSubmit() {
    if (password.length < 4) { setError("Mindestens 4 Zeichen erforderlich"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/admin/users/${targetUser.id}/password`, {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({ password }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail); }
      setDone(true);
    } catch(e) { setError(e.message); }
    setLoading(false);
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <p style={s.modalTitle}>Passwort zurücksetzen</p>
        <p style={{ margin: 0, fontSize: "12px", color: MUTED }}>
          Neues Passwort für <strong style={{ color: TEXT }}>{targetUser.name}</strong>
        </p>
        {done ? (
          <>
            <p style={{ margin: 0, fontSize: "13px", color: "#22c55e" }}>
              Passwort erfolgreich geändert.
            </p>
            <button style={s.confirmBtn} onClick={onClose}>Schließen</button>
          </>
        ) : (
          <>
            {error && <p style={s.errorBox}>{error}</p>}
            <div style={s.field}>
              <label style={s.label}>Neues Passwort</label>
              <input
                style={s.input} type="password" placeholder="••••••••"
                value={password} autoFocus
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
              />
            </div>
            <div style={s.modalBtns}>
              <button style={s.cancelBtn} onClick={onClose}>Abbrechen</button>
              <button style={s.confirmBtn} onClick={handleSubmit} disabled={loading}>
                {loading ? "..." : "Zurücksetzen"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Edit User Modal ───────────────────────────────────────────────────────────

function EditUserModal({ user: targetUser, onClose, onSaved }) {
  const [form,     setForm]     = useState({ name: targetUser.name, username: targetUser.username, is_active: targetUser.is_active });
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [pwError,  setPwError]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [pwLoading,setPwLoading]= useState(false);
  const [pwSaved,  setPwSaved]  = useState(false);

  async function handleSave() {
    if (!form.name.trim() || !form.username.trim()) { setError("Name und Benutzername sind erforderlich"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/admin/users/${targetUser.id}`, {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail); }
      onSaved();
      onClose();
    } catch(e) { setError(e.message); }
    setLoading(false);
  }

  async function handlePasswordSave() {
    if (password.length < 4) { setPwError("Mindestens 4 Zeichen"); return; }
    setPwLoading(true); setPwError("");
    try {
      const res = await fetch(`${API}/admin/users/${targetUser.id}/password`, {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({ password }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail); }
      setPwSaved(true); setPassword("");
      setTimeout(() => setPwSaved(false), 2000);
    } catch(e) { setPwError(e.message); }
    setPwLoading(false);
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <p style={s.modalTitle}>{targetUser.name}</p>
        {error && <p style={s.errorBox}>{error}</p>}
        {[
          { key: "name",     label: "Name",         type: "text" },
          { key: "username", label: "Benutzername",  type: "text" },
        ].map(f => (
          <div key={f.key} style={s.field}>
            <label style={s.label}>{f.label}</label>
            <input
              style={s.input} type={f.type}
              value={form[f.key]}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
            />
          </div>
        ))}
        <div style={s.checkRow}>
          <input
            id="edit_active" type="checkbox" checked={form.is_active}
            onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))}
          />
          <label htmlFor="edit_active" style={{ ...s.label, margin: 0 }}>Aktiv</label>
        </div>

        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: "14px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={s.label}>Passwort zurücksetzen</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              style={{ ...s.input, flex: 1 }} type="password" placeholder="Neues Passwort"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handlePasswordSave()}
            />
            <button
              style={{ ...s.confirmBtn, flex: "none", padding: "0 14px", minWidth: "72px" }}
              onClick={handlePasswordSave}
              disabled={pwLoading || !password}
            >
              {pwLoading ? "..." : pwSaved ? "✓" : "Setzen"}
            </button>
          </div>
          {pwError && <p style={{ margin: 0, fontSize: "11px", color: ORANGE }}>{pwError}</p>}
        </div>

        <div style={s.modalBtns}>
          <button style={s.cancelBtn} onClick={onClose}>Abbrechen</button>
          <button style={s.confirmBtn} onClick={handleSave} disabled={loading}>
            {loading ? "..." : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Admin Lunch Modal ─────────────────────────────────────────────────────────

function AdminLunchModal({ entry, onClose, onSaved }) {
  const existing_start = entry.lunch_start
    ? new Date(entry.lunch_start).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit", hour12: false })
    : "12:00";
  const existing_end = entry.lunch_end
    ? new Date(entry.lunch_end).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit", hour12: false })
    : "13:00";

  const [from,    setFrom]    = useState(existing_start);
  const [till,    setTill]    = useState(existing_end);
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/admin/entries/${entry.id}/lunch`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ lunch_start: from, lunch_end: till }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail); }
      onSaved();
    } catch(e) { setError(e.message); }
    setLoading(false);
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <p style={s.modalTitle}>☕ Mittagspause eintragen</p>
        <p style={{ margin: 0, fontSize: "12px", color: MUTED }}>
          Eintrag vom {new Date(entry.punch_in).toLocaleString("de-AT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
        </p>
        {error && <p style={s.errorBox}>{error}</p>}
        <div style={{ display: "flex", gap: "12px" }}>
          <div style={{ ...s.field, flex: 1 }}>
            <label style={s.label}>Von</label>
            <input type="time" style={s.input} value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div style={{ ...s.field, flex: 1 }}>
            <label style={s.label}>Bis</label>
            <input type="time" style={s.input} value={till} onChange={e => setTill(e.target.value)} />
          </div>
        </div>
        <div style={s.modalBtns}>
          <button style={s.cancelBtn} onClick={onClose}>Abbrechen</button>
          <button style={s.confirmBtn} onClick={handleSave} disabled={loading}>
            {loading ? "..." : "Speichern"}
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
  const [messages,      setMessages]      = useState([]);
  const [expandedUser,  setExpandedUser]  = useState(null);
  const [showAddUser,      setShowAddUser]      = useState(false);
  const [showMonthlyExport, setShowMonthlyExport] = useState(false);
  const [resetUser,        setResetUser]        = useState(null);
  const [lunchEntry,       setLunchEntry]       = useState(null);
  const [editUser,         setEditUser]         = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [page,          setPage]          = useState("admin"); // "admin" | "dienstplan"
  const [subPage,       setSubPage]       = useState("overview"); // "overview" | "mitarbeiter"
  const touchStartX                       = useRef(null);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const [uRes, eRes, aRes, mRes] = await Promise.all([
        fetch(`${API}/admin/users`,          { headers: authHeaders() }),
        fetch(`${API}/admin/entries/today`,  { headers: authHeaders() }),
        fetch(`${API}/admin/entries/active`, { headers: authHeaders() }),
        fetch(`${API}/messages`,             { headers: authHeaders() }),
      ]);
      if (uRes.status === 401) { onLogout(); return; }
      setUsers(await uRes.json());
      setEntries(await eRes.json());
      setActiveEntries(await aRes.json());
      if (mRes.ok) setMessages(await mRes.json());
    } catch {}
    setLoading(false);
  }

  async function handleMarkRead(id) {
    await fetch(`${API}/messages/${id}/read`, { method: "PATCH", headers: authHeaders() });
    setMessages(prev => prev.map(m => m.id === id ? { ...m, is_read: true } : m));
  }

  async function handleDeleteMessage(id) {
    await fetch(`${API}/messages/${id}`, { method: "DELETE", headers: authHeaders() });
    setMessages(prev => prev.filter(m => m.id !== id));
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

  async function handleDeleteUser(userId, userName) {
    if (!confirm(`Mitarbeiter "${userName}" und alle zugehörigen Einträge wirklich löschen?`)) return;
    await fetch(`${API}/admin/users/${userId}`, {
      method: "DELETE", headers: authHeaders(),
    });
    fetchAll();
  }

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (diff < -60 && page === "admin") setPage("dienstplan");
    if (diff > 60  && page === "dienstplan") setPage("admin");
  }

  const entriesByUser = entries.reduce((acc, e) => {
    if (!acc[e.user_id]) acc[e.user_id] = [];
    acc[e.user_id].push(e);
    return acc;
  }, {});

  const activeUserIds  = new Set(activeEntries.map(e => e.user_id));
  const slideOffset    = page === "dienstplan" ? "-50%" : "0%";

  return (
    <div
      style={s.slideViewport}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div style={{ ...s.slideTrack, transform: `translateX(${slideOffset})` }}>

        {/* ── Admin panel ── */}
        <div style={s.slidePanel}>
          <div style={s.root}>
            <div style={s.bg} aria-hidden="true" />

            {/* Header */}
            <header style={s.header}>
              <div style={s.brand}>
                <img src="/cathedral.png" alt="Stephansdom" style={s.logo} />
                <span style={s.adminBadge}>ADMIN</span>
              </div>
              <div style={s.headerRight}>
                <span style={s.userName}>{user.name}</span>
                <button
                  style={{ ...s.logoutBtn, ...(subPage === "mitarbeiter" ? s.logoutBtnActive : {}) }}
                  onClick={() => setSubPage(subPage === "mitarbeiter" ? "overview" : "mitarbeiter")}
                >Mitarbeiter</button>
                <button style={s.logoutBtn} onClick={() => setPage("dienstplan")}>Dienstplan</button>
                <button style={s.logoutBtn} onClick={onLogout}>Abmelden</button>
              </div>
            </header>

            <main style={s.main}>

              {/* ── Mitarbeiter list view ── */}
              {subPage === "mitarbeiter" && (
                <section style={s.section}>
                  <div style={s.sectionHeader}>
                    <p style={s.sectionTitle}>MITARBEITER</p>
                    <span style={s.badge}>{users.filter(u => !u.is_admin).length}</span>
                  </div>
                  {users.filter(u => !u.is_admin).map(u => {
                    const isClocked = activeUserIds.has(u.id);
                    const statusLabel = !u.is_active ? "Inaktiv" : isClocked ? "Eingestempelt" : "Ausgestempelt";
                    const statusColor = !u.is_active ? MUTED : isClocked ? GREEN : MUTED;
                    return (
                      <div key={u.id} style={s.mitarbeiterRow} onClick={() => setEditUser(u)}>
                        <div>
                          <div style={s.userNameCell}>{u.name}</div>
                          <div style={s.userUsername}>@{u.username}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {isClocked && <span style={s.activeDot} />}
                          <span style={{ fontSize: "12px", color: statusColor }}>{statusLabel}</span>
                          <span style={{ fontSize: "12px", color: MUTED }}>›</span>
                        </div>
                      </div>
                    );
                  })}
                </section>
              )}

              {subPage === "overview" && <>

              {/* ── Inbox ── */}
              <section style={s.section}>
                <div style={s.sectionHeader}>
                  <p style={s.sectionTitle}>POSTEINGANG</p>
                  {messages.filter(m => !m.is_read).length > 0 && (
                    <span style={s.badge}>{messages.filter(m => !m.is_read).length} neu</span>
                  )}
                </div>
                {messages.length === 0 ? (
                  <p style={s.empty}>Keine Nachrichten</p>
                ) : (
                  messages.map(m => (
                    <div key={m.id} style={{ ...s.msgRow, ...(m.is_read ? {} : s.msgRowUnread) }}>
                      <div style={s.msgMeta}>
                        <span style={s.msgSender}>{m.sender_name}</span>
                        <span style={s.msgTime}>
                          {new Date(m.sent_at).toLocaleString("de-AT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p style={s.msgBody}>{m.body}</p>
                      <div style={s.msgActions}>
                        {!m.is_read && (
                          <button style={s.msgReadBtn} onClick={() => handleMarkRead(m.id)}>
                            Als gelesen markieren
                          </button>
                        )}
                        <button style={s.deleteBtn} onClick={() => handleDeleteMessage(m.id)}>
                          Löschen
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </section>

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
                  <button style={s.ghostBtn} onClick={() => setShowMonthlyExport(true)}>
                    ↓ Monatsexport
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
                    const totalMins = uEntries.reduce((acc, e) => acc + (e.duration_minutes ?? 0), 0);

                    return (
                      <div key={u.id} style={s.userBlock}>
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
                                  {e.lunch_start && e.lunch_end && (
                                    <p style={s.entryLunch}>
                                      ☕ {formatTime(e.lunch_start)} – {formatTime(e.lunch_end)}
                                    </p>
                                  )}
                                  {e.note && <p style={s.entryNote}>"{e.note}"</p>}
                                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                                    <button
                                      style={s.lunchEntryBtn}
                                      onClick={() => setLunchEntry(e)}
                                    >
                                      ☕ Pause eintragen
                                    </button>
                                    <button
                                      style={s.deleteBtn}
                                      onClick={() => handleDeleteEntry(e.id)}
                                    >
                                      Löschen
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                              <button
                                style={s.manualPunchBtn}
                                onClick={() => handleAdminPunch(u.id)}
                              >
                                {isActive ? "⏹ Manuell ausstempeln" : "▶ Manuell einstempeln"}
                              </button>
                              <button
                                style={s.manualPunchBtn}
                                onClick={() => setResetUser(u)}
                              >
                                Passwort zurücksetzen
                              </button>
                              <button
                                style={s.deleteUserBtn}
                                onClick={() => handleDeleteUser(u.id, u.name)}
                              >
                                Mitarbeiter löschen
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </section>

              </>}

            </main>

          </div>
        </div>

        {/* ── Dienstplan panel ── */}
        <div style={s.slidePanel}>
          <Dienstplan onSwipeBack={() => setPage("admin")} isAdmin={true} />
        </div>

      </div>

      {/* Modals rendered outside the transformed slideTrack so position:fixed works correctly */}
      {showMonthlyExport && (
        <MonthlyExportModal
          users={users.filter(u => !u.is_admin)}
          onClose={() => setShowMonthlyExport(false)}
        />
      )}
      {showAddUser && (
        <AddUserModal
          onClose={() => setShowAddUser(false)}
          onCreated={fetchAll}
        />
      )}
      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
        />
      )}
      {lunchEntry && (
        <AdminLunchModal
          entry={lunchEntry}
          onClose={() => setLunchEntry(null)}
          onSaved={() => { setLunchEntry(null); fetchAll(); }}
        />
      )}
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={fetchAll}
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
  // Swipe slide container
  slideViewport: {
    width: "100vw",
    overflow: "hidden",
    position: "relative",
  },
  slideTrack: {
    display: "flex",
    width: "200%",
    transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    willChange: "transform",
  },
  slidePanel: {
    width: "50%",
    minHeight: "100dvh",
    flexShrink: 0,
  },

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
    gap: "8px", padding: "10px 14px",
    borderBottom: `1px solid ${BORDER}`, background: SURFACE,
    flexWrap: "wrap",
  },
  brand:      { display: "flex", alignItems: "center", gap: "8px" },
  logo:       { height: "36px", width: "auto", objectFit: "contain", flexShrink: 0 },
  adminBadge: {
    fontSize: "9px", fontWeight: "700", letterSpacing: "0.15em",
    background: ORANGE, color: "#fff", padding: "2px 6px", borderRadius: "2px",
    whiteSpace: "nowrap",
  },
  headerRight: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" },
  userName:    { fontSize: "11px", color: MUTED, marginRight: "2px" },
  logoutBtn: {
    background: "none", border: `1px solid ${BORDER}`, borderRadius: "3px",
    padding: "5px 8px", fontSize: "11px", color: MUTED, cursor: "pointer",
    fontFamily: "inherit", whiteSpace: "nowrap",
  },
  logoutBtnActive: {
    borderColor: ORANGE, color: ORANGE,
  },
  mitarbeiterRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 16px", borderBottom: `1px solid ${BORDER}`,
    cursor: "pointer",
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

  // Inbox
  msgRow: {
    padding: "14px 16px", borderBottom: `1px solid ${BORDER}`,
    display: "flex", flexDirection: "column", gap: "6px",
  },
  msgRowUnread: { background: "rgba(245,98,15,0.04)", borderLeft: `3px solid ${ORANGE}` },
  msgMeta:   { display: "flex", justifyContent: "space-between", alignItems: "center" },
  msgSender: { fontSize: "13px", fontWeight: "600", color: TEXT },
  msgTime:   { fontSize: "11px", color: MUTED },
  msgBody:   { margin: 0, fontSize: "13px", color: TEXT, lineHeight: "1.5", whiteSpace: "pre-wrap" },
  msgActions: { display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" },
  msgReadBtn: {
    background: "none", border: `1px solid ${BORDER}`, borderRadius: "3px",
    padding: "4px 10px", fontSize: "10px", color: MUTED,
    cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.06em",
  },

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

  userBlock: { borderBottom: `1px solid ${BORDER}` },
  userRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 16px", cursor: "pointer", transition: "background 0.1s",
  },
  userRowActive: { background: "rgba(34,197,94,0.04)" },
  userLeft:      { display: "flex", alignItems: "center", gap: "10px" },
  userNameCell:  { fontSize: "14px", color: TEXT, fontWeight: "600" },
  userUsername:  { fontSize: "11px", color: MUTED },
  userRight:     { display: "flex", alignItems: "center", gap: "12px" },
  totalDur:      { fontSize: "13px", color: ORANGE, fontWeight: "700" },
  entryCount:    { fontSize: "11px", color: MUTED },
  chevron:       { fontSize: "10px", color: MUTED },

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
  entryLunch: { margin: 0, fontSize: "11px", color: MUTED },
  lunchEntryBtn: {
    background: "none",
    border: `1px solid ${BORDER}`, borderRadius: "3px",
    padding: "4px 10px", fontSize: "10px", color: MUTED,
    cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.06em",
  },
  deleteBtn: {
    alignSelf: "flex-end", background: "none",
    border: `1px solid rgba(255,80,80,0.2)`, borderRadius: "3px",
    padding: "4px 10px", fontSize: "10px", color: "#ff5050",
    cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.06em",
  },
  deleteUserBtn: {
    margin: "4px 0 0", background: "none",
    border: `1px solid rgba(255,80,80,0.3)`, borderRadius: "3px",
    padding: "8px 14px", fontSize: "11px", color: "#ff5050",
    cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.06em",
    alignSelf: "flex-start",
  },
  manualPunchBtn: {
    margin: "4px 0 0", background: "none",
    border: `1px solid ${BORDER}`, borderRadius: "3px",
    padding: "8px 14px", fontSize: "11px", color: MUTED,
    cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.06em",
    alignSelf: "flex-start",
  },

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
