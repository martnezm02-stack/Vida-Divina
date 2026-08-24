// affiliatePipeline.js — conecta la cadena genérica de evidenceTaxonomy.js
// (DATA → OBSERVATION → PATTERN → LEARNING → RECOMMENDATION) para el
// dominio 'AFFILIATE': contenido público de afiliados/distribuidores de
// Vida Divina, NUNCA evidencia de competidor ni evidencia de cliente.
//
// FASE: "Implementar Capa de Affiliate Intelligence". No redefine ninguna
// pieza ya construida (evidenceTaxonomy.js, competitiveAbstraction.js,
// competitivePipeline.js) — solo agrega el pegamento mínimo específico de
// la forma real de los registros Affiliate Evidence (AE-00X), que es
// distinta de CompetitorCreativeRecord (posts orgánicos con WhatsApp/CTA de
// afiliado, no anuncios de Meta Ad Library).
//
// REGLA CENTRAL (dada explícitamente): Affiliate Evidence nunca se convierte
// en Customer Evidence ni en Persona/Pain — personaStage.js/painStage.js no
// se tocan y siguen rechazando el dominio AFFILIATE estructuralmente. Lo que
// esta capa produce (Pattern/Learning/Opportunity de dominio AFFILIATE) solo
// puede alimentar CreativeCell.evidence como contexto adicional, nunca la
// Persona/Pain de la celda.
//
// Reutiliza sin modificar: computeStrategicPriority(), selectPriorityCreativeCells(),
// describeMarketRepresentativeness(), createPreliminaryStrategicHypothesis()
// (competitivePipeline.js) — todas domain-agnostic, se importan directamente
// desde ahí por quien orqueste esta capa, no se duplican aquí.

import { createDataPoint, createObservation, createPattern, createLearning, assertNoUnverifiedBusinessClaim } from './evidenceTaxonomy.js';

// ---------------------------------------------------------------------
// Clasificación OBSERVED / INFERRED de los campos reales de un registro
// Affiliate Evidence (AE-00X, ver snapshot 3d992b38...). Mismo criterio que
// FIELD_KIND en competitiveAbstraction.js: OBSERVED = lo que el post
// públicamente muestra; INFERRED = juicio del analista.
//
// claimClassification NO es un hecho expuesto por Facebook — es nuestra
// propia clasificación de riesgo/veracidad sobre observedClaim. Tratarlo
// como OBSERVED permitiría que un juicio propio se disfrazara de dato
// crudo; por eso es INFERRED, igual que confidence y notes (comentario del
// analista sobre su propia observación).
// ---------------------------------------------------------------------
export const AFFILIATE_FIELD_KIND = Object.freeze({
  evidenceId: 'internal_reference',
  source: 'OBSERVED',
  sourceUrl: 'OBSERVED',
  dateObserved: 'OBSERVED',
  platform: 'OBSERVED',
  // Declarado/verificado por el propietario del negocio, no expuesto por
  // Facebook — es procedencia (provenance), no dato de contenido del post.
  affiliateRelationship: 'internal_reference',
  postUrl: 'OBSERVED_OR_UNKNOWN',
  contentType: 'OBSERVED',
  contentTypeNote: 'OBSERVED_OR_UNKNOWN',
  product: 'OBSERVED_OR_UNKNOWN',
  hookStructure: 'OBSERVED',
  format: 'OBSERVED',
  cta: 'OBSERVED',
  publicEngagement: 'OBSERVED_OR_UNKNOWN',
  publicIntent: 'OBSERVED_OR_UNKNOWN',
  leadMechanism: 'OBSERVED',
  // El texto/paráfrasis del claim tal como aparece en el post es en sí
  // observado; lo que NO es observado es su clasificación de riesgo (ver
  // claimClassification abajo).
  observedClaim: 'OBSERVED',
  claimClassification: 'INFERRED',
  confidence: 'INFERRED',
  notes: 'INFERRED',
});

const OBSERVED_AFFILIATE_FIELD_KINDS = new Set(['OBSERVED', 'OBSERVED_OR_UNKNOWN']);

/**
 * DATA — construye un DataPoint SOLO a partir de un campo realmente
 * observado de un registro Affiliate Evidence (AE-00X). Rechaza construir un
 * DataPoint desde un campo INFERRED (ej. claimClassification, confidence,
 * notes) disfrazándolo de dato crudo. `source` se fija al evidenceId real
 * (AE-00X) — es el punto de anclaje de toda la trazabilidad hacia arriba:
 * affiliateEvidenceId → dataPointId → observationId → patternId → learningId.
 */
export function deriveDataPointFromAffiliateRecord(record, field) {
  if (!record?.evidenceId) {
    throw new Error('deriveDataPointFromAffiliateRecord: se requiere un registro de Affiliate Evidence real con "evidenceId" (ej. "AE-001").');
  }
  const kind = AFFILIATE_FIELD_KIND[field];
  if (!kind || !OBSERVED_AFFILIATE_FIELD_KINDS.has(kind)) {
    throw new Error(`deriveDataPointFromAffiliateRecord: "${field}" no es un campo OBSERVED de un registro de Affiliate Evidence (kind: ${kind ?? 'desconocido'}) — un DataPoint solo puede construirse desde lo realmente observado, nunca desde un campo INFERRED (ej. claimClassification, confidence, notes).`);
  }
  if (!(field in record)) {
    throw new Error(`deriveDataPointFromAffiliateRecord: el registro ${record.evidenceId} no tiene el campo "${field}".`);
  }
  return createDataPoint({
    domain: 'AFFILIATE',
    field,
    value: record[field],
    source: record.evidenceId,
  });
}

/** OBSERVATION — una descripción sobre UN registro de afiliado, respaldada por sus DataPoints OBSERVED reales. */
export function deriveAffiliateObservation(record, description, fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error('deriveAffiliateObservation: se requiere al menos 1 campo OBSERVED real para respaldar la observación.');
  }
  const dataPoints = fields.map((field) => deriveDataPointFromAffiliateRecord(record, field));
  return createObservation({ domain: 'AFFILIATE', description, basedOnData: dataPoints });
}

/** PATTERN — fija domain='AFFILIATE'; createPattern ya exige ≥2 Observations reales (nunca de 1 sola). */
export function deriveAffiliatePattern(observations, description, confidence = 'UNKNOWN') {
  return createPattern({ domain: 'AFFILIATE', description, basedOnObservations: observations, confidence });
}

/** LEARNING — aplica el guard anti-claim de negocio automáticamente (evidenceTaxonomy.js, ampliado para cubrir AFFILIATE). */
export function deriveAffiliateLearning(patterns, description, confidence = 'UNKNOWN') {
  const learning = createLearning({ description, basedOnPatterns: patterns, confidence });
  assertNoUnverifiedBusinessClaim(learning);
  return learning;
}

// ---------------------------------------------------------------------
// Compliance — los claims observados marcados de riesgo (UNVERIFIED_CLAIM /
// COMPLIANCE_REVIEW_REQUIRED) pueden registrarse como EXISTENTES, nunca
// reutilizarse como recomendación/mecanismo/copy.
// ---------------------------------------------------------------------

/**
 * Recolecta, tal cual fueron observados (sin editar), los observedClaim de
 * los registros marcados UNVERIFIED_CLAIM y/o COMPLIANCE_REVIEW_REQUIRED —
 * la lista que assertNoComplianceRiskClaimReused() usa para bloquear su
 * reutilización.
 */
export function collectComplianceRiskClaims(records) {
  if (!Array.isArray(records)) {
    throw new Error('collectComplianceRiskClaims: se requiere un arreglo de registros de Affiliate Evidence.');
  }
  const claims = [];
  for (const record of records) {
    const classification = Array.isArray(record.claimClassification) ? record.claimClassification : [];
    const isRisky = classification.includes('UNVERIFIED_CLAIM') || classification.includes('COMPLIANCE_REVIEW_REQUIRED');
    if (!isRisky) continue;
    const claimValue = record.observedClaim;
    const values = Array.isArray(claimValue) ? claimValue : [claimValue];
    for (const value of values) {
      if (value && value !== 'NONE' && !value.startsWith?.('NONE')) claims.push(value);
    }
  }
  return Object.freeze([...new Set(claims)]);
}

/**
 * Rechaza cualquier texto (description de Recommendation/Opportunity,
 * mechanismFraming de un AbstractionRecord, etc.) que reproduzca, literal o
 * casi literalmente, uno de los claims de riesgo observados. "La
 * inteligencia puede registrar que EXISTEN. No puede recomendar imitarlos"
 * — regla dada explícitamente en esta fase.
 */
export function assertNoComplianceRiskClaimReused({ text, riskyClaims }) {
  if (!text?.trim()) throw new Error('assertNoComplianceRiskClaimReused: "text" es obligatorio.');
  if (!Array.isArray(riskyClaims)) {
    throw new Error('assertNoComplianceRiskClaimReused: "riskyClaims" debe ser un arreglo real (ver collectComplianceRiskClaims).');
  }
  const lowerText = text.trim().toLowerCase();
  for (const claim of riskyClaims) {
    if (!claim?.trim()) continue;
    if (lowerText.includes(claim.trim().toLowerCase())) {
      throw new Error(`assertNoComplianceRiskClaimReused: el texto reproduce un claim de riesgo de compliance observado ("${claim}") — un claim UNVERIFIED_CLAIM/COMPLIANCE_REVIEW_REQUIRED de Affiliate Evidence nunca puede convertirse en recommendation/mechanism/copy.`);
    }
  }
  return true;
}
