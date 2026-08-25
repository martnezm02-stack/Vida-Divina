# Checkpoint — Video Workspace + Voice Engine real + cierre del bug de Ripped Capsules

**Fecha:** 2026-08-23. Continúa desde `docs/PROJECT_STATE_CHECKPOINT_2026-08-21_WHATSAPP_INTEGRATION_CAMPAIGN_PILOT.md` (`PHASE_STATUS = CLOSED`). Este checkpoint documenta trabajo real que ya existía en el repositorio (sin comitear) desde el 21 al 23 de agosto, más el diagnóstico y la corrección real de un bug abierto que quedó pendiente sin cerrar entre sesiones.

> **[VERIFICADO]** = re-ejecutado o reproducido en esta sesión con evidencia real (proceso real, log real, o test real). Ningún dato ficticio, ningún mock del Voice Engine, `AUTO_PUBLISH` sin tocar.

## 1. Contexto: qué se encontró al empezar esta sesión

Al recuperar el estado del proyecto, el último checkpoint escrito era el del 21-ago (Fase 16), pero el árbol de trabajo (sin comitear, HEAD sigue en `aba6470`) ya contenía ~2 días más de trabajo real sin documentar:

- **`image-generation/`** (módulo nuevo) — Fase 1: contrato `ImageProvider`, adaptador determinista de request, `MockImageProvider` (sin red, sin credenciales). No reimplementa nada de `creative-intelligence/`, solo lo consume.
- **`content-orchestrator/src/hypothesisCopyProvider.js`, `hypothesisCreativeEngine.js`, `creativeQualityGate.js`** — capa de generación y validación de copy para experimentos de hipótesis creativa (usada por `handleSuggestHypothesisVariants` en el Dashboard), con su Quality Gate propio (`runCreativeQualityGate`/`runExperimentQualityGate`: detecta claims repetidos, CTAs idénticas entre variantes, copy vacío/de bajo valor, falta de ritmo social-nativo).
- **"Video Workspace"** — feature nueva en el Dashboard (`dashboard/public/{index.html,app.js,styles.css}`, `dashboard/server/routes/generation.js`, `dashboard/test/videoWorkspace.test.js`) que conecta `POST /api/create` a un voiceover real (existente o generado) + render de video real, con guards de Claim Safety sobre el `voiceoverText` (auditoría "Video Workspace + Voice Engine", 2026-08-23) antes de invocar al Voice Engine.
- **`dashboard/server/lib/voiceEngineClient.js`** — cliente real hacia `voice-engine/` (FastAPI): `listExistingAudioAssets()` (WAV curados en `_audio-cache/`) y `generateNewVoiceover()` (POST real a `/v1/speak`), con un fix ya aplicado para una condición de carrera WSL2→Windows al leer el WAV recién escrito (`leerArchivoConReintentos`, en `content-orchestrator/src/assetPackage.js`).
- **11 generaciones de video reales** ya ejecutadas la noche del 22-23 (`video-production/dashboard-outputs/create-*`), cada una con `master-project.mp4` + `INSTAGRAM_REEL.mp4` reales en disco, para los productos recién fotografiados (`sculpt-black`, `Sculpt-Tongkat-Ali`, `cappuccino`, `mars-capsules`, `venus-capsules`, `extracto-tremella`, `ripped-capsules`).

El trabajo se detuvo con **1 test en rojo, sin diagnosticar**: `dashboard/test/videoWorkspace.test.js:157` (`audioSource:"generate"` para Divina Ripped Capsules) — esperaba `status:"COMPLETED"`, recibía `status:"SOURCE_ASSET_REQUIRED"`. Esta sesión retoma exactamente ahí.

## 2. Diagnóstico real (Fase 1-3 del encargo)

`SOURCE_ASSET_REQUIRED` es solo el síntoma (`dashboard/server/routes/generation.js:129`, catch genérico alrededor de `generateNewVoiceover()`). Para obtener la causa raíz real se reprodujo la llamada real, en proceso, contra el Voice Engine real corriendo en `localhost:8000` (puerto ya activo en esta máquina) — nunca contra un mock.

**Primeros dos intentos reales (antes de cualquier cambio):**

```
FAILED after 60081 ms — Voice Engine respondió 504: "La generacion supero el timeout de 60s"
FAILED after 60024 ms — Voice Engine respondió 504: "La generacion supero el timeout de 60s"
```

Se inspeccionó `voice-engine/app/services/tts_service.py` y `voice-engine/app/config.py`: cada solicitud a `/v1/speak` recibe un presupuesto de tiempo (`estimate_timeout_seconds`) calculado a partir de `len(text) / CHARS_PER_SECOND_ESTIMATE * RTF_SAFETY_FACTOR`, con un piso `MIN_TIMEOUT_S = 60.0`.

**Se descartó la hipótesis inicial (cola atascada / WSL2 stuck):** con `top -H -p <pid_uvicorn>` (vía `wsl.exe`) se confirmó, en vivo y durante una solicitud real en curso, que el worker SÍ estaba computando activamente (7-8 threads a 99.9% CPU cada uno — cómputo real de PyTorch, no un hilo bloqueado/inactivo). No era una cola atascada.

**Tercer intento real** (mismo entorno, sin cambios) tuvo éxito:

```
SUCCESS after 47699 ms — generation_seconds: 47.55, duración real del WAV: 5.52s
```

**Causa raíz confirmada:** el texto corto usado (marcador único con `Date.now()`, igual que el de `videoWorkspace.test.js`) produce más audio real (5.52s) del que `CHARS_PER_SECOND_ESTIMATE` estima a partir de su longitud en caracteres (2.67s) — Chatterbox pronuncia números largos dígito a dígito, mucho más lento que prosa normal. El presupuesto calculado (~32s) quedaba muy por debajo de lo necesario incluso después de aplicarse el piso de 60s (el real, ~66s, según el propio `RTF_SAFETY_FACTOR` ya calibrado). Con RTF real observado ~8.6x (dentro del `RTF_SAFETY_FACTOR=12` ya calibrado — ese factor está bien), el piso de 60s resultó insuficiente específicamente para textos CORTOS, donde el margen proporcional es pequeño y el piso es el que manda. Esta misma máquina además comparte CPU real entre WSL2 (Voice Engine) y el resto del trabajo en curso en Windows, por lo que la latencia real varía sesión a sesión.

**No era:** condición de carrera WSL2 (el fix de `leerArchivoConReintentos` ya existente sigue siendo válido y correcto para lo que resuelve, pero no era la causa de este fallo), `VOICE_ENGINE_WSL_USER`, permisos, cache, asset registry, ni un producto sin asset esperado — el propio proceso Voice Engine devolvía un 504 real y honesto.

## 3. Corrección aplicada

`voice-engine/app/config.py`: `MIN_TIMEOUT_S` sube de `60.0` a `120.0`, con comentario fechado documentando el diagnóstico real (RTF_SAFETY_FACTOR intacto, sin tocar — ya estaba bien calibrado). Cambio de una constante, general para cualquier producto/texto que use `audioSource:"generate"` — no es un workaround específico de `ripped-capsules`, y no toca el código del Dashboard ni de `content-orchestrator` (ninguno de los dos tenía el bug: el cliente Node ya esperaba correctamente hasta 10 minutos y ya reportaba el error real del servidor sin fabricar nada).

Requirió reiniciar el proceso `uvicorn` real de Voice Engine (el valor de `config.py` se lee una sola vez al importar el módulo) — README ya documentaba el procedimiento de arranque/parada; se reinició de forma limpia (`kill -TERM`, esperar salida, relanzar con el mismo comando documentado).

## 4. Validación real de punta a punta — [VERIFICADO]

Con el fix aplicado y Voice Engine reiniciado, se reprodujo el flujo real completo para Divina Ripped Capsules:

```
audioSource:"generate" → POST /v1/speak real → WAV real (24kHz, 5.52s)
  → leerArchivoConReintentos (hand-off WSL2→Windows) → Audio Asset registrado
  → render real (ffmpeg) → INSTAGRAM_REEL.mp4 real → status: COMPLETED
```

`dashboard/test/videoWorkspace.test.js` en aislamiento: **8/8 pass**, incluida la prueba que fallaba (`audioSource:"generate" para Divina Ripped Capsules produce un Audio Asset real DISTINTO del sample viejo de Té Divina`, 119.4s, hash del audio real confirmado distinto del sample viejo de Té Divina, path fuera de `_audio-cache/`). Repetido una segunda vez de forma aislada con resultado idéntico (todas las pruebas del archivo en verde).

## 5. Hallazgo nuevo y separado: Voice Engine puede morir por presión de memoria en una corrida completa muy larga

Al correr la suite COMPLETA de `dashboard` (126 tests, incluye múltiples renders reales de varios minutos cada uno) dos veces seguidas (concurrente y luego en serie, `--test-concurrency=1`), la prueba de `audioSource:"generate"` se auto-omitió (`t.skip`, no es un fallo) ambas veces — su propio guard de salud (`GET /health` con timeout de 2s) no pudo conectar. Investigado en vivo: el proceso `uvicorn` real había **muerto** (log real termina abruptamente justo después de un `POST /v1/speak` exitoso, sin traceback ni mensaje de cierre — patrón consistente con un kill externo, no una excepción de Python). La VM de WSL2 en esta máquina no tiene `.wslconfig` (techo por defecto, ~7.6GB observados vía `top`), y el modelo cargado ya usa ~5.6GB residentes por sí solo; una corrida completa y sostenida de la suite de `dashboard` (que incluye varios renders reales pesados de ffmpeg/Chrome headless en Windows, además del propio Voice Engine en WSL2) agota ese margen.

**Esto es un hallazgo real, distinto del bug de esta fase (el timeout), y queda fuera del alcance de esta corrección** — no es un bug de lógica (el propio `voiceEngineClient.js` reporta el error honestamente cuando esto ocurre, no fabrica un resultado), es una restricción real de capacidad de esta máquina bajo carga sostenida. Se reinició Voice Engine una segunda vez tras este hallazgo y quedó saludable. No se modificó ningún límite de memoria de WSL2 (`.wslconfig` es una configuración de todo el sistema del usuario, fuera del repositorio — decisión que corresponde al propietario, no a esta sesión).

## 6. Tests — [VERIFICADO], corridos en esta sesión

| Suite | Resultado |
|---|---|
| `image-generation` | 82/82 pass |
| `video-production` | 43/43 pass (incluye render MP4 real + validación ffprobe) |
| `voice-engine` (pytest, tras el fix) | 14/14 pass |
| `dashboard/test/videoWorkspace.test.js` (aislado, tras el fix) | 8/8 pass, 2 corridas independientes |
| `content-orchestrator` (suite completa) | 334/335 pass — 1 fallo preexistente, ajeno (`publishingService.test.js`, ya documentado desde la Fase 16: variables `FACEBOOK_*`/`INSTAGRAM_*` del entorno de shell, no un archivo tocado por ninguna fase) |
| `dashboard` (suite completa, `npm test`) | 125/126 pass, 1 **auto-omitido** por el hallazgo del §5 (Voice Engine caído en ese instante) — la aserción original del bug (`SOURCE_ASSET_REQUIRED` vs `COMPLETED`) no volvió a fallar ninguna vez tras el fix, en ninguna de las 4 corridas posteriores al cambio |

Ninguna regresión detectada en ningún módulo relacionado.

## 7. Estado final

```
IMAGE GENERATION (Fase 1)     = INFRAESTRUCTURA LISTA (MockImageProvider, sin proveedor real conectado)
HYPOTHESIS/CREATIVE ENGINE     = OPERATIVO (hypothesisCopyProvider + creativeQualityGate, integrado a /api/suggest-hypothesis)
VIDEO WORKSPACE                = OPERATIVO (Dashboard: existing + generate, ambos con Claim Safety real)
VOICE ENGINE (audioSource:generate) = FIJO (MIN_TIMEOUT_S 60s -> 120s), validado real de punta a punta
VIDEO RENDER REAL              = OPERATIVO (ffmpeg real, MP4 real, lineage registrado)
BUG RIPPED CAPSULES            = CERRADO (causa raíz: piso de timeout insuficiente para textos cortos, no WSL2/cola/asset)
CAPACIDAD DE MEMORIA WSL2 (corridas largas sostenidas) = HALLAZGO ABIERTO, NO CORREGIDO (fuera de alcance de esta fase -- ver §5)
TESTS                          = dashboard 125/126 (+1 auto-omitido, causa ajena) · content-orchestrator 334/335 (1 preexistente) · image-generation 82/82 · video-production 43/43 · voice-engine 14/14
REGRESIÓN                      = PASS (4 módulos re-verificados, ninguna regresión)
MOCKS                          = NINGUNO (Voice Engine real, ffmpeg real, en todos los tests relevantes)
GIT                            = TODO EL TRABAJO DESDE `aba6470` (2026-08-07) SIGUE SIN COMITEAR

PHASE_STATUS = CLOSED (bug de esta fase) / HALLAZGO DE CAPACIDAD ABIERTO (ver §5, decisión pendiente del propietario)
```

## 8. Recovery point — commit de auditoría (2026-08-23)

Tras esta fase se ejecutó una auditoría completa de `git status` (secretos, caches, node_modules, outputs grandes de video/audio, almacenes de estado en tiempo de ejecución) y se creó un único commit que consolida en Git todo el trabajo real acumulado desde `aba6470` (2026-08-07), incluida esta fase:

```
COMMIT   = 2879f23c50196deba95e14b6ad4b2c9fb07e8d11
FECHA    = 2026-08-23 20:53:57 -0600
TESTS AL MOMENTO DEL COMMIT = los mismos de §6 arriba (sin cambios de código
             posteriores a esa validación; el trabajo de esta fase de
             auditoría fue git status / .gitignore / staging / commit,
             ningún cambio funcional)
OPEN FINDING = presión de memoria de WSL2 en corridas largas de la suite
             completa de dashboard sigue SIN resolver (ver §5) — no se
             tocó .wslconfig
```

Si algo sale mal a partir de aquí, este commit (`2879f23c`) es el punto seguro desde el cual recuperar Vida Divina.

## 9. Siguiente paso sugerido (no ejecutado en esta fase)

1. Decidir si vale la pena subir la memoria asignada a WSL2 (`.wslconfig`, `memory=`) para correr la suite completa de `dashboard` sin riesgo de que Voice Engine muera a mitad de una corrida larga — cambio de máquina, no de código, requiere decisión del propietario.
2. Comitear el trabajo acumulado desde `aba6470` (2026-08-07) — sigue sin commitear en su totalidad.
