"""Weekly Location Cost & Waste Report: resilient Prefect pipeline.

Reads `telemetry_events` (read-only) and writes `reporting.weekly_location_performance`.

Run it from the command line (from the repository root, with the services/api environment):

    python pipelines/data/pipelines/pipeline.py                       # one run now
    python pipelines/data/pipelines/pipeline.py --week-start 2026-07-13
    python pipelines/data/pipelines/pipeline.py --serve               # cron 0 9 * * * UTC, 1 run at a time

Resilience summary (see docs/PIPELINE_DESIGN.md §3 and §4):
  * critical stages (start_run, extract_events, transform_weekly_rollup, load_weekly_rollup) are called with
    return_state=True; a failure is recorded in reporting.pipeline_runs and then stops the flow;
  * optional stages (extract_order_controls, check_quality, write_eval_snapshot, notify_run_result) are called
    with return_state=True; a failure is logged and the run continues;
  * tasks touching the database or the network retry; extract/transform results are cached for one hour.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen
from uuid import UUID, uuid4

DATA_DIR = Path(__file__).resolve().parents[1]
if str(DATA_DIR) not in sys.path:
    sys.path.insert(0, str(DATA_DIR))

import pandas as pd  # noqa: E402
from dotenv import load_dotenv  # noqa: E402
from prefect import flow, get_run_logger, task  # noqa: E402
from prefect.runtime import flow_run  # noqa: E402
from sqlalchemy import select  # noqa: E402

from pipelines import store  # noqa: E402
from process.transform import EXTRACTED_EVENT_TYPES, transform_events, week_start_of  # noqa: E402

load_dotenv(DATA_DIR.parents[1] / "services" / "api" / ".env")

CACHE_TTL = timedelta(hours=1)
LOOKBACK = timedelta(minutes=int(os.getenv("WLP_LOOKBACK_MINUTES", "15")))
INGESTION_SAFETY_MARGIN = timedelta(minutes=2)
COVERAGE_WARN_THRESHOLD = float(os.getenv("WLP_COVERAGE_WARN_THRESHOLD", "0.98"))
CRON_SCHEDULE = "0 9 * * *"

# Retry policy. Database/network calls fail transiently (connection resets, Supabase failovers, pool
# exhaustion) and usually recover within a minute. Extract and start/failure-log tasks get 3 retries with
# 10s/30s/90s backoff (~2 min total). Load gets 2 retries (5s/15s): it is idempotent, but it holds the
# transaction/advisory lock, so a shorter budget avoids overlapping with the next scheduled run.
DB_RETRIES = 3
DB_RETRY_DELAYS = [10, 30, 90]
LOAD_RETRIES = 2
LOAD_RETRY_DELAYS = [5, 15]
NOTIFY_RETRIES = 2
NOTIFY_RETRY_DELAYS = [5, 15]


def _iso(value: Any) -> Any:
    return value.isoformat() if isinstance(value, (datetime, date)) else value


def _parse_dt(value: Any) -> datetime | None:
    return None if value is None else (value if isinstance(value, datetime) else datetime.fromisoformat(value))


def _code_version() -> str | None:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True,
                              cwd=DATA_DIR, timeout=5, check=True).stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        return None


# --- cache keys ---------------------------------------------------------------------

def extract_cache_key(context, parameters: dict[str, Any]) -> str:
    """Key = (weeks, watermark_to truncated to the hour). Valid for CACHE_TTL (1 hour).

    A run in the same hour over the same window reuses the extract instead of re-querying the database.
    The result carries the watermark_to it actually used, so the load advances the checkpoint correctly.
    """
    to = _parse_dt(parameters["watermark_to"]).astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
    raw = json.dumps([sorted(map(_iso, parameters["weeks"])), to.isoformat()])
    return "extract_events:" + hashlib.sha256(raw.encode()).hexdigest()


def transform_cache_key(context, parameters: dict[str, Any]) -> str:
    """Key = hash of the weeks plus every (event_id, ingestion_timestamp) in the extract. Valid 1 hour.

    Identical input rows always produce identical output, so reuse is safe; any new, changed or late
    event changes the key and forces a recompute.
    """
    frame: pd.DataFrame = parameters["frame"]
    digest = hashlib.sha256(json.dumps(sorted(map(_iso, parameters["weeks"]))).encode())
    for event_id, ingested in sorted(zip(frame["event_id"].astype(str), frame["ingestion_timestamp"].astype(str))):
        digest.update(f"{event_id}|{ingested}".encode())
    return "transform_weekly_rollup:" + digest.hexdigest()


# --- critical tasks -----------------------------------------------------------------

@task(name="start_run", retries=DB_RETRIES, retry_delay_seconds=DB_RETRY_DELAYS)
def start_run(run_id: str, trigger: str, triggered_by: str | None, week_start: date | None) -> dict[str, Any]:
    """Reconcile stale runs, open the run row, fix the watermark window and resolve weeks to recompute."""
    engine = store.get_engine()
    store.ensure_schema(engine)
    store.mark_stale_runs_crashed(engine)

    now = store.utcnow()
    watermark_from = store.get_watermark(engine)
    watermark_to = now - INGESTION_SAFETY_MARGIN
    weeks = {week_start_of(now.date()), week_start_of(now.date()) - timedelta(days=7)}
    if week_start is not None:
        weeks = {week_start}
    else:
        weeks |= _weeks_with_new_events(engine, watermark_from, watermark_to)

    run = {
        "run_id": UUID(run_id), "pipeline_name": store.PIPELINE_NAME,
        "prefect_flow_run_id": UUID(flow_run.id) if flow_run.id else None, "trigger": trigger,
        "triggered_by": triggered_by, "started_at": now, "status": "running", "current_stage": "start",
        "watermark_from": watermark_from, "watermark_to": watermark_to,
        "weeks_recomputed": sorted(w.isoformat() for w in weeks), "code_version": _code_version(),
        "schema_version": store.SCHEMA_VERSION,
    }
    try:
        store.create_run(engine, run)
    except Exception:
        active = store.get_active_run(engine)
        if active is None:
            raise
        return {"skipped": True, "active_run_id": active["run_id"]}
    return {"skipped": False, "run_id": run_id, "watermark_from": watermark_from,
            "watermark_to": watermark_to, "weeks": sorted(weeks)}


def _weeks_with_new_events(engine, watermark_from: datetime | None, watermark_to: datetime) -> set[date]:
    """Late-event discovery: weeks of events ingested since the last committed watermark."""
    events = store.source_table(engine, "telemetry_events")
    query = select(events.c.timestamp).where(
        events.c.event_type.in_(EXTRACTED_EVENT_TYPES),
        events.c.ingestion_timestamp <= store.bind_time(engine, watermark_to),
    )
    if watermark_from is not None:
        query = query.where(events.c.ingestion_timestamp > store.bind_time(engine, watermark_from - LOOKBACK))
    with engine.connect() as connection:
        stamps = pd.to_datetime([row[0] for row in connection.execute(query)], utc=True)
    return {week_start_of(stamp.date()) for stamp in stamps}


@task(name="extract_events", retries=DB_RETRIES, retry_delay_seconds=DB_RETRY_DELAYS,
      cache_key_fn=extract_cache_key, cache_expiration=CACHE_TTL, persist_result=True)
def extract_events(weeks: list[date], watermark_from: datetime | None, watermark_to: datetime) -> dict[str, Any]:
    """Read-only extract of the five event types for the weeks, frozen at watermark_to."""
    engine = store.get_engine()
    events = store.source_table(engine, "telemetry_events")
    first = datetime.combine(min(weeks), datetime.min.time(), tzinfo=timezone.utc)
    last = datetime.combine(max(weeks) + timedelta(days=7), datetime.min.time(), tzinfo=timezone.utc)
    query = select(
        events.c.event_id, events.c.event_type, events.c.timestamp, events.c.ingestion_timestamp,
        events.c.request_id, events.c.schema_version, events.c.tags,
    ).where(
        events.c.event_type.in_(EXTRACTED_EVENT_TYPES),
        events.c.timestamp >= store.bind_time(engine, first),
        events.c.timestamp < store.bind_time(engine, last),
        events.c.ingestion_timestamp <= store.bind_time(engine, watermark_to),
    )
    with engine.connect() as connection:
        frame = pd.DataFrame(connection.execute(query).mappings().all(), columns=[
            "event_id", "event_type", "timestamp", "ingestion_timestamp", "request_id", "schema_version", "tags"])
    frame["tags"] = frame["tags"].map(lambda tags: json.loads(tags) if isinstance(tags, str) else (tags or {}))
    frame["event_id"] = frame["event_id"].astype(str)
    return {"frame": frame, "watermark_to": watermark_to}


@task(name="transform_weekly_rollup", cache_key_fn=transform_cache_key, cache_expiration=CACHE_TTL,
      persist_result=True)
def transform_weekly_rollup(frame: pd.DataFrame, weeks: list[date]) -> dict[str, Any]:
    """Validation, dedup, week bucketing, aggregation, densification. Pure: no retries needed."""
    return transform_events(frame, weeks)


@task(name="load_weekly_rollup", retries=LOAD_RETRIES, retry_delay_seconds=LOAD_RETRY_DELAYS)
def load_weekly_rollup(run_id: str, rows: list[dict[str, Any]], stats: dict[str, Any],
                       quality: dict[str, Any] | None, weeks: list[date], watermark_to: datetime) -> dict[str, Any]:
    """Atomic, idempotent load into reporting.weekly_location_performance (see store.load_rollup)."""
    warning = quality is None or quality.get("verdict") != "ok"
    return store.load_rollup(
        store.get_engine(), UUID(run_id), rows, watermark_to,
        {
            "status": "completed_with_warnings" if warning else "completed",
            "records_extracted": stats["records_extracted"], "records_rejected": stats["records_rejected"],
            "duplicates_dropped": stats["duplicates_dropped"], "clock_skew_clamped": stats["clock_skew_clamped"],
            "quality_checks": {**(quality or {"verdict": "unavailable"}), "rejected_by_reason": stats["rejected_by_reason"]},
            "weeks_recomputed": sorted(w.isoformat() for w in weeks),
        },
    )


@task(name="record_run_failure", retries=DB_RETRIES, retry_delay_seconds=DB_RETRY_DELAYS)
def record_run_failure(run_id: str, stage: str, error: str) -> None:
    store.fail_run(store.get_engine(), UUID(run_id), stage, error)


# --- optional tasks (failure is logged, never fatal) ---------------------------------

@task(name="extract_order_controls", retries=DB_RETRIES, retry_delay_seconds=DB_RETRY_DELAYS)
def extract_order_controls(weeks: list[date], watermark_to: datetime) -> dict[str, dict[str, int]]:
    """Reconciliation counts from ingrediententry/ingredientexit: how many events *should* exist."""
    engine = store.get_engine()
    entry, exit_ = store.source_table(engine, "ingrediententry"), store.source_table(engine, "ingredientexit")
    first = datetime.combine(min(weeks), datetime.min.time(), tzinfo=timezone.utc)
    last = datetime.combine(max(weeks) + timedelta(days=7), datetime.min.time(), tzinfo=timezone.utc)
    controls: dict[str, dict[str, int]] = {}
    with engine.connect() as connection:
        inbound = connection.execute(
            select(entry.c.location_id, entry.c.created_at).where(
                entry.c.supplier_id.is_not(None), entry.c.unit_cost.is_not(None),
                entry.c.created_at >= store.bind_time(engine, first), entry.c.created_at < store.bind_time(engine, last),
                entry.c.created_at <= store.bind_time(engine, watermark_to)))
        waste = connection.execute(
            select(exit_.c.location_id, exit_.c.created_at).where(
                exit_.c.reason == "waste", exit_.c.waste_cause.is_not(None), exit_.c.unit_cost.is_not(None),
                exit_.c.created_at >= store.bind_time(engine, first), exit_.c.created_at < store.bind_time(engine, last),
                exit_.c.created_at <= store.bind_time(engine, watermark_to)))
        for kind, result in (("inbound", inbound), ("waste", waste)):
            for location_id, created_at in result:
                stamp = pd.Timestamp(created_at)
                stamp = stamp.tz_localize("UTC") if stamp.tzinfo is None else stamp.tz_convert("UTC")
                week = week_start_of(stamp.date())
                cell = controls.setdefault(f"{location_id}|{week.isoformat()}", {"inbound": 0, "waste": 0})
                cell[kind] += 1
    return controls


@task(name="check_quality")
def check_quality(event_counts: dict[str, dict[str, int]], controls: dict[str, dict[str, int]]) -> dict[str, Any]:
    """Coverage of captured events vs. domain rows. A warning never blocks the load."""
    expected = captured = 0
    capture_failures, low_coverage = [], []
    for key, control in controls.items():
        want = control["inbound"] + control["waste"]
        have = sum(event_counts.get(key, {"inbound": 0, "waste": 0}).values())
        expected += want
        captured += min(have, want)
        if want and have == 0:
            capture_failures.append(key)
        elif want and have / want < COVERAGE_WARN_THRESHOLD:
            low_coverage.append(key)
    coverage = round(captured / expected, 4) if expected else 1.0
    verdict = "ok" if coverage >= COVERAGE_WARN_THRESHOLD and not capture_failures else "warning"
    return {"verdict": verdict, "coverage": coverage, "expected_events": expected, "captured_events": captured,
            "capture_failures": capture_failures, "low_coverage": low_coverage,
            "threshold": COVERAGE_WARN_THRESHOLD}


@task(name="write_eval_snapshot")
def write_eval_snapshot(run_id: str, rows: list[dict[str, Any]], stats: dict[str, Any],
                        quality: dict[str, Any] | None, load_result: dict[str, Any]) -> str:
    """Validation output for the run in pipelines/data/eval/ (secondary export)."""
    path = store.eval_dir() / f"run_{run_id}.json"
    payload = {"run_id": run_id, "generated_at": store.utcnow().isoformat(), "stats": stats, "quality": quality,
               "load": load_result, "rows": rows}
    path.write_text(json.dumps(payload, default=lambda v: str(v) if not isinstance(v, (date, datetime)) else v.isoformat(),
                               indent=2))
    return str(path)


@task(name="notify_run_result", retries=NOTIFY_RETRIES, retry_delay_seconds=NOTIFY_RETRY_DELAYS)
def notify_run_result(summary: dict[str, Any]) -> None:
    """Post the run summary to PIPELINE_ALERT_WEBHOOK when configured (external call, so it retries)."""
    webhook = os.getenv("PIPELINE_ALERT_WEBHOOK", "").strip()
    if not webhook:
        return
    request = Request(webhook, data=json.dumps(summary, default=str).encode(),
                      headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(request, timeout=10):  # noqa: S310 - operator-configured URL
        pass


# --- flow -----------------------------------------------------------------------------

def _log_optional_failure(name: str, state, logger) -> Any:
    if state.is_failed():
        logger.warning("Optional task %s failed; continuing: %s", name, state.message)
        return None
    return state.result()


def _stop_on_failure(state, stage: str, run_id: str, logger) -> Any:
    """Critical task: record the failure on the run row, then propagate the original exception."""
    if not state.is_failed():
        return state.result()
    message = store.sanitize_error(state.message or "task failed")
    logger.error("Critical task %s failed: %s", stage, message)
    record_state = record_run_failure(run_id, stage, message, return_state=True)
    if record_state.is_failed():
        logger.error("Could not record failure for run %s", run_id)
    return state.result()  # raises the task's exception and fails the flow


@flow(name="weekly_location_performance_flow")
def weekly_location_performance_flow(
    week_start: date | None = None, trigger: str = "scheduled",
    triggered_by: str | None = None, run_id: str | None = None,
) -> dict[str, Any]:
    """extract -> transform -> load for the per-location, per-ISO-week business KPIs."""
    logger = get_run_logger()
    run_id = run_id or str(uuid4())

    ctx = start_run(run_id, trigger, triggered_by, week_start)
    if ctx["skipped"]:
        logger.warning("Another run is active (%s); skipping.", ctx["active_run_id"])
        return {"run_id": run_id, "status": "skipped_concurrent", "active_run_id": ctx["active_run_id"]}
    weeks = ctx["weeks"]

    extract_state = extract_events(weeks, ctx["watermark_from"], ctx["watermark_to"], return_state=True)
    extracted = _stop_on_failure(extract_state, "extract", run_id, logger)

    controls = _log_optional_failure(
        "extract_order_controls", extract_order_controls(weeks, extracted["watermark_to"], return_state=True), logger)

    transform_state = transform_weekly_rollup(extracted["frame"], weeks, return_state=True)
    transformed = _stop_on_failure(transform_state, "transform", run_id, logger)

    quality = None
    if controls is not None:
        quality = _log_optional_failure(
            "check_quality", check_quality(transformed["event_counts"], controls, return_state=True), logger)

    load_state = load_weekly_rollup(
        run_id, transformed["rows"], transformed["stats"], quality, weeks, extracted["watermark_to"],
        return_state=True)
    loaded = _stop_on_failure(load_state, "load", run_id, logger)

    summary = {"run_id": run_id, "status": "skipped_concurrent" if loaded["skipped"] else (
        "completed" if quality and quality["verdict"] == "ok" else "completed_with_warnings"),
        "weeks": [w.isoformat() for w in weeks], **{k: loaded[k] for k in ("rows_upserted", "rows_changed")},
        **{k: transformed["stats"][k] for k in ("records_extracted", "records_rejected", "duplicates_dropped")}}
    snapshot = _log_optional_failure(
        "write_eval_snapshot",
        write_eval_snapshot(run_id, transformed["rows"], transformed["stats"], quality, loaded, return_state=True),
        logger)
    _log_optional_failure("notify_run_result", notify_run_result(summary, return_state=True), logger)
    return {**summary, "eval_snapshot": snapshot}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the weekly_location_performance pipeline.")
    parser.add_argument("--week-start", type=date.fromisoformat, help="Recompute only this ISO week (a Monday).")
    parser.add_argument("--trigger", default="manual", choices=["scheduled", "manual", "backfill"])
    parser.add_argument("--triggered-by")
    parser.add_argument("--serve", action="store_true", help=f"Serve on the schedule '{CRON_SCHEDULE}' (UTC).")
    args = parser.parse_args(argv)

    if args.week_start and args.week_start.weekday() != 0:
        parser.error("--week-start must be a Monday.")
    if args.serve:
        weekly_location_performance_flow.serve(
            name="weekly-location-performance", cron=CRON_SCHEDULE, limit=1,
            parameters={"trigger": "scheduled"})
        return 0
    result = weekly_location_performance_flow(
        week_start=args.week_start, trigger=args.trigger, triggered_by=args.triggered_by)
    print(json.dumps(result, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
