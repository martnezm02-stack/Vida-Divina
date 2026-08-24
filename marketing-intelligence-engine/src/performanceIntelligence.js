// performanceIntelligence.js — Marketing Intelligence Engine, Fases 4/5/6
// (Content / Platform / Format Intelligence). Envuelve la salida YA
// calculada de analyzePerformance() (content-strategy/src/performanceAnalysis/
// performanceAnalysisService.js) en MarketingInsight -- nunca recalcula
// scores, benchmarks ni patrones (§6 del encargo: "Utilizar Performance
// Analysis existente. NO crear otro sistema de scoring").
//
// analyzePerformance() produce dos formas distintas de evidencia, ambas
// envueltas aquí:
//   - topPerformers/underperformers: ranking por score percentil (sin
//     insightType propio) -> se envuelven como TOP_PERFORMER/UNDERPERFORMER
//     (valores de INSIGHT_TYPES que existían en el contrato pero que
//     patternDetection.js nunca producía -- este es su uso real).
//   - insights (patternDetection.js): ya son PerformanceInsight completos
//     (FORMAT_PATTERN/PLATFORM_COMPARISON/ENGAGEMENT_PATTERN/
//     AMPLIFICATION_PATTERN/SCHEDULE_PATTERN) -- se envuelven 1:1.

import { createMarketingInsight, createDataQualitySignal } from './marketingInsight.js';
import { classifyConfidence } from '../../content-strategy/src/performanceAnalysis/confidence.js';

// insightType (PerformanceInsight, patternDetection.js) -> category (MarketingInsight, Fase 3).
const PATTERN_TYPE_TO_CATEGORY = Object.freeze({
  FORMAT_PATTERN: 'FORMAT_PERFORMANCE',
  PLATFORM_COMPARISON: 'PLATFORM_PERFORMANCE',
  ENGAGEMENT_PATTERN: 'ENGAGEMENT',
  AMPLIFICATION_PATTERN: 'ENGAGEMENT', // shares/saves -- subtipo de engagement, mismo criterio de agrupación que el dashboard ya usa
  SCHEDULE_PATTERN: 'SCHEDULE',
});

/** product_ref reales (no "unknown") de las publicaciones citadas por un insight -- nunca inventados, solo los que ya trae PublishedContent. */
function productRefsFor(enriched, contentIds) {
  const set = new Set();
  for (const id of contentIds) {
    const pub = enriched.find((p) => p.contentId === id);
    if (pub?.attributes?.product && pub.attributes.product !== 'unknown') set.add(pub.attributes.product);
  }
  return [...set];
}

/** Fase 4 — Content Intelligence: TOP_PERFORMER/UNDERPERFORMER a partir del ranking por score ya calculado (performanceScore.js). */
function wrapContentRanking(entries, { enriched, poolSize, insightType }) {
  return entries
    .filter((r) => typeof r.score === 'number')
    .map((r) => {
      const confidence = classifyConfidence({ evidenceCount: poolSize, deltaAbs: null, allMetricsAvailable: true });
      const direction = insightType === 'TOP_PERFORMER' ? 'entre los de mejor rendimiento relativo' : 'entre los de menor rendimiento relativo';
      return createMarketingInsight({
        scope: `${r.platform} (N=${poolSize})`,
        platform: r.platform,
        category: 'CONTENT_PERFORMANCE',
        insightType,
        title: `${insightType === 'TOP_PERFORMER' ? 'Contenido de alto rendimiento' : 'Contenido de bajo rendimiento'} en ${r.platform}`,
        summary: `La publicación ${r.externalPostId ?? r.contentId} se ubica ${direction} de su grupo comparable en ${r.platform} (percentil de score ${r.score.toFixed(1)}, método ${r.method}). Se observa asociación, no se afirma causalidad.`,
        evidence: { method: r.method, scoreExplanation: r.explanation, poolSize },
        metrics: { score: r.score },
        benchmark: null,
        delta: null,
        confidence,
        evidenceCount: poolSize,
        relatedContentIds: [r.contentId],
        relatedProductIds: productRefsFor(enriched, [r.contentId]),
        source: 'marketing_intelligence_engine:performance_analysis',
      });
    });
}

/** Fases 5/6 — Platform/Format Intelligence (+ Engagement/Schedule): envuelve 1:1 los PerformanceInsight de patternDetection.js. */
function wrapPatternInsights(performanceInsights, enriched) {
  return performanceInsights.map((pi) => createMarketingInsight({
    scope: pi.scope,
    platform: pi.platform,
    category: PATTERN_TYPE_TO_CATEGORY[pi.insightType] ?? 'CONTENT_PERFORMANCE',
    insightType: pi.insightType,
    title: `${pi.insightType} · ${pi.platform}`,
    summary: pi.explanation,
    evidence: { metric: pi.metric, sourceInsightId: pi.id },
    metrics: { [pi.metric]: pi.value },
    benchmark: pi.benchmark,
    delta: pi.delta,
    confidence: pi.confidence,
    evidenceCount: pi.evidenceCount,
    relatedContentIds: pi.basedOnContentIds,
    relatedProductIds: productRefsFor(enriched, pi.basedOnContentIds),
    source: 'marketing_intelligence_engine:performance_analysis',
  }));
}

/**
 * @param {{status:string, summary:object|null, topPerformers:object[], underperformers:object[], insights:object[]}} analysis - salida de analyzePerformance()
 * @param {object[]} enriched - salida de buildEnrichedPublications() (mismo filtro de plataforma que `analysis`)
 * @returns {{insights: object[], dataQualitySignals: object[]}}
 */
export function buildPerformanceIntelligence(analysis, enriched) {
  if (analysis.status !== 'OK') {
    return {
      insights: [],
      dataQualitySignals: [
        createDataQualitySignal({
          category: 'CONTENT_PERFORMANCE', scope: 'global', reason: 'INSUFFICIENT_DATA',
          explanation: analysis.reason ?? 'Performance Analysis Engine no produjo resultados.',
        }),
      ],
    };
  }

  const poolSize = analysis.summary.publicationsWithScore;
  const insights = [
    ...(poolSize > 0 ? wrapContentRanking(analysis.topPerformers, { enriched, poolSize, insightType: 'TOP_PERFORMER' }) : []),
    ...(poolSize > 0 ? wrapContentRanking(analysis.underperformers, { enriched, poolSize, insightType: 'UNDERPERFORMER' }) : []),
    ...wrapPatternInsights(analysis.insights, enriched),
  ];

  const dataQualitySignals = [];
  if (poolSize === 0) {
    dataQualitySignals.push(createDataQualitySignal({
      category: 'CONTENT_PERFORMANCE', scope: 'global', reason: 'MISSING_METRICS',
      explanation: 'Hay PublishedContent registrado pero ninguna publicación tiene suficientes métricas para calcular un score comparable (ver performanceScore.js).',
    }));
  }
  if (analysis.insights.length === 0) {
    dataQualitySignals.push(createDataQualitySignal({
      category: 'FORMAT_PERFORMANCE', scope: 'global', reason: 'LOW_SAMPLE_SIZE',
      explanation: `Ningún grupo (formato/plataforma/horario) alcanzó el mínimo de muestra real requerido por Performance Analysis Engine (MIN_BASELINE_SAMPLE_SIZE=${analysis.summary.minSampleSizeForBenchmarks}).`,
    }));
  }

  return { insights, dataQualitySignals };
}
