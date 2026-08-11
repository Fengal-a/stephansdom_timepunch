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
  return d.toISOString().split("T")[0];
}

function fmtDay(d) {
  return d.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit" });
}

export default function ShiftCalendar() {
  const [monday,      setMonday]      = useState(() => getMonday(new Date()));
  const [cells,       setCells]       = useState({});   // "ISO|ROLE" → worker_name
  const [note,        setNote]        = useState("");
  const [editingCell, setEditingCell] = useState(null); // { date, role }
  const [editValue,   setEditValue]   = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue,   setNoteValue]   = useState("");
  const inputRef = useRef(null);

  const weekStart = toIso(monday);
  const days      = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const weekLabel = `${fmtDay(monday)} – ${fmtDay(addDays(monday, 6))} ${monday.getFullYear()}`;

  useEffect(() => { fetchWeek(); }, [weekStart]);

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

  async function saveCell(isoDate, role, value) {
    setCells(prev => ({ ...prev, [`${isoDate}|${role}`]: value }));
    await fetch(`${API}/admin/calendar/cell`, {
      method: "PUT", headers: authHeaders(),
      body: JSON.stringify({ date: isoDate, role, worker_name: value }),
    });
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
    setEditingCell({ date: isoDate, role });
    setEditValue(cells[`${isoDate}|${role}`] ?? "");
  }

  function commitEdit() {
    if (!editingCell) return;
    saveCell(editingCell.date, editingCell.role, editValue.trim());
    setEditingCell(null);
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
            {/* Header row */}
            <tr>
              <th style={{ ...s.th, ...s.stickyDatum }}>DATUM</th>
              <th style={{ ...s.th, ...s.stickyTag }}>TAG</th>
              {ROLES.map(r => (
                <th key={r} style={s.th}>{r}</th>
              ))}
            </tr>
            {/* Time row */}
            <tr>
              <td style={{ ...s.timeCell, ...s.stickyDatum }} />
              <td style={{ ...s.timeCell, ...s.stickyTag }} />
              {ROLES.map(r => (
                <td key={r} style={s.timeCell}>00:00 – 00:00</td>
              ))}
            </tr>
          </thead>

          <tbody>
            {days.map((d, i) => {
              const iso       = toIso(d);
              const isWeekend = i >= 5;
              return (
                <tr key={iso} style={isWeekend ? s.weekendRow : {}}>
                  <td style={{ ...s.dateCell, ...s.stickyDatum, ...(isWeekend ? s.weekendSticky : {}) }}>
                    {fmtDay(d)}
                  </td>
                  <td style={{ ...s.dayCell, ...s.stickyTag, ...(isWeekend ? s.weekendSticky : {}) }}>
                    {DAY_NAMES[i]}
                  </td>
                  {ROLES.map(role => {
                    const key       = `${iso}|${role}`;
                    const isEditing = editingCell?.date === iso && editingCell?.role === role;
                    const val       = cells[key] ?? "";
                    return (
                      <td
                        key={role}
                        style={{ ...s.cell, ...(isWeekend ? s.weekendCell : {}) }}
                        onClick={() => !isEditing && startEdit(iso, role)}
                      >
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            style={s.cellInput}
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e => {
                              if (e.key === "Enter")  commitEdit();
                              if (e.key === "Escape") setEditingCell(null);
                            }}
                          />
                        ) : (
                          <span style={val ? s.cellValue : s.cellEmpty}>
                            {val || "—"}
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

      {/* Note / special events */}
      <div style={s.noteArea}>
        <div style={s.noteHeader}>
          <span style={s.noteLabel}>BESONDERE EREIGNISSE</span>
          {!editingNote && (
            <button style={s.noteEditBtn} onClick={() => { setNoteValue(note); setEditingNote(true); }}>
              Bearbeiten
            </button>
          )}
        </div>
        {editingNote ? (
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
    padding: "14px 20px", borderBottom: `1px solid ${BORDER}`,
    background: SURFACE,
  },
  navBtn: {
    background: "none", border: `1px solid ${BORDER}`, borderRadius: "3px",
    color: TEXT, fontSize: "22px", width: "36px", height: "36px",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  },
  navTitle: { fontSize: "14px", fontWeight: "700", color: TEXT, letterSpacing: "0.04em" },

  tableWrap: { overflowX: "auto", borderBottom: `1px solid ${BORDER}` },

  table: {
    borderCollapse: "collapse",
    width: "100%",
    minWidth: "1200px",
    fontFamily: "'DM Mono', 'Courier New', monospace",
    fontSize: "11px",
  },

  th: {
    background: SURFACE,
    color: MUTED,
    fontWeight: "700",
    fontSize: "9px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    padding: "10px 8px",
    border: `1px solid ${BORDER}`,
    textAlign: "center",
    verticalAlign: "bottom",
    whiteSpace: "pre-line",
    minWidth: "82px",
  },

  stickyDatum: {
    position: "sticky", left: 0, zIndex: 2,
    minWidth: "64px", width: "64px",
  },
  stickyTag: {
    position: "sticky", left: 64, zIndex: 2,
    minWidth: "76px", width: "76px",
    borderLeft: `2px solid ${BORDER}`,
  },

  timeCell: {
    background: BLACK,
    color: MUTED,
    fontSize: "9px",
    textAlign: "center",
    padding: "5px 4px",
    border: `1px solid ${BORDER}`,
    letterSpacing: "0.04em",
  },

  dateCell: {
    background: SURFACE,
    color: MUTED,
    fontSize: "11px",
    fontWeight: "700",
    padding: "10px 8px",
    border: `1px solid ${BORDER}`,
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  dayCell: {
    background: SURFACE,
    color: TEXT,
    fontSize: "11px",
    padding: "10px 8px",
    border: `1px solid ${BORDER}`,
    borderLeft: `2px solid ${BORDER}`,
    whiteSpace: "nowrap",
  },

  cell: {
    background: BLACK,
    padding: "0",
    border: `1px solid ${BORDER}`,
    height: "38px",
    cursor: "pointer",
    textAlign: "center",
    verticalAlign: "middle",
  },
  weekendRow: {},
  weekendCell: { background: "#0a0a0a" },
  weekendSticky: { background: "#111" },

  cellValue: { color: TEXT, fontSize: "11px" },
  cellEmpty: { color: BORDER, fontSize: "13px" },

  cellInput: {
    width: "100%",
    background: "rgba(245,98,15,0.08)",
    border: "none",
    borderBottom: `1px solid ${ORANGE}`,
    color: TEXT,
    fontSize: "11px",
    textAlign: "center",
    padding: "10px 4px",
    outline: "none",
    fontFamily: "'DM Mono', 'Courier New', monospace",
    boxSizing: "border-box",
  },

  noteArea: {
    padding: "20px 20px 28px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  noteHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  noteLabel: { fontSize: "10px", color: MUTED, letterSpacing: "0.15em" },
  noteEditBtn: {
    background: "none", border: `1px solid ${BORDER}`, borderRadius: "3px",
    padding: "4px 12px", fontSize: "10px", color: MUTED,
    cursor: "pointer", fontFamily: "inherit",
  },
  noteText:  { margin: 0, fontSize: "13px", color: TEXT, lineHeight: "1.6", whiteSpace: "pre-wrap" },
  noteEmpty: { margin: 0, fontSize: "12px", color: MUTED, fontStyle: "italic" },

  textarea: {
    background: BLACK, border: `1px solid ${BORDER}`, borderRadius: "3px",
    color: TEXT, fontSize: "13px", padding: "12px",
    fontFamily: "'DM Mono', 'Courier New', monospace",
    resize: "vertical", outline: "none", lineHeight: "1.6",
  },
  cancelBtn: {
    background: "none", border: `1px solid ${BORDER}`, borderRadius: "3px",
    padding: "8px 16px", fontSize: "11px", color: MUTED,
    cursor: "pointer", fontFamily: "inherit",
  },
  saveBtn: {
    background: ORANGE, border: "none", borderRadius: "3px",
    padding: "8px 20px", fontSize: "11px", fontWeight: "700",
    color: "#fff", cursor: "pointer", fontFamily: "inherit",
  },
};
