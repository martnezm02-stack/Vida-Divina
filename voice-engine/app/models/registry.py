"""Carga y mantiene en memoria el modelo Chatterbox Multilingual.

El modelo se carga una unica vez (singleton protegido por lock) cuando el
servicio arranca -- nunca por request. Cargar los pesos en cada llamada
seria inviable en latencia.
"""
import logging
import threading
import time

from chatterbox.mtl_tts import ChatterboxMultilingualTTS

from ..config import DEVICE

logger = logging.getLogger("voice_engine.registry")

_model: ChatterboxMultilingualTTS | None = None
_lock = threading.Lock()


def get_model() -> ChatterboxMultilingualTTS:
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                logger.info("Cargando ChatterboxMultilingualTTS (device=%s)...", DEVICE)
                t0 = time.time()
                _model = ChatterboxMultilingualTTS.from_pretrained(device=DEVICE)
                logger.info("Modelo cargado en %.2fs", time.time() - t0)
    return _model


def is_loaded() -> bool:
    return _model is not None
