// customerChannelRepository.js
// Acceso a datos de `customer_channels` (Fase A §7). Hoy el único
// tipo_canal aceptado por el schema es 'whatsapp' (CHECK constraint en
// 0001_init_schema.sql) — este repository no valida esa lista en JS
// además del CHECK de la base para no duplicar la regla en dos lugares;
// un tipo_canal no soportado simplemente falla en el INSERT con el error
// de PostgreSQL, que el llamador debe manejar.

import { randomUUID } from 'node:crypto';
import { camelCaseRow, camelCaseRows } from '../db/mapRow.js';

/**
 * @param {{query: Function}} db
 * @param {{customerId: string, tipoCanal: string, identificadorExterno: string, esPrimario?: boolean}} datos
 * @returns {Promise<Object>}
 */
export async function createCustomerChannel(db, { customerId, tipoCanal, identificadorExterno, esPrimario = true }) {
  const customerChannelId = randomUUID();
  const { rows } = await db.query(
    `INSERT INTO customer_channels (customer_channel_id, customer_id, tipo_canal, identificador_externo, es_primario)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [customerChannelId, customerId, tipoCanal, identificadorExterno, esPrimario]
  );
  return camelCaseRow(rows[0]);
}

/**
 * @param {{query: Function}} db
 * @param {string} tipoCanal
 * @param {string} identificadorExterno
 * @returns {Promise<Object|null>}
 */
export async function findByTipoAndIdentificador(db, tipoCanal, identificadorExterno) {
  const { rows } = await db.query(
    'SELECT * FROM customer_channels WHERE tipo_canal = $1 AND identificador_externo = $2',
    [tipoCanal, identificadorExterno]
  );
  return camelCaseRow(rows[0] ?? null);
}

/**
 * @param {{query: Function}} db
 * @param {string} customerChannelId
 * @returns {Promise<Object|null>}
 */
export async function findById(db, customerChannelId) {
  const { rows } = await db.query('SELECT * FROM customer_channels WHERE customer_channel_id = $1', [customerChannelId]);
  return camelCaseRow(rows[0] ?? null);
}

/**
 * @param {{query: Function}} db
 * @param {string} customerId
 * @returns {Promise<Object[]>}
 */
export async function listByCustomerId(db, customerId) {
  const { rows } = await db.query(
    'SELECT * FROM customer_channels WHERE customer_id = $1 ORDER BY created_at ASC',
    [customerId]
  );
  return camelCaseRows(rows);
}
