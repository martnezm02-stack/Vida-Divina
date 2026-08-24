// messageRepository.js
// Acceso a datos de `messages` (Fase A §9). TABLA HISTÓRICA / APPEND-ONLY:
// este repository expone deliberadamente solo `insertMessage` y funciones
// de lectura — ningún `updateMessage`/`deleteMessage`. Un mensaje ya
// insertado nunca se modifica (Fase B §22).
//
// La retención del campo `texto` está sujeta a la Decisión Pendiente #5 de
// la Fase A (docs/CRM_FASE_A_DATA_MODEL.md §21/§29) — este repository no
// implementa redacción ni expiración; solo persiste lo que se le pase.

import { randomUUID } from 'node:crypto';
import { camelCaseRow, camelCaseRows } from '../db/mapRow.js';

/**
 * Inserta un mensaje. Si `canalMessageId` está presente y ya existe para
 * la misma conversación (reintento de webhook), el índice único parcial
 * de la migración rechaza el INSERT con un error de PostgreSQL (código
 * 23505) — este repository no lo silencia: quien llame decide si eso es
 * un caso esperado (deduplicación) o un error real.
 *
 * @param {{query: Function}} db
 * @param {{
 *   conversationId: string,
 *   direccion: 'entrante'|'saliente',
 *   texto?: string|null,
 *   canalMessageId?: string|null,
 *   timestamp: string|Date,
 *   recursoTipo?: string|null,
 *   fuenteRecurso?: string|null,
 * }} datos
 * @returns {Promise<Object>}
 */
export async function insertMessage(
  db,
  { conversationId, direccion, texto = null, canalMessageId = null, timestamp, recursoTipo = null, fuenteRecurso = null }
) {
  const messageId = randomUUID();
  const { rows } = await db.query(
    `INSERT INTO messages
       (message_id, conversation_id, direccion, texto, canal_message_id, "timestamp", recurso_tipo, fuente_recurso)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [messageId, conversationId, direccion, texto, canalMessageId, timestamp, recursoTipo, fuenteRecurso]
  );
  return camelCaseRow(rows[0]);
}

/**
 * @param {{query: Function}} db
 * @param {string} conversationId
 * @param {{limit?: number}} [opciones]
 * @returns {Promise<Object[]>} orden cronológico ascendente
 */
export async function listByConversationId(db, conversationId, { limit = 200 } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM messages
     WHERE conversation_id = $1
     ORDER BY "timestamp" ASC
     LIMIT $2`,
    [conversationId, limit]
  );
  return camelCaseRows(rows);
}

/**
 * @param {{query: Function}} db
 * @param {string} conversationId
 * @param {string} canalMessageId
 * @returns {Promise<Object|null>}
 */
export async function findByConversationAndCanalMessageId(db, conversationId, canalMessageId) {
  const { rows } = await db.query(
    'SELECT * FROM messages WHERE conversation_id = $1 AND canal_message_id = $2',
    [conversationId, canalMessageId]
  );
  return camelCaseRow(rows[0] ?? null);
}
