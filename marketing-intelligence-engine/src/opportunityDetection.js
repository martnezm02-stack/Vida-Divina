// opportunityDetection.js — Marketing Intelligence Engine, Fase 10. Nunca
// presenta una oportunidad sin evidencia real: los tipos por publicación
// exigen un benchmark real (Performance Analysis, sample_size >=
// MIN_BASELINE_SAMPLE_SIZE) y/o un AttributionRecord real; los tipos por
// grupo envuelven 1:1 un PerformanceInsight ya calculado por
// patternDetection.js (nunca recalculan el patrón).
//
// engagement != conversión (§9/§10 del encargo): un contenido con
// engagement alto y cero conversión NO se describe como "mal contenido" --
// se describe como una oportunidad de investigar el paso comercial
// siguiente (CTA/oferta), nunca como un juicio de calidad.

import { NOT_AVAILABLE } from '../../performance-learning-intelligence/src/performanceObservation.js';
import { metricValue } from '../../content-strategy/src/performanceAnalysis/metricsNormalizer.js';
import { derivedValue } from '../../content-strategy/src/performanceAnalysis/derivedMetrics.js';
import { computeAttributedRevenue } from '../../attribution-engine/src/revenueAttribution.js';
import { createMarketingInsight } from './marketingInsight.js';

function attributionFor(attributionRecords, contentId) {
  return attributionRecords.filter((r) => r.contentId === contentId);
}
function hasRealConversion(records) {
  return records.some((r) => r.attributionType !== 'UNKNOWN' && (r.leadId || r.saleId));
}

/** Fase 10 §1/§2 — por publicación individual: engagement (benchmark real) cruzado con conversión (attribution real). */
function detectEngagementConversionOpportunities({ enriched, benchmarks, attributionRecords }) {
  const opportunities = [];
  const engagementBenchmarks = benchmarks.engagement_rate ?? {};

  for (const p of enriched) {
    const rate = derivedValue(p.derived, 'engagement_rate');
    const overall = engagementBenchmarks[p.platform]?.overall;
    if (rate === NOT_AVAILABLE || !overall || overall.status !== 'OK') continue;

    const records = attributionFor(attributionRecords, p.contentId);
    const evaluated = records.length > 0; // hay AttributionRecord (aunque sea UNKNOWN) -- se evaluó, no se ignoró
    const converted = hasRealConversion(records);

    if (rate >= overall.p75 && evaluated && !converted) {
      opportunities.push(createMarketingInsight({
        scope: `${p.platform}:content=${p.contentId} (benchmark N=${overall.sample_size})`,
        platform: p.platform, category: 'OPPORTUNITY', insightType: 'HIGH_ENGAGEMENT_LOW_CONVERSION',
        title: `Alto engagement sin conversión atribuida · ${p.platform}`,
        summary: `engagement_rate (${rate}) está en o sobre el percentil 75 de ${p.platform} (${overall.p75}), pero no hay lead ni venta con evidencia estructural atribuida a esta publicación. Puede indicar una oportunidad en el paso comercial (CTA/oferta), no un problema del contenido. Se observa asociación, no se afirma causalidad.`,
        evidence: { engagement_rate: rate, p75: overall.p75, attributionRecordCount: records.length },
        metrics: { engagement_rate: rate }, benchmark: overall.p75, delta: null,
        confidence: 'MEDIUM', evidenceCount: overall.sample_size,
        relatedContentIds: [p.contentId],
        relatedProductIds: p.attributes.product !== 'unknown' ? [p.attributes.product] : [],
        source: 'marketing_intelligence_engine:opportunity_detection',
      }));
    }
    if (rate <= overall.p25 && converted) {
      opportunities.push(createMarketingInsight({
        scope: `${p.platform}:content=${p.contentId} (benchmark N=${overall.sample_size})`,
        platform: p.platform, category: 'OPPORTUNITY', insightType: 'LOW_ENGAGEMENT_HIGH_CONVERSION',
        title: `Bajo engagement con conversión atribuida · ${p.platform}`,
        summary: `engagement_rate (${rate}) está en o bajo el percentil 25 de ${p.platform} (${overall.p25}), pero esta publicación sí tiene lead/venta con evidencia estructural atribuida. El engagement no predice por sí solo el valor comercial de este contenido. Se observa asociación, no se afirma causalidad.`,
        evidence: { engagement_rate: rate, p25: overall.p25, attributionRecordCount: records.length },
        metrics: { engagement_rate: rate }, benchmark: overall.p25, delta: null,
        confidence: 'MEDIUM', evidenceCount: overall.sample_size,
        relatedContentIds: [p.contentId],
        relatedProductIds: p.attributes.product !== 'unknown' ? [p.attributes.product] : [],
        source: 'marketing_intelligence_engine:opportunity_detection',
      }));
    }
  }
  return opportunities;
}

/** Fase 10 §4 — revenue real atribuido con reach/views por debajo del benchmark (o no disponible). */
function detectHighRevenueLowReach({ enriched, benchmarks, attributionRecords }) {
  const opportunities = [];
  const viewsBenchmarks = benchmarks.views ?? {};

  for (const p of enriched) {
    const records = attributionFor(attributionRecords, p.contentId);
    if (records.length === 0) continue;
    const revenue = computeAttributedRevenue(records);
    if (revenue.total === null || revenue.total <= 0) continue;

    const views = metricValue(p.metrics, 'views');
    const overall = viewsBenchmarks[p.platform]?.overall;
    const lowReach = views === NOT_AVAILABLE || (overall?.status === 'OK' && views <= overall.p25);
    if (!lowReach) continue;

    opportunities.push(createMarketingInsight({
      scope: `${p.platform}:content=${p.contentId}`,
      platform: p.platform, category: 'OPPORTUNITY', insightType: 'HIGH_REVENUE_LOW_REACH',
      title: `Revenue atribuido con alcance limitado · ${p.platform}`,
      summary: `Esta publicación tiene revenue real atribuido (${revenue.total}) pero ${views === NOT_AVAILABLE ? 'views no está disponible' : `views (${views}) está en o bajo el percentil 25 de su plataforma (${overall.p25})`}. Podría beneficiarse de mayor distribución/promoción. Se observa asociación, no se afirma causalidad.`,
      evidence: { revenue: revenue.total, views: views === NOT_AVAILABLE ? null : views, viewsP25: overall?.status === 'OK' ? overall.p25 : null },
      metrics: { attributedRevenue: revenue.total }, benchmark: overall?.status === 'OK' ? overall.p25 : null, delta: null,
      confidence: 'LOW', evidenceCount: revenue.count,
      relatedContentIds: [p.contentId],
      relatedProductIds: p.attributes.product !== 'unknown' ? [p.attributes.product] : [],
      source: 'marketing_intelligence_engine:opportunity_detection',
    }));
  }
  return opportunities;
}

/** Fase 10 §3/§5/§6/§7 — por grupo: envuelve 1:1 un PerformanceInsight ya calculado (nunca recalcula el patrón). */
function detectGroupOpportunities(performanceInsights) {
  const opportunities = [];
  for (const pi of performanceInsights) {
    let insightType = null;
    if (pi.insightType === 'PLATFORM_COMPARISON' && pi.confidence === 'HIGH') {
      insightType = pi.delta > 0 ? 'STRONG_PLATFORM_SIGNAL' : 'WEAK_PLATFORM_SIGNAL';
    } else if ((pi.insightType === 'FORMAT_PATTERN' || pi.insightType === 'AMPLIFICATION_PATTERN') && pi.confidence === 'MEDIUM' && pi.delta > 0) {
      insightType = 'HIGH_PERFORMANCE_LOW_VOLUME';
    } else if (pi.insightType === 'SCHEDULE_PATTERN' && pi.confidence === 'MEDIUM' && pi.delta > 0) {
      insightType = 'EMERGING_PATTERN';
    }
    if (!insightType) continue;

    opportunities.push(createMarketingInsight({
      scope: pi.scope, platform: pi.platform, category: 'OPPORTUNITY', insightType,
      title: `${insightType} · ${pi.platform}`,
      summary: `${pi.explanation} Clasificado como ${insightType} a partir de este mismo patrón (evidenceCount=${pi.evidenceCount}, confidence=${pi.confidence}).`,
      evidence: { sourceInsightId: pi.id, sourceInsightType: pi.insightType },
      metrics: { [pi.metric]: pi.value }, benchmark: pi.benchmark, delta: pi.delta,
      confidence: pi.confidence, evidenceCount: pi.evidenceCount,
      relatedContentIds: pi.basedOnContentIds,
      source: 'marketing_intelligence_engine:opportunity_detection',
    }));
  }
  return opportunities;
}

/**
 * @param {{benchmarks:object, insights:object[]}} analysis - salida de analyzePerformance() (status:'OK')
 * @param {object[]} enriched - buildEnrichedPublications() (mismo filtro de plataforma que analysis)
 * @param {object[]} attributionRecords - store.loadAll('attribution_record')
 */
export function buildOpportunityDetection({ analysis, enriched, attributionRecords }) {
  if (analysis.status !== 'OK') return { insights: [], dataQualitySignals: [] };
  const insights = [
    ...detectEngagementConversionOpportunities({ enriched, benchmarks: analysis.benchmarks, attributionRecords }),
    ...detectHighRevenueLowReach({ enriched, benchmarks: analysis.benchmarks, attributionRecords }),
    ...detectGroupOpportunities(analysis.insights),
  ];
  return { insights, dataQualitySignals: [] };
}
