import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPerformanceInsight, INSIGHT_TYPES } from '../../src/performanceAnalysis/performanceInsight.js';

function base(overrides = {}) {
  return {
    platform: 'instagram', scope: 'instagram (N=10)', insightType: 'ENGAGEMENT_PATTERN', metric: 'engagement_rate',
    value: 0.5, benchmark: 0.3, delta: 0.4, confidence: 'MEDIUM', evidenceCount: 10,
    explanation: 'Este grupo presenta engagement superior al benchmark.', basedOnContentIds: ['c1'],
    ...overrides,
  };
}

describe('createPerformanceInsight', () => {
  test('crea un insight válido con todos los campos requeridos', () => {
    const insight = createPerformanceInsight(base());
    assert.ok(insight.id);
    assert.ok(insight.generatedAt);
    assert.equal(insight.source, 'performance_analysis_engine');
  });

  test('rechaza insightType inválido', () => {
    assert.throws(() => createPerformanceInsight(base({ insightType: 'INVENTADO' })), /insightType/);
  });

  test('rechaza lenguaje causal en explanation -- nunca "causa"/"garantiza"', () => {
    assert.throws(() => createPerformanceInsight(base({ explanation: 'Este formato causa más engagement.' })), /causal/);
    assert.throws(() => createPerformanceInsight(base({ explanation: 'Esto garantiza mejores resultados.' })), /causal/);
  });

  test('exige basedOnContentIds no vacío -- ningún insight sin evidencia trazable', () => {
    assert.throws(() => createPerformanceInsight(base({ basedOnContentIds: [] })), /basedOnContentIds/);
  });

  test('exige evidenceCount >= 1', () => {
    assert.throws(() => createPerformanceInsight(base({ evidenceCount: 0 })), /evidenceCount/);
  });

  test('INSIGHT_TYPES cubre los tipos usados por patternDetection.js', () => {
    for (const t of ['TOP_PERFORMER', 'UNDERPERFORMER', 'FORMAT_PATTERN', 'PLATFORM_COMPARISON', 'ENGAGEMENT_PATTERN', 'AMPLIFICATION_PATTERN', 'SCHEDULE_PATTERN']) {
      assert.ok(INSIGHT_TYPES.includes(t));
    }
  });
});
