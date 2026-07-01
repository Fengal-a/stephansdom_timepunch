from fastapi import APIRouter, Request, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import Annotated
import os
import secrets
import jwt
import bcrypt

from ..database import get_db
from ..models import User
from ..schemas import UserOut
from ..email_utils import send_reset_email

router = APIRouter(prefix="/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)

# ── Config ────────────────────────────────────────────────────────────────────
SECRET_KEY = os.environ.get("SECRET_KEY", "change-this-to-a-random-secret-in-production")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 12

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# ── Helpers ───────────────────────────────────────────────────────────────────

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def create_token(user_id: int, is_admin: bool, token_version: int) -> str:
    payload = {
        "sub": str(user_id),
        "is_admin": is_admin,
        "tv": token_version,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ── Auth dependency (use in protected routes) ─────────────────────────────────

def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Session = Depends(get_db),
) -> User:
    payload = decode_token(token)
    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if payload.get("tv") != user.token_version:
        raise HTTPException(status_code=401, detail="Session expired")
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/login")
@limiter.limit("5/minute")  # limit login attempts to prevent brute-force
def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.username == form.username).first()
    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    now = datetime.now(timezone.utc)
    if user.last_login_at is not None:
        session_expires = user.last_login_at + timedelta(hours=TOKEN_EXPIRE_HOURS)
        if session_expires > now:
            raise HTTPException(status_code=409, detail="Der Account wird bereits verwendet.")

    user.token_version += 1
    user.last_login_at = now
    db.commit()
    token = create_token(user.id, user.is_admin, user.token_version)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "is_admin": user.is_admin,
        },
    }


@router.post("/logout")
def logout(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.last_login_at = None
    current_user.token_version += 1
    db.commit()
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/forgot-password")
def forgot_password(payload: dict, db: Session = Depends(get_db)):
    email = (payload.get("email") or "").strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if user:
        token = secrets.token_urlsafe(32)
        user.password_reset_token   = token
        user.password_reset_expires = datetime.now(timezone.utc) + timedelta(hours=1)
        db.commit()
        try:
            send_reset_email(user.email, user.name, token)
        except Exception:
            pass
    # Always return ok — don't reveal whether the email exists
    return {"ok": True}


@router.post("/reset-password")
def reset_password(payload: dict, db: Session = Depends(get_db)):
    token    = (payload.get("token") or "").strip()
    password = (payload.get("password") or "").strip()
    if not token or len(password) < 4:
        raise HTTPException(status_code=400, detail="Ungültige Anfrage")
    user = db.query(User).filter(User.password_reset_token == token).first()
    if not user or not user.password_reset_expires:
        raise HTTPException(status_code=400, detail="Ungültiger oder abgelaufener Link")
    if user.password_reset_expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Dieser Link ist abgelaufen")
    user.password_hash           = hash_password(password)
    user.password_reset_token    = None
    user.password_reset_expires  = None
    user.token_version          += 1
    user.last_login_at           = None
    db.commit()
    return {"ok": True}
