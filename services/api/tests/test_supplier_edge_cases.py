from fastapi.testclient import TestClient


def test_supplier_filters_can_return_no_matches(client: TestClient) -> None:
    response = client.get("/suppliers", params={"country": "US", "category": "sauce"})

    assert response.status_code == 200
    assert response.json() == []


def test_supplier_accepts_smallest_positive_rate(
    client: TestClient, register_and_login
) -> None:
    _, headers = register_and_login(email="supplier-edge@brasaland.co")
    response = client.post(
        "/suppliers",
        headers=headers,
        json={
            "name": "Boundary Rate Supplier",
            "country": "CO",
            "product_categories": ["produce"],
            "rate_per_unit": 0.01,
            "status": "active",
        },
    )

    assert response.status_code == 201
    assert response.json()["rate_per_unit"] == 0.01


def test_missing_supplier_cannot_be_updated_or_deleted(
    client: TestClient, register_and_login
) -> None:
    _, headers = register_and_login(email="supplier-missing@brasaland.co")

    rate = client.patch(
        "/suppliers/9999/rate",
        json={"rate_per_unit": 1},
        headers=headers,
    )
    status = client.patch(
        "/suppliers/9999/status",
        json={"status": "active"},
        headers=headers,
    )
    delete = client.delete("/suppliers/9999", headers=headers)

    assert rate.status_code == status.status_code == delete.status_code == 404