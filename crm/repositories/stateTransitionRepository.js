// stateTransitionRepository.js
// Acceso a datos de `state_transitions` (Fase A §11). TABLA HISTÓRICA /
// APPEND-ONLY: solo `insertTransition` + lectura, ningún update/delete
// (Fase B §22). Registra exclusivamente transiciones de ESTADOS_VENTA_REAL
// — nunca del ESTADOS genérico (ver justificación en Fase A §11).

import { randomUUID } from 'node:crypto';
import { camelCaseRow, camelCaseRows } from '../db/mapRow.js';

/**
 * @param {{query: Function}} db
 * @param {{
 *   conversationId: string,
 *   estadoAnterior?: string|null,
 *   estadoNuevo: string,
 *   timestamp: string|Date,
 *   fuenteFuncion: string,
 *   metadata?: Object|null,
 * }} datos
 * @returns {Promise<Object>}
 */
export async function insertTransition(
  db,
  { conversationId, estadoAnterior = null, estadoNuevo, timestamp, fuenteFuncion, metadata = null }
) {
  const stateTransitionId = randomUUID();
  const { rows } = await db.query(
    `INSERT INTO state_transitions
       (state_transition_id, conversation_id, estado_anterior, estado_nuevo, "timestamp", fuente_funcion, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [stateTransitionId, conversationId, estadoAnterior, estadoNuevo, timestamp, fuenteFuncion, metadata]
  );
  return camelCaseRow(rows[0]);
}

/**
 * @param {{query: Function}} db
 * @param {string} conversationId
 * @returns {Promise<Object[]>} orden cronológico ascendente — historial completo del pipeline
 */
export async function listByConversationId(db, conversationId) {
  const { rows } = await db.query(
    `SELECT * FROM state_transitions
     WHERE conversation_id = $1
     ORDER BY "timestamp" ASC`,
    [conversationId]
  );
  return camelCaseRows(rows);
}

/**
 * @param {{query: Function}} db
 * @param {string} conversationId
 * @returns {Promise<Object|null>} la transición más reciente, o null si no hay ninguna
 */
export async function findLatestByConversationId(db, conversationId) {
  const { rows } = await db.query(
    `SELECT * FROM state_transitions
     WHERE conversation_id = $1
     ORDER BY "timestamp" DESC
     LIMIT 1`,
    [conversationId]
  );
  return camelCaseRow(rows[0] ?? null);
}
