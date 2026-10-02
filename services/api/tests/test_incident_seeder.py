import csv

from seed_incidents import seed_incidents
from core import incidents_table


def test_seed_is_idempotent_and_transforms_legacy_rows(tmp_path) -> None:
    csv_path = tmp_path / "incidents.csv"
    rows = [
        {
            "incident_id": "INC-0001",
            "customer_id": "CUST-0001",
            "customer_name": "Sample Customer",
            "email": "sample@example.com",
            "category": "billing",
            "status": "closed",
            "created_at": "2026-01-02",
            "description": "Incorrect final charge. Customer needs follow-up.",
            "location": "LOC-MIAMI-01",
        },
        {
            "incident_id": "INC-0002",
            "customer_id": "CUST-0002",
            "customer_name": "Another Customer",
            "email": "another@example.com",
            "category": "unknown",
            "status": "open",
            "created_at": "2026-01-03",
        },
    ]
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)

    first = seed_incidents(csv_path)
    second = seed_incidents(csv_path)

    assert first["inserted"] == 1
    assert len(first["invalid_rows"]) == 1
    assert second["inserted"] == 0
    assert second["skipped"] == 1
    seeded = incidents_table.all()[0]
    assert seeded["title"] == "Incorrect final charge"
    assert seeded["category"] == "billing"
    assert seeded["status"] == "resolved"
    assert seeded["origin"] == "customer"
    assert seeded["branch"] == "LOC-MIAMI-01"
    assert seeded["created_at"] == seeded["updated_at"]


def test_legacy_row_without_description_or_location_uses_central(tmp_path) -> None:
    csv_path = tmp_path / "legacy-incidents.csv"
    row = {
        "incident_id": "INC-LEGACY-1",
        "customer_id": "CUST-1",
        "customer_name": "Sample Customer",
        "email": "sample@example.com",
        "category": "technical",
        "status": "open",
        "created_at": "2026-01-02",
    }
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=row.keys())
        writer.writeheader()
        writer.writerow(row)

    result = seed_incidents(csv_path)

    assert result["inserted"] == 1
    seeded = incidents_table.all()[0]
    assert seeded["branch"] == "central"
    assert "technical issue" in seeded["description"]