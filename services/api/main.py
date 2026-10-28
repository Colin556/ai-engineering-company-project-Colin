"""Brasaland Backoffice API entry point.

Wires the account, supplier and incident routes into one FastAPI app. The
incident endpoints use the same validation/analysis logic as scripts/analyze.py:

    POST /api/incidents/analyze          - upload a CSV, get the summary as JSON
    GET  /api/incidents/results/export    - download the last analysis as CSV

Run with:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import csv
import io
import logging
from time import perf_counter
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from accounts import auth_router, get_current_user, profiles_router, users_router
from database import initialize_inventory
from incident_analysis import (
    analyze,
    load_records_from_text,
    metrics_to_json,
    to_export_rows,
)
from incidents import router as incidents_router
from incidents import validation_message
from routers.inventory import router as inventory_router
from schemas import IncidentAnalysisResponse, UserResponse
from suppliers import router as suppliers_router
from suppliers import seed_suppliers


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_inventory()
    seed_suppliers()
    yield


app = FastAPI(title="Brasaland Backoffice API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(profiles_router)
app.include_router(suppliers_router)
app.include_router(incidents_router)
app.include_router(inventory_router)


@app.middleware("http")
async def timing_middleware(request: Request, call_next):
    started = perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers["Server-Timing"] = f"app;dur={(perf_counter() - started) * 1000:.3f}"
        return response
    finally:
        route = getattr(request.scope.get("route"), "path", "<unmatched>")
        logging.getLogger("uvicorn.error.timing").info(
            "%s %s status=%s duration_ms=%.3f",
            request.method, route, status_code, (perf_counter() - started) * 1000,
        )


@app.exception_handler(RequestValidationError)
async def invalid_request_handler(request: Request, exc: RequestValidationError):
    incident_write = (
        request.method == "POST" and request.url.path == "/api/incidents"
    ) or (
        request.method == "PATCH"
        and request.url.path.startswith("/api/incidents/")
        and request.url.path.endswith("/status")
    )
    error = exc.errors()[0]
    if incident_write and error["loc"][0] == "body":
        field, message = validation_message({**error, "loc": error["loc"][1:]})
        return JSONResponse(status_code=400, content={"detail": {"field": field, "message": message}})
    return JSONResponse(
        status_code=422,
        content={"detail": [
            {"type": error["type"], "loc": list(error["loc"]), "msg": error["msg"]}
            for error in exc.errors()
        ]},
    )


@app.exception_handler(Exception)
async def unexpected_error_handler(_, exc: Exception):
    logging.getLogger(__name__).exception("Unhandled API exception", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Please try again."},
    )

# In-memory store of the last analysis result, used by the export endpoint.
_last_metrics: dict | None = None


@app.post("/api/incidents/analyze", response_model=IncidentAnalysisResponse)
async def analyze_incidents(
    file: UploadFile = File(...),
    _: UserResponse = Depends(get_current_user),
):
    global _last_metrics

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv file.")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    try:
        text = raw.decode("utf-8-sig")
        rows = load_records_from_text(text)
    except (UnicodeDecodeError, csv.Error) as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV file: {exc}") from exc

    if not rows:
        raise HTTPException(status_code=400, detail="The CSV file has no data rows.")

    metrics = analyze(rows)
    _last_metrics = metrics

    return metrics_to_json(metrics)


@app.get(
    "/api/incidents/results/export",
    response_model=None,
    response_class=StreamingResponse,
    responses={200: {"content": {"text/csv": {"schema": {"type": "string"}}}}},
)
async def export_results(_: UserResponse = Depends(get_current_user)):
    if _last_metrics is None:
        raise HTTPException(
            status_code=404,
            detail="No analysis has been run yet. Call /api/incidents/analyze first.",
        )

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerows(to_export_rows(_last_metrics))
    buffer.seek(0)

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=results.csv"},
    )
