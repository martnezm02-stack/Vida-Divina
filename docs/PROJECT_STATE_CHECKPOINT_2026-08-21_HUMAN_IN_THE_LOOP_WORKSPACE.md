# Checkpoint — Dashboard Operational Workspace: Campaign Preview + Human Publication Control + WhatsApp Console (Fase 15)

**Fecha:** 2026-08-21. Continúa desde `docs/PROJECT_STATE_CHECKPOINT_2026-08-21_DASHBOARD_OPERATIONS.md` (`PHASE_STATUS = CLOSED`).

> **[VERIFICADO]** = re-ejecutado en esta sesión con evidencia real (tests reales + servidor real + `curl` real, nunca navegador, nunca envío real a Meta).

## 1. Objetivo

Completar la experiencia human-in-the-loop del dashboard (Campaign → Content → Preview → Revisión → Decisión humana → Publicación) y agregar una consola de WhatsApp de solo control manual, sin ejecutar ninguna publicación real ni activar AUTO_PUBLISH.

## 2. Construido en esta fase

- **Content Detail** (`app.js#openContentDetail`, nuevo modal) — une, sin recalcular nada, ContentPlan real + ScheduledPublication real (si existe) + StrategyDecision/Learning reales (por id) + Performance real correlacionado, en 5 secciones: CREATIVE, STRATEGY, QUALITY, PUBLICATION, PERFORMANCE. Hook/Guion se muestran como `NOT AVAILABLE` de forma explícita y documentada -- `ContentPlan.generationRequest` real solo persiste `{userIntent, productId, status}`, nunca el texto literal (verificado en `content-planning/src/contentPlanningService.js`). Accesible desde Content Plans, Review Queue y Campaign Overview (mismo botón "VER CONTENIDO" reutilizado en los tres).
- **Campaign → Content Plans** (`dashboard/server/routes/marketingCampaigns.js`) — el Campaign Overview (Fase 14) ahora devuelve los ContentPlan completos correlacionados (antes solo ids), cada uno con botón real hacia Content Detail.
- **Decisión Humana** (Parte 5) — Content Detail expone APROBAR/RECHAZAR/PUBLICAR/PROGRAMAR/EDITAR/REGENERAR, todos delegando a los endpoints reales ya existentes (`/api/schedule/:id/approve|cancel`, `openPublishModal`/`openScheduleModal` ya reales). APROBAR nunca implica PUBLICAR: son acciones y estados distintos en la UI (`DRAFT`→`APPROVED`→`SCHEDULED`→`PUBLISHED`, todos reales).
- **WhatsApp Console** (`dashboard/server/routes/whatsapp.js`, nuevo; UI en `index.html`/`app.js`) — Inbox real + Conversation View real + Respuesta Manual real, sobre `crm/` (PostgreSQL real) y `whatsapp-adapter/src/graphApiSender.js` (Meta real) — **cero SQL propio, cero cliente de WhatsApp nuevo**.
  - `GET /api/whatsapp/conversations?days=N` — `crm.conversations.listStartedBetween()` real + `crm.customers.findCustomerById()` + último mensaje real por conversación.
  - `GET /api/whatsapp/conversations/:id` — historial real completo (`crm.messages.listByConversationId`), contacto real, Opportunity real vía `crm.opportunities.findLatestByConversationId()` (producto resuelto contra el catálogo real cuando existe, `NOT AVAILABLE` si no hay Opportunity).
  - `POST /api/whatsapp/conversations/:id/send` — respeta `envioHabilitado()` real; si faltan credenciales, `CONFIGURATION_REQUIRED` explícito y **nunca intenta el envío ni guarda un mensaje falso** (verificado por test). Si están configuradas, llama a `enviarTexto()` real (recién exportada, ver §3) y persiste el resultado real en `crm.messages`.
  - `direccion` INBOUND/OUTBOUND es el único origen estructural real (`entrante`/`saliente`); no existe campo AI/HUMAN en el schema real -- nunca se inventó uno (Parte 10, verificado por test explícito).
  - "SUGERIR RESPUESTA": botón deshabilitado con motivo explícito -- no existe ningún servicio real de sugerencia de respuesta reutilizable (auditado: el único motor comercial real, `simulator/src/flujoVentaReal.js`, está diseñado para auto-enviar, no para proponer un borrador editable) -- por instrucción explícita del encargo, no se construyó un agente nuevo.

## 3. Cambio mínimo en `whatsapp-adapter/` (único tocado, aditivo)

`whatsapp-adapter/src/graphApiSender.js`: `enviarTexto()` pasó de privada a exportada -- **cero cambios de comportamiento**, mismo código exacto. Es el único cambio a este módulo, consistente con "solo exponer capacidades ya existentes" (Parte 14). Webhook, autenticación, Phone Number ID, WABA, tokens, CRM: sin tocar.

## 4. Auditoría real previa (antes de construir nada)

- `crm/` es PostgreSQL-only (sin fallback JSON); `DATABASE_URL` real está configurada y Postgres está vivo en este entorno (`vida_divina_crm`).
- **Hallazgo de higiene de datos**: la base real ya contiene 153 conversaciones/customers y 259 mensajes, generados por `simulator/src/flujoVentaReal.js` (motor comercial determinista real, no un LLM) durante fases previas -- incluye además algunas filas con nombres de fixture de pruebas (ej. `test-adapter-rev-h-promise-...`), aparentemente de una corrida anterior de `whatsapp-adapter/test/e2ePostgres.test.js` contra `DATABASE_URL` en vez de `TEST_DATABASE_URL`. No se generó ni se modificó ningún dato durante esta fase (excepto los tests propios de esta fase, que corren contra `TEST_DATABASE_URL`, una base física distinta). Se reporta como hallazgo, no se limpió (instrucción vigente: no eliminar archivos ni datos).
- `WHATSAPP_ACCESS_TOKEN` está **vacío** en este entorno -> `envioHabilitado() = false` -> ningún envío real es posible ahora mismo, ni por accidente durante la validación.
- Todos los 259 mensajes reales existentes son `entrante` (0 `saliente`) -- el pipeline real de envío automático (`enviarRecursos`) todavía no persiste sus propios envíos en `crm/` (hallazgo, no corregido en esta fase -- fuera de alcance).

## 5. Tests — [VERIFICADO]

| Suite | Resultado |
|---|---|
| `dashboard` (incluye `whatsapp.test.js` nuevo, contra `TEST_DATABASE_URL` real) | **97 pass / 0 fail** |
| `whatsapp-adapter` (regresión tras exportar `enviarTexto`) | **58 pass / 0 fail** |
| **TOTAL** | **155 pass / 0 fail** |

`dashboard/package.json` (`start`/`test`) ahora carga `--env-file-if-exists=../crm/.env` y `--env-file-if-exists=../whatsapp-adapter/.env` (Node 24 nativo, sin dependencias nuevas) -- necesario para que las rutas de WhatsApp tengan `DATABASE_URL`/`WHATSAPP_*` disponibles.

## 6. Pruebas reales de extremo a extremo — [VERIFICADO]

Servidor real (`PORT=433x DASHBOARD_NO_SCHEDULER=1 node --env-file-if-exists=../crm/.env --env-file-if-exists=../whatsapp-adapter/.env server/index.js`) + `curl` real:

1. `GET /api/whatsapp/status` → `{"sendEnabled": false}` (correcto, sin token real).
2. `GET /api/whatsapp/conversations?days=7` → 153 conversaciones reales de PostgreSQL, con contacto/estado/último mensaje reales.
3. `GET /api/whatsapp/conversations/:id` real → historial completo real, `opportunity: null` cuando no hay una real (nunca inventada).
4. `POST /api/whatsapp/conversations/:id/send` real → `CONFIGURATION_REQUIRED` explícito, **sin intentar ningún envío a Meta**.
5. `GET /api/auto-publish` → `enabled: false`, `readiness: NOT_READY` -- sin cambios, no tocado en esta fase.
6. `GET /` sirve "Content Detail", "WhatsApp", "WhatsApp Inbox" reales.

## 7. Limitaciones reales

1. No se probó visualmente en un navegador real (instrucción vigente) — verificado por servidor real + `curl` real + 155/155 tests reales.
2. Hook/Guion literal de un ContentPlan ya generado no son recuperables después del hecho (arquitectura documentada, ver §2) — Content Detail lo muestra como `NOT AVAILABLE` en vez de fabricarlo.
3. "SUGERIR RESPUESTA" (Parte 12) queda como capacidad futura documentada, no implementada -- ningún servicio real y seguro de sugerencia existe todavía.
4. `crm.conversations.listStartedBetween` es la única función de listado real disponible (no hay paginación) -- con 153 conversaciones reales ya es notorio; una fase futura de CRM debería agregar paginación real antes de que esto crezca más.
5. Higiene de datos de prueba mezclada con datos reales del simulador en `DATABASE_URL` (ver §4) — reportado, no corregido (fuera de alcance de esta fase, requiere decisión del propietario).

---

```
DASHBOARD                  = READY (extendido)
CAMPAIGNS                  = READY (Campaign -> Content Plans -> Content Detail conectado)
CONTENT PREVIEW            = READY (preview real cuando existe AssetPackage vinculado)
VIDEO                      = READY (visualización real; sin timeline embebible, heredado de Fase 14)
HUMAN REVIEW                = READY (Aprobar/Rechazar/Publicar/Programar reales, nunca fake)
WHATSAPP INBOX              = READY (153 conversaciones reales)
WHATSAPP CONVERSATION       = READY (historial real, INBOUND/OUTBOUND real, AI/HUMAN correctamente omitido)
WHATSAPP MANUAL RESPONSE    = READY (arquitectura completa; envío real deshabilitado en este entorno por falta de token)
WHATSAPP AI SUGGESTION      = NOT IMPLEMENTED (documentado, sin servicio real reutilizable)
AUTO PUBLISH                = OFF, NOT TOUCHED, readiness NOT_READY (confirmado real)
TESTS                       = PASS 155/155
VALIDACIÓN VISUAL           = NO (navegador no usado) -- verificado por servidor+curl real
PUBLICATION                 = NOT EXECUTED
WHATSAPP SEND                = NO REAL MESSAGE SENT (CONFIGURATION_REQUIRED real en todo intento)
META                         = NOT TOUCHED

PHASE_STATUS = CLOSED
```
