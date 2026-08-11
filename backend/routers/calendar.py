from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import date, timedelta

from ..database import get_db
from ..models import ShiftCell, WeekNote, User
from .auth import require_admin, get_current_user

router = APIRouter(prefix="/admin/calendar", tags=["calendar"])


def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


@router.get("/workers")
def get_calendar_workers(
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    workers = (
        db.query(User)
        .filter(User.is_admin == False)
        .order_by(User.last_name, User.first_name)
        .all()
    )
    return [{"username": u.username, "first_name": u.first_name, "last_name": u.last_name} for u in workers]


@router.get("/week")
def get_week(
    date_str: str = Query(..., alias="date"),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    monday = _monday(date.fromisoformat(date_str))
    sunday = monday + timedelta(days=6)

    cells = db.query(ShiftCell).filter(
        ShiftCell.date >= monday,
        ShiftCell.date <= sunday,
    ).all()

    note_row = db.query(WeekNote).filter(WeekNote.week_start == monday).first()

    return {
        "week_start": monday.isoformat(),
        "cells": [
            {"date": c.date.isoformat(), "role": c.role, "worker_name": c.worker_name or ""}
            for c in cells
        ],
        "note": note_row.note if note_row else "",
    }


@router.put("/cell")
def set_cell(
    payload: dict,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    d    = date.fromisoformat(payload["date"])
    role = payload["role"]
    name = (payload.get("worker_name") or "").strip()

    cell = db.query(ShiftCell).filter(ShiftCell.date == d, ShiftCell.role == role).first()
    if cell:
        cell.worker_name = name or None
    else:
        db.add(ShiftCell(date=d, role=role, worker_name=name or None))
    db.commit()
    return {"ok": True}


@router.put("/note")
def set_note(
    payload: dict,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    monday = _monday(date.fromisoformat(payload["week_start"]))
    note   = (payload.get("note") or "").strip() or None

    row = db.query(WeekNote).filter(WeekNote.week_start == monday).first()
    if row:
        row.note = note
    else:
        db.add(WeekNote(week_start=monday, note=note))
    db.commit()
    return {"ok": True}
