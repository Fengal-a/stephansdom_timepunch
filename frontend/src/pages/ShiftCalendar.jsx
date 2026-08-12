import { useState, useEffect, useRef } from "react";

const API = import.meta.env.VITE_API_URL ?? "";

function authHeaders() {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const ROLES = [
  "AUFSPERRDIENST",
  "DOMMESNER VORMITTAG",
  "DOMAUFSICHT VORMITTAG",
  "FREI",
  "DOMMESNER NACHMITTAG",
  "DOMAUFSICHT NACHMITTAG",
  "SHOP",
  "TURMKASSA",
  "TÜRMERSTUBE",
  "AUDIOG. INFO.",
  "NORDTURM",
  "ABEND KIRCHE",
];

const ROLE_TIMES = {
  "AUFSPERRDIENST":         "05:30 – 15:30",
  "DOMMESNER VORMITTAG":    "06:30 – 16:30",
  "DOMAUFSICHT VORMITTAG":  "07:00 – 17:00",
  "FREI":                   "",
  "DOMMESNER NACHMITTAG":   "09:00 – 19:00",
  "DOMAUFSICHT NACHMITTAG": "09:00 – 19:00",
  "SHOP":                   "09:00 – 19:00",
  "TURMKASSA":              "09:00 – 19:00",
  "TÜRMERSTUBE":            "09:00 – 19:00",
  "AUDIOG. INFO.":          "09:00 – 17:00",
  "NORDTURM":               "09:00 – 19:00",
  "ABEND KIRCHE":           "19:00 – 22:00",
};

const DAY_NAMES = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];

function getMonday(d) {
  const date = new Date(d);
  const day  = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d, n) {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}

function toIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtDay(d) { return d.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit" }); }

// ── Main component ────────────────────────────────────────────────────────────

function resolveDisplayName(username, userNames) {
  if (!username) return "";
  const found = userNames.find(u => u.username === username);
  return found ? found.displayName : username;
}

export default function ShiftCalendar({ readOnly = false, highlightName = "" }) {
  const [monday,      setMonday]      = useState(() => getMonday(new Date()));
  const [cells,       setCells]       = useState({});
  const [note,        setNote]        = useState("");
  const [editingCell, setEditingCell] = useState(null);
  const [editValue,   setEditValue]   = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [suggIdx,     setSuggIdx]     = useState(-1);
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue,   setNoteValue]   = useState("");
  const [userNames,   setUserNames]   = useState([]);
  const [saving,      setSaving]      = useState(false);
  const [saveStatus,  setSaveStatus]  = useState(null); // null | "ok" | "error"
  const inputRef = useRef(null);

  const weekStart = toIso(monday);
  const days      = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const weekLabel = `${fmtDay(monday)} – ${fmtDay(addDays(monday, 6))} ${monday.getFullYear()}`;

  useEffect(() => { fetchWeek(); }, [weekStart]);

  useEffect(() => { fetchUserNames(); }, []);

  useEffect(() => {
    if (editingCell && inputRef.current) inputRef.current.focus();
  }, [editingCell]);

  async function fetchWeek() {
    try {
      const res = await fetch(`${API}/admin/calendar/week?date=${weekStart}`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const map  = {};
      for (const c of data.cells) map[`${c.date}|${c.role}`] = c.worker_name;
      setCells(map);
      setNote(data.note ?? "");
      setNoteValue(data.note ?? "");
    } catch {}
  }

  async function fetchUserNames() {
    try {
      const res = await fetch(`${API}/admin/calendar/workers`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const firstNameCount = {};
      for (const u of data) {
        firstNameCount[u.first_name] = (firstNameCount[u.first_name] || 0) + 1;
      }
      setUserNames(data.map(u => ({
        username: u.username,
        displayName: firstNameCount[u.first_name] === 1
          ? u.first_name
          : `${u.first_name} ${u.last_name.charAt(0)}.`,
      })));
    } catch {}
  }

  function updateCellLocal(isoDate, role, value) {
    setCells(prev => ({ ...prev, [`${isoDate}|${role}`]: value }));
    setSaveStatus(null);
  }

  async function saveWeek() {
    setSaving(true);
    setSaveStatus(null);
    const cellsArr = [];
    for (const [key, val] of Object.entries(cells)) {
      if (!val) continue;
      const [dateStr, role] = key.split("|");
      cellsArr.push({ date: dateStr, role, worker_name: val });
    }
    try {
      const res = await fetch(`${API}/admin/calendar/week-cells`, {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({ week_start: weekStart, cells: cellsArr }),
      });
      if (res.ok) {
        setSaveStatus("ok");
        setTimeout(() => setSaveStatus(null), 3000);
      } else {
        const text = await res.text();
        console.error("saveWeek failed:", res.status, text);
        setSaveStatus("error");
      }
    } catch (e) {
      console.error("saveWeek error:", e);
      setSaveStatus("error");
    }
    setSaving(false);
  }

  async function saveNote() {
    await fetch(`${API}/admin/calendar/note`, {
      method: "PUT", headers: authHeaders(),
      body: JSON.stringify({ week_start: weekStart, note: noteValue }),
    });
    setNote(noteValue);
    setEditingNote(false);
  }

  function startEdit(isoDate, role) {
    if (readOnly) return;
    setEditingCell({ date: isoDate, role });
    const rawVal = cells[`${isoDate}|${role}`] ?? "";
    setEditValue(resolveDisplayName(rawVal, userNames) || rawVal);
    setSuggestions([]);
    setSuggIdx(-1);
  }

  function handleEditChange(e) {
    const val = e.target.value;
    setEditValue(val);
    setSuggIdx(-1);
    if (val.trim()) {
      const matches = userNames.filter(u =>
        u.displayName.toLowerCase().includes(val.toLowerCase()) ||
        u.username.toLowerCase().includes(val.toLowerCase())
      );
      setSuggestions(matches.slice(0, 6));
    } else {
      setSuggestions([]);
    }
  }

  function selectSuggestion(item) {
    setSuggestions([]);
    setSuggIdx(-1);
    setEditValue(item.displayName);
    // editor stays open — user clicks ✓ to confirm
  }

  function commitEdit() {
    if (!editingCell) return;
    setSuggestions([]);
    const trimmed = editValue.trim();
    const match = userNames.find(u =>
      u.displayName.toLowerCase() === trimmed.toLowerCase() ||
      u.username.toLowerCase() === trimmed.toLowerCase()
    );
    updateCellLocal(editingCell.date, editingCell.role, match ? match.username : trimmed);
    setEditingCell(null);
  }

  function cancelEdit() {
    setSuggestions([]);
    setEditingCell(null);
  }

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSuggIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSuggIdx(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggIdx >= 0 && suggestions[suggIdx]) {
        const sel = suggestions[suggIdx];
        setSuggestions([]);
        setSuggIdx(-1);
        setEditValue(sel.displayName);
        updateCellLocal(editingCell.date, editingCell.role, sel.username);
        setEditingCell(null);
      } else {
        commitEdit();
      }
    }
    if (e.key === "Escape") { cancelEdit(); }
  }

  return (
    <div style={s.root}>

      {/* Week navigation */}
      <div style={s.nav}>
        <button style={s.navBtn} onClick={() => setMonday(d => addDays(d, -7))}>‹</button>
        <span style={s.navTitle}>{weekLabel}</span>
        <button style={s.navBtn} onClick={() => setMonday(d => addDays(d, 7))}>›</button>
      </div>

      {/* Scrollable table */}
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, ...s.stickyDatum }}>DATUM</th>
              <th style={{ ...s.th, ...s.stickyTag }}>TAG</th>
              {ROLES.map(r => <th key={r} style={s.th}>{r}</th>)}
            </tr>
            <tr>
              <td style={{ ...s.timeCell, ...s.stickyDatum }} />
              <td style={{ ...s.timeCell, ...s.stickyTag }} />
              {ROLES.map(r => <td key={r} style={s.timeCell}>{ROLE_TIMES[r] || ""}</td>)}
            </tr>
          </thead>

          <tbody>
            {days.map((d, i) => {
              const iso       = toIso(d);
              const isWeekend = i >= 5;
              return (
                <tr key={iso}>
                  <td style={{ ...s.dateCell, ...s.stickyDatum, ...(isWeekend ? s.weekendSticky : {}) }}>
                    {fmtDay(d)}
                  </td>
                  <td style={{ ...s.dayCell, ...s.stickyTag, ...(isWeekend ? s.weekendSticky : {}) }}>
                    {DAY_NAMES[i]}
                  </td>
                  {ROLES.map(role => {
                    const key         = `${iso}|${role}`;
                    const val         = cells[key] ?? "";
                    const displayVal  = resolveDisplayName(val, userNames);
                    const isEditing   = editingCell?.date === iso && editingCell?.role === role;
                    const isHighlight = highlightName && val === highlightName;

                    return (
                      <td
                        key={role}
                        style={{
                          ...s.cell,
                          ...(isWeekend ? s.weekendCell : {}),
                          ...(isHighlight ? s.highlightCell : {}),
                          ...(!readOnly ? s.editableCell : {}),
                        }}
                        onClick={() => startEdit(iso, role)}
                      >
                        {isEditing ? (
                          <div style={{ position: "relative" }}>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <input
                                ref={inputRef}
                                style={{ ...s.cellInput, flex: 1 }}
                                value={editValue}
                                onChange={handleEditChange}
                                onBlur={cancelEdit}
                                onKeyDown={handleKeyDown}
                                placeholder="Name…"
                              />
                              <button
                                style={s.cellSaveBtn}
                                onMouseDown={e => { e.preventDefault(); commitEdit(); }}
                              >✓</button>
                            </div>
                            {suggestions.length > 0 && (
                              <div style={s.dropdown}>
                                {suggestions.map((item, idx) => (
                                  <div
                                    key={item.username}
                                    style={{ ...s.dropdownItem, ...(idx === suggIdx ? s.dropdownActive : {}) }}
                                    onMouseDown={e => { e.preventDefault(); selectSuggestion(item); }}
                                  >
                                    {item.displayName}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={isHighlight ? s.cellHighlightVal : val ? s.cellValue : s.cellEmpty}>
                            {displayVal || (readOnly ? "" : "—")}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Save bar — admin only */}
      {!readOnly && (
        <div style={s.saveBar}>
          <button style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }} onClick={saveWeek} disabled={saving}>
            {saving ? "Wird gespeichert…" : "Speichern"}
          </button>
          {saveStatus === "ok"    && <span style={s.saveOk}>✓ Gespeichert</span>}
          {saveStatus === "error" && <span style={s.saveErr}>Fehler beim Speichern — Details in Konsole</span>}
        </div>
      )}

      {/* Note area */}
      <div style={s.noteArea}>
        <div style={s.noteHeader}>
          <span style={s.noteLabel}>BESONDERE EREIGNISSE</span>
          {!readOnly && !editingNote && (
            <button style={s.noteEditBtn} onClick={() => { setNoteValue(note); setEditingNote(true); }}>
              Bearbeiten
            </button>
          )}
        </div>
        {!readOnly && editingNote ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <textarea
              style={s.textarea}
              value={noteValue}
              onChange={e => setNoteValue(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Besondere Ereignisse oder Hinweise für diese Woche…"
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <button style={s.cancelBtn} onClick={() => setEditingNote(false)}>Abbrechen</button>
              <button style={s.saveBtn}   onClick={saveNote}>Speichern</button>
            </div>
          </div>
        ) : (
          <p style={note ? s.noteText : s.noteEmpty}>
            {note || "Keine besonderen Ereignisse eingetragen."}
          </p>
        )}
      </div>
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

const s = {
  root: { display: "flex", flexDirection: "column" },

  nav: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 20px", borderBottom: `1px solid ${BORDER}`, background: SURFACE,
  },
  navBtn: {
    background: "none", border: `1px solid ${BORDER}`, borderRadius: "3px",
    color: TEXT, fontSize: "22px", width: "36px", height: "36px",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  },
  navTitle: { fontSize: "14px", fontWeight: "700", color: TEXT, letterSpacing: "0.04em" },

  tableWrap: { overflowX: "auto", borderBottom: `1px solid ${BORDER}` },
  table: {
    borderCollapse: "collapse", width: "100%", minWidth: "1200px",
    fontFamily: "'DM Mono', 'Courier New', monospace", fontSize: "11px",
  },

  th: {
    background: SURFACE, color: MUTED, fontWeight: "700", fontSize: "9px",
    letterSpacing: "0.08em", textTransform: "uppercase",
    padding: "10px 8px", border: `1px solid ${BORDER}`,
    textAlign: "center", verticalAlign: "bottom",
    whiteSpace: "pre-line", minWidth: "82px",
  },
  stickyDatum: { position: "sticky", left: 0,  zIndex: 2, minWidth: "64px", width: "64px", background: SURFACE },
  stickyTag:   { position: "sticky", left: 64, zIndex: 2, minWidth: "76px", width: "76px", background: SURFACE, borderLeft: `2px solid ${BORDER}` },

  timeCell: {
    background: BLACK, color: MUTED, fontSize: "9px", textAlign: "center",
    padding: "5px 4px", border: `1px solid ${BORDER}`, letterSpacing: "0.04em",
  },
  dateCell: {
    background: SURFACE, color: MUTED, fontSize: "11px", fontWeight: "700",
    padding: "10px 8px", border: `1px solid ${BORDER}`, textAlign: "center", whiteSpace: "nowrap",
  },
  dayCell: {
    background: SURFACE, color: TEXT, fontSize: "11px",
    padding: "10px 8px", border: `1px solid ${BORDER}`, borderLeft: `2px solid ${BORDER}`, whiteSpace: "nowrap",
  },
  weekendSticky: { background: "#111" },

  cell: {
    background: BLACK, padding: 0, border: `1px solid ${BORDER}`,
    height: "38px", textAlign: "center", verticalAlign: "middle",
  },
  editableCell: { cursor: "pointer" },
  weekendCell:  { background: "#0a0a0a" },
  highlightCell: { background: "rgba(245,98,15,0.08)" },

  cellValue:        { color: TEXT, fontSize: "11px" },
  cellEmpty:        { color: BORDER, fontSize: "13px" },
  cellHighlightVal: { color: ORANGE, fontSize: "11px", fontWeight: "700" },

  cellInput: {
    background: "rgba(245,98,15,0.08)", border: "none",
    borderBottom: `1px solid ${ORANGE}`, color: TEXT, fontSize: "11px",
    textAlign: "center", padding: "6px 2px", outline: "none",
    fontFamily: "'DM Mono', 'Courier New', monospace", boxSizing: "border-box",
    minWidth: 0,
  },
  cellSaveBtn: {
    background: ORANGE, border: "none", color: "#fff",
    fontSize: "12px", fontWeight: "700", padding: "0 5px",
    cursor: "pointer", alignSelf: "stretch", flexShrink: 0,
  },

  dropdown: {
    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
    background: "#222", border: `1px solid ${BORDER}`, borderTop: "none",
    borderRadius: "0 0 4px 4px", maxHeight: "160px", overflowY: "auto",
  },
  dropdownItem: {
    padding: "7px 10px", fontSize: "11px", color: TEXT, cursor: "pointer",
    textAlign: "left", borderBottom: `1px solid ${BORDER}`,
  },
  dropdownActive: { background: "rgba(245,98,15,0.15)", color: ORANGE },

  saveBar: {
    display: "flex", alignItems: "center", gap: "14px",
    padding: "14px 20px", borderBottom: `1px solid ${BORDER}`,
  },
  saveOk:  { fontSize: "12px", color: "#4caf50" },
  saveErr: { fontSize: "12px", color: "#f44336" },

  noteArea:   { padding: "20px 20px 28px", display: "flex", flexDirection: "column", gap: "10px" },
  noteHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  noteLabel:  { fontSize: "10px", color: MUTED, letterSpacing: "0.15em" },
  noteEditBtn: {
    background: "none", border: `1px solid ${BORDER}`, borderRadius: "3px",
    padding: "4px 12px", fontSize: "10px", color: MUTED, cursor: "pointer", fontFamily: "inherit",
  },
  noteText:  { margin: 0, fontSize: "13px", color: TEXT, lineHeight: "1.6", whiteSpace: "pre-wrap" },
  noteEmpty: { margin: 0, fontSize: "12px", color: MUTED, fontStyle: "italic" },
  textarea: {
    background: BLACK, border: `1px solid ${BORDER}`, borderRadius: "3px",
    color: TEXT, fontSize: "13px", padding: "12px",
    fontFamily: "'DM Mono', 'Courier New', monospace", resize: "vertical", outline: "none", lineHeight: "1.6",
  },
  cancelBtn: {
    background: "none", border: `1px solid ${BORDER}`, borderRadius: "3px",
    padding: "8px 16px", fontSize: "11px", color: MUTED, cursor: "pointer", fontFamily: "inherit",
  },
  saveBtn: {
    background: ORANGE, border: "none", borderRadius: "3px",
    padding: "8px 20px", fontSize: "11px", fontWeight: "700",
    color: "#fff", cursor: "pointer", fontFamily: "inherit",
  },
};
