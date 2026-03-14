from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List
import bcrypt

from ..database import get_db
from ..models import User, TimeEntry
from ..schemas import UserOut, TimeEntryOut, UserCreate
from .auth import require_admin, get_current_user

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
        duration = int((now - open_entry.punch_in.replace(tzinfo=timezone.utc)).total_seconds() / 60)
        open_entry.punch_out = now
        open_entry.duration_minutes = duration
        db.commit()
        return {"action": "punched_out", "duration_minutes": duration}
