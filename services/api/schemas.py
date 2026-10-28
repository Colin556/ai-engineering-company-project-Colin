"""Standalone Pydantic request and response schemas."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

MAX_PASSWORD_LENGTH = 72


class WriteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Role(StrEnum):
    ADMIN = "admin"
    MANAGER = "manager"
    USER = "user"


class UserCreate(WriteRequest):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: EmailStr
    password: str = Field(min_length=8, max_length=MAX_PASSWORD_LENGTH)
    name: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    address: str | None = Field(default=None, max_length=255)


class UserUpdate(WriteRequest):
    """Credential-only updates. Display/contact data lives on Profile."""

    model_config = ConfigDict(str_strip_whitespace=True)

    email: EmailStr | None = None
    password: str | None = Field(
        default=None, min_length=8, max_length=MAX_PASSWORD_LENGTH
    )
    is_active: bool | None = None
    role: Role | None = None


class RegistrationResponse(BaseModel):
    id: str
    is_active: bool
    role: Role
    created_at: datetime


class UserResponse(RegistrationResponse):
    email: EmailStr


class UserListItem(BaseModel):
    id: str
    is_active: bool
    role: Role


class ProfileUpdate(WriteRequest):
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


class LoginRequest(WriteRequest):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class ForgotPasswordRequest(WriteRequest):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: EmailStr


class ResetPasswordRequest(WriteRequest):
    token: str = Field(min_length=1, max_length=2048)
    new_password: str = Field(min_length=8, max_length=MAX_PASSWORD_LENGTH)


class ChangePasswordRequest(WriteRequest):
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


class SupplierCreate(WriteRequest):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1)
    country: SupplierCountry
    product_categories: list[SupplierCategory] = Field(min_length=1)
    rate_per_unit: float = Field(gt=0)
    status: SupplierStatus


class SupplierResponse(BaseModel):
    id: int
    name: str
    country: SupplierCountry
    product_categories: list[SupplierCategory]
    rate_per_unit: float
    status: SupplierStatus
    updated_at: datetime


class SupplierListItem(BaseModel):
    id: int
    name: str
    country: SupplierCountry
    product_categories: list[SupplierCategory]
    rate_per_unit: float
    status: SupplierStatus


class SupplierRateUpdate(WriteRequest):
    rate_per_unit: float = Field(gt=0)


class SupplierStatusUpdate(WriteRequest):
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
    model_config = ConfigDict(extra="forbid")

    status: IncidentStatus


class BranchOption(BaseModel):
    value: str
    label: str


class IncidentOptionsResponse(BaseModel):
    categories: list[IncidentCategory]
    statuses: list[IncidentStatus]
    origins: list[IncidentOrigin]
    branches: list[BranchOption]


class IncidentSummaryResponse(BaseModel):
    total: int
    by_status: dict[IncidentStatus, int]
    by_category: dict[IncidentCategory, int]
    by_origin: dict[IncidentOrigin, int]
    by_branch: dict[str, int]


class IncidentAnalysisResponse(BaseModel):
    total_records: int
    total_valid: int
    total_invalid: int
    invalid_reason_counts: dict[str, int]
    category_breakdown: dict[IncidentCategory, int]
    status_breakdown: dict[Literal["open", "closed", "discarded"], int]
    closed_with_score_count: int
    avg_satisfaction_closed: float | None = Field(allow_inf_nan=False)


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


class IncidentListItem(BaseModel):
    id: int
    title: str
    description: str
    category: IncidentCategory
    status: IncidentStatus
    origin: IncidentOrigin
    branch: str
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


class IngredientResponse(BaseModel):
    id: int
    name: str
    sku: str
    unit: IngredientUnit
    category: IngredientCategory
    country: IngredientCountry
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


class IngredientOrderFields(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ingredient_id: int
    quantity: float
    location_id: int
    created_at: datetime
    user_uuid: str


class IngredientOrderResponse(IngredientOrderFields):
    ingredient: IngredientResponse


class IngredientEntryResponse(IngredientOrderResponse):
    order_type: Literal["inbound"] = "inbound"
    supplier_name: str


class IngredientExitResponse(IngredientOrderResponse):
    order_type: Literal["outbound"] = "outbound"
    reason: IngredientExitReason


class OrderIngredientSummary(BaseModel):
    name: str
    sku: str
    unit: IngredientUnit
    country: IngredientCountry


class IngredientEntryListItem(IngredientOrderFields):
    ingredient: OrderIngredientSummary
    order_type: Literal["inbound"] = "inbound"
    supplier_name: str


class IngredientExitListItem(IngredientOrderFields):
    ingredient: OrderIngredientSummary
    order_type: Literal["outbound"] = "outbound"
    reason: IngredientExitReason