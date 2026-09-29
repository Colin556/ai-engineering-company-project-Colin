from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from jose import jwt

from accounts import get_user_by_email
from core import ALGORITHM, SECRET_KEY, users_table, verify_password
from models import Role


def test_register_creates_hashed_password_and_profile(client: TestClient) -> None:
    response = client.post(
        "/users",
        json={
            "email": "Chef@Brasaland.co",
            "password": "Sup3rSecret!",
            "name": "Chef Ana",
            "phone": "+57 300 000 0000",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "chef@brasaland.co"
    assert body["role"] == Role.USER
    assert "password" not in body and "hashed_password" not in body

    stored = get_user_by_email("chef@brasaland.co")
    assert stored["hashed_password"] != "Sup3rSecret!"
    assert verify_password("Sup3rSecret!", stored["hashed_password"])


def test_register_rejects_duplicate_email(client: TestClient) -> None:
    payload = {"email": "dup@brasaland.co", "password": "Sup3rSecret!"}
    assert client.post("/users", json=payload).status_code == 201
    assert client.post("/users", json=payload).status_code == 409


def test_login_returns_token_and_me_returns_profile(
    client: TestClient, register_and_login
) -> None:
    user, headers = register_and_login(name="Chef Ana", phone="+57 300 000 0000")

    response = client.get("/auth/me", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == user["id"]
    assert body["role"] == Role.USER
    assert body["profile"]["name"] == "Chef Ana"
    assert body["profile"]["phone"] == "+57 300 000 0000"


def test_login_with_wrong_password_returns_401(
    client: TestClient, register_and_login
) -> None:
    register_and_login(email="wrong@brasaland.co")
    response = client.post(
        "/auth/login", data={"username": "wrong@brasaland.co", "password": "nope"}
    )
    assert response.status_code == 401


def test_protected_routes_reject_missing_token(client: TestClient) -> None:
    for method, path in [
        ("get", "/users"),
        ("get", "/auth/me"),
        ("get", "/profiles/me"),
        ("put", "/profiles/me"),
        ("post", "/suppliers"),
        ("get", "/api/incidents/results/export"),
    ]:
        response = getattr(client, method)(path)
        assert response.status_code == 401, f"{method.upper()} {path}"


def test_malformed_and_expired_tokens_return_401(client: TestClient) -> None:
    assert (
        client.get("/auth/me", headers={"Authorization": "Bearer not-a-jwt"}).status_code
        == 401
    )

    expired = jwt.encode(
        {
            "sub": "whatever",
            "role": Role.USER.value,
            "exp": int((datetime.now(timezone.utc) - timedelta(minutes=5)).timestamp()),
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )
    assert (
        client.get("/auth/me", headers={"Authorization": f"Bearer {expired}"}).status_code
        == 401
    )

    foreign = jwt.encode({"sub": "whatever"}, "a-different-secret", algorithm=ALGORITHM)
    assert (
        client.get("/auth/me", headers={"Authorization": f"Bearer {foreign}"}).status_code
        == 401
    )


def test_profile_me_update_only_touches_own_profile(
    client: TestClient, register_and_login
) -> None:
    _, headers = register_and_login()
    response = client.put(
        "/profiles/me",
        headers=headers,
        json={"name": "Updated", "address": "Cra 1 #2-3"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Updated"
    assert response.json()["address"] == "Cra 1 #2-3"


def test_user_cannot_read_update_or_delete_another_user(
    client: TestClient, register_and_login
) -> None:
    owner, _ = register_and_login(email="owner@brasaland.co")
    _, intruder_headers = register_and_login(email="intruder@brasaland.co")

    assert client.get(f"/users/{owner['id']}", headers=intruder_headers).status_code == 403
    assert (
        client.put(
            f"/users/{owner['id']}",
            headers=intruder_headers,
            json={"email": "hijacked@brasaland.co"},
        ).status_code
        == 403
    )
    assert (
        client.delete(f"/users/{owner['id']}", headers=intruder_headers).status_code == 403
    )


def test_non_admin_cannot_escalate_role(client: TestClient, register_and_login) -> None:
    user, headers = register_and_login()
    response = client.put(
        f"/users/{user['id']}", headers=headers, json={"role": "admin"}
    )
    assert response.status_code == 403


def test_invalid_role_value_is_rejected(client: TestClient, register_and_login) -> None:
    user, headers = register_and_login()
    response = client.put(
        f"/users/{user['id']}", headers=headers, json={"role": "superuser"}
    )
    assert response.status_code == 422


def test_admin_can_update_role_and_delete_removes_profile(
    client: TestClient, register_and_login
) -> None:
    admin, _ = register_and_login(email="admin@brasaland.co")
    users_table.update({"role": Role.ADMIN.value}, lambda doc: doc["id"] == admin["id"])

    login = client.post(
        "/auth/login",
        data={"username": "admin@brasaland.co", "password": "Sup3rSecret!"},
    )
    admin_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    target, target_headers = register_and_login(email="target@brasaland.co")
    promote = client.put(
        f"/users/{target['id']}", headers=admin_headers, json={"role": "manager"}
    )
    assert promote.status_code == 200
    assert promote.json()["role"] == "manager"

    assert client.delete(f"/users/{target['id']}", headers=admin_headers).status_code == 204
    assert client.get("/profiles/me", headers=target_headers).status_code == 401
