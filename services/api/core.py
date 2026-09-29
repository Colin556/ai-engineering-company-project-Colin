"""Shared infrastructure: environment config, TinyDB storage and security helpers.

Passwords are hashed with bcrypt (libpass, a maintained passlib fork) and are
never stored or compared in plain text. Tokens are stateless JWTs: no
server-side session is kept.
"""

from __future__ import annotations

import os
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

db_lock = RLock()

# ---------- Security ----------

BCRYPT_ROUNDS = 12


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
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    return jwt.encode(claims, SECRET_KEY, algorithm=ALGORITHM), minutes * 60


def decode_access_token(token: str) -> dict | None:
    """Return the token claims, or None when the token is invalid or expired."""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
