from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone, date as date_cls
from typing import List, Optional
from zoneinfo import ZoneInfo
import ipaddress
import os

from ..database import get_db
from ..models import User, TimeEntry
from ..schemas import TimeEntryOut, LunchRequest
from .auth import get_current_user

router = APIRouter(prefix="/users", tags=["users"])

OFFICE_NETWORKS = os.environ.get("OFFICE_NETWORKS", "")
BUERO_NETWORKS  = os.environ.get("BUERO_NETWORKS", "")
VIENNA_TZ       = ZoneInfo("Europe/Vienna")

# Any group may punch at any time. Location differs per group:
#   Homeoffice        — anywhere
#   Kirchenmeisteramt — Stephansdom WLAN or the Büro network
#   everyone else     — Stephansdom WLAN only
WORK_GROUPS   = ("Domführer", "Aufsicht", "Mesner", "Kirchenmeisteramt", "Homeoffice")
REMOTE_GROUPS = ("Homeoffice",)
BUERO_GROUPS  = ("Kirchenmeisteramt",)

# Employees now enter their own time windows, so the location check is off.
# Set to True to re-enable it; OFFICE_NETWORKS / BUERO_NETWORKS still apply.
NETWORK_RESTRICTION_ENABLED = False


def _in_networks(client_ip: str, cidrs: str) -> bool:
    if not cidrs:
        return False
    try:
        addr = ipaddress.ip_address(client_ip)
        # nginx listens on IPv6, so an IPv4 client can arrive as ::ffff:1.2.3.4,
        # which would never match a configured IPv4 range.
        if getattr(addr, "ipv4_mapped", None):
            addr = addr.ipv4_mapped
        for cidr in cidrs.split(","):
            net = ipaddress.ip_network(cidr.strip(), strict=False)
            if addr.version == net.version and addr in net:
                return True
    except ValueError:
        pass
    return False


def _may_punch_from(client_ip: str, group: str) -> bool:
    if not OFFICE_NETWORKS:
        return True  # restriction disabled (local dev)
    if group in REMOTE_GROUPS:
        return True
    allowed = OFFICE_NETWORKS
    if group in BUERO_GROUPS and BUERO_NETWORKS:
        allowed = f"{OFFICE_NETWORKS},{BUERO_NETWORKS}"
    return _in_networks(client_ip, allowed)


def _to_utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


# ── Status & history ──────────────────────────────────────────────────────────

@router.get("/status")
def get_my_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Is the current user clocked in? Returns open entry if so."""
    open_entry = (
        db.query(TimeEntry)
        .filter(TimeEntry.user_id == current_user.id, TimeEntry.punch_out.is_(None))
        .first()
    )
    return {
        "user_id": current_user.id,
        "clocked_in": open_entry is not None,
        "punch_in": open_entry.punch_in if open_entry else None,
    }


@router.post("/lunch", response_model=TimeEntryOut)
def set_lunch(
    payload: LunchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = datetime.now(VIENNA_TZ).date()
    entry = (
        db.query(TimeEntry)
        .filter(
            TimeEntry.user_id == current_user.id,
            TimeEntry.punch_in >= datetime(today.year, today.month, today.day, tzinfo=VIENNA_TZ),
        )
        .order_by(TimeEntry.punch_in.desc())
        .first()
    )
    if not entry:
        raise HTTPException(status_code=400, detail="Kein Arbeitseintrag für heute gefunden")
    try:
        h_s, m_s = map(int, payload.lunch_start.split(":"))
        h_e, m_e = map(int, payload.lunch_end.split(":"))
    except Exception:
        raise HTTPException(status_code=422, detail="Ungültiges Zeitformat (HH:MM erwartet)")
    if not (0 <= h_s <= 23 and 0 <= m_s <= 59 and 0 <= h_e <= 23 and 0 <= m_e <= 59):
        raise HTTPException(status_code=422, detail="Ungültige Uhrzeit")
    # The employee types Vienna wall-clock time; store it as the matching UTC instant.
    ls = datetime(today.year, today.month, today.day, h_s, m_s, tzinfo=VIENNA_TZ).astimezone(timezone.utc)
    le = datetime(today.year, today.month, today.day, h_e, m_e, tzinfo=VIENNA_TZ).astimezone(timezone.utc)
    if le <= ls:
        raise HTTPException(status_code=422, detail="Endzeit muss nach Startzeit liegen")
    entry.lunch_start = ls
    entry.lunch_end   = le
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/entries", response_model=List[TimeEntryOut])
def get_my_entries(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Today's time entries for the authenticated user."""
    today = datetime.now(timezone.utc).date()
    return (
        db.query(TimeEntry)
        .filter(
            TimeEntry.user_id == current_user.id,
            TimeEntry.punch_in >= datetime(today.year, today.month, today.day, tzinfo=timezone.utc),
        )
        .order_by(TimeEntry.punch_in.desc())
        .all()
    )


# ── Employees record their own time windows (today only) ─────────────────────

def _today_vienna() -> date_cls:
    return datetime.now(VIENNA_TZ).date()


def _parse_window(day, raw_in: str, raw_out: str):
    """"HH:MM" pair on `day` (Vienna) -> (start_utc, end_utc)."""
    def one(value: str) -> datetime:
        h, m = map(int, (value or "").strip().split(":"))
        if not (0 <= h <= 23 and 0 <= m <= 59):
            raise ValueError
        return datetime(day.year, day.month, day.day, h, m, tzinfo=VIENNA_TZ).astimezone(timezone.utc)

    try:
        start, end = one(raw_in), one(raw_out)
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=422, detail="Ungültige Uhrzeit (HH:MM erwartet)")
    if end <= start:
        raise HTTPException(status_code=422, detail="Die Endzeit muss nach der Startzeit liegen")
    return start, end


def _own_today_entry(entry_id: int, user: User, db: Session) -> TimeEntry:
    """An employee may only touch their own entries, and only today's."""
    entry = db.query(TimeEntry).filter(
        TimeEntry.id == entry_id, TimeEntry.user_id == user.id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    if _to_utc(entry.punch_in).astimezone(VIENNA_TZ).date() != _today_vienna():
        raise HTTPException(
            status_code=403,
            detail="Nur die heutigen Zeiten können geändert werden. Bitte den Administrator kontaktieren.",
        )
    return entry


def _assert_no_overlap(user: User, db: Session, start, end, exclude_id=None) -> None:
    """Overlapping windows would double-count hours, so they are almost always
    a typo rather than an intent."""
    day = start.astimezone(VIENNA_TZ).date()
    day_start = datetime(day.year, day.month, day.day, tzinfo=VIENNA_TZ).astimezone(timezone.utc)
    others = db.query(TimeEntry).filter(
        TimeEntry.user_id == user.id,
        TimeEntry.punch_in >= day_start,
        TimeEntry.punch_in < day_start + timedelta(days=1),
    ).all()
    for other in others:
        if exclude_id and other.id == exclude_id:
            continue
        o_start = _to_utc(other.punch_in)
        o_end   = _to_utc(other.punch_out) if other.punch_out else o_start
        if start < o_end and o_start < end:
            o_in  = o_start.astimezone(VIENNA_TZ).strftime("%H:%M")
            o_out = o_end.astimezone(VIENNA_TZ).strftime("%H:%M")
            raise HTTPException(
                status_code=409,
                detail=f"Überschneidet sich mit {o_in}–{o_out} Uhr",
            )


@router.post("/entries", response_model=TimeEntryOut)
def create_own_entry(
    request: Request,
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Location check, currently disabled. Flip NETWORK_RESTRICTION_ENABLED to
    # restrict where employees may record their hours; the group rules
    # (Homeoffice / Kirchenmeisteramt) still apply exactly as before.
    if NETWORK_RESTRICTION_ENABLED and not current_user.is_admin:
        group     = (current_user.work_group or "").strip()
        client_ip = request.headers.get("X-Real-IP") or request.client.host
        if not _may_punch_from(client_ip, group):
            raise HTTPException(
                status_code=403,
                detail="Zeiterfassung nur im Büro-Netzwerk oder im Stephansdom-WLAN möglich."
                       if group in BUERO_GROUPS else
                       "Zeiterfassung nur im Stephansdom-WLAN möglich.",
            )

    day = _today_vienna()
    start, end = _parse_window(day, payload.get("punch_in"), payload.get("punch_out"))
    _assert_no_overlap(current_user, db, start, end)

    entry = TimeEntry(
        user_id=current_user.id,
        punch_in=start,
        punch_out=end,
        duration_minutes=int((end - start).total_seconds() / 60),
        note=(payload.get("note") or "").strip() or None,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.patch("/entries/{entry_id}", response_model=TimeEntryOut)
def update_own_entry(
    entry_id: int,
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = _own_today_entry(entry_id, current_user, db)
    day   = _to_utc(entry.punch_in).astimezone(VIENNA_TZ).date()
    start, end = _parse_window(day, payload.get("punch_in"), payload.get("punch_out"))
    _assert_no_overlap(current_user, db, start, end, exclude_id=entry.id)

    entry.punch_in         = start
    entry.punch_out        = end
    entry.duration_minutes = int((end - start).total_seconds() / 60)
    if "note" in payload:
        entry.note = (payload.get("note") or "").strip() or None
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/entries/{entry_id}")
def delete_own_entry(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = _own_today_entry(entry_id, current_user, db)
    db.delete(entry)
    db.commit()
    return {"ok": True}
