"""SQLModel inventory tables. Authentication remains exclusively in TinyDB."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlmodel import Field, SQLModel

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


class IngredientEntry(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    ingredient_id: int = Field(foreign_key="ingredient.id", index=True)
    quantity: Decimal = Field(gt=0, max_digits=18, decimal_places=6)
    supplier_name: str = Field(min_length=1, max_length=160)
    location_id: int = Field(ge=1, le=14)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_uuid: str = Field(min_length=1, max_length=36)


class IngredientExit(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    ingredient_id: int = Field(foreign_key="ingredient.id", index=True)
    quantity: Decimal = Field(gt=0, max_digits=18, decimal_places=6)
    reason: IngredientExitReason
    location_id: int = Field(ge=1, le=14)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_uuid: str = Field(min_length=1, max_length=36)
