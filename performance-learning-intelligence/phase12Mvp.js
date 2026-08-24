#!/usr/bin/env node
// phase12Mvp.js — Fase 12: primer loop de Performance & Learning Intelligence.
//
// PUBLICACIÓN → MÉTRICAS OBSERVADAS → PERFORMANCE SIGNAL → INFERENCIA →
// LEARNING INSIGHT → (futura) CONTENT OPPORTUNITY.
//
// REAL PERFORMANCE DATA = NOT AVAILABLE — se verificó (grep en todo el
// proyecto) que no existen métricas reales de publicaciones de Vida Divina
// almacenadas localmente. Todo el fixture de esta corrida está marcado
// source: "synthetic_fixture" — nunca se presenta como dato real.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

import { createPublishedContent } from './src/publishedContent.js';
import { createPerformanceObservation, NOT_AVAILABLE } from './src/performanceObservation.js';
import { computeBaseline, createPerformanceSignal, MIN_BASELINE_SAMPLE_SIZE } from './src/performanceSignal.js';
import { createLearningInsight } from './src/learningInsight.js';
import { createLearningHypothesis } from './src/learningHypothesis.js';
import { PerformanceLearningStore } from './src/store.js';
import { ManualPerformanceSource } from './src/performanceSource.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const EXPORT_DIR = join(__dirname, 'exports', 'phase12');

function log(...args) { console.log(...args); }

// --- Fixture sintético (§12): 10 contenidos, 2 plataformas, 3 formatos, 3
// hooks. source SIEMPRE "synthetic_fixture" — nunca se hace pasar por dato
// real. Métricas ausentes (NOT_AVAILABLE) reflejan limitaciones reales de
// cada plataforma/formato (ej. un slideshow de Instagram no reporta
// completion_rate como un video).
const FIXTURE = [
  { platform: 'instagram', content_type: 'reel', format: 'slideshow', hook: 'question', topic: 'detox_tea', metrics: { views: 1200, likes: 80, comments: 10, shares: NOT_AVAILABLE, completion_rate: NOT_AVAILABLE } },
  { platform: 'instagram', content_type: 'reel', format: 'slideshow', hook: 'statistic', topic: 'detox_tea', metrics: { views: 1500, likes: 95, comments: 12, shares: NOT_AVAILABLE, completion_rate: NOT_AVAILABLE } },
  { platform: 'instagram', content_type: 'reel', format: 'slideshow', hook: 'question', topic: 'detox_tea', metrics: { views: 1800, likes: 110, comments: 15, shares: NOT_AVAILABLE, completion_rate: NOT_AVAILABLE } },
  { platform: 'instagram', content_type: 'reel', format: 'talking_head', hook: 'statement', topic: 'detox_tea', metrics: { views: 600, likes: 30, comments: 5, shares: 8, completion_rate: 0.35 } },
  { platform: 'instagram', content_type: 'reel', format: 'talking_head', hook: 'question', topic: 'detox_tea', metrics: { views: 750, likes: 40, comments: 6, shares: 10, completion_rate: 0.55 } },
  { platform: 'youtube_shorts', content_type: 'short', format: 'talking_head', hook: 'question', topic: 'detox_tea', metrics: { views: 3000, likes: 200, comments: 25, shares: 40, completion_rate: 0.60 } },
  { platform: 'youtube_shorts', content_type: 'short', format: 'talking_head', hook: 'statement', topic: 'detox_tea', metrics: { views: 2800, likes: 150, comments: 18, shares: 30, completion_rate: 0.40 } },
  { platform: 'youtube_shorts', content_type: 'short', format: 'talking_head', hook: 'question', topic: 'detox_tea', metrics: { views: 3500, likes: 230, comments: 28, shares: 45, completion_rate: 0.62 } },
  { platform: 'youtube_shorts', content_type: 'short', format: 'text_overlay', hook: 'statement', topic: 'detox_tea', metrics: { views: 1000, likes: 60, comments: 8, shares: 15, completion_rate: 0.30 } },
  { platform: 'youtube_shorts', content_type: 'short', format: 'text_overlay', hook: 'statistic', topic: 'detox_tea', metrics: { views: 1100, likes: 65, comments: 9, shares: 16, completion_rate: 0.33 } },
].slice(0, 10);

async function main() {
  log('=== FASE 12 — Performance & Learning Intelligence MVP ===\n');
  log('REAL PERFORMANCE DATA = NOT AVAILABLE (verificado: sin métricas reales de Vida Divina en el proyecto). Todo lo siguiente es source: "synthetic_fixture".\n');

  const store = new PerformanceLearningStore(join(DATA_DIR, 'intelligence'));
  const source = new ManualPerformanceSource(FIXTURE);
  const fixtureRecords = await source.fetch();

  log(`--- 1. Ingesta vía ManualPerformanceSource (§11): ${fixtureRecords.length} contenidos ---`);

  const contentTypeById = new Map();
  const items = [];
  for (const rec of fixtureRecords) {
    const content = createPublishedContent({
      platform: rec.platform, published_at: '2026-08-01T00:00:00Z', content_type: rec.content_type, format: rec.format, topic: rec.topic,
      product_ref: 'TéDivina', hook_pattern_ref: rec.hook,
    });
    store.save('published_content', content);
    contentTypeById.set(content.content_id, content.content_type);

    const observations = {};
    for (const [metric, value] of Object.entries(rec.metrics)) {
      const obs = createPerformanceObservation({ content_id: content.content_id, platform: rec.platform, metric, value, observed_at: '2026-08-07T00:00:00Z', confidence: 0.8, confidence_basis: 'fixture sintético controlado', source: 'synthetic_fixture' });
      store.save('performance_observation', obs);
      observations[metric] = obs;
    }
    items.push({ content, format: rec.format, hook: rec.hook, platform: rec.platform, observations });
    log(`  [${rec.platform}/${rec.format}/hook:${rec.hook}] views=${rec.metrics.views} completion_rate=${rec.metrics.completion_rate === NOT_AVAILABLE ? 'NOT_AVAILABLE' : rec.metrics.completion_rate}`);
  }

  // --- 2. Baseline + PerformanceSignal por plataforma+content_type+métrica (§4-5) ---
  log('\n--- 2. Baseline (mediana, MIN_BASELINE_SAMPLE_SIZE=5) + PerformanceSignal ---');
  const allObservations = store.loadAll('performance_observation');
  const contentTypeOf = (id) => contentTypeById.get(id) ?? null;

  const metricsToSignal = ['views', 'completion_rate'];
  const baselines = {};
  for (const platform of ['instagram', 'youtube_shorts']) {
    for (const metric of metricsToSignal) {
      const baseline = computeBaseline({ observations: allObservations, platform, contentTypeOf, metric });
      baselines[`${platform}::${metric}`] = baseline;
      log(`  baseline ${platform}/${metric}: ${baseline.insufficient ? 'INSUFICIENTE' : baseline.baseline_value} (sample_size=${baseline.sample_size}, method=${baseline.baseline_method})`);
    }
  }

  for (const item of items) {
    item.signals = {};
    for (const metric of metricsToSignal) {
      const obs = item.observations[metric];
      const baseline = baselines[`${item.platform}::${metric}`];
      const signal = createPerformanceSignal({ content_id: item.content.content_id, metric, observed_value: obs.value, baseline });
      store.save('performance_signal', signal);
      item.signals[metric] = signal;
    }
    log(`  ${item.platform}/${item.format}/hook:${item.hook} → views:${item.signals.views.signal_type} completion_rate:${item.signals.completion_rate.signal_type}`);
  }

  // --- 3. LearningInsight (§6): agrupa por hook_pattern_ref dentro de cada
  // plataforma+métrica y reporta el patrón REAL encontrado — nunca se fuerza
  // una narrativa, se agrupa lo que efectivamente resultó de los signals.
  log('\n--- 3. LearningInsight (agrupado por hook, patrón real observado en la muestra) ---');
  const insights = [];
  for (const metric of metricsToSignal) {
    const byHook = new Map();
    for (const item of items) {
      if (item.signals[metric].signal_type === 'INSUFFICIENT_DATA') continue;
      const key = item.hook;
      if (!byHook.has(key)) byHook.set(key, []);
      byHook.get(key).push(item);
    }
    for (const [hook, group] of byHook) {
      if (group.length < 2) continue; // sin al menos 2 contenidos, no hay patrón que reportar
      const directions = group.map((g) => g.signals[metric].signal_type);
      const aboveCount = directions.filter((d) => d === 'ABOVE_BASELINE').length;
      const belowCount = directions.filter((d) => d === 'BELOW_BASELINE').length;
      let direction;
      if (aboveCount === group.length) direction = 'ABOVE_BASELINE';
      else if (belowCount === group.length) direction = 'BELOW_BASELINE';
      else if (aboveCount > belowCount) direction = 'ABOVE_BASELINE';
      else if (belowCount > aboveCount) direction = 'BELOW_BASELINE';
      else direction = 'NORMAL';

      const insight = createLearningInsight({
        dimension: 'HOOK_TYPE',
        pattern: hook,
        evidence: `${group.length} de ${items.length} contenidos con hook "${hook}" presentan ${metric} con dirección ${direction} respecto al baseline en esta muestra (detalle: ${directions.join(', ')}).`,
        based_on_content_ids: group.map((g) => g.content.content_id),
        based_on_performance_observation_ids: group.map((g) => g.observations[metric].performance_observation_id),
        based_on_signal_ids: group.map((g) => g.signals[metric].signal_id),
        scope: `synthetic_fixture_sample (N=${items.length})`,
        direction,
        confidence: 0.4, // muestra muy pequeña — confianza deliberadamente baja
        confidence_basis: `Solo ${group.length} contenidos con este hook en un fixture sintético de ${items.length} — confianza baja hasta tener datos reales.`,
      });
      store.save('learning_insight', insight);
      insights.push(insight);
      log(`  [${metric}] hook:${hook} → ${direction} (${group.length} contenidos)`);
    }
  }

  // --- 4. LearningHypothesis (§7) — una por insight con dirección no-mixta ---
  log('\n--- 4. LearningHypothesis ---');
  const hypotheses = [];
  for (const insight of insights) {
    if (insight.direction === 'NORMAL') continue; // sin señal clara, no se fuerza una hipótesis
    const hyp = createLearningHypothesis({
      dimension: insight.dimension,
      hypothesis: `Probar más contenidos con hook "${insight.pattern}" podría sostener una métrica ${insight.direction === 'ABOVE_BASELINE' ? 'superior' : 'inferior'} al baseline actual — esto es especulativo, basado en una muestra sintética pequeña.`,
      based_on_insight_id: insight.insight_id,
      testable_prediction: `Si se publican ${MIN_BASELINE_SAMPLE_SIZE} contenidos reales adicionales con hook "${insight.pattern}", se espera (a confirmar) que su mediana quede en la misma dirección (${insight.direction}) respecto al baseline observado entonces.`,
    });
    store.save('learning_hypothesis', hyp);
    hypotheses.push(hyp);
    log(`  ${hyp.hypothesis}`);
  }

  // --- 5. Exportación ---
  mkdirSync(EXPORT_DIR, { recursive: true });
  writeFileSync(join(EXPORT_DIR, 'published_content.jsonl'), store.loadAll('published_content').map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  writeFileSync(join(EXPORT_DIR, 'performance_observations.jsonl'), store.loadAll('performance_observation').map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  writeFileSync(join(EXPORT_DIR, 'performance_signals.jsonl'), store.loadAll('performance_signal').map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  writeFileSync(join(EXPORT_DIR, 'learning_insights.jsonl'), store.loadAll('learning_insight').map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  writeFileSync(join(EXPORT_DIR, 'learning_hypotheses.jsonl'), store.loadAll('learning_hypothesis').map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

  const summary = {
    real_performance_data: 'NOT_AVAILABLE',
    fixture_source: 'synthetic_fixture',
    contents_processed: items.length,
    platforms: [...new Set(items.map((i) => i.platform))],
    formats: [...new Set(items.map((i) => i.format))],
    hooks: [...new Set(items.map((i) => i.hook))],
    baselines,
    insights_count: insights.length,
    hypotheses_count: hypotheses.length,
    generated_at: new Date().toISOString(),
  };
  writeFileSync(join(EXPORT_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  log(`\n--- Exportado a: ${EXPORT_DIR} ---`);
  log(JSON.stringify({ ...summary, baselines: undefined }, null, 2));
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exitCode = 1;
});
