// attributionRecord.js — Fase 3. AttributionRecord: relación trazable
// content -> publication -> performance -> conversation -> lead -> sale ->
// revenue. Persiste vía PerformanceLearningStore (kind "attribution_record",
// extendido en performance-learning-intelligence/src/store.js) -- no crea
// un store nuevo (Fase 2).
//
// Mapeo de nombres a las entidades REALES del proyecto (no hay Lead/Sale
// como tablas separadas hoy):
//   contentId              -> PublishedContent.content_id
//   publicationId           -> mismo content_id (no existe un
//                              PublicationRecord con id propio distinto de
//                              PublishedContent -- ver Performance Data
//                              Foundation, Fase 1: ScheduledPublication.id
//                              existe pero está vacío en producción hoy)
//   externalPublicationId   -> PublishedContent.external_post_id
//   leadId / saleId          -> crm opportunities.opportunity_id (una sola
//                              tabla cubre ambos conceptos hoy -- ver
//                              revenueAttribution.js)

import { randomUUID } from 'node:crypto';
import { ATTRIBUTION_TYPES } from './evidenceModel.js';
import { ATTRIBUTION_CONFIDENCE_LEVELS } from './attributionConfidence.js';
import { ATTRIBUTION_WINDOWS } from './attributionWindow.js';

export function createAttributionRecord({
  contentId, publicationId, platform, externalPublicationId,
  conversationId = null, leadId = null, saleId = null,
  revenue = null, currency = null,
  attributionType, attributionWindow, confidence, evidence, explanation,
  source = 'attribution_engine',
}) {
  if (!contentId) throw new Error('AttributionRecord: "contentId" es obligatorio.');
  if (!publicationId) throw new Error('AttributionRecord: "publicationId" es obligatorio.');
  if (!platform) throw new Error('AttributionRecord: "platform" es obligatorio.');
  if (!ATTRIBUTION_TYPES.includes(attributionType)) throw new Error(`AttributionRecord: "attributionType" inválido "${attributionType}" (válidos: ${ATTRIBUTION_TYPES.join(', ')}).`);
  if (!(attributionWindow in ATTRIBUTION_WINDOWS)) throw new Error(`AttributionRecord: "attributionWindow" inválida "${attributionWindow}" (válidas: ${Object.keys(ATTRIBUTION_WINDOWS).join(', ')}).`);
  if (!ATTRIBUTION_CONFIDENCE_LEVELS.includes(confidence)) throw new Error(`AttributionRecord: "confidence" inválida "${confidence}" (válidas: ${ATTRIBUTION_CONFIDENCE_LEVELS.join(', ')}).`);
  if (!evidence || typeof evidence !== 'object') throw new Error('AttributionRecord: "evidence" es obligatorio (objeto, puede estar vacío pero no ausente) — nunca una atribución sin registrar en qué se basó.');
  if (!explanation) throw new Error('AttributionRecord: "explanation" es obligatorio.');
  if (attributionType !== 'UNKNOWN' && revenue !== null && typeof revenue !== 'number') {
    throw new Error('AttributionRecord: "revenue" debe ser un número real o null — nunca estimado.');
  }
  if (conversationId === null && (leadId !== null || saleId !== null)) {
    throw new Error('AttributionRecord: no puede haber leadId/saleId sin conversationId — la cadena conversation -> lead -> sale nunca se salta un eslabón.');
  }

  return Object.freeze({
    id: randomUUID(),
    contentId,
    publicationId,
    platform,
    externalPublicationId,
    conversationId,
    leadId,
    saleId,
    revenue,
    currency,
    attributionType,
    attributionWindow,
    attributedAt: new Date().toISOString(),
    confidence,
    evidence: Object.freeze({ ...evidence }),
    explanation,
    source,
  });
}
