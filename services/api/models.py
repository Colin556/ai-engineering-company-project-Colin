"""Pydantic schemas for the authentication, user and profile modules."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# bcrypt silently truncates anything past 72 bytes, so reject longer secrets up front.
MAX_PASSWORD_LENGTH = 72


class Role(StrEnum):
    ADMIN = "admin"
    MANAGER = "manager"
    USER = "user"


class UserCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: EmailStr
    password: str = Field(min_length=8, max_length=MAX_PASSWORD_LENGTH)
    # Optional initial profile data; the linked Profile is created in the same operation.
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


class MeResponse(BaseModel):
    id: str
    email: EmailStr
    role: Role
    is_active: bool
    profile: ProfileResponse | None = None
