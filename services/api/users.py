"""User CRUD endpoints (credentials only)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

import users_service
from dependencies import ensure_self_or_admin, get_current_user
from models import Role, UserCreate, UserResponse, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(payload: UserCreate) -> UserResponse:
    """Public registration. New accounts always start with the `user` role."""
    try:
        user = users_service.create_user(
            email=payload.email,
            password=payload.password,
            role=Role.USER,
            name=payload.name,
            phone=payload.phone,
            address=payload.address,
        )
    except users_service.EmailAlreadyRegisteredError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email is already registered.",
        ) from None

    return UserResponse.model_validate(user)


@router.get("", response_model=list[UserResponse])
def list_users(
    _: UserResponse = Depends(get_current_user),
) -> list[UserResponse]:
    return [UserResponse.model_validate(user) for user in users_service.list_users()]


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: str, current_user: UserResponse = Depends(get_current_user)
) -> UserResponse:
    ensure_self_or_admin(current_user, user_id)
    user = users_service.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    return UserResponse.model_validate(user)


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: str,
    payload: UserUpdate,
    current_user: UserResponse = Depends(get_current_user),
) -> UserResponse:
    ensure_self_or_admin(current_user, user_id)

    changes = payload.model_dump(exclude_unset=True, exclude_none=True, mode="json")
    if ("role" in changes or "is_active" in changes) and current_user.role is not Role.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an administrator can change the role or activation status.",
        )

    try:
        user = users_service.update_user(user_id, changes)
    except users_service.EmailAlreadyRegisteredError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email is already registered.",
        ) from None

    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    return UserResponse.model_validate(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: str, current_user: UserResponse = Depends(get_current_user)
) -> None:
    ensure_self_or_admin(current_user, user_id)
    if not users_service.delete_user(user_id):
        raise HTTPException(status_code=404, detail="User not found.")
