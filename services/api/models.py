"""SQLModel inventory tables. Authentication remains exclusively in TinyDB."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlmodel import Field, SQLModel
from sqlalchemy import Column, JSON

from schemas import (
    IngredientCategory,
    IngredientCountry,
    IngredientExitReason,
    IngredientUnit,
)


class Ingredient(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(min_length=1, max_length=160)
    sku: str = Field(min_length=1, max_length=80, unique=True, index=True)
    unit: IngredientUnit
    category: IngredientCategory
    country: IngredientCountry = Field(index=True)
    location_settings: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, default=dict))


class IngredientEntry(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    ingredient_id: int = Field(foreign_key="ingredient.id", index=True)
    quantity: Decimal = Field(gt=0, max_digits=18, decimal_places=6)
    supplier_name: str = Field(min_length=1, max_length=160)
    supplier_id: int | None = Field(default=None, gt=0)
    unit_cost: Decimal | None = Field(default=None, ge=0, max_digits=18, decimal_places=6)
    location_id: int = Field(ge=1, le=14)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_uuid: str = Field(min_length=1, max_length=36)


class IngredientExit(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    ingredient_id: int = Field(foreign_key="ingredient.id", index=True)
    quantity: Decimal = Field(gt=0, max_digits=18, decimal_places=6)
    reason: IngredientExitReason
    waste_cause: str | None = Field(default=None)
    unit_cost: Decimal | None = Field(default=None, ge=0, max_digits=18, decimal_places=6)
    location_id: int = Field(ge=1, le=14)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_uuid: str = Field(min_length=1, max_length=36)


class TelemetryEvent(SQLModel, table=True):
    __tablename__ = "telemetry_events"
    
    id: int | None = Field(default=None, primary_key=True)
    event_id: UUID = Field(unique=True, index=True)
    event_type: str = Field(max_length=100, index=True)
    timestamp: datetime = Field(index=True)
    service: str = Field(default="api", max_length=50)
    session_id: str | None = Field(default=None, max_length=255)
    user_id: str | None = Field(default=None, max_length=255)
    request_id: str | None = Field(default=None, max_length=255, index=True)
    schema_version: int = Field(default=1)
    tags: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, default=dict))
    ingestion_timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

