// strategyFeedback.js — Contrato StrategyFeedback (Fase 13/14). Estructura
// WHAT/WHY/EVIDENCE/CONFIDENCE/SCOPE/EXPECTED_DIRECTION -- explicable por un
// humano, siempre status="PROPOSED" por defecto (§13: sin workflow
// automático de aprobación todavía). Nunca ejecuta ninguna acción por sí
// misma -- es un dato estructurado, no un comando.

import { randomUUID } from 'node:crypto';
import { STRATEGY_FEEDBACK_STATUSES, EXPECTED_DIRECTIONS } from './learningTypes.js';
import { MARKETING_CONFIDENCE_LEVELS as CONFIDENCE_LEVELS } from '../../marketing-intelligence-engine/src/marketingInsight.js';

const CAUSAL_PHRASES = [/\bcausa\b/i, /\bgarantiza\b/i, /\bhace que\b/i, /\bconvierte mejor\b/i, /\bpor eso funciona\b/i];

function assertNoCausalLanguage(text, field) {
  for (const pattern of CAUSAL_PHRASES) {
    if (pattern.test(text)) throw new Error(`StrategyFeedback: "${field}" contiene lenguaje causal prohibido (coincide con ${pattern}).`);
  }
}

/**
 * @param {{
 *   learningId:string, recommendation:string, rationale:string, evidence:object,
 *   confidence:string, affectedPlatform?:string|null, affectedFormat?:string|null,
 *   affectedProduct?:string|null, expectedDirection:string, status?:string, source?:string,
 * }} fields
 */
export function createStrategyFeedback(fields) {
  const {
    learningId, recommendation, rationale, evidence, confidence,
    affectedPlatform = null, affectedFormat = null, affectedProduct = null,
    expectedDirection, status = 'PROPOSED', source = 'learning_strategy_engine',
  } = fields;

  if (!learningId) throw new Error('StrategyFeedback: "learningId" es obligatorio — toda recomendación debe originarse en un LearningRecord real.');
  if (!recommendation) throw new Error('StrategyFeedback: "recommendation" (WHAT) es obligatorio.');
  if (!rationale) throw new Error('StrategyFeedback: "rationale" (WHY) es obligatorio.');
  assertNoCausalLanguage(recommendation, 'recommendation');
  assertNoCausalLanguage(rationale, 'rationale');
  if (!evidence || typeof evidence !== 'object') throw new Error('StrategyFeedback: "evidence" es obligatorio (objeto).');
  if (!CONFIDENCE_LEVELS.includes(confidence)) throw new Error(`StrategyFeedback: "confidence" inválida "${confidence}" (válidas: ${CONFIDENCE_LEVELS.join(', ')}).`);
  if (!EXPECTED_DIRECTIONS.includes(expectedDirection)) throw new Error(`StrategyFeedback: "expectedDirection" inválida "${expectedDirection}" (válidas: ${EXPECTED_DIRECTIONS.join(', ')}).`);
  if (!STRATEGY_FEEDBACK_STATUSES.includes(status)) throw new Error(`StrategyFeedback: "status" inválido "${status}" (válidos: ${STRATEGY_FEEDBACK_STATUSES.join(', ')}).`);

  return Object.freeze({
    id: randomUUID(),
    generatedAt: new Date().toISOString(),
    learningId,
    recommendation,
    rationale,
    evidence: Object.freeze({ ...evidence }),
    confidence,
    affectedPlatform,
    affectedFormat,
    affectedProduct,
    expectedDirection,
    status,
    source,
  });
}
