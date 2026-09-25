#!/usr/bin/env python3
"""Incident File Analyzer (Phase 1).

Usage:
    python analyze.py incidents-brasaland.csv

Loads a CSV export of after-sales incidents, validates each record,
computes summary metrics on the valid ones, prints a readable report,
and optionally exports the metrics to results.csv.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

# The core analysis logic lives in services/api so the CLI script and the
# backend API share the exact same validation and metrics code.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "services" / "api"))

from incident_analysis import analyze, format_summary, load_records, to_export_rows  # noqa: E402


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python analyze.py <path-to-incidents.csv>")
        sys.exit(1)

    csv_path = Path(sys.argv[1])
    if not csv_path.exists():
        print(f"Error: file not found: {csv_path}")
        sys.exit(1)

    try:
        rows = load_records(str(csv_path))
    except Exception as exc:  # noqa: BLE001 - surface any parse error to the user
        print(f"Error: could not read CSV file: {exc}")
        sys.exit(1)

    if not rows:
        print("Error: the CSV file is empty.")
        sys.exit(1)

    metrics = analyze(rows)
    print(format_summary(metrics))

    answer = input("\nExport results to CSV? [y/n]: ").strip().lower()
    if answer == "y":
        output_path = Path("results.csv")
        with output_path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerows(to_export_rows(metrics))
        print(f"Results exported to {output_path.resolve()}")


if __name__ == "__main__":
    main()
