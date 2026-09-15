// inventoryRepository.js
// Acceso a datos de `inventory` (Fase "Sistema de Inventario", 0005). NO es
// historial (mismo criterio que product_pricing: "se sobrescribe") — por
// eso usa upsert. Es la fuente de verdad del STOCK ACTUAL; el historial de
// cómo se llegó a ese número vive en inventory_movements
// (inventoryMovementRepository.js), nunca duplicado aquí.

import { camelCaseRow, camelCaseRows } from '../db/mapRow.js';

/**
 * Crea o actualiza la fila de inventario de un producto. Los campos no
 * incluidos en `datos` no se tocan si la fila ya existía (excepto
 * actualizado_en/actualizado_por, que siempre se refrescan) — mismo
 * contrato que productPricingRepository.upsertProductPricing.
 *
 * @param {{query: Function}} db
 * @param {{
 *   productoId: string,
 *   cantidadActual?: number|null,
 *   minimo?: number|null,
 *   costoUnitario?: number|null,
 *   monedaCosto?: string|null,
 *   costoVigenteDesde?: string|Date|null,
 *   actualizadoPor?: string|null,
 * }} datos
 * @returns {Promise<Object>}
 */
export async function upsertInventory(
  db,
  { productoId, cantidadActual, minimo, costoUnitario, monedaCosto, costoVigenteDesde, actualizadoPor = null }
) {
  const { rows } = await db.query(
    `INSERT INTO inventory (producto_id, cantidad_actual, minimo, costo_unitario, moneda_costo, costo_vigente_desde, actualizado_por)
     VALUES ($1, COALESCE($2, 0), $3, $4, $5, $6, $7)
     ON CONFLICT (producto_id) DO UPDATE
       SET cantidad_actual     = COALESCE(EXCLUDED.cantidad_actual, inventory.cantidad_actual),
           minimo              = COALESCE(EXCLUDED.minimo, inventory.minimo),
           costo_unitario      = COALESCE(EXCLUDED.costo_unitario, inventory.costo_unitario),
           moneda_costo        = COALESCE(EXCLUDED.moneda_costo, inventory.moneda_costo),
           costo_vigente_desde = COALESCE(EXCLUDED.costo_vigente_desde, inventory.costo_vigente_desde),
           actualizado_en      = now(),
           actualizado_por     = COALESCE(EXCLUDED.actualizado_por, inventory.actualizado_por)
     RETURNING *`,
    [
      productoId,
      cantidadActual ?? null,
      minimo ?? null,
      costoUnitario ?? null,
      monedaCosto ?? null,
      costoVigenteDesde ?? null,
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
  const { rows } = await db.query('SELECT * FROM inventory WHERE producto_id = $1', [productoId]);
  return camelCaseRow(rows[0] ?? null);
}

/**
 * @param {{query: Function}} db
 * @param {string[]} productoIds
 * @returns {Promise<Object[]>}
 */
export async function findByProductoIds(db, productoIds) {
  if (productoIds.length === 0) return [];
  const { rows } = await db.query('SELECT * FROM inventory WHERE producto_id = ANY($1)', [productoIds]);
  return camelCaseRows(rows);
}

/**
 * Lee la fila de inventario BLOQUEADA (SELECT ... FOR UPDATE) -- punto
 * único de serialización para descuentos de stock concurrentes sobre el
 * mismo producto, mismo patrón que orderRepository.findByIdForUpdate
 * (Fase "Núcleo Comercial", 0006). Debe llamarse dentro de una transacción
 * real. Devuelve null si el producto no tiene fila de inventario todavía
 * -- quien llama (confirmarVenta) debe tratar eso como stock insuficiente,
 * nunca inventar una fila.
 *
 * @param {{query: Function}} db
 * @param {string} productoId
 * @returns {Promise<Object|null>}
 */
export async function findByProductoIdForUpdate(db, productoId) {
  const { rows } = await db.query('SELECT * FROM inventory WHERE producto_id = $1 FOR UPDATE', [productoId]);
  return camelCaseRow(rows[0] ?? null);
}

/**
 * Productos en o por debajo de su mínimo real (incluye agotados,
 * cantidad_actual = 0). Ignora productos sin mínimo registrado (minimo
 * NULL) — sin un mínimo real no hay umbral que evaluar, nunca se inventa
 * uno. Orden: agotados primero, luego los más cerca de su mínimo.
 *
 * @param {{query: Function}} db
 * @returns {Promise<Object[]>}
 */
export async function findLowStock(db) {
  const { rows } = await db.query(
    `SELECT * FROM inventory
     WHERE minimo IS NOT NULL AND cantidad_actual <= minimo
     ORDER BY cantidad_actual ASC, producto_id ASC`
  );
  return camelCaseRows(rows);
}
