# Vida Divina — Estado Oficial del Proyecto

> **Propósito de este documento:** ser la **única fuente de verdad** sobre en qué punto está el proyecto — fases completadas, en curso y pendientes; decisiones arquitectónicas y de negocio; tests y su resultado real; integraciones externas; bloqueos; y el siguiente paso autorizado. Debe ser suficiente, por sí solo (junto con `docs/ARCHITECTURE_v1.md` para el detalle histórico de la capa de conocimiento), para que **cualquier sesión nueva, sin memoria de conversaciones anteriores, entienda dónde está el proyecto sin tener que releer el código completo ni asumir nada.**
>
> Este documento se actualiza al cierre de cada fase, subfase o cambio arquitectónico importante — no se espera a que se solicite. Cuando un dato cambia, se actualiza y se conserva la explicación del cambio; nunca se borra silenciosamente una decisión anterior.
>
> **Corte original de esta sección:** 2026-08-14, al cierre de la Fase Pre-Campaña (Validación en Vivo del Motor Async + Cierre de Brechas), posterior a C.2B (Async Migration + CRM Context Storage). Repositorio con 4 commits (`d1eb7d1`, `7391271`, `97878d4`, `aba6470`) — el trabajo de las Fases A-C.2B del CRM y de la Fase Pre-Campaña todavía no está commiteado (ver `git status`).
>
> **Nota de actualización 2026-08-23:** entre el corte anterior (2026-08-14) y esta nota, el árbol de trabajo (sin comitear — sigue en `aba6470`) avanzó una capa completa de herramientas que este documento todavía no narra en detalle: WhatsApp Operational Integration + Campaign Pilot (Fase 16), Content Generation Engine, Content Orchestrator/Planning/Strategy, Creative Intelligence, Attribution Engine, Marketing/Learning/Performance Intelligence, Media Hosting + Publishing Scheduler, Operation Dashboard, Human-in-the-Loop Workspace, y — lo más reciente — Video Workspace + Voice Engine real. Cada fase de esa capa tiene su propio checkpoint fechado en `docs/PROJECT_STATE_CHECKPOINT_*.md` (ver lista completa al pie de esta sección); este documento no los duplica. La tabla "ESTADO ACTUAL" de abajo sigue reflejando el corte de 2026-08-14 del **Programa CRM / Customer 360** específicamente (sigue siendo válida para esa capa) — no asumir que también describe el estado de la capa de herramientas más reciente.

---

# ESTADO ACTUAL

```
FASE ACTUAL:                Ninguna en curso — Fase Pre-Campaña cerrada, C.3 no autorizada
ESTADO:                     🟢 Estable — motor comercial async sobre PostgreSQL, re-validado en vivo
ÚLTIMA FASE COMPLETADA:     Fase Pre-Campaña — Validación en Vivo del Motor Async + Cierre de
                             Brechas (ver docs/FASE_PRECAMPANA_VALIDACION.md)
SIGUIENTE FASE AUTORIZADA:  Ninguna — esperar instrucciones del propietario antes de lanzar
                             la primera campaña o iniciar C.3
BLOQUEO ACTUAL:              Ninguno sobre el código/CRM. Sí existe un bloqueo externo,
                             no técnico, sobre la migración de WhatsApp al número REAL
                             (Business Verification de Meta — ver "Integraciones Externas").
                             Mercado Pago sigue PENDIENTE DE CONFIRMACIÓN DEL PROPIETARIO
                             (cero código de integración encontrado — ver Fase Pre-Campaña §3).
ÚLTIMA VALIDACIÓN:           145/145 tests reales (2026-08-14) + validación en vivo adicional
                             de la Fase Pre-Campaña (servidor real + PostgreSQL real + envío
                             real por Graph API confirmado con HTTP 200, 2026-08-14) — ver
                             docs/FASE_PRECAMPANA_VALIDACION.md §1
TESTS:                       crm/ 63/63 · simulator/ 35/35 · whatsapp-adapter/ 51/52 (1 fallo
                             conocido, ajeno a la lógica de negocio — ver
                             docs/FASE_PRECAMPANA_VALIDACION.md §8.4)
FUENTE DE VERDAD:             docs/PROJECT_STATE.md (este documento) + docs/ARCHITECTURE_v1.md
INTEGRACIONES EXTERNAS:       PostgreSQL: VALIDADA · WhatsApp (núm. prueba): VALIDADA EN VIVO
                             post-C.2B (2026-08-14, ver Fase Pre-Campaña) · WhatsApp (núm.
                             real): BLOQUEADA · Mercado Pago: PENDIENTE DE CONFIRMACIÓN ·
                             Instagram: NO INICIADA
ÚLTIMA ACTUALIZACIÓN:         2026-08-14 (Corrección Pre-E2E, cierre formal) — ver nota de
                             2026-08-23 arriba para lo avanzado después de este corte
```

## Checkpoints posteriores a este corte (capa de herramientas, más reciente primero)

Cada uno documenta su propia fase con detalle real (implementado, tests, hallazgos) — no se duplica aquí:

- `docs/PROJECT_STATE_CHECKPOINT_2026-08-23_VIDEO_WORKSPACE_VOICE_ENGINE.md` — Video Workspace (Dashboard) + Voice Engine real conectado; cierre del bug `SOURCE_ASSET_REQUIRED` (causa raíz: piso de timeout de Voice Engine insuficiente para textos cortos); hallazgo abierto de capacidad de memoria de WSL2 en corridas largas.
- `docs/PROJECT_STATE_CHECKPOINT_2026-08-21_WHATSAPP_INTEGRATION_CAMPAIGN_PILOT.md` — Fase 16: WhatsApp Operational Integration + primer Campaign Pilot real de punta a punta (959/960 tests).
- `docs/PROJECT_STATE_CHECKPOINT_2026-08-21_HUMAN_IN_THE_LOOP_WORKSPACE.md`
- `docs/PROJECT_STATE_CHECKPOINT_2026-08-21_DASHBOARD_OPERATIONS.md`
- `docs/PROJECT_STATE_CHECKPOINT_2026-08-20_MEDIA_HOSTING_SCHEDULER.md`
- `docs/PROJECT_STATE_CHECKPOINT_2026-08-19_OPERATION_DASHBOARD.md`
- `docs/PROJECT_STATE_CHECKPOINT_2026-08-17_CONTENT_GENERATION_ENGINE.md`, `docs/PROJECT_STATE_CHECKPOINT_2026-08-17_CONTENT_ORCHESTRATOR.md`, `docs/PROJECT_STATE_CHECKPOINT_2026-08-17_PRODUCTION_STORES.md`
- `docs/PROJECT_STATE_CHECKPOINT_2026-08-16.md`

---

# ESTADO FINAL DEL PROCESO COMERCIAL (Corrección Pre-E2E, 2026-08-14)

Cierre formal de la corrección autorizada sobre la Fase Pre-Campaña, antes de la prueba E2E real vía Meta/ngrok (todavía no autorizada). Detalle completo en `docs/FASE_PRECAMPANA_VALIDACION.md` §8.

| Punto | Estado |
|---|---|
| Primer contacto | Bienvenida obligatoria — se envía siempre en el primer mensaje de un contacto nuevo, sin excepción, incluso si ese mensaje ya expresa intención de consumo clara |
| Primer mensaje del cliente | Persistido siempre (`contexto.respuestaCliente` → `messages.texto`), incluido cuando es ambiguo — corrige el hallazgo de la Fase Pre-Campaña |
| Clasificación de intención | Ocurre a partir del **segundo** mensaje del cliente, nunca en el mismo turno que la bienvenida |
| Catálogo de precios | 8 productos con precio real y activo (`docs/proceso_de_venta/recursos/precios.md`) — ver tabla completa en ese documento |
| Resto del catálogo | Permanece **PENDIENTE** — ningún precio inventado para ningún otro producto |
| Mecanismo de pago del piloto | **PAGO MANUAL POR WHATSAPP** — sin Mercado Pago, sin integración automatizada (decisión de negocio confirmada, ver `docs/proceso_de_venta/pago_y_pedido.md`) |
| Té Divina | Único producto que alcanza el flujo completo (audio → necesidad → precio → oferta → cierre) sin handoff — verificado con tests reales |
| Mercado Pago | Fuera de alcance — no implementado, no integrado |
| `orders` / `payments` | Fuera de alcance — sin cambios de schema, sin implementación |
| C.3 | Sin iniciar — no autorizada |
| Creative Intelligence | Sin iniciar — no autorizada |
| Prueba E2E real (Meta/ngrok) | **No ejecutada** — requiere autorización explícita separada |

---

# ESTADO DE FASES

## Fundación (Knowledge Model / Compiler / Decision Engine)

| Fase | Estado | Validación | Observaciones |
|---|---|---|---|
| Fase 1 — Auditoría Técnica | COMPLETA | Documental | Ver `FASE_1_AUDITORIA_TECNICA.md` |
| Fase 2 — Knowledge Model + Compiler | COMPLETA | 165 entidades, 0 errores | `docs/KNOWLEDGE_MODEL.md` congelado |
| Fase 3 — Simulator + Recommendation Engine | COMPLETA | 6/6 casos manuales c/u | Ambos aislados, sin integrar entre sí en esta fase |
| Estabilización de Arquitectura (commit `7391271`) | COMPLETA | 66 productos reales, Decision Engine conectado | Cierra Hallazgo 1 de `ARCHITECTURE_v1.md` |
| Cierre Decision Engine (commit `97878d4`) | COMPLETA | 6/6 manuales + 15/15 automatizadas | `DECISION_ENGINE_IMPLEMENTATION.md` |

Detalle completo de esta etapa en la sección **"Historia — Fase de Fundación"** al final de este documento, y en `docs/ARCHITECTURE_v1.md`.

## Programa CRM / Customer 360

| Fase | Estado | Validación | Observaciones |
|---|---|---|---|
| Auditoría CRM (preflight) | COMPLETA | Documental | Auditoría de persistencia/entidades existentes antes de diseñar el CRM |
| **A** — CRM Customer 360 Data Model | COMPLETA | Diseño aprobado | `docs/CRM_FASE_A_DATA_MODEL.md` — 10 entidades aprobadas, `orders`/`payments` bloqueadas por decisión de negocio |
| **B** — PostgreSQL Core Data Store | COMPLETA Y VALIDADA | 46/46 tests, PostgreSQL 18.6 real | `docs/CRM_FASE_B_POSTGRESQL.md` — `crm/` aislado, `pg` como única dependencia nueva del proyecto |
| **C.0** — CRM Integration Preflight | COMPLETA | Auditoría | Call graph real de `contextoStorage.js`; sin cambios de código |
| **C.1** — CRM Context Projection | COMPLETA Y VALIDADA | 63/63 tests | `docs/CRM_FASE_C1_CONTEXT_PROJECTION.md` — `crm/context/`, aislado, sin conectar todavía a `contextoStorage.js` |
| **C.2** (intento inicial) | BLOQUEADA (documentado, no implementado) | — | Incompatibilidad sync/async real entre `contextoStorage.js` y la API async de C.1. Sin código escrito. Ver §"Bloqueos" (RESUELTO en C.2B) |
| **C.2A** — Async Migration Preflight | COMPLETA | Auditoría | Call graph completo de la propagación async; sin cambios de código |
| **C.2B** — Async Migration + CRM Context Storage | COMPLETA Y VALIDADA | **145/145 tests**, 3 corridas consecutivas | `docs/CRM_FASE_C2_ASYNC_MIGRATION.md` — PostgreSQL es la fuente de verdad activa del motor comercial; JSON retenido, inerte |
| **C.3** | **NO INICIADA** | — | No autorizada — no hay diseño ni código |
| **Fase Pre-Campaña** — Validación en Vivo del Motor Async + Cierre de Brechas | COMPLETA (+ Corrección Pre-E2E, mismo día) | Servidor real + PostgreSQL real + envío real por Graph API (HTTP 200), auditoría de recursos comerciales 1:1 contra Sprint 5, handoff real verificado. Corrección posterior: bienvenida siempre en primer contacto, catálogo real de 8 productos con precio, pago manual del piloto documentado | `docs/FASE_PRECAMPANA_VALIDACION.md` (§8 para la corrección) — gate previo a la primera campaña publicitaria; no es una fase del CRM, es validación operativa sobre lo ya construido |

No se marca ninguna fase como COMPLETA solo porque el código fue escrito — cada una de las filas de arriba tiene una corrida de tests real asociada, ejecutada contra PostgreSQL real (no mocks) donde aplica.

---

# DECISIONES ARQUITECTÓNICAS ACTIVAS

Ninguna debería modificarse sin revisión formal (ver criterios en `ARCHITECTURE_v1.md` §13).

**Capa de conocimiento (`docs/`/`knowledge/`) — vigentes desde la Fase de Fundación:**
1. `docs/` en Markdown es la única fuente de verdad de conocimiento de negocio; ningún componente de código escribe ahí.
2. La compilación es unidireccional (`docs/` → `knowledge/`, nunca al revés).
3. Separación estricta entre conocimiento (`docs/`) e implementación (código).
4. Metadatos por archivo paralelo (`.meta.json`), no frontmatter embebido.
5. Sin motor de grafos, sin embeddings, sin modelo de lenguaje en ningún componente actual.
6. Un componente, una responsabilidad — ninguno absorbe la responsabilidad de otro.
7. Toda regla de decisión transcrita a código debe citar su fuente documental exacta.
8. Nunca inventar información; lo no verificable se declara como hallazgo.
9. La señal de seguridad (médica) tiene prioridad absoluta sobre cualquier recomendación.
10. Todo hallazgo se documenta antes de corregirse.
11. `knowledge/` es en su totalidad regenerable y desechable.

**Capa de datos comerciales (`crm/`) — vigentes desde la Fase B del CRM:**
12. **`crm/index.js` es la única puerta de acceso directo a PostgreSQL en todo el proyecto.**
13. **Ningún módulo fuera de `crm/` importa `pg`** (verificado por auditoría en cada fase — 0 en cada cierre).
14. **PostgreSQL es la fuente de verdad activa del motor comercial** (desde C.2B) — antes era JSON.
15. **No existe escritura dual JSON + PostgreSQL** — ninguna fase la implementó ni la implementará sin autorización explícita.
16. **JSON permanece temporalmente como infraestructura legacy inerte** (`data/conversaciones/`, funciones privadas de `contextoStorage.js`) — retenido, no eliminado, hasta una fase futura que lo autorice explícitamente tras validar estabilidad.
17. **`contextoStorage.js` mantiene su contrato funcional (nombres, parámetros, forma del objeto) pero es `async` desde C.2B** — todo consumidor debe usar `await`.
18. **`crm/` no importa `simulator/`** — la dependencia va en un solo sentido (`simulator` → `crm`).
19. **No crear una segunda conexión/pool de PostgreSQL** fuera de `crm/db/pool.js` (los tests usan un segundo pool aislado exclusivamente para `TEST_DATABASE_URL`, dentro de `crm/test/`, mismo criterio de aislamiento).
20. **No modificar schema/migraciones sin una fase explícitamente autorizada para ello** — ninguna fase del CRM hasta ahora (A-C.2B) tocó `crm/migrations/` después de la migración inicial de la Fase B.
21. **Node.js sin dependencias externas, excepto `pg` (exclusivo de `crm/`)** — excepción aprobada en Fase B, ver `docs/ARCHITECTURE_v1.md` §11 punto 6.
22. **No modificar lógica comercial durante migraciones de infraestructura salvo autorización explícita** — verificado en cada fase (B, C.1, C.2B) que ninguna regla de decisión, mensaje comercial ni clasificación cambió; solo el mecanismo de persistencia/sincronía.

---

# DECISIONES DE NEGOCIO

Separadas deliberadamente de las técnicas — una suposición de negocio nunca debe convertirse en una decisión técnica permanente sin que el propietario la haya tomado explícitamente.

## Resueltas por el propietario

- **Decisión C1 (Fase C.1/C.2):** un `customer_channel` mantiene/reutiliza una única `conversation` — no se introducen reglas de nueva conversación por inactividad o cierre comercial todavía.
- **Decisión C2, Opción A (Fase C.1/C.2):** solo se capturan mensajes **entrantes**, derivados de `respuestaCliente`. Mensajes salientes, `wamid` y timestamp real de WhatsApp quedan fuera de alcance hasta una decisión posterior.
- **Decisión sobre `whatsappAdapter.test.js:354` (Fase C.2B):** se autorizó que `procesarEventoWebhook` devuelva una `Promise` (antes se exigía explícitamente que no lo hiciera) — cambio arquitectónico aprobado, no de negocio.
- **Decisión sobre transacciones (Fase C.2B):** no agrupar los pasos `*Persistente` de un mismo turno en una única transacción — se acepta la ventana de concurrencia resultante como limitación conocida.

## Pendientes — requieren decisión explícita del propietario antes de implementarse

- **Modelado de `orders`/`payments`.** Diferido explícitamente en `docs/proceso_de_venta/pago_y_pedido.md` hasta que existan landing, métodos de pago definidos, Mercado Pago configurado y cuentas de transferencia confirmadas. El esquema propuesto en `docs/CRM_FASE_A_DATA_MODEL.md` §16-17 es preliminar, no aprobado para implementar.
- **Política de retención de `messages.texto`.** `docs/agente_ia/memoria.md` fue escrito para la memoria de razonamiento del agente, no como política de retención de una base de datos transaccional — falta una decisión explícita sobre cuánto tiempo (o bajo qué redacción) se retiene el texto de los mensajes.
- **Mecanismo de resolución de `handoffs`.** Existe el campo (`resuelto_en`/`resuelto_por`) pero ningún proceso real lo completa — no está decidido cómo un humano marcaría un handoff como atendido.
- **Promoción de `nombre`/dirección a atributo permanente de `customers`.** Hoy solo se capturan por pedido (cuando exista `orders`), no como perfil duradero del cliente.
- **Cuándo abrir una nueva `conversation`** para un canal que ya tiene una (más allá de la Decisión C1, que fijó el comportamiento mínimo, no el definitivo).
- **Migración de WhatsApp al número real.** Bloqueada por requisitos de identidad de negocio ante Meta (Business Verification, Tech Provider) — ver "Integraciones Externas". No es una decisión técnica: depende de completar el perfil legal del negocio en Meta Business Suite.

---

# INTEGRACIONES EXTERNAS

Nunca se registran tokens, contraseñas, access tokens, App Secrets ni credenciales reales en este documento — solo estado.

## PostgreSQL

**ESTADO: VALIDADA.**
PostgreSQL 18.6 corriendo localmente (servicio de Windows). Dos bases: `vida_divina_crm` (desarrollo) y `vida_divina_crm_test` (test, aislada). Credenciales: **CONFIGURADAS** en `crm/.env` (no versionado, protegido por `.gitignore`). `crm/.env.example` (sin secretos) sí está versionado.

## WhatsApp / Meta Cloud API

**Número de PRUEBA — ESTADO: VALIDADA (end-to-end real, pero pre-CRM).**
Confirmado con evidencia verificable en `docs/WHATSAPP_CLOUD_API_STATUS.md` (corte: 2026-08-09): flujo completo probado en vivo contra el número de prueba de Meta — webhook recibido, motor comercial ejecutado, envío real por Graph API confirmado (`wamid` real, estados `sent → delivered → read`). **Importante:** esa validación se ejecutó **antes** de la migración a PostgreSQL/async (Fases C.1-C.2B, cerradas el 2026-08-14) — el motor comercial que se probó en vivo era la versión síncrona sobre JSON. El código de `whatsapp-adapter/` ya fue adaptado a la nueva firma async y sus 51 tests automatizados (incluido un test end-to-end contra PostgreSQL real, sin Meta) pasan en verde, pero **no se ha vuelto a ejecutar una prueba en vivo contra Meta con el motor ya conectado a PostgreSQL.** No es un bloqueo — es una validación en vivo pendiente de repetir antes de considerar esta integración production-ready extremo a extremo.
Credenciales: **CONFIGURADAS** (token, App Secret, verify token) en `whatsapp-adapter/.env`/`whatsapp-adapter.env` (no versionados).

**Número REAL — ESTADO: BLOQUEADA.**
Registrado en Meta (`Phone Number ID` real conocido) pero `DISCONNECTED` — no activo en ninguna plataforma de mensajería de Meta. Bloqueo 100% de identidad de negocio ante Meta, no de código ni de arquitectura: falta completar Business Verification y Tech Provider (nombre legal, dirección, sitio web — todos vacíos hoy en Meta Business Suite). Ver `docs/WHATSAPP_CLOUD_API_STATUS.md` §9-12 para el procedimiento completo y la lista de comprobación antes de migrar. **No debe tocarse** el número real ni ejecutarse `request_code`/`verify_code`/`register` sobre él bajo ninguna circunstancia no confirmada explícitamente como Coexistence.

## Instagram

**ESTADO: NO INICIADA.**
Ningún adaptador de atención a clientes por Instagram existe. `content-strategy/instagramPublicationAdapter.js` existe pero es para **publicar contenido de marketing**, no para atender clientes — sin relación con el CRM ni con `simulator/`.

## Website

**ESTADO: NO APLICA a este programa.**
`website-intelligence/` existe como módulo de inteligencia de mercado (scraping/observación), no como canal de atención a clientes — fuera del alcance del CRM.

---

# ÚLTIMA VALIDACIÓN

**Corte:** 2026-08-14, cierre de Fase C.2B. Ejecutado en esta misma sesión, contra PostgreSQL 18.6 real (`TEST_DATABASE_URL`), sin mocks de base de datos (los únicos mocks del proyecto son `fetch` hacia Graph API en `graphApiSender.test.js`, deliberado — esa suite no debe tocar la red real de Meta).

| Suite | Tests | Pass | Fail | Infraestructura |
|---|---|---|---|---|
| `crm/` (Fases B + C.1) | 63 | 63 | 0 | PostgreSQL real |
| `simulator/` (`contextoStorage`, `flujoVentaRealPersistente`, `ventaReal`) | 31 | 31 | 0 | PostgreSQL real (los dos primeros); el tercero no toca persistencia |
| `whatsapp-adapter/` (`whatsappAdapter`, `httpServer`, `graphApiSender`, `e2ePostgres`) | 51 | 51 | 0 | PostgreSQL real + servidor HTTP real en loopback; Graph API mockeada a propósito |
| **Total** | **145** | **145** | **0** | — |

**Corridas consecutivas verificadas:** 3, sin flakiness. **Número de corridas de la suite completa en esta sesión:** múltiples (cada hallazgo real encontrado — 6 en total durante C.2B — se corrigió y se re-verificó antes de continuar; ver `docs/CRM_FASE_C2_ASYNC_MIGRATION.md` §4 para el detalle de cada uno).

No se declara "validado" ningún componente que solo tenga cobertura unitaria cuando la fase exigía integración real — las 145 pruebas de arriba son de integración real donde la fase lo requería (persistencia, transacciones, concurrencia, rollback).

---

# BLOQUEOS ACTUALES

## Bloqueo — Migración de WhatsApp al número real

**PROBLEMA:** el número real de WhatsApp Business está `DISCONNECTED` en Meta Cloud API.
**IMPACTO:** no se puede atender clientes reales por WhatsApp con el número de producción — solo con el número de prueba (limitado a destinatarios autorizados explícitamente en Meta).
**QUÉ DEPENDE DE ÉL:** cualquier despliegue real del motor comercial hacia clientes finales de Vida Divina.
**ACCIÓN DEL PROPIETARIO:** completar en Meta Business Suite el nombre legal del negocio, dirección y sitio web; iniciar Business Verification (~5 días hábiles según Meta); completar el proceso de Tech Provider. Procedimiento completo en `docs/WHATSAPP_CLOUD_API_STATUS.md` §11-12.
**QUÉ NO DEBE HACERSE MIENTRAS ESTÁ BLOQUEADO:** ejecutar `request_code`/`verify_code`/`register` sobre el número real; asumir que el flujo disponible en Meta es Coexistence sin verificarlo explícitamente en la interfaz.

## Bloqueos ya resueltos (se conserva el historial, no se borra)

**RESUELTO — Incompatibilidad sync/async (C.2 intento inicial, 2026-08-14).**
`contextoStorage.js` era síncrono; la API de persistencia (C.1) es necesariamente async (PostgreSQL). Se detuvo esa fase sin implementar nada y se documentó el bloqueo en vez de improvisar un puente riesgoso (se evaluaron y descartaron: escritura dual, `worker_threads`+`Atomics.wait`, caché síncrona). **Resuelto en C.2A (auditoría de la propagación) + C.2B (implementación)** — ver tabla de fases arriba.

**RESUELTO — PostgreSQL no instalado (Fase B, primer intento).**
No existía ninguna instancia de PostgreSQL ni Docker en el entorno de desarrollo. Se detuvo la fase, se documentó exactamente qué instalar, y se retomó cuando el propietario confirmó PostgreSQL 18.6 instalado y funcionando.

---

# SIGUIENTE PASO AUTORIZADO

**"Esperar instrucciones del propietario antes de lanzar la primera campaña publicitaria o de iniciar C.3."**

No hay ninguna otra acción de código autorizada en este momento. El programa CRM tiene, hoy, un motor comercial completo sobre PostgreSQL (async, validado, 145 tests + validación en vivo adicional de la Fase Pre-Campaña, 2026-08-14). La re-validación en vivo del envío real post-C.2B **ya se ejecutó** (ver `docs/FASE_PRECAMPANA_VALIDACION.md` §1) mediante una prueba híbrida (servidor real + PostgreSQL real + Graph API real, webhook entrante sintetizado localmente en vez de recibido vía Meta/ngrok). Sigue pendiente, y no autorizada a ejecutarse sin instrucción explícita, la variante 100% en vivo vía ngrok con un mensaje enviado desde el teléfono del propietario.

---

# PROCEDIMIENTO DE RECUPERACIÓN DE SESIÓN

Si esta conversación se reinicia, o una sesión nueva de Claude (u otro desarrollador) retoma el proyecto sin el historial de conversación disponible, **antes de implementar cualquier cosa**:

1. Leer este documento completo (`docs/PROJECT_STATE.md`).
2. Leer `docs/ARCHITECTURE_v1.md` (capa de conocimiento/Fundación).
3. Leer el documento de la última fase completada según la tabla de arriba (hoy: `docs/FASE_PRECAMPANA_VALIDACION.md`, precedida por `docs/CRM_FASE_C2_ASYNC_MIGRATION.md`).
4. Ejecutar `git status` y comparar contra la sección "Estado de Fases" — confirmar que coincide.
5. Ejecutar `git diff` sobre los archivos trackeados modificados, para entender qué cambió realmente.
6. Determinar qué fase está **realmente** autorizada — nunca asumir que una fase está completa solo porque existen archivos creados; buscar evidencia de tests ejecutados y su resultado real.
7. Si el estado no es inequívoco, **no implementar nada** — presentar primero un resumen de "Recuperación de Sesión" (dónde quedó el proyecto, última fase completada, tests, bloqueos, siguiente paso autorizado) y esperar confirmación.

---

# HISTORIA — Fase de Fundación (Knowledge Model / Compiler / Decision Engine)

> Sección condensada del estado histórico previo al programa CRM — preservada como contenido útil, no reescrita. Para el detalle completo (contratos, evidencia de cada hallazgo, diagrama de flujo) ver `docs/ARCHITECTURE_v1.md`.

**Qué es Vida Divina (el proyecto):** el sistema de conocimiento y las herramientas de software que sostienen el negocio de venta directa de productos de bienestar — no el negocio en sí.

**Qué se cerró en esta etapa:** base de conocimiento modular en `docs/`, Knowledge Compiler (`compiler/`) transformándola en `knowledge/compiled/` (177 entidades, 1898 relaciones), Recommendation Engine (`recommendation-engine/`) y Conversation Simulator (`simulator/`) validados de forma aislada, y Decision Engine (`decision-engine/`) conectándolos sin modificar ninguno de los dos (commit `7391271`, cerrado con pruebas automatizadas en `97878d4`).

**Componentes de esta etapa:**

| Componente | Propósito | Estado | Ubicación |
|---|---|---|---|
| Base de Conocimiento | Conocimiento de negocio en prosa estructurada | Validado (parcial en `conversaciones/`, `objeciones/`) | `docs/` |
| Knowledge Model | Contrato conceptual de entidades/relaciones | Congelado | `docs/KNOWLEDGE_MODEL.md` |
| Knowledge Compiler | `docs/` → datos estructurados | Validado | `compiler/` |
| Knowledge Package | Artefacto compilado, regenerable | Implementado | `knowledge/` |
| Recommendation Engine | Prioridad de producto por perfil | Validado, aislado | `recommendation-engine/` |
| Conversation Simulator | Flujo comercial de 7 pasos (genérico, `ESTADOS`) | Validado, aislado | `simulator/src/simulator.js` |
| Decision Engine | Conecta los dos anteriores sin modificarlos | Validado (6/6 + 15/15) | `decision-engine/` |

**Deuda técnica vigente de esta etapa** (sin cambios desde el cierre original): sin validación automática de anclas Markdown; clasificación de entidades por convención de nombre, no de contenido; sin cache incremental de compilación; lectores de `knowledge/compiled/` duplicados en 4 componentes; cobertura de `NOT_RECOMMENDED` parcial (4/16 perfiles); `compiler/`, `recommendation-engine/` y `simulator/src/simulator.js` sin pruebas automatizadas propias (a diferencia de `decision-engine/` y del motor comercial real `simulator/src/flujoVentaReal.js`, que sí las tienen).

**Riesgos vigentes de esta etapa:** desincronización silenciosa entre `docs/` y `knowledge/` (nada detecta automáticamente cuándo `knowledge/compiled/` quedó desactualizado); reglas transcritas a mano (`simulator/src/rules.js`, `stateMachine.js`) pueden divergir de `docs/proceso_de_venta/` sin aviso.

**Nota de corrección respecto a la versión anterior de este documento:** la fila "Conversation Runtime — Pendiente" y el roadmap que la señalaba como "siguiente paso desbloqueado" quedan **obsoletos** — esa capacidad (memoria persistente entre turnos) es exactamente lo que el programa CRM construyó, con una arquitectura distinta a la originalmente imaginada (PostgreSQL vía `crm/`, no un mecanismo ad hoc dentro de `simulator/`). Ver tabla "Programa CRM / Customer 360" arriba. El resto de componentes pendientes de esta etapa (Resource Engine, Modelo de Promoción, Fuente operativa de precios) siguen exactamente en el mismo estado que documentaba el cierre original: bloqueados por ausencia de datos reales en `docs/`, no por código.

**Documentación histórica de esta etapa** (no se actualiza hacia adelante, válida como evidencia de lo que se hizo):
- `FASE_1_AUDITORIA_TECNICA.md`, `KNOWLEDGE_COMPILER_IMPLEMENTATION.md`, `KNOWLEDGE_COMPILER_NOTES.md`, `CONVERSATION_SIMULATOR.md`, `RECOMMENDATION_ENGINE.md`, `DECISION_ENGINE_IMPLEMENTATION.md`.

**Documentación normativa del programa CRM** (se actualiza en cada fase):
- `docs/CRM_FASE_A_DATA_MODEL.md`, `docs/CRM_FASE_B_POSTGRESQL.md`, `docs/CRM_FASE_C1_CONTEXT_PROJECTION.md`, `docs/CRM_FASE_C2_ASYNC_MIGRATION.md`.

**Documentación normativa de la Fase Pre-Campaña** (gate de validación operativa, no forma parte del programa CRM ni de sus fases A-C.3):
- `docs/FASE_PRECAMPANA_VALIDACION.md`.

**Documentación normativa de WhatsApp/Meta** (se actualiza en cada sesión de integración real):
- `docs/WHATSAPP_INTEGRATION_STATE.md` (configuración administrativa en Meta), `docs/WHATSAPP_CLOUD_API_STATUS.md` (estado técnico validado, número de prueba vs. real).

**Módulos de conocimiento** (normativos, contenido de negocio vivo, sin cambios en el programa CRM): `docs/productos.md` + `docs/productos/` (66 productos/13 categorías, completo); `docs/clientes/` (16 perfiles, completo); `docs/conversaciones/` (parcial, 80/20); `docs/objeciones/` (parcial, 4/9); `docs/proceso_de_venta/` (completo, incluye ahora `SPRINT_5_PROCESO_COMERCIAL.md` y sus derivados — `pago_y_pedido.md`, `seguimiento_postventa.md`, `recuperacion_de_compra.md`); `docs/agente_ia/` (completo).

---

## Cierre

Este documento se reestructuró por completo el 2026-08-14 para dejar de depender del historial de conversación como fuente de estado — instrucción permanente del propietario. Conserva íntegro el contenido histórico útil de su versión anterior (ahora en la sección "Historia — Fase de Fundación"), corrige las afirmaciones que habían quedado obsoletas por el programa CRM (notablemente, "Conversation Runtime: pendiente"), y añade las secciones exigidas por la instrucción permanente: Estado Actual, Estado de Fases, Decisiones Arquitectónicas Activas, Decisiones de Negocio, Integraciones Externas, Última Validación, Bloqueos Actuales, Siguiente Paso Autorizado, y el Procedimiento de Recuperación de Sesión.

Una conversación nueva puede retomar el proyecto usando únicamente: este repositorio, `docs/ARCHITECTURE_v1.md`, y este documento (`docs/PROJECT_STATE.md`).

**Actualización incremental (2026-08-14, mismo día, tras el cierre de la Fase Pre-Campaña):** este documento se actualizó puntualmente (no se reestructuró) para reflejar el cierre de `docs/FASE_PRECAMPANA_VALIDACION.md` — validación en vivo del motor async post-C.2B, auditoría de recursos comerciales contra Sprint 5, y confirmación del estado real de Mercado Pago. Ningún contenido histórico anterior fue reescrito ni eliminado; los cambios son aditivos (bloque "Estado Actual", tabla de fases, "Siguiente Paso Autorizado", lista de documentación normativa).
