import os
import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_DIR))
sys.path.insert(0, str(API_DIR.parents[1] / "scripts"))

# Tests must never depend on a developer's real secret or database.
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")
os.environ.setdefault("ALGORITHM", "HS256")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "30")
os.environ.setdefault("SUPPLIERS_DB_PATH", str(API_DIR / "data" / "test_db.json"))
# Never send real email from tests, even if a developer's shell exports a key.
os.environ["RESEND_API_KEY"] = ""
# Use SQLite for testing
os.environ["DATABASE_URL"] = f"sqlite:///{API_DIR / 'data' / 'test_telemetry.db'}"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from core import (  # noqa: E402
    password_reset_tokens_table,
    profiles_table,
    incidents_table,
    suppliers_table,
    users_table,
)
from database import engine
from main import app  # noqa: E402
from response_cache import incident_summary_cache, supplier_list_cache
from suppliers import seed_suppliers  # noqa: E402
from sqlmodel import SQLModel


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def db():
    """Fixture providing a test database connection for telemetry tests."""
    if engine is None:
        pytest.skip("DATABASE_URL not configured")
    
    SQLModel.metadata.create_all(engine)
    yield engine
    
    # Cleanup
    from models import TelemetryEvent
    from sqlmodel import Session, delete
    with Session(engine) as session:
        session.exec(delete(TelemetryEvent))
        session.commit()


@pytest.fixture(autouse=True)
def reset_database():
    incident_summary_cache.invalidate()
    supplier_list_cache.invalidate()
    tables = (
        suppliers_table,
        users_table,
        profiles_table,
        password_reset_tokens_table,
        incidents_table,
    )
    for table in tables:
        table.truncate()
    seed_suppliers()
    yield
    for table in tables:
        table.truncate()


@pytest.fixture
def register_and_login(client: TestClient):
    def _register(
        email: str = "tester@brasaland.co",
        password: str = "Sup3rSecret!",
        **profile_fields: str,
    ) -> tuple[dict, dict[str, str]]:
        response = client.post(
            "/users", json={"email": email, "password": password, **profile_fields}
        )
        assert response.status_code == 201, response.text
        user = response.json()

        token_response = client.post(
            "/auth/login", data={"username": email, "password": password}
        )
        assert token_response.status_code == 200, token_response.text
        token = token_response.json()["access_token"]
        return user, {"Authorization": f"Bearer {token}"}

    return _register
