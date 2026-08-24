// customerEvidenceRecord.js — Fase 4C (Customer Research Ingestion Engine).
// Contrato explícito para UN registro real de Customer Evidence, listo
// para viajar dentro de un evidenceBatch de CycleInput con
// domain:'CUSTOMER_EVIDENCE' (ver schemas/cycleInput.schema.js, Fase 4A).
//
// Reutiliza createProvenance() (evidenceProvenance.js, generalizado en esta
// misma fase para aceptar evidenceDomain:'CUSTOMER_RESEARCH') para la
// procedencia -- no duplica esos campos de forma plana en el registro, los
// anida en record.provenance. No inventa un modelo nuevo de evidencia:
// evidenceId/verbatimQuote/sourcePlatform son exactamente los campos que
// personaStage.js/painStage.js/evidenceIndex.js ya leen (ver
// resolveEvidenceIds()); todo lo demás (sourceUrl, sourceType, observedAt,
// contentDate, confidence, originalEvidenceId) vive en record.provenance.
//
// REGLA CENTRAL: esta función NUNCA genera evidenceId, verbatimQuote ni
// fuente por sí sola -- los tres deben venir de una fuente real ya
// controlada (revisión humana), nunca de scraping, crawling, LLM,
// WhatsApp automático ni ningún conector externo (fuera de alcance de
// esta fase, ver customerResearchSource.js).

import { createProvenance } from './evidenceProvenance.js';

/**
 * @param {{
 *   evidenceId: string,               // ej. "CE-01" -- citable de forma única en el evidenceBatch (evidenceIndex.js)
 *   verbatimQuote: string,            // lenguaje real y textual del cliente -- nunca parafraseado ni inventado
 *   sourcePlatform: string,           // ej. "WhatsApp postventa", "reseña Google", "llamada de venta (transcripción)"
 *   sourceUrl?: string|null,          // cuando exista (ej. un link a la reseña pública) -- null si la fuente no tiene URL real (ej. una llamada)
 *   sourceType: string,               // ej. "CUSTOMER_TESTIMONIAL", "SALES_CALL_TRANSCRIPT", "SUPPORT_TICKET", "PRODUCT_REVIEW"
 *   observedAt: string,               // fecha real en que se observó/registró esta evidencia (ISO 8601)
 *   contentDate?: string|null,        // cuando exista y sea distinta de observedAt (ej. fecha real de la reseña)
 *   originalEvidenceId?: string|null, // id que la fuente original le dio a este dato, si aplica -- default: el mismo evidenceId
 *   confidence?: string,              // STRONG/MODERATE/WEAK/UNKNOWN (evidenceProvenance.js) -- nunca CUSTOMER_VALIDATED (eso es un campo de Persona, no de evidencia)
 * }}
 * @returns {{evidenceId:string, verbatimQuote:string, sourcePlatform:string, provenance:object}}
 */
export function createCustomerEvidenceRecord({
  evidenceId,
  verbatimQuote,
  sourcePlatform,
  sourceUrl = null,
  sourceType,
  observedAt,
  contentDate = null,
  originalEvidenceId = null,
  confidence = 'UNKNOWN',
}) {
  if (!evidenceId?.trim()) {
    throw new Error('CustomerEvidenceRecord: "evidenceId" es obligatorio -- cada registro debe ser citable de forma única (ver evidenceIndex.js), nunca se genera automáticamente.');
  }
  if (!verbatimQuote?.trim()) {
    throw new Error('CustomerEvidenceRecord: "verbatimQuote" es obligatorio -- nunca se infiere, parafrasea ni inventa un verbatim de cliente.');
  }
  if (!sourcePlatform?.trim()) {
    throw new Error('CustomerEvidenceRecord: "sourcePlatform" es obligatorio -- todo verbatim de cliente debe citar de dónde salió.');
  }

  const provenance = createProvenance({
    evidenceDomain: 'CUSTOMER_RESEARCH',
    source: sourcePlatform,
    sourceUrl,
    sourceCurrentlyUnavailable: !sourceUrl,
    sourcePlatform,
    sourceType,
    observedAt,
    contentDate,
    originalEvidenceId: originalEvidenceId ?? evidenceId,
    confidence,
  });

  // Forma mínima que evidenceIndex.js/personaStage.js/painStage.js ya
  // saben leer (evidenceId/verbatimQuote/sourcePlatform), + provenance
  // anidado con la procedencia completa -- nunca duplicada de forma plana.
  return Object.freeze({
    evidenceId,
    verbatimQuote,
    sourcePlatform,
    provenance,
  });
}

/** Revalida un registro ya construido (ej. leído de un archivo/fuente externa) sin pasar por createCustomerEvidenceRecord(). */
export function validateCustomerEvidenceRecord(record) {
  createCustomerEvidenceRecord({
    evidenceId: record?.evidenceId,
    verbatimQuote: record?.verbatimQuote,
    sourcePlatform: record?.sourcePlatform,
    sourceUrl: record?.provenance?.sourceUrl ?? null,
    sourceType: record?.provenance?.sourceType,
    observedAt: record?.provenance?.observedAt,
    contentDate: record?.provenance?.contentDate ?? null,
    originalEvidenceId: record?.provenance?.originalEvidenceId ?? null,
    confidence: record?.provenance?.confidence ?? 'UNKNOWN',
  });
  return true;
}
