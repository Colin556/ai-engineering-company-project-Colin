"""Standalone Pydantic request and response schemas."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

MAX_PASSWORD_LENGTH = 72


class Role(StrEnum):
    ADMIN = "admin"
    MANAGER = "manager"
    USER = "user"


class UserCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: EmailStr
    password: str = Field(min_length=8, max_length=MAX_PASSWORD_LENGTH)
    name: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    address: str | None = Field(default=None, max_length=255)


class UserUpdate(BaseModel):
    """Credential-only updates. Display/contact data lives on Profile."""

    model_config = ConfigDict(str_strip_whitespace=True)

    email: EmailStr | None = None
    password: str | None = Field(
        default=None, min_length=8, max_length=MAX_PASSWORD_LENGTH
    )
    is_active: bool | None = None
    role: Role | None = None


class UserResponse(BaseModel):
    id: str
    email: EmailStr
    is_active: bool
    role: Role
    created_at: datetime


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    address: str | None = Field(default=None, max_length=255)


class ProfileResponse(BaseModel):
    id: str
    user_id: str
    name: str | None = None
    phone: str | None = None
    address: str | None = None


class LoginRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class ForgotPasswordRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1, max_length=2048)
    new_password: str = Field(min_length=8, max_length=MAX_PASSWORD_LENGTH)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=MAX_PASSWORD_LENGTH)
    new_password: str = Field(min_length=8, max_length=MAX_PASSWORD_LENGTH)


class MessageResponse(BaseModel):
    detail: str


class MeResponse(BaseModel):
    id: str
    email: EmailStr
    role: Role
    is_active: bool
    profile: ProfileResponse | None = None


class SupplierStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"


class SupplierCategory(StrEnum):
    MEAT = "meat"
    PRODUCE = "produce"
    SAUCE = "sauce"
    BEVERAGE = "beverage"
    PACKAGING = "packaging"
    CLEANING = "cleaning"


class SupplierCountry(StrEnum):
    COLOMBIA = "CO"
    UNITED_STATES = "US"


class SupplierCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1)
    country: SupplierCountry
    product_categories: list[SupplierCategory] = Field(min_length=1)
    rate_per_unit: float = Field(gt=0)
    status: SupplierStatus


class SupplierResponse(SupplierCreate):
    id: int
    updated_at: datetime


class SupplierRateUpdate(BaseModel):
    rate_per_unit: float = Field(gt=0)


class SupplierStatusUpdate(BaseModel):
    status: SupplierStatus


class IncidentCategory(StrEnum):
    BILLING = "billing"
    TECHNICAL = "technical"
    SHIPPING = "shipping"
    PRODUCT = "product"
    OTHER = "other"


class IncidentStatus(StrEnum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    DISCARDED = "discarded"


class IncidentOrigin(StrEnum):
    CUSTOMER = "customer"
    BRANCH = "branch"
    INTERNAL = "internal"


class IncidentCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=5000)
    category: IncidentCategory
    status: IncidentStatus
    origin: IncidentOrigin
    branch: str = Field(min_length=1, max_length=40)


class IncidentStatusUpdate(BaseModel):
    status: IncidentStatus


class IncidentResponse(BaseModel):
    id: int
    title: str
    description: str
    category: IncidentCategory
    status: IncidentStatus
    origin: IncidentOrigin
    branch: str
    created_at: datetime
    updated_at: datetime


class IngredientUnit(StrEnum):
    kg = "kg"
    litre = "litre"
    unit = "unit"


class IngredientCategory(StrEnum):
    meat = "meat"
    produce = "produce"
    sauce = "sauce"
    beverage = "beverage"
    packaging = "packaging"
    cleaning = "cleaning"


class IngredientCountry(StrEnum):
    CO = "CO"
    US = "US"


class IngredientExitReason(StrEnum):
    consumption = "consumption"
    waste = "waste"


class IngredientCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    name: str = Field(min_length=1, max_length=160)
    sku: str = Field(min_length=1, max_length=80)
    unit: IngredientUnit
    category: IngredientCategory
    country: IngredientCountry


class IngredientResponse(IngredientCreate):
    id: int
    current_stock: float


class IngredientOrderCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    ingredient_id: int = Field(gt=0)
    quantity: Decimal = Field(gt=0, max_digits=18, decimal_places=6, allow_inf_nan=False)
    location_id: int = Field(ge=1, le=14)


class IngredientEntryCreate(IngredientOrderCreate):
    supplier_name: str = Field(min_length=1, max_length=160)


class IngredientExitCreate(IngredientOrderCreate):
    reason: IngredientExitReason


class IngredientOrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ingredient_id: int
    quantity: float
    location_id: int
    created_at: datetime
    user_uuid: str
    ingredient: IngredientResponse


class IngredientEntryResponse(IngredientOrderResponse):
    order_type: Literal["inbound"] = "inbound"
    supplier_name: str


class IngredientExitResponse(IngredientOrderResponse):
    order_type: Literal["outbound"] = "outbound"
    reason: IngredientExitReason