"""Profile endpoints. A profile is owned by exactly one user."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

import profiles_service
from dependencies import get_current_user
from models import ProfileResponse, ProfileUpdate, UserResponse

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.get("/me", response_model=ProfileResponse)
def read_my_profile(
    current_user: UserResponse = Depends(get_current_user),
) -> ProfileResponse:
    profile = profiles_service.get_profile_by_user_id(current_user.id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found.")
    return ProfileResponse.model_validate(profile)


@router.put("/me", response_model=ProfileResponse)
def update_my_profile(
    payload: ProfileUpdate,
    current_user: UserResponse = Depends(get_current_user),
) -> ProfileResponse:
    changes = payload.model_dump(exclude_unset=True)
    profile = profiles_service.update_profile(current_user.id, changes)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found.")
    return ProfileResponse.model_validate(profile)
