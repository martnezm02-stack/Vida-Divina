// orderRepository.js
// Acceso a datos de `orders`/`order_items` (Fase "Núcleo Comercial", 0006).
// `insertOrder` escribe la orden Y sus líneas en varias sentencias contra
// el mismo `db` recibido -- para que sea atómico (todo o nada) DEBE
// llamarse dentro de una transacción real. El punto de entrada sancionado
// para eso es crm.commerce.createOrder (crm/commerce/orders.js), que abre
// esa transacción por quien llama; este archivo es la capa de datos, no la
// orquestación.
//
// El precio de cada línea (`precio_unitario`) se recibe ya resuelto por
// quien llama -- este repository NUNCA consulta product_pricing por su
// cuenta: la orden es un snapshot histórico, no debe poder cambiar de
// valor si el precio de venta cambia después (Fase A/Decisión "no
// reconstruir una venta histórica consultando el precio actual").

import { randomUUID } from 'node:crypto';
import { camelCaseRow, camelCaseRows } from '../db/mapRow.js';

/**
 * @param {{query: Function}} db
 * @param {{
 *   customerId: string,
 *   opportunityId?: string|null,
 *   items: Array<{productoId: string, cantidad: number, precioUnitario: number}>,
 *   moneda?: string,
 * }} datos
 * @returns {Promise<{order: Object, items: Object[]}>}
 */
export async function insertOrder(db, { customerId, opportunityId = null, items, moneda = 'MXN' }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('orderRepository.insertOrder: "items" no puede estar vacío -- una orden sin líneas no es una venta real.');
  }

  const lineas = items.map((item) => {
    const subtotal = Number(item.precioUnitario) * Number(item.cantidad);
    return { ...item, subtotal };
  });
  const total = lineas.reduce((acc, l) => acc + l.subtotal, 0);

  const orderId = randomUUID();
  const { rows: orderRows } = await db.query(
    `INSERT INTO orders (order_id, customer_id, opportunity_id, total, moneda)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [orderId, customerId, opportunityId, total, moneda]
  );

  const itemsInsertados = [];
  for (const linea of lineas) {
    const orderItemId = randomUUID();
    const { rows } = await db.query(
      `INSERT INTO order_items (order_item_id, order_id, producto_id, cantidad, precio_unitario, subtotal)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [orderItemId, orderId, linea.productoId, linea.cantidad, linea.precioUnitario, linea.subtotal]
    );
    itemsInsertados.push(camelCaseRow(rows[0]));
  }

  return { order: camelCaseRow(orderRows[0]), items: itemsInsertados };
}

/**
 * @param {{query: Function}} db
 * @param {string} orderId
 * @returns {Promise<Object|null>}
 */
export async function findById(db, orderId) {
  const { rows } = await db.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
  return camelCaseRow(rows[0] ?? null);
}

/**
 * La orden más reciente de un cliente (Fase "Hermes Ventas", 2026-09-15) --
 * solo lectura, para que un consumidor (Hermes tras un HUMAN_HANDOFF) pueda
 * recuperar el pedido/pago en curso de esta conversación sin inventar un
 * segundo mecanismo de estado. No filtra por estado -- quien llama decide
 * qué hacer según `estado` (pendiente/confirmado/cancelado).
 *
 * @param {{query: Function}} db
 * @param {string} customerId
 * @returns {Promise<Object|null>}
 */
export async function findLatestByCustomerId(db, customerId) {
  const { rows } = await db.query(
    'SELECT * FROM orders WHERE customer_id = $1 ORDER BY creado_en DESC LIMIT 1',
    [customerId]
  );
  return camelCaseRow(rows[0] ?? null);
}

/**
 * Lee la orden BLOQUEADA (SELECT ... FOR UPDATE) -- punto único de
 * serialización para confirmaciones/cancelaciones concurrentes sobre la
 * misma orden, mismo patrón que conversationRepository.findByIdForUpdate.
 * Debe llamarse dentro de una transacción real.
 *
 * @param {{query: Function}} db
 * @param {string} orderId
 * @returns {Promise<Object|null>}
 */
export async function findByIdForUpdate(db, orderId) {
  const { rows } = await db.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
  return camelCaseRow(rows[0] ?? null);
}

/**
 * @param {{query: Function}} db
 * @param {string} orderId
 * @returns {Promise<Object[]>}
 */
export async function listItemsByOrderId(db, orderId) {
  const { rows } = await db.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at ASC', [orderId]);
  return camelCaseRows(rows);
}

/**
 * Transición pendiente -> confirmado. El WHERE estado = 'pendiente' es una
 * guarda real a nivel de SQL (no solo de aplicación): si la orden ya no
 * está pendiente, esto devuelve 0 filas (null) en vez de reconfirmar o
 * pisar un estado distinto -- segunda línea de defensa de idempotencia,
 * además del lock+chequeo explícito en crm/commerce/confirmarVenta.js.
 *
 * @param {{query: Function}} db
 * @param {string} orderId
 * @returns {Promise<Object|null>}
 */
export async function markConfirmed(db, orderId) {
  const { rows } = await db.query(
    `UPDATE orders SET estado = 'confirmado', confirmado_en = now(), actualizado_en = now()
     WHERE order_id = $1 AND estado = 'pendiente'
     RETURNING *`,
    [orderId]
  );
  return camelCaseRow(rows[0] ?? null);
}

/**
 * Transición pendiente -> cancelado. Solo alcanzable desde 'pendiente' --
 * una orden ya confirmada (con inventario ya descontado) requiere un flujo
 * de devolución, que esta fase no implementa.
 *
 * @param {{query: Function}} db
 * @param {string} orderId
 * @returns {Promise<Object|null>}
 */
export async function markCancelled(db, orderId) {
  const { rows } = await db.query(
    `UPDATE orders SET estado = 'cancelado', cancelado_en = now(), actualizado_en = now()
     WHERE order_id = $1 AND estado = 'pendiente'
     RETURNING *`,
    [orderId]
  );
  return camelCaseRow(rows[0] ?? null);
}
