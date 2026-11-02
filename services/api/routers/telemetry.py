import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import UUID

import json
from fastapi import APIRouter, Body, HTTPException
from jsonschema import Draft7Validator, FormatChecker
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

TELEMETRY_ENDPOINT = os.getenv("TELEMETRY_ENDPOINT", "http://localhost:8000/telemetry/events")
SCHEMA_VERSION = 1
registry_path = Path(__file__).resolve().parents[3] / "docs" / "event-schemas.json"
validator = Draft7Validator(json.loads(registry_path.read_text()), format_checker=FormatChecker())
logger = logging.getLogger("uvicorn.error.telemetry")
router = APIRouter(prefix="/telemetry", tags=["telemetry"])


class TelemetryEvent(BaseModel):
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


class TelemetryBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    events: list[TelemetryEvent] = Field(max_length=1000)


@router.post("/events", response_model=dict[str, int])
def receive_events(batch: TelemetryBatch | bytes = Body(...)) -> dict[str, int]:
    if isinstance(batch, bytes):
        try:
            batch = TelemetryBatch.model_validate_json(batch)
        except ValidationError as error:
            raise HTTPException(status_code=422, detail="Invalid telemetry batch") from error
    logger.info("Received %d telemetry events: %s", len(batch.events), [event.event_type for event in batch.events])
    return {"received": len(batch.events)}