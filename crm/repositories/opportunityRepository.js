// opportunityRepository.js
// Acceso a datos de `opportunities` (Fase A §12). Es "estado actual", no
// historial — sí expone update (a diferencia de messages/state_transitions
// /offers_log/handoffs). Campos limitados a los realmente soportados por
// el negocio hoy: no existen probability/expected_value/close_date/
// lead_score/sales_rep/forecast (Fase B §14) y este repository no los
// acepta ni los inventa.

import { randomUUID } from 'node:crypto';
import { camelCaseRow, camelCaseRows } from '../db/mapRow.js';

/**
 * @param {{query: Function}} db
 * @param {{
 *   customerId: string,
 *   conversationId: string,
 *   productoId: string,
 *   paquete?: string|null,
 *   cantidad?: number|null,
 *   total?: number|null,
 *   intencionCompra?: boolean,
 *   estado: string,
 *   necesidadId?: string|null,
 * }} datos
 * @returns {Promise<Object>}
 */
export async function createOpportunity(
  db,
  { customerId, conversationId, productoId, paquete = null, cantidad = null, total = null, intencionCompra = false, estado, necesidadId = null }
) {
  const opportunityId = randomUUID();
  const { rows } = await db.query(
    `INSERT INTO opportunities
       (opportunity_id, customer_id, conversation_id, producto_id, paquete, cantidad, total, intencion_compra, estado, necesidad_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [opportunityId, customerId, conversationId, productoId, paquete, cantidad, total, intencionCompra, estado, necesidadId]
  );
  return camelCaseRow(rows[0]);
}

/**
 * @param {{query: Function}} db
 * @param {string} opportunityId
 * @returns {Promise<Object|null>}
 */
export async function findById(db, opportunityId) {
  const { rows } = await db.query('SELECT * FROM opportunities WHERE opportunity_id = $1', [opportunityId]);
  return camelCaseRow(rows[0] ?? null);
}

/**
 * La oportunidad más reciente de una conversación. Usada por
 * crm/context/ (Fase C.1): bajo el modelo actual (1 oportunidad activa a
 * la vez por conversación, sin historial de oportunidades cerradas
 * todavía — ver docs/CRM_FASE_A_DATA_MODEL.md §12), es equivalente a "la
 * oportunidad de esta conversación".
 *
 * @param {{query: Function}} db
 * @param {string} conversationId
 * @returns {Promise<Object|null>}
 */
export async function findLatestByConversationId(db, conversationId) {
  const { rows } = await db.query(
    `SELECT * FROM opportunities
     WHERE conversation_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [conversationId]
  );
  return camelCaseRow(rows[0] ?? null);
}

/**
 * @param {{query: Function}} db
 * @param {string} customerId
 * @returns {Promise<Object[]>}
 */
export async function listByCustomerId(db, customerId) {
  const { rows } = await db.query(
    'SELECT * FROM opportunities WHERE customer_id = $1 ORDER BY created_at DESC',
    [customerId]
  );
  return camelCaseRows(rows);
}

/**
 * Todas las oportunidades creadas en [since, until) — lectura global, sin
 * filtrar por customer/conversation. Usada por Attribution Engine
 * (content-strategy/src/attribution/) para acotar el conjunto de eventos
 * comerciales candidatos dentro de una ventana de atribución (Fase 10) —
 * nunca para inferir causalidad por sí sola.
 *
 * @param {{query: Function}} db
 * @param {{since: Date, until: Date}} rango
 * @returns {Promise<Object[]>}
 */
export async function listCreatedBetween(db, { since, until }) {
  const { rows } = await db.query(
    'SELECT * FROM opportunities WHERE created_at >= $1 AND created_at < $2 ORDER BY created_at ASC',
    [since, until]
  );
  return camelCaseRows(rows);
}

/**
 * Actualización parcial — solo se tocan los campos incluidos en `cambios`
 * (mismo criterio de "merge superficial, nunca sustitución completa" que
 * ya usa actualizarContexto() en simulator/src/contextoStorage.js).
 *
 * @param {{query: Function}} db
 * @param {string} opportunityId
 * @param {Partial<{paquete: string|null, cantidad: number|null, total: number|null, intencionCompra: boolean, estado: string, necesidadId: string|null}>} cambios
 * @returns {Promise<Object|null>}
 */
export async function updateOpportunity(db, opportunityId, cambios) {
  const actual = await findById(db, opportunityId);
  if (!actual) return null;

  const fusion = {
    paquete: 'paquete' in cambios ? cambios.paquete : actual.paquete,
    cantidad: 'cantidad' in cambios ? cambios.cantidad : actual.cantidad,
    total: 'total' in cambios ? cambios.total : actual.total,
    intencionCompra: 'intencionCompra' in cambios ? cambios.intencionCompra : actual.intencionCompra,
    estado: 'estado' in cambios ? cambios.estado : actual.estado,
    necesidadId: 'necesidadId' in cambios ? cambios.necesidadId : actual.necesidadId,
  };

  const { rows } = await db.query(
    `UPDATE opportunities
     SET paquete = $2, cantidad = $3, total = $4, intencion_compra = $5, estado = $6, necesidad_id = $7, updated_at = now()
     WHERE opportunity_id = $1
     RETURNING *`,
    [opportunityId, fusion.paquete, fusion.cantidad, fusion.total, fusion.intencionCompra, fusion.estado, fusion.necesidadId]
  );
  return camelCaseRow(rows[0] ?? null);
}
