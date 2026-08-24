# Fase C.1 — CRM Context Projection

[🏠 Índice de Documentación](./PROJECT_STATE.md)

> **Estado:** Implementado y validado con tests reales contra PostgreSQL 18.6 (63/63, incluidos los 46 de Fase B). Vive enteramente dentro de `crm/context/` — **no reemplaza `simulator/src/contextoStorage.js`** ni es importado todavía por ningún módulo de negocio. Esa integración es Fase C.2.
>
> Fuente de verdad de las decisiones que este documento aplica: [`CRM_FASE_A_DATA_MODEL.md`](./CRM_FASE_A_DATA_MODEL.md) (modelo de datos) y la auditoría de Fase C.0 (Preflight, entregada en el chat, no persistida como archivo — sus hallazgos de código real están reflejados aquí donde son relevantes).

---

## 1. Qué es

`crm/context/` es la pieza responsable de traducir entre el objeto de contexto plano de 33 campos (`simulator/src/flujoVentaReal.js#crearContextoConversacion()`) y las 8 tablas del CRM que le corresponden (`customers`, `customer_channels`, `conversations`, `opportunities`, `state_transitions`, `offers_log`, `follow_ups`, `handoffs`). No conoce `contextoStorage.js` ni ningún módulo de negocio — es información en un solo sentido: recibe/produce el mismo objeto plano, sin importar quién lo vaya a consumir.

## 2. API

Expuesta desde `crm/context/contextProjection.js` y re-exportada por `crm/index.js`:

| Función | Espejo de (futuro C.2) | Firma |
|---|---|---|
| `contextExists(id)` | `existeContexto` | `(id: string) => Promise<boolean>` |
| `projectContext(id)` | `recuperarContexto` | `(id: string) => Promise<Object\|null>` |
| `persistContext(id, contexto)` | `guardarContexto` | `(id: string, contexto: Object) => Promise<Object>` |
| `updateContext(id, cambios, crearVacio)` | `actualizarContexto` | `(id: string, cambios: Object, crearVacio?: () => Object) => Promise<Object>` |

Ninguna expone repositories individuales — igual que `crm/index.js` no expone el pool crudo. `crearVacio` se recibe **inyectado** (nunca importado), exactamente por la misma razón documentada en `contextoStorage.js` original: evitar que `crm/` dependa de la forma del contexto de negocio, que vive en `simulator/`.

## 3. Proyección de lectura (`assembleContext`, `crm/context/assemble.js`)

Resuelve `id` → `customer_channel` (por `tipo_canal='whatsapp'` + `identificador_externo=id`) → `customer` → `conversation` (la más reciente del canal, Decisión C1). Si el canal o la conversación no existen, devuelve `null` — nunca un objeto inventado, mismo comportamiento que `recuperarContexto` hoy.

Reúne después: la oportunidad activa de la conversación, la transición de estado más reciente, el mensaje entrante más reciente, el follow-up de recuperación vigente, y el handoff apuntado por `conversations.handoff_pendiente_id` — 8 consultas como máximo, todas de solo lectura.

## 4. Proyección de escritura (`disassembleContext`, `crm/context/disassemble.js`)

Recibe el contexto plano ya completo (mismo patrón que `guardarContexto` hoy: siempre el objeto entero, nunca un delta) y lo descompone en escrituras a las 8 tablas, en un orden fijo (customer/channel → conversation → state_transition → opportunity → offers_log → follow_up → handoff → mensaje). **Debe ejecutarse dentro de una transacción ya abierta** — no hace su propio `BEGIN`/`COMMIT`.

## 5. Mapeo campo por campo

| Campo | Origen/Destino | Regla aplicada |
|---|---|---|
| `id` | `customer_channels.identificador_externo` | Clave de lookup |
| `telefono` | — | Siempre `null` — nunca tuvo representación persistida (verificado: 0 asignaciones en el código real) |
| `nombre` | `customers.nombre` | Persistido; se actualiza si cambia |
| `productoId`, `paquete`, `cantidad`, `total`, `necesidadId` | `opportunities.*` | Persistidos tal cual; `opportunities` solo existe si `productoId` está presente |
| `intencionCompra` | `opportunities.intencion_compra` | **Normalizado en lectura**: la columna es `NOT NULL DEFAULT false`, pero el contexto original nunca produce `false` explícito (solo `null` o `true`) — se traduce `false`→`null` al leer, para no inventar un valor que el sistema original nunca generó |
| `resultado` | — | Siempre `null` — campo muerto, distinto de `resultadoRecuperacion` |
| `estado` | `conversations.estado_actual` + `state_transitions` (historial) | Cada cambio real produce una fila nueva; el mismo estado repetido no genera una transición nueva |
| `ultimaInteraccion` | `conversations.ultima_interaccion` | Gestionado server-side (`now()`) en cada escritura — equivalente funcional al `new Date().toISOString()` original |
| `ultimaIntencion`, `testimonioEnviado`, `precioEnviado`, `precioUtilizado`, `ofertaEnviada`, `cierreEnviado`, `cierreUtilizado` | `state_transitions.metadata` (JSONB) | **Sin columna dedicada en el schema aprobado** — se transportan como snapshot completo en la metadata de la transición de estado más reciente (ver §6) |
| `respuestaCliente` | `messages` (`direccion='entrante'`) | Decisión C2 (Opción A) — ver §7 |
| `fechaEntrega`, `seguimientoDia3Enviado`, `resultadoSeguimientoDia3`, `fechaSiguienteSeguimiento`, `estadoFinalSeguimiento` | — | Siempre valores por defecto — grupo de postventa sin código real que lo ejecute (instrucción explícita de esta fase) |
| `recuperacionPendiente`, `ramaRecuperacionEjecutada`, `resultadoRecuperacion` | `follow_ups` (tipo `recuperacion_dia5`) | Único grupo de seguimiento persistido |
| `fechaActivacionRecuperacion` | — | Siempre `null` — la lógica real calcula la fecha en tiempo de evaluación, nunca la persiste |
| `handoffPendiente`, `motivoHandoff`, `fechaHandoff` | `handoffs` + `conversations.handoff_pendiente_id` | Monótono — ver §8 |

## 6. Campos transportados en `state_transitions.metadata`

`ultimaIntencion`, `testimonioEnviado`, `precioEnviado`, `precioUtilizado`, `ofertaEnviada`, `cierreEnviado`, `cierreUtilizado` no tienen columna propia en el schema aprobado por Fase A/B, pero **sí son campos vivos** (se asignan en código real, verificado). Se decidió, en vez de dejarlos sin persistir (lo que rompería el round-trip de una capacidad que sí funciona hoy) o inventar columnas nuevas (prohibido en esta fase), usar la columna `metadata JSONB` que `state_transitions` ya tenía reservada exactamente para esto (comentario original de la migración: *"valor específico relevante a esa transición"*).

Justificación de que es seguro hacerlo así: se verificó contra el código real de `flujoVentaReal.js` que **los 7 campos siempre cambian en la misma llamada que también cambia `contexto.estado`** — nunca de forma aislada. Por eso basta con snapshotear su valor completo en cada transición nueva; no hace falta "acumular" entre transiciones.

**Limitación documentada:** si en el futuro algún código llegara a cambiar uno de estos 7 campos *sin* cambiar `estado` en la misma llamada, ese cambio no generaría una transición nueva (regla explícita: no crear transiciones si el estado no cambió) y por tanto no quedaría snapshoteado. No ocurre hoy — se documenta como límite de diseño, no como bug.

## 7. Mensajes — Decisión C2 (Opción A)

Solo se registra el mensaje **entrante** representado por `contexto.respuestaCliente`, como una fila en `messages` (`canal_message_id: null`, `timestamp: now()` del servidor — el wamid y el timestamp real de WhatsApp no están disponibles en el objeto de contexto plano hoy, y esta fase tiene instrucción explícita de no inventarlos). No se toca `whatsapp-adapter/`, `webhookParser.js`, `conversationRouter.js` ni `outboundBuilder.js`. Los mensajes salientes **no se capturan en esta fase** — quedan para una decisión posterior (Fase C.0 los llamó Decisión Pendiente #C2, Opción B).

En lectura, `respuestaCliente` se reconstruye como el texto del mensaje entrante más reciente de la conversación.

## 8. Handoff — comportamiento monótono replicado exactamente

Se verificó contra el código real: `contexto.handoffPendiente` **nunca vuelve a `false`** en ningún lugar de `flujoVentaReal.js` (0 asignaciones de `false` encontradas). La proyección replica esto exactamente: `handoffPendiente` se deriva como `!!conversations.handoff_pendiente_id` (presencia del puntero), **sin consultar `handoffs.resuelto_en`** — ese campo existe en el schema para una capacidad futura de resolución que todavía no está conectada a ningún flujo real (Fase B §9). Si se persiste un contexto con `handoffPendiente: false` sobre una conversación que ya tenía un handoff, no se limpia nada — inventar esa limpieza sería agregar una capacidad que el sistema original no tiene.

## 9. Transacciones

Toda escritura compuesta (`persistContext`, `updateContext`) ocurre dentro de una única transacción vía `crm/db/transaction.js#runInTransaction` — si cualquier paso falla, se revierte todo, incluidos los pasos anteriores ya ejecutados dentro de esa misma llamada (verificado con test real: una violación de `CHECK` en el paso 4 de 8 revierte también la creación del customer del paso 1).

## 10. Concurrencia e idempotencia

- **Lock:** `conversationRepository.findByIdForUpdate` (nueva, aditiva) bloquea la fila de `conversations` con `SELECT ... FOR UPDATE` — es el punto único de serialización. `updateContext` bloquea **antes** de leer el valor base para el merge (no después), para que dos llamadas concurrentes al mismo `id` nunca calculen su merge sobre un dato que ya quedó obsoleto por la otra.
- **No duplicación:** `customers`/`customer_channels` se apoyan en el `UNIQUE` ya existente de Fase B; `conversations` se reutiliza siempre que exista una para el canal (Decisión C1); `state_transitions`/`offers_log` comparan contra el último registro antes de insertar.
- **Límite documentado, no resuelto en esta fase:** la creación de un customer/channel **completamente nuevo** no tiene lock (no hay fila que bloquear todavía) — se apoya únicamente en el `UNIQUE (tipo_canal, identificador_externo)`, que evita la duplicación pero no evita que una transacción falle por conflicto si dos procesos crean el mismo canal exactamente a la vez. Ya estaba identificado como riesgo MEDIO en Fase C.0 y explícitamente fuera de alcance ("no inventar una nueva estrategia de idempotencia de webhook todavía").

## 11. Discrepancia encontrada y documentada (no resuelta por decisión propia)

`follow_ups.resultado` (CHECK aprobado en Fase A/B) solo permite `sin_respuesta`, `lo_voy_a_pensar`, `intencion_compra`, `duda_documentada`. El código real de `flujoVentaReal.js#procesarRespuestaRecuperacion` también puede producir `resultado.tipo = 'duda_no_autorizada'` o `'senal_medica'` como `resultadoRecuperacion` — ninguno de los dos está en el CHECK aprobado. Siguiendo la instrucción de esta fase ("si una contradicción impide implementar correctamente, documenta y no la implementes"), se optó por una mitigación acotada: cuando `resultadoRecuperacion` no es uno de los 4 valores permitidos, se persiste `resultado: null` en el follow-up (el cierre del seguimiento sí se registra, solo el detalle del resultado se pierde) — no se modificó el `CHECK` (prohibido explícitamente en esta fase). Verificado con test dedicado.

## 12. Limitaciones de esta fase

- No hay integración con `contextoStorage.js` — nada de esto se ejecuta todavía en producción.
- Mensajes salientes no se capturan (Decisión C2, Opción A).
- El grupo de postventa (día 3 / semana) no se persiste (sin código real que lo ejecute).
- `handoffs.fuente` queda siempre `null` por esta vía — el contexto plano no tiene un campo separado de "fuente" para el handoff, solo `motivoHandoff`.
- La creación de un customer/channel nuevo no está protegida por lock, solo por el `UNIQUE` de la base (§10).
- `disassembleContext` vuelve a bloquear la conversación con su propio `lockConversationIfExists` incluso cuando `updateContext` ya la bloqueó antes — redundante pero inofensivo (una transacción puede re-adquirir su propio `FOR UPDATE` sin bloquearse a sí misma).

## 13. Qué queda para Fase C.2

Reemplazar la implementación interna de `simulator/src/contextoStorage.js` para delegar en estas 4 funciones, preservando exactamente su contrato público (`existeContexto`, `recuperarContexto`, `guardarContexto`, `actualizarContexto`), y validar contra la suite existente (`contextoStorage.test.js`, `flujoVentaRealPersistente.test.js`) sin modificarla. Los tests que dependen del mecanismo de archivo (`whatsappAdapter.test.js` y partes de `httpServer.test.js`/`contextoStorage.test.js`, identificados en Fase C.0 §14) se actualizan después, en C.4/C.5 — no en C.2.

---
[🏠 Índice de Documentación](./PROJECT_STATE.md)
