# Checkpoint — Campaign & Content Operations Dashboard (Fase 14)

**Fecha:** 2026-08-21. Continúa desde `docs/PROJECT_STATE_CHECKPOINT_2026-08-20_MEDIA_HOSTING_SCHEDULER.md` (`PHASE_STATUS = CLOSED`).

> **[VERIFICADO]** = re-ejecutado en esta sesión con evidencia real (tests reales + servidor real + `curl` real, nunca navegador).

## 1. Objetivo

Extender `dashboard/` (ya real desde las dos fases anteriores) hacia una consola operativa completa: Home/Command Center, Human Review Queue, Publication Detail, Campañas (creación real + overview), y filtros reales en la Biblioteca de Assets. Sin duplicar Content Generation, Content Planning, Publishing Scheduler, Performance/Intelligence/Strategy ya reales — cada pantalla nueva reutiliza sus endpoints existentes.

## 2. Inventario previo (encontrado, no reconstruido)

El dashboard ya cubría, antes de esta fase: Home básico, Crear/Crear autónomo/Carrusel/Editar/Adaptar, Assets, Productos, Campañas (lectura CreativeCell), Calendario (Media Hosting + Publishing Scheduler), Performance, Attribution, Marketing Intelligence, Learning/Strategy, Strategy Decisions, Content Plans + Auto Publish toggle. 11 rutas de API ya reales (`server/routes/*.js`). Esta fase parte de ese inventario real, no de cero.

## 3. Construido en esta fase

- **`dashboard/server/routes/systemStatus.js`** (`GET /api/system-status`) — agrega Content Generation/Voice Engine, Instagram/Facebook/Media Hosting configurados, Performance (con datos o no), Auto Publish (enabled + readiness + razones) en una sola respuesta. Ningún dato nuevo: reutiliza `voiceEngineClient`, `listPublishTargets()`, `performanceLearningStore`, `autoPublishConfig`/`autoPublishReadiness` ya reales.
- **Home / VIDA DIVINA COMMAND CENTER** (`public/index.html` + `app.js#loadCommandCenter`) — grid de estado real por subsistema; AUTO PUBLISH siempre refleja el valor real de `config.enabled` (nunca puede mostrarse ON si la política real está OFF, verificado por construcción: misma función que `/api/auto-publish`).
- **Review Queue** (`Revisión`, nueva pestaña de navegación) — filtra ContentPlans reales `READY_FOR_REVIEW` + `HUMAN_REVIEW`, cruza cada uno con su `ScheduledPublication` real (`GET /api/schedule/:id`) y reutiliza las mismas acciones reales de Calendario (`POST /api/schedule/:id/approve` / `/cancel`) — cero aprobación simulada en frontend.
- **Publication Detail** (modal, alcanzable desde Calendario y Revisión) — contenido real (preview), plataforma, Publication ID, External ID, fecha, estado, error, ContentPlan/StrategyDecision correlacionados, Performance correlacionado por `externalPublicationId ↔ external_post_id`. Permalink: no existe ese campo en el modelo real (`scheduledPublication.js`) — se muestra `NOT AVAILABLE` explícito, nunca inventado.
- **Marketing Campaigns** (`content-planning/src/campaign.js` + `campaignStore.js`, nuevos; `dashboard/server/routes/marketingCampaigns.js`, `POST`/`GET /api/marketing-campaigns`) — entidad nueva y deliberadamente aislada: nombre, objetivo, producto (validado contra el catálogo real), plataforma, fechas, frecuencia, número objetivo de contenidos, execution mode. Nunca genera ni agenda contenido por sí misma. **Campaign Overview** (`GET /api/marketing-campaigns/:id`) correlaciona ContentPlan/ScheduledPublication reales por `producto (nombreComercial real) + plataforma + rango de fechas` — heurística real y documentada en la propia respuesta (`correlationMethod`), no una foreign key — contadores nunca inventados (0 real si no hay coincidencias).
- **Asset Library — filtros reales** (`public/index.html` + `app.js`) — Estado (RAW/GENERATED/EDITED/FINAL), Formato (`lineage.outputProfileName` real), Fecha (`modifiedAt` real). Producto/Campaña por asset: documentado como pendiente (el modelo real de Final Output no lleva esa atribución todavía) — nunca se fabricó un filtro que aparentara funcionar sin dato real detrás.
- **Video Workspace (parcial)** — el panel de resultado de Crear ahora muestra Hook/Guion/CTA literales enviados y el Audio Asset real usado (`renderVideoWorkspaceInfo`). **No** se construyó una pantalla de timeline separada: HyperFrames es un renderer de servidor, no expone ningún componente de timeline embebible en navegador — construir uno nuevo habría sido un segundo editor, prohibido explícitamente por el encargo.

## 4. Desviaciones documentadas

1. **Campaign no existía como entidad real en el proyecto** (verificado por grep sobre `crm/` y `content-planning/` antes de crearla) — es código nuevo, no una reutilización. Se mantiene deliberadamente mínima (metadata + overview de solo lectura) para no duplicar `content-planning/src/contentPlanningService.js` (generación) ni `publishing-scheduler/` (agendado).
2. **Responsive Preview con marcos de Instagram/Facebook/Mobile (Parte 18)** y **timeline de video en navegador (Parte 6)** — no construidos en esta fase por alcance/tiempo. El preview real (video/imagen real) ya existe vía el modal de preview existente; falta el "marco" visual de plataforma.
3. **Dato de humo real dejado en disco**: `content-planning/data/campaigns/cf112db9-7629-4923-a563-96e89cd205bc.json` (creado durante la prueba real de extremo a extremo de esta fase, servidor real + `curl` real). No se borró — instrucción vigente del proyecto de no eliminar archivos sin permiso explícito, ni siquiera artefactos de prueba propios.

## 5. Tests — [VERIFICADO]

| Suite | Resultado |
|---|---|
| `dashboard` (incluye `systemStatus.test.js`, `marketingCampaigns.test.js` nuevos) | **90 pass / 0 fail** |
| `content-planning` (incluye `campaign.test.js`, `campaignStore.test.js` nuevos) | **56 pass / 0 fail** |
| `publishing-scheduler` (regresión, sin cambios) | **26 pass / 0 fail** |
| **TOTAL** | **172 pass / 0 fail** |

## 6. Pruebas reales de extremo a extremo — [VERIFICADO]

Servidor real (`PORT=4321-4323 DASHBOARD_NO_SCHEDULER=1 node server/index.js`) + `curl` real (sin navegador, instrucción vigente del proyecto):

1. `GET /api/system-status` → estructura real por subsistema, `autoPublish.enabled: false` (coincide con la política real).
2. `GET /api/content-plans?status=READY_FOR_REVIEW&executionMode=HUMAN_REVIEW` → 1 ContentPlan real; su `publicationId` ya no existe en el store real (dato de una sesión anterior) → `GET /api/schedule/:id` real devuelve 404 real, manejado sin romper la Review Queue (se muestra "sin AssetPackage vinculado", nunca un error de UI).
3. `POST /api/marketing-campaigns` real → campaña creada; `GET /api/marketing-campaigns/:id` real → overview correlacionó **2 ContentPlans reales** de TéDivina/INSTAGRAM_REEL dentro del rango de fechas, contadores consistentes (`planned = published + pending + failed`).
4. `GET /` sirve el HTML real con "Revisión", "COMMAND CENTER", "CREAR CAMPAÑA", "Mis campañas" presentes.

## 7. Limitaciones reales

1. No se probó visualmente en un navegador real (instrucción vigente del proyecto) — verificado por servidor real + `curl` real + 172/172 tests reales.
2. Video Workspace: sin timeline embebible en navegador (ver §3/§4.2).
3. Responsive Preview con marcos de plataforma: no construido.
4. Campaign Overview usa correlación heurística real (producto+plataforma+fechas), no una foreign key `campaignId` en `ContentPlan`/`ScheduledPublication` — documentado explícitamente en la propia respuesta de la API.

---

```
DASHBOARD                 = READY (extendido, no reemplazado)
CONTENT                   = READY (Crear/Autónomo/Carrusel/Editar/Adaptar ya reales, Video Workspace parcial)
VIDEO                     = PARTIAL (guion/CTA/audio real visibles; sin timeline embebible)
CAMPAIGNS                 = READY (creación + overview reales, nuevos)
CALENDAR                  = READY (ya real, sin cambios de fondo)
REVIEW                    = READY (nuevo)
AUTO PUBLISH              = READY (visible en Home + Content Plans; OFF por defecto, confirmado real)
PERFORMANCE               = READY (ya real, sin cambios de fondo)
TESTS                     = PASS 172/172
VALIDACIÓN VISUAL         = NO (navegador no usado, por instrucción vigente) -- verificado por servidor+curl real
PUBLICATION                = NOT EXECUTED
META                       = NOT TOUCHED
WHATSAPP                   = NOT TOUCHED

PHASE_STATUS = CLOSED (con desviaciones documentadas en §4)
```
