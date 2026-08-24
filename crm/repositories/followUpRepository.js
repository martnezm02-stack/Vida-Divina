// followUpRepository.js
// Acceso a datos de `follow_ups` (Fase A §14). Es estado en evolución
// (pendiente -> ejecutado/cancelado), no historial append-only puro — sí
// expone update. NO implementa ningún scheduler (Fase B §16) — solo los
// datos que un futuro scheduler necesitará.

import { randomUUID } from 'node:crypto';
import { camelCaseRow, camelCaseRows } from '../db/mapRow.js';

/**
 * @param {{query: Function}} db
 * @param {{
 *   conversationId: string,
 *   tipo: 'postventa_dia3'|'postventa_semana'|'recuperacion_dia5',
 *   fechaProgramada: string|Date,
 *   requiereIntervencionHumana?: boolean,
 * }} datos
 * @returns {Promise<Object>}
 */
export async function createFollowUp(db, { conversationId, tipo, fechaProgramada, requiereIntervencionHumana = false }) {
  const followUpId = randomUUID();
  const { rows } = await db.query(
    `INSERT INTO follow_ups (follow_up_id, conversation_id, tipo, fecha_programada, requiere_intervencion_humana)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [followUpId, conversationId, tipo, fechaProgramada, requiereIntervencionHumana]
  );
  return camelCaseRow(rows[0]);
}

/**
 * @param {{query: Function}} db
 * @param {string} followUpId
 * @returns {Promise<Object|null>}
 */
export async function findById(db, followUpId) {
  const { rows } = await db.query('SELECT * FROM follow_ups WHERE follow_up_id = $1', [followUpId]);
  return camelCaseRow(rows[0] ?? null);
}

/**
 * Consulta base que un futuro scheduler necesitará: todo lo pendiente cuya
 * fecha_programada ya llegó. No se implementa el scheduler en sí — solo
 * esta consulta (Fase B §16).
 *
 * @param {{query: Function}} db
 * @param {Date} [hasta] - por defecto, ahora mismo
 * @returns {Promise<Object[]>}
 */
export async function listPendingDueBy(db, hasta = new Date()) {
  const { rows } = await db.query(
    `SELECT * FROM follow_ups
     WHERE estado = 'pendiente' AND fecha_programada <= $1
     ORDER BY fecha_programada ASC`,
    [hasta]
  );
  return camelCaseRows(rows);
}

/**
 * @param {{query: Function}} db
 * @param {string} conversationId
 * @returns {Promise<Object[]>}
 */
export async function listByConversationId(db, conversationId) {
  const { rows } = await db.query(
    'SELECT * FROM follow_ups WHERE conversation_id = $1 ORDER BY fecha_programada ASC',
    [conversationId]
  );
  return camelCaseRows(rows);
}

/**
 * Marca un follow-up como ejecutado, con su resultado.
 * @param {{query: Function}} db
 * @param {string} followUpId
 * @param {{fechaEjecutada?: string|Date, resultado?: string|null}} datos
 * @returns {Promise<Object|null>}
 */
export async function marcarEjecutado(db, followUpId, { fechaEjecutada = new Date(), resultado = null } = {}) {
  const { rows } = await db.query(
    `UPDATE follow_ups
     SET estado = 'ejecutado', fecha_ejecutada = $2, resultado = $3, updated_at = now()
     WHERE follow_up_id = $1
     RETURNING *`,
    [followUpId, fechaEjecutada, resultado]
  );
  return camelCaseRow(rows[0] ?? null);
}

/**
 * Marca un follow-up como cancelado (ej. "cliente recontactó antes de la
 * ventana de recuperación", recuperacion_de_compra.md §1).
 * @param {{query: Function}} db
 * @param {string} followUpId
 * @param {string} motivoCancelacion
 * @returns {Promise<Object|null>}
 */
export async function marcarCancelado(db, followUpId, motivoCancelacion) {
  const { rows } = await db.query(
    `UPDATE follow_ups
     SET estado = 'cancelado', motivo_cancelacion = $2, updated_at = now()
     WHERE follow_up_id = $1
     RETURNING *`,
    [followUpId, motivoCancelacion]
  );
  return camelCaseRow(rows[0] ?? null);
}
