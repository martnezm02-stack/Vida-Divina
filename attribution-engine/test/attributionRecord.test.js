import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createAttributionRecord } from '../src/attributionRecord.js';

function base(overrides = {}) {
  return {
    contentId: 'c1', publicationId: 'c1', platform: 'instagram', externalPublicationId: 'ig_1',
    attributionType: 'UNKNOWN', attributionWindow: '7d', confidence: 'UNKNOWN', evidence: {},
    explanation: 'Sin evidencia estructural dentro de la ventana.',
    ...overrides,
  };
}

describe('createAttributionRecord', () => {
  test('crea un registro UNKNOWN válido sin conversationId/leadId/saleId', () => {
    const r = createAttributionRecord(base());
    assert.ok(r.id);
    assert.ok(r.attributedAt);
    assert.equal(r.conversationId, null);
    assert.equal(r.revenue, null);
  });

  test('crea un registro DIRECT con toda la cadena real', () => {
    const r = createAttributionRecord(base({
      attributionType: 'DIRECT', confidence: 'HIGH', evidence: { trackingId: 't1' },
      conversationId: 'conv1', leadId: 'lead1', saleId: 'lead1', revenue: 450, currency: null,
      explanation: 'Evidencia directa: trackingId coincide.',
    }));
    assert.equal(r.attributionType, 'DIRECT');
    assert.equal(r.saleId, 'lead1');
    assert.equal(r.revenue, 450);
  });

  test('rechaza attributionType/attributionWindow/confidence inválidos', () => {
    assert.throws(() => createAttributionRecord(base({ attributionType: 'CAUSAL' })), /attributionType/);
    assert.throws(() => createAttributionRecord(base({ attributionWindow: '90d' })), /attributionWindow/);
    assert.throws(() => createAttributionRecord(base({ confidence: 'CERTAIN' })), /confidence/);
  });

  test('rechaza leadId/saleId sin conversationId -- nunca se salta un eslabón de la cadena', () => {
    assert.throws(() => createAttributionRecord(base({ leadId: 'lead1' })), /conversationId/);
    assert.throws(() => createAttributionRecord(base({ saleId: 'lead1' })), /conversationId/);
  });

  test('exige evidence y explanation', () => {
    assert.throws(() => createAttributionRecord({ ...base(), evidence: undefined }), /evidence/);
    assert.throws(() => createAttributionRecord({ ...base(), explanation: '' }), /explanation/);
  });

  test('exige contentId/publicationId/platform', () => {
    assert.throws(() => createAttributionRecord({ ...base(), contentId: undefined }), /contentId/);
    assert.throws(() => createAttributionRecord({ ...base(), publicationId: undefined }), /publicationId/);
    assert.throws(() => createAttributionRecord({ ...base(), platform: undefined }), /platform/);
  });
});
