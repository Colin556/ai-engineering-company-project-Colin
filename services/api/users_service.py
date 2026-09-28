"""User service layer (TinyDB).

Only credentials live on the user document: id, email, hashed_password,
is_active, role and created_at. Display name and contact data belong to Profile.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from tinydb import Query

from database import db_lock, users_table
from models import Role
from profiles_service import create_profile, delete_profile_by_user_id
from security import hash_password, verify_password

UserQuery = Query()


class EmailAlreadyRegisteredError(Exception):
    """Raised when an email is already taken by another user."""


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def get_user_by_email(email: str) -> dict | None:
    with db_lock:
        return users_table.get(UserQuery.email == _normalize_email(email))


def get_user_by_id(user_id: str) -> dict | None:
    with db_lock:
        return users_table.get(UserQuery.id == user_id)


def list_users() -> list[dict]:
    with db_lock:
        return list(users_table.all())


def create_user(
    email: str,
    password: str,
    role: Role = Role.USER,
    name: str | None = None,
    phone: str | None = None,
    address: str | None = None,
) -> dict:
    normalized = _normalize_email(email)
    document = {
        "id": str(uuid.uuid4()),
        "email": normalized,
        "hashed_password": hash_password(password),
        "is_active": True,
        "role": Role(role).value,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    with db_lock:
        if users_table.get(UserQuery.email == normalized) is not None:
            raise EmailAlreadyRegisteredError(normalized)
        users_table.insert(document)

    create_profile(document["id"], name=name, phone=phone, address=address)
    return document


def update_user(user_id: str, changes: dict) -> dict | None:
    """Apply credential changes. `password` is hashed before being stored."""
    payload = dict(changes)

    if "password" in payload:
        payload["hashed_password"] = hash_password(payload.pop("password"))
    if "email" in payload:
        payload["email"] = _normalize_email(payload["email"])
    if "role" in payload:
        payload["role"] = Role(payload["role"]).value

    with db_lock:
        current = users_table.get(UserQuery.id == user_id)
        if current is None:
            return None
        if not payload:
            return current

        new_email = payload.get("email")
        if new_email and new_email != current["email"]:
            if users_table.get(UserQuery.email == new_email) is not None:
                raise EmailAlreadyRegisteredError(new_email)

        users_table.update(payload, UserQuery.id == user_id)
        return users_table.get(UserQuery.id == user_id)


def delete_user(user_id: str) -> bool:
    with db_lock:
        if users_table.get(UserQuery.id == user_id) is None:
            return False
        users_table.remove(UserQuery.id == user_id)

    delete_profile_by_user_id(user_id)
    return True


def authenticate_user(email: str, password: str) -> dict | None:
    user = get_user_by_email(email)
    if user is None:
        # Hash a dummy value so wrong-email and wrong-password cost the same time.
        hash_password("invalid-password-placeholder")
        return None
    if not verify_password(password, user["hashed_password"]):
        return None
    return user
