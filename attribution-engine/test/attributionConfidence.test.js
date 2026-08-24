import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAttributionConfidence, ATTRIBUTION_CONFIDENCE_LEVELS } from '../src/attributionConfidence.js';

describe('classifyAttributionConfidence', () => {
  test('UNKNOWN attributionType -- siempre UNKNOWN confidence', () => {
    assert.equal(classifyAttributionConfidence({ attributionType: 'UNKNOWN', evidence: {} }), 'UNKNOWN');
  });
  test('DIRECT con 2+ señales fuertes -- HIGH', () => {
    assert.equal(classifyAttributionConfidence({ attributionType: 'DIRECT', evidence: { trackingId: 't1', utm: 'x' } }), 'HIGH');
  });
  test('DIRECT con 1 señal -- MEDIUM', () => {
    assert.equal(classifyAttributionConfidence({ attributionType: 'DIRECT', evidence: { ctaId: 'c1' } }), 'MEDIUM');
  });
  test('ASSISTED -- siempre MEDIUM', () => {
    assert.equal(classifyAttributionConfidence({ attributionType: 'ASSISTED', evidence: { campaignId: 'c1' } }), 'MEDIUM');
  });
  test('INDIRECT -- siempre LOW', () => {
    assert.equal(classifyAttributionConfidence({ attributionType: 'INDIRECT', evidence: { productMatch: true } }), 'LOW');
  });
  test('ATTRIBUTION_CONFIDENCE_LEVELS expone HIGH/MEDIUM/LOW/UNKNOWN', () => {
    assert.deepEqual(ATTRIBUTION_CONFIDENCE_LEVELS, ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']);
  });
});
