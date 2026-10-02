from fastapi.testclient import TestClient


def incident_payload(**overrides) -> dict:
    return {
        "title": "Checkout payment failure",
        "description": "Card payments fail at the point of sale.",
        "category": "technical",
        "status": "open",
        "origin": "branch",
        "branch": "LOC-MEDELLIN-01",
        **overrides,
    }


def test_incident_create_list_detail_and_summary(
    client: TestClient, register_and_login
) -> None:
    _, headers = register_and_login()
    created = client.post(
        "/api/incidents", json=incident_payload(), headers=headers
    )
    assert created.status_code == 201
    incident = created.json()
    assert incident["id"] > 0
    assert incident["branch"] == "LOC-MEDELLIN-01"
    assert incident["created_at"] == incident["updated_at"]

    assert client.get("/api/incidents").json()[0]["id"] == incident["id"]
    assert client.get(f"/api/incidents/{incident['id']}").status_code == 200
    assert client.get("/api/incidents", params={"origin": "branch"}).json()

    summary = client.get("/api/incidents/summary").json()
    assert summary["total"] == 1
    assert summary["by_status"]["open"] == 1
    assert summary["by_category"]["technical"] == 1
    assert summary["by_origin"]["branch"] == 1
    assert summary["by_branch"]["LOC-MEDELLIN-01"] == 1


def test_incident_validation_and_empty_reads(client: TestClient, register_and_login) -> None:
    _, headers = register_and_login()
    invalid = client.post(
        "/api/incidents", json=incident_payload(description=""), headers=headers
    )
    assert invalid.status_code == 400
    assert invalid.json()["detail"]["field"] == "description"
    assert "message" in invalid.json()["detail"]
    assert client.post(
        "/api/incidents", json=incident_payload(category="unknown"), headers=headers
    ).status_code == 400
    central_branch_report = client.post(
        "/api/incidents",
        json=incident_payload(origin="branch", branch="central"),
        headers=headers,
    )
    assert central_branch_report.status_code == 400
    assert central_branch_report.json()["detail"]["field"] == "branch"
    assert client.get("/api/incidents").json() == []
    assert client.get("/api/incidents/summary").json()["total"] == 0
    assert client.get("/api/incidents/9999").status_code == 404


def test_incident_status_lifecycle(client: TestClient, register_and_login) -> None:
    _, headers = register_and_login()
    incident = client.post(
        "/api/incidents", json=incident_payload(), headers=headers
    ).json()
    incident_id = incident["id"]

    in_progress = client.patch(
        f"/api/incidents/{incident_id}/status",
        json={"status": "in_progress"},
        headers=headers,
    )
    assert in_progress.status_code == 200
    assert in_progress.json()["status"] == "in_progress"
    resolved = client.get(
        f"/api/incidents/{incident_id}/status",
        params={"status": "resolved"},
        headers=headers,
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"
    assert client.patch(
        f"/api/incidents/{incident_id}/status",
        json={"status": "discarded"},
        headers=headers,
    ).status_code == 400