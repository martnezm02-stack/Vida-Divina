"""Carga y mantiene en memoria el modelo Chatterbox Multilingual.

El modelo se carga una unica vez (singleton protegido por lock) cuando el
servicio arranca -- nunca por request. Cargar los pesos en cada llamada
seria inviable en latencia.

Checkpoint regional es-mx-latam (2026-09-09): T3 y S3Gen se cargan desde
`ResembleAI/Chatterbox-Multilingual-es-mx-latam` (finetune regional para
espanol mexicano/LatAm) en vez del repo base `ResembleAI/chatterbox` --
decision tomada tras una comparacion A/B real escuchada directamente. VE y
el tokenizer de texto se siguen cargando del repo base porque el regional
no los incluye (ver _load_regional_model()). El perfil de voz
("manuel_es_mx", su reference.wav) no cambia -- el checkpoint regional
afecta pronunciacion/prosodia del modelo de lenguaje, no la identidad
vocal, que sigue viniendo del audio de referencia via voice cloning.

BF16 hibrido (2026-09-09): unicamente t3 (2GB en float32, el submodulo mas
grande con diferencia) se carga en bfloat16 -- ahorro real medido ~1GB de
RSS, critico en esta VM de WSL2 (techo ~7.5GB, ver OOM real diagnosticado
2026-09-08). TODO S3Gen (flow, tokenizer, speaker_encoder, mel2wav) y ve se
mantienen en FP32, sin tocar nada: se probaron tres variantes distintas de
castear partes de S3Gen a bf16 y las tres revientan con una generacion REAL
(no en el camino de prueba con audio_prompt_path=None, sino en el camino
real de produccion, que SIEMPRE pasa audio_prompt_path porque el perfil
"manuel_es_mx" tiene un reference.wav registrado y por tanto SIEMPRE llama
a prepare_conditionals() -> embed_ref()) -- esto aplica igual de cara al
checkpoint regional (misma arquitectura S3Gen, mismo riesgo):
  - ve: VoiceEncoder.embeds_from_mels() llama `.numpy()` directamente sobre
    su propia salida -- numpy no tiene bfloat16 nativo, revienta.
  - s3gen.tokenizer: S3Gen.embed_ref() llama
    `self.tokenizer(ref_wav_16.float())` -- fuerza el input a float32 sin
    relacion con el dtype real de sus pesos.
  - s3gen.speaker_encoder: embed_ref() castea el AUDIO de entrada a
    self.dtype (propiedad de S3Gen ligada a s3gen.flow) antes de llamar a
    speaker_encoder.inference() -- su extraccion de features (xvector.py ->
    torchaudio.compliance.kaldi.fbank -> torch.fft.rfft) no soporta
    BFloat16 en absoluto en esta build de PyTorch/CPU (RuntimeError:
    Unsupported dtype BFloat16, confirmado real con una generacion real
    fallida). Como self.dtype se comparte para TODO S3Gen (no solo para el
    submodulo que se cast5ea), esto persiste aunque s3gen.speaker_encoder
    en si se deje en FP32 -- la unica forma de evitarlo por completo es que
    s3gen.flow (quien determina self.dtype) tambien se quede en FP32.
  - s3gen.mel2wav (HiFiGAN): SourceModuleHnNSF/SineGen construyen tensores
    (torch.zeros/Uniform/randn_like) siempre en float32, sin relacion con
    el dtype de sus propias capas -- confirmado con pruebas aisladas reales.
Con S3Gen intacto en FP32, self.dtype (la propiedad de S3Gen) reporta FP32
en todo momento, así que la unica llamada real dentro de S3Gen.inference()
que recastea ref_dict (`ref_dict[rk].to(dtype=self.dtype)`, incluidos
prompt_token/prompt_token_len) resulta inofensiva -- FP32 SI representa con
exactitud enteros de hasta 6561 (el vocab_size real), a diferencia de
BF16 (que solo representa enteros exactos hasta 256) -- por eso NO hace
falta sustituir s3gen.inference() por una orquestacion propia: se llama
tal cual, sin tocar el paquete instalado.
generate_speech_bf16() (mas abajo) reimplementa
ChatterboxMultilingualTTS.generate() sin tocar el paquete instalado,
unicamente para: (a) recastear conds.t3 a bf16 despues de
prepare_conditionals() -- necesario porque T3CondEnc.spkr_enc (parte de t3,
bf16) exige que conds.t3.speaker_emb tambien sea bf16 -- y (b) blindar la
reconstruccion de emotion_adv (rama de exaggeration distinto al ya
cargado) para que tambien quede en bf16 en vez de heredar el float32 por
defecto de torch.ones(). El resto de la logica (tokenizacion de texto,
T3.inference(), s3gen.inference(), watermarking) es identica a la del
paquete instalado.
"""
import logging
import threading
import time
from pathlib import Path

import torch
import torch.nn.functional as F
from huggingface_hub import snapshot_download
from safetensors.torch import load_file as load_safetensors
from chatterbox.mtl_tts import ChatterboxMultilingualTTS, SUPPORTED_LANGUAGES, punc_norm
from chatterbox.models.s3tokenizer import drop_invalid_tokens
from chatterbox.models.t3 import T3
from chatterbox.models.t3.modules.t3_config import T3Config
from chatterbox.models.t3.modules.cond_enc import T3Cond
from chatterbox.models.s3gen import S3Gen
from chatterbox.models.tokenizers import MTLTokenizer
from chatterbox.models.voice_encoder import VoiceEncoder

from ..config import DEVICE

logger = logging.getLogger("voice_engine.registry")

_model: ChatterboxMultilingualTTS | None = None
_lock = threading.Lock()

# Repo base: unicamente para VE y el tokenizer de texto, que el repo
# regional no incluye. Mismo repo que chatterbox.mtl_tts.REPO_ID.
_BASE_REPO_ID = "ResembleAI/chatterbox"
_REGIONAL_REPO_ID = "ResembleAI/Chatterbox-Multilingual-es-mx-latam"

# Claves ya verificadas (2026-09-09, prueba A/B real) que faltan en
# s3gen_v3.pt frente a la arquitectura S3Gen instalada -- son buffers
# deterministicos del tokenizer de audio (filtro mel / ventana), no pesos
# aprendidos; la propia clase S3Token2Wav ya las declara en
# ignore_state_dict_missing. Cualquier OTRA clave faltante o inesperada se
# trata como error real, no se oculta.
_S3GEN_V3_KNOWN_MISSING = frozenset({"tokenizer._mel_filters", "tokenizer.window"})


def _load_regional_model(device: str) -> ChatterboxMultilingualTTS:
    """Carga T3 (`t3_es_mx_latam.safetensors`) y S3Gen (`s3gen_v3.pt`) del
    checkpoint regional es-mx-latam, reutilizando VE y el tokenizer de texto
    del repo base (el regional no los incluye). Replica from_local() del
    paquete instalado sin modificarlo -- la unica diferencia real es el
    origen de los archivos de T3/S3Gen y la excepcion controlada para las
    dos claves ya verificadas como ausentes en s3gen_v3.pt."""
    base_dir = Path(snapshot_download(
        repo_id=_BASE_REPO_ID, repo_type="model", revision="main",
        allow_patterns=["ve.pt", "grapheme_mtl_merged_expanded_v1.json"],
    ))
    regional_dir = Path(snapshot_download(
        repo_id=_REGIONAL_REPO_ID, repo_type="model", revision="main",
        allow_patterns=["t3_es_mx_latam.safetensors", "s3gen_v3.pt"],
    ))
    map_location = torch.device("cpu")

    ve = VoiceEncoder()
    ve.load_state_dict(torch.load(base_dir / "ve.pt", map_location=map_location, weights_only=True))
    ve.to(device).eval()

    t3 = T3(T3Config.multilingual())
    t3_state = load_safetensors(regional_dir / "t3_es_mx_latam.safetensors")
    if "model" in t3_state.keys():
        t3_state = t3_state["model"][0]
    t3.load_state_dict(t3_state)
    t3.to(device).eval()

    s3gen = S3Gen()
    missing, unexpected = s3gen.load_state_dict(
        torch.load(regional_dir / "s3gen_v3.pt", map_location=map_location, weights_only=True),
        strict=False,
    )
    unknown_missing = [k for k in missing if k not in _S3GEN_V3_KNOWN_MISSING]
    if unknown_missing or unexpected:
        raise RuntimeError(
            "s3gen_v3.pt no coincide con la arquitectura S3Gen instalada de forma inesperada -- "
            f"claves_faltantes_no_reconocidas={unknown_missing} claves_inesperadas={list(unexpected)}"
        )
    logger.info("s3gen_v3.pt: claves faltantes ignoradas (ya verificadas, ver docstring): %s", list(missing))
    s3gen.to(device).eval()

    tokenizer = MTLTokenizer(str(base_dir / "grapheme_mtl_merged_expanded_v1.json"))

    return ChatterboxMultilingualTTS(t3, s3gen, ve, tokenizer, device, conds=None)


def _apply_bf16_hybrid(model: ChatterboxMultilingualTTS) -> None:
    """Castea a bfloat16 unicamente t3 (ver docstring del modulo -- S3Gen y
    ve se dejan intactos en FP32 tras probar y descartar tres alternativas
    reales). No modifica el paquete instalado -- opera sobre el objeto ya
    cargado, desde nuestro propio codigo."""
    model.t3 = model.t3.to(dtype=torch.bfloat16)


def get_model() -> ChatterboxMultilingualTTS:
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                logger.info(
                    "Cargando modelo regional es-mx-latam (T3+S3Gen) + VE/tokenizer base (device=%s)...",
                    DEVICE,
                )
                t0 = time.time()
                _model = _load_regional_model(DEVICE)
                _apply_bf16_hybrid(_model)
                logger.info(
                    "Modelo cargado en %.2fs (regional es-mx-latam; BF16 hibrido: t3; FP32: ve+s3gen completo)",
                    time.time() - t0,
                )
    return _model


def is_loaded() -> bool:
    return _model is not None


def generate_speech_bf16(
    model: ChatterboxMultilingualTTS,
    text: str,
    language_id: str,
    audio_prompt_path=None,
    exaggeration: float = 0.5,
    cfg_weight: float = 0.5,
    temperature: float = 0.8,
    repetition_penalty: float = 2.0,
    min_p: float = 0.05,
    top_p: float = 1.0,
):
    """Reimplementacion de ChatterboxMultilingualTTS.generate() para el
    esquema BF16 hibrido -- identica al paquete instalado salvo el manejo
    explicito del dtype de conds.t3 (ver docstring del modulo)."""
    if language_id and language_id.lower() not in SUPPORTED_LANGUAGES:
        supported_langs = ", ".join(SUPPORTED_LANGUAGES.keys())
        raise ValueError(
            f"Unsupported language_id '{language_id}'. Supported languages: {supported_langs}"
        )

    if audio_prompt_path:
        model.prepare_conditionals(audio_prompt_path, exaggeration=exaggeration)
    else:
        assert model.conds is not None, "Please `prepare_conditionals` first or specify `audio_prompt_path`"

    # T3Cond.to() ya existente en el paquete: castea solo tensores float,
    # respeta None e int/long tal cual -- nunca toca prompt_token/_len (que
    # viven en conds.gen, no en conds.t3). Idempotente en cada llamada.
    model.conds.t3 = model.conds.t3.to(dtype=torch.bfloat16)

    if float(exaggeration) != float(model.conds.t3.emotion_adv[0, 0, 0].item()):
        _cond: T3Cond = model.conds.t3
        model.conds.t3 = T3Cond(
            speaker_emb=_cond.speaker_emb,
            cond_prompt_speech_tokens=_cond.cond_prompt_speech_tokens,
            emotion_adv=(exaggeration * torch.ones(1, 1, 1)).to(dtype=torch.bfloat16),
        ).to(device=model.device)

    text = punc_norm(text)
    text_tokens = model.tokenizer.text_to_tokens(
        text, language_id=language_id.lower() if language_id else None
    ).to(model.device)
    text_tokens = torch.cat([text_tokens, text_tokens], dim=0)

    sot = model.t3.hp.start_text_token
    eot = model.t3.hp.stop_text_token
    text_tokens = F.pad(text_tokens, (1, 0), value=sot)
    text_tokens = F.pad(text_tokens, (0, 1), value=eot)

    with torch.inference_mode():
        speech_tokens = model.t3.inference(
            t3_cond=model.conds.t3,
            text_tokens=text_tokens,
            max_new_tokens=1000,
            temperature=temperature,
            cfg_weight=cfg_weight,
            repetition_penalty=repetition_penalty,
            min_p=min_p,
            top_p=top_p,
        )
        speech_tokens = speech_tokens[0]
        speech_tokens = drop_invalid_tokens(speech_tokens)
        speech_tokens = speech_tokens.to(model.device)

        # S3Gen entero permanece FP32 (ver docstring del modulo) -- se
        # reutiliza la orquestacion real del paquete tal cual, sin
        # sustituirla: con self.dtype en FP32, su propio recasteo interno
        # de ref_dict es inofensivo (FP32 representa con exactitud los IDs
        # de token, hasta vocab_size=6561). Verificado en runtime real
        # (2026-09-09): prompt_token.dtype/prompt_token_len.dtype ==
        # torch.int64, speech_feat.dtype == torch.float32 justo antes de
        # mel2wav.
        wav, _ = model.s3gen.inference(speech_tokens=speech_tokens, ref_dict=model.conds.gen)
        wav = wav.squeeze(0).detach().cpu().numpy()
        watermarked_wav = model.watermarker.apply_watermark(wav, sample_rate=model.sr)
    return torch.from_numpy(watermarked_wav).unsqueeze(0)
