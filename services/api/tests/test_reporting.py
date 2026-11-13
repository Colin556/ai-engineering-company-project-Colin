import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from prefect.testing.utilities import prefect_test_harness
from sqlmodel import Session, SQLModel, create_engine
from tinydb import Query

from core import users_table
from models import IngredientEntry, TelemetryEvent  # noqa: F401  (registers source tables)
from reporting import router as reporting_router

pipeline = pytest.importorskip("pipelines.pipeline")
store = sys.modules["pipelines.store"]

MONDAY = date(2026, 11, 9)


@pytest.fixture(scope="module", autouse=True)
def prefect_harness():
    with prefect_test_harness():
        yield


@pytest.fixture
def reporting_db(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'wlp.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    store.reset_engine()
    engine = store.get_engine()
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(pipeline, "extract_events", pipeline.extract_events.with_options(cache_key_fn=None, persist_result=False))
    monkeypatch.setattr(pipeline, "transform_weekly_rollup",
                        pipeline.transform_weekly_rollup.with_options(cache_key_fn=None, persist_result=False))
    yield engine
    store.reset_engine()


def event(event_type, location, day_offset=0, **tags):
    at = datetime(2026, 11, 10, 12, tzinfo=timezone.utc) + timedelta(days=day_offset)
    return TelemetryEvent(
        event_id=uuid.uuid4(), event_type=event_type, request_id=str(uuid.uuid4()), timestamp=at,
        ingestion_timestamp=at + timedelta(seconds=3),
        tags={"location_id": location, "country": "CO" if location <= 10 else "US",
              "currency": "COP" if location <= 10 else "USD", **tags},
    )


def seed(engine, *events):
    with Session(engine) as session:
        session.add_all(events)
        session.commit()


def rows_by_location(engine, week=MONDAY):
    return {row["location_id"]: row for row in store.fetch_week(engine, week)["locations"]}


def test_pipeline_computes_kpis_densely_and_never_mixes_currencies(reporting_db):
    seed(reporting_db,
         event("inbound_order_created", 1, order_id="a", total_cost=1000),
         event("stock_waste_registered", 1, order_id="b", total_cost=250),
         event("stock_threshold_triggered", 1, product_id=7),
         event("ingredient_price_variance_detected", 12, supplier_id=3),
         event("inbound_order_created", 12, order_id="c", total_cost=80))
    result = pipeline.weekly_location_performance_flow(week_start=MONDAY)

    assert result["status"].startswith("completed")
    rows = rows_by_location(reporting_db)
    assert len(rows) == 14
    assert rows["1"]["total_purchase_cost"] == 1000 and rows["1"]["waste_ratio"] == 0.25
    assert rows["1"]["stockout_events_count"] == 1 and rows["1"]["currency"] == "COP"
    assert rows["12"]["price_alert_events_count"] == 1 and rows["12"]["currency"] == "USD"
    assert rows["5"]["total_purchase_cost"] == 0 and rows["5"]["waste_ratio"] == 0


def test_rerun_is_idempotent_and_duplicates_are_dropped(reporting_db):
    seed(reporting_db,
         event("inbound_order_created", 2, order_id="same", total_cost=500),
         event("inbound_order_created", 2, order_id="same", total_cost=500),
         event("inbound_order_created", 99, order_id="bad", total_cost=1))
    first = pipeline.weekly_location_performance_flow(week_start=MONDAY)
    second = pipeline.weekly_location_performance_flow(week_start=MONDAY)

    assert first["duplicates_dropped"] == 1 and first["records_rejected"] == 1
    assert rows_by_location(reporting_db)["2"]["total_purchase_cost"] == 500
    assert second["rows_upserted"] == 0 and second["rows_changed"] == 0


def test_late_event_revises_the_week_and_keeps_an_audit_trail(reporting_db):
    seed(reporting_db, event("inbound_order_created", 3, order_id="x", total_cost=100))
    pipeline.weekly_location_performance_flow(week_start=MONDAY)
    seed(reporting_db, event("inbound_order_created", 3, order_id="y", total_cost=50))
    result = pipeline.weekly_location_performance_flow(week_start=MONDAY)

    assert result["rows_changed"] == 1
    assert rows_by_location(reporting_db)["3"]["total_purchase_cost"] == 150
    with reporting_db.connect() as connection:
        revisions = connection.execute(store.revisions.select()).all()
    assert len(revisions) == 1 and revisions[0].previous["total_purchase_cost"] == 100.0


def test_optional_task_failure_does_not_stop_the_run(reporting_db, monkeypatch):
    seed(reporting_db, event("inbound_order_created", 4, order_id="z", total_cost=10))
    monkeypatch.setattr(pipeline, "write_eval_snapshot", _failing_task("write_eval_snapshot"))
    result = pipeline.weekly_location_performance_flow(week_start=MONDAY)

    assert result["eval_snapshot"] is None
    assert store.get_latest_run(reporting_db)["status"].startswith("completed")


def _failing_task(name):
    from prefect import task

    @task(name=name)
    def boom(*args, **kwargs):
        raise RuntimeError("snapshot disk full")

    return boom


def test_critical_failure_is_recorded_on_the_run_and_stops_the_flow(reporting_db, monkeypatch):
    monkeypatch.setattr(pipeline, "extract_events", _failing_task("extract_events"))
    with pytest.raises(RuntimeError):
        pipeline.weekly_location_performance_flow(week_start=MONDAY)

    run = store.get_latest_run(reporting_db)
    assert run["status"] == "failed" and run["error_stage"] == "extract"
    assert "snapshot disk full" in run["error_message"]
    assert store.fetch_week(reporting_db, MONDAY) is None


def test_retry_and_cache_settings_are_configured():
    for task in (pipeline.start_run, pipeline.extract_events, pipeline.extract_order_controls,
                 pipeline.load_weekly_rollup, pipeline.record_run_failure, pipeline.notify_run_result):
        assert task.retries >= 2 and task.retry_delay_seconds
    for task in (pipeline.extract_events, pipeline.transform_weekly_rollup):
        assert task.cache_key_fn and task.cache_expiration == timedelta(hours=1)


def test_extract_cache_key_ignores_watermark_within_the_hour():
    params = {"weeks": [MONDAY], "watermark_from": None}
    a = pipeline.extract_cache_key(None, {**params, "watermark_to": datetime(2026, 11, 13, 9, 5, tzinfo=timezone.utc)})
    b = pipeline.extract_cache_key(None, {**params, "watermark_to": datetime(2026, 11, 13, 9, 55, tzinfo=timezone.utc)})
    c = pipeline.extract_cache_key(None, {**params, "watermark_to": datetime(2026, 11, 13, 10, 5, tzinfo=timezone.utc)})
    assert a == b != c


# --- endpoints ----------------------------------------------------------------------

@pytest.fixture
def staff(register_and_login):
    def make(role="user", email="staff@brasaland.co"):
        user, headers = register_and_login(email=email)
        if role != "user":
            users_table.update({"role": role}, Query().id == user["id"])
        return headers
    return make


def test_endpoints_require_authentication(client, reporting_db):
    assert client.get("/reporting/weekly-location-performance").status_code == 401
    assert client.get("/reporting/pipeline-runs/latest").status_code == 401
    assert client.post("/reporting/pipeline-runs").status_code == 401


def test_kpi_endpoint_matches_the_briefing_contract(client, reporting_db, staff):
    headers = staff()
    assert client.get("/reporting/weekly-location-performance", headers=headers).status_code == 404
    seed(reporting_db, event("inbound_order_created", 1, order_id="a", total_cost=1000),
         event("stock_waste_registered", 1, order_id="b", total_cost=100))
    pipeline.weekly_location_performance_flow(week_start=MONDAY)

    body = client.get("/reporting/weekly-location-performance", headers=headers).json()
    assert body["week_start"] == "2026-11-09" and len(body["locations"]) == 14
    assert set(body["locations"][0]) == {
        "location_id", "country", "total_purchase_cost", "total_waste_cost", "waste_ratio",
        "stockout_events_count", "price_alert_events_count", "currency"}
    assert body["locations"][0]["waste_ratio"] == 0.1
    assert client.get("/reporting/weekly-location-performance?week_start=2026-11-10", headers=headers).status_code == 422
    assert client.get("/reporting/weekly-location-performance?week_start=2026-11-02", headers=headers).status_code == 404


def test_latest_run_endpoint_returns_status_and_metadata(client, reporting_db, staff):
    headers = staff()
    assert client.get("/reporting/pipeline-runs/latest", headers=headers).status_code == 404
    pipeline.weekly_location_performance_flow(week_start=MONDAY)
    run = client.get("/reporting/pipeline-runs/latest", headers=headers).json()
    assert run["pipeline_name"] == "weekly_location_performance" and run["status"].startswith("completed")
    assert run["weeks_recomputed"] == ["2026-11-09"]


def test_manual_trigger_is_role_checked_and_delegates_to_the_flow(client, reporting_db, staff, monkeypatch):
    calls = []
    monkeypatch.setattr(reporting_router, "_run_flow", lambda *args: calls.append(args))

    assert client.post("/reporting/pipeline-runs", headers=staff("user")).status_code == 403
    manager = staff("manager", "boss@brasaland.co")
    accepted = client.post("/reporting/pipeline-runs", headers=manager, json={"week_start": "2026-11-09"})
    assert accepted.status_code == 202 and accepted.json()["status"] == "scheduled"
    assert calls[0][0] == accepted.json()["run_id"] and calls[0][1] == MONDAY
    assert client.post("/reporting/pipeline-runs", headers=manager, json={"week_start": "2026-11-10"}).status_code == 422


def test_manual_trigger_returns_409_while_a_run_is_active(client, reporting_db, staff, monkeypatch):
    monkeypatch.setattr(reporting_router, "_run_flow", lambda *args: None)
    store.ensure_schema(reporting_db)
    active = uuid.uuid4()
    store.create_run(reporting_db, {
        "run_id": active, "pipeline_name": store.PIPELINE_NAME, "trigger": "scheduled",
        "started_at": store.utcnow(), "status": "running"})
    response = client.post("/reporting/pipeline-runs", headers=staff("admin", "root@brasaland.co"))
    assert response.status_code == 409
    assert response.json()["detail"]["active_run_id"] == str(active)


def test_transform_rejects_cost_events_without_cost():
    from process.transform import transform_events
    import pandas as pd

    frame = pd.DataFrame([{
        "event_id": str(uuid.uuid4()), "event_type": "stock_waste_registered",
        "timestamp": datetime(2026, 11, 10, tzinfo=timezone.utc),
        "ingestion_timestamp": datetime(2026, 11, 10, tzinfo=timezone.utc),
        "request_id": "r", "tags": {"location_id": 1, "country": "CO", "currency": "COP"}}])
    result = transform_events(frame, [MONDAY])
    assert result["stats"]["rejected_by_reason"] == {"missing_cost": 1}
    assert all(row["total_waste_cost"] == Decimal(0) for row in result["rows"])
