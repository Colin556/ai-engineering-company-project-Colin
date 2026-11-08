from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlmodel import Session

from models import TelemetryEvent
from routers import telemetry as telemetry_router
from telemetry import analysis

START = datetime(2026, 11, 1, tzinfo=timezone.utc)
END = datetime(2026, 11, 3, tzinfo=timezone.utc)


def stored(event_type: str, timestamp: str, **tags) -> TelemetryEvent:
    return TelemetryEvent(
        event_id=uuid4(), event_type=event_type, request_id=str(uuid4()), tags=tags,
        timestamp=datetime.fromisoformat(timestamp.replace("Z", "+00:00")),
    )


@pytest.fixture
def seeded(db):
    api = {"route_id": "/suppliers", "method": "GET"}
    events = [
        stored("api_request_completed", "2026-11-01T08:00:00Z", **api, status_code=200, duration_ms=100, sample_rate=0.05),
        stored("api_request_completed", "2026-11-01T09:00:00Z", **api, status_code=200, duration_ms=1500, sample_rate=1),
        stored("api_request_failed", "2026-11-01T10:00:00Z", **api, status_code=500, duration_ms=50, error_code="server_error"),
        stored("api_request_failed", "2026-11-02T23:59:59Z", **api, status_code=401, duration_ms=10, error_code="unauthorized"),
        stored("auth_login_succeeded", "2026-11-01T11:00:00Z", auth_method="password", duration_ms=5),
        stored("auth_login_failed", "2026-11-01T11:01:00Z", auth_method="password", failure_code="invalid_credentials"),
        stored("auth_login_failed", "2026-11-02T00:00:00Z", auth_method="password", failure_code="locked"),
        # Outside the [START, END) window: exclusive end bound and earlier day.
        stored("api_request_failed", "2026-11-03T00:00:00Z", **api, status_code=500, duration_ms=1, error_code="server_error"),
        stored("auth_login_failed", "2026-10-31T23:59:59Z", auth_method="password", failure_code="locked"),
    ]
    with Session(db) as session:
        session.add_all(events)
        session.commit()
    telemetry_router.clear_report_cache()
    yield db
    telemetry_router.clear_report_cache()


def test_events_per_day_groups_by_utc_date_inside_window(seeded):
    rows = analysis.events_per_day(seeded, START, END)
    assert {"date": "2026-11-01", "event_type": "api_request_completed", "count": 2} in rows
    assert {"date": "2026-11-02", "event_type": "auth_login_failed", "count": 1} in rows
    assert sum(row["count"] for row in rows) == 7


def test_event_type_distribution_ranks_dominant_types(seeded):
    rows = analysis.event_type_distribution(seeded, START, END)
    assert [row["event_type"] for row in rows][:2] == ["api_request_completed", "api_request_failed"]
    assert rows[0] == {"event_type": "api_request_completed", "count": 2, "active_days": 1, "share": round(2 / 7, 4)}


def test_error_rate_weights_sampled_requests(seeded):
    rows = analysis.error_rate_by_type(seeded, START, END)
    # Day 1: 20 (1/0.05) + 1 + 1 failure = 22 estimated requests.
    assert rows == [
        {"date": "2026-11-01", "error_code": "server_error", "failures": 1, "requests": 22, "error_rate": round(1 / 22, 4)},
        {"date": "2026-11-02", "error_code": "unauthorized", "failures": 1, "requests": 1, "error_rate": 1.0},
    ]


def test_api_latency_by_route(seeded):
    day_one = analysis.api_latency_by_route(seeded, START, END)[0]
    assert day_one["route_id"] == "/suppliers"
    assert day_one["sampled_requests"] == 3
    assert day_one["slow_requests"] == 1
    assert day_one["max_ms"] == 1500
    assert day_one["avg_ms"] == round((100 * 20 + 1500 + 50) / 22, 1)


def test_auth_failure_rate(seeded):
    assert analysis.auth_failure_rate(seeded, START, END) == [
        {"date": "2026-11-01", "attempts": 2, "failures": 1, "failure_rate": 0.5},
        {"date": "2026-11-02", "attempts": 1, "failures": 1, "failure_rate": 1.0},
    ]


def test_metrics_are_idempotent_and_empty_windows_serialise(seeded):
    assert analysis.build_metrics(seeded, START, END) == analysis.build_metrics(seeded, START, END)
    empty = analysis.build_metrics(seeded, datetime(2020, 1, 1, tzinfo=timezone.utc), datetime(2020, 1, 2, tzinfo=timezone.utc))
    assert all(rows == [] for rows in empty.values())


def test_report_endpoint_requires_auth(client):
    assert client.get("/telemetry/report").status_code == 401


def test_report_endpoint_serves_window_and_caches(client, register_and_login, seeded, monkeypatch):
    _, headers = register_and_login()
    calls = []
    original = analysis.build_metrics
    monkeypatch.setattr(analysis, "build_metrics", lambda *args: calls.append(args) or original(*args))

    params = {"start_date": "2026-11-01", "end_date": "2026-11-02"}
    first = client.get("/telemetry/report", params=params, headers=headers)
    second = client.get("/telemetry/report", params=params, headers=headers)

    assert first.status_code == 200
    assert first.json() == second.json()
    assert len(calls) == 1
    body = first.json()
    assert body["period"] == {"from": "2026-11-01T00:00:00Z", "to": "2026-11-03T00:00:00Z"}
    assert set(body["metrics"]) >= {"events_per_day", "error_rate_by_type", "auth_failure_rate"}

    client.get("/telemetry/report", params={"start_date": "2026-11-02", "end_date": "2026-11-02"}, headers=headers)
    assert len(calls) == 2


def test_report_endpoint_cache_expires(client, register_and_login, seeded, monkeypatch):
    _, headers = register_and_login()
    clock = [1000.0]
    monkeypatch.setattr(telemetry_router, "monotonic", lambda: clock[0])
    calls = []
    original = analysis.build_metrics
    monkeypatch.setattr(analysis, "build_metrics", lambda *args: calls.append(args) or original(*args))

    client.get("/telemetry/report", headers=headers)
    clock[0] += telemetry_router.REPORT_TTL_SECONDS + 1
    client.get("/telemetry/report", headers=headers)
    assert len(calls) == 2


@pytest.mark.parametrize("params", [
    {"start_date": "2026-11-05", "end_date": "2026-11-01"},
    {"start_date": "2026-01-01", "end_date": "2026-11-01"},
    {"start_date": "not-a-date"},
])
def test_report_endpoint_rejects_invalid_windows(client, register_and_login, params):
    _, headers = register_and_login()
    assert client.get("/telemetry/report", params=params, headers=headers).status_code == 422
