import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computePerformanceScoresForPlatform } from '../../src/performanceAnalysis/performanceScore.js';
import { computeDerivedMetrics } from '../../src/performanceAnalysis/derivedMetrics.js';

function pub(contentId, { likes = 0, comments = 0, shares = 0, saves = 0, reach = null } = {}) {
  const metrics = { likes: { value: likes }, comments: { value: comments }, shares: { value: shares }, saves: { value: saves } };
  if (reach !== null) metrics.reach = { value: reach };
  return { contentId, metrics, derived: computeDerivedMetrics(metrics) };
}

describe('computePerformanceScoresForPlatform', () => {
  test('con engagement_rate disponible, usa percentil de la tasa (no favorece volumen bruto)', () => {
    // Publicación B tiene MÁS likes en bruto pero MENOR tasa (mayor reach) -- el score debe reflejar la tasa, no el bruto.
    const group = [
      pub('a', { likes: 10, reach: 20 }),  // rate 0.5
      pub('b', { likes: 50, reach: 500 }), // rate 0.1
      pub('c', { likes: 5, reach: 10 }),   // rate 0.5
    ];
    const scores = computePerformanceScoresForPlatform(group);
    assert.equal(scores.get('a').method, 'engagement_rate_percentile');
    assert.ok(scores.get('a').score > scores.get('b').score, 'la publicación con mayor TASA debe superar a la de mayor volumen bruto');
  });

  test('sin engagement_rate en ninguna, cae a fallback de engagement bruto ponderado, method documentado', () => {
    const group = [pub('a', { likes: 10, comments: 2 }), pub('b', { likes: 1 })];
    const scores = computePerformanceScoresForPlatform(group);
    assert.equal(scores.get('a').method, 'weighted_raw_percentile');
    assert.match(scores.get('a').explanation, /engagement bruto ponderado/);
  });

  test('sin ninguna métrica de engagement disponible -- INSUFFICIENT_DATA, score null', () => {
    const group = [{ contentId: 'a', metrics: {}, derived: computeDerivedMetrics({}) }];
    const scores = computePerformanceScoresForPlatform(group);
    assert.equal(scores.get('a').score, null);
    assert.equal(scores.get('a').method, 'INSUFFICIENT_DATA');
  });

  test('reproducible: misma entrada produce el mismo score', () => {
    const group = [pub('a', { likes: 10, reach: 20 }), pub('b', { likes: 50, reach: 500 })];
    const s1 = computePerformanceScoresForPlatform(group);
    const s2 = computePerformanceScoresForPlatform(group);
    assert.equal(s1.get('a').score, s2.get('a').score);
  });
});
