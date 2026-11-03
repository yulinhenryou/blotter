from fastapi.testclient import TestClient

from review import engine
from review.api.app import create_app


def test_health_reports_engine_version() -> None:
    client = TestClient(create_app())
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "engine_version": engine.engine_version()}
