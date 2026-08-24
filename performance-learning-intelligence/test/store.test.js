// store.test.js — Fase 12. Trazabilidad completa: PublishedContent →
// PerformanceObservation → PerformanceSignal → LearningInsight →
// LearningHypothesis, nunca perdiendo content_id. También cubre
// ManualPerformanceSource (§11).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PerformanceLearningStore } from '../src/store.js';
import { createPublishedContent } from '../src/publishedContent.js';
import { createPerformanceObservation } from '../src/performanceObservation.js';
import { computeBaseline, createPerformanceSignal } from '../src/performanceSignal.js';
import { createLearningInsight } from '../src/learningInsight.js';
import { createLearningHypothesis } from '../src/learningHypothesis.js';
import { ManualPerformanceSource } from '../src/performanceSource.js';

describe('PerformanceLearningStore — trazabilidad completa, content_id nunca se pierde', () => {
  let dir, store;
  before(() => { dir = mkdtempSync(join(tmpdir(), 'pli-fase12-')); store = new PerformanceLearningStore(dir); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('cadena real: PublishedContent → PerformanceObservation → PerformanceSignal → LearningInsight → LearningHypothesis', () => {
    const content = createPublishedContent({ platform: 'instagram', published_at: '2026-08-01T00:00:00Z', content_type: 'reel', format: 'slideshow', topic: 'detox_tea', product_ref: 'TéDivina' });
    store.save('published_content', content);

    const observations = [];
    for (let i = 0; i < 5; i++) {
      const o = createPerformanceObservation({ content_id: `filler-${i}`, platform: 'instagram', metric: 'views', value: 100 + i * 10, observed_at: '2026-08-02T00:00:00Z', confidence: 0.9, confidence_basis: 'fixture', source: 'synthetic_fixture' });
      observations.push(o);
      store.save('performance_observation', o);
    }
    const contentObs = createPerformanceObservation({ content_id: content.content_id, platform: 'instagram', metric: 'views', value: 200, observed_at: '2026-08-03T00:00:00Z', confidence: 0.9, confidence_basis: 'fixture', source: 'synthetic_fixture' });
    store.save('performance_observation', contentObs);

    const baseline = computeBaseline({ observations, platform: 'instagram', contentTypeOf: () => 'reel', metric: 'views' });
    const signal = createPerformanceSignal({ content_id: content.content_id, metric: 'views', observed_value: contentObs.value, baseline });
    store.save('performance_signal', signal);

    const insight = createLearningInsight({
      dimension: 'FORMAT', pattern: 'slideshow', evidence: 'El contenido con formato slideshow presenta una métrica superior al baseline en esta muestra.',
      based_on_content_ids: [content.content_id], based_on_performance_observation_ids: [contentObs.performance_observation_id], based_on_signal_ids: [signal.signal_id],
      scope: 'own_content_sample (N=1 vs baseline N=5)', direction: signal.signal_type, confidence: 0.6, confidence_basis: 'una sola observación propia contra baseline',
    });
    store.save('learning_insight', insight);

    const hypothesis = createLearningHypothesis({
      dimension: 'FORMAT', hypothesis: 'Probar más publicaciones en formato slideshow podría sostener una métrica superior al baseline.',
      based_on_insight_id: insight.insight_id, testable_prediction: 'Publicar 5 slideshows adicionales y verificar si su mediana de views sigue ABOVE_BASELINE.',
    });
    store.save('learning_hypothesis', hypothesis);

    // Trazabilidad manual (sin traceReference — este store es propio, no de website-intelligence):
    const loadedHyp = store.loadAll('learning_hypothesis').find((h) => h.hypothesis_id === hypothesis.hypothesis_id);
    const loadedInsight = store.loadAll('learning_insight').find((i) => i.insight_id === loadedHyp.based_on_insight_id);
    const loadedSignal = store.loadAll('performance_signal').find((s) => loadedInsight.based_on_signal_ids.includes(s.signal_id));
    const loadedContent = store.loadAll('published_content').find((c) => c.content_id === loadedInsight.based_on_content_ids[0]);

    assert.equal(loadedSignal.content_id, loadedContent.content_id, 'content_id debe ser idéntico en toda la cadena');
    assert.equal(loadedContent.content_id, content.content_id);
  });
});

describe('ManualPerformanceSource — §11, sin credenciales ni dependencias', () => {
  test('entrega el dataset manual tal cual, sin red ni instalación', async () => {
    const dataset = [{ a: 1 }, { a: 2 }];
    const source = new ManualPerformanceSource(dataset);
    const result = await source.fetch();
    assert.deepEqual(result, dataset);
    assert.equal(source.name, 'manual_performance_source');
  });
});
