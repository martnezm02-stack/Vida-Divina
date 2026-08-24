// evidenceTaxonomy.js — taxonomía de evidencia dada por el propietario:
// DATA → OBSERVATION → PATTERN → LEARNING → RECOMMENDATION, más los
// sentinels UNKNOWN e INSUFFICIENT_DATA.
//
// Regla no negociable, dada explícitamente en esta fase: "competitive
// evidence no se convierte automáticamente en sales evidence". Un
// Learning que combine evidencia COMPETITIVE con una afirmación de
// resultado de negocio (ventas, ROAS, CPA, conversión) SIN evidencia
// OWN_PERFORMANCE real que lo respalde debe ser rechazado — no es un
// juicio a posteriori, es un guard estructural (ver
// crossValidateWithOwnPerformance / assertNoUnverifiedBusinessClaim).
//
// También: "no inferir ROAS, CPA, ventas o conversiones de un competidor
// sin evidencia real" — sanitizeCompetitiveMetrics() fuerza esos campos a
// UNKNOWN si alguien intenta poblarlos sobre un registro COMPETITIVE.

import { randomUUID } from 'node:crypto';
import { CONFIDENCE_LEVELS } from './evidenceProvenance.js';

export const UNKNOWN = 'UNKNOWN';
export const INSUFFICIENT_DATA = 'INSUFFICIENT_DATA';

// 'AFFILIATE' agregado en la fase "Implementar Capa de Affiliate
// Intelligence": evidencia de canal propio (afiliados/distribuidores de
// Vida Divina observados públicamente), NUNCA fusionada con 'COMPETITIVE'
// (un afiliado no es un competidor) ni con 'CUSTOMER_RESEARCH' (un afiliado
// no es el cliente final). Misma disciplina epistemológica que COMPETITIVE:
// ver SINGLE_SOURCE_BUSINESS_CLAIM_DOMAINS abajo.
export const EVIDENCE_DOMAINS = Object.freeze(['COMPETITIVE', 'OWN_PERFORMANCE', 'CUSTOMER_RESEARCH', 'AFFILIATE']);

// Campos que Meta nunca expone para un anunciante de terceros — jamás se
// infieren, solo se registran como UNKNOWN si alguien los solicita. Aplica
// igual a COMPETITIVE y AFFILIATE: tampoco se infieren ventas/ROAS/CPA/
// conversiones de un afiliado a partir de contenido público observado.
export const FORBIDDEN_INFERRED_METRICS = Object.freeze(['sales', 'roas', 'cpa', 'conversions', 'realAudience']);

// Dominios cuya evidencia, por sí sola, nunca alcanza para afirmar un
// resultado de negocio ("vende"/conversión/ROAS/CPA) — ver
// assertNoUnverifiedBusinessClaim() y el guard de createRecommendation().
// COMPETITIVE: Meta no expone performance real de terceros. AFFILIATE:
// contenido público de un afiliado no expone performance real del negocio
// (likes/comments observables no son ventas ni intención de compra real).
export const SINGLE_SOURCE_BUSINESS_CLAIM_DOMAINS = Object.freeze(['COMPETITIVE', 'AFFILIATE']);

// Explicación exacta por dominio para los mensajes de error de los guards
// de abajo — se preserva el texto histórico de COMPETITIVE ("Meta no expone
// performance real de terceros") y se agrega el equivalente para AFFILIATE.
const SINGLE_SOURCE_BUSINESS_CLAIM_REASON = Object.freeze({
  COMPETITIVE: 'Meta no expone performance real de terceros',
  AFFILIATE: 'contenido público de un afiliado no expone performance real del negocio',
});

function assertDomain(domain) {
  if (!EVIDENCE_DOMAINS.includes(domain)) {
    throw new Error(`evidenceTaxonomy: dominio inválido "${domain}" (válidos: ${EVIDENCE_DOMAINS.join(', ')}).`);
  }
}

/** DATA — lo que realmente vemos, sin editar. */
export function createDataPoint({ domain, field, value, source }) {
  assertDomain(domain);
  if (!field?.trim()) throw new Error('DataPoint: "field" es obligatorio.');
  if (value === undefined) throw new Error('DataPoint: "value" es obligatorio (puede ser UNKNOWN, nunca undefined).');
  if (!source?.trim() && value !== UNKNOWN) throw new Error('DataPoint: "source" es obligatorio salvo que value sea UNKNOWN.');

  if (SINGLE_SOURCE_BUSINESS_CLAIM_DOMAINS.includes(domain) && FORBIDDEN_INFERRED_METRICS.includes(field) && value !== UNKNOWN) {
    throw new Error(`DataPoint: el campo "${field}" nunca se infiere para evidencia ${domain} (no expone performance real del negocio) — debe ser "${UNKNOWN}".`);
  }

  return Object.freeze({ dataPointId: randomUUID(), type: 'DATA', domain, field, value, source: source ?? null, capturedAt: new Date().toISOString() });
}

/** OBSERVATION — descripción directa a partir de datos, sin comparar contra nada más. */
export function createObservation({ domain, description, basedOnData }) {
  assertDomain(domain);
  if (!description?.trim()) throw new Error('Observation: "description" es obligatorio.');
  if (!Array.isArray(basedOnData) || basedOnData.length === 0) {
    throw new Error('Observation: "basedOnData" debe tener al menos 1 DataPoint real — nunca una observación sin dato detrás.');
  }
  return Object.freeze({ observationId: randomUUID(), type: 'OBSERVATION', domain, description, basedOnData: Object.freeze([...basedOnData]), createdAt: new Date().toISOString() });
}

/**
 * PATTERN — algo que aparece repetidamente en suficientes observaciones.
 * Nunca de una sola. `confidence` (STRONG/MODERATE/WEAK/UNKNOWN, ver
 * evidenceProvenance.js) es opcional — quien construye el Pattern declara
 * qué tan sólido lo considera; esta función nunca lo infiere ni lo eleva
 * automáticamente.
 */
export function createPattern({ domain, description, basedOnObservations, confidence = 'UNKNOWN' }) {
  assertDomain(domain);
  if (!description?.trim()) throw new Error('Pattern: "description" es obligatorio.');
  if (!Array.isArray(basedOnObservations) || basedOnObservations.length < 2) {
    throw new Error('Pattern: se requieren al menos 2 Observations — "repetido" no puede significar 1 (nunca convertir una observación aislada en patrón).');
  }
  if (!CONFIDENCE_LEVELS.includes(confidence)) {
    throw new Error(`Pattern: "confidence" inválido "${confidence}" (válidos: ${CONFIDENCE_LEVELS.join(', ')}).`);
  }
  return Object.freeze({ patternId: randomUUID(), type: 'PATTERN', domain, description, confidence, basedOnObservations: Object.freeze([...basedOnObservations]), createdAt: new Date().toISOString() });
}

/** LEARNING — conclusión estratégica derivada de patrones, nunca de una observación aislada. Mismo `confidence` opcional que Pattern. */
export function createLearning({ description, basedOnPatterns, confidence = 'UNKNOWN' }) {
  if (!description?.trim()) throw new Error('Learning: "description" es obligatorio.');
  if (!Array.isArray(basedOnPatterns) || basedOnPatterns.length === 0) {
    throw new Error('Learning: se requiere al menos 1 Pattern real — un Learning nunca nace de una Observation sola.');
  }
  if (!CONFIDENCE_LEVELS.includes(confidence)) {
    throw new Error(`Learning: "confidence" inválido "${confidence}" (válidos: ${CONFIDENCE_LEVELS.join(', ')}).`);
  }
  const domains = new Set(basedOnPatterns.map((p) => p.domain));
  return Object.freeze({
    learningId: randomUUID(),
    type: 'LEARNING',
    description,
    confidence,
    basedOnPatterns: Object.freeze([...basedOnPatterns]),
    evidenceDomains: Object.freeze([...domains]),
    createdAt: new Date().toISOString(),
  });
}

/** RECOMMENDATION — acción propuesta, nunca se autoejecuta. */
export function createRecommendation({ description, basedOnLearning }) {
  if (!description?.trim()) throw new Error('Recommendation: "description" es obligatorio.');
  if (!basedOnLearning?.learningId) throw new Error('Recommendation: "basedOnLearning" debe ser un Learning real.');
  // Mismo guard que assertNoUnverifiedBusinessClaim, aplicado aquí también:
  // una Recommendation que nace de un Learning basado en un único dominio de
  // evidencia "solo-fuente-única" (COMPETITIVE o AFFILIATE, ver
  // SINGLE_SOURCE_BUSINESS_CLAIM_DOMAINS) no puede afirmar un resultado de
  // negocio ("vende"/conversión/ROAS/CPA) — la acción propuesta puede ser
  // "explorar este ángulo", nunca "esto vende".
  const singleSourceDomain = basedOnLearning.evidenceDomains?.length === 1 && SINGLE_SOURCE_BUSINESS_CLAIM_DOMAINS.includes(basedOnLearning.evidenceDomains[0]);
  if (singleSourceDomain && BUSINESS_OUTCOME_KEYWORDS.test(description)) {
    const domain = basedOnLearning.evidenceDomains[0];
    throw new Error(`Recommendation: afirma un resultado de negocio basándose en un Learning que solo tiene evidencia ${domain} — ${SINGLE_SOURCE_BUSINESS_CLAIM_REASON[domain]} (ver assertNoUnverifiedBusinessClaim).`);
  }
  return Object.freeze({ recommendationId: randomUUID(), type: 'RECOMMENDATION', description, basedOnLearning: basedOnLearning.learningId, autoExecutes: false, createdAt: new Date().toISOString() });
}

// ---------------------------------------------------------------------
// Guard central: competitive evidence nunca se convierte automáticamente
// en sales evidence.
// ---------------------------------------------------------------------

export const BUSINESS_OUTCOME_KEYWORDS = /\b(vende|ventas|sales|conversion|convierte|roas|cpa)\b/i;

/**
 * Rechaza un Learning que (a) se basa únicamente en evidencia de un dominio
 * "solo-fuente-única" (COMPETITIVE o AFFILIATE, ver
 * SINGLE_SOURCE_BUSINESS_CLAIM_DOMAINS) y (b) su descripción afirma un
 * resultado de negocio — exactamente la regla dada: "nunca afirmar 'este
 * anuncio vende' si solo sabemos que está activo", extendida a evidencia de
 * afiliado: "nunca afirmar 'esto vende' a partir de likes/comments públicos
 * de un afiliado".
 */
export function assertNoUnverifiedBusinessClaim(learning) {
  const singleSourceDomain = learning.evidenceDomains.length === 1 && SINGLE_SOURCE_BUSINESS_CLAIM_DOMAINS.includes(learning.evidenceDomains[0]);
  if (singleSourceDomain && BUSINESS_OUTCOME_KEYWORDS.test(learning.description)) {
    const domain = learning.evidenceDomains[0];
    throw new Error(`Learning: afirma un resultado de negocio ("vende"/conversión/ROAS/CPA) basándose únicamente en evidencia ${domain} — ${SINGLE_SOURCE_BUSINESS_CLAIM_REASON[domain]}; esto requiere evidencia OWN_PERFORMANCE real (ver crossValidateWithOwnPerformance).`);
  }
  return true;
}

/**
 * El único camino sancionado para combinar un patrón competitivo con
 * desempeño propio: "COMPETITOR PATTERN + VIDA DIVINA PERFORMANCE =
 * STRATEGIC LEARNING" (dado explícitamente en la fase anterior). Exige
 * ambos lados con evidencia real — nunca asume que un patrón competitivo
 * es automáticamente un ganador para Vida Divina.
 */
export function crossValidateWithOwnPerformance({ competitivePattern, ownPerformancePattern, description }) {
  if (competitivePattern?.domain !== 'COMPETITIVE') {
    throw new Error('crossValidateWithOwnPerformance: "competitivePattern" debe ser un Pattern de dominio COMPETITIVE.');
  }
  if (ownPerformancePattern?.domain !== 'OWN_PERFORMANCE') {
    throw new Error('crossValidateWithOwnPerformance: "ownPerformancePattern" debe ser un Pattern de dominio OWN_PERFORMANCE — sin esto, el patrón competitivo se queda como Opportunity, nunca como Learning (ver competitiveAbstraction.js).');
  }
  const learning = createLearning({ description, basedOnPatterns: [competitivePattern, ownPerformancePattern] });
  return Object.freeze({ ...learning, subType: 'STRATEGIC_LEARNING' });
}

/** Fuerza a UNKNOWN cualquier métrica prohibida presente en un registro COMPETITIVE — nunca se borra en silencio, se reporta qué se saneó. */
export function sanitizeCompetitiveMetrics(record) {
  const sanitized = { ...record };
  const scrubbedFields = [];
  for (const field of FORBIDDEN_INFERRED_METRICS) {
    if (field in sanitized && sanitized[field] !== UNKNOWN) {
      sanitized[field] = UNKNOWN;
      scrubbedFields.push(field);
    }
  }
  return { record: sanitized, scrubbedFields };
}
