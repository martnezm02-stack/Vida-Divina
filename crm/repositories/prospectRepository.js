// prospectRepository.js
// Acceso a datos de `prospects` (Prospector -- Scout -> Google Maps/Apify
// -> normalización -> dedupe -> PostgreSQL, 2026-09-15). SQL parametrizado
// en todos los casos -- nunca interpolación de strings. Cada función
// recibe `db` como primer argumento (un pg.Pool o un pg.PoolClient dentro
// de una transacción -- ambos exponen `.query(text, params)`), mismo
// patrón que customerRepository.js.
//
// Deduplicación (find-then-write, sin depender de un UNIQUE constraint --
// ver nota (2) de 0007_add_prospects.sql):
//   1. google_maps_url (si no está vacío)
//   2. phone normalizado (si no está vacío)
//   3. name + address (ambos no vacíos)

import { randomUUID } from 'node:crypto';
import { camelCaseRow } from '../db/mapRow.js';

/**
 * @param {{query: Function}} db
 * @param {{googleMapsUrl?: string|null, phone?: string|null, name?: string|null, address?: string|null}} lead
 * @returns {Promise<Object|null>} la fila existente (cruda, snake_case) o null
 */
async function findExisting(db, { googleMapsUrl, phone, name, address }) {
  if (googleMapsUrl) {
    const { rows } = await db.query(
      'SELECT * FROM prospects WHERE google_maps_url = $1',
      [googleMapsUrl]
    );
    if (rows[0]) return rows[0];
  }
  if (phone) {
    const { rows } = await db.query(
      'SELECT * FROM prospects WHERE phone = $1',
      [phone]
    );
    if (rows[0]) return rows[0];
  }
  if (name && address) {
    const { rows } = await db.query(
      'SELECT * FROM prospects WHERE name = $1 AND address = $2',
      [name, address]
    );
    if (rows[0]) return rows[0];
  }
  return null;
}

/**
 * Inserta un prospecto nuevo o actualiza el existente (misma
 * identidad -- ver findExisting). Nunca crea un segundo registro para el
 * mismo negocio.
 *
 * @param {{query: Function}} db
 * @param {{
 *   name: string, phone?: string|null, address?: string|null, city?: string|null,
 *   category?: string|null, rating?: number|null, reviews?: number|null,
 *   website?: string|null, googleMapsUrl?: string|null, whatsappUrl?: string|null,
 *   source?: string|null, niche?: string|null, zone?: string|null
 * }} lead
 * @returns {Promise<{prospect: Object, created: boolean}>}
 */
export async function upsertProspect(db, lead) {
  const {
    name, phone = null, address = null, city = null, category = null,
    rating = null, reviews = null, website = null, googleMapsUrl = null,
    whatsappUrl = null, source = 'apify_google_maps', niche = null, zone = null,
  } = lead;

  const existing = await findExisting(db, { googleMapsUrl, phone, name, address });

  if (existing) {
    const { rows } = await db.query(
      `UPDATE prospects SET
         name = $2, phone = $3, address = $4, city = $5, category = $6,
         rating = $7, reviews = $8, website = $9, google_maps_url = $10,
         whatsapp_url = $11, niche = $12, zone = $13, updated_at = now()
       WHERE prospect_id = $1
       RETURNING *`,
      [
        existing.prospect_id, name, phone, address, city, category,
        rating, reviews, website, googleMapsUrl, whatsappUrl, niche, zone,
      ]
    );
    return { prospect: camelCaseRow(rows[0]), created: false };
  }

  const prospectId = randomUUID();
  const { rows } = await db.query(
    `INSERT INTO prospects (
       prospect_id, name, phone, address, city, category, rating, reviews,
       website, google_maps_url, whatsapp_url, source, niche, zone
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      prospectId, name, phone, address, city, category, rating, reviews,
      website, googleMapsUrl, whatsappUrl, source, niche, zone,
    ]
  );
  return { prospect: camelCaseRow(rows[0]), created: true };
}

/**
 * @param {{query: Function}} db
 * @param {string} prospectId
 * @returns {Promise<Object|null>}
 */
export async function findProspectById(db, prospectId) {
  const { rows } = await db.query('SELECT * FROM prospects WHERE prospect_id = $1', [prospectId]);
  return camelCaseRow(rows[0] ?? null);
}

/**
 * @param {{query: Function}} db
 * @param {{niche?: string, zone?: string}} [filtros]
 * @returns {Promise<Object[]>}
 */
export async function listProspects(db, { niche, zone } = {}) {
  const condiciones = [];
  const valores = [];
  if (niche) {
    valores.push(niche);
    condiciones.push(`niche = $${valores.length}`);
  }
  if (zone) {
    valores.push(zone);
    condiciones.push(`zone = $${valores.length}`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT * FROM prospects ${where} ORDER BY created_at DESC`,
    valores
  );
  return rows.map(camelCaseRow);
}
