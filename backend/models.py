from sqlalchemy import Column, Integer, String, DateTime, Date, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=True)
    password_hash = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    token_version          = Column(Integer, default=0, nullable=False, server_default="0")
    last_login_at          = Column(DateTime(timezone=True), nullable=True)
    password_reset_token   = Column(String, nullable=True)
    password_reset_expires = Column(DateTime(timezone=True), nullable=True)
    created_at             = Column(DateTime(timezone=True), server_default=func.now())

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

    user = relationship("User", back_populates="time_entries")


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

    id         = Column(Integer, primary_key=True, index=True)
    sender_id  = Column(Integer, ForeignKey("users.id"), nullable=False)
    body       = Column(String, nullable=False)
    sent_at    = Column(DateTime(timezone=True), server_default=func.now())
    is_read    = Column(Boolean, default=False)

    sender = relationship("User")
