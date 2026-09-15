-- 0006_add_orders_payments.sql
-- FASE "Núcleo Comercial: orders -> payments -> SALE -> inventory"
-- (2026-09-15). Cierra el ciclo VENTA CONFIRMADA -> ORDER -> PAYMENT ->
-- SALE -> INVENTORY sobre la arquitectura ya validada (Decisión
-- Arquitectónica #6/#12/#20 — migración aditiva, única puerta de acceso a
-- PostgreSQL). No toca product_pricing, inventory, ni ninguna tabla
-- existente salvo la extensión aditiva descrita en (5) más abajo.
--
-- Decisiones de diseño:
--
-- (1) UUID generado por la aplicación (node:crypto randomUUID), mismo
--     mecanismo que el resto del schema — ver nota (1) de 0001_init_schema.sql.
--
-- (2) `orders.estado` y `payments.estado` SÍ llevan CHECK: son vocabularios
--     CERRADOS que esta misma fase define y cuyo único lugar de mutación es
--     el código de esta fase (crm/commerce/), no una máquina de estados que
--     vive y evoluciona en otro módulo — mismo criterio que follow_ups.tipo/
--     estado en 0001, a diferencia de opportunities.estado/
--     conversations.estado_actual (esos sí son código externo, sin CHECK).
--
-- (3) `orders.opportunity_id` es NULL-able: no toda orden nace de una
--     oportunidad rastreada (ej. una venta registrada manualmente) — nunca
--     se fuerza una relación que no está garantizada.
--
-- (4) `order_items.producto_id` es referencia lógica (TEXT, sin FK), mismo
--     criterio que product_pricing.producto_id/opportunities.producto_id:
--     el catálogo real vive fuera de PostgreSQL (Knowledge). NO tiene FK a
--     `inventory` tampoco — una orden puede incluir un producto sin fila de
--     inventory todavía (ej. recién agregado al catálogo); la confirmación
--     de venta (crm/commerce/confirmarVenta.js) es quien exige que exista
--     inventario suficiente en ese momento, no el schema de la orden.
--
-- (5) `inventory_movements.order_id` se agrega aquí vía ALTER TABLE
--     aditivo — exactamente como quedó documentado en la nota (6) de
--     0005_add_inventory.sql: "cuando orders se autorice, esa fase agrega
--     la columna". FK real a `orders` (ambas tablas viven en esta misma
--     base). El CHECK `(tipo = 'SALE') = (order_id IS NOT NULL)` impone la
--     trazabilidad exigida (order -> movement) sin permitir que un
--     ADJUSTMENT/INITIAL_BALANCE cargue una orden por error, ni que un SALE
--     quede sin ella.
--
-- (6) Índice único parcial `(order_id, producto_id) WHERE tipo = 'SALE'`:
--     segunda línea de defensa (además del lock + estado de la orden en
--     crm/commerce/confirmarVenta.js) contra un doble descuento de
--     inventario por el mismo producto de la misma orden — si algo
--     intentara insertar un SALE duplicado, PostgreSQL lo rechaza.
--
-- (7) `inventory.cantidad_actual >= 0` se agrega aquí como CHECK — no
--     existía en 0005 porque hasta ahora nada podía decrementar stock.
--     Ahora sí (confirmarVenta) — es la segunda línea de defensa real
--     contra stock negativo (la primera es el chequeo de suficiencia,
--     bajo lock, antes de decrementar). Aditivo y seguro: los 14 saldos
--     reales cargados hoy son todos >= 0.
--
-- (8) `payments.metodo` es TEXT libre, sin CHECK — mismo criterio que
--     platform/source/medium en 0003: el vocabulario real de métodos de
--     pago (transferencia, efectivo, etc.) es una decisión de negocio que
--     vive fuera del schema, no se inventa aquí un catálogo cerrado.

-- =======================================================================
-- orders
-- =======================================================================
CREATE TABLE orders (
  order_id        UUID PRIMARY KEY,
  customer_id     UUID NOT NULL REFERENCES customers (customer_id)
                    ON DELETE RESTRICT ON UPDATE RESTRICT,
  opportunity_id  UUID NULL REFERENCES opportunities (opportunity_id)
                    ON DELETE RESTRICT ON UPDATE RESTRICT,
  estado          TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'confirmado', 'cancelado')),
  total           NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
  moneda          TEXT NOT NULL DEFAULT 'MXN',
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmado_en   TIMESTAMPTZ NULL,
  cancelado_en    TIMESTAMPTZ NULL
);

CREATE INDEX ix_orders_customer_id ON orders (customer_id);
CREATE INDEX ix_orders_estado ON orders (estado);

-- =======================================================================
-- order_items — líneas de la orden, precio SIEMPRE congelado al momento de
-- la venta (nunca se recalcula consultando product_pricing después).
-- =======================================================================
CREATE TABLE order_items (
  order_item_id    UUID PRIMARY KEY,
  order_id         UUID NOT NULL REFERENCES orders (order_id)
                      ON DELETE RESTRICT ON UPDATE RESTRICT,
  producto_id      TEXT NOT NULL,
  cantidad         INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario  NUMERIC(12, 2) NOT NULL CHECK (precio_unitario >= 0),
  subtotal         NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_order_items_order_id ON order_items (order_id);

-- =======================================================================
-- payments
-- =======================================================================
CREATE TABLE payments (
  payment_id      UUID PRIMARY KEY,
  order_id        UUID NOT NULL REFERENCES orders (order_id)
                    ON DELETE RESTRICT ON UPDATE RESTRICT,
  metodo          TEXT NOT NULL,
  importe         NUMERIC(12, 2) NOT NULL CHECK (importe >= 0),
  moneda          TEXT NOT NULL DEFAULT 'MXN',
  estado          TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'confirmado', 'rechazado', 'cancelado')),
  referencia      TEXT NULL,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmado_en   TIMESTAMPTZ NULL
);

CREATE INDEX ix_payments_order_id ON payments (order_id);

-- =======================================================================
-- Extensión aditiva de inventory_movements (0005) — trazabilidad SALE -> order
-- =======================================================================
ALTER TABLE inventory_movements
  ADD COLUMN order_id UUID NULL REFERENCES orders (order_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE inventory_movements
  ADD CONSTRAINT chk_inventory_movements_sale_tiene_order
  CHECK ((tipo = 'SALE') = (order_id IS NOT NULL));

CREATE INDEX ix_inventory_movements_order_id ON inventory_movements (order_id);

CREATE UNIQUE INDEX ux_inventory_movements_order_producto_sale
  ON inventory_movements (order_id, producto_id)
  WHERE tipo = 'SALE';

-- =======================================================================
-- Extensión aditiva de inventory (0005) — nunca stock negativo
-- =======================================================================
ALTER TABLE inventory
  ADD CONSTRAINT chk_inventory_cantidad_no_negativa CHECK (cantidad_actual >= 0);
