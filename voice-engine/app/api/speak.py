from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from ..config import API_KEY
from ..models import voice_profiles
from ..services.tts_service import GenerationTimeoutError, generate_speech

router = APIRouter()


class SpeakRequest(BaseModel):
    # extra="forbid": cualquier campo no declarado aqui (ej. un intento de
    # enviar una ruta de archivo de referencia) hace que la solicitud entera
    # sea rechazada con 422, en vez de ser ignorada en silencio.
    model_config = ConfigDict(extra="forbid")

    text: str = Field(..., min_length=1, max_length=2000)
    language: str = Field(default="es")
    # Identificador opaco de un perfil registrado del lado del servidor.
    # NUNCA una ruta de archivo -- se resuelve contra voice_profiles.py.
    voice_profile_id: Optional[str] = None
    exaggeration: float = Field(default=0.5, ge=0.0, le=1.0)
    cfg_weight: float = Field(default=0.5, ge=0.0, le=1.0)
    temperature: float = Field(default=0.8, ge=0.05, le=2.0)


class SpeakResponse(BaseModel):
    # Solo el nombre de archivo -- nunca la ruta absoluta del servidor (ver
    # requisito de seguridad: no exponer rutas fisicas en respuestas HTTP).
    output_filename: str
    sample_rate: int
    generation_seconds: float
    voice_profile_id: Optional[str] = None


def _check_api_key(x_api_key: Optional[str]) -> None:
    if not API_KEY or x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="API key invalida o ausente")


def _normalize_language(language: str) -> str:
    """'es-MX' -> 'es'. Chatterbox solo conoce codigos base (SUPPORTED_LANGUAGES),
    no variantes regionales -- la variante se declara a nivel de perfil/API,
    no a nivel del modelo instalado hoy."""
    return language.split("-")[0].lower()


@router.post("/v1/speak", response_model=SpeakResponse)
async def speak(payload: SpeakRequest, x_api_key: Optional[str] = Header(default=None)):
    _check_api_key(x_api_key)

    reference_path = None
    if payload.voice_profile_id:
        try:
            profile = voice_profiles.get_profile(payload.voice_profile_id)
        except voice_profiles.ProfileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        reference_path = profile.reference_path

    try:
        result = await generate_speech(
            text=payload.text,
            language=_normalize_language(payload.language),
            exaggeration=payload.exaggeration,
            cfg_weight=payload.cfg_weight,
            temperature=payload.temperature,
            reference_path=reference_path,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except GenerationTimeoutError as exc:
        raise HTTPException(status_code=504, detail=str(exc)) from exc

    return SpeakResponse(
        output_filename=result["path"].name,
        sample_rate=result["sample_rate"],
        generation_seconds=round(result["elapsed_s"], 2),
        voice_profile_id=payload.voice_profile_id,
    )
