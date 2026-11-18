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
import zipfile

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

STYLE_H1   = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=14, leading=17)
STYLE_SUB  = ParagraphStyle("sub", fontName="Helvetica", fontSize=10, leading=13,
                            textColor=colors.HexColor("#555555"))
STYLE_NOTE = ParagraphStyle("note", fontName="Helvetica", fontSize=7.5, leading=9)

from ..database import get_db
from ..models import User, TimeEntry, TimeEntryEdit, Message
from ..schemas import UserOut, TimeEntryOut, UserCreate, LunchRequest
from .auth import require_admin, get_current_user
from .time_entries import WORK_GROUPS
from ..email_utils import send_invite_email

VIENNA_TZ  = ZoneInfo("Europe/Vienna")


def _scoped(query, admin: User):
    """Restrict a User query to the admin's group, if they have one."""
    return query.filter(User.work_group == admin.admin_scope) if admin.admin_scope else query


def _require_scope(admin: User, user: User) -> None:
    """Reject acting on an employee outside the admin's group."""
    if admin.admin_scope and user.work_group != admin.admin_scope:
        raise HTTPException(status_code=403, detail="Kein Zugriff auf diesen Mitarbeiter")


def _require_entry_scope(admin: User, db: Session, entry: TimeEntry) -> None:
    if not admin.admin_scope:
        return
    owner = db.query(User).filter(User.id == entry.user_id).first()
    if not owner or owner.work_group != admin.admin_scope:
        raise HTTPException(status_code=403, detail="Kein Zugriff auf diesen Eintrag")


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
    current_admin: User = Depends(require_admin),
):
    return (
        _scoped(db.query(User), current_admin)
        .order_by(User.last_name, User.first_name)
        .all()
    )


@router.post("/users", response_model=UserOut)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
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

    if current_admin.admin_scope:
        # A scoped admin may only create employees inside their own group,
        # and may not create further admins.
        if payload.is_admin:
            raise HTTPException(status_code=403, detail="Keine Berechtigung, Admins anzulegen")
        payload.work_group = current_admin.admin_scope

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
    current_admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden")
    _require_scope(current_admin, user)
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
    current_admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    _require_scope(current_admin, user)
    new_password = payload.get("password", "").strip()
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Passwort muss mindestens 8 Zeichen haben")
    user.password_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()

    # An admin who sets a password knows it and could sign in as this person,
    # which leaves no trace. Telling the employee makes that detectable.
    when = datetime.now(VIENNA_TZ).strftime("%d.%m.%Y um %H:%M")
    db.add(Message(
        sender_id=current_admin.id,
        recipient_id=user.id,
        body=(f"Ihr Passwort wurde am {when} Uhr von {current_admin.name} neu gesetzt. "
              "Falls Sie darum nicht gebeten haben, melden Sie sich bitte umgehend."),
    ))
    db.commit()
    return {"ok": True}


@router.put("/users/{user_id}")
def update_user(
    user_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    _require_scope(current_admin, user)
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
    if "is_admin" in payload and not current_admin.admin_scope:
        user.is_admin = bool(payload["is_admin"])
    if "admin_scope" in payload and not current_admin.admin_scope:
        user.admin_scope = (payload["admin_scope"] or "").strip() or None
    if "work_group" in payload:
        user.work_group = _clean_group(payload["work_group"])
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
    _require_scope(current_admin, user)
    db.query(TimeEntry).filter(TimeEntry.user_id == user_id).delete()
    db.delete(user)
    db.commit()
    return {"ok": True}


# ── Entries ───────────────────────────────────────────────────────────────────

@router.get("/entries/today", response_model=List[TimeEntryOut])
def get_todays_entries(
    date_str: Optional[str] = Query(None, alias="date"),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
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
    q = db.query(TimeEntry).filter(TimeEntry.punch_in >= start, TimeEntry.punch_in < end)
    if current_admin.admin_scope:
        q = q.filter(TimeEntry.user_id.in_(
            [u.id for u in _scoped(db.query(User), current_admin).all()]
        ))
    return (
        q
        .order_by(TimeEntry.punch_in.desc())
        .all()
    )


@router.post("/entries/{entry_id}/lunch")
def set_lunch_for_entry(
    entry_id: int,
    payload: LunchRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    entry = db.query(TimeEntry).filter(TimeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    _require_entry_scope(current_admin, db, entry)
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


@router.post("/entries", response_model=TimeEntryOut)
def create_entry(
    payload: dict,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Record a day an employee forgot to punch ("nachtragen"). Times are Vienna
    wall-clock on the given date."""
    user = db.query(User).filter(User.id == payload.get("user_id")).first()
    if not user:
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden")
    _require_scope(current_admin, user)
    try:
        day = date.fromisoformat(payload["date"])
    except (ValueError, KeyError, TypeError):
        raise HTTPException(status_code=422, detail="Ungültiges Datum (YYYY-MM-DD erwartet)")

    def parse(value: str) -> datetime:
        h, m = map(int, value.split(":"))
        if not (0 <= h <= 23 and 0 <= m <= 59):
            raise ValueError
        return datetime(day.year, day.month, day.day, h, m, tzinfo=VIENNA_TZ).astimezone(timezone.utc)

    try:
        new_in  = parse(payload["punch_in"])
        raw_out = payload.get("punch_out") or ""
        new_out = parse(raw_out) if raw_out.strip() else None
    except (ValueError, KeyError, AttributeError):
        raise HTTPException(status_code=422, detail="Ungültiges Zeitformat (HH:MM erwartet)")

    if new_out and new_out <= new_in:
        raise HTTPException(status_code=422, detail="Ausstempelzeit muss nach der Einstempelzeit liegen")

    # Two open entries would confuse the punch toggle, which picks "the" open one.
    if new_out is None and db.query(TimeEntry).filter(
        TimeEntry.user_id == user.id, TimeEntry.punch_out.is_(None)
    ).first():
        raise HTTPException(status_code=409, detail="Dieser Mitarbeiter ist bereits eingestempelt")

    entry = TimeEntry(
        user_id=user.id,
        punch_in=new_in,
        punch_out=new_out,
        duration_minutes=int((new_out - new_in).total_seconds() / 60) if new_out else None,
        created_by_admin=True,
        edited_at=datetime.now(timezone.utc),
        edited_by=current_admin.name,
    )
    db.add(entry)
    db.flush()  # need entry.id for the audit row

    db.add(TimeEntryEdit(
        entry_id=entry.id,
        user_id=user.id,
        edited_by=current_admin.name,
        old_punch_in=None,      # no previous values: this day was created, not changed
        old_punch_out=None,
        new_punch_in=new_in,
        new_punch_out=new_out,
    ))
    db.commit()
    db.refresh(entry)
    return entry


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
    _require_entry_scope(current_admin, db, entry)

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
    current_admin: User = Depends(require_admin),
):
    entry = db.query(TimeEntry).filter(TimeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    _require_entry_scope(current_admin, db, entry)
    db.delete(entry)
    db.commit()
    return {"ok": True}


# ── Manual punch for a user ───────────────────────────────────────────────────

# Monthly hours are contractual: weekly hours spread over an average month.
WEEKS_PER_MONTH = 4.35


def _monthly_pdf(user: User, year: int, month: int, db: Session) -> bytes:
    """One employee's monthly sheet, print-ready. PDF rather than CSV so the
    column widths, page size and signature block are fixed — a spreadsheet
    applies its own defaults and cuts content off."""
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    end   = datetime(year + 1, 1, 1, tzinfo=timezone.utc) if month == 12 \
            else datetime(year, month + 1, 1, tzinfo=timezone.utc)

    entries = (
        db.query(TimeEntry)
        .filter(TimeEntry.user_id == user.id,
                TimeEntry.punch_in >= start,
                TimeEntry.punch_in < end)
        .order_by(TimeEntry.punch_in)
        .all()
    )

    def vienna(dt):
        return dt.astimezone(VIENNA_TZ) if dt else None

    def hm(dt):
        d = vienna(dt)
        return d.strftime("%H:%M") if d else ""

    def dur(mins):
        if mins is None:
            return ""
        sign = "-" if mins < 0 else ""
        h, m = divmod(abs(mins), 60)
        return f"{sign}{h}:{m:02d}"

    def lunch_minutes(e) -> int:
        if not (e.lunch_start and e.lunch_end):
            return 0
        return max(0, int((e.lunch_end - e.lunch_start).total_seconds() / 60))

    total_abgerechnet = sum(e.duration_minutes or 0 for e in entries)
    total_lunch       = sum(lunch_minutes(e) for e in entries)
    total_geleistet   = max(0, total_abgerechnet - total_lunch)
    bezahlt           = round((user.expected_hours or 0) * WEEKS_PER_MONTH * 60)
    saldo             = total_geleistet - bezahlt   # positive = Mehrarbeit

    rows = [["Datum", "Von", "Bis", "Abgerechnete\nStunden",
             "Tatsächlich\ngeleistete", "Mittagspause", "Notiz"]]
    for e in entries:
        net = max(0, e.duration_minutes - lunch_minutes(e)) if e.duration_minutes is not None else None
        pause = f"{hm(e.lunch_start)}\u2013{hm(e.lunch_end)}" if (e.lunch_start and e.lunch_end) else ""
        rows.append([
            vienna(e.punch_in).strftime("%d.%m.") if e.punch_in else "",
            hm(e.punch_in),
            hm(e.punch_out) if e.punch_out else "läuft",
            dur(e.duration_minutes),
            dur(net),
            pause,
            Paragraph(e.note, STYLE_NOTE) if e.note else "",
        ])
    rows.append(["Gesamt", "", "", dur(total_abgerechnet), dur(total_geleistet),
                 dur(total_lunch), ""])

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=16 * mm, bottomMargin=16 * mm,
        title=f"Arbeitszeit {user.name} {month:02d}/{year}",
        author="TimePunch",
    )

    table = Table(
        rows, repeatRows=1,
        colWidths=[16 * mm, 14 * mm, 14 * mm, 24 * mm, 24 * mm, 24 * mm, 58 * mm],
    )
    table.setStyle(TableStyle([
        ("FONTNAME",   (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, -1), 8),
        ("LEADING",    (0, 0), (-1, -1), 10),
        ("BACKGROUND", (0, 0), (-1, 0),  colors.HexColor("#E8E8E8")),
        ("LINEBELOW",  (0, 0), (-1, 0),  0.6, colors.black),
        ("FONTNAME",   (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LINEABOVE",  (0, -1), (-1, -1), 0.6, colors.black),
        ("ALIGN",      (1, 0), (5, -1),  "CENTER"),
        ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
        ("GRID",       (0, 0), (-1, -1), 0.25, colors.HexColor("#999999")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#F6F6F6")]),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))

    summary = Table([
        ["Bezahlte Stunden", dur(bezahlt), f"({user.expected_hours or 0:g} h/Woche)"],
        ["Stundensaldo",     dur(saldo),   ""],
    ], colWidths=[40 * mm, 24 * mm, 40 * mm], hAlign="LEFT")
    summary.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN",    (1, 0), (1, -1), "RIGHT"),
        ("TEXTCOLOR",(2, 0), (2, -1), colors.HexColor("#666666")),
        ("TOPPADDING",    (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))

    sign = Table([
        ["Unterschrift Mitarbeiter:", "", "Unterschrift Kirchenmeister:", ""],
    ], colWidths=[44 * mm, 40 * mm, 48 * mm, 42 * mm], hAlign="LEFT")
    sign.setStyle(TableStyle([
        ("FONTSIZE",  (0, 0), (-1, -1), 9),
        ("LINEBELOW", (1, 0), (1, 0), 0.5, colors.black),
        ("LINEBELOW", (3, 0), (3, 0), 0.5, colors.black),
        ("VALIGN",    (0, 0), (-1, -1), "BOTTOM"),
    ]))

    MONTHS_DE = ["Jänner", "Februar", "März", "April", "Mai", "Juni",
                 "Juli", "August", "September", "Oktober", "November", "Dezember"]
    doc.build([
        Paragraph(f"Arbeitszeitnachweis – {user.name}", STYLE_H1),
        Paragraph(f"{MONTHS_DE[month - 1]} {year}", STYLE_SUB),
        Spacer(1, 6 * mm),
        table,
        Spacer(1, 6 * mm),
        summary,
        Spacer(1, 16 * mm),
        sign,
    ])
    return buf.getvalue()


@router.get("/export/monthly")
def export_monthly(
    user_id: int = Query(...),
    year:    int = Query(...),
    month:   int = Query(...),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden")
    _require_scope(current_admin, user)

    filename = f"Arbeitszeit_{user.username}_{year}-{month:02d}.pdf"
    return StreamingResponse(
        iter([_monthly_pdf(user, year, month, db)]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/monthly/all")
def export_monthly_all(
    year:  int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Every employee's monthly sheet in one ZIP (respects a group-limited admin)."""
    users = (
        _scoped(db.query(User), current_admin)
        .filter(User.is_admin == False)
        .order_by(User.last_name, User.first_name)
        .all()
    )
    if not users:
        raise HTTPException(status_code=404, detail="Keine Mitarbeiter vorhanden")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for u in users:
            zf.writestr(f"Arbeitszeit_{u.username}_{year}-{month:02d}.pdf",
                        _monthly_pdf(u, year, month, db))
    buf.seek(0)

    filename = f"Arbeitszeit_alle_{year}-{month:02d}.zip"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/zip",
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
