-- 0005_add_inventory.sql
-- FASE "Sistema de Inventario" (2026-09-15) — carga inicial real del conteo
-- físico de Vida Divina del 14/09/2026 (ver auditoría previa de mapeo de
-- inventario). Extiende `crm/` con dos tablas nuevas, mismo patrón que el
-- resto del schema (Decisión Arquitectónica #6/#12/#20 — única puerta de
-- acceso a PostgreSQL, migración aditiva, nunca destructiva).
--
-- Separación de responsabilidades (arquitectura ya recomendada en la
-- auditoría de inventario, ahora implementada):
--
--   product_pricing  -> precio de venta / promociones (Fase A §19, SIN CAMBIOS aquí)
--   inventory         -> estado ACTUAL del stock físico (fuente de verdad,
--                        se sobrescribe, mismo criterio que product_pricing:
--                        "no es historial")
--   inventory_movements -> bitácora histórica APPEND-ONLY de cómo se llegó
--                        a ese estado (mismo patrón que state_transitions/
--                        offers_log — solo INSERT + lectura, nunca UPDATE/DELETE)
--
-- No se duplica nada de product_pricing (precio, cantidad_base, promociones
-- siguen viviendo solo ahí) ni de Knowledge (nombre/descripción del
-- producto). `producto_id` es la misma referencia lógica ya usada en todo
-- el schema (product_pricing.producto_id, opportunities.producto_id) — TEXT,
-- sin FK física a Knowledge (vive fuera de PostgreSQL).
--
-- Decisiones de diseño:
--
-- (1) UUID de `inventory_movements` generado por la APLICACIÓN
--     (node:crypto randomUUID), mismo mecanismo que offers_log/
--     state_transitions — ver nota (1) de 0001_init_schema.sql.
--
-- (2) `inventory.producto_id` es PK propia (TEXT, sin surrogate UUID) —
--     mismo criterio que product_pricing.producto_id (0001, nota de
--     product_pricing): no hace falta relacionar filas de esta tabla entre
--     sí, solo por producto_id.
--
-- (3) `inventory_movements.producto_id` SÍ tiene FK física a
--     `inventory(producto_id)` (a diferencia de product_pricing.producto_id,
--     que referencia Knowledge fuera de Postgres) — inventory SÍ vive en
--     esta misma base, así que aquí sí se puede y se debe exigir
--     integridad referencial real: nunca puede existir un movimiento de un
--     producto sin fila de inventario.
--
-- (4) `inventory_movements.tipo` SÍ lleva CHECK (vocabulario cerrado
--     definido por esta fase, mismo criterio que follow_ups.tipo en 0001 —
--     a diferencia de opportunities.estado/conversations.estado_actual,
--     que son vocabularios vivos definidos en código): 'INITIAL_BALANCE'
--     (saldo inicial de carga), 'ADJUSTMENT' (ajuste sin causa de venta
--     confirmada — incluye las salidas físicas del conteo 2026-09-14,
--     cuya naturaleza NO está confirmada como venta) y 'SALE' (reservado
--     para cuando exista `orders` — ningún movimiento se crea con este
--     tipo todavía).
--
-- (5) `cantidad` es INTEGER con signo (positivo = entrada/incremento,
--     negativo = salida/decremento) en vez de un par entrada/salida — más
--     simple, y permite reconciliar `inventory.cantidad_actual` como
--     SUM(cantidad) de sus movimientos sin lógica adicional.
--
-- (6) NO se agrega columna `order_id` todavía (ni siquiera nullable sin
--     FK) — `orders` no existe y esta fase no la autoriza; agregarla ahora
--     sería diseñar para un requisito hipotético. Cuando `orders` se
--     autorice, esa fase agrega la columna vía ALTER TABLE aditivo, mismo
--     patrón que 0002/0003/0004.
--
-- (7) `costo_unitario`/`moneda_costo`/`costo_vigente_desde` viven en
--     `inventory`, NUNCA en `product_pricing` — son datos de costo de
--     adquisición (contables, cambian con el proveedor), no de precio de
--     venta (comercial, cambia con la estrategia) — dominios distintos,
--     mismo criterio que ya separa product_pricing del catálogo editorial.

-- =======================================================================
-- inventory — estado actual del stock físico por producto
-- =======================================================================
CREATE TABLE inventory (
  producto_id          TEXT PRIMARY KEY,
  cantidad_actual       INTEGER NOT NULL DEFAULT 0,
  minimo                INTEGER NULL CHECK (minimo IS NULL OR minimo >= 0),
  costo_unitario        NUMERIC(12, 2) NULL,
  moneda_costo          TEXT NULL,
  costo_vigente_desde   TIMESTAMPTZ NULL,
  actualizado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por       TEXT NULL
);

-- =======================================================================
-- inventory_movements — bitácora histórica append-only de entradas/salidas/ajustes
-- =======================================================================
CREATE TABLE inventory_movements (
  movement_id  UUID PRIMARY KEY,
  producto_id  TEXT NOT NULL REFERENCES inventory (producto_id)
                 ON DELETE RESTRICT ON UPDATE RESTRICT,
  tipo         TEXT NOT NULL CHECK (tipo IN ('INITIAL_BALANCE', 'ADJUSTMENT', 'SALE')),
  cantidad     INTEGER NOT NULL CHECK (cantidad <> 0),
  "timestamp"  TIMESTAMPTZ NOT NULL,
  motivo       TEXT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_inventory_movements_producto_timestamp
  ON inventory_movements (producto_id, "timestamp");
