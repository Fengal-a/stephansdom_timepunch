from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from pathlib import Path
from typing import List
import bcrypt
import shutil
import csv
import io

from ..database import get_db
from ..models import User, TimeEntry
from ..schemas import UserOut, TimeEntryOut, UserCreate, LunchRequest
from .auth import require_admin, get_current_user

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=List[UserOut])
def list_all_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return db.query(User).order_by(User.name).all()


@router.post("/users", response_model=UserOut)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    existing = db.query(User).filter(User.username == payload.username.lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail="Benutzername bereits vergeben")
    hashed = bcrypt.hashpw(payload.password.encode(), bcrypt.gensalt()).decode()
    user = User(
        name=payload.name,
        username=payload.username.lower(),
        password_hash=hashed,
        is_admin=payload.is_admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}/password")
def reset_user_password(
    user_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    new_password = payload.get("password", "").strip()
    if len(new_password) < 4:
        raise HTTPException(status_code=400, detail="Passwort muss mindestens 4 Zeichen haben")
    user.password_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    db.commit()
    return {"ok": True}


@router.put("/users/{user_id}")
def update_user(
    user_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if "name" in payload:
        user.name = payload["name"].strip()
    if "username" in payload:
        new_username = payload["username"].strip().lower()
        conflict = db.query(User).filter(User.username == new_username, User.id != user_id).first()
        if conflict:
            raise HTTPException(status_code=409, detail="Benutzername bereits vergeben")
        user.username = new_username
    if "is_active" in payload:
        user.is_active = bool(payload["is_active"])
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    if user_id == current_admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.query(TimeEntry).filter(TimeEntry.user_id == user_id).delete()
    db.delete(user)
    db.commit()
    return {"ok": True}


# ── Entries ───────────────────────────────────────────────────────────────────

@router.get("/entries/today", response_model=List[TimeEntryOut])
def get_todays_entries(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    today = datetime.now(timezone.utc).date()
    return (
        db.query(TimeEntry)
        .filter(TimeEntry.punch_in >= datetime(today.year, today.month, today.day, tzinfo=timezone.utc))
        .order_by(TimeEntry.punch_in.desc())
        .all()
    )


@router.get("/entries/active")
def get_active_entries(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Returns open entries (punch_out IS NULL) with user info."""
    entries = (
        db.query(TimeEntry)
        .filter(TimeEntry.punch_out.is_(None))
        .all()
    )
    result = []
    for e in entries:
        user = db.query(User).filter(User.id == e.user_id).first()
        result.append({
            "entry_id": e.id,
            "user_id": e.user_id,
            "user_name": user.name if user else "?",
            "punch_in": e.punch_in,
        })
    return result


@router.post("/entries/{entry_id}/lunch")
def set_lunch_for_entry(
    entry_id: int,
    payload: LunchRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    entry = db.query(TimeEntry).filter(TimeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    date = entry.punch_in.date()
    try:
        h_s, m_s = map(int, payload.lunch_start.split(":"))
        h_e, m_e = map(int, payload.lunch_end.split(":"))
    except Exception:
        raise HTTPException(status_code=422, detail="Ungültiges Zeitformat")
    ls = datetime(date.year, date.month, date.day, h_s, m_s, tzinfo=timezone.utc)
    le = datetime(date.year, date.month, date.day, h_e, m_e, tzinfo=timezone.utc)
    if le <= ls:
        raise HTTPException(status_code=422, detail="Endzeit muss nach Startzeit liegen")
    entry.lunch_start = ls
    entry.lunch_end   = le
    db.commit()
    return {"ok": True}


@router.delete("/entries/{entry_id}")
def delete_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    entry = db.query(TimeEntry).filter(TimeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    db.delete(entry)
    db.commit()
    return {"ok": True}


# ── Manual punch for a user ───────────────────────────────────────────────────

@router.post("/users/{user_id}/punch")
def admin_punch(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Same toggle logic as user punch, but callable by admin for any user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    open_entry = (
        db.query(TimeEntry)
        .filter(TimeEntry.user_id == user_id, TimeEntry.punch_out.is_(None))
        .first()
    )
    now = datetime.now(timezone.utc)

    if open_entry is None:
        entry = TimeEntry(user_id=user_id, punch_in=now)
        db.add(entry)
        db.commit()
        db.refresh(entry)
        return {"action": "punched_in", "entry_id": entry.id}
    else:
        punch_in_utc = open_entry.punch_in.astimezone(timezone.utc) if open_entry.punch_in.tzinfo else open_entry.punch_in.replace(tzinfo=timezone.utc)
        duration = int((now - punch_in_utc).total_seconds() / 60)
        open_entry.punch_out = now
        open_entry.duration_minutes = duration
        db.commit()
        return {"action": "punched_out", "duration_minutes": duration}


# ── Monthly CSV export for a single employee ─────────────────────────────────

@router.get("/export/monthly")
def export_monthly(
    user_id: int = Query(...),
    year:    int = Query(...),
    month:   int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Build UTC window for the requested month
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, month + 1, 1, tzinfo=timezone.utc)

    entries = (
        db.query(TimeEntry)
        .filter(
            TimeEntry.user_id == user_id,
            TimeEntry.punch_in >= start,
            TimeEntry.punch_in < end,
        )
        .order_by(TimeEntry.punch_in)
        .all()
    )

    def fmt_dt(dt):
        if not dt:
            return ""
        return dt.strftime("%d.%m.%Y %H:%M")

    def fmt_dur(mins):
        if mins is None:
            return ""
        h, m = divmod(mins, 60)
        return f"{h}h {m:02d}min"

    total_minutes = sum(e.duration_minutes or 0 for e in entries)

    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")

    writer.writerow(["Mitarbeiter", user.name])
    writer.writerow(["Zeitraum", f"{month:02d}/{year}"])
    writer.writerow([])
    writer.writerow(["Datum", "Einstempeln", "Ausstempeln", "Dauer", "Mittagspause", "Notiz"])

    for e in entries:
        lunch = ""
        if e.lunch_start and e.lunch_end:
            lunch = f"{e.lunch_start.strftime('%H:%M')} – {e.lunch_end.strftime('%H:%M')}"
        writer.writerow([
            e.punch_in.strftime("%d.%m.%Y") if e.punch_in else "",
            fmt_dt(e.punch_in),
            fmt_dt(e.punch_out) if e.punch_out else "läuft",
            fmt_dur(e.duration_minutes),
            lunch,
            e.note or "",
        ])

    writer.writerow([])
    writer.writerow(["Gesamt", "", "", fmt_dur(total_minutes), ""])

    filename = f"timepunch_{user.username}_{year}-{month:02d}.csv"
    output.seek(0)
    content = "\uFEFF" + output.getvalue()  # BOM for Excel

    return StreamingResponse(
        iter([content.encode("utf-8")]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Dienstplan image ──────────────────────────────────────────────────────────

@router.post("/dienstplan")
async def upload_dienstplan(
    file: UploadFile = File(...),
    _: User = Depends(require_admin),
):
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    for old in UPLOAD_DIR.glob("dienstplan.*"):
        old.unlink()
    dest = UPLOAD_DIR / f"dienstplan.{ext}"
    with open(dest, "wb") as out:
        shutil.copyfileobj(file.file, out)
    return {"ok": True}


@router.get("/dienstplan/image")
async def get_dienstplan_image(
    _: User = Depends(get_current_user),
):
    for f in UPLOAD_DIR.glob("dienstplan.*"):
        return FileResponse(f)
    raise HTTPException(status_code=404, detail="No image uploaded yet")
