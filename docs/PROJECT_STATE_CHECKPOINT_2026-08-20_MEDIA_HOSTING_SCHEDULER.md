# Checkpoint — Media Hosting + Publishing Scheduler

**Fecha:** 2026-08-20. Continúa desde `docs/PROJECT_STATE_CHECKPOINT_2026-08-19_OPERATION_DASHBOARD.md` (`PHASE_STATUS = CLOSED`) y desde trabajo adicional no documentado detectado al orientarse en esta fase: `video-production/src/carouselRenderer.js`, el flujo de publicación del dashboard (`handlePublish`/`handlePublishTargets`) y `content-orchestrator/src/publishing/{publishingService,metaAdapter,facebookAdapter}.js` (adapters reales de Instagram/Facebook), todos ya construidos y en uso antes de esta fase.

> **[VERIFICADO]** = re-ejecutado en esta sesión con evidencia real (tests reales corridos, servidor HTTP real levantado y golpeado con `curl`). Todo lo de este documento es [VERIFICADO].

## 1. Objetivo

Completar la cadena `FINAL ASSET → APROBACIÓN → MEDIA HOSTING → PROGRAMACIÓN → META → INSTAGRAM/FACEBOOK → RESULTADO`, sin reconstruir Content Generation, Carousel, PublishingService ni Dashboard ya existentes.

## 2. Arquitectura implementada

```
media-hosting/                      (nuevo, aislado)
  src/mediaHostingService.js        — punto de entrada único. Gate: solo FINAL+approved, solo JPEG/PNG/MP4,
                                       nunca mueve el original, CONFIGURATION_REQUIRED sin credenciales.
  src/r2Provider.js + r2SigV4.js     — cliente real Cloudflare R2 (S3-compatible) vía node:https + SigV4
                                       firmado a mano con node:crypto (cero dependencias nuevas).
  src/r2Config.js                    — SOLO variables de entorno (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/
                                       R2_SECRET_ACCESS_KEY/R2_BUCKET/R2_PUBLIC_BASE_URL).
  src/mockMediaHostingProvider.js    — provider dev/test explícito (dominio .invalid reservado, nunca real).

publishing-scheduler/               (nuevo, aislado)
  src/scheduledPublication.js       — modelo + estados (DRAFT/APPROVED/SCHEDULED/PUBLISHING/PUBLISHED/
                                       FAILED/CANCELLED/CONFIGURATION_REQUIRED) + MAX_RETRY_COUNT=3.
  src/timezone.js                   — fecha+hora+timezone IANA -> instante UTC real (técnica de punto fijo
                                       con Intl nativo, sin date-fns/luxon).
  src/scheduledPublicationStore.js  — persistencia real: 1 archivo JSON por id (mismo patrón que
                                       creative-intelligence/production/productionArtifactStore.js), upsert
                                       (nunca PostgreSQL nuevo, nunca otra base de datos).
  src/publishingScheduler.js        — ejecutor real: approve()/schedule()/cancel()/findDuePublications()/
                                       runDuePublications(). Conecta MediaHostingService + publishingService#publish
                                       REALES de content-orchestrator, sin reimplementar ninguno de los dos.
  src/schedulingRecommendationProvider.js — interfaz preparada (§14), NO implementada.

dashboard/
  server/lib/schedulerInstance.js   — única instancia real (MediaHostingService provider "r2" + PublishingScheduler).
  server/routes/scheduling.js       — endpoints CALENDARIO (create/approve/program/cancel/list/get/run-now/status).
  server/routes/generation.js       — handlePublish ahora aloja automáticamente vía MediaHostingService si no
                                       se manda mediaUrl a mano (retrocompatible, sin duplicar lógica).
  server/index.js                   — rutas nuevas + tick automático real (setInterval, backend puro, nunca
                                       depende de sesión interactiva; DASHBOARD_NO_SCHEDULER=1 lo desactiva en tests).
  public/index.html + app.js        — sección CALENDARIO: crear/listar/aprobar/programar/cancelar, botón
                                       "PROGRAMAR →" junto al "PUBLICAR →" ya existente.
```

Flujo real de usuario implementado (§8 del encargo): CREAR → EDITAR → **PROGRAMAR** (nuevo) → **CALENDARIO** (nuevo) → **SCHEDULER** (nuevo, tick automático o "verificar ahora") → **MEDIA HOSTING** (nuevo) → PublishingService real ya existente → META → PUBLICADO. "PUBLICAR AHORA" (flujo inmediato ya existente) se conserva intacto y ahora también aloja el medio automáticamente.

## 3. Decisiones de diseño (desviaciones documentadas del encargo literal)

1. **`assetPackageId` sin store propio de assets.** El Final Asset Package real (`content-orchestrator/src/contentGenerationEngine.js`) no tiene un id persistente propio — no existe un "assetPackageStore" en el proyecto; el dashboard lo entrega completo al navegador en cada CREATE/EDIT/ADAPT/CAROUSEL y ya lo reenvía tal cual al publicar (mismo patrón que `dashboard/public/app.js#openPublishModal`). `ScheduledPublication.assetPackageId` es un identificador derivado (`requestId` real) solo para trazabilidad; la clave real de persistencia es `assetPackageSnapshot` (el Final Asset Package completo, guardado tal cual). Esto es necesario porque el scheduler corre en un tick posterior, potencialmente después de un reinicio del servidor.
2. **APPROVAL_GATE vive en la propia máquina de estados de `ScheduledPublication`**, no en un subsistema aparte de aprobación de assets: "aprobado" = pasó por `PublishingScheduler.approve()` (exige `approvedBy` real + Final Asset Package `status === 'COMPLETED'`), re-verificado de forma independiente en el momento real de publicar (nunca confía en que `schedule()` ya lo garantiza — mismo criterio de defensa en profundidad que `instagramPublicationAdapter.js`/`publishingService.js` de `content-strategy/`).
3. **"FINAL"** se interpreta como `assetPackage.status === 'COMPLETED'` (más estricto que el `publish()` inmediato existente, que también acepta `PARTIAL`) — un contenido parcial nunca se programa ni se publica vía CALENDARIO.
4. **PUBLICAR AHORA** trata el click humano sobre contenido recién producido como la aprobación inmediata (distinta del ciclo diferido DRAFT→APPROVED→SCHEDULED, que existe justamente para posponer esa decisión).

## 4. Archivos creados

- `media-hosting/` — 6 archivos de código (`package.json`, `src/{mediaHostingContract,r2Config,r2SigV4,r2Provider,mockMediaHostingProvider,mediaHostingService}.js`) + `.env.example` + 2 archivos de test.
- `publishing-scheduler/` — 6 archivos de código (`package.json`, `src/{scheduledPublication,timezone,scheduledPublicationStore,publishingScheduler,schedulingRecommendationProvider}.js`) + 4 archivos de test.
- `dashboard/server/lib/schedulerInstance.js`, `dashboard/server/routes/scheduling.js`, `dashboard/test/scheduling.test.js` (nuevos).
- Modificados: `dashboard/server/routes/generation.js` (auto-hosting en `handlePublish`), `dashboard/server/index.js` (rutas + tick), `dashboard/public/index.html` + `dashboard/public/app.js` (sección CALENDARIO).
- `docs/PROJECT_STATE_CHECKPOINT_2026-08-20_MEDIA_HOSTING_SCHEDULER.md` (este archivo).

## 5. Tests — [VERIFICADO]

| Suite | Resultado |
|---|---|
| `media-hosting` (nuevo) | **14 pass / 0 fail** |
| `publishing-scheduler` (nuevo) | **26 pass / 0 fail** |
| `dashboard` (incluye `scheduling.test.js` nuevo) | **45 pass / 0 fail** |
| `content-orchestrator` (regresión) | **180 pass / 0 fail** |
| `creative-intelligence` (regresión) | **409 pass / 0 fail** |
| `video-production` (regresión) | **37 pass / 0 fail** |
| `tts-text-preprocessor` (regresión) | **49 pass / 0 fail** |
| `content-strategy` (regresión) | **154 pass / 0 fail** |
| **TOTAL** | **914 pass / 0 fail** |

Cobertura por área pedida en §15: MediaHostingService (upload FINAL-aprobado, rechazo RAW, rechazo no-aprobado, rechazo extensión no soportada, preservación del original, delete real, `exists`, `CONFIGURATION_REQUIRED` sin credenciales) · Scheduler (`schedule`/`retrieve`/`cancel`/publicación vencida/timezone real (México vs Madrid, offsets distintos)/retry con límite/`FAILED` terminal/idempotencia dura sobre `PUBLISHED`/`CONFIGURATION_REQUIRED`) · Dashboard (crear/listar/aprobar/programar/cancelar vía HTTP real, "publicar ahora" retrocompatible) · Integración real FINAL→scheduler→media host→`publishingService` real de `content-orchestrator` (sin mocks del lado de publicación, solo media hosting mockeado).

## 6. Pruebas reales de extremo a extremo — [VERIFICADO]

Servidor real (`PORT=4399 DASHBOARD_NO_SCHEDULER=1 node server/index.js`) + `curl` real (sin navegador, por instrucción vigente del proyecto):

1. `GET /api/media-hosting/status` → `{"configured": false}` (correcto: sin credenciales R2 en este entorno).
2. `POST /api/schedule` con un Final Asset Package sintético `COMPLETED` → `DRAFT` real.
3. `POST /api/schedule/:id/approve` → `APPROVED`, `approvedAt`/`approvedBy` reales.
4. `POST /api/schedule/:id/program` (fecha pasada, timezone `UTC`) → `SCHEDULED`, `scheduledAt` UTC real.
5. `POST /api/schedule/run-now` → procesó 1 publicación vencida real → `CONFIGURATION_REQUIRED` con el motivo real (`MediaHostingService: faltan credenciales...`), **nunca intentó publicar**.
6. `GET /` y `GET /app.js` confirman que la sección CALENDARIO real está servida (`data-view="calendar"`, controlador `calendar-run-now` presente).

Registro de prueba borrado del store real al finalizar (no queda dato de humo persistido).

## 7. Credenciales/configuración que faltan

- **Cloudflare R2**: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` (ver `media-hosting/.env.example`). Sin ellas, `MEDIA_HOSTING = CONFIGURATION_REQUIRED` en toda operación real.
- **Meta (Instagram)**: `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_IG_USER_ID` (ya documentadas desde la fase de `content-strategy`/`content-orchestrator` — sin cambios en esta fase).
- **Meta (Facebook)**: `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN` (ídem, ya existentes).

Ninguna de estas 9 variables está configurada en este repositorio ni en este entorno — es el estado esperado hasta que el propietario las provea fuera de código.

## 8. Cómo programar una publicación desde el Dashboard

1. Producir contenido real (Crear / Carrusel / Adaptar) hasta `COMPLETED`.
2. Click **"PROGRAMAR →"** junto al resultado → elegir plataforma (INSTAGRAM/FACEBOOK) + escribir el caption real → **"GUARDAR COMO BORRADOR"**.
3. Ir a **Calendario** → sobre el registro en `BORRADOR`, click **"APROBAR"** (pide el nombre real de quien aprueba).
4. Sobre el registro ya `APROBADO`, completar fecha + hora + timezone IANA (ej. `America/Mexico_City`) → **"PROGRAMAR"**.
5. El scheduler real lo recoge automáticamente cuando vence (tick cada `SCHEDULER_INTERVAL_MS`, 60s por defecto) o al pulsar **"VERIFICAR PUBLICACIONES VENCIDAS AHORA"**.
6. Con R2 y Meta configurados, el resultado real termina en `PUBLICADO` con `externalPublicationId`; sin ellos, en `CONFIGURACIÓN REQUERIDA` explícito.

## 9. Cómo publicar inmediatamente (sin programar)

Igual que antes ("PUBLICAR →" sobre un resultado recién producido), ahora con alojamiento automático: si no se escribe una URL manual, el dashboard aloja el asset vía `MediaHostingService` antes de llamar al `PublishingService` real — mismo resultado final, sin pegar URLs a mano.

## 10. Limitaciones reales

1. Sin credenciales R2/Meta en este entorno, toda la cadena real termina en `CONFIGURATION_REQUIRED` explícito — no se ejecutó ninguna publicación real a Instagram/Facebook (§16 del encargo: sin credenciales, se prueba hasta `CONFIGURATION_REQUIRED`, nunca se intenta publicar).
2. Facebook `CAROUSEL` sigue `DEFERRED` (heredado de `facebookAdapter.js`, sin cambios en esta fase) — el scheduler lo hereda: programar un carrusel a Facebook resultará en el `FAILED` ya explícito de ese adapter.
3. `SchedulingRecommendationProvider` es solo la interfaz (§14) — cero predicción de horarios, cero IA externa involucrada.
4. No se probó visualmente en un navegador real (misma instrucción vigente que en el checkpoint anterior) — verificado por servidor real + `curl` real + 45/45 tests HTTP reales del dashboard.
5. El tick automático (`setInterval`) vive en memoria del proceso del servidor del dashboard — si el proceso se reinicia entre ticks, el scheduler simplemente retoma en el siguiente tick (los registros `SCHEDULED` vencidos persisten en disco, nada se pierde).

---

```
MEDIA_HOSTING            = PASS (implementado y testeado)
R2_ADAPTER                = CONFIGURATION_REQUIRED (sin credenciales reales en este entorno)
SCHEDULER                 = PASS
SCHEDULED_PUBLICATIONS    = PASS
TIMEZONE                  = PASS
IDEMPOTENCY               = PASS
APPROVAL_GATE             = PASS
INSTAGRAM_SCHEDULING      = CONFIGURATION_REQUIRED (adapter real reutilizado, sin credenciales Meta)
FACEBOOK_SCHEDULING       = CONFIGURATION_REQUIRED (adapter real reutilizado, sin credenciales Meta)
DASHBOARD_CALENDAR        = PASS
RAW_PROTECTION            = PASS
REGRESSION                = PASS (914/914 tests reales)

PHASE_STATUS = CLOSED
```
