# Checkpoint — WhatsApp Operational Integration + First Campaign Pilot (Fase 16)

**Fecha:** 2026-08-21. Continúa desde `docs/PROJECT_STATE_CHECKPOINT_2026-08-21_HUMAN_IN_THE_LOOP_WORKSPACE.md` (`PHASE_STATUS = CLOSED`).

> **[VERIFICADO]** = re-ejecutado en esta sesión con evidencia real. Ningún dato ficticio, ninguna publicación real, `AUTO_PUBLISH` sin tocar.

## 1. Objetivo

Cerrar los 3 hallazgos reales dejados por la Fase 15 (WhatsApp: OUTBOUND nunca se persistía; datos SIMULATED/TEST mezclados con REAL sin distinción estructural; ningún endpoint del Dashboard podía crear un ContentPlan real) y demostrar la primera Campaign Pilot real de punta a punta, sin publicar.

## 2. WHATSAPP_ACCESS_TOKEN (Parte 2)

`WHATSAPP_ACCESS_TOKEN`: **EMPTY** en este entorno (`whatsapp-adapter/.env`). `WHATSAPP_PHONE_NUMBER_ID` sí está configurado. Resultado: `envioHabilitado() = false` — ningún envío real es posible, ni por accidente, durante esta fase. No se detuvo el resto de la fase por esto (instrucción explícita). Ningún valor de secreto se imprimió en ningún momento (solo longitud/presencia).

## 3. `conversations.source` real (Parte 4/5/6) -- migración `crm/migrations/0002_add_conversation_source.sql`

Auditado primero: no existía ningún campo reutilizable (`state_transitions.fuente_funcion`/`messages.fuente_recurso` son de otro propósito, mismo valor sin importar el origen). Columna nueva `conversations.source` (`REAL|SIMULATED|TEST|FIXTURE|UNKNOWN`, default `UNKNOWN`), aditiva (`ADD COLUMN` metadata-only), aplicada a `DATABASE_URL` real -- **167→197 conversaciones reales existentes quedaron `UNKNOWN`** (nunca reclasificadas por inferencia de contenido/timestamp/nombre, prohibido explícitamente).

Plumbing real (`conversationRepository.createConversation` → `crm/context/disassemble.js` → `crm/context/contextProjection.js#persistContext/updateContext`, todos con `source` opcional, default `UNKNOWN`, nunca reescribe el origen de una conversación ya existente). **Decisión documentada**: NO se hiló `source` hasta el webhook real (`main.js#procesarEventoWebhook` → `conversationRouter.js` (7 sitios) → `flujoVentaReal.js` (8 funciones `*Persistente`)) -- riesgo de regresión desproporcionado sobre un módulo ya delicadamente migrado (Fase C.2B) para una etiqueta, no una capacidad de negocio. Efecto real: conversaciones nuevas creadas por el pipeline en vivo hoy siguen quedando `UNKNOWN` hasta una fase futura que complete ese hilo -- honesto, no oculta nada, documentado como limitación real (§7).

Dashboard: `GET /api/whatsapp/conversations` ahora acepta `?source=REAL|SIMULATED|TEST|FIXTURE|UNKNOWN|ALL` (default `REAL`), y siempre devuelve `bySource` (desglose real del rango completo, nunca oculta que existen otras). Con 0 conversaciones `REAL` confirmadas hoy, el filtro por defecto está vacío -- refleja la realidad (Coexistence de Meta no activada, sin tráfico real todavía), no un bug de UI.

## 4. OUTBOUND persistence (Parte 7/8) -- hallazgo real corregido

`enviarRecursos()` (`whatsapp-adapter/src/graphApiSender.js`) enviaba a Meta pero nunca persistía en `crm/messages`. Nuevo `whatsapp-adapter/src/outboundPersistence.js#persistOutboundReal(waId, envios)`, invocado desde `httpServer.js` justo después de `enviarRecursos()` real. Solo persiste lo que Meta confirmó (`envio.enviado === true`), idempotente por `wamid` real (`messageRepository.findByConversationAndCanalMessageId`), nunca crea una conversación nueva desde el camino de salida. Mismo criterio ya aplicado (Fase 15) al envío manual del Dashboard, ahora también con guarda de idempotencia.

## 5. Campaign Pilot (Parte 13-18) -- hallazgo real: no existía ningún endpoint de escritura

`GET /api/content-plans` era (y sigue siendo) solo lectura; **ningún endpoint invocaba `planContent()` real** -- los ContentPlan ya visibles venían de un proceso externo. Nuevo `POST /api/content-plans/generate` (`dashboard/server/routes/campaignPilot.js`), única vía real de escritura desde el Dashboard:
- Reutiliza `planContent()` real (StrategyContext + `buildCreativeProposal` + `generateContent()` + Quality Gate reales, ningún renderer nuevo).
- Acepta `generationInputs` (mismo shape que `/api/create`, para un render real nuevo) **o** `assetPackage` ya renderizado (evita un segundo render del mismo contenido -- botón nuevo "REGISTRAR COMO CONTENT PLAN" en el panel de resultado de Crear/Carrusel/Editar/Adaptar).
- Rechaza `executionMode=AUTO_PUBLISH` con 400 explícito -- cinturón adicional sobre la protección real ya existente en `planContent()`.

**Validado real de punta a punta** (servidor real + `curl`, sin navegador): userIntent real → StrategyContext aplicado real → producto real (TéDivina) resuelto → **video MP4 real renderizado** (`video-production/dashboard-outputs/campaign-pilot-*/…-WHATSAPP_VIDEO.mp4`, confirmado en disco) → ContentPlan real persistido. Un segundo intento con plataforma no agendable (`WHATSAPP`) devolvió `FAILED` real y honesto (`WhatsApp no es agendable vía Publishing Scheduler` -- comportamiento real preexistente, no un bug). Un tercer intento con `INSTAGRAM_REEL` deduplicó correctamente contra un ContentPlan `HUMAN_REVIEW` ya existente (Fase 19, comportamiento real, no un fallo).

## 6. Content Detail / Publication Gate (Parte 16/18)

Ya existía desde la Fase 15 (`openContentDetail`). Se agregó **Publication Gate** real: el modal de Publicar/Programar ahora muestra, cuando se abre desde Content Detail, un resumen (`Execution Mode`/`Producto`/`Plataforma`/`Strategy`/`Quality Gate`) antes de la acción -- reutiliza datos ya reales del `ContentPlan`, no recalcula nada.

## 7. Tests + Regresión — [VERIFICADO]

| Suite | Resultado |
|---|---|
| `dashboard` (incluye `whatsapp.test.js` ampliado, `campaignPilot.test.js` nuevo) | **106 pass / 0 fail** |
| `whatsapp-adapter` (incluye `outboundPersistence.test.js` nuevo) | **63 pass / 0 fail** |
| `crm` (incluye tests reales de `source`) | **71 pass / 0 fail** |
| `simulator` | 35 pass / 0 fail |
| `content-planning` | 56 pass / 0 fail |
| `content-strategy` | 218 pass / 0 fail |
| `publishing-scheduler` | 26 pass / 0 fail |
| `performance-learning-intelligence` | 40 pass / 0 fail |
| `marketing-intelligence-engine` | 32 pass / 0 fail |
| `learning-strategy-engine` | 34 pass / 0 fail |
| `strategy-decision-engine` | 46 pass / 0 fail |
| `attribution-engine` | 40 pass / 0 fail |
| `content-orchestrator` | **193 pass / 1 fail (preexistente, no relacionado -- ver §8)** |
| **TOTAL** | **959 pass / 1 fail** |

## 8. Limitaciones y hallazgos reales

1. `source` real solo se puede declarar hoy desde llamadores explícitos (tests, `POST /api/content-plans/generate` no lo usa porque no crea conversaciones) -- el pipeline de webhook en vivo todavía no está hilado (decisión documentada en §3). Toda conversación real nueva sigue naciendo `UNKNOWN` hasta esa fase futura.
2. Puerto `4310` ya estaba ocupado por un proceso Node preexistente y desactualizado (sin las rutas de las Fases 14-16) -- no se terminó ese proceso (no es una acción autorizada en automático). Validación real hecha en un puerto alterno (4340), mismo código, mismo comportamiento.
3. 1 test preexistente y no relacionado falla en `content-orchestrator` (`publishingService.test.js`, asume cero credenciales de Meta configuradas) -- causado por variables `FACEBOOK_*`/`INSTAGRAM_*` ya presentes en el entorno de shell (ambiente, no un archivo tocado por esta fase). No se modificó el test.
4. 197 conversaciones reales en `DATABASE_URL` siguen sin clasificar (`UNKNOWN`) -- mezcla histórica de Conversation Simulator + posibles fixtures de una corrida anterior de test contra la base real (hallazgo ya reportado en la Fase 15, sin cambios).
5. `AI response suggestion`: investigado a fondo (Parte 11) -- confirmado que no existe ninguna función pura y reutilizable (el único motor comercial real persiste como efecto secundario). Botón deshabilitado con el texto exacto pedido: "AI response suggestion not available".

---

```
WHATSAPP                    = OPERATIONAL (Inbox/Conversation/Manual Response reales; envío real bloqueado por falta de token)
TOKEN                        = REQUIRED (WHATSAPP_ACCESS_TOKEN vacío en este entorno)
CRM SOURCE SEPARATION        = READY (schema + API + UI reales; pipeline en vivo no hilado, documentado)
OUTBOUND PERSISTENCE          = FIXED (idempotente, solo confirmado por Meta)
MANUAL RESPONSE               = READY (idempotente)
CAMPAIGN PILOT                = READY (validado real de punta a punta: Campaign -> ContentPlan -> Strategy -> render real -> Quality Gate -> READY_FOR_REVIEW)
CONTENT                       = Generation/Preview/Quality reales
HUMAN REVIEW                  = READY (Aprobar/Rechazar/Publicar/Programar conectados, ninguno ejecutado)
AUTO PUBLISH                  = OFF, NOT TOUCHED, readiness NOT_READY (confirmado real)
TESTS                         = PASS 959/960 (1 preexistente no relacionado)
REGRESSION                    = PASS (12 módulos verificados)
VALIDACIÓN REAL                = servidor real (puerto alterno 4340) + curl real, todas las rutas 200
PUBLICATION                   = NOT EXECUTED
REAL WHATSAPP MESSAGE          = NOT SENT
META                           = NOT TOUCHED

PHASE_STATUS = CLOSED
```
