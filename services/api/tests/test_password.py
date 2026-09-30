from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

import accounts
from core import create_access_token, create_password_reset_token

EMAIL = "reset@brasaland.co"
OLD_PASSWORD = "Sup3rSecret!"
NEW_PASSWORD = "BrandN3wPass!"


@pytest.fixture
def sent_emails(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str]]:
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(
        accounts, "send_password_reset_email", lambda to, url: sent.append((to, url))
    )
    return sent


def _request_reset_token(client: TestClient, sent_emails: list) -> str:
    response = client.post("/auth/forgot-password", json={"email": EMAIL})
    assert response.status_code == 200
    _, url = sent_emails[-1]
    return parse_qs(urlparse(url).query)["token"][0]


def _login_status(client: TestClient, password: str) -> int:
    return client.post(
        "/auth/login", data={"username": EMAIL, "password": password}
    ).status_code


def test_forgot_password_same_response_for_unknown_email(
    client: TestClient, register_and_login, sent_emails
) -> None:
    register_and_login(email=EMAIL)

    known = client.post("/auth/forgot-password", json={"email": EMAIL})
    unknown = client.post("/auth/forgot-password", json={"email": "ghost@brasaland.co"})

    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert len(sent_emails) == 1
    to, url = sent_emails[0]
    assert to == EMAIL
    assert "/reset-password?token=" in url


def test_reset_password_updates_password_and_token_is_single_use(
    client: TestClient, register_and_login, sent_emails
) -> None:
    register_and_login(email=EMAIL, password=OLD_PASSWORD)
    token = _request_reset_token(client, sent_emails)

    payload = {"token": token, "new_password": NEW_PASSWORD}
    assert client.post("/auth/reset-password", json=payload).status_code == 200
    assert _login_status(client, OLD_PASSWORD) == 401
    assert _login_status(client, NEW_PASSWORD) == 200

    reused = client.post(
        "/auth/reset-password", json={"token": token, "new_password": "An0therPass!"}
    )
    assert reused.status_code == 400


def test_new_reset_request_invalidates_previous_link(
    client: TestClient, register_and_login, sent_emails
) -> None:
    register_and_login(email=EMAIL)
    first = _request_reset_token(client, sent_emails)
    _request_reset_token(client, sent_emails)

    response = client.post(
        "/auth/reset-password", json={"token": first, "new_password": NEW_PASSWORD}
    )
    assert response.status_code == 400


def test_reset_password_rejects_invalid_expired_and_access_tokens(
    client: TestClient, register_and_login, monkeypatch: pytest.MonkeyPatch
) -> None:
    user, _ = register_and_login(email=EMAIL)

    def reset(token: str) -> int:
        return client.post(
            "/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD}
        ).status_code

    assert reset("not-a-token") == 400

    # A signed token that was never issued through /forgot-password has no row.
    unissued, _, _ = create_password_reset_token(user["id"])
    assert reset(unissued) == 400

    access_token, _ = create_access_token(user["id"], "user")
    assert reset(access_token) == 400

    monkeypatch.setattr("core.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES", -1)
    expired = accounts.issue_password_reset_token(user["id"])
    assert reset(expired) == 400


def test_reset_token_cannot_be_used_as_access_token(
    client: TestClient, register_and_login, sent_emails
) -> None:
    register_and_login(email=EMAIL)
    token = _request_reset_token(client, sent_emails)
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_change_password(client: TestClient, register_and_login) -> None:
    _, headers = register_and_login(email=EMAIL, password=OLD_PASSWORD)

    wrong = client.post(
        "/auth/change-password",
        headers=headers,
        json={"current_password": "wrong-password", "new_password": NEW_PASSWORD},
    )
    assert wrong.status_code == 400

    ok = client.post(
        "/auth/change-password",
        headers=headers,
        json={"current_password": OLD_PASSWORD, "new_password": NEW_PASSWORD},
    )
    assert ok.status_code == 200
    assert _login_status(client, OLD_PASSWORD) == 401
    assert _login_status(client, NEW_PASSWORD) == 200


def test_change_password_requires_authentication(client: TestClient) -> None:
    response = client.post(
        "/auth/change-password",
        json={"current_password": OLD_PASSWORD, "new_password": NEW_PASSWORD},
    )
    assert response.status_code == 401
