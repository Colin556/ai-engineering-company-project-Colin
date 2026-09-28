"""Reusable authentication dependencies.

`get_current_user` is the single entry point used to protect routes: it reads
the `Authorization: Bearer <token>` header, validates the JWT signature and
expiry, loads the user from TinyDB and raises 401 if anything fails.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from models import Role, UserResponse
from security import decode_access_token
from users_service import get_user_by_id

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials.",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(token: str = Depends(oauth2_scheme)) -> UserResponse:
    claims = decode_access_token(token)
    if claims is None:
        raise CREDENTIALS_EXCEPTION

    user_id = claims.get("sub")
    if not user_id:
        raise CREDENTIALS_EXCEPTION

    user = get_user_by_id(user_id)
    if user is None:
        raise CREDENTIALS_EXCEPTION
    if not user.get("is_active", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user."
        )

    return UserResponse.model_validate(user)


def require_admin(
    current_user: UserResponse = Depends(get_current_user),
) -> UserResponse:
    if current_user.role is not Role.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator privileges are required.",
        )
    return current_user


def ensure_self_or_admin(current_user: UserResponse, target_user_id: str) -> None:
    if current_user.id != target_user_id and current_user.role is not Role.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this resource.",
        )
