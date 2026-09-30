"""Shared infrastructure: environment config, TinyDB storage and security helpers.

Passwords are hashed with bcrypt (libpass, a maintained passlib fork) and are
never stored or compared in plain text. Tokens are stateless JWTs: no
server-side session is kept.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import RLock

from dotenv import load_dotenv
from jose import JWTError, jwt
from passlib.hash import bcrypt
from tinydb import TinyDB

# ---------- Configuration (see .env.example) ----------

load_dotenv(Path(__file__).parent / ".env")

SECRET_KEY = os.getenv("SECRET_KEY", "").strip()
ALGORITHM = os.getenv("ALGORITHM", "HS256").strip()
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
# Clamped to the 15-60 minute window required for reset links.
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES = min(
    max(int(os.getenv("PASSWORD_RESET_TOKEN_EXPIRE_MINUTES", "30")), 15), 60
)
FRONTEND_BASE_URL = (
    os.getenv("FRONTEND_BASE_URL", "http://localhost:3000").strip().rstrip("/")
)
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
EMAIL_FROM = os.getenv("EMAIL_FROM", "Brasaland <onboarding@resend.dev>").strip()

if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY is not configured. Copy services/api/.env.example to "
        "services/api/.env and set a strong random value."
    )

# ---------- Database ----------

DEFAULT_DB_PATH = Path(__file__).parent / "data" / "suppliers.json"
DB_PATH = Path(os.getenv("SUPPLIERS_DB_PATH", DEFAULT_DB_PATH))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

db = TinyDB(DB_PATH)
suppliers_table = db.table("suppliers")

# Users and profiles live in TinyDB only. PostgreSQL/Supabase tables must never
# hold credentials; they reference the TinyDB user id as `user_uuid`.
users_table = db.table("users")
profiles_table = db.table("profiles")
# One row per outstanding reset link (hashed jti only); deleted once used.
password_reset_tokens_table = db.table("password_reset_tokens")

db_lock = RLock()

# ---------- Security ----------

BCRYPT_ROUNDS = 12

# The `type` claim stops a reset token from being accepted as a session token.
ACCESS_TOKEN_TYPE = "access"
PASSWORD_RESET_TOKEN_TYPE = "password_reset"


def hash_password(password: str) -> str:
    return bcrypt.using(rounds=BCRYPT_ROUNDS).hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.verify(plain_password, hashed_password)
    except (ValueError, TypeError):
        return False


def create_access_token(
    user_id: str, role: str, expires_minutes: int | None = None
) -> tuple[str, int]:
    """Return a signed token and its lifetime in seconds."""
    minutes = ACCESS_TOKEN_EXPIRE_MINUTES if expires_minutes is None else expires_minutes
    issued_at = datetime.now(timezone.utc)
    expires_at = issued_at + timedelta(minutes=minutes)
    claims = {
        "sub": user_id,
        "role": role,
        "type": ACCESS_TOKEN_TYPE,
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    return jwt.encode(claims, SECRET_KEY, algorithm=ALGORITHM), minutes * 60


def _decode_token(token: str, expected_type: str) -> dict | None:
    try:
        claims = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if claims.get("type") != expected_type:
        return None
    return claims


def decode_access_token(token: str) -> dict | None:
    """Return the token claims, or None when the token is invalid or expired."""
    return _decode_token(token, ACCESS_TOKEN_TYPE)


def create_password_reset_token(user_id: str) -> tuple[str, str, datetime]:
    """Return a signed reset token, its unique id (jti) and its expiry."""
    issued_at = datetime.now(timezone.utc)
    expires_at = issued_at + timedelta(minutes=PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)
    jti = uuid.uuid4().hex
    claims = {
        "sub": user_id,
        "type": PASSWORD_RESET_TOKEN_TYPE,
        "jti": jti,
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    return jwt.encode(claims, SECRET_KEY, algorithm=ALGORITHM), jti, expires_at


def decode_password_reset_token(token: str) -> dict | None:
    """Check signature, expiry and type only; single use is enforced in accounts."""
    return _decode_token(token, PASSWORD_RESET_TOKEN_TYPE)
