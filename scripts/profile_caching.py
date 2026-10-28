"""Seed disposable databases and measure repeat reads; never open application data."""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
from math import ceil
import os
import statistics
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from time import perf_counter
from uuid import UUID


def seed_dataset(incident_count: int, supplier_count: int, product_count: int, order_count: int) -> dict:
    from sqlalchemy import insert
    from sqlmodel import Session, SQLModel

    from core import hash_password, incidents_table, profiles_table, suppliers_table, users_table
    from database import engine
    from incident_catalog import BRANCHES
    from models import Ingredient, IngredientEntry, IngredientExit
    from response_cache import incident_summary_cache, supplier_list_cache
    from suppliers import seed_suppliers

    for table in (incidents_table, suppliers_table, users_table, profiles_table):
        table.truncate()
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    hashed_password = hash_password("LocalProfile123!")
    user_ids = [str(UUID(int=index + 1)) for index in range(10)]
    users_table.insert_multiple([
        {"id": user_id, "email": f"profile-{index}@example.com", "hashed_password": hashed_password,
         "is_active": True, "role": "user", "created_at": start.isoformat()}
        for index, user_id in enumerate(user_ids)
    ])
    profiles_table.insert_multiple([
        {"id": str(UUID(int=index + 101)), "user_id": user_id, "name": f"Operator {index}",
         "phone": None, "address": None}
        for index, user_id in enumerate(user_ids)
    ])
    categories = ["billing", "technical", "shipping", "product", "other"]
    statuses = ["open", "in_progress", "resolved", "discarded"]
    origins = ["customer", "branch", "internal"]
    branches = [branch["value"] for branch in BRANCHES if branch["value"] != "central"]
    incidents_table.insert_multiple([
        {"title": f"{categories[index % 5].title()} issue at shift {index}",
         "description": f"Synthetic incident {index}: investigate the checkout, delivery or kitchen workflow.",
         "category": categories[index % 5], "status": statuses[(index // 5) % 4],
         "origin": origins[(index // 20) % 3], "branch": branches[index % len(branches)],
         "created_at": (start + timedelta(minutes=index * 11)).isoformat(),
         "updated_at": (start + timedelta(minutes=index * 11 + index % 17)).isoformat()}
        for index in range(incident_count)
    ])
    supplier_categories = ["meat", "produce", "sauce", "beverage", "packaging", "cleaning"]
    suppliers_table.insert_multiple([
        {"name": f"{['Valley', 'Coastal', 'Mountain', 'Central'][index % 4]} Supply {index:05d}",
         "country": "CO" if (index // 6 + index) % 3 else "US",
         "product_categories": [supplier_categories[index % 6]],
         "rate_per_unit": round(1.25 + (index * 17 % 9000) / 100, 2),
         "status": "suspended" if index % 11 == 0 else "active",
         "updated_at": (start + timedelta(hours=index)).isoformat()}
        for index in range(supplier_count)
    ])
    with Session(engine) as session:
        session.execute(insert(Ingredient), [
            {"id": index + 1, "name": f"{supplier_categories[index % 6].title()} ingredient {index:05d}",
             "sku": f"PROFILE-{index:06d}", "unit": ["kg", "litre", "unit"][index % 3],
             "category": supplier_categories[index % 6], "country": "CO" if (index // 6 + index) % 3 else "US"}
            for index in range(product_count)
        ])
        for model, outbound in ((IngredientEntry, False), (IngredientExit, True)):
            rows = []
            count = order_count // 2 if outbound else order_count - order_count // 2
            for index in range(count):
                row = {
                    "ingredient_id": index % product_count + 1,
                    "quantity": (1 + index % 3) if outbound else (20 + index % 30),
                    "location_id": index % 14 + 1, "user_uuid": user_ids[index % 10],
                    "created_at": start + timedelta(minutes=index * 3 + int(outbound)),
                }
                if outbound:
                    row["reason"] = "waste" if index % 7 == 0 else "consumption"
                else:
                    supplier_index = index % supplier_count
                    row["supplier_name"] = f"{['Valley', 'Coastal', 'Mountain', 'Central'][supplier_index % 4]} Supply {supplier_index:05d}"
                rows.append(row)
            session.execute(insert(model), rows)
        session.commit()
    seed_suppliers()
    incident_summary_cache.invalidate()
    supplier_list_cache.invalidate()
    return {"incidents": incident_count, "suppliers": len(suppliers_table.all()), "products": product_count,
            "orders": order_count, "users": len(user_ids)}


def measure_requests(requests: int, expected_rows: dict) -> list[dict]:
    from fastapi.testclient import TestClient

    from core import create_access_token
    from main import app

    token, _ = create_access_token(str(UUID(int=1)), "user")
    paths = [
        "/api/incidents/options", "/api/incidents/summary",
        "/api/incidents?status=open&category=technical", "/suppliers",
        "/suppliers?country=CO&category=meat", "/inventory/products?country=CO",
        "/inventory/orders?country=CO&location_id=2", "/users",
    ]
    results = []
    with TestClient(app) as client:
        for path in paths:
            elapsed = []
            server = []
            cold_ms = None
            payload_bytes = 0
            for index in range(requests + 1):
                started = perf_counter()
                response = client.get(path, headers={"Authorization": f"Bearer {token}"})
                duration = (perf_counter() - started) * 1000
                response.raise_for_status()
                if path == "/api/incidents/summary":
                    assert response.json()["total"] == expected_rows["incidents"]
                if path == "/suppliers":
                    assert len(response.json()) == expected_rows["suppliers"]
                payload_bytes = len(response.content)
                if index == 0:
                    cold_ms = duration
                else:
                    elapsed.append(duration)
                    server.append(float(response.headers["Server-Timing"].split("=")[1]))
            results.append({"path": path, "requests": requests, "cold_ms": round(cold_ms, 3),
                            "median_ms": round(statistics.median(elapsed), 3),
                            "p95_ms": round(sorted(elapsed)[ceil(len(elapsed) * .95) - 1], 3),
                            "min_ms": round(min(elapsed), 3), "max_ms": round(max(elapsed), 3),
                            "server_median_ms": round(statistics.median(server), 3),
                            "payload_bytes": payload_bytes,
                            "payload_sha256": hashlib.sha256(response.content).hexdigest()})
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--incidents", type=int, default=20000)
    parser.add_argument("--suppliers", type=int, default=1200)
    parser.add_argument("--products", type=int, default=600)
    parser.add_argument("--orders", type=int, default=12000)
    parser.add_argument("--requests", type=int, default=15)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--serve-port", type=int, help="Keep the generated large dataset running for browser profiling")
    arguments = parser.parse_args()
    if min(arguments.incidents, arguments.suppliers, arguments.products, arguments.orders, arguments.requests) < 2:
        parser.error("Dataset counts and requests must be at least 2")
    with TemporaryDirectory(prefix="brasaland-cache-profile-") as temporary:
        os.environ.update({
            "SUPPLIERS_DB_PATH": str(Path(temporary) / "profile.json"),
            "DATABASE_URL": f"sqlite:///{temporary}/inventory.sqlite",
            "SECRET_KEY": "disposable-local-profiling-key-not-for-production",
            "RESEND_API_KEY": "", "APP_ENV": "development",
        })
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "api"))
        arguments.output.parent.mkdir(parents=True, exist_ok=True)
        logger = logging.getLogger("uvicorn.error.timing")
        logger.setLevel(logging.INFO)
        handler = logging.FileHandler(arguments.output.with_suffix(".log"), mode="w")
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)
        result = {"date": datetime.now(timezone.utc).isoformat(), "environment": "local TestClient, SQLite + TinyDB",
                  "cache_enabled": os.getenv("RESPONSE_CACHE_ENABLED", "1") != "0", "stages": {}}
        for name, counts in [
            ("small", (20, 6, 6, 60)),
            ("large", (arguments.incidents, arguments.suppliers, arguments.products, arguments.orders)),
        ]:
            counts = seed_dataset(*counts)
            result["stages"][name] = {"rows": counts, "endpoints": measure_requests(arguments.requests, counts)}
            print(f"{name}: {json.dumps(result['stages'][name])}")
        arguments.output.write_text(json.dumps(result, indent=2) + "\n")
        if arguments.serve_port:
            import uvicorn

            uvicorn.run("main:app", host="127.0.0.1", port=arguments.serve_port)


if __name__ == "__main__":
    main()