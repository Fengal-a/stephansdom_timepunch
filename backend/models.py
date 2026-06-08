from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
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
    created_at = Column(DateTime(timezone=True), server_default=func.now())

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


class Message(Base):
    __tablename__ = "messages"

    id         = Column(Integer, primary_key=True, index=True)
    sender_id  = Column(Integer, ForeignKey("users.id"), nullable=False)
    body       = Column(String, nullable=False)
    sent_at    = Column(DateTime(timezone=True), server_default=func.now())
    is_read    = Column(Boolean, default=False)

    sender = relationship("User")
