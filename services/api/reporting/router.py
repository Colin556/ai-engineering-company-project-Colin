"""Business reporting endpoints (Weekly Location Cost & Waste Report).

No ETL logic lives here: everything is delegated to pipelines/data/pipelines (store.py and the Prefect
flow). Fully separate from services/api/telemetry and GET /telemetry/report.
"""

from __future__ import annotations

import logging
import os
import sys
from datetime import date
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict

from accounts import get_current_user
from schemas import UserResponse

# Repo layout: <root>/services/api/reporting/router.py; image layout: /app/api/reporting/router.py.
# In both, parents[3] is the directory that contains pipelines/data.
PIPELINES_DATA_DIR = Path(
    os.getenv("PIPELINES_DATA_DIR") or Path(__file__).resolve().parents[3] / "pipelines" / "data"
)
if str(PIPELINES_DATA_DIR) not in sys.path:
    sys.path.insert(0, str(PIPELINES_DATA_DIR))

from pipelines import store  # noqa: E402

logger = logging.getLogger("uvicorn.error.reporting")
router = APIRouter(prefix="/reporting", tags=["reporting"], dependencies=[Depends(get_current_user)])


class LocationPerformance(BaseModel):
    location_id: str
    country: str
    total_purchase_cost: float
    total_waste_cost: float
    waste_ratio: float
    stockout_events_count: int
    price_alert_events_count: int
    currency: str


class WeeklyLocationPerformanceResponse(BaseModel):
    week_start: date
    locations: list[LocationPerformance]
    # Additive trust signals so a non-technical reader knows when to rely on the numbers.
    computed_at: str | None = None
    last_run_status: str | None = None
    data_quality: str | None = None


class PipelineRunTrigger(BaseModel):
    model_config = ConfigDict(extra="forbid")
    week_start: date | None = None


class PipelineRunAccepted(BaseModel):
    run_id: str
    status: str


def get_engine():
    try:
        return store.get_engine()
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail="Reporting database is not configured.") from error


@router.get("/weekly-location-performance", response_model=WeeklyLocationPerformanceResponse)
def weekly_location_performance(
    week_start: date | None = Query(default=None, description="Monday of the ISO week; defaults to the latest computed week."),
) -> dict:
    if week_start is not None and week_start.weekday() != 0:
        raise HTTPException(status_code=422, detail="week_start must be a Monday.")
    engine = get_engine()
    result = store.fetch_week(engine, week_start)
    if result is None:
        raise HTTPException(status_code=404, detail="No computed data for the requested week.")
    run = store.get_latest_run(engine)
    quality = (run or {}).get("quality_checks") or {}
    return {
        **result,
        "last_run_status": (run or {}).get("status"),
        "data_quality": "ok" if quality.get("verdict") == "ok" else "warning" if quality else None,
    }


@router.get("/pipeline-runs/latest")
def latest_pipeline_run() -> dict:
    run = store.get_latest_run(get_engine())
    if run is None:
        raise HTTPException(status_code=404, detail="No pipeline run has been recorded yet.")
    return run


def _run_flow(run_id: str, week_start: date | None, triggered_by: str) -> None:
    try:
        from pipelines.pipeline import weekly_location_performance_flow

        weekly_location_performance_flow(
            week_start=week_start, trigger="manual", triggered_by=triggered_by, run_id=run_id)
    except Exception:
        # The flow records its own failure on the run row; the request has already returned.
        logger.exception("Manual pipeline run %s failed", run_id)


@router.post("/pipeline-runs", response_model=PipelineRunAccepted, status_code=202)
def trigger_pipeline_run(
    background_tasks: BackgroundTasks,
    payload: PipelineRunTrigger = Body(default_factory=PipelineRunTrigger),
    user: UserResponse = Depends(get_current_user),
) -> dict:
    if user.role not in {"admin", "manager"}:
        raise HTTPException(status_code=403, detail="Only managers can trigger a pipeline run.")
    if payload.week_start is not None and payload.week_start.weekday() != 0:
        raise HTTPException(status_code=422, detail="week_start must be a Monday.")
    engine = get_engine()
    store.ensure_schema(engine)
    store.mark_stale_runs_crashed(engine)
    active = store.get_active_run(engine)
    if active is not None:
        raise HTTPException(status_code=409, detail={"message": "A run is already in progress.",
                                                     "active_run_id": active["run_id"]})
    run_id = str(uuid4())
    background_tasks.add_task(_run_flow, run_id, payload.week_start, user.id)
    return {"run_id": run_id, "status": "scheduled"}
