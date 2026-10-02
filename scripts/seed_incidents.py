#!/usr/bin/env python3
"""Load historical customer incidents into the backoffice TinyDB store."""

from __future__ import annotations

import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

API_DIR = Path(__file__).resolve().parent.parent / "services" / "api"
sys.path.insert(0, str(API_DIR))

from core import db_lock, incidents_table  # noqa: E402
from incident_analysis import load_records, validate_record  # noqa: E402
from incident_catalog import (  # noqa: E402
    BRANCHES,
    BRANCH_LABEL_TO_VALUE,
    CSV_CATEGORY_MAP,
    CSV_STATUS_MAP,
)

DEFAULT_CSV_PATH = Path(__file__).with_name("incidents-brasaland.csv")
FALLBACK_DESCRIPTIONS = {
    "billing": "The customer reported a billing issue that needs review.",
    "technical": "The customer reported a technical issue that needs review.",
    "shipping": "The customer reported a delivery issue that needs review.",
    "product": "The customer reported a product issue that needs review.",
    "other": "The customer reported an issue that needs support follow-up.",
}
CITY_BRANCHES = {
    "medellin": "LOC-MEDELLIN-01",
    "bogota": "LOC-BOGOTA-01",
    "cali": "LOC-CALI-01",
    "miami": "LOC-MIAMI-01",
    "orlando": "LOC-ORLANDO-01",
}


def map_location_to_branch(location: str | None) -> str | None:
    if not location or not location.strip():
        return "central"

    raw_value = location.strip()
    branch_values = {branch["value"] for branch in BRANCHES}
    if raw_value in branch_values:
        return raw_value

    normalized = raw_value.casefold()
    if normalized in BRANCH_LABEL_TO_VALUE:
        return BRANCH_LABEL_TO_VALUE[normalized]

    slug = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")
    if slug.startswith("loc-"):
        candidate = slug.upper()
        return candidate if candidate in branch_values else None
    return CITY_BRANCHES.get(slug)


def parse_created_at(row: dict[str, Any]) -> datetime:
    raw_value = (row.get("created_at") or row.get("date") or "").strip()
    if not raw_value:
        raise ValueError("missing_created_at")
    try:
        parsed = datetime.fromisoformat(raw_value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("invalid_created_at") from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def title_from_description(description: str) -> str:
    first_sentence = re.split(r"[.!?\n]", description, maxsplit=1)[0].strip()
    if len(first_sentence) > 160:
        return first_sentence[:157].rstrip() + "..."
    return first_sentence or "Historical customer incident"


def transform_row(row: dict[str, Any]) -> tuple[dict[str, Any] | None, list[str]]:
    issues = validate_record(row)
    category = (row.get("category") or "").strip().lower()
    status = (row.get("status") or "").strip().lower()
    incident_id = (row.get("incident_id") or "").strip()

    branch = map_location_to_branch(row.get("location"))
    if branch is None:
        issues.append("invalid_location")

    try:
        created_at = parse_created_at(row)
    except ValueError as error:
        issues.append(str(error))
        created_at = None

    if issues:
        return None, issues

    description = (row.get("description") or "").strip()
    if not description:
        description = FALLBACK_DESCRIPTIONS[category]

    return {
        "source_incident_id": incident_id,
        "title": title_from_description(description),
        "description": description,
        "category": CSV_CATEGORY_MAP[category],
        "status": CSV_STATUS_MAP[status],
        "origin": "customer",
        "branch": branch,
        "created_at": created_at.isoformat(),
        "updated_at": created_at.isoformat(),
    }, []


def seed_incidents(csv_path: Path = DEFAULT_CSV_PATH) -> dict[str, Any]:
    rows = load_records(str(csv_path))
    inserted = 0
    skipped = 0
    invalid_rows: list[tuple[int, str, list[str]]] = []

    with db_lock:
        existing_source_ids = {
            document.get("source_incident_id")
            for document in incidents_table.all()
            if document.get("source_incident_id")
        }
        for row_number, row in enumerate(rows, start=2):
            document, issues = transform_row(row)
            if issues:
                source_id = (row.get("incident_id") or "").strip() or "(missing id)"
                invalid_rows.append((row_number, source_id, issues))
                continue
            source_id = document["source_incident_id"]
            if source_id in existing_source_ids:
                skipped += 1
                continue
            incidents_table.insert(document)
            existing_source_ids.add(source_id)
            inserted += 1

    return {
        "total": len(rows),
        "inserted": inserted,
        "skipped": skipped,
        "invalid_rows": invalid_rows,
    }


def main() -> None:
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV_PATH
    try:
        result = seed_incidents(csv_path)
    except (OSError, ValueError) as error:
        print(f"Could not seed incidents: {error}")
        raise SystemExit(1) from error

    print(
        "Incident seeding complete: "
        f"{result['inserted']} inserted, {result['skipped']} already present, "
        f"{len(result['invalid_rows'])} invalid of {result['total']} rows."
    )
    for row_number, source_id, issues in result["invalid_rows"]:
        print(f"Row {row_number} ({source_id}): {', '.join(issues)}")


if __name__ == "__main__":
    main()