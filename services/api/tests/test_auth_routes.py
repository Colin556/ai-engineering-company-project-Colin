import ast
import logging
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from accounts import get_profile_by_user_id, get_user_by_email
from core import decode_access_token, suppliers_table, users_table
from main import app
from schemas import Role


def test_request_timing_does_not_log_query_values(client, caplog) -> None:
    with caplog.at_level(logging.INFO, logger="uvicorn.error.timing"):
        response = client.get("/suppliers?private_token=do-not-log-this")
        missing = client.get("/private-value-do-not-log")
    assert response.status_code == 200
    assert float(response.headers["Server-Timing"].split("=")[1]) >= 0
    assert missing.status_code == 404
    messages = [record.message for record in caplog.records if record.name == "uvicorn.error.timing"]
    assert any("GET /suppliers status=200 duration_ms=" in message for message in messages)
    assert any("<unmatched> status=404" in message for message in messages)
    assert all("do-not-log" not in message and "private_token" not in message for message in messages)


def test_every_endpoint_declares_its_response_contract() -> None:
    api_dir = Path(__file__).resolve().parents[1]
    declarations = []
    for source in [api_dir / "main.py", api_dir / "accounts.py", api_dir / "suppliers.py",
                   api_dir / "incidents.py", *sorted((api_dir / "routers").glob("*.py"))]:
        tree = ast.parse(source.read_text())
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for decorator in node.decorator_list:
                if (isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Attribute)
                        and decorator.func.attr in {"get", "post", "put", "patch", "delete", "head", "options"}):
                    assert "response_model" in {keyword.arg for keyword in decorator.keywords}, node.name
                    declarations.append(node.name)
    spec = app.openapi()
    operations = [
        (path, operation)
        for path, methods in spec["paths"].items()
        for method, operation in methods.items()
        if method in {"get", "post", "put", "patch", "delete", "head", "options"}
    ]
    assert len(declarations) == len(operations) == 34
    for path, operation in operations:
        responses = operation["responses"]
        success = responses.get("200", responses.get("201", responses.get("204")))
        assert success is not None, path
        if "204" in responses:
            assert "content" not in success
        elif not path.endswith("/results/export"):
            assert success["content"]["application/json"]["schema"], path
    assert spec["paths"]["/api/incidents"]["post"]["requestBody"]["content"]["application/json"]["schema"]["$ref"].endswith("/IncidentCreate")
    assert "text/csv" in spec["paths"]["/api/incidents/results/export"]["get"]["responses"]["200"]["content"]


def test_auth_and_list_responses_filter_stored_fields(client: TestClient, register_and_login) -> None:
    user, headers = register_and_login()
    users_table.update({"internal_token": "private"}, lambda row: row["id"] == user["id"])
    listed = client.get("/users", headers=headers)
    assert listed.status_code == 200
    assert set(listed.json()[0]) == {"id", "role", "is_active"}
    detail = client.get(f"/users/{user['id']}", headers=headers)
    assert set(detail.json()) == {"id", "email", "is_active", "role", "created_at"}
    assert client.get("/auth/me", headers=headers).json()["email"] == "tester@brasaland.co"
    for path, body in [
        ("/auth/login/json", {"email": "tester@brasaland.co", "password": "Sup3rSecret!"}),
        ("/auth/forgot-password", {"email": "unknown@brasaland.co"}),
        ("/auth/change-password", {"current_password": "Sup3rSecret!", "new_password": "NextSecret123!"}),
    ]:
        response = client.post(path, headers=headers, json=body)
        assert response.status_code == 200
        assert set(response.json()) <= {"access_token", "token_type", "expires_in", "detail"}
    suppliers_table.update({"internal_token": "private"})
    suppliers = client.get("/suppliers")
    assert suppliers.status_code == 200
    assert set(suppliers.json()[0]) == {"id", "name", "country", "product_categories", "rate_per_unit", "status"}
    supplier = client.get(f"/suppliers/{suppliers.json()[0]['id']}")
    assert supplier.status_code == 200
    assert "internal_token" not in supplier.json()


@pytest.mark.parametrize("schema_name,payload", [
    ("UserCreate", {"email": "user@brasaland.co", "password": "Sup3rSecret!"}),
    ("UserUpdate", {}), ("ProfileUpdate", {}),
    ("LoginRequest", {"email": "user@brasaland.co", "password": "Sup3rSecret!"}),
    ("ForgotPasswordRequest", {"email": "user@brasaland.co"}),
    ("ResetPasswordRequest", {"token": "test", "new_password": "Sup3rSecret!"}),
    ("ChangePasswordRequest", {"current_password": "test", "new_password": "Sup3rSecret!"}),
    ("SupplierCreate", {"name": "Supplier", "country": "CO", "product_categories": ["meat"], "rate_per_unit": 1, "status": "active"}),
    ("SupplierRateUpdate", {"rate_per_unit": 1}),
    ("SupplierStatusUpdate", {"status": "active"}),
    ("IncidentCreate", {"title": "Test", "description": "Test", "category": "other", "status": "open", "origin": "internal", "branch": "central"}),
    ("IncidentStatusUpdate", {"status": "open"}),
])
def test_write_schemas_reject_server_owned_fields(schema_name, payload) -> None:
    import schemas
    from pydantic import ValidationError

    schema = getattr(schemas, schema_name)
    schema.model_validate(payload)
    for field in ("id", "hashed_password", "created_at", "user_uuid", "internal_token"):
        with pytest.raises(ValidationError):
            schema.model_validate({**payload, field: "forged"})


def test_analysis_response_is_aggregate_only(client: TestClient, register_and_login) -> None:
    _, headers = register_and_login()
    csv = (
        "incident_id,customer_id,customer_name,email,category,status,created_at,satisfaction_score,internal_token\n"
        "1,2,Private Name,private@example.com,technical,closed,2026-10-28,4,secret\n"
    )
    response = client.post("/api/incidents/analyze", headers=headers, files={"file": ("incidents.csv", csv, "text/csv")})
    assert response.status_code == 200
    assert set(response.json()) == {
        "total_records", "total_valid", "total_invalid", "invalid_reason_counts",
        "category_breakdown", "status_breakdown", "closed_with_score_count", "avg_satisfaction_closed",
    }
    assert response.json()["avg_satisfaction_closed"] == 4
    assert "private@example.com" not in response.text and "secret" not in response.text
    exported = client.get("/api/incidents/results/export", headers=headers)
    assert exported.status_code == 200
    assert exported.headers["content-type"].startswith("text/csv")
    assert exported.text.startswith("metric,value")
    assert "private@example.com" not in exported.text


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


@pytest.mark.parametrize("path,payload,private_values", [
    ("/users", {"email": "not-an-email-private", "password": "shh!"}, ["not-an-email-private", "shh!"]),
    ("/auth/login/json", {"email": "invalid-private", "password": {"private": "secret"}}, ["invalid-private", "secret"]),
    ("/auth/reset-password", {"token": "private-token", "new_password": "shh!"}, ["private-token", "shh!"]),
])
def test_auth_validation_errors_do_not_echo_credentials(client, path, payload, private_values) -> None:
    response = client.post(path, json=payload)
    assert response.status_code == 422
    assert all(value not in response.text for value in private_values)
    assert all(set(error) == {"loc", "msg", "type"} for error in response.json()["detail"])


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