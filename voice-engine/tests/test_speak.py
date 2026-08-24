from pathlib import Path

from fastapi.testclient import TestClient

from app.api import speak as speak_module
from app.config import API_KEY
from app.main import app
from app.models import registry


class DummyModel:
    sr = 24000


captured_calls = []


async def _fake_generate_speech(text, language="es", reference_path=None, **kwargs):
    captured_calls.append({"text": text, "language": language, "reference_path": reference_path})
    return {"path": Path("/tmp/fake_output.wav"), "elapsed_s": 0.01, "sample_rate": 24000}


def setup_function(_):
    captured_calls.clear()


def test_speak_requires_api_key(monkeypatch):
    monkeypatch.setattr(registry, "get_model", lambda: DummyModel())

    with TestClient(app) as client:
        resp = client.post("/v1/speak", json={"text": "hola"})

    assert resp.status_code == 401


def test_speak_without_profile_uses_default_behavior(monkeypatch):
    """Requisito 3: sin voice_profile_id, se usa el comportamiento actual/default
    (sin referencia de voz -- voz por defecto del modelo)."""
    monkeypatch.setattr(registry, "get_model", lambda: DummyModel())
    monkeypatch.setattr(speak_module, "generate_speech", _fake_generate_speech)

    with TestClient(app) as client:
        resp = client.post(
            "/v1/speak",
            json={"text": "hola"},
            headers={"x-api-key": API_KEY},
        )

    assert resp.status_code == 200
    assert captured_calls[0]["reference_path"] is None
    body = resp.json()
    assert body["voice_profile_id"] is None


def test_speak_with_registered_profile_resolves_reference(monkeypatch):
    """Requisitos 1 y 2: voice_profile_id='manuel_es_mx' existe y resuelve
    hacia su archivo de referencia registrado."""
    monkeypatch.setattr(registry, "get_model", lambda: DummyModel())
    monkeypatch.setattr(speak_module, "generate_speech", _fake_generate_speech)

    with TestClient(app) as client:
        resp = client.post(
            "/v1/speak",
            json={"text": "hola", "voice_profile_id": "manuel_es_mx", "language": "es-MX"},
            headers={"x-api-key": API_KEY},
        )

    assert resp.status_code == 200
    ref_path = captured_calls[0]["reference_path"]
    assert ref_path is not None
    assert ref_path.name == "reference.wav"
    assert captured_calls[0]["language"] == "es"  # es-MX normalizado a es
    body = resp.json()
    assert body["voice_profile_id"] == "manuel_es_mx"


def test_speak_with_unknown_profile_returns_controlled_error(monkeypatch):
    """Requisito 4: un voice_profile_id inexistente produce un error
    controlado (404), no un crash ni un 500."""
    monkeypatch.setattr(registry, "get_model", lambda: DummyModel())

    with TestClient(app) as client:
        resp = client.post(
            "/v1/speak",
            json={"text": "hola", "voice_profile_id": "perfil_que_no_existe"},
            headers={"x-api-key": API_KEY},
        )

    assert resp.status_code == 404


def test_speak_rejects_arbitrary_reference_path_field(monkeypatch):
    """Requisito 5: una ruta de archivo arbitraria nunca puede ser enviada
    por el cliente -- cualquier campo no declarado se rechaza (422)."""
    monkeypatch.setattr(registry, "get_model", lambda: DummyModel())

    with TestClient(app) as client:
        resp = client.post(
            "/v1/speak",
            json={
                "text": "hola",
                "reference_audio_path": "/etc/passwd",
                "audio_prompt_path": "C:\\Windows\\System32\\config",
            },
            headers={"x-api-key": API_KEY},
        )

    assert resp.status_code == 422


def test_speak_rejects_empty_text(monkeypatch):
    monkeypatch.setattr(registry, "get_model", lambda: DummyModel())

    with TestClient(app) as client:
        resp = client.post(
            "/v1/speak",
            json={"text": ""},
            headers={"x-api-key": API_KEY},
        )

    assert resp.status_code == 422


def test_speak_response_never_exposes_internal_paths(monkeypatch):
    """Requisitos 6 y 7: la respuesta nunca incluye la ruta fisica del
    archivo de referencia ni del archivo generado -- solo un nombre de
    archivo (sin separadores de ruta)."""
    monkeypatch.setattr(registry, "get_model", lambda: DummyModel())
    monkeypatch.setattr(speak_module, "generate_speech", _fake_generate_speech)

    with TestClient(app) as client:
        resp = client.post(
            "/v1/speak",
            json={"text": "hola", "voice_profile_id": "manuel_es_mx"},
            headers={"x-api-key": API_KEY},
        )

    body = resp.json()
    assert "/" not in body["output_filename"]
    assert "\\" not in body["output_filename"]
    raw_text = resp.text
    assert "vida-divina-voice-engine-data" not in raw_text
    assert "reference.wav" not in raw_text
    assert "manuel1974" not in raw_text
