"""Confirma que generate_speech() aplica la normalización EXCLUSIVA de TTS
ANTES de generar (2026-09-11) -- sin tocar el modelo real ni la
segmentación (text_segmentation.py, sin cambios). Mismo patrón de
monkeypatch que tests/test_speak.py: nunca se ejecuta el modelo real.
"""
import asyncio
from pathlib import Path

from app.services import tts_service
from app.services import tts_text_normalization
from app.services.text_segmentation import segmentar_texto_seguro


class DummyModel:
    sr = 24000


def test_generate_speech_normaliza_precio_antes_de_generar(monkeypatch):
    capturado = {}

    def _fake_generate_sync(text, language, exaggeration, cfg_weight, temperature, reference_path):
        capturado["text"] = text
        return Path("/tmp/fake_output.wav")

    monkeypatch.setattr(tts_service, "_generate_sync", _fake_generate_sync)
    monkeypatch.setattr(tts_service, "get_model", lambda: DummyModel())

    asyncio.run(tts_service.generate_speech("Las Cápsulas Ripped cuestan $1,799 con Tongkat Ali."))

    texto_real_enviado_al_modelo = capturado["text"]
    assert "$1,799" not in texto_real_enviado_al_modelo
    assert "mil setecientos noventa y nueve pesos" in texto_real_enviado_al_modelo
    assert "Ripped" not in texto_real_enviado_al_modelo
    assert "Tongkat Ali" not in texto_real_enviado_al_modelo


def test_generate_speech_transporta_context_hasta_normalizar_texto_para_tts(monkeypatch):
    """Infraestructura de contexto (2026-09-11): generate_speech(text,
    context=...) debe llegar tal cual a normalizar_texto_para_tts() -- sin
    cambiar todavía ninguna regla según su valor (eso es tarea futura)."""
    contextos_recibidos = []
    normalizador_real = tts_text_normalization.normalizar_texto_para_tts

    def _normalizador_espia(texto, context="default"):
        contextos_recibidos.append(context)
        return normalizador_real(texto, context=context)

    monkeypatch.setattr(tts_service, "normalizar_texto_para_tts", _normalizador_espia)
    monkeypatch.setattr(tts_service, "_generate_sync", lambda *a, **k: Path("/tmp/fake_output.wav"))
    monkeypatch.setattr(tts_service, "get_model", lambda: DummyModel())

    asyncio.run(tts_service.generate_speech("hola", context="advertisement"))
    assert contextos_recibidos == ["advertisement"]

    # Consumidor legacy que no pasa context -- debe seguir funcionando, con
    # "default" implícito, mismo comportamiento que antes de este cambio.
    asyncio.run(tts_service.generate_speech("hola de nuevo"))
    assert contextos_recibidos == ["advertisement", "default"]


def test_generate_speech_texto_sin_precio_ni_terminos_no_cambia_de_forma_relevante(monkeypatch):
    capturado = {}

    def _fake_generate_sync(text, language, exaggeration, cfg_weight, temperature, reference_path):
        capturado["text"] = text
        return Path("/tmp/fake_output.wav")

    monkeypatch.setattr(tts_service, "_generate_sync", _fake_generate_sync)
    monkeypatch.setattr(tts_service, "get_model", lambda: DummyModel())

    texto = "Hola, ¿en qué te puedo ayudar hoy?"
    asyncio.run(tts_service.generate_speech(texto))
    assert capturado["text"] == texto


def test_segmentacion_existente_no_se_altera_por_la_normalizacion():
    """E) la segmentación actual sigue funcionando -- text_segmentation.py no
    se tocó; se verifica aquí sobre texto YA normalizado (como lo recibiría
    ahora, tras el cambio en generate_speech), replicando su comportamiento
    real sin duplicar su lógica."""
    from app.services.tts_text_normalization import normalizar_texto_para_tts

    # F) respuesta de un solo segmento: texto corto con precio -- debe seguir
    # generando UN único segmento, igual que antes de este cambio.
    corto = "Las Cápsulas Ripped tienen un precio de $1,799 por un frasco que contiene 30 cápsulas."
    normalizado_corto = normalizar_texto_para_tts(corto)
    segmentos_corto = segmentar_texto_seguro(normalizado_corto)
    assert len(segmentos_corto) == 1

    # Texto largo real (excede el margen de seguridad) -- debe seguir
    # dividiéndose en varios segmentos, igual que antes.
    largo = " ".join([
        "Las Cápsulas Ripped son un suplemento real orientado al aumento de fuerza muscular y rendimiento físico."
    ] * 6)
    segmentos_largo = segmentar_texto_seguro(normalizar_texto_para_tts(largo))
    assert len(segmentos_largo) > 1
