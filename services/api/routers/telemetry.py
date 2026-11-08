import logging
import os
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from threading import Lock
from time import monotonic
from typing import Any, Literal
from uuid import UUID

import json
from fastapi import APIRouter, Body, Depends, HTTPException
from jsonschema import Draft7Validator, FormatChecker
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator
from sqlmodel import Session, insert

from accounts import get_current_user
from database import engine, get_db
from models import TelemetryEvent
from schemas import UserResponse
from telemetry import analysis

TELEMETRY_ENDPOINT = os.getenv("TELEMETRY_ENDPOINT", "http://localhost:8000/telemetry/events")
SCHEMA_VERSION = 1
registry_path = Path(__file__).resolve().parents[3] / "docs" / "event-schemas.json"
validator = Draft7Validator(json.loads(registry_path.read_text()), format_checker=FormatChecker())
logger = logging.getLogger("uvicorn.error.telemetry")
router = APIRouter(prefix="/telemetry", tags=["telemetry"])

REPORT_TTL_SECONDS = 60
REPORT_DEFAULT_DAYS = 7
REPORT_MAX_DAYS = 92
REPORT_CACHE_MAX_ENTRIES = 32
_report_cache: dict[tuple[date, date], tuple[float, dict[str, Any]]] = {}
_report_cache_lock = Lock()


class TelemetryEventModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    eventId: UUID
    timestamp: datetime
    sessionId: str | None
    userId: str | None
    event_type: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    schemaVersion: Literal[1]
    requestId: str = Field(min_length=1)
    properties: dict[str, Any]

    @field_validator("timestamp")
    @classmethod
    def utc_timestamp(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() != timezone.utc.utcoffset(value):
            raise ValueError("timestamp must include a UTC timezone")
        return value

    @model_validator(mode="before")
    @classmethod
    def approved_event(cls, value: Any) -> Any:
        if not validator.is_valid(value):
            raise ValueError("Event does not match the approved telemetry schema")
        return value


class TelemetryBatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    events: list[dict[str, Any]] = Field(max_length=1000)


class TelemetryBatchResponse(BaseModel):
    received: int
    stored: int
    rejected: int


class ReportPeriod(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    from_: datetime = Field(alias="from")
    to: datetime = Field(description="Exclusive upper bound (UTC).")


class EventsPerDay(BaseModel):
    date: date
    event_type: str
    count: int


class EventTypeShare(BaseModel):
    event_type: str
    count: int
    active_days: int
    share: float


class ErrorRateByType(BaseModel):
    date: date
    error_code: str
    failures: int
    requests: int
    error_rate: float


class ApiLatencyByRoute(BaseModel):
    date: date
    route_id: str
    sampled_requests: int
    avg_ms: float
    max_ms: float
    slow_requests: int


class AuthFailureRate(BaseModel):
    date: date
    attempts: int
    failures: int
    failure_rate: float


class ReportMetrics(BaseModel):
    events_per_day: list[EventsPerDay]
    event_type_distribution: list[EventTypeShare]
    error_rate_by_type: list[ErrorRateByType]
    api_latency_by_route: list[ApiLatencyByRoute]
    auth_failure_rate: list[AuthFailureRate]


class TelemetryReport(BaseModel):
    period: ReportPeriod
    metrics: ReportMetrics


@router.post("/events", response_model=TelemetryBatchResponse)
def receive_events(
    batch: TelemetryBatchRequest | bytes = Body(...),
    db: Session = Depends(get_db),
) -> TelemetryBatchResponse:
    """
    Receive, validate, and store telemetry events in bulk.
    
    Per-event validation ensures that invalid events are rejected individually,
    while valid events in the same batch are persisted regardless. This enables
    partial acceptance: the frontend retries or handles rejected events while
    the rest of the batch is durably stored.
    
    Returns:
        - received: total events in the batch
        - stored: events persisted to the database
        - rejected: events that failed validation
    """
    if isinstance(batch, bytes):
        try:
            batch = TelemetryBatchRequest.model_validate_json(batch)
        except ValidationError as error:
            raise HTTPException(status_code=422, detail="Invalid telemetry batch") from error

    received_count = len(batch.events)
    valid_events = []
    rejected_count = 0

    for raw_event in batch.events:
        try:
            validated_event = TelemetryEventModel.model_validate(raw_event)
            
            db_event = TelemetryEvent(
                event_id=validated_event.eventId,
                event_type=validated_event.event_type,
                timestamp=validated_event.timestamp,
                service="api",
                session_id=validated_event.sessionId,
                user_id=validated_event.userId,
                request_id=validated_event.requestId,
                schema_version=validated_event.schemaVersion,
                tags=validated_event.properties,
            )
            valid_events.append(db_event)
        except ValidationError as e:
            logger.debug(
                "Rejected telemetry event: %s",
                str(e),
            )
            rejected_count += 1

    stored_count = 0
    if valid_events:
        try:
            db.add_all(valid_events)
            db.commit()
            stored_count = len(valid_events)
            logger.info(
                "Telemetry batch: received=%d, stored=%d, rejected=%d, event_types=%s",
                received_count,
                stored_count,
                rejected_count,
                [evt.event_type for evt in valid_events],
            )
        except Exception as e:
            logger.error("Failed to persist telemetry events: %s", str(e))
            db.rollback()
            raise HTTPException(status_code=500, detail="Failed to persist telemetry events") from e

    return TelemetryBatchResponse(
        received=received_count,
        stored=stored_count,
        rejected=rejected_count,
    )


def clear_report_cache() -> None:
    with _report_cache_lock:
        _report_cache.clear()


@router.get("/report", response_model=TelemetryReport)
def telemetry_report(
    start_date: date | None = None,
    end_date: date | None = None,
    _: UserResponse = Depends(get_current_user),
) -> dict[str, Any]:
    """Operational metrics for the UTC days start_date..end_date (both inclusive; default last 7 days)."""
    if engine is None:
        raise HTTPException(status_code=503, detail="Telemetry database is not configured.")
    end_date = end_date or datetime.now(timezone.utc).date()
    start_date = start_date or end_date - timedelta(days=REPORT_DEFAULT_DAYS - 1)
    if start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date must be on or before end_date.")
    if (end_date - start_date).days >= REPORT_MAX_DAYS:
        raise HTTPException(status_code=422, detail=f"The report window is limited to {REPORT_MAX_DAYS} days.")

    key = (start_date, end_date)
    with _report_cache_lock:
        cached = _report_cache.get(key)
        if cached and cached[0] > monotonic():
            return cached[1]

    start = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
    end = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=timezone.utc)
    report = {
        "period": {"from": start.isoformat(), "to": end.isoformat()},
        "metrics": analysis.build_metrics(engine, start, end),
    }

    with _report_cache_lock:
        now = monotonic()
        for expired in [k for k, (expires, _) in _report_cache.items() if expires <= now]:
            del _report_cache[expired]
        if len(_report_cache) >= REPORT_CACHE_MAX_ENTRIES:
            del _report_cache[next(iter(_report_cache))]
        _report_cache[key] = (now + REPORT_TTL_SECONDS, report)
    return report
