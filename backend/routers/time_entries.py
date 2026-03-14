from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List, Optional

from ..database import get_db
from ..models import User, TimeEntry
from ..schemas import PunchResponse, PunchRequest, TimeEntryOut, UserOut, UserCreate
from .auth import get_current_user

router = APIRouter(prefix="/users", tags=["users"])


# ── User management ───────────────────────────────────────────────────────────

@router.get("/", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db)):
    return db.query(User).all()


@router.get("/active", response_model=List[UserOut])
def list_active_users(db: Session = Depends(get_db)):
    """Returns all users who are currently clocked in."""
    active_user_ids = (
        db.query(TimeEntry.user_id)
        .filter(TimeEntry.punch_out.is_(None))
        .distinct()
        .all()
    )
    ids = [row[0] for row in active_user_ids]
    return db.query(User).filter(User.id.in_(ids)).all()


# ── Punch in / out ────────────────────────────────────────────────────────────

@router.post("/punch", response_model=PunchResponse)
def punch(
    payload: PunchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Toggle punch state for the authenticated user.
    - No open entry      → punch IN
    - Open entry exists  → punch OUT (saves optional note + duration)
    """
    open_entry = (
        db.query(TimeEntry)
        .filter(TimeEntry.user_id == current_user.id, TimeEntry.punch_out.is_(None))
        .first()
    )

    now = datetime.now(timezone.utc)

    if open_entry is None:
        entry = TimeEntry(user_id=current_user.id, punch_in=now)
        db.add(entry)
        db.commit()
        db.refresh(entry)
        return PunchResponse(action="punched_in", user_id=current_user.id, entry=entry)
    else:
        duration = int((now - open_entry.punch_in.replace(tzinfo=timezone.utc)).total_seconds() / 60)
        open_entry.punch_out = now
        open_entry.duration_minutes = duration
        open_entry.note = payload.note  # may be None — that's fine
        db.commit()
        db.refresh(open_entry)
        return PunchResponse(action="punched_out", user_id=current_user.id, entry=open_entry)


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
