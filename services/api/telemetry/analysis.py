"""Operational telemetry metrics: load (SQL) -> refine -> convert types -> group -> aggregate -> serve.

Every metric receives an explicit [start, end) UTC window owned by the caller,
applies it once in SQL, and returns JSON-serialisable records. No metric
writes state, so equal inputs over equal data yield equal results.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Any

import pandas as pd
from sqlalchemy import Engine
from sqlmodel import col, select

from models import TelemetryEvent

API_EVENTS = ("api_request_completed", "api_request_failed")
AUTH_EVENTS = ("auth_login_succeeded", "auth_login_failed")
SLOW_REQUEST_MS = 1000

Records = list[dict[str, Any]]


def _utc(value: datetime) -> datetime:
    return value.astimezone(timezone.utc)


def load_events(
    engine: Engine,
    start: datetime,
    end: datetime,
    event_types: Sequence[str] | None = None,
    with_tags: bool = False,
) -> pd.DataFrame:
    columns = [col(TelemetryEvent.timestamp), col(TelemetryEvent.event_type)]
    if with_tags:
        columns.append(col(TelemetryEvent.tags))
    statement = select(*columns).where(
        col(TelemetryEvent.timestamp) >= _utc(start),
        col(TelemetryEvent.timestamp) < _utc(end),
    )
    if event_types is not None:
        statement = statement.where(col(TelemetryEvent.event_type).in_(event_types))
    with engine.connect() as connection:
        frame = pd.read_sql(statement, connection)
    frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True)
    frame["date"] = frame["timestamp"].dt.date
    return frame


def _with_tags(frame: pd.DataFrame, fields: Sequence[str]) -> pd.DataFrame:
    tags = pd.json_normalize(frame["tags"].tolist()).reindex(columns=list(fields))
    return frame.drop(columns="tags").join(tags.set_index(frame.index))


def _records(frame: pd.DataFrame) -> Records:
    if "date" in frame:
        frame = frame.assign(date=frame["date"].astype(str))
    return frame.to_dict(orient="records")


def events_per_day(engine: Engine, start: datetime, end: datetime) -> Records:
    """Event volume per UTC day and event type."""
    events = load_events(engine, start, end)
    volume = events.groupby(["date", "event_type"])["timestamp"].count()
    return _records(volume.reset_index(name="count"))


def event_type_distribution(engine: Engine, start: datetime, end: datetime) -> Records:
    """Which event types dominate the window, with the number of days each was active."""
    events = load_events(engine, start, end)
    distribution = events.groupby("event_type").agg(
        count=("timestamp", "count"), active_days=("date", "nunique")
    )
    distribution["share"] = (distribution["count"] / distribution["count"].sum()).round(4)
    return _records(distribution.sort_values("count", ascending=False).reset_index())


def error_rate_by_type(engine: Engine, start: datetime, end: datetime) -> Records:
    """Daily API error rate split by normalized error code.

    Fast successful requests are sampled client-side, so each completed event is
    weighted by 1 / sample_rate to estimate the real request volume.
    """
    events = _with_tags(
        load_events(engine, start, end, API_EVENTS, with_tags=True), ["error_code", "sample_rate"]
    )
    events["requests"] = 1 / events["sample_rate"].fillna(1)
    daily_requests = events.groupby("date")["requests"].sum().round()

    failures = events[events["event_type"] == "api_request_failed"].dropna(subset=["error_code"])
    errors = failures.groupby(["date", "error_code"])["timestamp"].count().reset_index(name="failures")
    errors = errors.join(daily_requests, on="date")
    errors["error_rate"] = (errors["failures"] / errors["requests"]).round(4)
    errors["requests"] = errors["requests"].astype(int)
    return _records(errors)


def api_latency_by_route(engine: Engine, start: datetime, end: datetime) -> Records:
    """Daily server-side latency per route template (sample-weighted mean, max, slow count)."""
    events = _with_tags(
        load_events(engine, start, end, API_EVENTS, with_tags=True),
        ["route_id", "duration_ms", "sample_rate"],
    ).dropna(subset=["route_id", "duration_ms"])
    events["weight"] = 1 / events["sample_rate"].fillna(1)
    events["weighted_ms"] = events["duration_ms"] * events["weight"]
    events["is_slow"] = events["duration_ms"] >= SLOW_REQUEST_MS

    latency = events.groupby(["date", "route_id"]).agg(
        sampled_requests=("timestamp", "count"),
        weight=("weight", "sum"),
        weighted_ms=("weighted_ms", "sum"),
        max_ms=("duration_ms", "max"),
        slow_requests=("is_slow", "sum"),
    )
    latency["avg_ms"] = (latency["weighted_ms"] / latency["weight"]).round(1)
    latency["max_ms"] = latency["max_ms"].round(1)
    latency["slow_requests"] = latency["slow_requests"].astype(int)
    return _records(latency.drop(columns=["weight", "weighted_ms"]).reset_index())


def auth_failure_rate(engine: Engine, start: datetime, end: datetime) -> Records:
    """Daily login failure rate: failed / (failed + succeeded)."""
    events = load_events(engine, start, end, AUTH_EVENTS)
    events["is_failure"] = events["event_type"] == "auth_login_failed"
    daily = events.groupby("date").agg(attempts=("is_failure", "count"), failures=("is_failure", "sum"))
    daily["failures"] = daily["failures"].astype(int)
    daily["failure_rate"] = (daily["failures"] / daily["attempts"]).round(4)
    return _records(daily.reset_index())


def build_metrics(engine: Engine, start: datetime, end: datetime) -> dict[str, Records]:
    return {
        "events_per_day": events_per_day(engine, start, end),
        "event_type_distribution": event_type_distribution(engine, start, end),
        "error_rate_by_type": error_rate_by_type(engine, start, end),
        "api_latency_by_route": api_latency_by_route(engine, start, end),
        "auth_failure_rate": auth_failure_rate(engine, start, end),
    }
