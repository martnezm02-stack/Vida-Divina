"""Configuracion del Voice Engine, leida desde variables de entorno.

Todo lo que puede cambiar entre esta maquina (CPU local en WSL2) y un futuro
despliegue con GPU o un proveedor remoto vive aqui, como variables de
entorno -- nunca como valores hardcodeados en el resto del codigo. Migrar de
CPU local a GPU/remoto es cambiar estas variables, no tocar el resto del
Voice Engine ni el Marketing Agent que lo consume.
"""
import os
from pathlib import Path

# "cpu" (string) es obligatorio -- pasar un objeto torch.device en vez de un
# string reproduce un bug conocido y sin resolver de chatterbox-tts
# (resemble-ai/chatterbox#533): la comparacion interna `device in ["cpu",
# "mps"]` falla silenciosamente con un objeto torch.device y el checkpoint
# intenta deserializarse en CUDA. No cambiar a torch.device(...) aqui.
DEVICE = os.getenv("CHATTERBOX_DEVICE", "cpu")

# Datos sensibles/pesados (perfiles de voz, audio generado): nunca dentro
# del repositorio git. Ver voice-engine/README.md.
DATA_DIR = Path(os.getenv("VOICE_DATA_DIR", str(Path.home() / "vida-divina-voice-engine-data")))
OUTPUT_DIR = DATA_DIR / "output"
PROFILES_DIR = DATA_DIR / "profiles"

# HF_HOME se deja deliberadamente sin fijar: el checkpoint de Chatterbox ya
# esta cacheado en la ubicacion por defecto de huggingface_hub
# (~/.cache/huggingface). Fijar aqui una ruta distinta forzaria una
# descarga nueva de ~3GB la primera vez que arranque el servicio.

API_KEY = os.getenv("VOICE_ENGINE_API_KEY", "dev-local-only-change-me")
HOST = os.getenv("VOICE_ENGINE_HOST", "127.0.0.1")
PORT = int(os.getenv("VOICE_ENGINE_PORT", "8000"))

# Timeouts calibrados sobre el RTF observado en esta maquina (~9.7x, CPU sin
# GPU). Un texto mas largo recibe un presupuesto de tiempo proporcional en
# vez de un timeout fijo para todos los casos.
CHARS_PER_SECOND_ESTIMATE = 15.0  # ritmo de habla aproximado
RTF_SAFETY_FACTOR = 12.0  # observado ~9.7x, con margen
# MIN_TIMEOUT_S (piso, 2026-08-23): diagnostico real de "SOURCE_ASSET_REQUIRED"
# en Video Workspace (Dashboard) sobre un texto corto real -- dos llamadas
# reales de /v1/speak agotaron el piso anterior (60s) con el worker de
# generacion activo (confirmado con `top -H` sobre el proceso uvicorn real:
# los threads de computo estaban en 99.9% CPU, no bloqueados/inactivos, asi
# que no era un problema de cola atascada), y una tercera llamada real con
# texto equivalente tardo 47.55s para solo 5.52s de audio -- el estimado de
# duracion por conteo de caracteres (CHARS_PER_SECOND_ESTIMATE) subestima
# textos cortos con contenido no tipico (ej. numeros largos, que Chatterbox
# pronuncia digito a digito, mucho mas lento que prosa normal), y esta misma
# maquina comparte CPU real entre WSL2 (Voice Engine) y el resto del trabajo
# en curso en Windows, asi que la latencia real varia. El piso anterior
# quedaba justo en el borde (RTF real observado ~8.6x, dentro del
# RTF_SAFETY_FACTOR=12 ya calibrado) -- se sube el piso, no el factor de
# seguridad, porque el problema es especifico de textos CORTOS (donde el
# estimado proporcional es pequeno y el piso es el que manda), no de la
# formula general.
MIN_TIMEOUT_S = 120.0
MAX_TIMEOUT_S = 900.0  # techo duro: 15 min


def estimate_timeout_seconds(text: str) -> float:
    """Presupuesto de tiempo para una generacion, a partir de la longitud del texto."""
    estimated_audio_s = max(len(text) / CHARS_PER_SECOND_ESTIMATE, 1.0)
    timeout = estimated_audio_s * RTF_SAFETY_FACTOR
    return min(max(timeout, MIN_TIMEOUT_S), MAX_TIMEOUT_S)
