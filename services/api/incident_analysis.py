"""Reusable core logic for the Incident File Analyzer.

Used by scripts/analyze.py (CLI) and services/api (backend endpoints) so both
share the exact same validation and metric calculations.
"""

from __future__ import annotations

import csv
import io
from typing import Any

REQUIRED_FIELDS = [
    "incident_id",
    "customer_id",
    "customer_name",
    "email",
    "category",
    "status",
    "created_at",
]

OPTIONAL_FIELDS = ["phone", "satisfaction_score"]

ALL_FIELDS = REQUIRED_FIELDS + OPTIONAL_FIELDS

VALID_CATEGORIES = {"billing", "technical", "shipping", "product", "other"}

VALID_STATUSES = {"open", "closed", "discarded"}


def load_records(csv_path: str) -> list[dict[str, str]]:
    """Load rows from a CSV file path into a list of dicts."""
    with open(csv_path, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def load_records_from_text(text: str) -> list[dict[str, str]]:
    """Load rows from raw CSV text (used by the API, which receives bytes)."""
    return list(csv.DictReader(io.StringIO(text)))


def validate_record(row: dict[str, Any]) -> list[str]:
    """Return a list of validation issue codes for a row. Empty list = valid."""
    issues: list[str] = []

    for field in REQUIRED_FIELDS:
        value = (row.get(field) or "").strip()
        if not value:
            issues.append(f"missing_field:{field}")

    category = (row.get("category") or "").strip().lower()
    if category and category not in VALID_CATEGORIES:
        issues.append("invalid_category")

    status = (row.get("status") or "").strip().lower()
    if status and status not in VALID_STATUSES:
        issues.append("invalid_status")

    return issues


def analyze(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Run validation and compute metrics over the loaded rows."""
    valid_rows: list[dict[str, Any]] = []
    invalid_rows: list[dict[str, Any]] = []
    invalid_reason_counts: dict[str, int] = {}

    for row in rows:
        issues = validate_record(row)
        if issues:
            invalid_rows.append({"row": row, "issues": issues})
            for issue in issues:
                invalid_reason_counts[issue] = invalid_reason_counts.get(issue, 0) + 1
        else:
            valid_rows.append(row)

    category_breakdown = {category: 0 for category in sorted(VALID_CATEGORIES)}
    status_breakdown = {status: 0 for status in sorted(VALID_STATUSES)}

    satisfaction_scores: list[float] = []

    for row in valid_rows:
        category = row["category"].strip().lower()
        status = row["status"].strip().lower()
        category_breakdown[category] += 1
        status_breakdown[status] += 1

        if status == "closed":
            raw_score = (row.get("satisfaction_score") or "").strip()
            if raw_score:
                try:
                    satisfaction_scores.append(float(raw_score))
                except ValueError:
                    pass

    avg_satisfaction = (
        sum(satisfaction_scores) / len(satisfaction_scores)
        if satisfaction_scores
        else None
    )

    return {
        "total_records": len(rows),
        "total_valid": len(valid_rows),
        "total_invalid": len(invalid_rows),
        "invalid_reason_counts": invalid_reason_counts,
        "invalid_rows": invalid_rows,
        "category_breakdown": category_breakdown,
        "status_breakdown": status_breakdown,
        "closed_with_score_count": len(satisfaction_scores),
        "avg_satisfaction_closed": avg_satisfaction,
    }


def format_summary(metrics: dict[str, Any]) -> str:
    """Render the metrics dict as a readable console report."""
    lines: list[str] = []
    sep = "=" * 60

    lines.append(sep)
    lines.append("INCIDENT FILE ANALYSIS SUMMARY".center(60))
    lines.append(sep)

    lines.append(f"{'Total records processed:':<35}{metrics['total_records']:>10}")
    lines.append(f"{'Valid records:':<35}{metrics['total_valid']:>10}")
    lines.append(f"{'Invalid records:':<35}{metrics['total_invalid']:>10}")

    lines.append("-" * 60)
    lines.append("INVALID RECORDS BREAKDOWN".center(60))
    lines.append("-" * 60)
    if metrics["invalid_reason_counts"]:
        for reason, count in sorted(metrics["invalid_reason_counts"].items()):
            lines.append(f"{reason:<35}{count:>10}")
    else:
        lines.append("No invalid records found.")

    lines.append("-" * 60)
    lines.append("BREAKDOWN BY CATEGORY (valid records)".center(60))
    lines.append("-" * 60)
    for category, count in metrics["category_breakdown"].items():
        lines.append(f"{category:<35}{count:>10}")

    lines.append("-" * 60)
    lines.append("BREAKDOWN BY STATUS (valid records)".center(60))
    lines.append("-" * 60)
    for status, count in metrics["status_breakdown"].items():
        lines.append(f"{status:<35}{count:>10}")

    lines.append("-" * 60)
    lines.append("SATISFACTION INDEX".center(60))
    lines.append("-" * 60)
    avg = metrics["avg_satisfaction_closed"]
    avg_display = f"{avg:.2f}" if avg is not None else "N/A"
    lines.append(f"{'Closed cases with recorded score:':<35}{metrics['closed_with_score_count']:>10}")
    lines.append(f"{'Average satisfaction (closed):':<35}{avg_display:>10}")

    lines.append(sep)
    return "\n".join(lines)


def to_export_rows(metrics: dict[str, Any]) -> list[list[str]]:
    """Flatten the metrics dict into (metric, value) rows for CSV export."""
    rows: list[list[str]] = [["metric", "value"]]

    rows.append(["total_records", str(metrics["total_records"])])
    rows.append(["total_valid", str(metrics["total_valid"])])
    rows.append(["total_invalid", str(metrics["total_invalid"])])

    for reason, count in sorted(metrics["invalid_reason_counts"].items()):
        rows.append([f"invalid_reason:{reason}", str(count)])

    for category, count in metrics["category_breakdown"].items():
        rows.append([f"category:{category}", str(count)])

    for status, count in metrics["status_breakdown"].items():
        rows.append([f"status:{status}", str(count)])

    avg = metrics["avg_satisfaction_closed"]
    rows.append(["closed_with_score_count", str(metrics["closed_with_score_count"])])
    rows.append(["avg_satisfaction_closed", f"{avg:.2f}" if avg is not None else ""])

    return rows


def metrics_to_json(metrics: dict[str, Any]) -> dict[str, Any]:
    """Serializable subset of metrics for API JSON responses (no raw invalid rows)."""
    return {
        "total_records": metrics["total_records"],
        "total_valid": metrics["total_valid"],
        "total_invalid": metrics["total_invalid"],
        "invalid_reason_counts": metrics["invalid_reason_counts"],
        "category_breakdown": metrics["category_breakdown"],
        "status_breakdown": metrics["status_breakdown"],
        "closed_with_score_count": metrics["closed_with_score_count"],
        "avg_satisfaction_closed": metrics["avg_satisfaction_closed"],
    }
