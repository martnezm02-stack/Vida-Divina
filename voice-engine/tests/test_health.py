from fastapi.testclient import TestClient

from app.main import app
from app.models import registry


class DummyModel:
    sr = 24000


def test_health_reports_model_state(monkeypatch):
    monkeypatch.setattr(registry, "get_model", lambda: DummyModel())
    monkeypatch.setattr(registry, "is_loaded", lambda: True)

    with TestClient(app) as client:
        resp = client.get("/health")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["model_loaded"] is True
    assert body["device"] == "cpu"
