# Checkpoint — Content Request + Production Orchestrator + Postproduction

**Fecha del checkpoint:** 2026-08-17 (cierre formal de fase, con reverificación real de todo lo reportado — no es una copia del reporte anterior, cada afirmación de este documento fue reconfirmada en esta misma sesión de cierre).

> Convención de este checkpoint: cada afirmación está marcada como **[VERIFICADO]** (re-ejecutado o re-inspeccionado en esta sesión de cierre, con evidencia real: comando corrido, archivo leído, ffprobe ejecutado) o **[REPORTADO, NO RE-VERIFICADO EN ESTE CIERRE]** (viene del reporte de la fase, no se repitió el comando exacto en esta sesión de cierre porque ya había evidencia suficiente). No hay afirmaciones inventadas.

---

## 1. Estado del proyecto

- **Ruta del repositorio:** `C:\Users\manue\Vida Divina`.
- **Rama:** `main`. No se hizo ningún commit ni push durante esta fase ni durante este cierre.
- **Módulo nuevo de esta fase:** `content-orchestrator/` (untracked, sin commitear).
- **Único archivo preexistente modificado:** `video-production/src/hyperframesRenderer.js` (extensión aditiva y retrocompatible — ver sección 3).

## 2. Arquitectura actual — [VERIFICADO]

```
CONTENT REQUEST (content-orchestrator/src/contentRequest.js)
        │
   CAMPAIGN_MODE                    DIRECT_INSTRUCTION_MODE
        │                                     │
   campaignMode.js                  directInstructionAdapter.js
   (resuelve CreativeCell            (reutiliza video-production/
    real contra ciclos                src/directInstructionMode.js
    persistidos, NUNCA crea            tal cual)
    Persona/Pain/Angle/Format
    nuevos)
        └──────────────┬──────────────────────┘
                        ▼
        ProductionArtifact / ProductionBrief (REAL, sin duplicar)
                        ▼
        VisualProductionPackage (REAL, sin duplicar)
                        ▼
        contentOrchestrator.js — COORDINADOR
                        ▼
        AssetPackage (assetPackage.js, reutiliza assetRegistry.js)
                        ▼
        HyperFrames — 1 render maestro GENERIC_VERTICAL
        (video-production/hyperframesRenderer.js, sin duplicar)
                        ▼
        PostProduction (postProduction.js, backend local_ffmpeg)
        LOUDNESS_NORMALIZATION + RESIZE_TO_PROFILE
                        ▼
        Final Asset Package (1 MP4 real por Output Profile pedido)
```

Separación de responsabilidades **[VERIFICADO]** por inspección directa de imports (`grep` sobre `content-orchestrator/src/*.js`):
- **CREATIVE INTELLIGENCE = cerebro** — no existe ninguna segunda implementación de `runCycle`/`personaStage`/`painStage`/etc. fuera de `creative-intelligence/`.
- **CONTENT ORCHESTRATOR = coordinador** — `contentOrchestrator.js` no contiene lógica de negocio de marketing, solo llamadas a los módulos reales.
- **ASSET SYSTEM = recursos** — no existe una segunda lectura de dimensiones JPEG/hash de contenido fuera de `assetRegistry.js`; `assetPackage.js` lo importa y lo extiende para tipos que no cubría (audio/video/música/fuente).
- **HYPERFRAMES = renderer** — no existe ningún `gsap.timeline`/composición HTML paralela fuera de `hyperframesRenderer.js`.
- **POSTPRODUCTION = acabado** — `postProduction.js` es la única capa que invoca `ffmpeg` para transformación post-render.

## 3. Archivos creados — [VERIFICADO] (`find content-orchestrator -type f`)

```
content-orchestrator/package.json
content-orchestrator/src/assetPackage.js
content-orchestrator/src/brandVisualSystem.js
content-orchestrator/src/campaignMode.js
content-orchestrator/src/contentOrchestrator.js
content-orchestrator/src/contentRequest.js
content-orchestrator/src/directInstructionAdapter.js
content-orchestrator/src/outputProfiles.js
content-orchestrator/src/postProduction.js
content-orchestrator/src/productFactsLoader.js
content-orchestrator/test/assetPackage.test.js
content-orchestrator/test/brandVisualSystem.test.js
content-orchestrator/test/campaignMode.test.js
content-orchestrator/test/contentOrchestrator.test.js
content-orchestrator/test/contentRequest.test.js
content-orchestrator/test/directInstructionAdapter.test.js
content-orchestrator/test/outputProfiles.test.js
content-orchestrator/test/postProduction.test.js
content-orchestrator/test/real-e2e-te-divina-reel.mjs
```
Sin archivos temporales, sin `.bak`, sin implementaciones paralelas — confirmado por inspección directa en este cierre.

## 4. Archivos modificados — [VERIFICADO]

**`video-production/src/hyperframesRenderer.js`** — se añadió `DEFAULT_BRAND_COLORS` (export nuevo) y un parámetro opcional `brandColors` a `construirComposicionHtml()` y `renderVisualProductionPackage()`, con default = los mismos valores hardcodeados que el archivo ya tenía antes de esta fase. Ningún llamador preexistente cambia de comportamiento si no pasa `brandColors`. Verificado en este cierre: los 30 tests de `video-production` (ninguno pasa `brandColors`) siguen pasando sin cambios.

## 5. Tests — reconfirmados en esta sesión de cierre — [VERIFICADO]

Comandos re-ejecutados en esta sesión (no copiados del reporte anterior):

| Suite | Resultado |
|---|---|
| `content-orchestrator` (`node --test "test/**/*.test.js"`) | **74 pass / 0 fail** |
| `video-production` (`node --test "test/**/*.test.js"`) | **30 pass / 0 fail** |
| `creative-intelligence` (`node --test "test/**/*.test.js"`) | **389 pass / 0 fail** |
| `tts-text-preprocessor` (`node --test "test/**/*.test.js"`) | **49 pass / 0 fail** |
| **TOTAL** | **542 pass / 0 fail** |

Números idénticos a los reportados al cierre de la fase — reproducibles.

## 6. MP4 reales — reconfirmados con ffprobe en esta sesión de cierre — [VERIFICADO]

Ubicación: `video-production/real-e2e-content-orchestrator/`. No se regeneró ningún archivo — se inspeccionaron los ya existentes.

| Archivo | Video | Audio | Duración | Loudness (`input_i`) |
|---|---|---|---|---|
| `master-project.mp4` | h264, 1080×1920, 30fps | aac, 48kHz, 2ch | 28.133333s | **−27.25 LUFS** (sin corregir — es el render maestro, antes de PostProduction, tal como se esperaba) |
| `...-INSTAGRAM_REEL.mp4` | h264, 1080×1920, 30fps | aac, 96kHz, 2ch | 28.2s | **−13.82 LUFS** (corregido por `LOUDNESS_NORMALIZATION`, objetivo −14) |
| `...-WHATSAPP_VIDEO.mp4` | h264, 1080×1920, 30fps | aac, 96kHz, 2ch | 28.2s | **−13.82 LUFS** (corregido) |

Dato no reportado explícitamente antes, observado en este cierre: el sample rate de audio pasa de 48kHz (master) a 96kHz (outputs post-`loudnorm`+reencode) — comportamiento real y esperado de ffmpeg al reencodar audio con el filtro `loudnorm`, no es un defecto.

## 7. Output Profiles multiplataforma — [VERIFICADO]

13/13 perfiles confirmados como objetos estructurados reales (`typeof === 'object'`, 11-14 campos cada uno: `kind, platform, placement, aspectRatio, width, height, durationConstraints, safeZones, codec, videoBitrateBps, audio, captionTreatment, ctaTreatment, exportSettings`), no strings: `INSTAGRAM_REEL/STORY/FEED`, `FACEBOOK_REEL/STORY/FEED`, `YOUTUBE_SHORT/VIDEO`, `WHATSAPP_VIDEO`, `GENERIC_VERTICAL/SQUARE/LANDSCAPE`, `CAROUSEL` (este último `kind:'CAROUSEL'`, campos distintos — `slideConstraints` en vez de `videoBitrateBps`, sin generación real implementada, tal como estaba definido el alcance).

## 8. Brand Visual System — [VERIFICADO]

6 colores oficiales reales (`#0E1E11, #29361C, #E6DFD0, #441C11, #B58C33, #26231F`) como única fuente de verdad. `deriveBrandSceneColors()` alimenta el renderer real vía el parámetro `brandColors` nuevo (sección 4). `assertBrandAvoidCompliance()` activo en ambos modos (Campaign vía `contentOrchestrator.js`, Direct Instruction vía `directInstructionAdapter.js`).

## 9. PostProduction — [VERIFICADO]

Backend seleccionado: **`local_ffmpeg`** (cero dependencias nuevas). Dos operaciones reales, verificadas con ffprobe real: `LOUDNESS_NORMALIZATION`, `RESIZE_TO_PROFILE`. Cualquier operación no soportada se reporta `NOT_IMPLEMENTED_YET`, nunca se finge realizada.

## 10. Herramientas externas auditadas y descartadas — [REPORTADO, NO RE-VERIFICADO EN ESTE CIERRE]

Investigadas vía WebFetch durante la fase (no repetido en este cierre, por instrucción explícita de no investigar nuevos repositorios ni reabrir esa investigación):

| Herramienta | Motivo de descarte |
|---|---|
| KrillinAI | Traducción/doblaje de video — resuelve un problema que no tenemos (contenido ya en español) |
| OpenMontage | Envuelve Remotion/HyperFrames/ffmpeg — duplicaría `content-orchestrator.js` mismo |
| OpenCut | Editor GUI en reescritura mayor, modo headless aún no estable |
| MoneyPrinterTurbo | Duplica todo el pipeline; usa stock genérico y guion por LLM — contradice `BRAND_AVOID` y la regla de no inventar Product Facts |
| Remotion | Duplica HyperFrames; licencia comercial en ciertos casos |

Sin instalación de ninguna. `POSTPRODUCTION_BACKEND = local_ffmpeg`.

## 11. Limitaciones actuales (documentadas, no resueltas en esta fase ni en este cierre)

1. **`ProductionArtifact`/`VisualProductionPackage` no tienen persistencia propia** equivalente a `cycleStore.js` — cada ejecución real de Campaign Mode necesita el copy provisto de nuevo, no puede recuperar un paquete visual ya aprobado de una sesión anterior.
2. **El sistema no genera autónomamente hook/script/CTA** — Campaign Mode resuelve el CreativeCell real automáticamente (persona/pain/angle/format), pero el copy sigue siendo responsabilidad explícita de quien llama (documentado desde `directInstructionMode.js`, requeriría un LLM, fuera de alcance).
3. `resolveCampaignCreativeCell()` empareja por solapamiento de palabras clave, no comprensión semántica — puede elegir, entre varios CreativeCell reales igualmente válidos, uno distinto al que un humano elegiría (ocurrió en la prueba real de esta fase: eligió `a3da440f` en vez de `daa63e82`, ambos legítimos para la misma persona/pain).
4. CAROUSEL tiene arquitectura completa (`outputProfiles.js`, `assertValidCarouselSlide()`) pero ninguna generación real de slides.

## 12. Próxima fase propuesta — SOLO DOCUMENTADA, NO IMPLEMENTADA

En este orden:
- **A. ProductionArtifactStore** — persistencia de `ProductionArtifact` (mismo patrón `cycleStore.js`).
- **B. VisualProductionPackageStore** — persistencia de `VisualProductionPackage`.
- **C. Content Generation Engine** — después de A y B.
- Evaluar **Graft** (eficiencia de contexto de Claude) como fase independiente, solo después de lo anterior.

Ninguna de estas se inició en esta fase ni en este cierre.

---

## Seguridad / integridad — [VERIFICADO]

- `assertNoForbiddenProductClaims`, `assertNoPromiseLanguage`, `assertNoWinnerClaim` siguen presentes y sin modificar en sus archivos originales (`hyperframesRenderer.js`, `creativeProductionArtifact.js`, `cycleOutput.schema.js`).
- `content-orchestrator/` los reutiliza (importa, no reimplementa) y añade `assertBrandAvoidCompliance` sin relajar ninguno de los anteriores.
- `.env`, credenciales, `whatsapp-adapter/`, `crm/`, Meta, no fueron tocados en ningún momento de esta fase ni de este cierre.

## Estado final

```
PHASE = CONTENT_REQUEST_ORCHESTRATOR_POSTPRODUCTION
PHASE_STATUS = CLOSED
```
