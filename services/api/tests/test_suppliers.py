from fastapi.testclient import TestClient
import pytest


@pytest.fixture
def auth_headers(register_and_login) -> dict[str, str]:
    _, headers = register_and_login(email="supplier-tester@brasaland.co")
    return headers


def test_seed_and_combined_filters(client: TestClient, auth_headers: dict) -> None:
    response = client.get("/suppliers", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 3

    response = client.get(
        "/suppliers",
        params={"country": "CO", "category": "sauce"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert [supplier["name"] for supplier in response.json()] == [
        "Salsas Artesanales Ltda."
    ]


def test_supplier_reads_are_public_and_writes_require_authentication(
    client: TestClient,
) -> None:
    assert client.get("/suppliers").status_code == 200
    assert client.get("/suppliers/1").status_code == 200

    assert client.post("/suppliers", json={}).status_code == 401
    assert client.patch("/suppliers/1/rate", json={"rate_per_unit": 1}).status_code == 401
    assert (
        client.patch("/suppliers/1/status", json={"status": "active"}).status_code == 401
    )
    assert client.delete("/suppliers/1").status_code == 401


@pytest.mark.parametrize(
    "payload",
    [
        {
            "name": "Missing Country",
            "product_categories": ["meat"],
            "rate_per_unit": 10,
            "status": "active",
        },
        {
            "name": "Bad Status",
            "country": "CO",
            "product_categories": ["meat"],
            "rate_per_unit": 10,
            "status": "pending",
        },
        {
            "name": "Bad Rate",
            "country": "US",
            "product_categories": ["packaging"],
            "rate_per_unit": 0,
            "status": "active",
        },
    ],
)
def test_create_rejects_invalid_supplier(
    client: TestClient, auth_headers: dict, payload: dict
) -> None:
    response = client.post("/suppliers", json=payload, headers=auth_headers)
    assert response.status_code == 422


def test_supplier_crud(client: TestClient, auth_headers: dict) -> None:
    create_response = client.post(
        "/suppliers",
        headers=auth_headers,
        json={
            "name": "CleanCo Florida",
            "country": "US",
            "product_categories": ["cleaning"],
            "rate_per_unit": 12.25,
            "status": "active",
        },
    )
    assert create_response.status_code == 201
    created = create_response.json()
    supplier_id = created["id"]

    detail_response = client.get(f"/suppliers/{supplier_id}", headers=auth_headers)
    assert detail_response.status_code == 200
    assert detail_response.json()["name"] == "CleanCo Florida"

    rate_response = client.patch(
        f"/suppliers/{supplier_id}/rate",
        json={"rate_per_unit": 13.75},
        headers=auth_headers,
    )
    assert rate_response.status_code == 200
    assert rate_response.json()["rate_per_unit"] == 13.75
    assert rate_response.json()["updated_at"] != created["updated_at"]

    invalid_rate_response = client.patch(
        f"/suppliers/{supplier_id}/rate",
        json={"rate_per_unit": -1},
        headers=auth_headers,
    )
    assert invalid_rate_response.status_code == 422

    status_response = client.patch(
        f"/suppliers/{supplier_id}/status",
        json={"status": "suspended"},
        headers=auth_headers,
    )
    assert status_response.status_code == 200
    assert status_response.json()["status"] == "suspended"

    delete_response = client.delete(f"/suppliers/{supplier_id}", headers=auth_headers)
    assert delete_response.status_code == 204
    assert (
        client.get(f"/suppliers/{supplier_id}", headers=auth_headers).status_code == 404
    )
    assert (
        client.delete(f"/suppliers/{supplier_id}", headers=auth_headers).status_code
        == 404
    )
