"""Registro interno de perfiles de voz.

Unica fuente de verdad para resolver un voice_profile_id (identificador
opaco) hacia un archivo de referencia real en disco. Los clientes de la API
NUNCA envian una ruta de archivo -- solo un identificador, que se resuelve
aqui, del lado del servidor, contra perfiles registrados previamente.

Identidad vocal (este modulo) y estilo de interpretacion (parametros de
generate(): exaggeration/cfg_weight/temperature) se mantienen separados a
proposito -- un perfil no impone ningun tono, solo aporta el timbre/voz base.
"""
import json
import logging
import re
from pathlib import Path
from typing import Optional

from ..config import PROFILES_DIR

logger = logging.getLogger("voice_engine.voice_profiles")

# Solo alfanumerico, guion y guion bajo -- bloquea cualquier intento de path
# traversal a traves del propio voice_profile_id (ej. "../../etc/passwd").
_PROFILE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


class ProfileNotFoundError(Exception):
    pass


class VoiceProfile:
    def __init__(self, profile_id: str, reference_path: Path, metadata: dict):
        self.profile_id = profile_id
        self.reference_path = reference_path
        self.metadata = metadata

    def public_dict(self) -> dict:
        """Version segura de exponer por HTTP -- nunca incluye la ruta fisica."""
        return {
            "voice_profile_id": self.profile_id,
            "owner": self.metadata.get("owner"),
            "language": self.metadata.get("language"),
            "identity": self.metadata.get("identity"),
            "style": self.metadata.get("style"),
            "status": self.metadata.get("status"),
        }


_cache: dict[str, VoiceProfile] = {}


def _load_profile_from_disk(profile_id: str) -> Optional[VoiceProfile]:
    profile_dir = PROFILES_DIR / profile_id
    manifest_path = profile_dir / "manifest.json"
    if not manifest_path.exists():
        return None

    metadata = json.loads(manifest_path.read_text(encoding="utf-8"))
    reference_path = profile_dir / metadata["reference_file"]
    if not reference_path.exists():
        logger.error("Perfil '%s' referencia un archivo inexistente: %s", profile_id, reference_path)
        return None

    return VoiceProfile(profile_id, reference_path, metadata)


def get_profile(profile_id: str) -> VoiceProfile:
    if not _PROFILE_ID_RE.match(profile_id):
        # Mismo mensaje que "no registrado" -- no revelar si el problema fue
        # el formato o la existencia, para no dar pistas sobre la estructura interna.
        raise ProfileNotFoundError(f"voice_profile_id '{profile_id}' no esta registrado")

    if profile_id in _cache:
        return _cache[profile_id]

    profile = _load_profile_from_disk(profile_id)
    if profile is None:
        raise ProfileNotFoundError(f"voice_profile_id '{profile_id}' no esta registrado")

    _cache[profile_id] = profile
    return profile


def profile_exists(profile_id: str) -> bool:
    try:
        get_profile(profile_id)
        return True
    except ProfileNotFoundError:
        return False
