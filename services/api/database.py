"""TinyDB authentication client and request-scoped SQLModel inventory sessions."""

from __future__ import annotations

import os
from collections.abc import Iterator
from urllib.parse import urlsplit

from fastapi import HTTPException
from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine

from core import db as auth_db
from models import Ingredient, IngredientEntry, IngredientExit


def postgresql_url(url: str) -> str:
    parsed = urlsplit(url)
    if parsed.scheme not in {"postgres", "postgresql", "postgresql+psycopg2"}:
        raise ValueError("DATABASE_URL must use a PostgreSQL URI with the psycopg2 driver.")
    return parsed._replace(scheme="postgresql+psycopg2").geturl()


DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
IS_SQLITE = DATABASE_URL.startswith("sqlite:")

if IS_SQLITE and os.getenv("APP_ENV", "development") != "development":
    raise RuntimeError("SQLite is only supported for local development. Configure PostgreSQL.")

engine = (
    create_engine(
        DATABASE_URL if IS_SQLITE else postgresql_url(DATABASE_URL),
        pool_pre_ping=True,
        isolation_level="SERIALIZABLE" if IS_SQLITE else "READ COMMITTED",
        connect_args=(
            {"check_same_thread": False}
            if IS_SQLITE
            else {"sslmode": "require", "connect_timeout": 10}
        ),
    )
    if DATABASE_URL
    else None
)

if IS_SQLITE and engine is not None:
    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")


def initialize_inventory() -> None:
    if engine is None:
        raise RuntimeError("DATABASE_URL must be configured with the Supabase PostgreSQL URI.")
    SQLModel.metadata.create_all(engine)


def get_db() -> Iterator[Session]:
    if engine is None:
        raise HTTPException(status_code=503, detail="Inventory database is not configured.")
    with Session(engine, expire_on_commit=False) as session:
        yield session