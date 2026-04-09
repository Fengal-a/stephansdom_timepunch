import { useState, useEffect, useRef } from "react";

const API = import.meta.env.VITE_API_URL ?? "";

function authHeaders() {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}` };
}

export default function Dienstplan({ onSwipeBack, isAdmin }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    loadImage();
  }, []);

  async function loadImage(bustCache = false) {
    try {
      const url = `${API}/admin/dienstplan/image${bustCache ? `?t=${Date.now()}` : ""}`;
      const res = await fetch(url, { headers: authHeaders(), cache: bustCache ? "no-store" : "default" });
      if (res.ok) {
        const blob = await res.blob();
        setImageUrl(URL.createObjectURL(blob));
      } else {
        setImageUrl(null);
      }
    } catch {
      setImageUrl(null);
    }
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/admin/dienstplan`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      if (!res.ok) throw new Error("Upload fehlgeschlagen");
      // Revoke old object URL and reload
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      await loadImage(true);
    } catch (err) {
      setError(err.message);
    }
    setUploading(false);
  }

  return (
    <div style={s.root}>
      <div style={s.bg} aria-hidden="true" />

      {/* Header */}
      <header style={s.header}>
        <button style={s.backBtn} onClick={onSwipeBack}>‹ Zurück</button>
        {isAdmin && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleUpload}
            />
            <button
              style={s.uploadBtn}
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Hochladen..." : "Bild hochladen"}
            </button>
          </>
        )}
      </header>

      {/* Main content */}
      <main style={s.main}>
        <h1 style={s.title}>Dienstplan</h1>

        {error && <p style={s.errorBox}>{error}</p>}

        {/* Image area */}
        <div style={s.imageContainer}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Dienstplan"
              style={s.image}
            />
          ) : (
            <div style={s.imagePlaceholder}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ opacity: 0.3 }}>
                <rect x="4" y="8" width="40" height="30" rx="3" stroke="#EDEDED" strokeWidth="2" fill="none" />
                <circle cx="16" cy="20" r="4" stroke="#EDEDED" strokeWidth="2" fill="none" />
                <path d="M4 32 L14 22 L22 30 L30 20 L44 38" stroke="#EDEDED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={s.placeholderText}>
                {isAdmin ? "Noch kein Bild hochgeladen" : "Kein Dienstplan verfügbar"}
              </span>
              {isAdmin && (
                <button style={s.uploadBtnLarge} onClick={() => fileRef.current?.click()}>
                  Bild hochladen
                </button>
              )}
            </div>
          )}
        </div>
      </main>
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
  backBtn: {
    background: "none",
    border: `1px solid ${BORDER}`,
    borderRadius: "3px",
    padding: "5px 12px",
    fontSize: "12px",
    color: MUTED,
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "0.08em",
  },
  uploadBtn: {
    background: ORANGE,
    border: "none",
    borderRadius: "3px",
    padding: "6px 14px",
    fontSize: "11px",
    fontWeight: "700",
    color: "#fff",
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "0.08em",
  },
  main: {
    position: "relative",
    zIndex: 1,
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "40px 20px 32px",
    gap: "24px",
    maxWidth: "600px",
    margin: "0 auto",
    width: "100%",
  },
  title: {
    margin: 0,
    fontSize: "28px",
    fontWeight: "700",
    color: TEXT,
    letterSpacing: "-0.02em",
    fontFamily: "'DM Sans', sans-serif",
    alignSelf: "flex-start",
  },
  errorBox: {
    margin: 0,
    padding: "10px 12px",
    background: "rgba(245,98,15,0.1)",
    border: `1px solid rgba(245,98,15,0.3)`,
    borderRadius: "3px",
    fontSize: "12px",
    color: ORANGE,
    width: "100%",
  },
  imageContainer: {
    width: "100%",
    flex: 1,
    display: "flex",
    flexDirection: "column",
  },
  image: {
    width: "100%",
    borderRadius: "6px",
    border: `1px solid ${BORDER}`,
    objectFit: "contain",
  },
  imagePlaceholder: {
    flex: 1,
    minHeight: "300px",
    border: `2px dashed ${BORDER}`,
    borderRadius: "8px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "16px",
    background: SURFACE,
  },
  placeholderText: {
    fontSize: "12px",
    color: MUTED,
    letterSpacing: "0.1em",
  },
  uploadBtnLarge: {
    background: ORANGE,
    border: "none",
    borderRadius: "3px",
    padding: "10px 20px",
    fontSize: "12px",
    fontWeight: "700",
    color: "#fff",
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "0.08em",
    marginTop: "8px",
  },
};
