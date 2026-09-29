"""Accounts: users, profiles and stateless JWT authentication.

Only credentials live on the user document (id, email, hashed_password,
is_active, role, created_at). Display name and contact data belong to the
linked Profile. `get_current_user` is the single dependency used to protect
routes across the API.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from tinydb import Query

from core import (
    create_access_token,
    db_lock,
    decode_access_token,
    hash_password,
    profiles_table,
    users_table,
    verify_password,
)
from models import (
    LoginRequest,
    MeResponse,
    ProfileResponse,
    ProfileUpdate,
    Role,
    Token,
    UserCreate,
    UserResponse,
    UserUpdate,
)

UserQuery = Query()
ProfileQuery = Query()


# ---------- Profile data access ----------


def create_profile(
    user_id: str,
    name: str | None = None,
    phone: str | None = None,
    address: str | None = None,
) -> dict:
    document = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "name": name,
        "phone": phone,
        "address": address,
    }
    with db_lock:
        profiles_table.insert(document)
    return document


def get_profile_by_user_id(user_id: str) -> dict | None:
    with db_lock:
        return profiles_table.get(ProfileQuery.user_id == user_id)


def update_profile(user_id: str, changes: dict) -> dict | None:
    if not changes:
        return get_profile_by_user_id(user_id)

    with db_lock:
        if profiles_table.get(ProfileQuery.user_id == user_id) is None:
            return None
        profiles_table.update(changes, ProfileQuery.user_id == user_id)
        return profiles_table.get(ProfileQuery.user_id == user_id)


def delete_profile_by_user_id(user_id: str) -> None:
    with db_lock:
        profiles_table.remove(ProfileQuery.user_id == user_id)


# ---------- User data access ----------


class EmailAlreadyRegisteredError(Exception):
    """Raised when an email is already taken by another user."""


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def get_user_by_email(email: str) -> dict | None:
    with db_lock:
        return users_table.get(UserQuery.email == _normalize_email(email))


def get_user_by_id(user_id: str) -> dict | None:
    with db_lock:
        return users_table.get(UserQuery.id == user_id)


def get_all_users() -> list[dict]:
    with db_lock:
        return list(users_table.all())


def create_user(
    email: str,
    password: str,
    role: Role = Role.USER,
    name: str | None = None,
    phone: str | None = None,
    address: str | None = None,
) -> dict:
    normalized = _normalize_email(email)
    document = {
        "id": str(uuid.uuid4()),
        "email": normalized,
        "hashed_password": hash_password(password),
        "is_active": True,
        "role": Role(role).value,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    with db_lock:
        if users_table.get(UserQuery.email == normalized) is not None:
            raise EmailAlreadyRegisteredError(normalized)
        users_table.insert(document)

    create_profile(document["id"], name=name, phone=phone, address=address)
    return document


def apply_user_changes(user_id: str, changes: dict) -> dict | None:
    """Apply credential changes. `password` is hashed before being stored."""
    payload = dict(changes)

    if "password" in payload:
        payload["hashed_password"] = hash_password(payload.pop("password"))
    if "email" in payload:
        payload["email"] = _normalize_email(payload["email"])
    if "role" in payload:
        payload["role"] = Role(payload["role"]).value

    with db_lock:
        current = users_table.get(UserQuery.id == user_id)
        if current is None:
            return None
        if not payload:
            return current

        new_email = payload.get("email")
        if new_email and new_email != current["email"]:
            if users_table.get(UserQuery.email == new_email) is not None:
                raise EmailAlreadyRegisteredError(new_email)

        users_table.update(payload, UserQuery.id == user_id)
        return users_table.get(UserQuery.id == user_id)


def remove_user(user_id: str) -> bool:
    with db_lock:
        if users_table.get(UserQuery.id == user_id) is None:
            return False
        users_table.remove(UserQuery.id == user_id)

    delete_profile_by_user_id(user_id)
    return True


def authenticate_user(email: str, password: str) -> dict | None:
    user = get_user_by_email(email)
    if user is None:
        # Hash a dummy value so wrong-email and wrong-password cost the same time.
        hash_password("invalid-password-placeholder")
        return None
    if not verify_password(password, user["hashed_password"]):
        return None
    return user


# ---------- Auth dependencies ----------

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


# ---------- /auth ----------

auth_router = APIRouter(prefix="/auth", tags=["auth"])

INVALID_CREDENTIALS = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Incorrect email or password.",
    headers={"WWW-Authenticate": "Bearer"},
)


def _issue_token(email: str, password: str) -> Token:
    user = authenticate_user(email, password)
    if user is None:
        raise INVALID_CREDENTIALS
    if not user.get("is_active", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user."
        )

    access_token, expires_in = create_access_token(user["id"], user["role"])
    return Token(access_token=access_token, expires_in=expires_in)


@auth_router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends()) -> Token:
    """OAuth2 password flow. Send the email in the `username` field."""
    return _issue_token(form_data.username, form_data.password)


@auth_router.post("/login/json", response_model=Token)
def login_json(payload: LoginRequest) -> Token:
    """Same as /auth/login, for JSON clients such as the backoffice UI."""
    return _issue_token(payload.email, payload.password)


@auth_router.get("/me", response_model=MeResponse)
def read_me(current_user: UserResponse = Depends(get_current_user)) -> MeResponse:
    profile = get_profile_by_user_id(current_user.id)
    return MeResponse(
        id=current_user.id,
        email=current_user.email,
        role=current_user.role,
        is_active=current_user.is_active,
        profile=ProfileResponse.model_validate(profile) if profile else None,
    )


# ---------- /users ----------

users_router = APIRouter(prefix="/users", tags=["users"])


@users_router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(payload: UserCreate) -> UserResponse:
    """Public registration. New accounts always start with the `user` role."""
    try:
        user = create_user(
            email=payload.email,
            password=payload.password,
            role=Role.USER,
            name=payload.name,
            phone=payload.phone,
            address=payload.address,
        )
    except EmailAlreadyRegisteredError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email is already registered.",
        ) from None

    return UserResponse.model_validate(user)


@users_router.get("", response_model=list[UserResponse])
def list_users(
    _: UserResponse = Depends(get_current_user),
) -> list[UserResponse]:
    return [UserResponse.model_validate(user) for user in get_all_users()]


@users_router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: str, current_user: UserResponse = Depends(get_current_user)
) -> UserResponse:
    ensure_self_or_admin(current_user, user_id)
    user = get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    return UserResponse.model_validate(user)


@users_router.put("/{user_id}", response_model=UserResponse)
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
        user = apply_user_changes(user_id, changes)
    except EmailAlreadyRegisteredError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email is already registered.",
        ) from None

    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    return UserResponse.model_validate(user)


@users_router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: str, current_user: UserResponse = Depends(get_current_user)
) -> None:
    ensure_self_or_admin(current_user, user_id)
    if not remove_user(user_id):
        raise HTTPException(status_code=404, detail="User not found.")


# ---------- /profiles ----------

profiles_router = APIRouter(prefix="/profiles", tags=["profiles"])


@profiles_router.get("/me", response_model=ProfileResponse)
def read_my_profile(
    current_user: UserResponse = Depends(get_current_user),
) -> ProfileResponse:
    profile = get_profile_by_user_id(current_user.id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found.")
    return ProfileResponse.model_validate(profile)


@profiles_router.put("/me", response_model=ProfileResponse)
def update_my_profile(
    payload: ProfileUpdate,
    current_user: UserResponse = Depends(get_current_user),
) -> ProfileResponse:
    changes = payload.model_dump(exclude_unset=True)
    profile = update_profile(current_user.id, changes)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found.")
    return ProfileResponse.model_validate(profile)
