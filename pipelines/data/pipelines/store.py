"""Reporting storage: schema, run log, KPI reads and the atomic load.

Used by the Prefect flow (pipeline.py) and by the /reporting endpoints, so the
endpoints never duplicate pipeline logic. Source tables are only ever read; all
writes go to the `reporting` schema.
"""

from __future__ import annotations

import os
import warnings
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON, Column, Date, DateTime, ForeignKey, Index, Integer, MetaData, Numeric, String,
    Table, Text, Uuid, create_engine, event, func, insert, select, text, update,
)
from sqlalchemy.engine import Engine

warnings.filterwarnings("ignore", message=".*does \\*not\\* support Decimal objects natively.*")

PIPELINE_NAME = "weekly_location_performance"
SCHEMA_VERSION = 1
RUN_TIMEOUT = timedelta(minutes=30)
SCHEMA = "reporting"

metadata = MetaData(schema=SCHEMA)

pipeline_runs = Table(
    "pipeline_runs", metadata,
    Column("run_id", Uuid, primary_key=True),
    Column("pipeline_name", String(100), nullable=False),
    Column("prefect_flow_run_id", Uuid),
    Column("trigger", String(20), nullable=False),
    Column("triggered_by", String(100)),
    Column("started_at", DateTime(timezone=True), nullable=False),
    Column("finished_at", DateTime(timezone=True)),
    Column("status", String(30), nullable=False),
    Column("current_stage", String(30)),
    Column("error_stage", String(30)),
    Column("watermark_from", DateTime(timezone=True)),
    Column("watermark_to", DateTime(timezone=True)),
    Column("weeks_recomputed", JSON),
    Column("records_extracted", Integer, nullable=False, default=0),
    Column("records_rejected", Integer, nullable=False, default=0),
    Column("duplicates_dropped", Integer, nullable=False, default=0),
    Column("clock_skew_clamped", Integer, nullable=False, default=0),
    Column("rows_upserted", Integer, nullable=False, default=0),
    Column("rows_changed", Integer, nullable=False, default=0),
    Column("quality_checks", JSON),
    Column("error_message", Text),
    Column("code_version", String(64)),
    Column("schema_version", Integer, nullable=False, default=SCHEMA_VERSION),
    # At most one running row per pipeline: the database-level concurrency guard.
    Index("uq_pipeline_runs_one_running", "pipeline_name", unique=True,
          postgresql_where=text("status = 'running'"), sqlite_where=text("status = 'running'")),
)

weekly_location_performance = Table(
    "weekly_location_performance", metadata,
    Column("id", Uuid, primary_key=True, default=uuid4),
    Column("location_id", String(20), nullable=False),
    Column("country", String(2), nullable=False),
    Column("week_start", Date, nullable=False),
    Column("total_purchase_cost", Numeric, nullable=False, default=0),
    Column("total_waste_cost", Numeric, nullable=False, default=0),
    Column("waste_ratio", Numeric, nullable=False, default=0),
    Column("stockout_events_count", Integer, nullable=False, default=0),
    Column("price_alert_events_count", Integer, nullable=False, default=0),
    Column("currency", String(3), nullable=False),
    Column("computed_at", DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)),
    Column("source_event_count", Integer, nullable=False, default=0),
    Column("revision", Integer, nullable=False, default=1),
    Column("last_run_id", Uuid, ForeignKey(f"{SCHEMA}.pipeline_runs.run_id")),
    Index("uq_wlp_location_week", "location_id", "week_start", unique=True),
)

revisions = Table(
    "weekly_location_performance_revisions", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("run_id", Uuid, ForeignKey(f"{SCHEMA}.pipeline_runs.run_id"), nullable=False),
    Column("location_id", String(20), nullable=False),
    Column("week_start", Date, nullable=False),
    Column("previous", JSON, nullable=False),
    Column("current", JSON, nullable=False),
    Column("changed_at", DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)),
)

pipeline_state = Table(
    "pipeline_state", metadata,
    Column("pipeline_name", String(100), primary_key=True),
    Column("last_ingested_at", DateTime(timezone=True), nullable=False),
)

KPI_FIELDS = (
    "total_purchase_cost", "total_waste_cost", "waste_ratio",
    "stockout_events_count", "price_alert_events_count", "currency", "country", "source_event_count",
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def aware(value: datetime | None) -> datetime | None:
    """SQLite returns naive datetimes; everything in this pipeline is UTC."""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _postgresql_url(url: str) -> str:
    parsed = urlsplit(url)
    if parsed.scheme not in {"postgres", "postgresql", "postgresql+psycopg2"}:
        raise ValueError("DATABASE_URL must use a PostgreSQL URI with the psycopg2 driver.")
    return parsed._replace(scheme="postgresql+psycopg2").geturl()


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL must be configured to run the reporting pipeline.")
    if url.startswith("sqlite:"):
        engine = create_engine(url, pool_pre_ping=True)
        database = engine.url.database
        if database and database != ":memory:":
            reporting_file = f"{database}.reporting"

            @event.listens_for(engine, "connect")
            def attach_reporting(connection, _):
                # SQLite has no schemas; an attached database emulates `reporting`.
                connection.execute(f"ATTACH DATABASE '{reporting_file}' AS {SCHEMA}")
        return engine
    return create_engine(
        _postgresql_url(url), pool_pre_ping=True, isolation_level="READ COMMITTED",
        connect_args={"sslmode": "require", "connect_timeout": 10},
    )


def reset_engine() -> None:
    get_engine.cache_clear()


def is_sqlite(engine: Engine) -> bool:
    return engine.dialect.name == "sqlite"


def bind_time(engine: Engine, value: datetime) -> datetime:
    """SQLite stores naive UTC; PostgreSQL timestamptz takes aware datetimes."""
    value = aware(value).astimezone(timezone.utc)
    return value.replace(tzinfo=None) if is_sqlite(engine) else value


def ensure_schema(engine: Engine) -> None:
    with engine.begin() as connection:
        if not is_sqlite(engine):
            connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}"))
    metadata.create_all(engine)


def source_table(engine: Engine, name: str) -> Table:
    """Reflect a source table (read-only use)."""
    return Table(name, MetaData(), autoload_with=engine)


# --- run log -----------------------------------------------------------------------

def _clean(value: Any) -> Any:
    if isinstance(value, (UUID,)):
        return str(value)
    if isinstance(value, datetime):
        return aware(value).isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def run_to_dict(row: Any) -> dict[str, Any]:
    return {key: _clean(value) for key, value in row._mapping.items()}


def sanitize_error(error: BaseException | str) -> str:
    """Class + message only; never a DSN or credential."""
    message = f"{type(error).__name__}: {error}" if isinstance(error, BaseException) else str(error)
    for secret in (os.getenv("DATABASE_URL", ""),):
        if secret:
            message = message.replace(secret, "[redacted]")
    return message[:1000]


def get_active_run(engine: Engine) -> dict[str, Any] | None:
    with engine.connect() as connection:
        row = connection.execute(
            select(pipeline_runs).where(
                pipeline_runs.c.pipeline_name == PIPELINE_NAME, pipeline_runs.c.status == "running"
            )
        ).first()
    return run_to_dict(row) if row else None


def get_latest_run(engine: Engine, pipeline_name: str = PIPELINE_NAME) -> dict[str, Any] | None:
    ensure_schema(engine)
    with engine.connect() as connection:
        row = connection.execute(
            select(pipeline_runs).where(pipeline_runs.c.pipeline_name == pipeline_name)
            .order_by(pipeline_runs.c.started_at.desc()).limit(1)
        ).first()
    return run_to_dict(row) if row else None


def mark_stale_runs_crashed(engine: Engine) -> int:
    cutoff = bind_time(engine, utcnow() - RUN_TIMEOUT)
    with engine.begin() as connection:
        result = connection.execute(
            update(pipeline_runs)
            .where(pipeline_runs.c.pipeline_name == PIPELINE_NAME, pipeline_runs.c.status == "running",
                   pipeline_runs.c.started_at < cutoff)
            .values(status="crashed", finished_at=utcnow(),
                    error_message="Run exceeded its timeout without finishing.")
        )
    return result.rowcount


def get_watermark(engine: Engine) -> datetime | None:
    with engine.connect() as connection:
        value = connection.execute(
            select(pipeline_state.c.last_ingested_at).where(pipeline_state.c.pipeline_name == PIPELINE_NAME)
        ).scalar()
    return aware(value)


def create_run(engine: Engine, run: dict[str, Any]) -> None:
    with engine.begin() as connection:
        connection.execute(insert(pipeline_runs).values(**run))


def update_run(engine: Engine, run_id: UUID, **values: Any) -> None:
    with engine.begin() as connection:
        connection.execute(update(pipeline_runs).where(pipeline_runs.c.run_id == run_id).values(**values))


def fail_run(engine: Engine, run_id: UUID, stage: str, error: BaseException | str) -> None:
    update_run(engine, run_id, status="failed", error_stage=stage, finished_at=utcnow(),
               error_message=sanitize_error(error))


# --- load --------------------------------------------------------------------------

def _kpi_snapshot(row: Any) -> dict[str, Any]:
    mapping = row if isinstance(row, dict) else row._mapping
    return {field: _clean(Decimal(str(mapping[field])) if field.startswith("total_") or field == "waste_ratio"
                          else mapping[field]) for field in KPI_FIELDS}


def _same(old: Any, new: dict[str, Any]) -> bool:
    previous = old._mapping
    return all(
        (Decimal(str(previous[f])) == Decimal(str(new[f]))) if f.startswith("total_") or f == "waste_ratio"
        else previous[f] == new[f]
        for f in KPI_FIELDS
    )


def load_rollup(
    engine: Engine, run_id: UUID, rows: list[dict[str, Any]], watermark_to: datetime,
    values_for_run: dict[str, Any],
) -> dict[str, Any]:
    """Single transaction: upsert changed rows, write revisions, advance watermark, finish the run.

    Rows whose KPI values are unchanged are left untouched, so `computed_at` and
    `revision` only move on real changes and a re-run is a no-op.
    """
    wlp = weekly_location_performance
    now = utcnow()
    changed = inserted = 0
    with engine.begin() as connection:
        if engine.dialect.name == "postgresql":
            locked = connection.execute(
                text("SELECT pg_try_advisory_xact_lock(hashtext(:name))"), {"name": PIPELINE_NAME}
            ).scalar()
            if not locked:
                connection.execute(update(pipeline_runs).where(pipeline_runs.c.run_id == run_id).values(
                    status="skipped_concurrent", finished_at=now, current_stage="load"))
                return {"skipped": True, "rows_upserted": 0, "rows_changed": 0}

        weeks = sorted({row["week_start"] for row in rows})
        existing = {
            (r.location_id, r.week_start): r
            for r in connection.execute(select(wlp).where(wlp.c.week_start.in_(weeks)))
        }
        for row in rows:
            key = (row["location_id"], row["week_start"])
            old = existing.get(key)
            if old is None:
                connection.execute(insert(wlp).values(**row, computed_at=now, revision=1, last_run_id=run_id))
                inserted += 1
            elif not _same(old, row):
                connection.execute(insert(revisions).values(
                    run_id=run_id, location_id=row["location_id"], week_start=row["week_start"],
                    previous=_kpi_snapshot(old), current=_kpi_snapshot(row), changed_at=now))
                connection.execute(
                    update(wlp).where(wlp.c.id == old.id)
                    .values(**row, computed_at=now, revision=old.revision + 1, last_run_id=run_id))
                changed += 1

        # The watermark only ever moves forward.
        current = connection.execute(
            select(pipeline_state.c.last_ingested_at).where(pipeline_state.c.pipeline_name == PIPELINE_NAME)
        ).scalar()
        if current is None:
            connection.execute(insert(pipeline_state).values(
                pipeline_name=PIPELINE_NAME, last_ingested_at=watermark_to))
        elif aware(current) < watermark_to:
            connection.execute(update(pipeline_state).where(pipeline_state.c.pipeline_name == PIPELINE_NAME)
                               .values(last_ingested_at=watermark_to))

        connection.execute(update(pipeline_runs).where(pipeline_runs.c.run_id == run_id).values(
            finished_at=now, current_stage="load", rows_upserted=inserted + changed, rows_changed=changed,
            watermark_to=watermark_to, **values_for_run))
    return {"skipped": False, "rows_upserted": inserted + changed, "rows_changed": changed,
            "rows_inserted": inserted}


# --- KPI query ---------------------------------------------------------------------

def fetch_week(engine: Engine, week_start: date | None) -> dict[str, Any] | None:
    """KPI rows for one week (latest computed week if None), in the briefing response shape."""
    ensure_schema(engine)
    wlp = weekly_location_performance
    with engine.connect() as connection:
        if week_start is None:
            week_start = connection.execute(select(func.max(wlp.c.week_start))).scalar()
            if week_start is None:
                return None
        rows = connection.execute(select(wlp).where(wlp.c.week_start == week_start)).all()
    if not rows:
        return None
    rows.sort(key=lambda r: int(r.location_id))
    return {
        "week_start": week_start.isoformat() if hasattr(week_start, "isoformat") else str(week_start),
        "computed_at": max(aware(r.computed_at) for r in rows).isoformat(),
        "locations": [
            {
                "location_id": r.location_id,
                "country": r.country,
                "total_purchase_cost": float(r.total_purchase_cost),
                "total_waste_cost": float(r.total_waste_cost),
                "waste_ratio": float(r.waste_ratio),
                "stockout_events_count": r.stockout_events_count,
                "price_alert_events_count": r.price_alert_events_count,
                "currency": r.currency,
            }
            for r in rows
        ],
    }


def eval_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "eval"


def raw_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "raw"
