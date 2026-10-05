from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta, date
from zoneinfo import ZoneInfo
from pathlib import Path
from typing import List, Optional
import bcrypt
import secrets
import re
import shutil
import csv
import io

from ..database import get_db
from ..models import User, TimeEntry, TimeEntryEdit
from ..schemas import UserOut, TimeEntryOut, UserCreate, LunchRequest
from .auth import require_admin, get_current_user
from .time_entries import WORK_GROUPS, parse_cutoff
from ..email_utils import send_invite_email

VIENNA_TZ  = ZoneInfo("Europe/Vienna")


def _clean_cutoff(value) -> str | None:
    """Normalise to "HH:MM"; anything unparseable clears the override."""
    parsed = parse_cutoff(value)
    return f"{parsed[0]:02d}:{parsed[1]:02d}" if parsed else None


def _clean_group(value) -> str | None:
    """Empty/unknown values mean "no group", which keeps the default restrictions."""
    group = (value or "").strip()
    return group if group in WORK_GROUPS else None


UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

router = APIRouter(prefix="/admin", tags=["admin"])


def _generate_username(last_name: str) -> str:
    result = last_name.lower()
    for char, repl in {'ä':'ae','ö':'oe','ü':'ue','ß':'ss'}.items():
        result = result.replace(char, repl)
    result = re.sub(r'[^a-z0-9]', '', result)
    return result or "user"


def _unique_username(db: Session, base: str) -> str:
    username, counter = base, 2
    while db.query(User).filter(User.username == username).first():
        username = f"{base}{counter}"
        counter += 1
    return username


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=List[UserOut])
def list_all_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return db.query(User).order_by(User.last_name, User.first_name).all()


@router.post("/users", response_model=UserOut)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not payload.first_name.strip() or not payload.last_name.strip():
        raise HTTPException(status_code=400, detail="Vor- und Nachname sind erforderlich")
    if not payload.email and not payload.password:
        raise HTTPException(status_code=400, detail="E-Mail (Einladung) oder Passwort erforderlich")

    first_name = payload.first_name.strip()
    last_name  = payload.last_name.strip()
    full_name  = f"{first_name} {last_name}"

    if payload.username:
        username = payload.username.strip().lower()
    else:
        username = _unique_username(db, _generate_username(last_name))

    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=409, detail="Benutzername bereits vergeben")
    if payload.email:
        if db.query(User).filter(User.email == payload.email.lower()).first():
            raise HTTPException(status_code=409, detail="E-Mail-Adresse bereits vergeben")

    raw_pw = payload.password or secrets.token_urlsafe(16)
    hashed = bcrypt.hashpw(raw_pw.encode(), bcrypt.gensalt()).decode()
    user = User(
        name=full_name,
        first_name=first_name,
        last_name=last_name,
        username=username,
        email=payload.email.lower() if payload.email else None,
        password_hash=hashed,
        is_admin=payload.is_admin,
        work_group=_clean_group(payload.work_group),
        checkin_cutoff=_clean_cutoff(payload.checkin_cutoff),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    if payload.email:
        token = secrets.token_urlsafe(32)
        user.password_reset_token   = token
        user.password_reset_expires = datetime.now(timezone.utc) + timedelta(hours=48)
        db.commit()
        try:
            send_invite_email(user.email, user.name, token)
        except Exception:
            pass

    return user


@router.post("/users/{user_id}/resend-invite")
def resend_invite(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden")
    if not user.email:
        raise HTTPException(status_code=400, detail="Keine E-Mail-Adresse hinterlegt")

    token = secrets.token_urlsafe(32)
    user.password_reset_token   = token
    user.password_reset_expires = datetime.now(timezone.utc) + timedelta(hours=48)
    db.commit()

    # Unlike account creation, the admin explicitly asked for this — report failures.
    try:
        send_invite_email(user.email, user.name, token)
    except Exception:
        raise HTTPException(status_code=502, detail="E-Mail konnte nicht gesendet werden")

    return {"ok": True, "email": user.email}


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
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Passwort muss mindestens 8 Zeichen haben")
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
    if "first_name" in payload or "last_name" in payload:
        if "first_name" in payload:
            user.first_name = payload["first_name"].strip()
        if "last_name" in payload:
            user.last_name = payload["last_name"].strip()
        user.name = f"{user.first_name} {user.last_name}".strip()
    elif "name" in payload:
        user.name = payload["name"].strip()
    if "username" in payload:
        new_username = payload["username"].strip().lower()
        conflict = db.query(User).filter(User.username == new_username, User.id != user_id).first()
        if conflict:
            raise HTTPException(status_code=409, detail="Benutzername bereits vergeben")
        user.username = new_username
    if "email" in payload:
        new_email = (payload["email"] or "").strip().lower() or None
        if new_email:
            conflict = db.query(User).filter(User.email == new_email, User.id != user_id).first()
            if conflict:
                raise HTTPException(status_code=409, detail="E-Mail-Adresse bereits vergeben")
        user.email = new_email
    if "is_admin" in payload:
        user.is_admin = bool(payload["is_admin"])
    if "work_group" in payload:
        user.work_group = _clean_group(payload["work_group"])
    if "checkin_cutoff" in payload:
        user.checkin_cutoff = _clean_cutoff(payload["checkin_cutoff"])
    if "expected_hours" in payload:
        try:
            user.expected_hours = float(payload["expected_hours"])
        except (TypeError, ValueError):
            pass
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
    date_str: Optional[str] = Query(None, alias="date"),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Entries for one Vienna calendar day; defaults to today when no date given."""
    if date_str:
        try:
            day = date.fromisoformat(date_str)
        except ValueError:
            raise HTTPException(status_code=422, detail="Ungültiges Datum (YYYY-MM-DD erwartet)")
    else:
        day = datetime.now(VIENNA_TZ).date()

    start = datetime(day.year, day.month, day.day, tzinfo=VIENNA_TZ)
    end   = start + timedelta(days=1)
    return (
        db.query(TimeEntry)
        .filter(TimeEntry.punch_in >= start, TimeEntry.punch_in < end)
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
    date = entry.punch_in.astimezone(VIENNA_TZ).date()
    try:
        h_s, m_s = map(int, payload.lunch_start.split(":"))
        h_e, m_e = map(int, payload.lunch_end.split(":"))
    except Exception:
        raise HTTPException(status_code=422, detail="Ungültiges Zeitformat")
    # The admin types Vienna wall-clock time; store it as the matching UTC instant.
    ls = datetime(date.year, date.month, date.day, h_s, m_s, tzinfo=VIENNA_TZ).astimezone(timezone.utc)
    le = datetime(date.year, date.month, date.day, h_e, m_e, tzinfo=VIENNA_TZ).astimezone(timezone.utc)
    if le <= ls:
        raise HTTPException(status_code=422, detail="Endzeit muss nach Startzeit liegen")
    entry.lunch_start = ls
    entry.lunch_end   = le
    db.commit()
    return {"ok": True}


@router.patch("/entries/{entry_id}", response_model=TimeEntryOut)
def update_entry_times(
    entry_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Manually correct an entry's punch times, e.g. an employee who forgot to
    clock in. Times are Vienna wall-clock on the entry's existing date."""
    entry = db.query(TimeEntry).filter(TimeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")

    def parse(value: str) -> datetime:
        h, m = map(int, value.split(":"))
        if not (0 <= h <= 23 and 0 <= m <= 59):
            raise ValueError
        date = entry.punch_in.astimezone(VIENNA_TZ).date()
        return datetime(date.year, date.month, date.day, h, m, tzinfo=VIENNA_TZ).astimezone(timezone.utc)

    try:
        new_in  = parse(payload["punch_in"]) if payload.get("punch_in") else entry.punch_in
        raw_out = payload.get("punch_out")
        if raw_out is None:
            new_out = entry.punch_out
        else:
            new_out = parse(raw_out) if raw_out.strip() else None
    except (ValueError, KeyError, AttributeError):
        raise HTTPException(status_code=422, detail="Ungültiges Zeitformat (HH:MM erwartet)")

    if new_out and new_out <= new_in:
        raise HTTPException(status_code=422, detail="Ausstempelzeit muss nach der Einstempelzeit liegen")

    db.add(TimeEntryEdit(
        entry_id=entry.id,
        user_id=entry.user_id,
        edited_by=current_admin.name,
        old_punch_in=entry.punch_in,
        old_punch_out=entry.punch_out,
        new_punch_in=new_in,
        new_punch_out=new_out,
    ))

    entry.punch_in         = new_in
    entry.punch_out        = new_out
    entry.duration_minutes = int((new_out - new_in).total_seconds() / 60) if new_out else None
    entry.edited_at        = datetime.now(timezone.utc)
    entry.edited_by        = current_admin.name
    db.commit()
    db.refresh(entry)
    return entry


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

    # Stored instants are UTC; the Postgres session timezone in the container is
    # UTC too, so convert explicitly or every time reads an hour or two early.
    # Every cell carries a letter ("Uhr", "h", "min") on purpose: a bare "07:00"
    # or "8,0" gets reinterpreted as a time, date or number by the spreadsheet,
    # whereas text containing letters is left exactly as written.
    def fmt_time(dt):
        if not dt:
            return ""
        return dt.astimezone(VIENNA_TZ).strftime("%H:%M") + " Uhr"

    def fmt_dur(mins):
        if mins is None:
            return ""
        h, m = divmod(mins, 60)
        return f"{h}h {m:02d}min"

    def lunch_minutes(e) -> int:
        if not (e.lunch_start and e.lunch_end):
            return 0
        return max(0, int((e.lunch_end - e.lunch_start).total_seconds() / 60))

    def fmt_std(mins) -> str:
        h, m = divmod(mins, 60)
        return f"{h}:{m:02d} Std."

    def fmt_lunch(e) -> str:
        if not (e.lunch_start and e.lunch_end):
            return ""
        return f"{fmt_time(e.lunch_start)} - {fmt_time(e.lunch_end)}"

    total_gross = sum(e.duration_minutes or 0 for e in entries)
    total_lunch = sum(lunch_minutes(e) for e in entries)
    total_net   = max(0, total_gross - total_lunch)
    total_soll  = (user.expected_hours or 0) * len(entries)

    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")

    writer.writerow(["Mitarbeiter", user.name, f"{month:02d}/{year}"])
    writer.writerow([])
    writer.writerow(["Datum", "Einstempeln", "Ausstempeln", "Dauer", "Mittagspause",
                     "SOLL-Arbeitszeit", "IST-Arbeitszeit", "Notiz"])

    for e in entries:
        net = max(0, e.duration_minutes - lunch_minutes(e)) if e.duration_minutes is not None else None
        writer.writerow([
            e.punch_in.astimezone(VIENNA_TZ).strftime("%d.%m.%Y") if e.punch_in else "",
            fmt_time(e.punch_in),
            fmt_time(e.punch_out) if e.punch_out else "läuft",
            fmt_dur(e.duration_minutes),
            fmt_lunch(e),
            fmt_std(round((user.expected_hours or 0) * 60)),
            fmt_std(net) if net is not None else "",
            e.note or "",
        ])

    writer.writerow([])
    writer.writerow(["Gesamt", "", "", fmt_dur(total_gross), fmt_dur(total_lunch),
                     fmt_std(round(total_soll * 60)), fmt_std(total_net), ""])

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
