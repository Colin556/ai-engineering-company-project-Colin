"""Incident File Analyzer API.

Exposes the same validation/analysis logic used by scripts/analyze.py as
HTTP endpoints:

    POST /api/incidents/analyze          - upload a CSV, get the summary as JSON
    GET  /api/incidents/results/export    - download the last analysis as CSV

Run with:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import csv
import io
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from incident_analysis import (
    analyze,
    load_records_from_text,
    metrics_to_json,
    to_export_rows,
)
from seed import seed_suppliers
from suppliers import router as suppliers_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    seed_suppliers()
    yield


app = FastAPI(title="Brasaland Backoffice API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(suppliers_router)

# In-memory store of the last analysis result, used by the export endpoint.
_last_metrics: dict | None = None


@app.post("/api/incidents/analyze")
async def analyze_incidents(file: UploadFile = File(...)):
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


@app.get("/api/incidents/results/export")
async def export_results():
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
