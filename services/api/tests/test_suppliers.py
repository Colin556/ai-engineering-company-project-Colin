from fastapi.testclient import TestClient
import pytest

from database import suppliers_table
from main import app
from seed import seed_suppliers


client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_suppliers():
    suppliers_table.truncate()
    seed_suppliers()
    yield
    suppliers_table.truncate()
    seed_suppliers()


def test_seed_and_combined_filters() -> None:
    response = client.get("/suppliers")
    assert response.status_code == 200
    assert len(response.json()) == 3

    response = client.get(
        "/suppliers", params={"country": "CO", "category": "sauce"}
    )
    assert response.status_code == 200
    assert [supplier["name"] for supplier in response.json()] == [
        "Salsas Artesanales Ltda."
    ]


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
def test_create_rejects_invalid_supplier(payload: dict) -> None:
    response = client.post("/suppliers", json=payload)
    assert response.status_code == 422


def test_supplier_crud() -> None:
    create_response = client.post(
        "/suppliers",
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

    detail_response = client.get(f"/suppliers/{supplier_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["name"] == "CleanCo Florida"

    rate_response = client.patch(
        f"/suppliers/{supplier_id}/rate", json={"rate_per_unit": 13.75}
    )
    assert rate_response.status_code == 200
    assert rate_response.json()["rate_per_unit"] == 13.75
    assert rate_response.json()["updated_at"] != created["updated_at"]

    invalid_rate_response = client.patch(
        f"/suppliers/{supplier_id}/rate", json={"rate_per_unit": -1}
    )
    assert invalid_rate_response.status_code == 422

    status_response = client.patch(
        f"/suppliers/{supplier_id}/status", json={"status": "suspended"}
    )
    assert status_response.status_code == 200
    assert status_response.json()["status"] == "suspended"

    delete_response = client.delete(f"/suppliers/{supplier_id}")
    assert delete_response.status_code == 204
    assert client.get(f"/suppliers/{supplier_id}").status_code == 404
    assert client.delete(f"/suppliers/{supplier_id}").status_code == 404