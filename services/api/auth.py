"""Stateless JWT authentication endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

import profiles_service
import users_service
from dependencies import get_current_user
from models import LoginRequest, MeResponse, ProfileResponse, Token, UserResponse
from security import create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])

INVALID_CREDENTIALS = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Incorrect email or password.",
    headers={"WWW-Authenticate": "Bearer"},
)


def _issue_token(email: str, password: str) -> Token:
    user = users_service.authenticate_user(email, password)
    if user is None:
        raise INVALID_CREDENTIALS
    if not user.get("is_active", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user."
        )

    access_token, expires_in = create_access_token(user["id"], user["role"])
    return Token(access_token=access_token, expires_in=expires_in)


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends()) -> Token:
    """OAuth2 password flow. Send the email in the `username` field."""
    return _issue_token(form_data.username, form_data.password)


@router.post("/login/json", response_model=Token)
def login_json(payload: LoginRequest) -> Token:
    """Same as /auth/login, for JSON clients such as the backoffice UI."""
    return _issue_token(payload.email, payload.password)


@router.get("/me", response_model=MeResponse)
def read_me(current_user: UserResponse = Depends(get_current_user)) -> MeResponse:
    profile = profiles_service.get_profile_by_user_id(current_user.id)
    return MeResponse(
        id=current_user.id,
        email=current_user.email,
        role=current_user.role,
        is_active=current_user.is_active,
        profile=ProfileResponse.model_validate(profile) if profile else None,
    )
