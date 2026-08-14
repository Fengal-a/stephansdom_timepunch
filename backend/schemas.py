from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


# ── User schemas ──────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    first_name: str
    last_name: str
    username: Optional[str] = None
    password: Optional[str] = None
    email: Optional[str] = None
    is_admin: bool = False


class UserOut(BaseModel):
    id: int
    name: str
    first_name: str
    last_name: str
    username: str
    email: Optional[str] = None
    is_admin: bool
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── TimeEntry schemas ─────────────────────────────────────────────────────────

class TimeEntryOut(BaseModel):
    id: int
    user_id: int
    punch_in: datetime
    punch_out: Optional[datetime]
    duration_minutes: Optional[int]
    note: Optional[str]
    lunch_start: Optional[datetime]
    lunch_end: Optional[datetime]

    model_config = {"from_attributes": True}


class PunchRequest(BaseModel):
    note: Optional[str] = None


class LunchRequest(BaseModel):
    lunch_start: str  # "HH:MM"
    lunch_end: str    # "HH:MM"


class PunchResponse(BaseModel):
    action: str  # "punched_in" | "punched_out"
    user_id: int
    entry: TimeEntryOut


# ── Message schemas ───────────────────────────────────────────────────────────

class MessageCreate(BaseModel):
    body: str

class MessageOut(BaseModel):
    id:           int
    sender_id:    int
    sender_name:  str
    recipient_id: Optional[int] = None
    body:         str
    sent_at:      datetime
    is_read:      bool

    model_config = {"from_attributes": True}

class AdminMessageSend(BaseModel):
    recipient_ids: List[int]  # empty list = send to all non-admin employees
    body: str
