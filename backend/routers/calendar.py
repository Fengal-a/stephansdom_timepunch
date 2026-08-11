from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import date

from ..database import get_db
from ..models import ShiftEvent
from .auth import require_admin

router = APIRouter(prefix="/admin/calendar", tags=["calendar"])


@router.get("/events")
def get_events(
    year:  int = Query(...),
    month: int = Query(...),
    db:    Session = Depends(get_db),
    _=Depends(require_admin),
):
    start = date(year, month, 1)
    end   = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    events = (
        db.query(ShiftEvent)
        .filter(ShiftEvent.date >= start, ShiftEvent.date < end)
        .order_by(ShiftEvent.date, ShiftEvent.id)
        .all()
    )
    return [
        {"id": e.id, "date": e.date.isoformat(), "title": e.title, "color": e.color}
        for e in events
    ]


@router.post("/events")
def create_event(
    payload: dict,
    db:      Session = Depends(get_db),
    _=Depends(require_admin),
):
    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Titel erforderlich")
    event = ShiftEvent(
        date=date.fromisoformat(payload["date"]),
        title=title,
        color=payload.get("color", "#F5620F"),
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return {"id": event.id, "date": event.date.isoformat(), "title": event.title, "color": event.color}


@router.delete("/events/{event_id}")
def delete_event(
    event_id: int,
    db:       Session = Depends(get_db),
    _=Depends(require_admin),
):
    event = db.query(ShiftEvent).filter(ShiftEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    db.delete(event)
    db.commit()
    return {"ok": True}
