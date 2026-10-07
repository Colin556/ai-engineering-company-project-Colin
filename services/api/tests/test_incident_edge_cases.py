from fastapi.testclient import TestClient

from test_incidents import incident_payload


def test_incident_can_reach_terminal_resolved_state(
    client: TestClient, register_and_login
) -> None:
    _, headers = register_and_login(email="incident-terminal@brasaland.co")
    created = client.post(
        "/api/incidents", json=incident_payload(), headers=headers
    ).json()

    in_progress = client.patch(
        f"/api/incidents/{created['id']}/status",
        json={"status": "in_progress"},
        headers=headers,
    )
    resolved = client.patch(
        f"/api/incidents/{created['id']}/status",
        json={"status": "resolved"},
        headers=headers,
    )

    assert in_progress.json()["status"] == "in_progress"
    assert resolved.json()["status"] == "resolved"


def test_terminal_incident_cannot_transition_again(
    client: TestClient, register_and_login
) -> None:
    _, headers = register_and_login(email="incident-terminal-edge@brasaland.co")
    created = client.post(
        "/api/incidents",
        json=incident_payload(status="resolved"),
        headers=headers,
    ).json()

    response = client.patch(
        f"/api/incidents/{created['id']}/status",
        json={"status": "open"},
        headers=headers,
    )

    assert response.status_code == 400


def test_incident_status_and_filter_reject_missing_or_invalid_values(
    client: TestClient, register_and_login
) -> None:
    _, headers = register_and_login(email="incident-invalid@brasaland.co")
    created = client.post(
        "/api/incidents", json=incident_payload(), headers=headers
    ).json()

    missing_status = client.get(
        f"/api/incidents/{created['id']}/status", headers=headers
    )
    invalid_filter = client.get("/api/incidents", params={"status": "unknown"})
    invalid_update = client.patch(
        f"/api/incidents/{created['id']}/status",
        json={},
        headers=headers,
    )

    assert missing_status.status_code == 400
    assert invalid_filter.status_code == 400
    assert invalid_update.status_code == 400