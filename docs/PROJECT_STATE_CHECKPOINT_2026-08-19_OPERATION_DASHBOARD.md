# Checkpoint — Operation Dashboard

**Fecha:** 2026-08-19. Continúa desde `docs/PROJECT_STATE_CHECKPOINT_2026-08-17_CONTENT_GENERATION_ENGINE.md` (`PHASE_STATUS = CLOSED`).

> **[VERIFICADO]** = re-ejecutado en esta sesión con evidencia real. Todo lo de este documento es [VERIFICADO].

## 1. Objetivo

Primera interfaz operativa: dashboard local (`dashboard/`) que opera visualmente las capacidades ya reales del Content Generation Engine — sin duplicar Creative Intelligence, Content Orchestrator, HyperFrames, Voice Engine, PostProduction, Asset Registry ni los stores de persistencia.

## 2. Framework elegido — [VERIFICADO]

Se inspeccionó `package.json` raíz y todos los módulos existentes antes de decidir: ninguno usa un framework web (Express/Fastify/etc.) — `whatsapp-adapter/src/httpServer.js` usa `node:http` puro. Se siguió el mismo criterio zero-dependency de todo el proyecto: backend `node:http` (sin Express), frontend HTML/CSS/JS vanilla (sin React/Vite, sin build step). `dashboard/package.json` declara `"dependencies": {}`.

## 3. Arquitectura

```
public/ (HTML/CSS/JS vanilla)
   -> server/routes/*.js (capa de API real)
   -> server/lib/*.js (lectores/clientes reales: productCatalog, productionLibrary, voiceEngineClient, safePaths)
   -> content-orchestrator/src/contentGenerationEngine.js (real, sin tocar)
   -> creative-intelligence/, video-production/, tts-text-preprocessor/ (reales, sin tocar)
```

Frontera de seguridad real: `safePaths.js` — solo `assets/products/` y `video-production/` son alcanzables desde `/media/`; ninguna ruta arbitraria del cliente llega al filesystem sin pasar por `resolveSafeMediaPath()`.

## 4. Bug real corregido durante esta fase

`server/index.js`: `Number(process.env.PORT) || 4310` se comía un `PORT=0` real (puerto efímero) por ser `0` falsy en JS, causando que los tests intentaran reusar el puerto 4310 ya ocupado y el servidor colgara esperando un evento `'listening'` que nunca llegaba. Corregido a una comparación explícita contra `undefined`.

## 5. Comandos para ejecutar el dashboard

```bash
cd dashboard
PORT=4310 node server/index.js
```
Puerto local por defecto: **4310** (configurable vía `PORT`). Sin build step.

## 6. Archivos creados

19 archivos bajo `dashboard/` (ver reporte final para la lista completa) + 2 extensiones reales a módulos ya existentes: `content-orchestrator/src/assetLineage.js` (`listAllLineage()` nuevo) y `docs/PROJECT_STATE_CHECKPOINT_2026-08-19_OPERATION_DASHBOARD.md` (este archivo).

## 7. Tests — [VERIFICADO, reconfirmado en esta sesión]

| Suite | Resultado |
|---|---|
| `dashboard` | **23 pass / 0 fail** |
| `content-orchestrator` | **137 pass / 0 fail** (sin cambios) |
| `creative-intelligence` | **409 pass / 0 fail** (sin cambios) |
| `video-production` | **30 pass / 0 fail** (sin cambios) |
| `tts-text-preprocessor` | **49 pass / 0 fail** (sin cambios) |
| **TOTAL** | **648 pass / 0 fail** |

## 8. Pruebas reales de extremo a extremo — [VERIFICADO]

**CREATE** vía HTTP real del dashboard (`/api/create`): Campaign Mode real (resuelve CreativeCell `a3da440f-...`) → HyperFrames real → MP4 real (1080×1920, 28.13s) → servido vía `/media/` real (10.7MB, `video/mp4`) — **76.8s**, `status: COMPLETED`.

**EDIT** vía `/api/edit` sobre el master real: `LOUDNESS_NORMALIZATION+TEXT_OVERLAY` — original intacto (hash sha256 idéntico), `status: COMPLETED`, preview real accesible.

**ADAPT** vía `/api/adapt`: 2 Output Profiles reales (`FACEBOOK_REEL`, `WHATSAPP_VIDEO`) del mismo master — original intacto, `status: COMPLETED`.

## 9. Limitaciones reales

1. "Generar voz nueva" está implementado (llamada real a `POST /v1/speak`) pero el servicio Voice Engine no estaba corriendo en este entorno al momento de la prueba — se reporta un error real y accionable, nunca un audio simulado. No se intentó iniciar el servicio automáticamente (acción externa de infraestructura, fuera del alcance autorizado de esta fase).
2. La vista CAMPAÑAS está vacía en este momento — ningún flujo real de esta sesión construyó y persistió un `ProductionArtifact`/`VisualProductionPackage` completo (las pruebas reales de CREATE pasaron `productionArtifact: null`); el store real existe y la vista lo lee correctamente, simplemente no hay registros todavía.
3. `CAROUSEL` aparece marcado "(próximamente)" en el selector de ADAPT — arquitectura lista, generación real fuera de alcance (heredado de la fase anterior).
4. No se probó visualmente en un navegador real (por instrucción explícita del usuario) — verificado por lectura de código + tests reales de la API HTTP subyacente.

---

```
PHASE_STATUS = CLOSED
```
