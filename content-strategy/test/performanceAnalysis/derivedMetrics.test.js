import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeDerivedMetrics, derivedValue } from '../../src/performanceAnalysis/derivedMetrics.js';
import { NOT_AVAILABLE } from '../../../performance-learning-intelligence/src/performanceObservation.js';

function m(obj) {
  const metrics = {};
  for (const [k, v] of Object.entries(obj)) metrics[k] = { value: v };
  return metrics;
}

describe('computeDerivedMetrics', () => {
  test('engagement_rate = (likes+comments+shares+saves)/reach cuando reach está disponible', () => {
    const derived = computeDerivedMetrics(m({ likes: 10, comments: 5, shares: 3, saves: 2, reach: 100 }));
    assert.equal(derivedValue(derived, 'engagement_rate'), 0.2);
    assert.equal(derived.engagement_rate.denominator_metric, 'reach');
  });

  test('sin reach, usa views como fallback documentado (nunca en silencio)', () => {
    const derived = computeDerivedMetrics(m({ likes: 10, comments: 0, shares: 0, saves: 0, views: 50 }));
    assert.equal(derivedValue(derived, 'engagement_rate'), 0.2);
    assert.equal(derived.engagement_rate.denominator_metric, 'views');
  });

  test('division por cero: reach=0 -- NOT_AVAILABLE, nunca Infinity/NaN', () => {
    const derived = computeDerivedMetrics(m({ likes: 10, comments: 0, shares: 0, saves: 0, reach: 0, views: 0 }));
    assert.equal(derivedValue(derived, 'engagement_rate'), NOT_AVAILABLE);
  });

  test('sin reach NI views -- NOT_AVAILABLE explícito', () => {
    const derived = computeDerivedMetrics(m({ likes: 10 }));
    assert.equal(derivedValue(derived, 'engagement_rate'), NOT_AVAILABLE);
    assert.equal(derived.engagement_rate.denominator_metric, null);
  });

  test('numerador parcialmente NOT_AVAILABLE -- toda la tasa es NOT_AVAILABLE (nunca suma parcial)', () => {
    const metrics = m({ likes: 10, reach: 100 });
    metrics.comments = { value: NOT_AVAILABLE };
    const derived = computeDerivedMetrics(metrics);
    assert.equal(derivedValue(derived, 'engagement_rate'), NOT_AVAILABLE);
  });

  test('view_rate NUNCA usa fallback a views (sería circular) -- solo reach real', () => {
    const derived = computeDerivedMetrics(m({ views: 340, reach: 0 }));
    assert.equal(derivedValue(derived, 'view_rate'), NOT_AVAILABLE);
  });

  test('click_rate solo con impressions disponible', () => {
    const derived = computeDerivedMetrics(m({ clicks: 4, impressions: 200 }));
    assert.equal(derivedValue(derived, 'click_rate'), 0.02);
    const derivedSinImpr = computeDerivedMetrics(m({ clicks: 4 }));
    assert.equal(derivedValue(derivedSinImpr, 'click_rate'), NOT_AVAILABLE);
  });
});
