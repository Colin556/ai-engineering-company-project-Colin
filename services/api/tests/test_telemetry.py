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


def test_receive_batch(client, caplog):
    with caplog.at_level("INFO"):
        response = client.post("/telemetry/events", json={"events": [event(), event()]})
    assert response.status_code == 200
    assert response.json() == {"received": 2}
    assert "navigation_section_viewed" in caplog.text


@pytest.mark.parametrize("change", [
    {"eventId": "invalid"}, {"timestamp": "2026-11-02T12:00:00"},
    {"schemaVersion": 2}, {"event_type": "generic_click"},
    {"properties": {"section_id": "inventory_products", "email": "private"}},
    {"properties": {}}, {"unexpected": True},
])
def test_reject_invalid_event(client, change):
    payload = deepcopy(event())
    payload.update(change)
    response = client.post("/telemetry/events", json={"events": [payload]})
    assert response.status_code == 422
    assert "private" not in response.text


def test_batch_required(client):
    assert client.post("/telemetry/events", json=event()).status_code == 422
    assert client.post("/telemetry/events", json={"events": []}).json() == {"received": 0}


def test_cors_safelisted_beacon_payload(client):
    import json

    response = client.post("/telemetry/events", content=json.dumps({"events": [event()]}), headers={"Content-Type": "text/plain;charset=UTF-8", "Origin": "http://localhost:3001"})
    assert response.status_code == 200
    assert response.json() == {"received": 1}
    assert client.post("/telemetry/events", content="invalid", headers={"Content-Type": "text/plain"}).status_code == 422