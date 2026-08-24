// learningRecord.js — Contrato LearningRecord (Fase 2). Aprendizaje
// estructurado derivado MECÁNICAMENTE de MarketingInsight/PerformanceInsight/
// AttributionRecord ya existentes -- nunca una entidad de datos primarios
// propia, nunca inferida de caption/filename/proximidad temporal/intuición
// (Fase 4).
//
// No duplica learning_insight (performance-learning-intelligence/src/
// learningInsight.js, Fase 12): ese es CURADO manualmente (evidence/pattern
// los redacta un humano/proceso externo); LearningRecord es MECÁNICO
// (generado por learningService.js a partir de MarketingInsight ya
// persistido/calculado, sin intervención humana) -- mismo criterio de
// no-duplicación ya usado para justificar MarketingInsight vs
// PerformanceInsight en la fase anterior.

import { randomUUID } from 'node:crypto';
import { LEARNING_TYPES, LEARNING_STATUSES } from './learningTypes.js';
import { MARKETING_CONFIDENCE_LEVELS as CONFIDENCE_LEVELS } from '../../marketing-intelligence-engine/src/marketingInsight.js';

const CAUSAL_PHRASES = [/\bcausa\b/i, /\bgarantiza\b/i, /\bhace que\b/i, /\bconvierte mejor\b/i, /\bgenera\b/i, /\bpor eso funciona\b/i];

function assertNoCausalLanguage(text, field) {
  if (!text) return;
  for (const pattern of CAUSAL_PHRASES) {
    if (pattern.test(text)) {
      throw new Error(`LearningRecord: "${field}" contiene lenguaje causal prohibido (coincide con ${pattern}) — Fase 15: solo señal/asociación/patrón/tendencia, nunca causalidad.`);
    }
  }
}

/**
 * @param {{
 *   learningType:string, scope:string, observation:string, pattern?:string|null,
 *   evidence:object, evidenceCount:number, confidence:string,
 *   implication?:string|null, recommendation?:string|null,
 *   platform?:string|null, format?:string|null, product?:string|null, contentType?:string|null,
 *   relatedInsightIds:string[], relatedContentIds:string[], relatedPublicationIds?:string[],
 *   attributionSummary?:object|null, status?:string, source?:string,
 * }} fields
 */
export function createLearningRecord(fields) {
  const {
    learningType, scope, observation, pattern = null,
    evidence, evidenceCount, confidence,
    implication = null, recommendation = null,
    platform = null, format = null, product = null, contentType = null,
    relatedInsightIds, relatedContentIds, relatedPublicationIds = relatedContentIds,
    attributionSummary = null, status = 'ACTIVE', source = 'learning_strategy_engine',
  } = fields;

  if (!LEARNING_TYPES.includes(learningType)) throw new Error(`LearningRecord: "learningType" inválido "${learningType}" (válidos: ${LEARNING_TYPES.join(', ')}).`);
  if (!scope) throw new Error('LearningRecord: "scope" es obligatorio.');
  if (!observation) throw new Error('LearningRecord: "observation" es obligatorio.');
  assertNoCausalLanguage(observation, 'observation');
  assertNoCausalLanguage(pattern, 'pattern');
  assertNoCausalLanguage(implication, 'implication');
  assertNoCausalLanguage(recommendation, 'recommendation');
  if (!evidence || typeof evidence !== 'object') throw new Error('LearningRecord: "evidence" es obligatorio (objeto) — Fase 4: nunca un aprendizaje sin poder señalar su evidencia.');
  if (!CONFIDENCE_LEVELS.includes(confidence)) throw new Error(`LearningRecord: "confidence" inválida "${confidence}" (válidas: ${CONFIDENCE_LEVELS.join(', ')}).`);
  // DATA_QUALITY_LEARNING documenta una AUSENCIA de evidencia -- puede
  // legítimamente tener evidenceCount=0 y relatedContentIds vacío (ej. "no
  // existe ningún product_ref registrado"). Cualquier otro tipo SIEMPRE
  // requiere evidencia real >= 1 (Fase 4).
  if (learningType !== 'DATA_QUALITY_LEARNING') {
    if (typeof evidenceCount !== 'number' || evidenceCount < 1) throw new Error('LearningRecord: "evidenceCount" debe ser >= 1 para todo tipo distinto de DATA_QUALITY_LEARNING.');
    if (!Array.isArray(relatedContentIds) || relatedContentIds.length === 0) throw new Error('LearningRecord: "relatedContentIds" debe ser un arreglo no vacío — trazabilidad hacia PublishedContent real.');
  } else if (typeof evidenceCount !== 'number' || evidenceCount < 0) {
    throw new Error('LearningRecord: "evidenceCount" debe ser un número >= 0.');
  }
  if (!Array.isArray(relatedInsightIds)) throw new Error('LearningRecord: "relatedInsightIds" debe ser un arreglo (puede estar vacío solo para DATA_QUALITY_LEARNING).');
  if (!LEARNING_STATUSES.includes(status)) throw new Error(`LearningRecord: "status" inválido "${status}" (válidos: ${LEARNING_STATUSES.join(', ')}).`);

  return Object.freeze({
    id: randomUUID(),
    generatedAt: new Date().toISOString(),
    learningType,
    scope,
    observation,
    pattern,
    evidence: Object.freeze({ ...evidence }),
    evidenceCount,
    confidence,
    implication,
    recommendation,
    platform,
    format,
    product,
    contentType,
    relatedInsightIds: Object.freeze([...relatedInsightIds]),
    relatedContentIds: Object.freeze([...relatedContentIds]),
    relatedPublicationIds: Object.freeze([...relatedPublicationIds]),
    attributionSummary: attributionSummary ? Object.freeze({ ...attributionSummary }) : null,
    status,
    source,
  });
}
