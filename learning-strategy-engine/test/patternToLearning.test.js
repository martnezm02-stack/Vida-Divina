import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createMarketingInsight, createDataQualitySignal } from '../../marketing-intelligence-engine/src/marketingInsight.js';
import { buildLearningFromMarketingInsight, buildLearningFromDataQualitySignal, buildStrategyFeedback, buildStrategyLearning } from '../src/patternToLearning.js';

function mi(overrides = {}) {
  return createMarketingInsight({
    scope: 'instagram:format=video (N=8)', platform: 'instagram', category: 'FORMAT_PERFORMANCE',
    insightType: 'FORMAT_PATTERN', title: 'x', summary: 'El formato video presenta un rendimiento superior al benchmark en engagement_rate (31.0% de diferencia relativa).',
    evidence: { metric: 'engagement_rate' }, benchmark: 0.02, delta: 0.31, confidence: 'HIGH', evidenceCount: 8,
    relatedContentIds: ['c1', 'c2'], relatedProductIds: ['TéDivina'],
    ...overrides,
  });
}

describe('buildLearningFromMarketingInsight — Fase 6 (Pattern -> Learning)', () => {
  test('FORMAT_PATTERN positivo -> FORMAT_LEARNING con observation reutilizada tal cual del MarketingInsight', () => {
    const insight = mi();
    const lr = buildLearningFromMarketingInsight(insight);
    assert.equal(lr.learningType, 'FORMAT_LEARNING');
    assert.equal(lr.observation, insight.summary);
    assert.equal(lr.format, 'video');
    assert.equal(lr.confidence, 'HIGH'); // reutilizado tal cual, nunca recalculado
    assert.equal(lr.relatedInsightIds[0], insight.id);
    assert.equal(lr.evidence.marketingInsightId, insight.id);
    assert.deepEqual(lr.relatedContentIds, insight.relatedContentIds);
    assert.match(lr.recommendation, /Evaluar mayor proporción de este formato/);
  });

  test('FORMAT_PATTERN negativo -> plantilla de dirección opuesta (nunca la misma recomendación para señales contrarias)', () => {
    const positive = buildLearningFromMarketingInsight(mi());
    const negative = buildLearningFromMarketingInsight(mi({ delta: -0.31, summary: 'El formato video presenta un rendimiento inferior al benchmark.' }));
    assert.notEqual(positive.recommendation, negative.recommendation);
    assert.equal(positive.evidence.expectedDirection, 'IMPROVE');
    assert.equal(negative.evidence.expectedDirection, 'REDUCE');
  });

  test('insightType desconocido -- nunca fabrica un aprendizaje sin plantilla real', () => {
    const insight = mi({ insightType: 'FORMAT_PATTERN' }); // válido en el contrato de MarketingInsight
    // Forzamos un insightType no mapeado simulando el objeto directamente (defensivo, no debería ocurrir con Fase 8 real).
    const fakeUnknown = { ...insight, insightType: 'SOMETHING_NEW' };
    assert.equal(buildLearningFromMarketingInsight(fakeUnknown), null);
  });

  test('OPPORTUNITY HIGH_ENGAGEMENT_LOW_CONVERSION -- usa exactamente el lenguaje del encargo (Fase 11)', () => {
    const opportunity = mi({ category: 'OPPORTUNITY', insightType: 'HIGH_ENGAGEMENT_LOW_CONVERSION', summary: 'engagement alto sin conversión.', confidence: 'MEDIUM' });
    const lr = buildLearningFromMarketingInsight(opportunity);
    assert.equal(lr.learningType, 'OPPORTUNITY_LEARNING');
    assert.equal(lr.implication, 'Existe una diferencia entre respuesta de audiencia y conversión comercial.');
    assert.equal(lr.recommendation, 'Investigar CTA, oferta o mecanismo de conversión.');
    assert.doesNotMatch(lr.recommendation, /\bcausa\b/i);
  });

  test('PRODUCT_PERFORMANCE -> PRODUCT_LEARNING, product tomado de relatedProductIds', () => {
    const productInsight = mi({ category: 'PRODUCT_PERFORMANCE', insightType: 'PRODUCT_PERFORMANCE', platform: 'all', relatedProductIds: ['TéDivina'] });
    const lr = buildLearningFromMarketingInsight(productInsight);
    assert.equal(lr.learningType, 'PRODUCT_LEARNING');
    assert.equal(lr.product, 'TéDivina');
  });

  test('CONVERSION/REVENUE -> COMMERCIAL_LEARNING, nunca confunde engagement con conversión (Fase 10)', () => {
    const conv = buildLearningFromMarketingInsight(mi({ category: 'CONVERSION', insightType: 'COMMERCIAL_CONVERSION' }));
    const rev = buildLearningFromMarketingInsight(mi({ category: 'REVENUE', insightType: 'COMMERCIAL_REVENUE' }));
    assert.equal(conv.learningType, 'COMMERCIAL_LEARNING');
    assert.equal(rev.learningType, 'COMMERCIAL_LEARNING');
  });
});

describe('buildLearningFromDataQualitySignal — Fase 12/21 (Negative / Data Quality learning)', () => {
  test('nunca se borra la señal negativa -- se registra como DATA_QUALITY_LEARNING con confidence UNKNOWN, sin recomendación', () => {
    const signal = createDataQualitySignal({ category: 'CONVERSION', scope: 'instagram (N=6)', platform: 'instagram', reason: 'MISSING_ATTRIBUTION', explanation: 'Sin evidencia estructural suficiente.' });
    const lr = buildLearningFromDataQualitySignal(signal);
    assert.equal(lr.learningType, 'DATA_QUALITY_LEARNING');
    assert.equal(lr.confidence, 'UNKNOWN');
    assert.equal(lr.recommendation, null);
    assert.equal(lr.evidenceCount, 0);
  });

  test('DATA_QUALITY_LEARNING nunca produce StrategyFeedback (§21: no convertir en recomendación fuerte)', () => {
    const signal = createDataQualitySignal({ category: 'AUDIENCE_SIGNAL', reason: 'INSUFFICIENT_DATA', explanation: 'x' });
    const lr = buildLearningFromDataQualitySignal(signal);
    assert.equal(buildStrategyFeedback(lr), null);
  });
});

describe('buildStrategyFeedback — Fase 13/14', () => {
  test('un LearningRecord real con recomendación produce un StrategyFeedback trazable hacia él', () => {
    const lr = buildLearningFromMarketingInsight(mi());
    const sf = buildStrategyFeedback(lr);
    assert.equal(sf.learningId, lr.id);
    assert.equal(sf.recommendation, lr.recommendation);
    assert.equal(sf.status, 'PROPOSED');
  });
});

describe('buildStrategyLearning — Fase 3/13 (STRATEGY_LEARNING transversal)', () => {
  test('mismo formato + misma dirección en >= 2 plataformas -> un STRATEGY_LEARNING agregado', () => {
    const igVideo = buildLearningFromMarketingInsight(mi({ platform: 'instagram', scope: 'instagram:format=video (N=8)' }));
    const fbVideo = buildLearningFromMarketingInsight(mi({ platform: 'facebook', scope: 'facebook:format=video (N=6)', relatedContentIds: ['c3', 'c4'] }));
    const strategyLearnings = buildStrategyLearning([igVideo, fbVideo]);
    assert.equal(strategyLearnings.length, 1);
    assert.equal(strategyLearnings[0].learningType, 'STRATEGY_LEARNING');
    assert.equal(strategyLearnings[0].platform, null); // transversal
    assert.ok(strategyLearnings[0].relatedInsightIds.includes(igVideo.relatedInsightIds[0]));
    assert.ok(strategyLearnings[0].relatedInsightIds.includes(fbVideo.relatedInsightIds[0]));
  });

  test('un solo grupo/plataforma -- nunca fabrica un STRATEGY_LEARNING sin evidencia transversal real', () => {
    const igOnly = buildLearningFromMarketingInsight(mi());
    assert.equal(buildStrategyLearning([igOnly]).length, 0);
  });
});
