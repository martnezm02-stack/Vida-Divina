import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAttributionType, buildEvidence, EVIDENCE_FIELDS, ATTRIBUTION_TYPES } from '../src/evidenceModel.js';

describe('classifyAttributionType', () => {
  test('sin evidencia -- UNKNOWN', () => {
    assert.equal(classifyAttributionType({}), 'UNKNOWN');
    assert.equal(classifyAttributionType(null), 'UNKNOWN');
  });

  test('DIRECT: trackingId/ctaId/utm/explicitEvent nombran la publicación', () => {
    assert.equal(classifyAttributionType({ trackingId: 't1' }), 'DIRECT');
    assert.equal(classifyAttributionType({ ctaId: 'cta1' }), 'DIRECT');
    assert.equal(classifyAttributionType({ utm: 'utm_source=ig' }), 'DIRECT');
    assert.equal(classifyAttributionType({ explicitEvent: 'referral_click' }), 'DIRECT');
  });

  test('ASSISTED: campaignId compartido, sin señal directa', () => {
    assert.equal(classifyAttributionType({ campaignId: 'camp1' }), 'ASSISTED');
  });

  test('INDIRECT: solo coincidencia de producto', () => {
    assert.equal(classifyAttributionType({ productMatch: true }), 'INDIRECT');
  });

  test('solo timestamp/conversationId/leadId (proximidad, sin señal estructural) -- NUNCA se infiere por proximidad', () => {
    assert.equal(classifyAttributionType({ conversationId: 'c1', leadId: 'l1', timestamp: new Date().toISOString() }), 'UNKNOWN');
  });

  test('prioridad: DIRECT gana sobre ASSISTED/INDIRECT si coexisten', () => {
    assert.equal(classifyAttributionType({ trackingId: 't1', campaignId: 'camp1', productMatch: true }), 'DIRECT');
  });

  test('ATTRIBUTION_TYPES expone exactamente los 4 tipos', () => {
    assert.deepEqual(ATTRIBUTION_TYPES, ['DIRECT', 'INDIRECT', 'ASSISTED', 'UNKNOWN']);
  });
});

describe('buildEvidence', () => {
  test('descarta campos no reconocidos -- nunca deja pasar caption/filename', () => {
    const evidence = buildEvidence({ conversationId: 'c1', caption: 'texto del post', filename: 'a.jpg' });
    assert.deepEqual(evidence, { conversationId: 'c1' });
    assert.ok(!('caption' in evidence));
  });

  test('omite campos null/undefined', () => {
    const evidence = buildEvidence({ trackingId: undefined, campaignId: null, productMatch: true });
    assert.deepEqual(evidence, { productMatch: true });
  });

  test('EVIDENCE_FIELDS cubre todos los campos usados por classifyAttributionType', () => {
    for (const f of ['trackingId', 'ctaId', 'utm', 'explicitEvent', 'campaignId', 'productMatch']) {
      assert.ok(EVIDENCE_FIELDS.includes(f));
    }
  });
});
