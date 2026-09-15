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
 * Attribution real (Fase "Attribution + Reporting...", 2026-09-04) -- NUNCA
 * inferida de texto/nombre/conversación (ver identity.ts/attribution.ts en
 * hermes-kit: quien llama es responsable de solo pasar esto cuando existe
 * metadata real -- este repository no valida esa regla de negocio, solo
 * persiste lo que se le da, igual que el resto del CRM).
 * @typedef {{
 *   platform?: string|null, source?: string|null, medium?: string|null,
 *   campaign?: string|null, campaignId?: string|null,
 *   content?: string|null, contentId?: string|null,
 *   adId?: string|null, creativeId?: string|null,
 * }} Attribution
 */

/**
 * @param {{query: Function}} db
 * @param {{nombre?: string|null, email?: string|null, firstTouch?: Attribution|null}} [datos]
 * @returns {Promise<Object>} el customer creado
 */
export async function createCustomer(db, { nombre = null, email = null, firstTouch = null } = {}) {
  const customerId = randomUUID();
  const ft = firstTouch ?? {};
  const valores = [
    ft.platform ?? null, ft.source ?? null, ft.medium ?? null,
    ft.campaign ?? null, ft.campaignId ?? null,
    ft.content ?? null, ft.contentId ?? null,
    ft.adId ?? null, ft.creativeId ?? null,
  ];
  // firstTouchAt se calcula en JS (nunca en SQL vía CASE + IS NULL sobre los
  // mismos parámetros -- eso deja a Postgres sin forma de inferir el tipo
  // de esos parámetros, error real "no se pudo determinar el tipo del
  // parámetro" cuando ninguno se usa también en una comparación tipada).
  const hayAtribucionReal = valores.some((v) => v !== null);
  const { rows } = await db.query(
    `INSERT INTO customers (
       customer_id, nombre, email,
       first_touch_platform, first_touch_source, first_touch_medium,
       first_touch_campaign, first_touch_campaign_id,
       first_touch_content, first_touch_content_id,
       first_touch_ad_id, first_touch_creative_id, first_touch_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [customerId, nombre, email, ...valores, hayAtribucionReal ? new Date() : null]
  );
  return camelCaseRow(rows[0]);
}

/**
 * Actualiza el ÚLTIMO origen conocido real (last_touch) -- nunca toca
 * first_touch_* (permanente, ver createCustomer). Solo se llama cuando
 * existe una atribución real nueva; quien llama decide eso, este
 * repository solo persiste.
 *
 * @param {{query: Function}} db
 * @param {string} customerId
 * @param {Attribution} lastTouch
 * @returns {Promise<Object|null>}
 */
export async function updateLastTouch(db, customerId, lastTouch = {}) {
  const { rows } = await db.query(
    `UPDATE customers
     SET last_touch_platform = $2, last_touch_source = $3, last_touch_medium = $4,
         last_touch_campaign = $5, last_touch_campaign_id = $6,
         last_touch_content = $7, last_touch_content_id = $8,
         last_touch_ad_id = $9, last_touch_creative_id = $10,
         last_touch_at = now(), updated_at = now()
     WHERE customer_id = $1
     RETURNING *`,
    [
      customerId,
      lastTouch.platform ?? null, lastTouch.source ?? null, lastTouch.medium ?? null,
      lastTouch.campaign ?? null, lastTouch.campaignId ?? null,
      lastTouch.content ?? null, lastTouch.contentId ?? null,
      lastTouch.adId ?? null, lastTouch.creativeId ?? null,
    ]
  );
  return camelCaseRow(rows[0] ?? null);
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
