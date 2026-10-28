from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest

from core import incidents_table, suppliers_table
from response_cache import ReadCache


def test_cache_expiry_is_fixed_and_values_are_isolated():
    now = [0.0]
    cache = ReadCache(ttl=10, max_bytes=1000, timer=lambda: now[0])
    loads = []

    def load():
        loads.append(True)
        return {"items": [len(loads)]}

    first = cache.get_or_load("key", load)
    first["items"].append("private mutation")
    now[0] = 9
    assert cache.get_or_load("key", load) == {"items": [1]}
    now[0] = 10
    assert cache.get_or_load("key", load) == {"items": [2]}
    assert len(loads) == 2
    cache.invalidate()
    assert cache.get_or_load("key", load) == {"items": [3]}


def test_cache_limits_and_disable_switch(monkeypatch):
    cache = ReadCache(ttl=10, max_bytes=10, max_entries=1)
    assert cache.get_or_load("one", lambda: [1]) == [1]
    assert cache.get_or_load("two", lambda: [2]) == [2]
    assert cache.get_or_load("one", lambda: [3]) == [3]
    assert cache.get_or_load("large", lambda: "x" * 100) == "x" * 100
    assert cache.get_or_load("large", lambda: "new") == "new"
    monkeypatch.setenv("RESPONSE_CACHE_ENABLED", "0")
    assert cache.get_or_load("one", lambda: [4]) == [4]
    assert cache.get_or_load("one", lambda: [5]) == [5]
    with pytest.raises(ValueError):
        ReadCache(ttl=0, max_bytes=10)


def test_failed_load_is_not_cached():
    cache = ReadCache(ttl=10, max_bytes=100)
    with pytest.raises(RuntimeError):
        cache.get_or_load("key", lambda: (_ for _ in ()).throw(RuntimeError("failed")))
    assert cache.get_or_load("key", lambda: {"ok": True}) == {"ok": True}


def test_cold_requests_share_a_load_and_invalidation_cannot_repopulate_old_data():
    cache = ReadCache(ttl=10, max_bytes=100)
    entered = Event()
    release = Event()
    loads = []

    def load():
        loads.append(True)
        entered.set()
        assert release.wait(timeout=3)
        return [1]

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(cache.get_or_load, "key", load)
        assert entered.wait(timeout=3)
        second = pool.submit(cache.get_or_load, "key", load)
        release.set()
        assert first.result(timeout=3) == second.result(timeout=3) == [1]
    assert len(loads) == 1
    with ThreadPoolExecutor(max_workers=2) as pool:
        entered.clear()
        release.clear()
        cache.invalidate()
        first = pool.submit(cache.get_or_load, "key", load)
        assert entered.wait(timeout=3)
        invalidation = pool.submit(cache.invalidate)
        release.set()
        assert first.result(timeout=3) == [1]
        invalidation.result(timeout=3)
    assert cache.get_or_load("key", lambda: [2]) == [2]


def test_summary_cache_hits_and_invalidates_on_both_status_routes(client, register_and_login, monkeypatch):
    _, headers = register_and_login()
    reads = []
    original = incidents_table.all

    def counted():
        reads.append(True)
        return original()

    monkeypatch.setattr(incidents_table, "all", counted)
    assert client.get("/api/incidents/summary").json()["total"] == 0
    assert client.get("/api/incidents/summary").json()["total"] == 0
    assert len(reads) == 1
    created = client.post("/api/incidents", headers=headers, json={
        "title": "Cache test", "description": "Changed summary", "category": "other",
        "origin": "internal", "branch": "central", "status": "open",
    })
    assert created.status_code == 201
    assert client.get("/api/incidents/summary").json()["by_status"]["open"] == 1
    incident_id = created.json()["id"]
    assert client.patch(f"/api/incidents/{incident_id}/status", headers=headers, json={"status": "in_progress"}).status_code == 200
    assert client.get("/api/incidents/summary").json()["by_status"]["in_progress"] == 1
    assert client.get(f"/api/incidents/{incident_id}/status?status=resolved", headers=headers).status_code == 200
    assert client.get("/api/incidents/summary").json()["by_status"]["resolved"] == 1
    assert len(reads) == 4


def test_supplier_cache_keys_and_all_write_invalidations(client, register_and_login, monkeypatch):
    _, headers = register_and_login()
    reads = []
    original = suppliers_table.all

    def counted():
        reads.append(True)
        return original()

    monkeypatch.setattr(suppliers_table, "all", counted)
    for path in ("/suppliers?country=CO&category=meat", "/suppliers?category=meat&country=CO"):
        assert client.get(path).status_code == 200
    assert len(reads) == 1
    assert client.get("/suppliers?country=US&category=meat").json()[0]["country"] == "US"
    assert len(reads) == 2
    assert client.get("/suppliers?country=invalid").status_code == 422
    created = client.post("/suppliers", headers=headers, json={
        "name": "Cache Supplier", "country": "CO", "product_categories": ["meat"],
        "rate_per_unit": 5, "status": "active",
    })
    assert created.status_code == 201
    supplier_id = created.json()["id"]

    def cached_supplier():
        return next(row for row in client.get("/suppliers?country=CO&category=meat").json() if row["id"] == supplier_id)

    assert cached_supplier()["rate_per_unit"] == 5
    assert client.patch(f"/suppliers/{supplier_id}/rate", headers=headers, json={"rate_per_unit": 7}).status_code == 200
    assert cached_supplier()["rate_per_unit"] == 7
    assert client.patch(f"/suppliers/{supplier_id}/status", headers=headers, json={"status": "suspended"}).status_code == 200
    assert cached_supplier()["status"] == "suspended"
    assert client.delete(f"/suppliers/{supplier_id}", headers=headers).status_code == 204
    assert all(row["id"] != supplier_id for row in client.get("/suppliers?country=CO&category=meat").json())
    assert len(reads) == 6