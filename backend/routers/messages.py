from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import Message, User
from ..schemas import MessageCreate, MessageOut, AdminMessageSend
from .auth import get_current_user, require_admin

EMPLOYEE_MSG_TTL_DAYS = 14

router = APIRouter(prefix="/messages", tags=["messages"])


def _msg_out(m: Message) -> MessageOut:
    return MessageOut(
        id=m.id,
        sender_id=m.sender_id,
        sender_name=m.sender.name if m.sender else "?",
        recipient_id=m.recipient_id,
        body=m.body,
        sent_at=m.sent_at,
        is_read=m.is_read,
    )


# ── Employee → Admin ──────────────────────────────────────────────────────────

@router.post("", status_code=201)
def send_message(
    payload: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="Nachricht darf nicht leer sein")
    msg = Message(sender_id=current_user.id, recipient_id=None, body=payload.body.strip())
    db.add(msg)
    db.commit()
    return {"ok": True}


@router.get("", response_model=List[MessageOut])
def list_messages(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    q = db.query(Message).filter(Message.recipient_id.is_(None))
    if current_admin.admin_scope:
        q = q.filter(Message.sender_id.in_(
            [u.id for u in db.query(User).filter(User.work_group == current_admin.admin_scope).all()]
        ))
    msgs = (
        q
        .order_by(Message.sent_at.desc())
        .all()
    )
    return [_msg_out(m) for m in msgs]


# ── Admin → Employee ──────────────────────────────────────────────────────────

@router.post("/admin-send", status_code=201)
def admin_send_message(
    payload: AdminMessageSend,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="Nachricht darf nicht leer sein")
    q = db.query(User)
    if payload.recipient_ids:
        q = q.filter(User.id.in_(payload.recipient_ids))
    else:
        q = q.filter(User.is_admin == False, User.is_active == True)
    if admin.admin_scope:
        q = q.filter(User.work_group == admin.admin_scope)
    recipients = q.all()
    for r in recipients:
        db.add(Message(sender_id=admin.id, recipient_id=r.id, body=payload.body.strip()))
    db.commit()
    return {"ok": True}


# ── Employee inbox (messages sent TO them by admin) ───────────────────────────

@router.get("/mine", response_model=List[MessageOut])
def my_messages(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cutoff = datetime.now(timezone.utc) - timedelta(days=EMPLOYEE_MSG_TTL_DAYS)
    db.query(Message).filter(
        Message.recipient_id == current_user.id,
        Message.sent_at < cutoff,
    ).delete(synchronize_session=False)
    db.commit()

    msgs = (
        db.query(Message)
        .filter(Message.recipient_id == current_user.id)
        .order_by(Message.sent_at.desc())
        .all()
    )
    return [_msg_out(m) for m in msgs]


@router.patch("/mine/{message_id}/read")
def mark_mine_read(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    msg = db.query(Message).filter(
        Message.id == message_id, Message.recipient_id == current_user.id
    ).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Nicht gefunden")
    msg.is_read = True
    db.commit()
    return {"ok": True}


@router.delete("/mine/{message_id}")
def delete_mine(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    msg = db.query(Message).filter(
        Message.id == message_id, Message.recipient_id == current_user.id
    ).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Nicht gefunden")
    db.delete(msg)
    db.commit()
    return {"ok": True}


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
