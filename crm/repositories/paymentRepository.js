// paymentRepository.js
// Acceso a datos de `payments` (Fase "Núcleo Comercial", 0006). Un pago
// nace SIEMPRE en 'pendiente' (DEFAULT del schema) -- confirmarlo o
// rechazarlo es una transición explícita, nunca implícita al insertarlo.
// La orquestación real (confirmar pago + venta + inventario de forma
// atómica) vive en crm/commerce/confirmarVenta.js; este archivo es solo la
// capa de datos.

import { randomUUID } from 'node:crypto';
import { camelCaseRow, camelCaseRows } from '../db/mapRow.js';

/**
 * @param {{query: Function}} db
 * @param {{
 *   orderId: string,
 *   metodo: string,
 *   importe: number,
 *   moneda?: string,
 *   referencia?: string|null,
 * }} datos
 * @returns {Promise<Object>}
 */
export async function insertPayment(db, { orderId, metodo, importe, moneda = 'MXN', referencia = null }) {
  const paymentId = randomUUID();
  const { rows } = await db.query(
    `INSERT INTO payments (payment_id, order_id, metodo, importe, moneda, referencia)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [paymentId, orderId, metodo, importe, moneda, referencia]
  );
  return camelCaseRow(rows[0]);
}

/**
 * @param {{query: Function}} db
 * @param {string} paymentId
 * @returns {Promise<Object|null>}
 */
export async function findById(db, paymentId) {
  const { rows } = await db.query('SELECT * FROM payments WHERE payment_id = $1', [paymentId]);
  return camelCaseRow(rows[0] ?? null);
}

/**
 * Lee el pago BLOQUEADO (SELECT ... FOR UPDATE) -- mismo patrón que
 * orderRepository.findByIdForUpdate. Debe llamarse dentro de una
 * transacción real.
 *
 * @param {{query: Function}} db
 * @param {string} paymentId
 * @returns {Promise<Object|null>}
 */
export async function findByIdForUpdate(db, paymentId) {
  const { rows } = await db.query('SELECT * FROM payments WHERE payment_id = $1 FOR UPDATE', [paymentId]);
  return camelCaseRow(rows[0] ?? null);
}

/**
 * @param {{query: Function}} db
 * @param {string} orderId
 * @returns {Promise<Object[]>}
 */
export async function findByOrderId(db, orderId) {
  const { rows } = await db.query('SELECT * FROM payments WHERE order_id = $1 ORDER BY creado_en ASC', [orderId]);
  return camelCaseRows(rows);
}

/**
 * Transición pendiente -> confirmado. WHERE estado = 'pendiente' es la
 * guarda real de idempotencia a nivel SQL, mismo criterio que
 * orderRepository.markConfirmed.
 *
 * @param {{query: Function}} db
 * @param {string} paymentId
 * @returns {Promise<Object|null>}
 */
export async function markConfirmed(db, paymentId) {
  const { rows } = await db.query(
    `UPDATE payments SET estado = 'confirmado', confirmado_en = now(), actualizado_en = now()
     WHERE payment_id = $1 AND estado = 'pendiente'
     RETURNING *`,
    [paymentId]
  );
  return camelCaseRow(rows[0] ?? null);
}

/**
 * Transición pendiente -> rechazado.
 *
 * @param {{query: Function}} db
 * @param {string} paymentId
 * @returns {Promise<Object|null>}
 */
export async function markRejected(db, paymentId) {
  const { rows } = await db.query(
    `UPDATE payments SET estado = 'rechazado', actualizado_en = now()
     WHERE payment_id = $1 AND estado = 'pendiente'
     RETURNING *`,
    [paymentId]
  );
  return camelCaseRow(rows[0] ?? null);
}
