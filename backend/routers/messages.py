from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import Message, User
from ..schemas import MessageCreate, MessageOut
from .auth import get_current_user, require_admin

router = APIRouter(prefix="/messages", tags=["messages"])


@router.post("", status_code=201)
def send_message(
    payload: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="Nachricht darf nicht leer sein")
    msg = Message(sender_id=current_user.id, body=payload.body.strip())
    db.add(msg)
    db.commit()
    return {"ok": True}


@router.get("", response_model=List[MessageOut])
def list_messages(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    msgs = db.query(Message).order_by(Message.sent_at.desc()).all()
    return [
        MessageOut(
            id=m.id,
            sender_id=m.sender_id,
            sender_name=m.sender.name if m.sender else "?",
            body=m.body,
            sent_at=m.sent_at,
            is_read=m.is_read,
        )
        for m in msgs
    ]


@router.patch("/{message_id}/read")
def mark_read(
    message_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    msg.is_read = True
    db.commit()
    return {"ok": True}


@router.delete("/{message_id}")
def delete_message(
    message_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    db.delete(msg)
    db.commit()
    return {"ok": True}
