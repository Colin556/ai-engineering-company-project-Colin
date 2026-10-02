"""CRUD and lifecycle management for persisted incidents."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import ValidationError

from accounts import get_current_user
from core import db_lock, incidents_table
from incident_catalog import (
    BRANCHES,
    BRANCH_VALUES,
    INCIDENT_CATEGORIES,
    INCIDENT_ORIGINS,
    INCIDENT_STATUSES,
)
from models import (
    IncidentCreate,
    IncidentResponse,
    IncidentStatusUpdate,
    UserResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/incidents", tags=["incidents"])
STATUS_TRANSITIONS = {
    "open": {"in_progress", "discarded"},
    "in_progress": {"resolved", "discarded"},
    "resolved": set(),
    "discarded": set(),
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def serialize_incident(document: dict[str, Any], document_id: int) -> IncidentResponse:
    return IncidentResponse.model_validate({"id": document_id, **document})


def validation_message(error: dict[str, Any]) -> tuple[str, str]:
    field = str(error["loc"][0]) if error.get("loc") else "incident"
    if error["type"] == "missing":
        return field, "This field is required."
    if field == "category":
        return field, f"Choose one of: {', '.join(INCIDENT_CATEGORIES)}."
    if field == "status":
        return field, f"Choose one of: {', '.join(INCIDENT_STATUSES)}."
    if field == "origin":
        return field, f"Choose one of: {', '.join(INCIDENT_ORIGINS)}."
    if field == "branch":
        return field, "Choose a valid branch or central headquarters."
    if error["type"] in {"string_too_short", "string_type"}:
        return field, "Enter a value for this field."
    return field, "Check this field and try again."


def validate_payload(payload: dict[str, Any]) -> IncidentCreate:
    try:
        incident = IncidentCreate.model_validate(payload)
    except ValidationError as error:
        field, message = validation_message(error.errors()[0])
        raise HTTPException(
            status_code=400, detail={"field": field, "message": message}
        ) from error

    if incident.branch not in BRANCH_VALUES:
        raise HTTPException(
            status_code=400,
            detail={"field": "branch", "message": "Choose a valid branch or central headquarters."},
        )
    if incident.origin.value == "branch" and incident.branch == "central":
        raise HTTPException(
            status_code=400,
            detail={"field": "branch", "message": "Choose the specific branch reporting this incident."},
        )
    return incident


@router.get("/options")
def incident_options() -> dict[str, Any]:
    return {
        "categories": INCIDENT_CATEGORIES,
        "statuses": INCIDENT_STATUSES,
        "origins": INCIDENT_ORIGINS,
        "branches": BRANCHES,
    }


@router.get("/summary")
def incident_summary() -> dict[str, Any]:
    with db_lock:
        documents = incidents_table.all()

    summary = {
        "total": len(documents),
        "by_status": {value: 0 for value in INCIDENT_STATUSES},
        "by_category": {value: 0 for value in INCIDENT_CATEGORIES},
        "by_origin": {value: 0 for value in INCIDENT_ORIGINS},
        "by_branch": {branch["value"]: 0 for branch in BRANCHES},
    }
    for document in documents:
        for key, field in (
            ("by_status", "status"),
            ("by_category", "category"),
            ("by_origin", "origin"),
            ("by_branch", "branch"),
        ):
            value = document.get(field)
            if value in summary[key]:
                summary[key][value] += 1
    return summary


@router.post("", response_model=IncidentResponse, status_code=201)
def create_incident(
    payload: dict[str, Any] = Body(...),
    _: UserResponse = Depends(get_current_user),
) -> IncidentResponse:
    incident = validate_payload(payload)
    now = utc_now()
    document = {
        **incident.model_dump(mode="json"),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    with db_lock:
        document_id = incidents_table.insert(document)
    return serialize_incident(document, document_id)


@router.get("")
def list_incidents(
    status: str | None = None,
    origin: str | None = None,
    branch: str | None = None,
    category: str | None = None,
) -> list[IncidentResponse]:
    filters = {
        "status": (status, INCIDENT_STATUSES),
        "origin": (origin, INCIDENT_ORIGINS),
        "branch": (branch, BRANCH_VALUES),
        "category": (category, INCIDENT_CATEGORIES),
    }
    for field, (value, allowed) in filters.items():
        if value is not None and value not in allowed:
            raise HTTPException(
                status_code=400,
                detail={"field": field, "message": "Choose a valid filter value."},
            )

    with db_lock:
        documents = list(incidents_table)
    for field, (value, _) in filters.items():
        if value is not None:
            documents = [document for document in documents if document.get(field) == value]
    documents.sort(key=lambda document: document.get("created_at", ""), reverse=True)
    return [serialize_incident(document, document.doc_id) for document in documents]


def get_incident_document(incident_id: int) -> dict[str, Any]:
    with db_lock:
        document = incidents_table.get(doc_id=incident_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    return document


def update_incident_status(incident_id: int, requested_status: str) -> IncidentResponse:
    if requested_status not in INCIDENT_STATUSES:
        raise HTTPException(
            status_code=400,
            detail={"field": "status", "message": "Choose a valid incident status."},
        )
    document = get_incident_document(incident_id)
    current_status = document["status"]
    if requested_status not in STATUS_TRANSITIONS[current_status]:
        raise HTTPException(
            status_code=400,
            detail={
                "field": "status",
                "message": f"An incident cannot move from {current_status.replace('_', ' ')} to {requested_status.replace('_', ' ')}.",
            },
        )
    changes = {"status": requested_status, "updated_at": utc_now().isoformat()}
    with db_lock:
        incidents_table.update(changes, doc_ids=[incident_id])
        updated = incidents_table.get(doc_id=incident_id)
    return serialize_incident(updated, incident_id)


@router.get("/{incident_id}/status", response_model=IncidentResponse)
def change_incident_status_get(
    incident_id: int,
    status: str | None = Query(default=None),
    _: UserResponse = Depends(get_current_user),
) -> IncidentResponse:
    if status is None:
        raise HTTPException(
            status_code=400,
            detail={"field": "status", "message": "Choose the new incident status."},
        )
    return update_incident_status(incident_id, status)


@router.patch("/{incident_id}/status", response_model=IncidentResponse)
def change_incident_status(
    incident_id: int,
    payload: dict[str, Any] = Body(...),
    _: UserResponse = Depends(get_current_user),
) -> IncidentResponse:
    try:
        update = IncidentStatusUpdate.model_validate(payload)
    except ValidationError as error:
        field, message = validation_message(error.errors()[0])
        raise HTTPException(
            status_code=400, detail={"field": field, "message": message}
        ) from error
    return update_incident_status(incident_id, update.status.value)


@router.get("/{incident_id}", response_model=IncidentResponse)
def get_incident(incident_id: int) -> IncidentResponse:
    document = get_incident_document(incident_id)
    return serialize_incident(document, incident_id)