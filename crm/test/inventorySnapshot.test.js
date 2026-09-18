// inventorySnapshot.test.js — cálculo puro (sin I/O, sin BD) de
// crm/services/inventorySnapshot.js. La cobertura contra PostgreSQL real
// (nombre desde catálogo, endpoint HTTP) vive en dashboard/test/inventory.test.js
// -- este archivo solo valida la aritmética/estado/orden en aislamiento,
// para que tanto el Dashboard como el reporte de inventario de Hermes Ventas
// puedan confiar en el mismo cálculo sin repetirlo.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildInventorySnapshot, calcularEstado, categoriaDeProductoId, skuDeSlug } from '../services/inventorySnapshot.js';

const FILA_NORMAL = { productoId: 'productos/01-control-de-peso/sculpt-max', cantidadActual: 500, minimo: 50, costoUnitario: 100, monedaCosto: 'MXN' };
const FILA_MINIMO = { productoId: 'productos/03-longevidad-bienestar/aceite-esporas-reishi', cantidadActual: 10, minimo: 50, costoUnitario: 200, monedaCosto: 'MXN' };
const FILA_AGOTADA = { productoId: 'productos/02-cafe-divina/cappuccino', cantidadActual: 0, minimo: 20, costoUnitario: null, monedaCosto: null };

describe('calcularEstado', () => {
  test('cantidad 0 -> AGOTADO, incluso con mínimo definido', () => {
    assert.equal(calcularEstado(FILA_AGOTADA), 'AGOTADO');
  });
  test('cantidad <= mínimo real y > 0 -> MINIMO', () => {
    assert.equal(calcularEstado(FILA_MINIMO), 'MINIMO');
  });
  test('cantidad por encima del mínimo -> NORMAL', () => {
    assert.equal(calcularEstado(FILA_NORMAL), 'NORMAL');
  });
  test('sin mínimo registrado -> nunca MINIMO (no se inventa umbral)', () => {
    assert.equal(calcularEstado({ productoId: 'x', cantidadActual: 3, minimo: null }), 'NORMAL');
  });
});

test('categoriaDeProductoId humaniza el slug de carpeta real', () => {
  assert.equal(categoriaDeProductoId('productos/01-control-de-peso/sculpt-max'), 'Control De Peso');
});

test('skuDeSlug es determinista (nunca aleatorio)', () => {
  assert.equal(skuDeSlug('sculpt-max'), skuDeSlug('sculpt-max'));
  assert.match(skuDeSlug('sculpt-max'), /^VD-/);
});

describe('buildInventorySnapshot', () => {
  test('agrega existenciaTotal/valorInventario a partir del COSTO real, nunca de un precio inventado', async () => {
    const snap = await buildInventorySnapshot([FILA_NORMAL, FILA_MINIMO, FILA_AGOTADA], () => null);
    assert.equal(snap.resumen.existenciaTotal, 500 + 10 + 0);
    assert.equal(snap.resumen.valorInventario, 500 * 100 + 10 * 200);
    assert.equal(snap.resumen.valorInventarioIncompleto, true, 'FILA_AGOTADA no tiene costoUnitario real');
    assert.equal(snap.resumen.productosAgotados, 1);
    assert.equal(snap.resumen.enNivelMinimo, 1);
    assert.equal(snap.resumen.productosNormales, 1);
  });

  test('productosCriticos excluye NORMAL y prioriza AGOTADO antes que MINIMO', async () => {
    const snap = await buildInventorySnapshot([FILA_NORMAL, FILA_MINIMO, FILA_AGOTADA], () => null);
    assert.equal(snap.productosCriticos.length, 2);
    assert.equal(snap.productosCriticos[0].estado, 'AGOTADO');
  });

  test('resolveNombre real (sync o async) se usa cuando existe; si no, cae al slug -- nunca un nombre inventado', async () => {
    const snapConNombre = await buildInventorySnapshot([FILA_NORMAL], async () => 'Cápsulas Sculpt Max');
    assert.equal(snapConNombre.productos[0].producto, 'Cápsulas Sculpt Max');

    const snapSinNombre = await buildInventorySnapshot([FILA_NORMAL], () => null);
    assert.equal(snapSinNombre.productos[0].producto, 'sculpt-max');
  });

  test('valorPorCategoria suma exactamente lo mismo que los productos individuales', async () => {
    const snap = await buildInventorySnapshot([FILA_NORMAL, FILA_MINIMO, FILA_AGOTADA], () => null);
    const sumaCategorias = snap.valorPorCategoria.reduce((acc, c) => acc + c.valor, 0);
    const sumaProductos = snap.productos.reduce((acc, p) => acc + (p.valor ?? 0), 0);
    assert.equal(sumaCategorias, sumaProductos);
  });
});
