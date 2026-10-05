from sqlalchemy import Column, Integer, String, DateTime, Date, ForeignKey, Boolean, Float, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base


class User(Base):
    __tablename__ = "users"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String, nullable=False)
    first_name = Column(String, nullable=False, server_default="")
    last_name  = Column(String, nullable=False, server_default="")
    username   = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=True)
    password_hash = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True, nullable=False, server_default="true")
    token_version          = Column(Integer, default=0, nullable=False, server_default="0")
    last_login_at          = Column(DateTime(timezone=True), nullable=True)
    password_reset_token   = Column(String, nullable=True)
    password_reset_expires = Column(DateTime(timezone=True), nullable=True)
    password_reset_sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at             = Column(DateTime(timezone=True), server_default=func.now())
    failed_login_attempts  = Column(Integer, default=0, nullable=False, server_default="0")
    locked_until           = Column(DateTime(timezone=True), nullable=True)
    expected_hours         = Column(Float, default=8.0, nullable=False, server_default="8.0")
    work_group             = Column(String, nullable=True)  # "group" is reserved in SQL
    # "HH:MM" Vienna time. Overrides both the 09:05 default and the group rule.
    checkin_cutoff         = Column(String, nullable=True)

    time_entries = relationship("TimeEntry", back_populates="user")


class TimeEntry(Base):
    __tablename__ = "time_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    punch_in = Column(DateTime(timezone=True), nullable=False)
    punch_out = Column(DateTime(timezone=True), nullable=True)  # null = currently active
    duration_minutes = Column(Integer, nullable=True)
    note        = Column(String, nullable=True)
    lunch_start = Column(DateTime(timezone=True), nullable=True)
    lunch_end   = Column(DateTime(timezone=True), nullable=True)
    # Audit trail for manual corrections. The admin's name is denormalised so the
    # record survives that admin later being deleted.
    edited_at   = Column(DateTime(timezone=True), nullable=True)
    edited_by   = Column(String, nullable=True)

    user = relationship("User", back_populates="time_entries")


class TimeEntryEdit(Base):
    """Full history of manual punch-time corrections. Written on every edit and
    never shown in the app — the UI only displays the latest change. Read it with
    the query in the README when a correction needs to be reconstructed."""
    __tablename__ = "time_entry_edits"

    id             = Column(Integer, primary_key=True, index=True)
    entry_id       = Column(Integer, index=True, nullable=False)  # no FK: survives entry deletion
    user_id        = Column(Integer, nullable=False)
    edited_at      = Column(DateTime(timezone=True), server_default=func.now())
    edited_by      = Column(String, nullable=True)
    old_punch_in   = Column(DateTime(timezone=True), nullable=True)
    old_punch_out  = Column(DateTime(timezone=True), nullable=True)
    new_punch_in   = Column(DateTime(timezone=True), nullable=True)
    new_punch_out  = Column(DateTime(timezone=True), nullable=True)


class ShiftCell(Base):
    __tablename__ = "shift_cells"
    __table_args__ = (UniqueConstraint("date", "role", name="uq_shift_cell"),)

    id          = Column(Integer, primary_key=True, index=True)
    date        = Column(Date, nullable=False, index=True)
    role        = Column(String, nullable=False)
    worker_name = Column(String, nullable=True)


class WeekNote(Base):
    __tablename__ = "week_notes"

    id         = Column(Integer, primary_key=True, index=True)
    week_start = Column(Date, nullable=False, unique=True)
    note       = Column(String, nullable=True)


class Message(Base):
    __tablename__ = "messages"

    id           = Column(Integer, primary_key=True, index=True)
    sender_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # NULL = to admin
    body         = Column(String, nullable=False)
    sent_at      = Column(DateTime(timezone=True), server_default=func.now())
    is_read      = Column(Boolean, default=False)

    sender    = relationship("User", foreign_keys=[sender_id])
    recipient = relationship("User", foreign_keys=[recipient_id])
