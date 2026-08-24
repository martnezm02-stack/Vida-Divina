// patternDetection.js — Performance Analysis Engine, Fase 6. Reutiliza
// EXACTAMENTE computeBaseline()/createPerformanceSignal()/
// RELATIVE_CHANGE_THRESHOLD de performance-learning-intelligence/src/
// performanceSignal.js (Fase 12 §5) — nunca reimplementa el umbral ±10% ni
// el método de baseline (mediana). Un "content_id" sintético como
// "format:image" o "platform:instagram" identifica un GRUPO, no un
// PublishedContent real — se documenta explícitamente en cada insight vía
// basedOnContentIds (que sí lleva los content_id reales del grupo).
//
// Nunca declara causalidad — createPerformanceInsight ya lo impide a nivel
// de contrato (assertNoCausalLanguage).

import { NOT_AVAILABLE } from '../../../performance-learning-intelligence/src/performanceObservation.js';
import { computeBaseline, createPerformanceSignal, RELATIVE_CHANGE_THRESHOLD, MIN_BASELINE_SAMPLE_SIZE } from '../../../performance-learning-intelligence/src/performanceSignal.js';
import { metricValue } from './metricsNormalizer.js';
import { derivedValue } from './derivedMetrics.js';
import { createPerformanceInsight } from './performanceInsight.js';
import { classifyConfidence } from './confidence.js';

function metricGetter(p, metric) {
  const d = derivedValue(p.derived, metric);
  if (d !== NOT_AVAILABLE) return d;
  return metricValue(p.metrics, metric);
}

function toObs(enriched, metric) {
  return enriched.map((p) => ({ content_id: p.contentId, platform: p.platform, metric, value: metricGetter(p, metric) }));
}

function insightFromSignal({ signal, platform, scope, insightType, metric, groupSampleSize, contentIds }) {
  if (signal.signal_type === 'INSUFFICIENT_DATA' || signal.signal_type === 'NORMAL') return null;
  const deltaAbs = signal.relative_change === null ? null : Math.abs(signal.relative_change);
  const confidence = classifyConfidence({ evidenceCount: groupSampleSize, deltaAbs, allMetricsAvailable: true });
  const direction = signal.signal_type === 'ABOVE_BASELINE' ? 'presenta un rendimiento superior al' : 'presenta un rendimiento inferior al';
  return createPerformanceInsight({
    platform, scope, insightType, metric,
    value: signal.observed_value, benchmark: signal.baseline_value, delta: signal.relative_change,
    confidence, evidenceCount: groupSampleSize,
    explanation: `El grupo analizado (${scope}) ${direction} benchmark en "${metric}" (${(deltaAbs * 100).toFixed(1)}% de diferencia relativa, umbral ±${RELATIVE_CHANGE_THRESHOLD * 100}%). Se observa asociación, no se afirma causalidad.`,
    basedOnContentIds: contentIds,
  });
}

/** Compara cada formato con volumen suficiente contra el baseline general de su plataforma (todos los formatos). */
export function detectFormatPatterns(enriched, { metric = 'engagement_rate', minSampleSize = MIN_BASELINE_SAMPLE_SIZE } = {}) {
  const insights = [];
  const platforms = [...new Set(enriched.map((p) => p.platform))];
  for (const platform of platforms) {
    const platformPubs = enriched.filter((p) => p.platform === platform);
    const obs = toObs(platformPubs, metric);
    const baseline = computeBaseline({ observations: obs, platform, contentTypeOf: () => 'any', metric, minSampleSize });
    if (baseline.insufficient) continue;

    const formats = [...new Set(platformPubs.map((p) => p.format ?? 'unknown'))];
    for (const format of formats) {
      const group = platformPubs.filter((p) => (p.format ?? 'unknown') === format);
      const values = group.map((p) => metricGetter(p, metric)).filter((v) => v !== NOT_AVAILABLE);
      if (values.length < minSampleSize) continue;
      const groupMedianObs = [{ content_id: `format:${platform}:${format}`, platform, metric, value: median(values) }];
      const signal = createPerformanceSignal({ content_id: groupMedianObs[0].content_id, metric, observed_value: groupMedianObs[0].value, baseline });
      const insight = insightFromSignal({
        signal, platform, scope: `${platform}:format=${format} (N=${values.length})`, insightType: 'FORMAT_PATTERN', metric,
        groupSampleSize: values.length, contentIds: group.map((p) => p.contentId),
      });
      if (insight) insights.push(insight);
    }
  }
  return insights;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Compara la mediana de una plataforma contra la mediana de OTRA (mismo metric), solo si ambas tienen volumen suficiente. */
export function detectPlatformComparison(enriched, { metric = 'engagement_rate', minSampleSize = MIN_BASELINE_SAMPLE_SIZE } = {}) {
  const platforms = [...new Set(enriched.map((p) => p.platform))];
  const insights = [];
  for (let i = 0; i < platforms.length; i++) {
    for (let j = 0; j < platforms.length; j++) {
      if (i === j) continue;
      const a = platforms[i], b = platforms[j];
      const valuesA = enriched.filter((p) => p.platform === a).map((p) => metricGetter(p, metric)).filter((v) => v !== NOT_AVAILABLE);
      const valuesB = enriched.filter((p) => p.platform === b).map((p) => metricGetter(p, metric)).filter((v) => v !== NOT_AVAILABLE);
      if (valuesA.length < minSampleSize || valuesB.length < minSampleSize) continue;
      const baseline = { baseline_value: median(valuesB), baseline_method: 'median', sample_size: valuesB.length, insufficient: false };
      const signal = createPerformanceSignal({ content_id: `platform:${a}_vs_${b}`, metric, observed_value: median(valuesA), baseline });
      const insight = insightFromSignal({
        signal, platform: a, scope: `${a} vs ${b} (N=${valuesA.length} vs N=${valuesB.length})`, insightType: 'PLATFORM_COMPARISON', metric,
        groupSampleSize: Math.min(valuesA.length, valuesB.length),
        contentIds: enriched.filter((p) => p.platform === a || p.platform === b).map((p) => p.contentId),
      });
      if (insight) insights.push(insight);
    }
  }
  return insights;
}

/** Publicaciones individuales con engagement muy por encima del benchmark de su plataforma (nunca por debajo del mínimo de muestra). */
export function detectEngagementOutliers(enriched, { metric = 'engagement_rate', minSampleSize = MIN_BASELINE_SAMPLE_SIZE } = {}) {
  const insights = [];
  const platforms = [...new Set(enriched.map((p) => p.platform))];
  for (const platform of platforms) {
    const platformPubs = enriched.filter((p) => p.platform === platform);
    const obs = toObs(platformPubs, metric);
    const baseline = computeBaseline({ observations: obs, platform, contentTypeOf: () => 'any', metric, minSampleSize });
    if (baseline.insufficient) continue;
    for (const p of platformPubs) {
      const value = metricGetter(p, metric);
      if (value === NOT_AVAILABLE) continue;
      const signal = createPerformanceSignal({ content_id: p.contentId, metric, observed_value: value, baseline });
      const insight = insightFromSignal({
        signal, platform, scope: `${platform} (N=${baseline.sample_size})`, insightType: 'ENGAGEMENT_PATTERN', metric,
        groupSampleSize: baseline.sample_size, contentIds: [p.contentId],
      });
      if (insight) insights.push(insight);
    }
  }
  return insights;
}

/** Amplificación (shares) / conservación (saves) por publicación, mismo mecanismo que detectEngagementOutliers. */
export function detectAmplificationPatterns(enriched, { minSampleSize = MIN_BASELINE_SAMPLE_SIZE } = {}) {
  const insights = [];
  for (const metric of ['shares', 'saves']) {
    const platforms = [...new Set(enriched.map((p) => p.platform))];
    for (const platform of platforms) {
      const platformPubs = enriched.filter((p) => p.platform === platform);
      const obs = toObs(platformPubs, metric);
      const baseline = computeBaseline({ observations: obs, platform, contentTypeOf: () => 'any', metric, minSampleSize });
      if (baseline.insufficient) continue;
      for (const p of platformPubs) {
        const value = metricValue(p.metrics, metric);
        if (value === NOT_AVAILABLE) continue;
        const signal = createPerformanceSignal({ content_id: p.contentId, metric, observed_value: value, baseline });
        const insight = insightFromSignal({
          signal, platform, scope: `${platform} (N=${baseline.sample_size})`, insightType: 'AMPLIFICATION_PATTERN', metric,
          groupSampleSize: baseline.sample_size, contentIds: [p.contentId],
        });
        if (insight) insights.push(insight);
      }
    }
  }
  return insights;
}

/** Horario (hora UTC de published_at) — solo si hay timestamp real y volumen suficiente por franja; nunca inventa zona horaria. */
export function detectSchedulePatterns(enriched, { metric = 'engagement_rate', minSampleSize = MIN_BASELINE_SAMPLE_SIZE } = {}) {
  const insights = [];
  const platforms = [...new Set(enriched.map((p) => p.platform))];
  for (const platform of platforms) {
    const platformPubs = enriched.filter((p) => p.platform === platform && p.publishedAt);
    const obs = toObs(platformPubs, metric);
    const baseline = computeBaseline({ observations: obs, platform, contentTypeOf: () => 'any', metric, minSampleSize });
    if (baseline.insufficient) continue;

    const byHour = new Map();
    for (const p of platformPubs) {
      const hour = new Date(p.publishedAt).getUTCHours();
      if (Number.isNaN(hour)) continue;
      if (!byHour.has(hour)) byHour.set(hour, []);
      byHour.get(hour).push(p);
    }
    for (const [hour, group] of byHour) {
      const values = group.map((p) => metricGetter(p, metric)).filter((v) => v !== NOT_AVAILABLE);
      if (values.length < minSampleSize) continue;
      const signal = createPerformanceSignal({ content_id: `hour:${platform}:${hour}`, metric, observed_value: median(values), baseline });
      const insight = insightFromSignal({
        signal, platform, scope: `${platform}:hora_utc=${hour} (N=${values.length})`, insightType: 'SCHEDULE_PATTERN', metric,
        groupSampleSize: values.length, contentIds: group.map((p) => p.contentId),
      });
      if (insight) insights.push(insight);
    }
  }
  return insights;
}

export function detectAllPatterns(enriched, options = {}) {
  return [
    ...detectFormatPatterns(enriched, options),
    ...detectPlatformComparison(enriched, options),
    ...detectEngagementOutliers(enriched, options),
    ...detectAmplificationPatterns(enriched, options),
    ...detectSchedulePatterns(enriched, options),
  ];
}
