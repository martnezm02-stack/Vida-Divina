"""Generacion de voz: cola de un solo trabajo simultaneo + timeout.

Esta maquina no tiene GPU -- generar en paralelo solo haria que las
solicitudes compitieran por los mismos nucleos y empeoraria la latencia de
todas. Un ThreadPoolExecutor con max_workers=1 ES la cola de un solo
trabajo: solicitudes concurrentes se sirven en orden de llegada, nunca en
paralelo entre si.
"""
import asyncio
import logging
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

import torchaudio as ta

from ..config import OUTPUT_DIR, estimate_timeout_seconds
from ..models.registry import get_model

logger = logging.getLogger("voice_engine.tts_service")

_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="tts-gen")


class GenerationTimeoutError(Exception):
    pass


def _generate_sync(
    text: str,
    language: str,
    exaggeration: float,
    cfg_weight: float,
    temperature: float,
    reference_path: Optional[Path],
) -> Path:
    model = get_model()
    wav = model.generate(
        text,
        language_id=language,
        audio_prompt_path=str(reference_path) if reference_path else None,
        exaggeration=exaggeration,
        cfg_weight=cfg_weight,
        temperature=temperature,
    )
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / f"{uuid.uuid4().hex}.wav"
    ta.save(str(out_path), wav, model.sr)
    return out_path


async def generate_speech(
    text: str,
    language: str = "es",
    exaggeration: float = 0.5,
    cfg_weight: float = 0.5,
    temperature: float = 0.8,
    reference_path: Optional[Path] = None,
) -> dict:
    loop = asyncio.get_running_loop()
    timeout_s = estimate_timeout_seconds(text)
    t0 = time.time()

    future = loop.run_in_executor(
        _executor, _generate_sync, text, language, exaggeration, cfg_weight, temperature, reference_path
    )
    try:
        out_path = await asyncio.wait_for(future, timeout=timeout_s)
    except asyncio.TimeoutError as exc:
        logger.warning("Generacion cancelada por timeout (%.0fs) para texto de %d caracteres", timeout_s, len(text))
        raise GenerationTimeoutError(
            f"La generacion supero el timeout de {timeout_s:.0f}s"
        ) from exc

    elapsed = time.time() - t0
    return {"path": out_path, "elapsed_s": elapsed, "sample_rate": get_model().sr}
