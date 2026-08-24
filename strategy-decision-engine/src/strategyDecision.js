// strategyDecision.js — Contrato StrategyDecision (Fase 2/3). Evalúa UN
// StrategyFeedback real (learning-strategy-engine/) con reglas
// determinísticas -- nunca una entidad de datos primarios propia. ACCEPT
// significa exclusivamente READY_FOR_STRATEGY_UPDATE (Fase 17/25): esta
// fase nunca ejecuta la decisión -- executionStatus está fijo en
// "NOT_EXECUTED" a nivel de contrato, estructuralmente imposible de crear
// con otro valor en esta fase.

import { randomUUID } from 'node:crypto';
import { MARKETING_CONFIDENCE_LEVELS as CONFIDENCE_LEVELS } from '../../marketing-intelligence-engine/src/marketingInsight.js';
import { EXPECTED_DIRECTIONS } from '../../learning-strategy-engine/src/learningTypes.js';

export const DECISIONS = Object.freeze(['ACCEPT', 'REJECT', 'DEFER']);
export const EXPECTED_IMPACTS = Object.freeze(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']);
export const RISKS = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']);
// Fase 13 — CAMPAIGN/CONTENT_TYPE existen en el vocabulario para cuando esos
// datos estructurados existan (hoy no: campaignId/content_type siempre
// null, ver campaignIntelligence.js y patternToLearning.js) -- nunca se
// asignan con datos actuales, documentado, no un placeholder silencioso.
export const SCOPE_TYPES = Object.freeze(['GLOBAL', 'PLATFORM', 'FORMAT', 'PRODUCT', 'CONTENT_TYPE', 'CAMPAIGN']);
export const DECISION_STATUSES = Object.freeze(['ACTIVE']);
// Fase 17/25/29 — único valor posible en esta fase. La ejecución real
// (StrategyExecution) es una fase FUTURA no implementada todavía.
export const EXECUTION_STATUSES = Object.freeze(['NOT_EXECUTED']);

const CAUSAL_PHRASES = [/\bcausa\b/i, /\bgarantiza\b/i, /\bhace que\b/i, /\bconvierte mejor\b/i, /\bpor eso funciona\b/i];

function assertNoCausalLanguage(text, field) {
  if (!text) return;
  for (const pattern of CAUSAL_PHRASES) {
    if (pattern.test(text)) throw new Error(`StrategyDecision: "${field}" contiene lenguaje causal prohibido (coincide con ${pattern}).`);
  }
}

/**
 * @param {{
 *   strategyFeedbackId:string, decision:string, decisionReason:string, evidence:object,
 *   confidence:string, evidenceCount:number, scope:string, scopeType:string,
 *   affectedPlatform?:string|null, affectedFormat?:string|null, affectedProduct?:string|null,
 *   expectedDirection?:string|null, expectedImpact:string, risk:string,
 *   contradictions?:object[], supersedes?:string|null, expiresAt?:string|null,
 *   status?:string, executionStatus?:string, source?:string,
 * }} fields
 */
export function createStrategyDecision(fields) {
  const {
    strategyFeedbackId, decision, decisionReason, evidence,
    confidence, evidenceCount, scope, scopeType,
    affectedPlatform = null, affectedFormat = null, affectedProduct = null,
    expectedDirection = null, expectedImpact, risk,
    contradictions = [], supersedes = null, expiresAt = null,
    status = 'ACTIVE', executionStatus = 'NOT_EXECUTED', source = 'strategy_decision_engine',
  } = fields;

  if (!strategyFeedbackId) throw new Error('StrategyDecision: "strategyFeedbackId" es obligatorio — toda decisión debe evaluar un StrategyFeedback real.');
  if (!DECISIONS.includes(decision)) throw new Error(`StrategyDecision: "decision" inválida "${decision}" (válidas: ${DECISIONS.join(', ')}).`);
  if (!decisionReason) throw new Error('StrategyDecision: "decisionReason" (WHY) es obligatorio.');
  assertNoCausalLanguage(decisionReason, 'decisionReason');
  if (!evidence || typeof evidence !== 'object') throw new Error('StrategyDecision: "evidence" es obligatorio (objeto).');
  if (!CONFIDENCE_LEVELS.includes(confidence)) throw new Error(`StrategyDecision: "confidence" inválida "${confidence}" (válidas: ${CONFIDENCE_LEVELS.join(', ')}).`);
  if (typeof evidenceCount !== 'number' || evidenceCount < 1) throw new Error('StrategyDecision: "evidenceCount" debe ser >= 1 — toda decisión evalúa un StrategyFeedback con evidencia real.');
  if (!scope) throw new Error('StrategyDecision: "scope" es obligatorio.');
  if (!SCOPE_TYPES.includes(scopeType)) throw new Error(`StrategyDecision: "scopeType" inválido "${scopeType}" (válidos: ${SCOPE_TYPES.join(', ')}).`);
  if (expectedDirection !== null && !EXPECTED_DIRECTIONS.includes(expectedDirection)) throw new Error(`StrategyDecision: "expectedDirection" inválida "${expectedDirection}".`);
  if (!EXPECTED_IMPACTS.includes(expectedImpact)) throw new Error(`StrategyDecision: "expectedImpact" inválido "${expectedImpact}" (válidos: ${EXPECTED_IMPACTS.join(', ')}).`);
  if (!RISKS.includes(risk)) throw new Error(`StrategyDecision: "risk" inválido "${risk}" (válidos: ${RISKS.join(', ')}).`);
  if (!Array.isArray(contradictions)) throw new Error('StrategyDecision: "contradictions" debe ser un arreglo (vacío si no hay).');
  if (!DECISION_STATUSES.includes(status)) throw new Error(`StrategyDecision: "status" inválido "${status}".`);
  if (!EXECUTION_STATUSES.includes(executionStatus)) throw new Error(`StrategyDecision: "executionStatus" inválido "${executionStatus}" -- esta fase nunca ejecuta una decisión (válido único: NOT_EXECUTED).`);
  // Fase 15 -- REJECT exige evidencia real de contradicción/supersesión, nunca "datos insuficientes" (eso es DEFER).
  if (decision === 'REJECT' && contradictions.length === 0 && !supersedes) {
    throw new Error('StrategyDecision: "decision"=REJECT requiere evidencia real (contradictions no vacío o supersedes) -- datos insuficientes debe resolverse como DEFER, nunca REJECT.');
  }

  return Object.freeze({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    strategyFeedbackId,
    decision,
    decisionReason,
    evidence: Object.freeze({ ...evidence }),
    confidence,
    evidenceCount,
    scope,
    scopeType,
    affectedPlatform,
    affectedFormat,
    affectedProduct,
    expectedDirection,
    expectedImpact,
    risk,
    contradictions: Object.freeze(contradictions.map((c) => Object.freeze({ ...c }))),
    supersedes,
    expiresAt,
    status,
    executionStatus,
    source,
  });
}
