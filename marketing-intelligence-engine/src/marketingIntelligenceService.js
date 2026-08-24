// marketingIntelligenceService.js — MarketingIntelligenceService (Fase 14).
// Orquesta, sin reimplementar ninguno:
//   - analyzePerformance/buildEnrichedPublications (content-strategy, Performance Analysis Engine)
//   - computeCommercialMetrics (attribution-engine)
//   - performanceIntelligence/productIntelligence/campaignIntelligence/
//     commercialIntelligence/opportunityDetection (este mismo módulo)
//
// Solo LEE performanceLearningStore (published_content/performance_observation/
// attribution_record) -- nunca llama a Graph API directamente (§14 del
// encargo: "No llamar directamente a Graph API si Performance Collection ya
// contiene los datos necesarios" -- Performance Collection ya corrió antes,
// en una fase previa).
//
// Generación (pura, en memoria) separada de persistencia -- mismo patrón
// que attribution-engine/src/attributionService.js
// (generateAttributionForPublication vs. el GET de solo lectura del
// dashboard): el GET /api/intelligence lee marketing_insight YA
// persistidos, nunca genera como efecto secundario de una lectura.

import { performanceLearningStore as defaultStore } from '../../content-strategy/src/performanceLearningStoreInstance.js';
import { analyzePerformance, buildEnrichedPublications } from '../../content-strategy/src/performanceAnalysis/performanceAnalysisService.js';
import { createDataQualitySignal } from './marketingInsight.js';
import { buildPerformanceIntelligence } from './performanceIntelligence.js';
import { buildProductIntelligence } from './productIntelligence.js';
import { buildCampaignIntelligence } from './campaignIntelligence.js';
import { buildCommercialIntelligence } from './commercialIntelligence.js';
import { buildOpportunityDetection } from './opportunityDetection.js';

function countBy(items, field) {
  const counts = {};
  for (const item of items) counts[item[field] ?? 'null'] = (counts[item[field] ?? 'null'] ?? 0) + 1;
  return counts;
}

/**
 * Fase 14 — genera MarketingInsight en memoria, sin persistir. Pura función
 * de lectura sobre el store (nunca escribe).
 * @param {{store?:object, platform?:string|null}} params
 */
export function generateMarketingIntelligence({ store = defaultStore, platform = null } = {}) {
  const generatedAt = new Date().toISOString();
  const analysis = analyzePerformance({ store, platform });

  if (analysis.status !== 'OK') {
    return {
      status: 'INSUFFICIENT_DATA',
      reason: analysis.reason,
      generatedAt,
      summary: null,
      insights: [],
      dataQualitySignals: [createDataQualitySignal({ category: 'CONTENT_PERFORMANCE', scope: 'global', platform, reason: 'INSUFFICIENT_DATA', explanation: analysis.reason })],
    };
  }

  const enriched = buildEnrichedPublications({ store, platformFilter: platform });
  const attributionRecords = store.loadAll('attribution_record').filter((r) => !platform || r.platform === platform);
  const contentIdToProduct = new Map(enriched.filter((p) => p.attributes.product !== 'unknown').map((p) => [p.contentId, p.attributes.product]));

  const parts = [
    buildPerformanceIntelligence(analysis, enriched),
    buildProductIntelligence({ enriched, attributionRecords }),
    buildCampaignIntelligence(),
    buildCommercialIntelligence({ attributionRecords, contentIdToProduct }),
    buildOpportunityDetection({ analysis, enriched, attributionRecords }),
  ];

  const insights = parts.flatMap((p) => p.insights);
  const dataQualitySignals = parts.flatMap((p) => p.dataQualitySignals);

  return {
    status: 'OK',
    generatedAt,
    summary: {
      totalInsights: insights.length,
      byCategory: countBy(insights, 'category'),
      byConfidence: countBy(insights, 'confidence'),
      dataQualitySignalCount: dataQualitySignals.length,
    },
    insights,
    dataQualitySignals,
  };
}

/**
 * Clave de idempotencia (Fase 14/18): mismo hallazgo real reportado de
 * nuevo no duplica -- solo un scope/N distinto (evidencia nueva) genera una
 * entrada nueva. category/platform/insightType/scope NO bastan por sí
 * solos: varios PerformanceInsight de patternDetection.js (ej.
 * ENGAGEMENT_PATTERN/AMPLIFICATION_PATTERN, y el ranking por score de
 * Content Intelligence) comparten exactamente el mismo scope entre
 * publicaciones distintas de un mismo grupo (ej. "instagram (N=12)") --
 * sin relatedContentIds en la clave, insights reales sobre CONTENIDO
 * distinto colisionarían entre sí y se perderían silenciosamente.
 */
function dedupeKey(insight) {
  return [insight.category, insight.platform, insight.insightType, insight.scope, [...insight.relatedContentIds].sort().join(',')].join('::');
}

/**
 * Fase 14/15 — genera Y persiste (idempotente) en performanceLearningStore,
 * kind "marketing_insight" (extendido en performance-learning-intelligence/
 * src/store.js). Nunca publica, nunca modifica Content Strategy.
 */
export function generateAndPersistMarketingIntelligence({ store = defaultStore, platform = null } = {}) {
  const result = generateMarketingIntelligence({ store, platform });
  if (result.status !== 'OK') return { ...result, saved: [], skipped: [] };

  const existingKeys = new Set(store.loadAll('marketing_insight').map(dedupeKey));
  const saved = [];
  const skipped = [];
  for (const insight of result.insights) {
    const key = dedupeKey(insight);
    if (existingKeys.has(key)) { skipped.push({ key, reason: 'ALREADY_RECORDED' }); continue; }
    store.save('marketing_insight', insight);
    existingKeys.add(key);
    saved.push(insight);
  }
  return { ...result, saved, skipped };
}

const VALID_FILTERS = Object.freeze(['platform', 'category', 'confidence', 'product', 'campaign']);

/** Fase 16 — filtros de la API de solo lectura, sobre MarketingInsight YA persistidos. */
export function listMarketingInsights({ store = defaultStore, platform = null, category = null, confidence = null, product = null, campaign = null } = {}) {
  let records = store.loadAll('marketing_insight');
  if (platform) records = records.filter((r) => r.platform === platform);
  if (category) records = records.filter((r) => r.category === category);
  if (confidence) records = records.filter((r) => r.confidence === confidence);
  if (product) records = records.filter((r) => r.relatedProductIds.includes(product));
  if (campaign) records = records.filter((r) => r.relatedCampaignIds.includes(campaign));
  return records;
}

/** GET /api/intelligence/summary — agregado de solo lectura sobre lo YA persistido. */
export function summarizeMarketingIntelligence({ store = defaultStore, platform = null } = {}) {
  const records = listMarketingInsights({ store, platform });
  if (records.length === 0) {
    return { status: 'INSUFFICIENT_MARKETING_INTELLIGENCE', reason: 'No hay MarketingInsight generados todavía (con o sin el filtro de plataforma aplicado). Ejecutar generateAndPersistMarketingIntelligence primero.', byCategory: {}, byConfidence: {} };
  }
  return {
    status: 'OK',
    totalRecords: records.length,
    byCategory: countBy(records, 'category'),
    byConfidence: countBy(records, 'confidence'),
    recommendationReadyCount: records.filter((r) => r.recommendationReady).length,
  };
}

export { VALID_FILTERS };
