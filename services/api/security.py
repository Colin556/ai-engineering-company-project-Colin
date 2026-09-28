"""Password hashing and JWT signing helpers.

Passwords are hashed with bcrypt (libpass, a maintained passlib fork) and are
never stored or compared in plain text. Tokens are stateless: no server-side
session is kept.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.hash import bcrypt

from config import ACCESS_TOKEN_EXPIRE_MINUTES, ALGORITHM, SECRET_KEY

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
