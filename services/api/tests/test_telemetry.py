from copy import deepcopy
from uuid import uuid4

import pytest


def event():
    return {
        "eventId": str(uuid4()), "timestamp": "2026-11-02T12:00:00Z",
        "sessionId": None, "userId": None, "event_type": "navigation_section_viewed",
        "schemaVersion": 1, "requestId": str(uuid4()),
        "properties": {"section_id": "inventory_products"},
    }


def test_receive_batch_stores_events(client, caplog, db):
    """Test that valid events are stored and the response reflects received/stored/rejected."""
    with caplog.at_level("INFO"):
        response = client.post("/telemetry/events", json={"events": [event(), event()]})
    
    assert response.status_code == 200
    data = response.json()
    assert data["received"] == 2
    assert data["stored"] == 2
    assert data["rejected"] == 0
    assert "navigation_section_viewed" in caplog.text


def test_partial_acceptance_mixed_batch(client, db):
    """Test that invalid events are rejected individually while valid ones are stored."""
    valid = event()
    invalid = deepcopy(event())
    invalid["eventId"] = "invalid-uuid"
    
    response = client.post("/telemetry/events", json={"events": [valid, invalid]})
    assert response.status_code == 200
    data = response.json()
    assert data["received"] == 2
    assert data["stored"] == 1
    assert data["rejected"] == 1


@pytest.mark.parametrize("change", [
    {"eventId": "invalid"},
    {"timestamp": "2026-11-02T12:00:00"},
    {"schemaVersion": 2},
    {"event_type": "generic_click"},
    {"properties": {"section_id": "inventory_products", "email": "private"}},
    {"properties": {}},
    {"unexpected": True},
])
def test_reject_invalid_event(client, change):
    """Test that individual invalid events are rejected, not the entire batch."""
    valid = event()
    payload = deepcopy(event())
    payload.update(change)
    
    response = client.post("/telemetry/events", json={"events": [valid, payload]})
    assert response.status_code == 200
    data = response.json()
    assert data["received"] == 2
    assert data["stored"] == 1
    assert data["rejected"] == 1
    assert "private" not in response.text


def test_batch_required(client):
    """Test that the request must have an events array."""
    assert client.post("/telemetry/events", json=event()).status_code == 422
    response = client.post("/telemetry/events", json={"events": []})
    assert response.status_code == 200
    assert response.json() == {"received": 0, "stored": 0, "rejected": 0}


def test_cors_safelisted_beacon_payload(client):
    """Test that beacon payloads (text/plain) are accepted for CORS preflight."""
    import json

    response = client.post(
        "/telemetry/events",
        content=json.dumps({"events": [event()]}),
        headers={"Content-Type": "text/plain;charset=UTF-8", "Origin": "http://localhost:3001"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["received"] == 1
    assert data["stored"] == 1
    
    assert client.post(
        "/telemetry/events",
        content="invalid",
        headers={"Content-Type": "text/plain"}
    ).status_code == 422


def test_inventory_event_stored(client, db):
    """Test that inventory events are stored with their properties intact."""
    evt = {
        "eventId": str(uuid4()),
        "timestamp": "2026-11-02T12:00:00Z",
        "sessionId": "test-session",
        "userId": "user-hmac-123",
        "event_type": "inbound_order_created",
        "schemaVersion": 1,
        "requestId": "req-123",
        "properties": {
            "location_id": 1,
            "country": "CO",
            "product_id": 42,
            "product_category": "meat",
            "quantity": 10.5,
            "unit": "kg",
            "currency": "COP",
            "supplier_id": "supp-001",
            "unit_cost": 5000.0,
            "total_cost": 52500.0,
        },
    }
    
    response = client.post("/telemetry/events", json={"events": [evt]})
    assert response.status_code == 200
    data = response.json()
    assert data["stored"] == 1
    
    from models import TelemetryEvent
    from sqlmodel import Session, select
    
    with Session(db) as session:
        stmt = select(TelemetryEvent).where(TelemetryEvent.event_type == "inbound_order_created")
        stored_evt = session.exec(stmt).first()
        assert stored_evt is not None
        assert stored_evt.event_type == "inbound_order_created"
        assert stored_evt.tags["location_id"] == 1
        assert stored_evt.tags["currency"] == "COP"
