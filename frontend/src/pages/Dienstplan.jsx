import ShiftCalendar from "./ShiftCalendar";

const BLACK   = "#0D0D0D";
const SURFACE = "#161616";
const BORDER  = "#2A2A2A";
const MUTED   = "#6B6B6B";
const TEXT    = "#EDEDED";

export default function Dienstplan({ onSwipeBack }) {
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  return (
    <div style={s.root}>
      <div style={s.bg} aria-hidden="true" />

      <header style={s.header}>
        <button style={s.backBtn} onClick={onSwipeBack}>‹ Zurück</button>
        <span style={s.title}>Dienstplan</span>
        <div style={{ width: "80px" }} />
      </header>

      <div style={s.content}>
        <ShiftCalendar readOnly={true} highlightName={user.name ?? ""} />
      </div>
    </div>
  );
}

const s = {
  root: {
    minHeight: "100dvh", background: BLACK,
    fontFamily: "'DM Mono', 'Courier New', monospace",
    display: "flex", flexDirection: "column", position: "relative",
  },
  bg: {
    position: "fixed", inset: 0,
    backgroundImage: `linear-gradient(${BORDER} 1px, transparent 1px), linear-gradient(90deg, ${BORDER} 1px, transparent 1px)`,
    backgroundSize: "40px 40px", opacity: 0.35, pointerEvents: "none",
  },
  header: {
    position: "relative", zIndex: 1,
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "16px 20px", borderBottom: `1px solid ${BORDER}`, background: SURFACE,
  },
  backBtn: {
    background: "none", border: `1px solid ${BORDER}`, borderRadius: "3px",
    padding: "5px 12px", fontSize: "12px", color: MUTED,
    cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.08em",
  },
  title: {
    fontSize: "13px", fontWeight: "700", color: TEXT, letterSpacing: "0.1em",
  },
  content: { position: "relative", zIndex: 1, flex: 1 },
};
