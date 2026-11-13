"""Pure transformation for the Weekly Location Cost & Waste Report.

No I/O and no Prefect imports: the same input always gives the same output, so
a re-run after a failure recomputes identical weeks (PIPELINE_DESIGN.md §0, §3.1).
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

import pandas as pd

KPI_EVENT_TYPES = (
    "inbound_order_created",
    "stock_waste_registered",
    "stock_threshold_triggered",
    "ingredient_price_variance_detected",
)
# outbound_order_created is extracted only as a volume control, never a KPI.
EXTRACTED_EVENT_TYPES = (*KPI_EVENT_TYPES, "outbound_order_created")
COST_EVENT_TYPES = ("inbound_order_created", "stock_waste_registered")
LOCATION_IDS = tuple(str(i) for i in range(1, 15))
CLOCK_SKEW_TOLERANCE = pd.Timedelta(minutes=5)


def country_for(location_id: str) -> str:
    return "CO" if int(location_id) <= 10 else "US"


def currency_for(location_id: str) -> str:
    return "COP" if country_for(location_id) == "CO" else "USD"


def week_start_of(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _location_id(tags: dict[str, Any]) -> str | None:
    try:
        value = int(str(tags.get("location_id")).strip())
    except ValueError:
        return None
    return str(value) if 1 <= value <= 14 else None


def _decimal(raw: Any) -> Decimal | None:
    if raw is None or isinstance(raw, bool):
        return None
    try:
        value = Decimal(str(raw))
    except InvalidOperation:
        return None
    return value if value.is_finite() and value >= 0 else None


def _is_uuid(value: Any) -> bool:
    try:
        UUID(str(value))
    except ValueError:
        return False
    return True


def _natural_key(row: pd.Series) -> tuple:
    tags = row["tags"]
    event_type = row["event_type"]
    order_id = tags.get("order_id")
    if event_type in ("inbound_order_created", "stock_waste_registered", "outbound_order_created") and order_id is not None:
        return (event_type, str(order_id))
    request_id = row["request_id"]
    if event_type in ("stock_threshold_triggered", "ingredient_price_variance_detected") and _is_uuid(request_id):
        return (event_type, str(request_id), str(tags.get("location_id")), str(tags.get("product_id")))
    return (event_type, str(row["event_id"]))


def _validate(row: pd.Series) -> str | None:
    """Return a rejection reason, or None when the event is valid."""
    tags = row["tags"]
    location_id = _location_id(tags)
    if location_id is None:
        return "invalid_location_id"
    if tags.get("country") not in (None, country_for(location_id)):
        return "country_mismatch"
    if tags.get("currency") not in (None, currency_for(location_id)):
        return "currency_mismatch"
    if row["event_type"] in COST_EVENT_TYPES and _decimal(tags.get("total_cost")) is None:
        return "missing_cost"
    return None


def transform_events(events: pd.DataFrame, weeks: Iterable[date]) -> dict[str, Any]:
    """Validate, deduplicate, bucket and aggregate events into dense location-week rows.

    `events` needs: event_id, event_type, timestamp, ingestion_timestamp, request_id, tags (dict).
    Returns {"rows", "stats", "event_counts"}: one row per (location, week) for all 14 locations.
    """
    weeks = sorted(set(weeks))
    stats = {"records_extracted": int(len(events)), "records_rejected": 0, "duplicates_dropped": 0,
             "clock_skew_clamped": 0, "rejected_by_reason": {}}

    frame = events.copy()
    if not frame.empty:
        frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True)
        frame["ingestion_timestamp"] = pd.to_datetime(frame["ingestion_timestamp"], utc=True)
        # A client clock ahead of the server would put the event in the wrong week.
        skewed = frame["timestamp"] > frame["ingestion_timestamp"] + CLOCK_SKEW_TOLERANCE
        stats["clock_skew_clamped"] = int(skewed.sum())
        frame.loc[skewed, "timestamp"] = frame.loc[skewed, "ingestion_timestamp"]

        reasons = frame.apply(_validate, axis=1)
        for reason, count in reasons.dropna().value_counts().items():
            stats["rejected_by_reason"][reason] = int(count)
        stats["records_rejected"] = int(reasons.notna().sum())
        frame = frame[reasons.isna()].copy()

    if not frame.empty:
        frame["_key"] = frame.apply(_natural_key, axis=1)
        # Keep the latest copy of each business fact; event_id breaks ties deterministically.
        frame = frame.sort_values(["ingestion_timestamp", "event_id"], kind="stable")
        deduped = frame.drop_duplicates("_key", keep="last").copy()
        stats["duplicates_dropped"] = int(len(frame) - len(deduped))
        deduped["week_start"] = deduped["timestamp"].dt.date.map(week_start_of)
        frame = deduped[deduped["week_start"].isin(weeks)]

    cells = {
        (location_id, week): {"purchase": Decimal(0), "waste": Decimal(0), "stockouts": 0, "alerts": 0, "events": 0,
                  "inbound": 0, "waste_events": 0}
        for week in weeks
        for location_id in LOCATION_IDS
    }
    for row in frame.itertuples(index=False):
        tags = row.tags
        cell = cells[(_location_id(tags), row.week_start)]
        cell["events"] += 1
        if row.event_type == "inbound_order_created":
            cell["purchase"] += _decimal(tags["total_cost"])
            cell["inbound"] += 1
        elif row.event_type == "stock_waste_registered":
            cell["waste"] += _decimal(tags["total_cost"])
            cell["waste_events"] += 1
        elif row.event_type == "stock_threshold_triggered":
            cell["stockouts"] += 1
        elif row.event_type == "ingredient_price_variance_detected":
            cell["alerts"] += 1

    rows = []
    event_counts = {}
    for (location_id, week), cell in sorted(cells.items(), key=lambda item: (item[0][1], int(item[0][0]))):
        purchase, waste = cell["purchase"], cell["waste"]
        event_counts[f"{location_id}|{week.isoformat()}"] = {
            "inbound": cell["inbound"], "waste": cell["waste_events"]}
        ratio = (waste / purchase).quantize(Decimal("0.0001")) if purchase > 0 else Decimal(0)
        rows.append({
            "location_id": location_id,
            "country": country_for(location_id),
            "week_start": week,
            "total_purchase_cost": purchase,
            "total_waste_cost": waste,
            "waste_ratio": ratio,
            "stockout_events_count": cell["stockouts"],
            "price_alert_events_count": cell["alerts"],
            "currency": currency_for(location_id),
            "source_event_count": cell["events"],
        })
    return {"rows": rows, "stats": stats, "event_counts": event_counts}
