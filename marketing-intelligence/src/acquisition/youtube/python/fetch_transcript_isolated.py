#!/usr/bin/env python3
"""fetch_transcript_isolated.py — Fase 10E.

Script minimo, invocado como subproceso por youtubeTranscriptApiBackend.js.
Su UNICO trabajo es: recibir un video_id ya validado, llamar a
youtube-transcript-api, e imprimir UN objeto JSON por stdout con el
resultado. Nunca escribe la transcripcion a ningun archivo, nunca usa
cookies/proxy/login/API keys, nunca descarga audio/video, nunca intenta
instalar nada.

Contrato de salida (una sola linea JSON por stdout, siempre):
  Exito:
    {"ok": true, "video_id", "transcript", "transcriptType": "manual"|"auto",
     "transcriptLanguage", "segment_count", "approximate_char_count",
     "duration_approx", "backend": "youtube_transcript_api_subprocess"}
  Fallo con categoria conocida:
    {"ok": false, "video_id", "error": "<Categoria>", "message": "<resumen>"}

Codigos de salida: 0 = se imprimio un JSON valido (exito o fallo controlado).
                    2 = dependencia youtube_transcript_api ausente.
                    1 = error no controlado (tambien imprime JSON antes de salir).
"""
from __future__ import annotations

import argparse
import json
import re
import sys

VIDEO_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{11}$")

EXIT_OK = 0
EXIT_UNEXPECTED = 1
EXIT_MISSING_DEP = 2


def emit(payload: dict) -> None:
    """Unica forma de producir salida: una linea JSON a stdout. Nunca a archivo."""
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.write("\n")
    sys.stdout.flush()


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch de transcript aislado (Fase 10E)")
    parser.add_argument("video_id", help="Video ID de YouTube, exactamente 11 caracteres")
    parser.add_argument("--lang", default="en", help="Codigo de idioma solicitado (default: en)")
    args = parser.parse_args()

    # Validacion estricta ANTES de tocar cualquier libreria o red — defensa en
    # profundidad; el lado Node ya valida esto antes de invocar el subproceso,
    # pero este script nunca confia ciegamente en su llamador.
    if not VIDEO_ID_PATTERN.fullmatch(args.video_id):
        emit({"ok": False, "video_id": args.video_id, "error": "invalid_video_id", "message": "video_id no cumple el patron esperado (11 caracteres alfanumericos/-/_)."})
        return EXIT_UNEXPECTED

    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        from youtube_transcript_api._errors import (
            PoTokenRequired,
            RequestBlocked,
            IpBlocked,
            TranscriptsDisabled,
            NoTranscriptFound,
            VideoUnavailable,
            AgeRestricted,
            VideoUnplayable,
        )
    except ImportError:
        emit({
            "ok": False,
            "video_id": args.video_id,
            "error": "dependency_missing",
            "message": "youtube_transcript_api no esta instalado en este interprete Python. No se instalo automaticamente — requiere autorizacion explicita.",
        })
        return EXIT_MISSING_DEP

    # Sin proxy_config, sin http_client personalizado -> sin cookies, sin
    # proxy, sin sesion persistida entre llamadas. Cada invocacion es aislada.
    ytt_api = YouTubeTranscriptApi()

    try:
        fetched = ytt_api.fetch(args.video_id, languages=[args.lang])
    except PoTokenRequired as e:
        emit({"ok": False, "video_id": args.video_id, "error": "PoTokenRequired", "message": str(e)[:200]})
        return EXIT_OK
    except RequestBlocked as e:
        emit({"ok": False, "video_id": args.video_id, "error": "RequestBlocked", "message": str(e)[:200]})
        return EXIT_OK
    except IpBlocked as e:
        emit({"ok": False, "video_id": args.video_id, "error": "IpBlocked", "message": str(e)[:200]})
        return EXIT_OK
    except TranscriptsDisabled as e:
        emit({"ok": False, "video_id": args.video_id, "error": "TranscriptsDisabled", "message": str(e)[:200]})
        return EXIT_OK
    except NoTranscriptFound as e:
        emit({"ok": False, "video_id": args.video_id, "error": "NoTranscriptFound", "message": str(e)[:200]})
        return EXIT_OK
    except VideoUnavailable as e:
        emit({"ok": False, "video_id": args.video_id, "error": "VideoUnavailable", "message": str(e)[:200]})
        return EXIT_OK
    except AgeRestricted as e:
        emit({"ok": False, "video_id": args.video_id, "error": "AgeRestricted", "message": str(e)[:200]})
        return EXIT_OK
    except VideoUnplayable as e:
        emit({"ok": False, "video_id": args.video_id, "error": "VideoUnplayable", "message": str(e)[:200]})
        return EXIT_OK
    except Exception as e:  # cualquier otro error de la libreria: categoria generica, nunca silencioso
        emit({"ok": False, "video_id": args.video_id, "error": type(e).__name__, "message": str(e)[:200]})
        return EXIT_UNEXPECTED

    # Texto completo SOLO en memoria de este proceso, nunca escrito a disco —
    # se imprime una unica vez a stdout y el proceso termina.
    transcript_text = " ".join(snippet.text for snippet in fetched)
    approx_duration = max((s.start + s.duration) for s in fetched) if len(fetched) else 0.0

    emit({
        "ok": True,
        "video_id": args.video_id,
        "transcript": transcript_text,
        "transcriptType": "auto" if fetched.is_generated else "manual",
        "transcriptLanguage": fetched.language_code,
        "segment_count": len(fetched),
        "approximate_char_count": len(transcript_text),
        "duration_approx": round(approx_duration, 1),
        "backend": "youtube_transcript_api_subprocess",
    })
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
