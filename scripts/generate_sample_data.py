#!/usr/bin/env python3
"""One-off generator for the 100-record sample incidents CSV used to validate
Phase 1 of the Incident File Analyzer. Deterministic (fixed seed) so the
expected values documented in the README stay stable.
"""

import csv
import random
from datetime import date, timedelta

random.seed(42)

CATEGORIES = ["billing", "technical", "shipping", "product", "other"]
STATUSES = ["open", "closed", "discarded"]
FIELDS = [
    "incident_id",
    "customer_id",
    "customer_name",
    "email",
    "phone",
    "category",
    "status",
    "satisfaction_score",
    "created_at",
]

NAMES = [
    "Laura Gomez", "Carlos Ruiz", "Maria Torres", "Andres Diaz", "Sofia Lopez",
    "Juan Perez", "Camila Rios", "Diego Marin", "Valentina Ortiz", "Felipe Cano",
]

rows = []
start_date = date(2026, 1, 1)

for i in range(1, 101):
    incident_id = f"INC-{i:04d}"
    customer_id = f"CUST-{i:04d}"
    customer_name = random.choice(NAMES)
    email = f"customer{i}@example.com"
    phone = f"+57 300 {1000000 + i}"
    category = random.choice(CATEGORIES)
    status = random.choice(STATUSES)
    satisfaction_score = ""
    if status == "closed" and random.random() < 0.7:
        satisfaction_score = str(random.randint(1, 5))
    created_at = (start_date + timedelta(days=i)).isoformat()

    row = {
        "incident_id": incident_id,
        "customer_id": customer_id,
        "customer_name": customer_name,
        "email": email,
        "phone": phone,
        "category": category,
        "status": status,
        "satisfaction_score": satisfaction_score,
        "created_at": created_at,
    }
    rows.append(row)

# Inject deliberate invalid records (documented set, indices 1-based on final list).
rows[4]["email"] = ""  # missing required field
rows[19]["category"] = "urgent"  # invalid category value
rows[34]["status"] = "pending"  # invalid status value
rows[49]["customer_name"] = ""  # missing required field
rows[64]["incident_id"] = ""  # missing required field
rows[79]["category"] = "misc"  # invalid category value

with open("incidents-brasaland.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=FIELDS)
    writer.writeheader()
    writer.writerows(rows)

print("Generated incidents-brasaland.csv with", len(rows), "records.")
