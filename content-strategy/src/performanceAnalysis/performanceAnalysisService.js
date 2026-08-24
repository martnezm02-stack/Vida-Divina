// performanceAnalysisService.js — Performance Analysis Engine, Fase 10.
// Orquesta metricsNormalizer/derivedMetrics/benchmarks/performanceScore/
// patternDetection SIN reimplementar ninguno — mismo patrón que
// performanceCollectionService.js (Fase 1) orquestando los PerformanceSource
// reales. Punto de entrada único para la API del dashboard y para la
// validación real (Fase 13).
//
// Solo LEE performanceLearningStore -- no publica, no modifica, no llama a
// Meta.

import { performanceLearningStore as defaultStore } from '../performanceLearningStoreInstance.js';
import { NOT_AVAILABLE } from '../../../performance-learning-intelligence/src/performanceObservation.js';
import { MIN_BASELINE_SAMPLE_SIZE } from '../../../performance-learning-intelligence/src/performanceSignal.js';
import { normalizeLatestMetrics, metricValue } from './metricsNormalizer.js';
import { computeDerivedMetrics, derivedValue } from './derivedMetrics.js';
import { buildBenchmarks } from './benchmarks.js';
import { computePerformanceScoresForPlatform } from './performanceScore.js';
import { detectAllPatterns } from './patternDetection.js';

/** §7 — solo atributos ya registrados en PublishedContent; nunca inferidos de caption/filename/path. CTA y campaign no existen hoy en el modelo -- siempre "unknown". */
function attributesOf(publication) {
  return {
    format: publication.format ?? 'unknown',
    topic: publication.topic ?? 'unknown',
    product: publication.product_ref ?? 'unknown',
    contentType: publication.content_type ?? 'unknown',
    cta: 'unknown', // no existe en PublishedContent -- nunca se infiere
    campaign: 'unknown', // no existe en PublishedContent -- nunca se infiere
  };
}

/** Arma el conjunto enriquecido (una fila por PublishedContent) que consumen benchmarks/score/patterns. */
export function buildEnrichedPublications({ store = defaultStore, platformFilter = null } = {}) {
  const publications = store.loadAll('published_content');
  const observations = store.loadAll('performance_observation');

  return publications
    .filter((p) => !platformFilter || p.platform === platformFilter)
    .map((p) => {
      const { metrics, lastUpdated } = normalizeLatestMetrics(p.content_id, observations);
      const derived = computeDerivedMetrics(metrics);
      return {
        contentId: p.content_id,
        platform: p.platform,
        publishedAt: p.published_at,
        externalPostId: p.external_post_id,
        lastUpdated,
        metrics,
        derived,
        attributes: attributesOf(p),
        format: p.format ?? 'unknown', // acceso directo, usado por patternDetection.js
      };
    });
}

function scoresByContentId(enriched) {
  const scores = new Map();
  const platforms = [...new Set(enriched.map((p) => p.platform))];
  for (const platform of platforms) {
    const group = enriched.filter((p) => p.platform === platform);
    const platformScores = computePerformanceScoresForPlatform(group);
    for (const [contentId, result] of platformScores) scores.set(contentId, result);
  }
  return scores;
}

function rankByScore(enriched, scores, { limit = 5, direction = 'desc' } = {}) {
  return enriched
    .map((p) => ({ contentId: p.contentId, platform: p.platform, externalPostId: p.externalPostId, ...scores.get(p.contentId) }))
    .filter((r) => typeof r.score === 'number')
    .sort((a, b) => (direction === 'desc' ? b.score - a.score : a.score - b.score))
    .slice(0, limit);
}

/** Benchmarks de engagement_rate (+ métricas brutas clave) por plataforma/formato -- Fase 5. */
function buildAllBenchmarks(enriched) {
  const metricsToProfile = ['engagement_rate', 'likes', 'comments', 'shares', 'saves', 'views'];
  const result = {};
  for (const metric of metricsToProfile) {
    const entries = enriched
      .map((p) => {
        const value = metric in p.derived ? derivedValue(p.derived, metric) : metricValue(p.metrics, metric);
        return value === NOT_AVAILABLE ? null : { platform: p.platform, groupKey: p.format, value };
      })
      .filter(Boolean);
    result[metric] = buildBenchmarks(entries);
  }
  return result;
}

/**
 * §10 — punto de entrada de la API. `platform` filtra todo el análisis a
 * una sola plataforma cuando se especifica.
 */
export function analyzePerformance({ store = defaultStore, platform = null } = {}) {
  const enriched = buildEnrichedPublications({ store, platformFilter: platform });

  if (enriched.length === 0) {
    return { status: 'INSUFFICIENT_DATA', reason: 'No hay PublishedContent registrado (con o sin el filtro de plataforma aplicado).', summary: null, topPerformers: [], underperformers: [], benchmarks: {}, insights: [] };
  }

  const scores = scoresByContentId(enriched);
  const benchmarks = buildAllBenchmarks(enriched);
  const insights = detectAllPatterns(enriched);

  const platformsPresent = [...new Set(enriched.map((p) => p.platform))];
  const withScore = enriched.filter((p) => typeof scores.get(p.contentId)?.score === 'number').length;

  return {
    status: 'OK',
    summary: {
      totalPublications: enriched.length,
      platforms: platformsPresent,
      publicationsWithScore: withScore,
      minSampleSizeForBenchmarks: MIN_BASELINE_SAMPLE_SIZE,
    },
    topPerformers: rankByScore(enriched, scores, { limit: 5, direction: 'desc' }),
    underperformers: rankByScore(enriched, scores, { limit: 5, direction: 'asc' }),
    benchmarks,
    insights,
  };
}
