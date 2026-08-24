# FASE A — CRM Customer 360 Data Model

[🏠 Índice de Documentación](./PROJECT_STATE.md)

> **Estado:** Aprobado por el propietario del proyecto. Es la especificación funcional y arquitectónica que la Fase B (`crm/`, Core Data Store sobre PostgreSQL — ver [`CRM_FASE_B_POSTGRESQL.md`](./CRM_FASE_B_POSTGRESQL.md)) implementa. Documento histórico de diseño — no se actualiza hacia adelante salvo que se reabra formalmente una revisión de este modelo (mismo criterio que `docs/ARCHITECTURE_v1.md` §13 aplica a sus propias decisiones congeladas).
>
> Este documento no repite el detalle de la auditoría previa del proyecto (persistencia actual, entidades existentes, riesgos de arquitectura, propuesta inicial de PostgreSQL) — esa auditoría fue la base de este modelo pero no forma parte del documento en sí.

---

## 1. Objetivo

Formalizar el modelo de datos conceptual y lógico del futuro CRM/Customer 360 de Vida Divina, resolviendo la brecha identificada en la auditoría previa: el sistema actual persiste **estado actual** (`contexto` mutable, 1 archivo por cliente) y necesita evolucionar hacia **historial de eventos** (timeline reconstruible). Este documento no implementa nada — es la especificación que una fase posterior debe poder seguir sin improvisar entidades.

Toda entidad y campo propuestos abajo están justificados contra: código real (`simulator/`, `whatsapp-adapter/`, `decision-engine/`, `recommendation-engine/`), documentación de proceso (`docs/proceso_de_venta/`, `SPRINT_5_PROCESO_COMERCIAL.md`), y reglas de memoria/minimización (`docs/agente_ia/memoria.md`). Donde el negocio no ha decidido algo, se marca **DECISIÓN PENDIENTE** en vez de inventarse.

---

## 2. Principios arquitectónicos

1. **CRM → Repository/DAL → PostgreSQL.** Ningún módulo de negocio (`simulator`, `decision-engine`, `whatsapp-adapter`) importa `pg` directamente. `crm/` es la única puerta.
2. **Una fuente de verdad por hecho, nunca duplicada.** El timeline se deriva por unión de tablas especializadas (mensajes, transiciones, ofertas, pedidos, handoffs) — no existe una tabla `events`/`timeline` genérica que copie lo que ya vive en otro lugar.
3. **`docs/` y `knowledge/` siguen siendo la fuente de verdad de producto/perfil.** El CRM referencia `producto_id`/`perfil_id` por su clave natural existente (ej. `productos/01-control-de-peso/atom-capsules`) — nunca copia la ficha completa del producto a Postgres.
4. **Compatibilidad de contrato, no de mecanismo.** `contextoStorage.js` (`existeContexto`, `recuperarContexto`, `guardarContexto`, `actualizarContexto`) es la interfaz que `simulator/`, `decision-engine/` y `whatsapp-adapter/` ya conocen. El CRM debe poder implementarse **detrás** de esa interfaz sin tocar a sus consumidores.
5. **Minimización por diseño**, no como capa añadida — cada tabla declara explícitamente qué retiene y por qué, conforme a `docs/agente_ia/memoria.md`.
6. **No inventar lo que el negocio no ha decidido.** Pago/Pedido tienen decisión de negocio pendiente ([`pago_y_pedido.md`](./proceso_de_venta/pago_y_pedido.md)) — el modelo los propone pero los marca bloqueados.

---

## 3. Entidades existentes vs nuevas

| Entidad | Veredicto | Justificación |
|---|---|---|
| `customers` | **A — Debe existir** | Hoy solo existe como `{id, telefono, nombre}` dentro de `contexto` (`flujoVentaReal.js:73-82`). Nunca se popula `telefono`/`nombre` en código. |
| `customer_channels` | **A — Debe existir** | Hoy solo hay 1 canal implícito (`wa_id`). Instagram no es canal de atención a clientes hoy (`instagramPublicationAdapter.js` publica contenido, no atiende clientes). |
| `conversations` | **A — Debe existir, separada de `messages`** | Hoy `contexto` mezcla conversación + oportunidad + postventa + handoff en un solo blob. |
| `messages` | **A — Debe existir (entidad nueva)** | Hoy solo se retiene el último mensaje (`contexto.respuestaCliente`, sobrescrito). Con salvedad de minimización — ver §21. |
| `activities` | **E — No debe existir como entidad independiente** | Todo lo que calificaría como "actividad" ya lo cubre `messages`, `state_transitions`, `offers_log`, `follow_ups` o `handoffs`. |
| `state_transitions` | **A — Debe existir** | Hoy solo se guarda el estado vigente (`contexto.estado`, sobrescrito). Registra `ESTADOS_VENTA_REAL` — ver §11. |
| `opportunities` | **A — Debe existir, acotada a campos ya soportados** | Campos reales en `contexto`: `productoId, paquete, cantidad, total, intencionCompra, resultado`. |
| `offers_log` | **A — Debe existir como bitácora, no como definición** | La definición de la oferta sigue viviendo en `recursosComerciales.js`/`docs/proceso_de_venta/recursos/`. |
| `follow_ups` | **A — Debe existir (datos, no scheduler)** | `contexto` ya tiene campos sueltos (`seguimientoDia3Enviado`, `fechaSiguienteSeguimiento`) que deben formalizarse como filas. |
| `handoffs` | **A — Debe existir como historial**, además del puntero vigente | Hoy `handoffPendiente/motivoHandoff/fechaHandoff` solo representan el handoff actual. |
| `orders` | **D — Espera decisión de negocio** | `pago_y_pedido.md:7` difiere explícitamente esta decisión. Propuesta preliminar marcada **BLOQUEADO**. |
| `payments` | **D — Espera decisión de negocio**, con restricciones de minimización no negociables | Mismo bloqueo que `orders`, más `memoria.md:18`. |
| `post_sale` / `customer_service` | **B — Se combina con `follow_ups` + `handoffs`** | Verificado contra `seguimiento_postventa.md`: el "primer seguimiento día 3" **es** un follow-up cuya respuesta *siempre* se escala a humano. Venta cruzada/testimonio/referido están confirmados no vigentes. |

---

## 4. Modelo conceptual

```
Customer
  │
  ├── CustomerChannel (1:N)              → identidad multicanal
  │
  └── Conversation (1:N)                  → una sesión de atención
        │
        ├── Message (1:N)                 → entrante/saliente
        ├── StateTransition (1:N)         → historial de ESTADOS_VENTA_REAL
        ├── Handoff (1:N)                 → historial de escalamientos
        │
        └── Opportunity (0:N)             → intención de compra activa
              │
              ├── OfferLog (1:N)          → qué oferta se usó
              ├── FollowUp (0:N)          → seguimientos programados
              └── Order (0:1) [BLOQUEADO] → pedido
                    │
                    └── Payment (0:N) [BLOQUEADO]
```

`Product` no es una entidad del CRM — es una referencia externa a `knowledge/compiled/entities.json` (tipo `producto`), citada por su `id` natural (ej. `productos/01-control-de-peso/atom-capsules`).

---

## 5. Modelo lógico

- Toda clave primaria es un `UUID` generado por la aplicación (`node:crypto randomUUID()`), excepto donde se indique lo contrario (`product_pricing`, cuya PK es `producto_id`).
- Toda tabla de historial (`messages`, `state_transitions`, `offers_log`, `handoffs`) es **append-only** a nivel de intención de diseño.
- `conversations` y `opportunities` son las únicas tablas verdaderamente mutables (representan "estado actual"), y su valor vigente debe ser siempre reconstruible a partir del historial.

---

## 6. Customer

**Qué constituye un Customer en Vida Divina:** la persona identificada de forma estable por al menos un canal externo (hoy, exclusivamente `wa_id` de WhatsApp). El primer mensaje entrante *es* la creación del customer.

| Dimensión | Campos | Justificación |
|---|---|---|
| **IDENTIDAD** | `customer_id` (interno), canal(es) en `customer_channels` | Lo único que existe con certeza desde el primer contacto |
| **PERFIL** (opcional) | `nombre`, `email` | `nombre` existe como placeholder en `contexto` (`flujoVentaReal.js:81`) pero ningún código lo asigna nunca. `email` no aparece en ningún flujo documentado. |
| **DATOS DE ENTREGA** | nombre, dirección, código postal, ciudad, estado | Se capturan **por pedido** (`pago_y_pedido.md §4`), no como atributo permanente — viven en `orders`, no en `customers`. |
| **ESTADO COMERCIAL** | *no vive en `customers`* | Mutable, depende de la conversación activa — vive en `conversations.estado_actual`. |
| **METADATA DEL REGISTRO** | `created_at`, `updated_at` | — |
| **DATOS TRANSITORIOS** | *nunca en `customers`* | Detalles médicos, contenido de mensajes — ver §21 |

**Decisión Pendiente #1:** ¿el nombre/dirección del primer pedido se promueven a atributo permanente del customer, o quedan siempre ligados solo al pedido? No resuelto por el código actual.

---

## 7. Customer Channels

- `customer_channel_id`, `customer_id` (FK), `tipo_canal` (`whatsapp` | futuro), `identificador_externo`, `es_primario`, `created_at`.
- `(tipo_canal, identificador_externo)` único.
- Hoy existiría exactamente 1 fila por customer (`whatsapp`). Instagram no se modela porque `instagramPublicationAdapter.js` publica contenido de marketing, no atiende clientes.

---

## 8. Conversations

`conversations` representa la sesión, **no** el estado acumulado de venta+postventa+handoff (separado en tablas propias referenciadas por `conversation_id`).

| Campo | Justificación |
|---|---|
| `conversation_id` | — |
| `customer_id` (FK) | — |
| `customer_channel_id` (FK) | de qué canal vino |
| `iniciado_en` | primera vez que se llamó `abrirContexto` |
| `ultima_interaccion` | ya existe hoy (`contexto.ultimaInteraccion`) |
| `estado_actual` | puntero al último valor de `ESTADOS_VENTA_REAL` — ver §11 |
| `wa_id_conversacion` | identificador externo estable |

**Qué NO va aquí:** el mensaje en sí (→ `messages`), la oportunidad (→ `opportunities`), el handoff (→ `handoffs`).

---

## 9. Messages

| Campo | Justificación |
|---|---|
| `message_id` | — |
| `conversation_id` (FK) | — |
| `direccion` (`entrante`/`saliente`) | — |
| `texto` | Contenido — **sujeto a la salvedad de minimización de §21** |
| `canal_message_id` | `messages[0].id` de Meta — permite deduplicar reintentos de webhook |
| `timestamp` | `mensaje.timestamp` del payload de Meta |
| `recurso_tipo` (nullable) | tipo de recurso estructurado saliente (`texto`/`audio`/`oferta`/`cierre`/`objecion_documentada`) |
| `fuente_recurso` (nullable) | cita de fuente ya producida por `outboundBuilder.js` |

**Decisión Pendiente #2:** hoy el sistema no registra en ninguna forma los mensajes salientes reales enviados — es una capacidad nueva.

---

## 10. Activities / Timeline

No se crea una tabla `activities`. El timeline (para Customer 360, §20) es una **proyección de lectura** (`UNION ALL` ordenado por timestamp) sobre `messages`, `state_transitions`, `offers_log`, `follow_ups`, `handoffs`, `orders` — nunca una copia.

---

## 11. State Transitions

**Dos state machines, verificadas contra código:**

| | `ESTADOS` (genérico, 10 estados) | `ESTADOS_VENTA_REAL` (Sprint 5, 24 estados) |
|---|---|---|
| Definido en | `stateMachine.js:17-78` | `stateMachine.js:97-123` |
| Usado por | Únicamente `simulator/src/simulator.js` | Únicamente `simulator/src/flujoVentaReal.js` |
| Conectado a persistencia | No | Sí — `data/conversaciones/<id>.json` |
| Conectado a WhatsApp | No | Sí — `conversationRouter.js` |
| Conectado a `decision-engine`/`recommendation-engine` | Sí | No |

**Decisión para el CRM:** `state_transitions` registra **exclusivamente `ESTADOS_VENTA_REAL`** — es el único de los dos que corresponde a una conversación real y persistida de un cliente.

| Campo | Justificación |
|---|---|
| `state_transition_id` | — |
| `conversation_id` (FK) | — |
| `estado_anterior` (nullable) | — |
| `estado_nuevo` | valor de `ESTADOS_VENTA_REAL.id` |
| `timestamp` | — |
| `fuente_funcion` | qué función `*Persistente` la produjo |
| `metadata` (JSONB, opcional) | valor específico relevante a esa transición |

**Decisión Pendiente #3:** si en una fase posterior se integra `decision-engine` al motor real, habrá que decidir si `ESTADOS` genérico también empieza a persistirse. No decidido aquí.

---

## 12. Opportunities

Distinción Customer / Opportunity / Offer / Order. Campos realmente soportados hoy:

| Campo | Estado real en el código |
|---|---|
| `producto_id` | Referencia a `knowledge/compiled` — string natural |
| `paquete` | Reservado, sin lógica real detrás todavía |
| `cantidad` | Poblado por `extraerCantidad()` |
| `total` | Siempre bloqueado hoy — `obtenerPrecioProducto()` siempre `disponible:false` |
| `intencion_compra` | Booleano |
| `estado` | Espejo del estado de la conversación en el momento |
| `necesidad_id` | de las 4 documentadas |

No se agregan `probability`, `expected_value`, `close_date`, `lead_score`, `sales_rep`, `forecast`.

---

## 13. Offers

| Campo | Justificación |
|---|---|
| `offer_log_id` | — |
| `opportunity_id` (FK) | — |
| `producto_id` | a qué producto aplicaba |
| `oferta_fuente` | cita de fuente |
| `enviada_en` | timestamp |
| `resultado` (nullable) | se deriva de la siguiente transición de estado, no se duplica |

No se copia el texto completo de la oferta como obligatorio — se referencia por fuente (`snapshot_texto` opcional para auditoría puntual).

---

## 14. Follow-ups

| Campo | Justificación |
|---|---|
| `follow_up_id` | — |
| `conversation_id` (FK) | — |
| `tipo` | `postventa_dia3` \| `postventa_semana` \| `recuperacion_dia5` — los únicos tres con proceso vigente confirmado |
| `fecha_programada` | Para postventa: desde la **entrega**. Para recuperación: +5 días desde `ultima_interaccion`. |
| `fecha_ejecutada` (nullable) | — |
| `estado` | `pendiente` \| `ejecutado` \| `cancelado` |
| `motivo_cancelacion` (nullable) | — |
| `resultado` (nullable) | `sin_respuesta` \| `lo_voy_a_pensar` \| `intencion_compra` \| `duda_documentada` |
| `requiere_intervencion_humana` | `true` siempre para `postventa_dia3` |

---

## 15. Handoffs

| Campo | Justificación |
|---|---|
| `handoff_id` | — |
| `conversation_id` (FK) | — |
| `motivo` | texto ya producido por `requiereHandoffHumano()` |
| `fuente` | cita de fuente |
| `creado_en` | — |
| `resuelto_en` (nullable) | cuándo un humano retomó |
| `resuelto_por` (nullable) | quién |

**Decisión Pendiente #4:** no existe hoy ningún mecanismo técnico que marque un handoff como resuelto — vacío de proceso real, no solo de esquema.

---

## 16. Orders

**BLOQUEADO POR DECISIÓN DE NEGOCIO** — `pago_y_pedido.md:7`.

Propuesta preliminar: `order_id`, `opportunity_id` (FK), `customer_id` (FK), `producto_id`/`paquete`/`cantidad`/`total`, `nombre_entrega`/`direccion`/`codigo_postal`/`ciudad`/`estado_direccion`, `medio_pago` (`establecimiento_transferencia` \| `mercado_pago`), `estado`, `paqueteria` (nullable).

---

## 17. Payments

**BLOQUEADO POR DECISIÓN DE NEGOCIO.** Nunca se almacena número de tarjeta, CVV, datos bancarios ni comprobantes crudos.

Propuesta preliminar: `payment_id`, `order_id` (FK), `metodo`, `estado`, `referencia_externa` (nullable), `validado_por` (nullable), `validado_en` (nullable).

---

## 18. Post-sale

**B — se combina** con `follow_ups` + `handoffs` (§3). Venta cruzada/testimonio/referido no forman parte del proceso postventa actual confirmado — no se modela entidad para algo que el negocio no ejecuta hoy.

---

## 19. Products / Knowledge relationship

`producto_id` en toda tabla del CRM es el `id` string ya existente en `knowledge/compiled/entities.json` (ej. `productos/01-control-de-peso/atom-capsules`). El CRM no copia ficha de producto.

**`product_pricing`** — separado del conocimiento editorial: `producto_id` (PK), `precio` (nullable), `disponible_stock` (nullable), `actualizado_en`, `actualizado_por`.

---

## 20. Customer 360

`getCustomer360(customerId)` es una **agregación de lectura**, nunca una tabla nueva — join de `customers` + `customer_channels` + `conversations` (+ `messages`, `state_transitions`, `handoffs`) + `opportunities` (+ `offers_log`, `follow_ups`, `orders` cuando exista).

---

## 21. Data minimization

| Regla de `memoria.md` | Aplicación al modelo |
|---|---|
| "Detalles médicos específicos... no se guardan como parte del perfil" | `customers` nunca tiene campos médicos. `messages.texto` puede contener texto médico si el cliente lo escribe — ver Decisión Pendiente #5. |
| "Datos de pago... no son responsabilidad de la memoria conversacional del agente" | `payments` nunca almacena datos crudos. |
| "Cualquier dato personal que no sea estrictamente necesario... no debe retenerse sin propósito" | `nombre`/`dirección` viven en `orders`, no en `customers`. |
| "Memoria funcional a la conversación, nunca memoria acumulativa sin propósito" | Aplica al *razonamiento* del agente — `memoria.md` no autorizó explícitamente retención permanente de mensajes. |

**Decisión Pendiente #5 — la más importante:** ¿se almacena el texto completo de cada mensaje indefinidamente, o con expiración/redacción de contenido médico detectado? No resuelto — `messages.texto` se diseña **nullable** para permitir aplicar una política después sin migración de schema adicional.

---

## 22-32. Resto del modelo

El detalle de propuesta de tablas PostgreSQL, relaciones, estrategia de índices, retención, compatibilidad con `contextoStorage.js`, estrategia de migración, la Decisión Arquitectónica #6 (regla "Node.js sin dependencias externas"), decisiones de negocio abiertas, riesgos, estrategia de pruebas y recomendación final de esta fase están desarrollados en las secciones 22-32 originales de este documento y se implementan en la Fase B — ver [`CRM_FASE_B_POSTGRESQL.md`](./CRM_FASE_B_POSTGRESQL.md) para el resultado concreto de esa implementación (schema real, decisiones aplicadas, discrepancias encontradas).

---
[🏠 Índice de Documentación](./PROJECT_STATE.md)
