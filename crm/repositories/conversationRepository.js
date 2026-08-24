// conversationRepository.js
// Acceso a datos de `conversations` (Fase A §8). estado_actual es TEXT
// libre a propósito (ver comentario en la migración 0001) — refleja el
// valor vigente de ESTADOS_VENTA_REAL (simulator/src/stateMachine.js), que
// este repository no valida contra ninguna lista fija para no duplicar esa
// definición en dos lugares.
//
// `source` (migración 0002, Fase 16 Parte 4): REAL/SIMULATED/TEST/FIXTURE/
// UNKNOWN. Por defecto 'UNKNOWN' -- nunca se asume 'REAL' cuando quien
// llama no lo declara explícitamente (ver CHECK real en la migración).

import { randomUUID } from 'node:crypto';
import { camelCaseRow, camelCaseRows } from '../db/mapRow.js';

export const CONVERSATION_SOURCES = Object.freeze(['REAL', 'SIMULATED', 'TEST', 'FIXTURE', 'UNKNOWN']);

/**
 * @param {{query: Function}} db
 * @param {{customerId: string, customerChannelId: string, waIdConversacion: string, estadoActual?: string|null, ultimaInteraccion?: Date|null, source?: string}} datos
 * @returns {Promise<Object>}
 */
export async function createConversation(db, { customerId, customerChannelId, waIdConversacion, estadoActual = null, ultimaInteraccion = null, source = 'UNKNOWN' }) {
  if (!CONVERSATION_SOURCES.includes(source)) throw new Error(`conversationRepository.createConversation: "source" inválido "${source}" (válidos: ${CONVERSATION_SOURCES.join(', ')}).`);
  const conversationId = randomUUID();
  const { rows } = await db.query(
    `INSERT INTO conversations (conversation_id, customer_id, customer_channel_id, wa_id_conversacion, estado_actual, ultima_interaccion, source)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()), $7)
     RETURNING *`,
    [conversationId, customerId, customerChannelId, waIdConversacion, estadoActual, ultimaInteraccion, source]
  );
  return camelCaseRow(rows[0]);
}

/**
 * @param {{query: Function}} db
 * @param {string} conversationId
 * @returns {Promise<Object|null>}
 */
export async function findConversationById(db, conversationId) {
  const { rows } = await db.query('SELECT * FROM conversations WHERE conversation_id = $1', [conversationId]);
  return camelCaseRow(rows[0] ?? null);
}

/**
 * Igual que findConversationById, pero con SELECT ... FOR UPDATE — bloquea
 * la fila hasta que la transacción actual termine (COMMIT/ROLLBACK).
 * Usado por crm/context/ (Fase C.1) como punto único de serialización de
 * escrituras concurrentes sobre el mismo contexto: cualquier otra
 * transacción que intente lo mismo sobre esta misma fila espera aquí en
 * vez de pisar un read-modify-write ajeno. Debe llamarse siempre dentro de
 * una transacción (nunca contra el pool directamente — FOR UPDATE fuera de
 * una transacción libera el lock inmediatamente y no protege nada).
 *
 * @param {{query: Function}} db - debe ser un client dentro de una transacción
 * @param {string} conversationId
 * @returns {Promise<Object|null>}
 */
export async function findByIdForUpdate(db, conversationId) {
  const { rows } = await db.query('SELECT * FROM conversations WHERE conversation_id = $1 FOR UPDATE', [conversationId]);
  return camelCaseRow(rows[0] ?? null);
}

/**
 * La conversación más reciente asociada a un canal dado (ej. "¿ya existe
 * una conversación para este wa_id, o hay que crear una?"). No asume que
 * solo puede existir una conversación por canal — devuelve la más reciente
 * por iniciado_en.
 *
 * @param {{query: Function}} db
 * @param {string} customerChannelId
 * @returns {Promise<Object|null>}
 */
export async function findLatestByCustomerChannelId(db, customerChannelId) {
  const { rows } = await db.query(
    `SELECT * FROM conversations
     WHERE customer_channel_id = $1
     ORDER BY iniciado_en DESC
     LIMIT 1`,
    [customerChannelId]
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
    'SELECT * FROM conversations WHERE customer_id = $1 ORDER BY iniciado_en DESC',
    [customerId]
  );
  return camelCaseRows(rows);
}

/**
 * Todas las conversaciones iniciadas en [since, until) — lectura global,
 * sin filtrar por customer. Mismo consumidor y propósito que
 * opportunityRepository.listCreatedBetween (Attribution Engine, Fase 10):
 * acota candidatos por ventana de tiempo, nunca decide atribución por sí
 * sola.
 *
 * @param {{query: Function}} db
 * @param {{since: Date, until: Date}} rango
 * @returns {Promise<Object[]>}
 */
export async function listStartedBetween(db, { since, until }) {
  const { rows } = await db.query(
    'SELECT * FROM conversations WHERE iniciado_en >= $1 AND iniciado_en < $2 ORDER BY iniciado_en ASC',
    [since, until]
  );
  return camelCaseRows(rows);
}

/**
 * Actualiza el estado vigente y refresca ultima_interaccion en la misma
 * escritura — mismo par de campos que hoy se actualizan juntos en
 * simulator/src/flujoVentaReal.js (cerrarContexto).
 *
 * @param {{query: Function}} db
 * @param {string} conversationId
 * @param {string} nuevoEstado
 * @returns {Promise<Object|null>}
 */
/**
 * @param {{query: Function}} db
 * @param {string} conversationId
 * @param {string} nuevoEstado
 * @param {Date|null} [ultimaInteraccion] - si se provee, se respeta tal
 *   cual (hallazgo real de Fase C.2B: el contrato original de
 *   contextoStorage.js persistía exactamente el valor que el llamador
 *   diera, incluso si nunca se había fijado — un `COALESCE` a `now()`
 *   incondicional sobrescribía en silencio ese valor). Si se omite o es
 *   null, se usa `now()` del servidor — mismo comportamiento de siempre.
 * @returns {Promise<Object|null>}
 */
export async function updateEstadoActual(db, conversationId, nuevoEstado, ultimaInteraccion = null) {
  const { rows } = await db.query(
    `UPDATE conversations
     SET estado_actual = $2, ultima_interaccion = COALESCE($3, now()), updated_at = now()
     WHERE conversation_id = $1
     RETURNING *`,
    [conversationId, nuevoEstado, ultimaInteraccion]
  );
  return camelCaseRow(rows[0] ?? null);
}

/**
 * @param {{query: Function}} db
 * @param {string} conversationId
 * @param {Date|null} [ultimaInteraccion] - ver nota en updateEstadoActual.
 * @returns {Promise<Object|null>}
 */
export async function touchUltimaInteraccion(db, conversationId, ultimaInteraccion = null) {
  const { rows } = await db.query(
    `UPDATE conversations
     SET ultima_interaccion = COALESCE($2, now()), updated_at = now()
     WHERE conversation_id = $1
     RETURNING *`,
    [conversationId, ultimaInteraccion]
  );
  return camelCaseRow(rows[0] ?? null);
}

/**
 * Fija o limpia el puntero al handoff vigente (handoff_pendiente_id). Pasar
 * `null` limpia el puntero (equivalente a "ya no hay handoff pendiente").
 *
 * @param {{query: Function}} db
 * @param {string} conversationId
 * @param {string|null} handoffId
 * @returns {Promise<Object|null>}
 */
export async function setHandoffPendiente(db, conversationId, handoffId) {
  const { rows } = await db.query(
    `UPDATE conversations
     SET handoff_pendiente_id = $2, updated_at = now()
     WHERE conversation_id = $1
     RETURNING *`,
    [conversationId, handoffId]
  );
  return camelCaseRow(rows[0] ?? null);
}
