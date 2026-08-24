import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createMarketingInsight, createDataQualitySignal, MARKETING_CONFIDENCE_LEVELS } from '../src/marketingInsight.js';

function validFields(overrides = {}) {
  return {
    scope: 'instagram:format=image (N=8)', platform: 'instagram', category: 'FORMAT_PERFORMANCE',
    insightType: 'FORMAT_PATTERN', title: 'Título', summary: 'El formato presenta un engagement 31% superior a la mediana.',
    evidence: { metric: 'engagement_rate' }, confidence: 'HIGH', evidenceCount: 8, relatedContentIds: ['c1', 'c2'],
    ...overrides,
  };
}

describe('MarketingInsight — contrato', () => {
  test('campos requeridos: rechaza sin scope/category/insightType/title/summary/evidence', () => {
    for (const field of ['scope', 'category', 'insightType', 'title', 'summary', 'evidence']) {
      const fields = validFields();
      delete fields[field];
      assert.throws(() => createMarketingInsight(fields), new RegExp(field));
    }
  });

  test('confidence debe ser uno de HIGH/MEDIUM/LOW/UNKNOWN', () => {
    assert.deepEqual(MARKETING_CONFIDENCE_LEVELS, ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']);
    assert.throws(() => createMarketingInsight(validFields({ confidence: 'CERTAIN' })), /confidence/);
    assert.doesNotThrow(() => createMarketingInsight(validFields({ confidence: 'UNKNOWN' })));
  });

  test('evidenceCount debe ser >= 1', () => {
    assert.throws(() => createMarketingInsight(validFields({ evidenceCount: 0 })), /evidenceCount/);
  });

  test('relatedContentIds no puede estar vacío -- trazabilidad obligatoria', () => {
    assert.throws(() => createMarketingInsight(validFields({ relatedContentIds: [] })), /relatedContentIds/);
  });

  test('rechaza lenguaje causal en summary', () => {
    assert.throws(() => createMarketingInsight(validFields({ summary: 'Este formato causa más ventas.' })), /causal/);
    assert.throws(() => createMarketingInsight(validFields({ summary: 'Este video garantiza conversión.' })), /causal/);
  });

  test('relatedPublicationIds por defecto es igual a relatedContentIds (mismo mapeo que attribution-engine)', () => {
    const insight = createMarketingInsight(validFields());
    assert.deepEqual(insight.relatedPublicationIds, insight.relatedContentIds);
  });

  test('relatedProductIds/relatedCampaignIds por defecto son arreglos vacíos, nunca null', () => {
    const insight = createMarketingInsight(validFields());
    assert.deepEqual(insight.relatedProductIds, []);
    assert.deepEqual(insight.relatedCampaignIds, []);
  });

  test('recommendationReady por defecto es true, pero nunca ejecuta ninguna acción (solo un dato estructurado)', () => {
    const insight = createMarketingInsight(validFields());
    assert.equal(insight.recommendationReady, true);
    assert.equal(typeof insight.id, 'string');
    assert.ok(insight.generatedAt);
  });

  test('el objeto resultante es inmutable', () => {
    const insight = createMarketingInsight(validFields());
    assert.throws(() => { insight.confidence = 'LOW'; }, TypeError);
  });
});

describe('DataQualitySignal', () => {
  test('requiere category/reason/explanation', () => {
    assert.throws(() => createDataQualitySignal({ reason: 'INSUFFICIENT_DATA', explanation: 'x' }), /category/);
    assert.throws(() => createDataQualitySignal({ category: 'CONVERSION', explanation: 'x' }), /reason/);
    assert.throws(() => createDataQualitySignal({ category: 'CONVERSION', reason: 'INSUFFICIENT_DATA' }), /explanation/);
  });

  test('distingue "sin evidencia suficiente" de "funciona mal" -- nunca es un MarketingInsight', () => {
    const signal = createDataQualitySignal({ category: 'PRODUCT_PERFORMANCE', reason: 'INSUFFICIENT_DATA', explanation: 'Sin product_ref registrado.' });
    assert.equal(signal.reason, 'INSUFFICIENT_DATA');
    assert.equal('confidence' in signal, false); // un DataQualitySignal no tiene confidence -- no es una conclusión, es la ausencia de una
  });
});
