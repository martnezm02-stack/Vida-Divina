// offerLogRepository.js
// Acceso a datos de `offers_log` (Fase A §13). TABLA HISTÓRICA /
// APPEND-ONLY: solo `insertOfferLog` + lectura (Fase B §22). Es bitácora
// de qué oferta se usó — nunca catálogo de ofertas; la definición de la
// oferta sigue viviendo en simulator/src/recursosComerciales.js (Fase B §15).

import { randomUUID } from 'node:crypto';
import { camelCaseRow, camelCaseRows } from '../db/mapRow.js';

/**
 * @param {{query: Function}} db
 * @param {{
 *   opportunityId: string,
 *   productoId: string,
 *   ofertaFuente: string,
 *   enviadaEn: string|Date,
 *   snapshotTexto?: string|null,
 * }} datos
 * @returns {Promise<Object>}
 */
export async function insertOfferLog(db, { opportunityId, productoId, ofertaFuente, enviadaEn, snapshotTexto = null }) {
  const offerLogId = randomUUID();
  const { rows } = await db.query(
    `INSERT INTO offers_log (offer_log_id, opportunity_id, producto_id, oferta_fuente, enviada_en, snapshot_texto)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [offerLogId, opportunityId, productoId, ofertaFuente, enviadaEn, snapshotTexto]
  );
  return camelCaseRow(rows[0]);
}

/**
 * @param {{query: Function}} db
 * @param {string} opportunityId
 * @returns {Promise<Object[]>} orden cronológico ascendente
 */
export async function listByOpportunityId(db, opportunityId) {
  const { rows } = await db.query(
    'SELECT * FROM offers_log WHERE opportunity_id = $1 ORDER BY enviada_en ASC',
    [opportunityId]
  );
  return camelCaseRows(rows);
}
