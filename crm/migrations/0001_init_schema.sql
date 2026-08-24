-- 0001_init_schema.sql
-- Migración inicial del Core Data Store del CRM / Customer 360.
--
-- Fuente de verdad de este schema: docs/CRM_FASE_A_DATA_MODEL.md (Fase A,
-- secciones 6-18 y 22-24). Ninguna tabla ni campo de aquí fue inventado
-- fuera de esa especificación aprobada. orders y payments NO se crean en
-- esta migración — permanecen bloqueadas por decisión de negocio pendiente
-- (docs/proceso_de_venta/pago_y_pedido.md).
--
-- Decisiones de diseño que se citan en cada sección relevante:
--
-- (1) UUID generado por la APLICACIÓN, no por PostgreSQL. Todas las PK UUID
--     de este schema son "UUID PRIMARY KEY" sin DEFAULT — el valor lo
--     genera el repository correspondiente con node:crypto randomUUID(),
--     el mismo mecanismo que ya usa el proyecto (ver
--     viral-content-intelligence/src/contentOpportunity.js). Se evita así
--     depender de la extensión pgcrypto/uuid-ossp solo para generar
--     valores que la aplicación ya sabe generar sin dependencias nuevas.
--
-- (2) Las columnas "estado"/"estado_actual" (conversations.estado_actual,
--     opportunities.estado) son TEXT sin CHECK constraint. La lista de
--     valores válidos (ESTADOS_VENTA_REAL) vive en código
--     (simulator/src/stateMachine.js) — duplicarla aquí como CHECK habría
--     creado una segunda fuente de verdad que se desincroniza cada vez que
--     el motor comercial agregue un estado nuevo (violaría "no duplicar
--     información", CLAUDE.md). La validación de ese vocabulario es
--     responsabilidad de la capa de aplicación, no del schema.
--
-- (3) Los vocabularios de follow_ups (tipo/estado/resultado) SÍ llevan
--     CHECK: a diferencia de ESTADOS_VENTA_REAL, estos son un vocabulario
--     cerrado definido por la propia Fase A/Sprint 5
--     (SPRINT_5_PROCESO_COMERCIAL.md §16/§19-21), no un espejo de una
--     máquina de estados que vive y cambia en código.

-- =======================================================================
-- customers — Fase A §6
-- =======================================================================
CREATE TABLE customers (
  customer_id  UUID PRIMARY KEY,
  nombre       TEXT NULL,
  email        TEXT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =======================================================================
-- customer_channels — Fase A §7
-- Único tipo_canal habilitado hoy: 'whatsapp' (§10 de la Fase B — no crear
-- Instagram como registro ficticio). Agregar un canal nuevo en el futuro
-- es una migración posterior que reemplaza este CHECK, no un ALTER
-- retroactivo de esta migración.
-- =======================================================================
CREATE TABLE customer_channels (
  customer_channel_id  UUID PRIMARY KEY,
  customer_id          UUID NOT NULL REFERENCES customers (customer_id)
                          ON DELETE RESTRICT ON UPDATE RESTRICT,
  tipo_canal            TEXT NOT NULL CHECK (tipo_canal IN ('whatsapp')),
  identificador_externo TEXT NOT NULL,
  es_primario           BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_customer_channels_tipo_identificador
    UNIQUE (tipo_canal, identificador_externo)
);

-- =======================================================================
-- conversations — Fase A §8
--
-- Circularidad conversations <-> handoffs (Fase B §11): handoffs.conversation_id
-- referencia conversations, y conversations.handoff_pendiente_id referencia
-- handoffs — cada tabla necesita que la otra exista primero. Se resuelve
-- en dos pasos: aquí se declara handoff_pendiente_id como UUID NULL SIN
-- constraint de FK; la FK real se agrega más abajo con ALTER TABLE, una
-- vez que la tabla handoffs ya existe. No se inventa ninguna solución
-- alternativa (tabla puente, columna diferida, etc.) — es el patrón
-- estándar de PostgreSQL para referencias mutuas entre dos tablas.
-- =======================================================================
CREATE TABLE conversations (
  conversation_id       UUID PRIMARY KEY,
  customer_id           UUID NOT NULL REFERENCES customers (customer_id)
                           ON DELETE RESTRICT ON UPDATE RESTRICT,
  customer_channel_id   UUID NOT NULL REFERENCES customer_channels (customer_channel_id)
                           ON DELETE RESTRICT ON UPDATE RESTRICT,
  iniciado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_interaccion    TIMESTAMPTZ NOT NULL DEFAULT now(),
  estado_actual         TEXT NULL,
  wa_id_conversacion    TEXT NOT NULL,
  handoff_pendiente_id  UUID NULL, -- FK agregada más abajo, ver nota arriba
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_conversations_customer_id ON conversations (customer_id);
CREATE INDEX ix_conversations_ultima_interaccion ON conversations (ultima_interaccion);

-- =======================================================================
-- messages — Fase A §9
--
-- texto es NULLABLE a propósito: la política de retención/redacción de
-- mensajes es la Decisión Pendiente #5 de la Fase A (docs/CRM_FASE_A_DATA_MODEL.md
-- §21/§29) — todavía no aprobada por el propietario. Dejar el campo
-- nullable permite aplicar esa política después (ej. redactar o expirar
-- contenido) sin una migración de schema adicional. Esta migración NO
-- implementa ninguna política de retención — solo deja la columna lista.
--
-- Deduplicación (Fase B §12): índice único parcial sobre
-- (conversation_id, canal_message_id), activo solo cuando canal_message_id
-- no es NULL. canal_message_id es el id de mensaje de WhatsApp Cloud API
-- (wamid), ya globalmente único según la documentación de Meta citada en
-- whatsapp-adapter/src/webhookParser.js — escoparlo además por
-- conversation_id es más conservador y sigue siendo correcto (un
-- canal_message_id real nunca pertenece a más de una conversación).
-- Mensajes salientes sin canal_message_id (o históricos previos a este
-- campo) no participan de la restricción — puede haber múltiples NULL.
-- =======================================================================
CREATE TABLE messages (
  message_id       UUID PRIMARY KEY,
  conversation_id  UUID NOT NULL REFERENCES conversations (conversation_id)
                      ON DELETE RESTRICT ON UPDATE RESTRICT,
  direccion        TEXT NOT NULL CHECK (direccion IN ('entrante', 'saliente')),
  texto            TEXT NULL,
  canal_message_id TEXT NULL,
  "timestamp"      TIMESTAMPTZ NOT NULL,
  recurso_tipo     TEXT NULL,
  fuente_recurso   TEXT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_messages_conversation_timestamp ON messages (conversation_id, "timestamp");

CREATE UNIQUE INDEX ux_messages_conversation_canal_message_id
  ON messages (conversation_id, canal_message_id)
  WHERE canal_message_id IS NOT NULL;

-- =======================================================================
-- state_transitions — Fase A §11
-- Registra exclusivamente ESTADOS_VENTA_REAL (Sprint 5) — nunca el ESTADOS
-- genérico de simulator/src/stateMachine.js, que hoy no persiste datos de
-- cliente (ver justificación completa en Fase A §11).
-- =======================================================================
CREATE TABLE state_transitions (
  state_transition_id  UUID PRIMARY KEY,
  conversation_id       UUID NOT NULL REFERENCES conversations (conversation_id)
                           ON DELETE RESTRICT ON UPDATE RESTRICT,
  estado_anterior        TEXT NULL,
  estado_nuevo           TEXT NOT NULL,
  "timestamp"            TIMESTAMPTZ NOT NULL,
  fuente_funcion         TEXT NOT NULL,
  metadata               JSONB NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_state_transitions_conversation_timestamp
  ON state_transitions (conversation_id, "timestamp");

-- =======================================================================
-- opportunities — Fase A §12
-- Campos limitados estrictamente a los soportados hoy por el negocio — sin
-- probability/expected_value/close_date/lead_score/sales_rep/forecast
-- (Fase B §14, sin soporte real en SPRINT_5_PROCESO_COMERCIAL.md).
-- =======================================================================
CREATE TABLE opportunities (
  opportunity_id    UUID PRIMARY KEY,
  customer_id       UUID NOT NULL REFERENCES customers (customer_id)
                       ON DELETE RESTRICT ON UPDATE RESTRICT,
  conversation_id   UUID NOT NULL REFERENCES conversations (conversation_id)
                       ON DELETE RESTRICT ON UPDATE RESTRICT,
  producto_id       TEXT NOT NULL, -- referencia lógica a knowledge/compiled (no FK física, ver Fase A §19
  paquete           TEXT NULL,
  cantidad          INTEGER NULL CHECK (cantidad IS NULL OR cantidad > 0),
  total             NUMERIC(12, 2) NULL, -- NULL mientras no exista un precio real; nunca se inventa un valor
  intencion_compra  BOOLEAN NOT NULL DEFAULT false,
  estado            TEXT NOT NULL,
  necesidad_id      TEXT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_opportunities_customer_estado ON opportunities (customer_id, estado);

-- =======================================================================
-- offers_log — Fase A §13
-- Bitácora de qué oferta se usó, no catálogo de ofertas — la definición de
-- la oferta sigue viviendo en simulator/src/recursosComerciales.js y
-- docs/proceso_de_venta/recursos/ (Fase B §15).
-- =======================================================================
CREATE TABLE offers_log (
  offer_log_id     UUID PRIMARY KEY,
  opportunity_id   UUID NOT NULL REFERENCES opportunities (opportunity_id)
                      ON DELETE RESTRICT ON UPDATE RESTRICT,
  producto_id      TEXT NOT NULL,
  oferta_fuente    TEXT NOT NULL,
  enviada_en       TIMESTAMPTZ NOT NULL,
  snapshot_texto   TEXT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =======================================================================
-- follow_ups — Fase A §14
-- Solo los 3 tipos con proceso vigente confirmado (seguimiento_postventa.md,
-- recuperacion_de_compra.md) — el modelo de 5 escalones de seguimiento.md
-- está explícitamente marcado como no vigente y no se incluye.
-- =======================================================================
CREATE TABLE follow_ups (
  follow_up_id                  UUID PRIMARY KEY,
  conversation_id                UUID NOT NULL REFERENCES conversations (conversation_id)
                                    ON DELETE RESTRICT ON UPDATE RESTRICT,
  tipo                           TEXT NOT NULL
                                    CHECK (tipo IN ('postventa_dia3', 'postventa_semana', 'recuperacion_dia5')),
  fecha_programada                TIMESTAMPTZ NOT NULL,
  fecha_ejecutada                 TIMESTAMPTZ NULL,
  estado                          TEXT NOT NULL DEFAULT 'pendiente'
                                    CHECK (estado IN ('pendiente', 'ejecutado', 'cancelado')),
  motivo_cancelacion              TEXT NULL,
  resultado                       TEXT NULL
                                    CHECK (resultado IS NULL OR resultado IN
                                      ('sin_respuesta', 'lo_voy_a_pensar', 'intencion_compra', 'duda_documentada')),
  requiere_intervencion_humana    BOOLEAN NOT NULL DEFAULT false,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_follow_ups_fecha_estado ON follow_ups (fecha_programada, estado);

-- =======================================================================
-- handoffs — Fase A §15
-- Historial de escalamientos. resuelto_en/resuelto_por quedan NULL hasta
-- que exista un mecanismo de resolución (Fase A Decisión Pendiente #4,
-- Fase B §17 — no se inventa aquí ningún mecanismo automático).
-- =======================================================================
CREATE TABLE handoffs (
  handoff_id       UUID PRIMARY KEY,
  conversation_id  UUID NOT NULL REFERENCES conversations (conversation_id)
                      ON DELETE RESTRICT ON UPDATE RESTRICT,
  motivo           TEXT NOT NULL,
  fuente           TEXT NULL,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resuelto_en      TIMESTAMPTZ NULL,
  resuelto_por     TEXT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_handoffs_conversation_resuelto_en ON handoffs (conversation_id, resuelto_en);

-- Ahora que handoffs existe, se cierra la circularidad agregando la FK
-- diferida de conversations.handoff_pendiente_id (ver nota en la sección
-- de conversations, arriba). ON DELETE SET NULL porque este campo es un
-- puntero de estado ACTUAL (mutable), no un hecho histórico: si su
-- destino desapareciera, la conversación no debe volverse inconsistente,
-- solo perder la referencia al handoff vigente.
ALTER TABLE conversations
  ADD CONSTRAINT fk_conversations_handoff_pendiente
  FOREIGN KEY (handoff_pendiente_id) REFERENCES handoffs (handoff_id)
  ON DELETE SET NULL ON UPDATE RESTRICT;

-- =======================================================================
-- product_pricing — Fase A §19
-- Capa operativa de precio/stock, deliberadamente separada del catálogo
-- editorial (docs/productos/ -> knowledge/compiled/). No es historial: se
-- sobrescribe (Fase A §25) — producto_id es su propia PK, no hay
-- surrogate UUID porque no hace falta relacionar filas de esta tabla entre
-- sí, solo por producto_id.
-- =======================================================================
CREATE TABLE product_pricing (
  producto_id        TEXT PRIMARY KEY,
  precio             NUMERIC(12, 2) NULL,
  disponible_stock   BOOLEAN NULL,
  actualizado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por    TEXT NULL
);
