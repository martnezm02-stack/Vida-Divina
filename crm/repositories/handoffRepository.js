// handoffRepository.js
// Acceso a datos de `handoffs` (Fase A §15).
//
// NOTA SOBRE UNA AMBIGÜEDAD ENTRE FASE A Y FASE B (documentada, no resuelta
// por decisión propia — instrucción de la Fase B §1: "documenta la
// discrepancia, conserva la especificación de Fase A salvo razón técnica
// crítica"):
//
// La Fase B §22 clasifica `handoffs` entre las tablas "históricas /
// append-only" junto a messages/state_transitions/offers_log, sin exponer
// update. Pero la Fase A §15 diseñó explícitamente `resuelto_en` y
// `resuelto_por` como campos NULL que se completan más tarde, cuando un
// humano retoma la conversación (Decisión Pendiente #4: "no existe hoy
// ningún mecanismo que lo marque"). Ambos requisitos no pueden cumplirse
// al pie de la letra a la vez: un handoff sin ningún método de resolución
// nunca podría reflejar que fue atendido.
//
// Interpretación aplicada aquí (documentada, no oculta): "append-only"
// se aplica a los campos que describen el HECHO del handoff — motivo,
// fuente, conversation_id, creado_en — que nunca se reescriben una vez
// insertados (no existe updateHandoff() genérico). Resolver un handoff no
// reescribe ese hecho, solo completa su desenlace — se expone entonces un
// único método acotado, `resolveHandoff`, que solo puede pasar
// resuelto_en/resuelto_por de NULL a un valor (nunca al revés, nunca toca
// los demás campos). Esto no es "un mecanismo de resolución automática"
// (prohibido explícitamente en Fase B §17) — sigue siendo una escritura
// manual, invocada por quien sea que en el futuro implemente cómo se entera
// el sistema de que un humano ya respondió (todavía sin definir).

import { randomUUID } from 'node:crypto';
import { camelCaseRow, camelCaseRows } from '../db/mapRow.js';

/**
 * @param {{query: Function}} db
 * @param {{conversationId: string, motivo: string, fuente?: string|null}} datos
 * @returns {Promise<Object>}
 */
export async function insertHandoff(db, { conversationId, motivo, fuente = null }) {
  const handoffId = randomUUID();
  const { rows } = await db.query(
    `INSERT INTO handoffs (handoff_id, conversation_id, motivo, fuente)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [handoffId, conversationId, motivo, fuente]
  );
  return camelCaseRow(rows[0]);
}

/**
 * @param {{query: Function}} db
 * @param {string} handoffId
 * @returns {Promise<Object|null>}
 */
export async function findById(db, handoffId) {
  const { rows } = await db.query('SELECT * FROM handoffs WHERE handoff_id = $1', [handoffId]);
  return camelCaseRow(rows[0] ?? null);
}

/**
 * @param {{query: Function}} db
 * @param {string} conversationId
 * @returns {Promise<Object[]>} orden cronológico ascendente — historial completo de escalamientos
 */
export async function listByConversationId(db, conversationId) {
  const { rows } = await db.query(
    'SELECT * FROM handoffs WHERE conversation_id = $1 ORDER BY creado_en ASC',
    [conversationId]
  );
  return camelCaseRows(rows);
}

/**
 * @param {{query: Function}} db
 * @param {string} conversationId
 * @returns {Promise<Object[]>} handoffs de esa conversación aún sin resolver
 */
export async function listPendientesByConversationId(db, conversationId) {
  const { rows } = await db.query(
    'SELECT * FROM handoffs WHERE conversation_id = $1 AND resuelto_en IS NULL ORDER BY creado_en ASC',
    [conversationId]
  );
  return camelCaseRows(rows);
}

/**
 * Completa el desenlace de un handoff ya existente — ver nota de cabecera.
 * Solo actúa si resuelto_en todavía es NULL (no permite "resolver" dos
 * veces ni sobrescribir una resolución previa).
 *
 * @param {{query: Function}} db
 * @param {string} handoffId
 * @param {{resueltoPor?: string|null}} [datos]
 * @returns {Promise<Object|null>}
 */
export async function resolveHandoff(db, handoffId, { resueltoPor = null } = {}) {
  const { rows } = await db.query(
    `UPDATE handoffs
     SET resuelto_en = now(), resuelto_por = $2
     WHERE handoff_id = $1 AND resuelto_en IS NULL
     RETURNING *`,
    [handoffId, resueltoPor]
  );
  return camelCaseRow(rows[0] ?? null);
}
