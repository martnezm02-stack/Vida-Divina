// inventory.js — endpoint GET de solo lectura: estado real de inventario
// (Dashboard "Inventario"). Lee exclusivamente de crm/ (tabla `inventory`
// real en PostgreSQL, Fase "Sistema de Inventario") + el catálogo real de
// productos (productCatalog.js) para nombre/categoría/SKU -- nunca una
// segunda fuente de inventario ni un precio comercial inventado (el "Valor
// de Inventario" usa costoUnitario real de crm.inventory, jamás un precio
// de venta).

import { sendJson } from '../lib/http.js';
import { listProductsWithAssets } from '../lib/productCatalog.js';
import * as crm from '../../../crm/index.js';
import { buildInventorySnapshot } from '../../../crm/services/inventorySnapshot.js';

const DOCS_PRODUCTOS_MARKER = /docs\/productos\//;

/**
 * productoId real ("productos/<categoria>/<archivo>") derivado del
 * sourcePath real del catálogo (docs/productos/<categoria>/<archivo>.md)
 * -- exactamente el mismo id que usa la tabla `inventory` (ver
 * crm/repositories/inventoryRepository.js, columna producto_id). null si
 * el producto no tiene ficha real en docs/productos/ todavía.
 */
function derivarProductoId(sourcePath) {
  if (!sourcePath) return null;
  const normalizado = sourcePath.replace(/\\/g, '/');
  const idx = normalizado.search(DOCS_PRODUCTOS_MARKER);
  if (idx === -1) return null;
  return normalizado.slice(idx).replace(/^docs\//, '').replace(/\.md$/i, '');
}

export async function handleInventory(req, res) {
  const [inventoryRows, catalogo] = await Promise.all([crm.inventory.findAll(), listProductsWithAssets()]);

  const catalogoPorProductoId = new Map();
  for (const p of catalogo) {
    if (!p.factsAvailable) continue;
    const productoId = derivarProductoId(p.sourcePath);
    if (productoId) catalogoPorProductoId.set(productoId, p);
  }

  // Cálculo real (existenciaTotal, valor a costo, distribución, críticos)
  // vive en crm/services/inventorySnapshot.js -- misma fuente que usa el
  // reporte de inventario de Hermes Ventas, nunca duplicado aquí.
  const snapshot = await buildInventorySnapshot(
    inventoryRows,
    (productoId) => catalogoPorProductoId.get(productoId)?.nombreVisible ?? null
  );

  sendJson(res, 200, snapshot);
}
