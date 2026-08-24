// customerRepository.js
// Acceso a datos de `customers` (Fase A §6). SQL parametrizado en todos
// los casos — nunca interpolación de strings. Cada función recibe `db`
// como primer argumento (un pg.Pool o un pg.PoolClient dentro de una
// transacción — ambos exponen `.query(text, params)`), para que
// crm/index.js pueda componer varias llamadas en una sola transacción sin
// que este archivo sepa nada de transacciones.

import { randomUUID } from 'node:crypto';
import { camelCaseRow } from '../db/mapRow.js';

/**
 * @param {{query: Function}} db
 * @param {{nombre?: string|null, email?: string|null}} [datos]
 * @returns {Promise<Object>} el customer creado
 */
export async function createCustomer(db, { nombre = null, email = null } = {}) {
  const customerId = randomUUID();
  const { rows } = await db.query(
    `INSERT INTO customers (customer_id, nombre, email)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [customerId, nombre, email]
  );
  return camelCaseRow(rows[0]);
}

/**
 * @param {{query: Function}} db
 * @param {string} customerId
 * @returns {Promise<Object|null>}
 */
export async function findCustomerById(db, customerId) {
  const { rows } = await db.query('SELECT * FROM customers WHERE customer_id = $1', [customerId]);
  return camelCaseRow(rows[0] ?? null);
}

/**
 * Encuentra el customer dueño de un canal externo dado (ej. un wa_id de
 * WhatsApp) — es el lookup que un futuro adaptador usaría para resolver
 * "a qué customer pertenece este mensaje entrante".
 *
 * @param {{query: Function}} db
 * @param {string} tipoCanal
 * @param {string} identificadorExterno
 * @returns {Promise<Object|null>}
 */
export async function findCustomerByChannel(db, tipoCanal, identificadorExterno) {
  const { rows } = await db.query(
    `SELECT c.*
     FROM customers c
     JOIN customer_channels ch ON ch.customer_id = c.customer_id
     WHERE ch.tipo_canal = $1 AND ch.identificador_externo = $2`,
    [tipoCanal, identificadorExterno]
  );
  return camelCaseRow(rows[0] ?? null);
}

/**
 * Actualiza los únicos dos atributos de perfil aprobados (nombre, email).
 * `customers` es identidad mutable (no historial) — a diferencia de
 * messages/state_transitions/offers_log/handoffs, sí expone update.
 *
 * @param {{query: Function}} db
 * @param {string} customerId
 * @param {{nombre?: string|null, email?: string|null}} cambios
 * @returns {Promise<Object|null>}
 */
export async function updateCustomerProfile(db, customerId, { nombre, email } = {}) {
  const { rows } = await db.query(
    `UPDATE customers
     SET nombre = COALESCE($2, nombre),
         email = COALESCE($3, email),
         updated_at = now()
     WHERE customer_id = $1
     RETURNING *`,
    [customerId, nombre ?? null, email ?? null]
  );
  return camelCaseRow(rows[0] ?? null);
}
