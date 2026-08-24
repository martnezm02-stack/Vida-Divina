# Voice Engine

Microservicio FastAPI que genera audio a partir de texto usando **Chatterbox Multilingual** (`chatterbox-tts`), corriendo en CPU dentro de WSL2. Es el primer componente Python del proyecto Vida Divina — los demás módulos (`compiler/`, `simulator/`, `decision-engine/`, `recommendation-engine/`, `whatsapp-adapter/`) son Node.js.

**Estado:** generación de voz con la voz por defecto del modelo, o con el perfil de voz clonada del usuario (`voice_profile_id`). Un único perfil registrado hoy: `manuel_es_mx`.

## Arquitectura

```
Backend Node.js (Marketing Agent, futuro)
        │  HTTP, POST /v1/speak
        ▼
┌─────────────────────────────┐
│  Voice Engine (este módulo)  │
│  FastAPI · un solo proceso    │
│  ├─ api/        (contrato HTTP)
│  ├─ services/   (cola de generación, conversión de audio)
│  └─ models/     (carga del modelo, una sola vez)
└─────────────────────────────┘
        │
        ▼
  chatterbox-tts (CPU, WSL2)
```

El contrato HTTP (`api/`) está deliberadamente separado del motor (`services/` + `models/`). Cambiar Chatterbox por otro proveedor, o mover la generación a una GPU/servidor remoto, es reemplazar lo que hay dentro de `services/tts_service.py` y `models/registry.py` — el backend Node.js que lo consume no se entera del cambio, porque solo conoce `POST /v1/speak` y `GET /health`.

## Dónde viven los datos

| Qué | Dónde | En git |
|---|---|---|
| Código (`app/`, `tests/`) | `voice-engine/` (este repo) | Sí |
| Entorno virtual Python | `~/vida-divina-voice-engine-data/venv` (WSL2 nativo) | No |
| Caché de modelos (Hugging Face) | `~/.cache/huggingface` (ubicación por defecto — ver nota abajo) | No |
| Audio generado | `~/vida-divina-voice-engine-data/output/` | No |
| Perfiles de voz (identidad + referencia) | `~/vida-divina-voice-engine-data/profiles/<id>/` | No |
| Grabación maestra y pruebas exploratorias | `~/vida-divina-voice-engine-data/voice-reference/` | No |

**Nota sobre la caché de modelos:** el plan original proponía fijar `HF_HOME` dentro de `~/vida-divina-voice-engine-data/cache/huggingface/`. En la práctica, el modelo ya se descargó (3.0GB) a la ubicación por defecto de `huggingface_hub` (`~/.cache/huggingface`) antes de fijar esa variable. `config.py` deja `HF_HOME` sin tocar a propósito — forzar otra ruta ahora provocaría una descarga nueva de ~3GB, que no se justifica solo por reordenar carpetas.

## Voice Profiles

Un perfil de voz separa dos cosas que nunca deben mezclarse en el mismo lugar:

- **Identidad vocal** (timbre, resonancia, pronunciación) — vive en `profiles/<id>/reference.wav` + `manifest.json`, y no cambia entre usos.
- **Estilo de interpretación** (cálido, entusiasta, neutral...) — son los parámetros `exaggeration` / `cfg_weight` / `temperature` de cada solicitud, independientes del perfil.

```
~/vida-divina-voice-engine-data/profiles/
└── manuel_es_mx/
    ├── manifest.json   # owner, language, identity, style, status, reference_file
    └── reference.wav   # copia dedicada de voice-reference/reference-mono.wav
```

`app/models/voice_profiles.py` es la única puerta de entrada: resuelve un `voice_profile_id` (string opaco) hacia su `reference.wav`, validando el formato del ID contra `^[a-zA-Z0-9_-]{1,64}$` antes de tocar el filesystem — un intento de path traversal (`"../../etc/passwd"`) nunca llega a construirse como ruta real. El cliente HTTP **nunca** puede enviar una ruta de archivo directamente: `SpeakRequest` usa `extra="forbid"`, así que cualquier campo no declarado (`reference_audio_path`, etc.) hace que la solicitud entera se rechace con `422`.

**Perfil registrado hoy:**

| Campo | Valor |
|---|---|
| `voice_profile_id` | `manuel_es_mx` |
| `owner` | Manuel |
| `language` | es-MX |
| `identity` | authentic_user_voice |
| `style` | neutral |
| `status` | active |

`language: es-MX` es una etiqueta a nivel de perfil/API — el modelo instalado solo entiende `language_id="es"` (sin variante regional), así que `_normalize_language()` en `api/speak.py` recorta cualquier `"xx-YY"` a `"xx"` antes de llamar a Chatterbox. Integrar el finetune regional `ResembleAI/Chatterbox-Multilingual-es-mx-latam` queda pendiente para más adelante (requiere descargar un checkpoint nuevo, fuera de alcance hoy).

## Problemas conocidos y cómo se resolvieron

- **`RuntimeError: Attempting to deserialize object on a CUDA device`** — bug conocido de `chatterbox-tts` ([resemble-ai/chatterbox#533](https://github.com/resemble-ai/chatterbox/issues/533), sin fusionar). Ocurre si `device` se pasa como `torch.device("cpu")` en vez de el string `"cpu"`. `models/registry.py` siempre pasa el string — no cambiar eso sin revisar el issue primero.
- **`TypeError: 'NoneType' object is not callable` en `perth.PerthImplicitWatermarker()`** — `setuptools>=82` eliminó `pkg_resources`, del que depende `resemble-perth` (la librería de watermarking de audio que usa Chatterbox). Solución: mantener `setuptools<82` en el entorno virtual (ver `requirements.txt`). **No actualizar `setuptools` en este venv.**

## Iniciar el servicio desde WSL2

```bash
# Desde una terminal de Ubuntu (WSL2)
cd "/mnt/c/Users/manue/Vida Divina/voice-engine"

source ~/vida-divina-voice-engine-data/venv/bin/activate
export PYTHONPATH="/mnt/c/Users/manue/Vida Divina/voice-engine:$PYTHONPATH"
export VOICE_ENGINE_API_KEY="<tu clave>"   # o cargar desde .env con python-dotenv

uvicorn app.main:app --host 127.0.0.1 --port 8000
```

El primer arranque carga el modelo (~15-30s en esta máquina) antes de aceptar tráfico — `GET /health` responde `model_loaded: false` hasta que termine.

**Detener el servicio:** `Ctrl+C` en la terminal donde corre `uvicorn`, o `kill <PID>` si corre en background.

## Probar desde Windows / Node.js

WSL2 en modo NAT (el modo activo en esta máquina) reenvía `localhost` automáticamente hacia Windows — no hace falta configuración de red adicional.

**Desde PowerShell:**
```powershell
curl http://localhost:8000/health

curl -Method POST http://localhost:8000/v1/speak `
  -Headers @{ "x-api-key" = "<tu clave>"; "Content-Type" = "application/json" } `
  -Body '{"text":"Hola, esta es una prueba.","language":"es-MX","voice_profile_id":"manuel_es_mx"}'
```

**Desde Node.js:**
```js
const resp = await fetch("http://localhost:8000/v1/speak", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": process.env.VOICE_ENGINE_API_KEY,
  },
  body: JSON.stringify({
    text: "Hola, esta es una prueba.",
    language: "es-MX",
    voice_profile_id: "manuel_es_mx",
  }),
});
const data = await resp.json();
// data.output_filename es solo el nombre del archivo (nunca la ruta absoluta
// del servidor) -- vive dentro de ~/vida-divina-voice-engine-data/output/
```

## Timeouts

Calibrados sobre el RTF observado en esta máquina (~9.7×, CPU sin GPU — ver `config.py`). El timeout de cada solicitud se calcula a partir de la longitud del texto (mínimo 60s, máximo 900s), no es un valor fijo único. Un cliente Node.js debería usar un timeout de al menos ese mismo techo (900s) para no cortar generaciones largas antes de tiempo.

Como no hay GPU, las solicitudes se sirven **una a la vez** (`ThreadPoolExecutor(max_workers=1)` en `tts_service.py`) — una segunda solicitud concurrente espera a que termine la primera antes de empezar a generar.

## Seguridad

- El servicio solo debe enlazarse a `127.0.0.1` (nunca `0.0.0.0`) — no está pensado para exponerse más allá de esta máquina.
- `POST /v1/speak` requiere el header `x-api-key`, comparado contra `VOICE_ENGINE_API_KEY`.
- El cliente nunca puede enviar una ruta de archivo de referencia — solo un `voice_profile_id` opaco, resuelto del lado del servidor contra perfiles pre-registrados (`app/models/voice_profiles.py`). Campos no declarados en `SpeakRequest` se rechazan con `422` (`extra="forbid"`).
- `voice_profile_id` se valida contra `^[a-zA-Z0-9_-]{1,64}$` antes de tocar el filesystem — bloquea path traversal a través del propio ID.
- Las respuestas HTTP nunca incluyen rutas físicas del servidor — ni la del archivo de referencia (nunca se expuso) ni la del audio generado (`output_filename` es solo el nombre del archivo).
- La conversión a OGG/Opus (`services/audio_convert.py`) invoca `ffmpeg` con una lista de argumentos (no `shell=True`), evitando inyección de comandos.
- `profiles/`, `voice-reference/` y cualquier `*.wav`/`*.ogg`/`*.mp3` están explícitamente en `.gitignore` del módulo, además de vivir fuera del repositorio por completo.

## Pruebas

```bash
source ~/vida-divina-voice-engine-data/venv/bin/activate
cd "/mnt/c/Users/manue/Vida Divina/voice-engine"
python -m pytest tests/ -v
```

Los tests de `/health` y `/v1/speak` usan un modelo simulado (`monkeypatch`) — no cargan el modelo real de 500M parámetros, para que la suite corra en segundos. `test_voice_profiles.py` sí valida contra el perfil real registrado en disco (`manuel_es_mx`), pero solo lee metadata/rutas, no genera audio. `test_audio_convert.py` ejecuta `ffmpeg` de verdad, sobre un WAV sintético de 0.2s generado en el propio test.

## Qué falta (fuera de alcance de esta implementación)

- Dirección de estilo por perfil (cálido, consultivo, etc.) como parámetros de interpretación separados de la identidad vocal — hoy `exaggeration`/`cfg_weight`/`temperature` son libres por solicitud, no atados a `manuel_es_mx`.
- Finetune regional `ResembleAI/Chatterbox-Multilingual-es-mx-latam` — requiere descargar un checkpoint nuevo.
- `POST /v1/voices` para registrar perfiles nuevos por API (hoy se crean manualmente en `~/vida-divina-voice-engine-data/profiles/`).
- Endpoint HTTP para la conversión WAV → OGG/Opus (la función ya existe en `services/audio_convert.py`, lista para conectarse cuando se construya el flujo de WhatsApp).
- Cliente Node.js dedicado (`integrations/voiceEngineClient.js`) — se documenta el uso directo por HTTP arriba porque el backend del Marketing Agent aún no existe en el repo.
- Integración con WhatsApp / Marketing Agent, generación masiva, múltiples perfiles simultáneos.
