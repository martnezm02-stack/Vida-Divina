// inventory.test.js — Dashboard "Inventario" (Fase "Dashboard + Inventario",
// 2026-09). Integración real contra PostgreSQL (TEST_DATABASE_URL, nunca
// DATABASE_URL — mismo criterio que whatsapp.test.js) + servidor HTTP real
// del dashboard + catálogo real de productos (docs/productos/). Sin mocks
// de crm/: se siembra una fila real de `inventory` para un producto que SÍ
// existe en el catálogo real, y se verifica el endpoint real.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.PORT = '0';
delete process.env.DASHBOARD_NO_LISTEN;

const { server } = await import('../server/index.js');
const crm = await import('../../crm/index.js');
const { getTestPool, resetDatabase, closeTestPool } = await import('../../crm/test/helpers/db.js');

// Producto real confirmado en docs/productos/01-control-de-peso/sculpt-max.md
// (nombreVisible real: "Cápsulas Sculpt Max") -- nunca un producto inventado.
const PRODUCTO_ID_NORMAL = 'productos/01-control-de-peso/sculpt-max';
const PRODUCTO_ID_MINIMO = 'productos/03-longevidad-bienestar/aceite-esporas-reishi';
const PRODUCTO_ID_AGOTADO = 'productos/02-cafe-divina/cappuccino';

let baseUrl;
let pool;

before(async () => {
  pool = await getTestPool();
  await resetDatabase(pool);

  await crm.inventory.upsertInventory({ productoId: PRODUCTO_ID_NORMAL, cantidadActual: 500, minimo: 50, costoUnitario: 100, monedaCosto: 'MXN' });
  await crm.inventory.upsertInventory({ productoId: PRODUCTO_ID_MINIMO, cantidadActual: 10, minimo: 50, costoUnitario: 200, monedaCosto: 'MXN' });
  await crm.inventory.upsertInventory({ productoId: PRODUCTO_ID_AGOTADO, cantidadActual: 0, minimo: 20, costoUnitario: null, monedaCosto: null });

  await new Promise((resolve, reject) => {
    if (server.listening) { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); return; }
    server.once('listening', () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); });
    server.once('error', reject);
  });
});
after(async () => {
  await new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); });
  await closeTestPool();
});

async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe('GET /api/inventory — datos reales, sin mocks, sin segunda fuente', () => {
  test('lee de crm.inventory real (PostgreSQL) -- no de un catálogo paralelo', async () => {
    const { status, body } = await get('/api/inventory');
    assert.equal(status, 200);
    assert.equal(Array.isArray(body.productos), true);
    const ids = body.productos.map((p) => p.productoId);
    assert.ok(ids.includes(PRODUCTO_ID_NORMAL));
    assert.ok(ids.includes(PRODUCTO_ID_MINIMO));
    assert.ok(ids.includes(PRODUCTO_ID_AGOTADO));
  });

  test('resuelve nombre real del catálogo (nunca inventado) para un producto con ficha real', async () => {
    const { body } = await get('/api/inventory');
    const fila = body.productos.find((p) => p.productoId === PRODUCTO_ID_NORMAL);
    assert.equal(fila.producto, 'Cápsulas Sculpt Max');
    assert.equal(fila.categoria, 'Control De Peso');
  });

  test('estado NORMAL: existencia muy por encima del mínimo', async () => {
    const { body } = await get('/api/inventory');
    const fila = body.productos.find((p) => p.productoId === PRODUCTO_ID_NORMAL);
    assert.equal(fila.estado, 'NORMAL');
  });

  test('estado MINIMO: existencia <= mínimo pero > 0', async () => {
    const { body } = await get('/api/inventory');
    const fila = body.productos.find((p) => p.productoId === PRODUCTO_ID_MINIMO);
    assert.equal(fila.estado, 'MINIMO');
  });

  test('estado AGOTADO: cantidad_actual = 0, incluso con mínimo definido', async () => {
    const { body } = await get('/api/inventory');
    const fila = body.productos.find((p) => p.productoId === PRODUCTO_ID_AGOTADO);
    assert.equal(fila.estado, 'AGOTADO');
  });

  test('Valor de Inventario usa el COSTO real (costoUnitario), nunca un precio comercial inventado', async () => {
    const { body } = await get('/api/inventory');
    const fila = body.productos.find((p) => p.productoId === PRODUCTO_ID_NORMAL);
    assert.equal(fila.valor, 500 * 100); // cantidadActual * costoUnitario real, no un precio de venta
  });

  test('producto sin costoUnitario real -> valor null (nunca inventado) y resumen marca valorInventarioIncompleto', async () => {
    const { body } = await get('/api/inventory');
    const fila = body.productos.find((p) => p.productoId === PRODUCTO_ID_AGOTADO);
    assert.equal(fila.valor, null);
    assert.equal(body.resumen.valorInventarioIncompleto, true);
  });

  test('resumen agregado: existenciaTotal/productosAgotados/enNivelMinimo coherentes con las filas reales', async () => {
    const { body } = await get('/api/inventory');
    assert.equal(body.resumen.productosAgotados, body.productos.filter((p) => p.estado === 'AGOTADO').length);
    assert.equal(body.resumen.enNivelMinimo, body.productos.filter((p) => p.estado === 'MINIMO').length);
    assert.equal(body.resumen.existenciaTotal, body.productos.reduce((acc, p) => acc + p.existencia, 0));
  });

  test('distribución y valorPorCategoria son coherentes con los productos reales devueltos', async () => {
    const { body } = await get('/api/inventory');
    const totalDist = body.distribucion.normal + body.distribucion.minimo + body.distribucion.agotado;
    assert.equal(totalDist, body.productos.length);
    const sumaCategorias = body.valorPorCategoria.reduce((acc, c) => acc + c.valor, 0);
    const sumaValores = body.productos.reduce((acc, p) => acc + (p.valor ?? 0), 0);
    assert.equal(sumaCategorias, sumaValores);
  });

  test('productosCriticos excluye NORMAL y prioriza AGOTADO', async () => {
    const { body } = await get('/api/inventory');
    assert.ok(body.productosCriticos.every((p) => p.estado !== 'NORMAL'));
    assert.equal(body.productosCriticos[0].estado, 'AGOTADO');
  });
});
