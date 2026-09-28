"""Profile service layer (TinyDB)."""

from __future__ import annotations

import uuid

from tinydb import Query

from database import db_lock, profiles_table

ProfileQuery = Query()


def create_profile(
    user_id: str,
    name: str | None = None,
    phone: str | None = None,
    address: str | None = None,
) -> dict:
    document = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "name": name,
        "phone": phone,
        "address": address,
    }
    with db_lock:
        profiles_table.insert(document)
    return document


def get_profile_by_user_id(user_id: str) -> dict | None:
    with db_lock:
        return profiles_table.get(ProfileQuery.user_id == user_id)


def update_profile(user_id: str, changes: dict) -> dict | None:
    if not changes:
        return get_profile_by_user_id(user_id)

    with db_lock:
        if profiles_table.get(ProfileQuery.user_id == user_id) is None:
            return None
        profiles_table.update(changes, ProfileQuery.user_id == user_id)
        return profiles_table.get(ProfileQuery.user_id == user_id)


def delete_profile_by_user_id(user_id: str) -> None:
    with db_lock:
        profiles_table.remove(ProfileQuery.user_id == user_id)
