#!/usr/bin/env node
// phase17Mvp.js — Fase 17: cierra READY_TO_PUBLISH → PublicationAdapter →
// PublishedContent → MockPerformanceSource → PerformanceObservation →
// PerformanceSignal → LearningInsight, usando el ContentItem REAL que ya
// llegó a READY_TO_PUBLISH en la Fase 16 (mismo item, mismo draft, mismo
// HumanReviewRecord — nada nuevo se genera).

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

import { publishReadyContentItem } from './src/publicationService.js';
import { MockPublicationBackend } from './src/publicationAdapter.js';
import { MockPerformanceSource, collectMockPerformanceObservations } from './src/mockPerformanceSource.js';

import { PerformanceLearningStore } from '../performance-learning-intelligence/src/store.js';
import { computeBaseline, createPerformanceSignal } from '../performance-learning-intelligence/src/performanceSignal.js';
import { createLearningInsight } from '../performance-learning-intelligence/src/learningInsight.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PHASE14_EXPORT = join(__dirname, 'exports', 'phase14');
const PHASE16_EXPORT = join(__dirname, 'exports', 'phase16');
const EXPORT_DIR = join(__dirname, 'exports', 'phase17');
const PLI_DATA_DIR = join(__dirname, '..', 'performance-learning-intelligence', 'data', 'intelligence');

function log(...args) { console.log(...args); }

async function main() {
  log('=== FASE 17 — Publication Layer MVP + Performance Return Contract ===\n');

  // --- 1. Reutilizar el ContentItem REAL que llegó a READY_TO_PUBLISH en la Fase 16 ---
  const readyItem = JSON.parse(readFileSync(join(PHASE16_EXPORT, 'approved_item.json'), 'utf8'));
  const humanReview = JSON.parse(readFileSync(join(PHASE16_EXPORT, 'human_review_record.json'), 'utf8'));
  const allDrafts = JSON.parse(readFileSync(join(PHASE14_EXPORT, 'content_drafts.json'), 'utf8'));
  const draft = allDrafts.find((d) => d.content_item_id === readyItem.content_item_id);

  log(`--- 1. ContentItem real (Fase 16): ${readyItem.content_item_id} · status: ${readyItem.production_status} ---`);
  log(`  HumanReviewRecord real: ${humanReview.review_id} (reviewer: ${humanReview.reviewer_id})`);

  // --- 2. Publicación (simulada) ---
  const store = new PerformanceLearningStore(PLI_DATA_DIR); // MISMO store de performance-learning-intelligence, sin modificarlo
  const backend = new MockPublicationBackend();

  log('\n--- 2. Publicación vía MockPublicationBackend (simulación, sin red) ---');
  const publishResult = await publishReadyContentItem({ item: readyItem, draft, humanReview, backend, store, topic: 'tedivina_educativo_fase17' });
  log(`  status: ${publishResult.status}`);
  log(`  PublishedContent.content_id: ${publishResult.publishedContent.content_id}`);
  log(`  publication_mode: ${publishResult.publishedContent.metadata.publication_mode}`);

  // Segunda llamada intencional — demuestra idempotencia real (§6), no solo en test.
  const secondAttempt = await publishReadyContentItem({ item: readyItem, draft, humanReview, backend, store, topic: 'tedivina_educativo_fase17' });
  log(`  segundo intento (misma versión/plataforma): ${secondAttempt.status} (nunca duplicado)`);

  // --- 3. MockPerformanceSource → PerformanceObservation ---
  log('\n--- 3. MockPerformanceSource (fixture sintético fijo, nunca tráfico real) ---');
  const mockSource = new MockPerformanceSource({ views: 340, likes: 22, comments: 3 });
  const observations = await collectMockPerformanceObservations({ publishedContent: publishResult.publishedContent, source: mockSource });
  for (const obs of observations) {
    store.save('performance_observation', obs);
    log(`  [${obs.metric}] ${obs.value} (source: ${obs.source})`);
  }

  // --- 4. Baseline + PerformanceSignal (reutilizado sin modificar) ---
  log('\n--- 4. Baseline sintético mínimo (5 muestras previas) + PerformanceSignal ---');
  const priorViews = [50, 80, 100, 120, 150].map((v, i) => ({ content_id: `previo-fase17-${i}`, platform: readyItem.platform, metric: 'views', value: v }));
  const baseline = computeBaseline({ observations: priorViews, platform: readyItem.platform, contentTypeOf: () => 'social_post', metric: 'views' });
  const viewsObs = observations.find((o) => o.metric === 'views');
  const signal = createPerformanceSignal({ content_id: viewsObs.content_id, metric: 'views', observed_value: viewsObs.value, baseline });
  store.save('performance_signal', signal);
  log(`  baseline: ${baseline.baseline_value} (sample_size=${baseline.sample_size}) → signal_type: ${signal.signal_type}`);

  // --- 5. LearningInsight (reutilizado sin modificar, nunca afirma causalidad) ---
  const insight = createLearningInsight({
    dimension: 'FORMAT', pattern: readyItem.format,
    evidence: `La publicación real de esta pieza (formato "${readyItem.format}") presenta views con dirección ${signal.signal_type} respecto a un baseline sintético de referencia — dato de una sola publicación, confianza baja.`,
    based_on_content_ids: [viewsObs.content_id], based_on_performance_observation_ids: [viewsObs.performance_observation_id], based_on_signal_ids: [signal.signal_id],
    scope: 'fase17_publication_loop (N=1 publicación real de simulación vs baseline sintético N=5)',
    direction: signal.signal_type, confidence: 0.3, confidence_basis: 'una sola publicación (simulada) — insuficiente para cualquier conclusión sólida, solo demuestra que el circuito funciona.',
  });
  store.save('learning_insight', insight);
  log(`\n--- 5. LearningInsight: ${insight.evidence}`);

  // --- 6. Trazabilidad completa ---
  log('\n--- 6. Trazabilidad completa ---');
  log(`  LearningInsight ${insight.insight_id}`);
  log(`  → PerformanceSignal ${signal.signal_id}`);
  log(`  → PerformanceObservation ${viewsObs.performance_observation_id}`);
  log(`  → PublishedContent ${publishResult.publishedContent.content_id} (publication_mode: simulation)`);
  log(`  → HumanReviewRecord ${humanReview.review_id} (reviewer: ${humanReview.reviewer_id})`);
  log(`  → ContentItem ${readyItem.content_item_id} → ContentDraft ${draft.draft_id}`);
  for (const ref of readyItem.source_references) log(`    → [${ref.source_module}] ${ref.reference_id}`);

  // --- 7. Exportación ---
  mkdirSync(EXPORT_DIR, { recursive: true });
  writeFileSync(join(EXPORT_DIR, 'published_content.json'), JSON.stringify(publishResult.publishedContent, null, 2), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'performance_observations.json'), JSON.stringify(observations, null, 2), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'performance_signal.json'), JSON.stringify(signal, null, 2), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'learning_insight.json'), JSON.stringify(insight, null, 2), 'utf8');

  const summary = {
    content_item_id: readyItem.content_item_id,
    publication_status: publishResult.status,
    idempotency_check: secondAttempt.status,
    published_content_id: publishResult.publishedContent.content_id,
    publication_mode: publishResult.publishedContent.metadata.publication_mode,
    metrics_source: 'synthetic_fixture',
    signal_type: signal.signal_type,
    insight_confidence: insight.confidence,
    real_publication_occurred: false,
    generated_at: new Date().toISOString(),
  };
  writeFileSync(join(EXPORT_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  log(`\n--- Exportado a: ${EXPORT_DIR} ---`);
  log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exitCode = 1;
});
