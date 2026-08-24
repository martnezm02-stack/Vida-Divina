// productIntelligence.js — Marketing Intelligence Engine, Fase 7. Cierra
// PRODUCT -> CONTENT -> PUBLICATION -> PERFORMANCE -> ATTRIBUTION -> REVENUE
// usando exclusivamente PublishedContent.product_ref real (nunca inferido
// de caption/filename) y AttributionRecord real (nunca inventa un vínculo).
//
// AttributionRecord no guarda product_ref directamente (ver
// attributionRecord.js) -- se une por record.contentId contra
// PublishedContent.content_id, igual que hace attributionService.js
// internamente (productMatch en evidenceModel.js).

import { NOT_AVAILABLE } from '../../performance-learning-intelligence/src/performanceObservation.js';
import { derivedValue } from '../../content-strategy/src/performanceAnalysis/derivedMetrics.js';
import { classifyConfidence } from '../../content-strategy/src/performanceAnalysis/confidence.js';
import { computeAttributedRevenue } from '../../attribution-engine/src/revenueAttribution.js';
import { createMarketingInsight, createDataQualitySignal } from './marketingInsight.js';
import { PRODUCT_INSIGHT_TYPE } from './intelligenceCategories.js';

function mean(values) {
  return values.length === 0 ? null : Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(6));
}

/**
 * @param {object[]} enriched - buildEnrichedPublications({}) SIN filtro de plataforma (un producto puede tener contenido en varias).
 * @param {object[]} attributionRecords - store.loadAll('attribution_record')
 * @returns {{insights: object[], dataQualitySignals: object[]}}
 */
export function buildProductIntelligence({ enriched, attributionRecords }) {
  const contentIdToProduct = new Map(enriched.filter((p) => p.attributes.product !== 'unknown').map((p) => [p.contentId, p.attributes.product]));

  const byProduct = new Map();
  for (const p of enriched) {
    const product = p.attributes.product;
    if (product === 'unknown') continue;
    if (!byProduct.has(product)) byProduct.set(product, []);
    byProduct.get(product).push(p);
  }

  if (byProduct.size === 0) {
    return {
      insights: [],
      dataQualitySignals: [createDataQualitySignal({
        category: 'PRODUCT_PERFORMANCE', scope: 'global', reason: 'INSUFFICIENT_DATA',
        explanation: 'Ningún PublishedContent real tiene product_ref registrado -- Product Intelligence no relaciona nada sin ese vínculo estructural.',
      })],
    };
  }

  const insights = [];
  for (const [product, pubs] of byProduct) {
    const engagementValues = pubs.map((p) => derivedValue(p.derived, 'engagement_rate')).filter((v) => v !== NOT_AVAILABLE);
    const avgEngagement = mean(engagementValues);
    const platforms = [...new Set(pubs.map((p) => p.platform))];

    const records = attributionRecords.filter((r) => contentIdToProduct.get(r.contentId) === product);
    const nonUnknown = records.filter((r) => r.attributionType !== 'UNKNOWN');
    const attributedLeads = new Set(nonUnknown.filter((r) => r.leadId).map((r) => r.leadId)).size;
    const attributedSales = new Set(nonUnknown.filter((r) => r.saleId).map((r) => r.saleId)).size;
    const revenue = computeAttributedRevenue(records);
    const attributionSummary = records.length > 0
      ? { attributedLeads, attributedSales, attributedRevenue: revenue.total, revenueRecordCount: revenue.count, attributionRecordCount: records.length }
      : null;

    const confidence = classifyConfidence({ evidenceCount: pubs.length, deltaAbs: null, allMetricsAvailable: engagementValues.length === pubs.length });

    insights.push(createMarketingInsight({
      scope: `product=${product} (N=${pubs.length}, plataformas=${platforms.join('/')})`,
      platform: platforms.length === 1 ? platforms[0] : 'all',
      category: 'PRODUCT_PERFORMANCE',
      insightType: PRODUCT_INSIGHT_TYPE,
      title: `Rendimiento de ${product}`,
      summary: avgEngagement !== null
        ? `${product} tiene ${pubs.length} publicación(es) con engagement_rate promedio ${avgEngagement} en ${platforms.join('/')}. ${attributionSummary ? `${attributedLeads} lead(s) y ${attributedSales} venta(s) atribuida(s) a este producto en esta muestra.` : 'Sin evidencia de atribución comercial todavía.'} Se observa asociación, no se afirma causalidad.`
        : `${product} tiene ${pubs.length} publicación(es) registradas, sin engagement_rate disponible (reach/views no expuestos). ${attributionSummary ? `${attributedLeads} lead(s) y ${attributedSales} venta(s) atribuida(s).` : 'Sin evidencia de atribución comercial todavía.'}`,
      evidence: { publicationCount: pubs.length, platforms, attributionRecordCount: records.length },
      metrics: avgEngagement !== null ? { engagement_rate: avgEngagement } : {},
      benchmark: null,
      delta: null,
      confidence,
      evidenceCount: pubs.length,
      relatedContentIds: pubs.map((p) => p.contentId),
      relatedProductIds: [product],
      attributionSummary,
      source: 'marketing_intelligence_engine:product_intelligence',
    }));
  }

  return { insights, dataQualitySignals: [] };
}
