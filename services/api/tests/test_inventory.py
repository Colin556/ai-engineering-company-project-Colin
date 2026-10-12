from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor
import os
import sqlite3
from threading import Barrier
from urllib.parse import urlsplit

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select

import database
from database import get_db, postgresql_url
from main import app
from models import Ingredient, IngredientEntry, IngredientExit
import routers.inventory as inventory
from seed_inventory import seed_inventory


@pytest.fixture
def inventory_db(tmp_path, monkeypatch):
    def connect():
        connection = sqlite3.connect(tmp_path / "inventory.db", check_same_thread=False)
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    engine = create_engine("sqlite://", creator=connect)
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(database, "engine", engine)

    def session_dependency():
        with Session(engine, expire_on_commit=False) as session:
            yield session

    app.dependency_overrides[get_db] = session_dependency
    yield engine
    app.dependency_overrides.pop(get_db, None)
    engine.dispose()


@pytest.fixture
def inventory_client(inventory_db):
    with TestClient(app) as client:
        yield client


def product_payload(**changes):
    return {
        "name": "Beef brisket", "sku": "BRS-BEEF-001", "unit": "kg",
        "category": "meat", "country": "CO", **changes,
    }


def test_order_history_controls_stock(inventory_client, inventory_db, register_and_login):
    user, headers = register_and_login()
    response = inventory_client.post("/inventory/products", json=product_payload(), headers=headers)
    assert response.status_code == 201, response.text
    ingredient = response.json()
    assert ingredient["current_stock"] == 0
    ingredient_id = ingredient["id"]
    for quantity in (50, 30):
        response = inventory_client.post("/inventory/orders/inbound", headers=headers, json={
            "ingredient_id": ingredient_id, "quantity": quantity,
            "supplier_name": "Carnes del Valle S.A.", "location_id": 1,
        })
        assert response.status_code == 201, response.text
        assert response.json()["user_uuid"] == user["id"]
    for quantity, reason in ((10, "consumption"), (5, "waste")):
        response = inventory_client.post("/inventory/orders/outbound", headers=headers, json={
            "ingredient_id": ingredient_id, "quantity": quantity, "reason": reason, "location_id": 2,
        })
        assert response.status_code == 201, response.text
        assert response.json()["user_uuid"] == user["id"]
    assert inventory_client.get(f"/inventory/products/{ingredient_id}", headers=headers).json()["current_stock"] == 65
    assert inventory_client.get("/inventory/products", headers=headers).json()[0]["current_stock"] == 65
    response = inventory_client.post("/inventory/orders/outbound", headers=headers, json={
        "ingredient_id": ingredient_id, "quantity": 66, "reason": "consumption", "location_id": 1,
    })
    assert response.status_code == 400
    assert response.json()["detail"] == "Insufficient stock for ingredient 'Beef brisket'. Available: 65.0, requested: 66.0."
    orders = inventory_client.get("/inventory/orders", headers=headers).json()
    assert len(orders) == 4
    assert {order["order_type"] for order in orders} == {"inbound", "outbound"}
    assert all(order["ingredient"]["current_stock"] == 65 for order in orders)
    with Session(inventory_db) as session:
        assert len(session.exec(select(IngredientExit)).all()) == 2
    assert "current_stock" not in Ingredient.__table__.columns
    assert set(SQLModel.metadata.tables) == {"ingredient", "ingrediententry", "ingredientexit"}


@pytest.mark.parametrize("method,path", [
    ("get", "/inventory/products"), ("get", "/inventory/products/1"),
    ("get", "/inventory/orders"), ("post", "/inventory/products"),
    ("post", "/inventory/orders/inbound"), ("post", "/inventory/orders/outbound"),
])
def test_inventory_requires_auth(inventory_client, method, path):
    response = getattr(inventory_client, method)(path)
    assert response.status_code == 401


@pytest.mark.parametrize("changes", [
    {"name": " "}, {"sku": " "}, {"unit": "pound"}, {"category": "other"},
    {"country": "CA"}, {"current_stock": 10}, {"id": 100},
])
def test_product_validation(inventory_client, register_and_login, changes):
    _, headers = register_and_login()
    response = inventory_client.post("/inventory/products", headers=headers, json=product_payload(**changes))
    assert response.status_code == 422
    assert inventory_client.get("/inventory/products", headers=headers).json() == []


@pytest.mark.parametrize("route,extra", [
    ("inbound", {"supplier_name": "Carnes del Valle S.A."}),
    ("outbound", {"reason": "consumption"}),
])
@pytest.mark.parametrize("changes", [
    {"quantity": 0}, {"quantity": -1}, {"quantity": "NaN"}, {"quantity": "Infinity"},
    {"quantity": "0.0000001"}, {"location_id": 0}, {"location_id": 15},
    {"user_uuid": "forged-user"}, {"created_at": "2026-01-01T00:00:00Z"},
])
def test_order_validation(inventory_client, register_and_login, route, extra, changes):
    _, headers = register_and_login()
    ingredient = inventory_client.post("/inventory/products", headers=headers, json=product_payload()).json()
    response = inventory_client.post(f"/inventory/orders/{route}", headers=headers, json={
        "ingredient_id": ingredient["id"], "quantity": 1, "location_id": 1, **extra, **changes,
    })
    assert response.status_code == 422, response.text
    assert inventory_client.get("/inventory/orders", headers=headers).json() == []


def test_missing_ingredients_duplicate_sku_and_zero_stock(inventory_client, register_and_login):
    _, headers = register_and_login()
    assert inventory_client.get("/inventory/products/999", headers=headers).status_code == 404
    for route, extra in (("inbound", {"supplier_name": "Supplier"}), ("outbound", {"reason": "waste"})):
        response = inventory_client.post(f"/inventory/orders/{route}", headers=headers, json={
            "ingredient_id": 999, "quantity": 1, "location_id": 1, **extra,
        })
        assert response.status_code == 404
    product = inventory_client.post("/inventory/products", headers=headers, json=product_payload()).json()
    assert inventory_client.post("/inventory/products", headers=headers, json=product_payload()).status_code == 409
    assert inventory_client.post("/inventory/orders/outbound", headers=headers, json={
        "ingredient_id": product["id"], "quantity": 1, "reason": "waste", "location_id": 1,
    }).status_code == 400
    assert inventory_client.get("/inventory/products", headers=headers).json() == [product]


def test_reasons_supplier_and_decimal_boundary(inventory_client, register_and_login):
    user, headers = register_and_login()
    product = inventory_client.post("/inventory/products", headers=headers, json=product_payload()).json()
    payload = {"ingredient_id": product["id"], "quantity": 1, "location_id": 14}
    for reason in ("sale", "Waste", ""):
        assert inventory_client.post("/inventory/orders/outbound", headers=headers, json={
            **payload, "reason": reason,
        }).status_code == 422
    assert inventory_client.post("/inventory/orders/inbound", headers=headers, json={
        **payload, "supplier_name": " ",
    }).status_code == 422
    for quantity in (0.1, 0.2):
        assert inventory_client.post("/inventory/orders/inbound", headers=headers, json={
            **payload, "quantity": quantity, "supplier_name": "Supplier",
        }).status_code == 201
    second_user, second_headers = register_and_login(email="staff@brasaland.co")
    response = inventory_client.post("/inventory/orders/outbound", headers=second_headers, json={
        **payload, "quantity": 0.3, "reason": "consumption",
    })
    assert response.status_code == 201, response.text
    assert response.json()["ingredient"]["current_stock"] == 0
    assert response.json()["user_uuid"] == second_user["id"] != user["id"]
    for method in ("patch", "put", "delete"):
        assert getattr(inventory_client, method)(f"/inventory/products/{product['id']}", headers=headers).status_code == 405


@pytest.mark.parametrize("model,extra", [
    (IngredientEntry, {"supplier_name": "Supplier"}), (IngredientExit, {"reason": "waste"}),
])
def test_foreign_keys_enforced_by_database(inventory_db, model, extra):
    with Session(inventory_db) as session:
        session.add(model.model_validate({
            "ingredient_id": 999, "quantity": 1, "location_id": 1,
            "user_uuid": "00000000-0000-0000-0000-000000000001", **extra,
        }))
        with pytest.raises(Exception) as error:
            session.commit()
        assert isinstance(error.value.orig, sqlite3.IntegrityError)
        assert "FOREIGN KEY constraint failed" in str(error.value.orig)
        session.rollback()


def test_seed_stock_filters_and_constant_query_count(inventory_client, inventory_db, register_and_login, monkeypatch):
    user, headers = register_and_login()
    with Session(inventory_db) as session:
        expected = seed_inventory(session, user["id"])
    assert expected == {
        "BRS-BEEF-001": 70, "BRS-PORK-001": 35, "BRS-SAUCE-001": 18,
        "BRS-SAUCE-002": 0, "BRS-PROD-001": 0, "BRS-PKG-001": 0,
    }
    with Session(inventory_db) as session:
        assert seed_inventory(session, user["id"]) == expected
        assert len(session.exec(select(Ingredient)).all()) == 6
        assert len(session.exec(select(IngredientEntry)).all()) == 4
        assert len(session.exec(select(IngredientExit)).all()) == 3
    products = inventory_client.get("/inventory/products", headers=headers).json()
    assert {product["sku"]: product["current_stock"] for product in products} == expected
    assert len(inventory_client.get("/inventory/products?country=CO", headers=headers).json()) == 4
    assert len(inventory_client.get("/inventory/products?country=US", headers=headers).json()) == 2
    orders = inventory_client.get("/inventory/orders?country=US&location_id=11", headers=headers).json()
    assert len(orders) == 2
    assert all(order["user_uuid"] == user["id"] and order["ingredient"]["country"] == "US" for order in orders)
    assert inventory_client.get("/inventory/products?country=CA", headers=headers).status_code == 422
    assert inventory_client.get("/inventory/orders?location_id=15", headers=headers).status_code == 422

    statements = []
    original_exec = Session.exec

    def counted_exec(session, statement, *args, **kwargs):
        statements.append(statement)
        return original_exec(session, statement, *args, **kwargs)

    monkeypatch.setattr(Session, "exec", counted_exec)
    assert len(inventory_client.get("/inventory/orders", headers=headers).json()) == 7
    assert len(statements) == 3
    monkeypatch.setattr(Session, "exec", original_exec)
    for quantity in range(1, 11):
        assert inventory_client.post("/inventory/orders/inbound", headers=headers, json={
            "ingredient_id": products[0]["id"], "quantity": quantity,
            "supplier_name": "Supplier", "location_id": 1,
        }).status_code == 201
    monkeypatch.setattr(Session, "exec", counted_exec)
    statements.clear()
    assert len(inventory_client.get("/inventory/orders", headers=headers).json()) == 17
    assert len(statements) == 3
    statements.clear()
    assert len(inventory_client.get("/inventory/products", headers=headers).json()) == 6
    assert len(statements) == 1


def test_seed_rejects_unknown_user(inventory_db):
    with Session(inventory_db) as session:
        with pytest.raises(ValueError, match="existing, active TinyDB"):
            seed_inventory(session, "missing-user")
        assert session.exec(select(Ingredient)).all() == []


@pytest.fixture
def postgres_db(monkeypatch):
    url = os.getenv("INVENTORY_TEST_DATABASE_URL", "")
    if not url:
        pytest.skip("Set INVENTORY_TEST_DATABASE_URL to an isolated PostgreSQL test database.")
    assert urlsplit(url).path == "/brasaland_inventory_test", "Only the dedicated test database may be used."
    engine = create_engine(postgresql_url(url), isolation_level="READ COMMITTED", pool_pre_ping=True)
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(database, "engine", engine)

    def session_dependency():
        with Session(engine, expire_on_commit=False) as session:
            yield session

    app.dependency_overrides[get_db] = session_dependency
    try:
        yield engine
    finally:
        app.dependency_overrides.pop(get_db, None)
        SQLModel.metadata.drop_all(engine)
        engine.dispose()


def test_postgres_concurrent_exits(postgres_db, register_and_login, monkeypatch):
    _, headers = register_and_login()
    with TestClient(app) as client:
        product = client.post("/inventory/products", headers=headers, json=product_payload()).json()
        assert client.post("/inventory/orders/inbound", headers=headers, json={
            "ingredient_id": product["id"], "quantity": 10,
            "supplier_name": "Supplier", "location_id": 1,
        }).status_code == 201
        barrier = Barrier(2)
        original_lock = inventory.lock_ingredient

        def simultaneous_lock(session, ingredient_id):
            barrier.wait(timeout=10)
            return original_lock(session, ingredient_id)

        monkeypatch.setattr(inventory, "lock_ingredient", simultaneous_lock)

        def create_exit():
            return client.post("/inventory/orders/outbound", headers=headers, json={
                "ingredient_id": product["id"], "quantity": 7,
                "reason": "consumption", "location_id": 1,
            })

        with ThreadPoolExecutor(max_workers=2) as executor:
            requests = [executor.submit(create_exit) for _ in range(2)]
            responses = [request.result(timeout=20) for request in requests]
        assert sorted(response.status_code for response in responses) == [201, 400]
        assert client.get(f"/inventory/products/{product['id']}", headers=headers).json()["current_stock"] == 3
        assert len(client.get("/inventory/orders", headers=headers).json()) == 2


def test_postgres_foreign_keys_and_reason_enum(postgres_db):
    with Session(postgres_db) as session:
        session.add(IngredientEntry.model_validate({
            "ingredient_id": 999, "quantity": 1, "supplier_name": "Supplier",
            "location_id": 1, "user_uuid": "00000000-0000-0000-0000-000000000001",
        }))
        with pytest.raises(Exception) as error:
            session.commit()
        assert error.value.orig.pgcode == "23503"
        session.rollback()
        ingredient = Ingredient.model_validate(product_payload())
        session.add(ingredient)
        session.commit()
        session.refresh(ingredient)
        session.add(IngredientExit(
            ingredient_id=ingredient.id, quantity=Decimal(1), reason="invalid",
            location_id=1, user_uuid="00000000-0000-0000-0000-000000000001",
        ))
        with pytest.raises(Exception) as error:
            session.commit()
        assert error.value.orig.pgcode == "22P02"
        session.rollback()