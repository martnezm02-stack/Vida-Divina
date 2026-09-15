// productPricingRepository.js
// Acceso a datos de `product_pricing` (Fase A §19). NO es catálogo de
// producto — solo precio/stock operativo. producto_id es una referencia
// lógica al id de knowledge/compiled/entities.json (ej.
// "productos/01-control-de-peso/atom-capsules"), nunca una FK física: esa
// fuente vive fuera de PostgreSQL (docs/ -> knowledge/, ver Fase A §19) y
// este módulo no la valida contra knowledge/ — eso es responsabilidad de
// quien llame.
//
// No es historial (Fase A §25: "se sobrescribe") — por eso usa upsert en
// vez de insert-only como los repositories de arriba.

import { camelCaseRow, camelCaseRows } from '../db/mapRow.js';

/**
 * Crea o actualiza la fila de precio/stock/promociones de un producto. Los
 * campos no incluidos en `datos` no se tocan si la fila ya existía (excepto
 * actualizado_en/actualizado_por, que siempre se refrescan).
 *
 * @param {{query: Function}} db
 * @param {{
 *   productoId: string,
 *   precio?: number|null,
 *   disponibleStock?: boolean|null,
 *   cantidadBase?: string|null,
 *   promociones?: Array<{cantidad: string, precio: number}>|null,
 *   actualizadoPor?: string|null,
 * }} datos
 * @returns {Promise<Object>}
 */
export async function upsertProductPricing(db, { productoId, precio, disponibleStock, cantidadBase, promociones, actualizadoPor = null }) {
  const { rows } = await db.query(
    `INSERT INTO product_pricing (producto_id, precio, disponible_stock, cantidad_base, promociones, actualizado_por)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (producto_id) DO UPDATE
       SET precio = COALESCE(EXCLUDED.precio, product_pricing.precio),
           disponible_stock = COALESCE(EXCLUDED.disponible_stock, product_pricing.disponible_stock),
           cantidad_base = COALESCE(EXCLUDED.cantidad_base, product_pricing.cantidad_base),
           promociones = COALESCE(EXCLUDED.promociones, product_pricing.promociones),
           actualizado_en = now(),
           actualizado_por = COALESCE(EXCLUDED.actualizado_por, product_pricing.actualizado_por)
     RETURNING *`,
    [
      productoId,
      precio ?? null,
      disponibleStock ?? null,
      cantidadBase ?? null,
      promociones != null ? JSON.stringify(promociones) : null,
      actualizadoPor,
    ]
  );
  return camelCaseRow(rows[0]);
}

/**
 * @param {{query: Function}} db
 * @param {string} productoId
 * @returns {Promise<Object|null>}
 */
export async function findByProductoId(db, productoId) {
  const { rows } = await db.query('SELECT * FROM product_pricing WHERE producto_id = $1', [productoId]);
  return camelCaseRow(rows[0] ?? null);
}

/**
 * @param {{query: Function}} db
 * @param {string[]} productoIds
 * @returns {Promise<Object[]>}
 */
export async function findByProductoIds(db, productoIds) {
  if (productoIds.length === 0) return [];
  const { rows } = await db.query('SELECT * FROM product_pricing WHERE producto_id = ANY($1)', [productoIds]);
  return camelCaseRows(rows);
}
