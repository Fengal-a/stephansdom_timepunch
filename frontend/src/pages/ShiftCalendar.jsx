import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL ?? "";

function authHeaders() {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS = ["Jänner","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
const COLORS = ["#F5620F","#22c55e","#3b82f6","#a855f7","#ec4899","#eab308"];

function buildGrid(year, month) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const pad   = (first.getDay() + 6) % 7; // Monday-first
  const cells = [];
  for (let i = 0; i < pad; i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(d);
  return cells;
}

function toIso(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ── Add Event Modal ───────────────────────────────────────────────────────────

function AddEventModal({ date, onClose, onSaved }) {
  const [title,   setTitle]   = useState("");
  const [color,   setColor]   = useState(COLORS[0]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function handleSave() {
    if (!title.trim()) { setError("Titel erforderlich"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/calendar/events`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ date, title: title.trim(), color }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail); }
      onSaved();
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <p style={s.modalTitle}>Eintrag hinzufügen</p>
        <p style={{ margin: 0, fontSize: "12px", color: MUTED }}>{date}</p>
        {error && <p style={s.errorBox}>{error}</p>}
        <div style={s.field}>
          <label style={s.label}>Titel</label>
          <input
            style={s.input} type="text" placeholder="z.B. Frühschicht, Urlaub, …"
            value={title} autoFocus
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSave()}
          />
        </div>
        <div style={s.field}>
          <label style={s.label}>Farbe</label>
          <div style={{ display: "flex", gap: "8px" }}>
            {COLORS.map(c => (
              <button
                key={c}
                style={{
                  width: "28px", height: "28px", borderRadius: "50%",
                  background: c, border: color === c ? "3px solid #fff" : "3px solid transparent",
                  cursor: "pointer", flexShrink: 0,
                }}
                onClick={() => setColor(c)}
              />
            ))}
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

// ── Main Calendar Component ───────────────────────────────────────────────────

export default function ShiftCalendar() {
  const now   = new Date();
  const [cur,      setCur]      = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [events,   setEvents]   = useState([]);
  const [addDate,  setAddDate]  = useState(null);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => { fetchEvents(); }, [cur]);

  async function fetchEvents() {
    setLoading(true);
    try {
      const res = await fetch(
        `${API}/admin/calendar/events?year=${cur.year}&month=${cur.month + 1}`,
        { headers: authHeaders() }
      );
      if (res.ok) setEvents(await res.json());
    } catch {}
    setLoading(false);
  }

  async function handleDelete(eventId) {
    await fetch(`${API}/admin/calendar/events/${eventId}`, {
      method: "DELETE", headers: authHeaders(),
    });
    setEvents(prev => prev.filter(e => e.id !== eventId));
  }

  function prevMonth() {
    setCur(c => c.month === 0
      ? { year: c.year - 1, month: 11 }
      : { year: c.year,     month: c.month - 1 }
    );
  }

  function nextMonth() {
    setCur(c => c.month === 11
      ? { year: c.year + 1, month: 0 }
      : { year: c.year,     month: c.month + 1 }
    );
  }

  const cells    = buildGrid(cur.year, cur.month);
  const eventMap = events.reduce((acc, e) => {
    if (!acc[e.date]) acc[e.date] = [];
    acc[e.date].push(e);
    return acc;
  }, {});

  const todayIso = toIso(now.getFullYear(), now.getMonth(), now.getDate());

  return (
    <div style={s.root}>
      {/* Month navigation */}
      <div style={s.nav}>
        <button style={s.navBtn} onClick={prevMonth}>‹</button>
        <span style={s.navTitle}>{MONTHS[cur.month]} {cur.year}</span>
        <button style={s.navBtn} onClick={nextMonth}>›</button>
      </div>

      {/* Day headers */}
      <div style={s.grid}>
        {DAYS.map(d => (
          <div key={d} style={s.dayHeader}>{d}</div>
        ))}

        {/* Day cells */}
        {cells.map((day, i) => {
          const iso      = day ? toIso(cur.year, cur.month, day) : null;
          const dayEvts  = iso ? (eventMap[iso] ?? []) : [];
          const isToday  = iso === todayIso;

          return (
            <div
              key={i}
              style={{
                ...s.cell,
                ...(day ? s.cellActive : s.cellEmpty),
                ...(isToday ? s.cellToday : {}),
              }}
              onClick={() => day && setAddDate(iso)}
            >
              {day && (
                <>
                  <span style={{ ...s.dayNum, ...(isToday ? s.dayNumToday : {}) }}>
                    {day}
                  </span>
                  <div style={s.eventList}>
                    {dayEvts.map(ev => (
                      <div
                        key={ev.id}
                        style={{ ...s.eventChip, background: ev.color + "22", borderColor: ev.color }}
                        onClick={e => { e.stopPropagation(); handleDelete(ev.id); }}
                        title="Klicken zum Löschen"
                      >
                        <span style={{ ...s.eventDot, background: ev.color }} />
                        <span style={s.eventTitle}>{ev.title}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {loading && <p style={s.loading}>Laden…</p>}

      <p style={s.hint}>Auf einen Tag klicken zum Hinzufügen · Auf einen Eintrag klicken zum Löschen</p>

      {addDate && (
        <AddEventModal
          date={addDate}
          onClose={() => setAddDate(null)}
          onSaved={() => { setAddDate(null); fetchEvents(); }}
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

const s = {
  root: {
    display: "flex", flexDirection: "column", gap: "0",
    minHeight: "100%",
  },
  nav: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "16px 20px", borderBottom: `1px solid ${BORDER}`,
  },
  navBtn: {
    background: "none", border: `1px solid ${BORDER}`, borderRadius: "3px",
    color: TEXT, fontSize: "20px", width: "36px", height: "36px",
    cursor: "pointer", fontFamily: "inherit", lineHeight: 1,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  navTitle: {
    fontSize: "15px", fontWeight: "700", color: TEXT, letterSpacing: "0.04em",
  },
  grid: {
    display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
    borderLeft: `1px solid ${BORDER}`, borderTop: `1px solid ${BORDER}`,
    flex: 1,
  },
  dayHeader: {
    padding: "10px 0", textAlign: "center", fontSize: "10px",
    color: MUTED, letterSpacing: "0.12em", textTransform: "uppercase",
    borderRight: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`,
    background: SURFACE,
  },
  cell: {
    minHeight: "90px", padding: "6px",
    borderRight: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`,
    display: "flex", flexDirection: "column", gap: "3px",
    boxSizing: "border-box",
  },
  cellActive: {
    background: BLACK, cursor: "pointer",
    transition: "background 0.1s",
  },
  cellEmpty: {
    background: "transparent", cursor: "default",
  },
  cellToday: {
    background: "rgba(245,98,15,0.04)",
  },
  dayNum: {
    fontSize: "12px", color: MUTED, fontWeight: "600", alignSelf: "flex-end",
    lineHeight: 1, marginBottom: "2px",
  },
  dayNumToday: {
    color: ORANGE,
  },
  eventList: {
    display: "flex", flexDirection: "column", gap: "2px",
  },
  eventChip: {
    display: "flex", alignItems: "center", gap: "4px",
    border: "1px solid", borderRadius: "3px",
    padding: "2px 5px", cursor: "pointer",
    transition: "opacity 0.1s",
  },
  eventDot: {
    width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0,
  },
  eventTitle: {
    fontSize: "10px", color: TEXT, overflow: "hidden",
    textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  loading: {
    margin: "20px auto", fontSize: "12px", color: MUTED,
  },
  hint: {
    textAlign: "center", fontSize: "10px", color: MUTED,
    padding: "12px", letterSpacing: "0.06em",
  },

  // Modal
  overlay: {
    position: "fixed", inset: 0, zIndex: 50,
    background: "rgba(0,0,0,0.75)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "24px",
  },
  modal: {
    background: "#1a1a1a", border: `1px solid ${BORDER}`,
    borderTop: `3px solid ${ORANGE}`, borderRadius: "6px",
    padding: "28px 24px", width: "100%", maxWidth: "360px",
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
  modalBtns: { display: "flex", gap: "10px", marginTop: "4px" },
  cancelBtn: {
    flex: 1, background: "none", border: `1px solid ${BORDER}`,
    borderRadius: "3px", padding: "12px", fontSize: "12px",
    color: MUTED, cursor: "pointer", fontFamily: "inherit",
  },
  confirmBtn: {
    flex: 2, background: ORANGE, border: "none", borderRadius: "3px",
    padding: "12px", fontSize: "12px", fontWeight: "700",
    color: "#fff", cursor: "pointer", fontFamily: "inherit",
  },
  errorBox: {
    margin: 0, padding: "10px 12px",
    background: "rgba(245,98,15,0.1)", border: `1px solid rgba(245,98,15,0.3)`,
    borderRadius: "3px", fontSize: "12px", color: ORANGE,
  },
};
