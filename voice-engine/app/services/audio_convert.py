"""Conversion WAV -> OGG/Opus via FFmpeg, para notas de voz de WhatsApp.

No expuesto todavia como endpoint HTTP -- es una funcion reutilizable lista
para que el backend del Marketing Agent (o un futuro endpoint propio) la
invoque cuando se construya el flujo completo hacia WhatsApp.
"""
import subprocess
from pathlib import Path
from typing import Optional


class AudioConversionError(Exception):
    pass


def wav_to_ogg_opus(
    wav_path: Path,
    ogg_path: Optional[Path] = None,
    bitrate: str = "32k",
    sample_rate: int = 16000,
) -> Path:
    wav_path = Path(wav_path)
    if not wav_path.exists():
        raise AudioConversionError(f"No existe el archivo de entrada: {wav_path}")

    if ogg_path is None:
        ogg_path = wav_path.with_suffix(".ogg")
    ogg_path = Path(ogg_path)

    cmd = [
        "ffmpeg", "-y",
        "-i", str(wav_path),
        "-c:a", "libopus",
        "-b:a", bitrate,
        "-ar", str(sample_rate),
        "-ac", "1",
        str(ogg_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise AudioConversionError(proc.stderr)
    return ogg_path
