// attributionService.js — Fase 13. Orquesta, sin reimplementar ninguno:
//   - performanceLearningStore (PublishedContent real, Fase 1/Data Foundation)
//   - crm/index.js (conversations/opportunities reales, único módulo
//     autorizado a hablar con PostgreSQL -- se recibe por inyección, nunca
//     se importa `pg` aquí)
//   - evidenceModel / attributionWindow / attributionConfidence /
//     revenueAttribution / attributionRecord (este mismo módulo, Fases 4-5,
//     10-12, 3)
//
// `crm` se recibe como parámetro (no se importa el crm real por defecto)
// para que los tests unitarios (Fase 18) puedan inyectar un doble sin
// tocar PostgreSQL -- exactamente el mismo patrón de inyección que
// publishingScheduler.js (mediaHostingService/publish) y
// performanceCollectionService.js (overrides de PerformanceSource).

import { windowRange, ATTRIBUTION_WINDOWS } from './attributionWindow.js';
import { buildEvidence, classifyAttributionType } from './evidenceModel.js';
import { classifyAttributionConfidence } from './attributionConfidence.js';
import { extractRevenue, computeAttributedRevenue } from './revenueAttribution.js';
import { createAttributionRecord } from './attributionRecord.js';

/** §13 idempotencia — misma publicación + ventana + conversación (o "sin match" con conversación=null) ya registrada. */
function findExisting(store, { publicationId, attributionWindow, conversationId }) {
  return store.loadAll('attribution_record').find(
    (r) => r.publicationId === publicationId && r.attributionWindow === attributionWindow && r.conversationId === conversationId
  ) ?? null;
}

async function candidateOpportunities(crm, { since, until }) {
  return crm.opportunities.listCreatedBetween({ since, until });
}

/**
 * Genera (si hace falta) los AttributionRecord de UNA publicación para las
 * ventanas indicadas. Nunca inventa un vínculo: sin candidatos o sin
 * evidencia estructural, persiste exactamente UN registro UNKNOWN por
 * ventana (§9 — "registrar attributionType=UNKNOWN y explicar por qué").
 */
export async function generateAttributionForPublication({ publishedContent, crm, store, windows = Object.keys(ATTRIBUTION_WINDOWS) }) {
  if (!publishedContent?.external_post_id) {
    return { status: 'ERROR', error: 'generateAttributionForPublication: el PublishedContent no tiene external_post_id -- sin publicación real no hay atribución posible.', saved: [], skipped: [] };
  }
  const publicationId = publishedContent.content_id;
  const platform = publishedContent.platform;
  const productRef = publishedContent.product_ref ?? null;

  const saved = [];
  const skipped = [];

  for (const windowKey of windows) {
    const { since, until } = windowRange(publishedContent.published_at, windowKey);
    let opportunities;
    try {
      opportunities = await candidateOpportunities(crm, { since, until });
    } catch (err) {
      return { status: 'ERROR', error: `generateAttributionForPublication: fallo consultando crm.opportunities -- ${err.message}`, saved, skipped };
    }

    const matches = [];
    for (const opp of opportunities) {
      const evidence = buildEvidence({
        conversationId: opp.conversationId,
        leadId: opp.opportunityId,
        productMatch: productRef && opp.productoId === productRef ? true : undefined,
      });
      const attributionType = classifyAttributionType(evidence);
      if (attributionType === 'UNKNOWN') continue; // no cuenta como match real -- se resume en el registro UNKNOWN de abajo
      matches.push({ opp, evidence, attributionType });
    }

    if (matches.length === 0) {
      const existing = findExisting(store, { publicationId, attributionWindow: windowKey, conversationId: null });
      if (existing) { skipped.push({ windowKey, conversationId: null, reason: 'ALREADY_RECORDED' }); continue; }
      const record = createAttributionRecord({
        contentId: publicationId, publicationId, platform, externalPublicationId: publishedContent.external_post_id,
        attributionType: 'UNKNOWN', attributionWindow: windowKey, confidence: 'UNKNOWN', evidence: {},
        explanation: `No se encontró ninguna oportunidad comercial con evidencia estructural (tracking/CTA/UTM/campaña/producto) dentro de la ventana de ${windowKey} tras la publicación. ${opportunities.length} oportunidad(es) candidata(s) por proximidad temporal, ninguna con evidencia suficiente -- nunca se atribuye solo por cercanía en el tiempo.`,
      });
      store.save('attribution_record', record);
      saved.push(record);
      continue;
    }

    for (const { opp, evidence, attributionType } of matches) {
      const existing = findExisting(store, { publicationId, attributionWindow: windowKey, conversationId: opp.conversationId });
      if (existing) { skipped.push({ windowKey, conversationId: opp.conversationId, reason: 'ALREADY_RECORDED' }); continue; }

      const confidence = classifyAttributionConfidence({ attributionType, evidence });
      const { revenue, currency, saleId } = extractRevenue(opp);
      const record = createAttributionRecord({
        contentId: publicationId, publicationId, platform, externalPublicationId: publishedContent.external_post_id,
        conversationId: opp.conversationId, leadId: opp.opportunityId, saleId,
        revenue, currency, attributionType, attributionWindow: windowKey, confidence, evidence,
        explanation: `Oportunidad ${opp.opportunityId} presenta evidencia de tipo ${attributionType} dentro de la ventana de ${windowKey} (estado actual: "${opp.estado}"). Asociación registrada, no se afirma causalidad.`,
      });
      store.save('attribution_record', record);
      saved.push(record);
    }
  }

  return { status: 'OK', saved, skipped };
}

/** Recorre TODAS las publicaciones reales (con external_post_id) -- secuencial, mismo criterio que collectPerformanceForAllPublishedContent. */
export async function generateAttributionForAllPublications({ crm, store, windows = Object.keys(ATTRIBUTION_WINDOWS) }) {
  const publications = store.loadAll('published_content').filter((p) => p.external_post_id);
  const results = [];
  for (const publishedContent of publications) {
    const result = await generateAttributionForPublication({ publishedContent, crm, store, windows });
    results.push({ contentId: publishedContent.content_id, platform: publishedContent.platform, ...result });
  }
  return results;
}

/** §16 — solo se calculan cuando hay datos; nunca divide por cero, nunca estima. */
export function computeCommercialMetrics(records) {
  const nonUnknown = records.filter((r) => r.attributionType !== 'UNKNOWN');
  const attributedLeads = new Set(nonUnknown.filter((r) => r.leadId).map((r) => r.leadId)).size;
  const salesRecords = nonUnknown.filter((r) => r.saleId);
  const attributedSales = new Set(salesRecords.map((r) => r.saleId)).size;
  const { total: attributedRevenue, count: revenueCount } = computeAttributedRevenue(records);

  const totalPublicationsEvaluated = new Set(records.map((r) => r.publicationId)).size;

  return {
    attributedLeads,
    attributedSales,
    attributedRevenue,
    conversionRate: attributedLeads > 0 ? Number((attributedSales / attributedLeads).toFixed(4)) : null,
    revenuePerPublication: attributedRevenue !== null && totalPublicationsEvaluated > 0 ? Number((attributedRevenue / totalPublicationsEvaluated).toFixed(2)) : null,
    revenuePerLead: attributedRevenue !== null && attributedLeads > 0 ? Number((attributedRevenue / attributedLeads).toFixed(2)) : null,
    revenueRecordCount: revenueCount,
  };
}
