import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectFormatPatterns, detectPlatformComparison, detectEngagementOutliers, detectAmplificationPatterns, detectSchedulePatterns } from '../../src/performanceAnalysis/patternDetection.js';
import { computeDerivedMetrics } from '../../src/performanceAnalysis/derivedMetrics.js';
import { MIN_BASELINE_SAMPLE_SIZE } from '../../src/performanceAnalysis/benchmarks.js';

let seq = 0;
function entry({ platform = 'instagram', format = 'image', likes = 10, comments = 0, shares = 0, saves = 0, reach = 100, publishedAt = null } = {}) {
  const metrics = { likes: { value: likes }, comments: { value: comments }, shares: { value: shares }, saves: { value: saves }, reach: { value: reach } };
  return { contentId: `c${seq++}`, platform, format, publishedAt, metrics, derived: computeDerivedMetrics(metrics) };
}

describe('detectFormatPatterns', () => {
  test('formato con engagement muy superior al baseline de la plataforma genera FORMAT_PATTERN', () => {
    const baselineGroup = Array(MIN_BASELINE_SAMPLE_SIZE).fill(0).map(() => entry({ format: 'video', likes: 5, reach: 100 })); // rate 0.05
    const strongGroup = Array(MIN_BASELINE_SAMPLE_SIZE).fill(0).map(() => entry({ format: 'image', likes: 60, reach: 100 })); // rate 0.6
    const insights = detectFormatPatterns([...baselineGroup, ...strongGroup]);
    const imageInsight = insights.find((i) => i.insightType === 'FORMAT_PATTERN' && i.scope.includes('format=image'));
    assert.ok(imageInsight, 'debe detectar el patrón del formato "image"');
    assert.equal(imageInsight.confidence, 'MEDIUM'); // N=5 < 2x mínimo -> nunca HIGH
    assert.doesNotMatch(imageInsight.explanation, /\bcausa\b/i);
  });

  test('sin volumen suficiente en un formato -- no genera insight para ese grupo', () => {
    const group = [entry({ format: 'carousel' }), entry({ format: 'carousel' })]; // 2 < mínimo
    const insights = detectFormatPatterns(group);
    assert.equal(insights.filter((i) => i.scope.includes('carousel')).length, 0);
  });
});

describe('detectPlatformComparison', () => {
  test('compara mediana entre dos plataformas solo con volumen suficiente en ambas', () => {
    const ig = Array(MIN_BASELINE_SAMPLE_SIZE).fill(0).map(() => entry({ platform: 'instagram', likes: 60, reach: 100 }));
    const fb = Array(MIN_BASELINE_SAMPLE_SIZE).fill(0).map(() => entry({ platform: 'facebook', likes: 5, reach: 100 }));
    const insights = detectPlatformComparison([...ig, ...fb]);
    assert.ok(insights.some((i) => i.insightType === 'PLATFORM_COMPARISON'));
  });

  test('con una sola plataforma presente -- ninguna comparación (nada que comparar)', () => {
    const only = Array(MIN_BASELINE_SAMPLE_SIZE).fill(0).map(() => entry({ platform: 'instagram' }));
    assert.equal(detectPlatformComparison(only).length, 0);
  });
});

describe('detectEngagementOutliers / detectAmplificationPatterns', () => {
  test('publicación individual muy por encima del baseline se marca como patrón de engagement', () => {
    const baseline = Array(MIN_BASELINE_SAMPLE_SIZE).fill(0).map(() => entry({ likes: 10, reach: 100 }));
    const outlier = entry({ likes: 90, reach: 100 });
    const insights = detectEngagementOutliers([...baseline, outlier]);
    assert.ok(insights.some((i) => i.basedOnContentIds.includes(outlier.contentId)));
  });

  test('shares altos generan AMPLIFICATION_PATTERN', () => {
    const baseline = Array(MIN_BASELINE_SAMPLE_SIZE).fill(0).map(() => entry({ shares: 1 }));
    const outlier = entry({ shares: 50 });
    const insights = detectAmplificationPatterns([...baseline, outlier]);
    assert.ok(insights.some((i) => i.metric === 'shares' && i.basedOnContentIds.includes(outlier.contentId)));
  });
});

describe('detectSchedulePatterns', () => {
  test('sin timestamps reales -- ningún insight (nunca inventa horario)', () => {
    const group = Array(MIN_BASELINE_SAMPLE_SIZE).fill(0).map(() => entry({ publishedAt: null }));
    assert.equal(detectSchedulePatterns(group).length, 0);
  });

  test('con suficientes publicaciones en la misma hora UTC y rendimiento superior, detecta patrón', () => {
    const baseline = Array(MIN_BASELINE_SAMPLE_SIZE).fill(0).map(() => entry({ likes: 5, reach: 100, publishedAt: '2026-08-01T20:00:00Z' }));
    const strongHour = Array(MIN_BASELINE_SAMPLE_SIZE).fill(0).map(() => entry({ likes: 80, reach: 100, publishedAt: '2026-08-02T09:00:00Z' }));
    const insights = detectSchedulePatterns([...baseline, ...strongHour]);
    assert.ok(insights.some((i) => i.insightType === 'SCHEDULE_PATTERN' && i.scope.includes('hora_utc=9')));
  });
});
