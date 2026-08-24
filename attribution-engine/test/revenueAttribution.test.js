import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractRevenue, computeAttributedRevenue, SALE_STATES } from '../src/revenueAttribution.js';

describe('SALE_STATES', () => {
  test('deriva por alcanzabilidad desde PedidoProcesado -- incluye Enviado y FinSeguimiento, excluye estados previos', () => {
    assert.ok(SALE_STATES.includes('PedidoProcesado'));
    assert.ok(SALE_STATES.includes('Enviado'));
    assert.ok(SALE_STATES.includes('FinSeguimiento'));
    assert.ok(!SALE_STATES.includes('PrecioEnviado'));
    assert.ok(!SALE_STATES.includes('OfertaEnviada'));
  });
});

describe('extractRevenue', () => {
  test('opportunity null -- no es venta, revenue null', () => {
    assert.deepEqual(extractRevenue(null), { isSale: false, revenue: null, currency: null, saleId: null });
  });

  test('estado previo a PedidoProcesado -- no es venta aunque tenga total', () => {
    const r = extractRevenue({ opportunityId: 'o1', estado: 'OfertaEnviada', total: '100.00' });
    assert.equal(r.isSale, false);
    assert.equal(r.revenue, null);
  });

  test('estado de venta con total NULL -- revenue null, nunca estimado', () => {
    const r = extractRevenue({ opportunityId: 'o1', estado: 'PedidoProcesado', total: null });
    assert.equal(r.isSale, true);
    assert.equal(r.revenue, null);
  });

  test('estado de venta con total real -- revenue numérico real, currency null (sin columna en schema)', () => {
    const r = extractRevenue({ opportunityId: 'o1', estado: 'Enviado', total: '450.00' });
    assert.equal(r.isSale, true);
    assert.equal(r.revenue, 450);
    assert.equal(r.currency, null);
    assert.equal(r.saleId, 'o1');
  });
});

describe('computeAttributedRevenue', () => {
  test('sin ningún registro con revenue real -- total null, nunca 0', () => {
    const r = computeAttributedRevenue([{ revenue: null }, { revenue: null }]);
    assert.equal(r.total, null);
    assert.equal(r.count, 0);
  });

  test('suma solo los registros con revenue numérico real', () => {
    const r = computeAttributedRevenue([{ revenue: 100 }, { revenue: null }, { revenue: 50.5 }]);
    assert.equal(r.total, 150.5);
    assert.equal(r.count, 2);
  });
});
