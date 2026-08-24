// mockPerformanceSource.test.js — Fase 17, §9-10. Cierra el loop completo
// PublishedContent → MockPerformanceSource → PerformanceObservation →
// PerformanceSignal → LearningInsight, reutilizando performance-learning-
// intelligence TAL CUAL (sin modificarlo).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MockPerformanceSource, collectMockPerformanceObservations } from '../src/mockPerformanceSource.js';
import { createPublishedContent } from '../../performance-learning-intelligence/src/publishedContent.js';
import { computeBaseline, createPerformanceSignal } from '../../performance-learning-intelligence/src/performanceSignal.js';
import { createLearningInsight } from '../../performance-learning-intelligence/src/learningInsight.js';
import { NOT_AVAILABLE } from '../../performance-learning-intelligence/src/performanceObservation.js';

describe('MockPerformanceSource — datos sintéticos, nunca mezclados con reales', () => {
  test('entrega exactamente las métricas fijas del fixture, marcadas source="synthetic_fixture" en la observación resultante', async () => {
    const publishedContent = createPublishedContent({ platform: 'instagram', published_at: new Date().toISOString(), content_type: 'social_post', format: 'slideshow', topic: 'prueba' });
    const source = new MockPerformanceSource({ views: 120, likes: 8 });
    const observations = await collectMockPerformanceObservations({ publishedContent, source });

    assert.equal(observations.length, 2);
    for (const obs of observations) {
      assert.equal(obs.source, 'synthetic_fixture');
      assert.equal(obs.content_id, publishedContent.content_id);
      assert.equal(obs.requires_human_review, true);
    }
  });

  test('nunca inventa una métrica no incluida en el fixture', async () => {
    const publishedContent = createPublishedContent({ platform: 'instagram', published_at: new Date().toISOString(), content_type: 'social_post', format: 'slideshow', topic: 'prueba' });
    const source = new MockPerformanceSource({ views: 50 });
    const observations = await collectMockPerformanceObservations({ publishedContent, source });
    assert.equal(observations.length, 1);
    assert.equal(observations[0].metric, 'views');
  });
});

describe('Loop completo (§10): PublishedContent → MockPerformanceSource → PerformanceObservation → PerformanceSignal → LearningInsight, sin modificar performance-learning-intelligence', () => {
  test('el resultado nunca afirma causalidad ("funcionó por X") — solo dirección respecto a un baseline', async () => {
    const publishedContent = createPublishedContent({ platform: 'instagram', published_at: new Date().toISOString(), content_type: 'social_post', format: 'slideshow', topic: 'te_divina_educativo' });
    const source = new MockPerformanceSource({ views: 200 });
    const [viewsObservation] = await collectMockPerformanceObservations({ publishedContent, source });

    // Baseline sintético mínimo (5 muestras previas) — igual disciplina que Fase 12: nunca se afirma con menos del mínimo.
    const priorObservations = [10, 20, 30, 40, 50].map((v, i) => ({ content_id: `previo-${i}`, platform: 'instagram', metric: 'views', value: v }));
    const baseline = computeBaseline({ observations: priorObservations, platform: 'instagram', contentTypeOf: () => 'social_post', metric: 'views' });
    assert.equal(baseline.insufficient, false);

    const signal = createPerformanceSignal({ content_id: viewsObservation.content_id, metric: 'views', observed_value: viewsObservation.value, baseline });
    assert.equal(signal.signal_type, 'ABOVE_BASELINE');

    const insight = createLearningInsight({
      dimension: 'FORMAT', pattern: 'slideshow',
      evidence: 'El contenido publicado presenta views con dirección ABOVE_BASELINE respecto al baseline de esta muestra.',
      based_on_content_ids: [viewsObservation.content_id], based_on_performance_observation_ids: [viewsObservation.performance_observation_id], based_on_signal_ids: [signal.signal_id],
      scope: 'fase17_loop_demo (N=1 vs baseline N=5)', direction: signal.signal_type, confidence: 0.4, confidence_basis: 'una sola publicación real de prueba, confianza deliberadamente baja',
    });

    assert.equal(insight.requires_human_review, true);
    assert.doesNotMatch(insight.evidence.toLowerCase(), /funcionó por|causa que|garantiza/);
    // Trazabilidad: el insight apunta al MISMO content_id que produjo el PublishedContent original.
    assert.equal(insight.based_on_content_ids[0], publishedContent.content_id);
  });

  test('una métrica NOT_AVAILABLE en el mock nunca se convierte en 0 dentro del loop', async () => {
    const publishedContent = createPublishedContent({ platform: 'youtube_shorts', published_at: new Date().toISOString(), content_type: 'social_post', format: 'short_video', topic: 'prueba' });
    const source = new MockPerformanceSource({ comments: NOT_AVAILABLE });
    const [obs] = await collectMockPerformanceObservations({ publishedContent, source });
    assert.equal(obs.value, NOT_AVAILABLE);
    assert.notEqual(obs.value, 0);
  });
});
