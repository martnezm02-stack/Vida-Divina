// commercialIntelligence.js — Marketing Intelligence Engine, Fase 9.
// Utiliza EXCLUSIVAMENTE attribution-engine/src/attributionService.js
// (computeCommercialMetrics) -- nunca reimplementa el cálculo de leads/
// ventas/revenue atribuido. Cubre CONVERSION y REVENUE (engagement !=
// conversión: un contenido puede tener bajo engagement y alto valor
// comercial, o viceversa -- por eso son categorías separadas, nunca
// mezcladas en un solo insight).
//
// AUDIENCE_SIGNAL: el proyecto no tiene ninguna fuente de datos
// demográficos/de audiencia hoy (ALLOWED_METRICS en performanceObservation.js
// no incluye edad/género/ubicación; instagramPerformanceSource.js/
// facebookPerformanceSource.js no las auditan) -- siempre INSUFFICIENT_DATA,
// documentado una sola vez, nunca fabricado.

import { computeCommercialMetrics } from '../../attribution-engine/src/attributionService.js';
import { createMarketingInsight, createDataQualitySignal } from './marketingInsight.js';

const CONFIDENCE_RANK = Object.freeze({ HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 });

/** Nivel de confianza más alto entre los AttributionRecord que sustentan el insight -- reutiliza attributionConfidence.js tal cual, nunca recalcula. */
function bestConfidence(records) {
  let best = 'UNKNOWN';
  for (const r of records) {
    if (CONFIDENCE_RANK[r.confidence] > CONFIDENCE_RANK[best]) best = r.confidence;
  }
  return best;
}

function productRefsFor(contentIdToProduct, contentIds) {
  return [...new Set(contentIds.map((id) => contentIdToProduct.get(id)).filter(Boolean))];
}

function commercialInsightsForScope({ records, platform, contentIdToProduct }) {
  const nonUnknown = records.filter((r) => r.attributionType !== 'UNKNOWN');
  const metrics = computeCommercialMetrics(records);
  const insights = [];
  const dataQualitySignals = [];
  const scope = `${platform ?? 'all'} (N=${records.length})`;

  if (metrics.attributedLeads > 0 || metrics.attributedSales > 0) {
    const contributing = nonUnknown.filter((r) => r.leadId || r.saleId);
    insights.push(createMarketingInsight({
      scope, platform, category: 'CONVERSION', insightType: 'COMMERCIAL_CONVERSION',
      title: `Conversión atribuida${platform ? ` · ${platform}` : ''}`,
      summary: `${metrics.attributedLeads} lead(s) y ${metrics.attributedSales} venta(s) atribuida(s) con evidencia estructural${platform ? ` en ${platform}` : ''}. Tasa de conversión (ventas/leads): ${metrics.conversionRate ?? 'N/D'}. Se observa asociación, no se afirma causalidad.`,
      evidence: { attributionRecordCount: records.length, nonUnknownCount: nonUnknown.length },
      metrics: { attributedLeads: metrics.attributedLeads, attributedSales: metrics.attributedSales, conversionRate: metrics.conversionRate },
      confidence: bestConfidence(contributing),
      evidenceCount: metrics.attributedLeads || metrics.attributedSales,
      relatedContentIds: [...new Set(contributing.map((r) => r.contentId))],
      relatedProductIds: productRefsFor(contentIdToProduct, contributing.map((r) => r.contentId)),
      source: 'marketing_intelligence_engine:commercial_intelligence',
    }));
  } else {
    dataQualitySignals.push(createDataQualitySignal({
      category: 'CONVERSION', scope, platform, reason: 'MISSING_ATTRIBUTION',
      explanation: `${records.length} AttributionRecord evaluado(s)${platform ? ` en ${platform}` : ''}, ninguno con evidencia estructural suficiente para un lead o venta atribuida (todos UNKNOWN o sin leadId/saleId). No es lo mismo que "no convierte": significa que no hay evidencia estructural (tracking/UTM/campaña) para saberlo todavía.`,
    }));
  }

  if (metrics.attributedRevenue !== null) {
    const withRevenue = nonUnknown.filter((r) => typeof r.revenue === 'number');
    insights.push(createMarketingInsight({
      scope, platform, category: 'REVENUE', insightType: 'COMMERCIAL_REVENUE',
      title: `Revenue atribuido${platform ? ` · ${platform}` : ''}`,
      summary: `Revenue atribuido total: ${metrics.attributedRevenue}${platform ? ` en ${platform}` : ''} (${metrics.revenueRecordCount} registro(s) con revenue real). Revenue por publicación: ${metrics.revenuePerPublication ?? 'N/D'}. Revenue por lead: ${metrics.revenuePerLead ?? 'N/D'}. Nunca estimado -- solo revenue real de opportunities.total.`,
      evidence: { revenueRecordCount: metrics.revenueRecordCount },
      metrics: { attributedRevenue: metrics.attributedRevenue, revenuePerPublication: metrics.revenuePerPublication, revenuePerLead: metrics.revenuePerLead },
      confidence: bestConfidence(withRevenue),
      evidenceCount: metrics.revenueRecordCount,
      relatedContentIds: [...new Set(withRevenue.map((r) => r.contentId))],
      relatedProductIds: productRefsFor(contentIdToProduct, withRevenue.map((r) => r.contentId)),
      source: 'marketing_intelligence_engine:commercial_intelligence',
    }));
  } else {
    dataQualitySignals.push(createDataQualitySignal({
      category: 'REVENUE', scope, platform, reason: 'MISSING_ATTRIBUTION',
      explanation: `Ningún AttributionRecord${platform ? ` en ${platform}` : ''} tiene revenue real registrado (requiere una opportunity en estado de venta confirmada -- ver revenueAttribution.js). Revenue nunca se estima.`,
    }));
  }

  return { insights, dataQualitySignals };
}

/**
 * @param {object[]} attributionRecords - store.loadAll('attribution_record')
 * @param {Map<string,string>} contentIdToProduct - de productIntelligence.js/enriched, para relatedProductIds
 * @returns {{insights: object[], dataQualitySignals: object[]}}
 */
export function buildCommercialIntelligence({ attributionRecords, contentIdToProduct = new Map() }) {
  const audienceSignal = createDataQualitySignal({
    category: 'AUDIENCE_SIGNAL', scope: 'global', reason: 'INSUFFICIENT_DATA',
    explanation: 'Ninguna fuente de Performance Collection (instagramPerformanceSource.js, facebookPerformanceSource.js) expone datos demográficos/de audiencia (edad, género, ubicación) -- ALLOWED_METRICS de PerformanceObservation no los define. AUDIENCE_SIGNAL no se puede generar con datos reales hoy.',
  });

  if (attributionRecords.length === 0) {
    return {
      insights: [],
      dataQualitySignals: [
        createDataQualitySignal({ category: 'CONVERSION', scope: 'global', reason: 'MISSING_ATTRIBUTION', explanation: 'No hay AttributionRecord generados todavía -- ejecutar Attribution Engine antes de Commercial Intelligence.' }),
        createDataQualitySignal({ category: 'REVENUE', scope: 'global', reason: 'MISSING_ATTRIBUTION', explanation: 'No hay AttributionRecord generados todavía -- ejecutar Attribution Engine antes de Commercial Intelligence.' }),
        audienceSignal,
      ],
    };
  }

  const platforms = [...new Set(attributionRecords.map((r) => r.platform))];
  const insights = [];
  const dataQualitySignals = [audienceSignal];

  const overall = commercialInsightsForScope({ records: attributionRecords, platform: null, contentIdToProduct });
  insights.push(...overall.insights);
  dataQualitySignals.push(...overall.dataQualitySignals);

  for (const platform of platforms) {
    const perPlatform = commercialInsightsForScope({ records: attributionRecords.filter((r) => r.platform === platform), platform, contentIdToProduct });
    insights.push(...perPlatform.insights);
    dataQualitySignals.push(...perPlatform.dataQualitySignals);
  }

  return { insights, dataQualitySignals };
}
