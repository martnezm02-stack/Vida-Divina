// inventoryMovementRepository.js
// Acceso a datos de `inventory_movements` (Fase "Sistema de Inventario",
// 0005; extendido en la Fase "Núcleo Comercial", 0006). TABLA HISTÓRICA /
// APPEND-ONLY: solo `insertMovement` + lectura, ningún update/delete —
// mismo patrón que state_transitions/offers_log. `cantidad` es un entero
// con signo (positivo = entrada, negativo = salida); `inventory.cantidad_actual`
// (inventoryRepository.js) es la fuente de verdad del saldo actual, no se
// recalcula leyendo esta tabla en cada consulta — pero DEBE reconciliar
// con SUM(cantidad) de aquí (sumCantidadByProductoId sirve exactamente
// para verificar eso).
//
// `orderId` (0006): obligatorio cuando tipo='SALE', prohibido en cualquier
// otro caso -- impuesto por el CHECK real del schema
// (chk_inventory_movements_sale_tiene_order), no solo por convención de
// código. Es la trazabilidad real order -> movement -> producto/cantidad.

import { randomUUID } from 'node:crypto';
import { camelCaseRow, camelCaseRows } from '../db/mapRow.js';

/**
 * @param {{query: Function}} db
 * @param {{
 *   productoId: string,
 *   tipo: 'INITIAL_BALANCE'|'ADJUSTMENT'|'SALE',
 *   cantidad: number,
 *   timestamp: string|Date,
 *   motivo?: string|null,
 *   orderId?: string|null,
 * }} datos
 * @returns {Promise<Object>}
 */
export async function insertMovement(db, { productoId, tipo, cantidad, timestamp, motivo = null, orderId = null }) {
  const movementId = randomUUID();
  const { rows } = await db.query(
    `INSERT INTO inventory_movements (movement_id, producto_id, tipo, cantidad, "timestamp", motivo, order_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [movementId, productoId, tipo, cantidad, timestamp, motivo, orderId]
  );
  return camelCaseRow(rows[0]);
}

/**
 * Movimientos SALE de una orden dada -- la trazabilidad real order ->
 * movement/producto/cantidad que exige la Fase "Núcleo Comercial".
 *
 * @param {{query: Function}} db
 * @param {string} orderId
 * @returns {Promise<Object[]>}
 */
export async function listByOrderId(db, orderId) {
  const { rows } = await db.query(
    'SELECT * FROM inventory_movements WHERE order_id = $1 ORDER BY "timestamp" ASC',
    [orderId]
  );
  return camelCaseRows(rows);
}

/**
 * @param {{query: Function}} db
 * @param {string} productoId
 * @returns {Promise<Object[]>} orden cronológico ascendente
 */
export async function listByProductoId(db, productoId) {
  const { rows } = await db.query(
    'SELECT * FROM inventory_movements WHERE producto_id = $1 ORDER BY "timestamp" ASC',
    [productoId]
  );
  return camelCaseRows(rows);
}

/**
 * Suma real de todos los movimientos de un producto — debe coincidir con
 * inventory.cantidad_actual si ambas tablas están reconciliadas. Pensado
 * para validación/reporting, no para el camino caliente de lectura de
 * stock (ese es inventory.cantidad_actual).
 *
 * @param {{query: Function}} db
 * @param {string} productoId
 * @returns {Promise<number>}
 */
export async function sumCantidadByProductoId(db, productoId) {
  const { rows } = await db.query(
    'SELECT COALESCE(SUM(cantidad), 0)::int AS total FROM inventory_movements WHERE producto_id = $1',
    [productoId]
  );
  return rows[0].total;
}
