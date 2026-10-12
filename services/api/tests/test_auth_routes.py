from fastapi.testclient import TestClient

from accounts import get_profile_by_user_id, get_user_by_email
from core import decode_access_token, users_table
from schemas import Role


def test_json_login_issues_access_token(client: TestClient, register_and_login) -> None:
    user, _ = register_and_login(email="json-login@brasaland.co")

    response = client.post(
        "/auth/login/json",
        json={"email": " JSON-LOGIN@brasaland.co ", "password": "Sup3rSecret!"},
    )

    assert response.status_code == 200
    claims = decode_access_token(response.json()["access_token"])
    assert claims["sub"] == user["id"]
    assert claims["role"] == Role.USER
    assert claims["exp"] - claims["iat"] == response.json()["expires_in"]


def test_json_login_rejects_wrong_and_empty_credentials(client: TestClient, register_and_login) -> None:
    register_and_login(email="json-login@brasaland.co")

    wrong_password = client.post(
        "/auth/login/json",
        json={"email": "json-login@brasaland.co", "password": "incorrect"},
    )
    empty_email = client.post(
        "/auth/login/json", json={"email": "", "password": "Sup3rSecret!"}
    )

    assert wrong_password.status_code == 401
    assert empty_email.status_code == 422


def test_form_login_rejects_missing_password(client: TestClient) -> None:
    response = client.post("/auth/login", data={"username": "user@brasaland.co"})

    assert response.status_code == 422


def test_registration_rejects_empty_required_fields(client: TestClient) -> None:
    empty_email = client.post(
        "/users", json={"email": "", "password": "Sup3rSecret!"}
    )
    empty_password = client.post(
        "/users", json={"email": "valid@brasaland.co", "password": ""}
    )

    assert empty_email.status_code == 422
    assert empty_password.status_code == 422


def test_authenticated_user_can_list_accounts(client: TestClient, register_and_login) -> None:
    user, headers = register_and_login(email="list-one@brasaland.co")
    register_and_login(email="list-two@brasaland.co")

    response = client.get("/users", headers=headers)

    assert response.status_code == 200
    assert {entry["id"] for entry in response.json()} == {
        user["id"],
        get_user_by_email("list-two@brasaland.co")["id"],
    }


def test_user_list_contains_only_the_current_account_when_alone(
    client: TestClient, register_and_login
) -> None:
    user, headers = register_and_login(email="only-user@brasaland.co")

    response = client.get("/users", headers=headers)

    assert response.status_code == 200
    assert [entry["id"] for entry in response.json()] == [user["id"]]


def test_user_can_read_self_and_unknown_user_is_not_disclosed(
    client: TestClient, register_and_login
) -> None:
    user, headers = register_and_login(email="self@brasaland.co")

    self_response = client.get(f"/users/{user['id']}", headers=headers)
    other_response = client.get("/users/unknown-user-id", headers=headers)

    assert self_response.status_code == 200
    assert self_response.json()["id"] == user["id"]
    assert other_response.status_code == 403


def test_user_update_is_normalized_and_empty_update_is_a_noop(
    client: TestClient, register_and_login
) -> None:
    user, headers = register_and_login(email="update@brasaland.co")
    no_op = client.put(f"/users/{user['id']}", headers=headers, json={})
    updated = client.put(
        f"/users/{user['id']}",
        headers=headers,
        json={"email": "  UPDATED@brasaland.co  "},
    )

    assert no_op.status_code == 200
    assert no_op.json()["email"] == "update@brasaland.co"
    assert updated.status_code == 200
    assert updated.json()["email"] == "updated@brasaland.co"
    assert get_user_by_email("updated@brasaland.co") is not None


def test_user_update_rejects_duplicate_email(client: TestClient, register_and_login) -> None:
    admin, _ = register_and_login(email="first@brasaland.co")
    users_table.update(
        {"role": Role.ADMIN.value}, lambda user: user["id"] == admin["id"]
    )
    admin_login = client.post(
        "/auth/login",
        data={"username": "first@brasaland.co", "password": "Sup3rSecret!"},
    )
    headers = {
        "Authorization": f"Bearer {admin_login.json()['access_token']}"
    }
    second, _ = register_and_login(email="second@brasaland.co")

    response = client.put(
        f"/users/{second['id']}",
        headers=headers,
        json={"email": "first@brasaland.co"},
    )

    assert response.status_code == 409


def test_profile_read_and_empty_update_preserve_profile(
    client: TestClient, register_and_login
) -> None:
    user, headers = register_and_login(name="Original name")

    profile_response = client.get("/profiles/me", headers=headers)
    update_response = client.put("/profiles/me", headers=headers, json={})

    assert profile_response.status_code == 200
    assert profile_response.json()["name"] == "Original name"
    assert update_response.status_code == 200
    assert update_response.json()["id"] == get_profile_by_user_id(user["id"])["id"]
    assert update_response.json()["name"] == "Original name"


def test_profile_read_fails_when_linked_profile_is_missing(
    client: TestClient, register_and_login
) -> None:
    user, headers = register_and_login()
    from core import profiles_table

    profiles_table.remove(lambda profile: profile["user_id"] == user["id"])

    me_response = client.get("/auth/me", headers=headers)
    response = client.get("/profiles/me", headers=headers)

    assert me_response.status_code == 200
    assert me_response.json()["profile"] is None
    assert response.status_code == 404