# Checkpoint de Recuperación — Vida Divina
**Fecha del checkpoint:** 2026-08-16 (sesión avanzada, checkpoint creado antes de un posible cierre por límite de contexto).

> Este documento existe para que una nueva sesión de Claude pueda continuar el trabajo exactamente desde este punto, sin depender del historial de conversación de la sesión que lo generó. Todo lo marcado como **[REPORTADO POR EL USUARIO]** es información que el usuario aportó desde su propia investigación en Meta (App Dashboard / WhatsApp Manager / Configuración del Negocio) y que esta sesión de Claude **no verificó de forma independiente** — se documenta tal como fue reportada, sin inventar ni completar detalles. Todo lo demás fue verificado directamente en esta sesión (código leído, tests ejecutados, procesos inspeccionados, PostgreSQL consultado en modo lectura).

---

## 1. Estado del proyecto

- **Nombre del proyecto:** Vida Divina.
- **Ruta del repositorio:** `C:\Users\manue\Vida Divina`.
- **Rama actual:** `main`.
- **Último commit conocido:** `aba6470c279df347df632582741c49f20c4d02f` — "Agregar capa comercial y catálogo para WhatsApp Business" (2026-08-07 19:41:03 -0600).
- **Estado de git al momento de este checkpoint:** rama `main`, working tree con cambios sin commitear (modificaciones y archivos nuevos untracked, ver abajo). No se hizo ningún commit ni push durante esta sesión ni durante este checkpoint.

### Archivos modificados (tracked, con cambios sin commitear)
```
M docs/ARCHITECTURE_v1.md
M docs/PROJECT_STATE.md
M docs/conversaciones/plantillas/saludos.md
M docs/conversaciones/primer_contacto/index.md
M docs/conversaciones/primer_contacto/pregunta_precio.md
M docs/conversaciones/primer_contacto/redes_sociales.md
M docs/conversaciones/primer_contacto/referido.md
M docs/conversaciones/primer_contacto/whatsapp_directo.md
M docs/conversaciones/seguimiento/index.md
M docs/proceso_de_venta/README.md
M docs/proceso_de_venta/flujo_general.md
M docs/proceso_de_venta/postventa.md
M docs/proceso_de_venta/reglas_de_decision.md
M docs/proceso_de_venta/seguimiento.md
M simulator/package.json
M simulator/src/stateMachine.js
```

### Archivos/carpetas nuevos, untracked (no committeados todavía)
```
.gitignore
content-strategy/
creative-intelligence/          ← todo el trabajo de esta sesión vive aquí, ver sección 3
crm/                             ← módulo CRM/PostgreSQL (Fases A-C.2B, sesiones previas)
docs/CRM_FASE_A_DATA_MODEL.md
docs/CRM_FASE_B_POSTGRESQL.md
docs/CRM_FASE_C1_CONTEXT_PROJECTION.md
docs/CRM_FASE_C2_ASYNC_MIGRATION.md
docs/FASE_PRECAMPANA_VALIDACION.md
docs/WHATSAPP_CLOUD_API_STATUS.md
docs/WHATSAPP_INTEGRATION_STATE.md
docs/conversaciones/primer_contacto/mensaje_inicial.md
docs/proceso_de_venta/SPRINT_5_PROCESO_COMERCIAL.md
docs/proceso_de_venta/pago_y_pedido.md
docs/proceso_de_venta/recuperacion_de_compra.md
docs/proceso_de_venta/recursos/
docs/proceso_de_venta/seguimiento_postventa.md
marketing-intelligence/
performance-learning-intelligence/
simulator/src/contextoStorage.js
simulator/src/flujoVentaReal.js
simulator/src/recursosComerciales.js
simulator/src/ventaRealRules.js
simulator/test/
tts-text-preprocessor/
viral-content-intelligence/
voice-engine/
website-intelligence/
whatsapp-adapter/
```
`docs/PROJECT_STATE_CHECKPOINT_2026-08-16.md` (este archivo) se suma a esta lista de untracked al guardarse.

### Archivos protegidos que permanecieron intactos durante toda esta sesión
`creative-intelligence/orchestrator/stages/personaStage.js`, `painStage.js`, `angleStage.js`, `formatStage.js`, `synthesisStage.js`, `schemas/cycleInput.schema.js`, `schemas/cycleOutput.schema.js`, `orchestrator/cycleOrchestrator.js`, `orchestrator/cycleStore.js`, `src/creativeCell.js`, `src/hypothesis.js`, `src/productionBrief.js`, `src/competitivePipeline.js` — ninguno fue modificado en ningún momento. Fuera de `creative-intelligence/`: no se tocó `.env` de ningún módulo, no se tocó código de `crm/`, no se tocó código de `whatsapp-adapter/` (solo se leyó e inspeccionó).

### Tests — resultado total conocido al momento de este checkpoint
- **`creative-intelligence/`: 389/389 pasando, 0 fallos** (reconfirmado en esta misma sesión, justo antes de este checkpoint).
- **`whatsapp-adapter/`: 52/52 pasando, 0 fallos** (confirmado en una fase anterior de esta misma sesión, con `TEST_DATABASE_URL` real cargado desde `crm/.env`; no se re-ejecutó en este checkpoint para no generar actividad adicional innecesaria).

No se conocen tests rotos en ningún módulo tocado durante esta sesión.

---

## 2. Creative Intelligence — estado real

### Implementado y probado (389/389 tests)
| Componente | Estado |
|---|---|
| **Competitive Intelligence** (`competitiveAbstraction.js`, `competitivePipeline.js`, `competitiveEvidencePreliminary.js`, `sources/competitiveResearchSource.js`) | Implementado, validado. Adaptado al esquema real confirmado de Meta Graph API v26.0 `/ads_archive` (`publisher_platforms[]`, fechas, 4 arrays de creative copy, `search_page_ids` preparado). |
| **Affiliate Intelligence** (`src/affiliatePipeline.js`) | Implementado, probado. `AFFILIATE_FIELD_KIND`, `deriveDataPointFromAffiliateRecord`, `deriveAffiliateObservation/Pattern/Learning`, `collectComplianceRiskClaims`, `assertNoComplianceRiskClaimReused`. |
| **Evidence Taxonomy** (`src/evidenceTaxonomy.js`) | `EVIDENCE_DOMAINS` = `['COMPETITIVE', 'OWN_PERFORMANCE', 'CUSTOMER_RESEARCH', 'AFFILIATE']`. Guards `FORBIDDEN_INFERRED_METRICS`/`assertNoUnverifiedBusinessClaim`/`createRecommendation` amplíados a `SINGLE_SOURCE_BUSINESS_CLAIM_DOMAINS = ['COMPETITIVE', 'AFFILIATE']`. |
| **Evidence Snapshot real** | `data/evidence/3d992b38a777bc42dc33bbc8c44505af85c88546b07585503f0e24a61d6fd5b5.json` — 7 registros AE-001..AE-007, dominio `AFFILIATE_EVIDENCE`, página "Aumenta tu potencia masculina", **`affiliateRelationship: VERIFIED_BY_USER`** en los 7. Persistido, reproducible, confirmado en múltiples fases de esta sesión. |
| **Persona Stage / Pain Stage** | Sin cambios. Siguen rechazando estructuralmente `AFFILIATE_EVIDENCE`/`AFFILIATE_EVIDENCE_CONTEXTUAL` como base — confirmado por test explícito y por ejecución real (`runCycle()` con lote 100% affiliate se detiene en PersonaStage). |
| **Angle Stage / Format Stage / Synthesis Stage** | Sin cambios desde fases anteriores a esta sesión. |
| **cycleOrchestrator / cycleStore** | Sin cambios en esta sesión. 2 ciclos reales persistidos en `data/cycles/`: `6ee030bd-9b4d-483c-9b87-762c0860a2f7.json`, `4490f92f-c8ac-47e5-b129-7273a04c152f.json`. |
| **`creativeProductionArtifact.js`** (nuevo, `production/`) | Implementado y probado. `createProductionArtifact()`, vocabularios `COMMERCIAL_OBJECTIVES`/`HOOK_TYPES`/`DELIVERY_FORMATS`/`PRODUCTION_METRICS`, guard nuevo `assertNoPromiseLanguage` (bloquea "garantizado"/"te va a funcionar"/"vas a obtener resultados"). Reutiliza `assertNoWinnerClaim` de `schemas/cycleOutput.schema.js`. 4 artefactos reales construidos: CC-A1, CC-A2, CC-B2, CC-C1. |
| **`visualProductionPackage.js`** (nuevo, `production/`) | Implementado y probado. `createVisualProductionPackage()` — deriva `assetType`/`aspectRatios` del `ProductionArtifact` (nunca libre), calcula `assetStatus` (`PRODUCT_REFERENCE_REQUIRED`/`AVAILABLE`), reutiliza los mismos 3 guards de compliance. 8 paquetes reales construidos (ver sección 12). |
| **Guards de compliance** | `assertNoComplianceRiskClaimReused` (affiliatePipeline.js) — bloquea reutilizar los 4 claims de riesgo del afiliado. Confirmado por test negativo real en cada capa (evidencia, artifact, package). |
| **Guards WINNER/VALIDATED/PROVEN** | `assertNoWinnerClaim` (schemas/cycleOutput.schema.js, regex `/\b(WINNER\|VALIDATED\|PROVEN)\b/i` sobre el objeto serializado) — reutilizado sin modificar en `creativeProductionArtifact.js` y `visualProductionPackage.js`. Confirmado por test negativo en las 3 capas. |

### NO implementado
- Ningún consumidor real de generación de imagen/video (los `VisualProductionPackage` están listos como entrada, pero no hay integración con ninguna API de generación).
- Ninguna publicación automática.
- Ninguna conexión real con CreativeCell/Hypothesis/ProductionBrief del Pilar 5 (bloqueado deliberadamente: no existe Persona/Pain real todavía, ver limitaciones).
- El grupo de Facebook `https://www.facebook.com/groups/595173086192014` (ver sección 5) no ha sido investigado ni ingresado como evidencia.

### Limitaciones conocidas
- **No existe Customer Evidence real todavía** — ninguna Persona/Pain de Vida Divina está fundamentada en verbatim de cliente real. Esto bloquea estructuralmente (por diseño, no por descuido) la creación de CreativeCell/Hypothesis/ProductionBrief reales.
- **No existe imagen de referencia real de packaging** en el repositorio para ningún producto usado en los `VisualProductionPackage` (Café Divina Tongkat Ali, Divina Mars Capsules) — confirmado por búsqueda directa en `docs/productos/` y `knowledge/raw/`. Los 8 paquetes quedan `PRODUCT_REFERENCE_REQUIRED`.
- **`Lote A` de Affiliate Evidence es de una sola cuenta** ("Aumenta tu potencia masculina") — ningún patrón puede clasificarse todavía como multi-cuenta.

---

## 3. Meta Ad Library

Confirmado en una fase anterior de esta misma sesión (antes de la ingesta de Affiliate Evidence):

- Identidad de Meta confirmada, app **"Vive Vida Divina"**.
- Prueba real exitosa contra `/ads_archive` (Meta Graph API v26.0).
- Esquema real confirmado y adaptado en el código: `publisher_platforms[]` (array, no singular), `ad_creation_time`, `ad_delivery_start_time`, `ad_delivery_stop_time`, 4 arrays de creative copy (`ad_creative_bodies`, `ad_creative_link_titles`, `ad_creative_link_descriptions`, `ad_creative_link_captions`).
- Confirmado que Meta **no expone `spend`/`impressions` como cifras exactas para anuncios comerciales** (quedan `UNKNOWN`, nunca inferidos) — comportamiento observado de Meta, no una limitación de este código.
- `paging.next` contiene un token de paginación — **nunca se persiste ni se loguea** en ningún lugar del código.
- `search_page_ids` probado como capacidad (`AD_LIBRARY_SEARCH_MODES`, `createAdLibrarySearchQuery` en `sources/competitiveResearchSource.js`) — preparado, no conectado a un flujo automático.
- Page ID inválido probado para Vida Divina: `100068208229358` = **UNVERIFIED** (no se confirmó que corresponda a una página real de Vida Divina).
- Page IDs públicos verificados (confirmados por respuesta real de Meta, no inventados): Herbalife = `258101291061120`, Omnilife = `164446970674849`, Fuxion = `112057905197649`.
- `search_page_ids` contra Herbalife → `data: []`. Contra Omnilife → `data: []`. **Fuxion no fue consultado** — no continuar con Fuxion salvo instrucción futura explícita.
- Ningún token de acceso aparece en el código, en tests, ni en este documento.

---

## 4. Affiliate Evidence

### Lote A — investigado y persistido
- **Página:** "Aumenta tu potencia masculina".
- **URL:** `https://www.facebook.com/AumentaTuPotenciaMasculina`.
- **Page ID:** `101803169461808`.
- **Relación:** `affiliateRelationship: VERIFIED_BY_USER`.
- **Snapshot persistido:** `3d992b38a777bc42dc33bbc8c44505af85c88546b07585503f0e24a61d6fd5b5` — 7 registros AE-001..AE-007, todos reales, ninguno inventado ni reconstruido de memoria en esta sesión (siempre leídos del archivo persistido).

### Recurso pendiente — NO investigado todavía
- **Grupo de Facebook:** `https://www.facebook.com/groups/595173086192014`.
- Identificado como una posible segunda fuente de Affiliate Evidence.
- **No se ha observado ningún contenido de este grupo.** No inventar ni asumir ningún registro AE-XXX de esta fuente hasta que exista observación real, pegada explícitamente en una fase futura (mismo patrón ya usado para Lote A: el contenido estructurado se pega directamente en el mensaje del usuario, nunca se reconstruye de memoria).

---

## 5. WhatsApp — Estado crítico actual

**[REPORTADO POR EL USUARIO — no verificado de forma independiente por esta sesión, ya que esta información solo es visible desde el Meta App Dashboard / WhatsApp Manager del usuario]**

```
APP:              Vive Vida Divina
App ID:           1021640294034754
Modo:              Publicada

WABA:              Vive Vida Divina
WABA ID:           1058755243214295

Número real:       +52 1 222 907 1277
Phone Number ID:   1240340249168075

Webhook:           https://almanac-audience-tremor.ngrok-free.dev/webhook
Puerto local:      3000

Webhook GET verification: PASS
Webhook URL:              PASS
messages:                 SUBSCRIBED
```

Lo que **sí** verificó esta sesión directamente (código y procesos, no el dashboard de Meta):
- `whatsapp-adapter/server.js` es el servidor correcto; ruta `/webhook`, GET = verificación, POST = eventos.
- La verificación GET (`hub.mode`/`hub.verify_token`/`hub.challenge`) **pasó realmente**, tanto contra `http://localhost:3000` como contra `https://almanac-audience-tremor.ngrok-free.dev` — confirmado con una petición HTTP real, sin exponer el valor del token en ningún momento.
- `ngrok` estaba activo durante la última ronda de pruebas de esta sesión, apuntando a `localhost:3000`, con URL pública **idéntica** a la registrada en Meta.
- El proceso de `whatsapp-adapter/server.js` (versión real, con envío habilitado) fue el último dejado corriendo en esta sesión. **Su estado actual (si sigue corriendo o no) no fue re-verificado en este checkpoint** — una nueva sesión debe comprobarlo antes de asumir que sigue activo.

---

## 6. Prueba real de WhatsApp — resultado

Se envió, desde el WhatsApp personal del usuario, el mensaje real **"Hola"** al número de ventas.

Observado por el usuario:
- El mensaje llegó a la aplicación WhatsApp Business.
- Fue visible en la bandeja del número.
- Fue leído (doble palomita azul).
- **No produjo ninguna respuesta automática.**

Diagnóstico realizado en esta sesión (logs de `ngrok` y del servidor, más consulta de solo lectura a PostgreSQL — ver checkpoint anterior en esta misma sesión para el detalle completo):

```
REAL_WHATSAPP_INBOUND = FAIL
RESPONSE_GENERATION   = FAIL (no alcanzado)
META_OUTBOUND_SEND    = NOT_REACHED
END_TO_END_REPLY      = FAIL
```

Confirmado con evidencia directa, no solo inferido:
- **Cero conexiones entrantes nuevas** en el log de `ngrok` después de que se envió el mensaje real (última conexión fue tráfico propio de pruebas sintéticas anteriores).
- **Cero líneas `[whatsapp-adapter] evento recibido: ...`** en el log del servidor.
- **Cero registros nuevos** en `customer_channels`, `conversations`, `state_transitions` de PostgreSQL (consulta de solo lectura, reutilizando `crm/db/pool.js`, nunca escritura).

Conclusión: el evento nunca llegó a `ngrok`, por lo tanto nunca llegó al servidor, por lo tanto nunca llegó a `flujoVentaReal` ni a CRM.

---

## 7. Causa probable actual

**[REPORTADO POR EL USUARIO — confirmado por él en WhatsApp Manager y Configuración del Negocio de Meta; esta sesión no tiene visibilidad directa de esas pantallas]**

```
PHONE_NUMBER_STATUS   = SIN CONEXIÓN
CLOUD_API_CONNECTION  = NOT_CONNECTED
```

**Hipótesis mejor respaldada (no confirmada como hecho absoluto):** el número real sigue operando mediante la aplicación móvil de WhatsApp Business y no está actualmente conectado a Cloud API. Esto es consistente con la evidencia técnica de esta sesión (verificación GET funcionando + cero eventos jamás recibidos, ni antes ni durante la prueba real) — ese patrón es compatible con "URL de webhook correcta pero número no conectado/suscrito a esta app de Cloud API", pero **no se ha demostrado de forma concluyente cuál es la causa exacta** desde el lado de Meta.

```
Coexistence: NO ACTIVADO
```
Clasificado como **NEXT INVESTIGATION / POSSIBLE PATH** — no se afirma que Coexistence sea obligatorio.

---

## 8. Business Verification

**[REPORTADO POR EL USUARIO]**

```
Business Verification: NO VERIFICADO
```
- El botón "Agregar número de teléfono" apareció deshabilitado.
- **Todavía NO se inició** una nueva verificación.
- **Todavía NO se introdujo** ningún código SMS/llamada.

Esto es un **bloqueo pendiente de resolver**, no una acción ya tomada.

---

## 9. WhatsApp — lo que ya funciona localmente (verificado en esta sesión, con código real)

- **`whatsapp-adapter/`: 52/52 tests pasando.**
- Pipeline probado de punta a punta con datos sintéticos (nunca con el número real de Meta):
  `webhookParser → conversationRouter → flujoVentaReal → contextoStorage → CRM → PostgreSQL`.
- Confirmado con una petición HTTP real (no mock) contra el servidor real, tanto local como a través de la URL pública de `ngrok`:
  - Recepción del evento.
  - Clasificación de intención.
  - Identificación de producto.
  - Recuperación de recursos comerciales reales (ej. `docs/conversaciones/primer_contacto/mensaje_inicial.md`).
  - Respuesta preparada (`enviar: true`, recurso de texto real listo).
  - Persistencia real en PostgreSQL (confirmada por consulta directa, no inferida).
  - Ausencia de duplicación: un segundo mensaje del mismo `wa_id` actualizó el mismo registro, no creó uno nuevo.
  - El envío real hacia Meta se probó **deliberadamente deshabilitado** durante esas pruebas sintéticas (variables borradas solo en memoria del proceso de prueba, nunca en el archivo `.env`) — precisamente para no arriesgar un envío real con datos falsos.

**Esto NO debe interpretarse como prueba de `Meta → Cloud API → webhook real`** — esa cadena específica es exactamente la que falló en la sección 6, y sigue sin demostrarse.

---

## 10. Cierre comercial

Descubrimiento más reciente (fase de activación de WhatsApp, antes del diagnóstico de la prueba real): el piloto **deliberadamente no requiere todavía**:
- Pagos automatizados.
- Cálculo automático de envío.
- Tabla/entidad `orders`.
- Tabla/entidad `sales`.
- Automatización bancaria.

Flujo comercial piloto previsto:
```
intención de compra → producto → cantidad → total → instrucciones reales de pago → confirmación → handoff humano.
```

Estado del código: `conversationRouter`/`flujoVentaReal` todavía escalan a handoff humano **antes** de comunicar correctamente el total — confirmado por inspección directa del esquema real de `crm.opportunities` (columnas `producto_id`/`paquete`/`cantidad`/`total` existen, pero nada las llena hoy) y de las 17 funciones exportadas de `flujoVentaReal.js` (ninguna calcula subtotal/envío/total).

**Datos de pago reales: `MISSING_BUSINESS_DATA`.**

No inventar bajo ninguna circunstancia: cuenta bancaria, CLABE, link de pago, instrucciones bancarias. Ninguno de estos datos existe documentado en el proyecto todavía.

---

## 11. Visual Production

**8 `VisualProductionPackage` reales generados** (construidos con código real, `production/visualProductionPackage.js`, todos verificados contra los guards de compliance):

```
CC-A1-A   CC-A1-B
CC-A2-A   CC-A2-B
CC-B2-A   CC-B2-B
CC-C1-A   CC-C1-B
```

Todos:
- `status: DRAFT_FOR_REVIEW`.
- `humanReviewRequired: true`.
- `productPlacement.assetStatus: PRODUCT_REFERENCE_REQUIRED`.

**No existe todavía packaging oficial suficiente en el repositorio** (`docs/productos/`, `knowledge/raw/`) para generar assets finales sin una imagen de referencia real — confirmado por búsqueda directa, no asumido.

Estos 8 paquetes **no fueron persistidos en disco** (no existe todavía un mecanismo de almacenamiento para `production/` — se construyeron y verificaron en memoria/scripts de scratchpad de la sesión, siguiendo el mismo patrón que `creativeProductionArtifact.js`). Si una sesión futura los necesita, debe reconstruirlos ejecutando de nuevo `createVisualProductionPackage()` con el mismo contenido documentado en el reporte de esa fase (dentro de esta conversación) — no se inventa contenido nuevo para ellos.

---

## 12. DO NOT DO WITHOUT EXPLICIT AUTHORIZATION

- No generar tokens.
- No leer ni imprimir secretos (access tokens, app secret, verify token, credenciales de ngrok o de PostgreSQL).
- No modificar ningún archivo `.env` ni `whatsapp-adapter.env`.
- No hacer App Review en Meta.
- No migrar ni eliminar el número de WhatsApp sin autorización explícita.
- No borrar datos de PostgreSQL (incluyendo el registro sintético de prueba `wa_id` `5210000000099`, que sigue intacto).
- No publicar ningún contenido (creativo, post, anuncio) en ninguna plataforma.
- No declarar WINNER/VALIDATED/PROVEN sobre ninguna pieza creativa.
- No convertir Affiliate Evidence en Customer Evidence.
- No convertir claims observados de afiliados en claims propios de Vida Divina.
- No inventar métricas (ventas, ROAS, CPA, conversiones, número de clientes).
- No inventar Page IDs de Meta.
- No inventar datos de pago (cuenta, CLABE, link de pago).
- No inventar Product Facts que no estén en `docs/productos/`.

---

## 13. Próximo paso exacto

```
CURRENT_BLOCKER:
Conectar el número real +52 1 222 907 1277 a Cloud API.

NEXT_ACTION:
Determinar si Business Verification debe completarse antes de poder
reconectar/registrar el número. Si Meta exige una acción física
(SMS/llamada/Coexistence), DETENERSE antes de ejecutarla sin
autorización explícita del usuario.

AFTER_CONNECTION:
Enviar un único "Hola" real desde WhatsApp personal y verificar la
cadena completa:
WhatsApp → Meta Cloud API → webhook → whatsapp-adapter → flujoVentaReal
→ respuesta → Meta → WhatsApp.

AFTER_END_TO_END_WHATSAPP:
Implementar únicamente el camino mínimo de cierre comercial (producto
→ cantidad → subtotal → total → instrucciones reales de pago →
confirmación → registro), sin construir un sistema de pagos/órdenes
completo todavía.
```

---

## 14. Checkpoint de integridad

1. `git status` ejecutado — resultado documentado íntegro en la sección 1.
2. Archivo creado en este checkpoint: **únicamente** `docs/PROJECT_STATE_CHECKPOINT_2026-08-16.md` (este archivo). Ningún otro archivo fue creado ni modificado durante la redacción de este checkpoint.
3. Confirmado: no se tocó ningún `.env` ni `whatsapp-adapter.env`.
4. Confirmado: no se leyó ni se imprimió ninguna credencial (access token, app secret, verify token, cadena de conexión de PostgreSQL) en ningún momento de esta sesión, incluyendo este checkpoint.
5. Confirmado: no se hizo ninguna llamada externa (ni a Meta, ni a WhatsApp, ni a ninguna API) durante la redacción de este checkpoint.
6. No se hizo commit.
7. No se hizo push.

### Resumen final

```
CHECKPOINT_CREATED = PASS
CHECKPOINT_PATH = docs/PROJECT_STATE_CHECKPOINT_2026-08-16.md
```

### Discrepancias encontradas entre lo documentado y lo verificado en el repositorio
- Ninguna discrepancia en `creative-intelligence/` (389/389 confirmado en vivo justo antes de escribir este checkpoint).
- Ninguna discrepancia en el estado de `whatsapp-adapter/` local (52/52, confirmado en fase anterior de esta misma sesión, no re-ejecutado ahora).
- Toda la información de las secciones 5, 7 y 8 (App ID, WABA ID, número real, Business Verification, Coexistence) es **exclusivamente reportada por el usuario** — esta sesión no tiene ni tuvo en ningún momento acceso al Meta App Dashboard ni a WhatsApp Manager para verificarla de forma independiente. Cualquier sesión futura que dependa de esos valores debe tratarlos como no verificados por código hasta confirmarlo por otra vía.
- No se pudo verificar en este checkpoint si el proceso de `whatsapp-adapter/server.js` y el túnel de `ngrok` siguen corriendo — ambos fueron dejados activos al final de la fase de diagnóstico anterior dentro de esta misma sesión, pero su estado actual no fue re-comprobado para no realizar una "nueva investigación" durante este checkpoint, tal como se instruyó.
