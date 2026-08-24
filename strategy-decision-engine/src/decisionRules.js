// decisionRules.js — Strategy Decision Engine, Fases 4-17. Reglas
// determinísticas, sin ML ni LLM (§4: "la decisión debe ser reproducible").
// Toda constante reutiliza un umbral YA existente en el proyecto (nunca un
// número arbitrario nuevo) -- ver comentarios inline.

import { MIN_BASELINE_SAMPLE_SIZE } from '../../performance-learning-intelligence/src/performanceSignal.js';
import { STRATEGIC_LEARNING_TYPES } from '../../learning-strategy-engine/src/learningTypes.js';
import { SCOPE_TYPES } from './strategyDecision.js';

export { MIN_BASELINE_SAMPLE_SIZE };

// Fase 6 — MEDIUM solo es candidato a ACCEPT con evidencia adicional
// consistente. Reutiliza el MISMO criterio que ya usa
// content-strategy/src/performanceAnalysis/confidence.js para distinguir
// MEDIUM de HIGH (evidenceCount >= 2×MIN_BASELINE_SAMPLE_SIZE) -- no
// inventa un segundo umbral.
export const CONSISTENCY_SAMPLE_SIZE = MIN_BASELINE_SAMPLE_SIZE * 2;

// Fase 9/13 — reutiliza EXACTAMENTE el mismo vocabulario que
// learning-strategy-engine usa para supersesión (learningService.js#annotateSupersession,
// Fase 20 de esa fase) -- ambos problemas (contradicción aquí, supersesión
// allá) comparten la misma razón de fondo: CONTENT_LEARNING/
// ENGAGEMENT_LEARNING/PERFORMANCE_LEARNING describen UNA publicación
// puntual, nunca un patrón agregado comparable contra otro learningType.

// Fase 12 — mapeo determinístico learningType -> riesgo de seguir la
// recomendación. Ejemplos del encargo: LOW="ajuste limitado de formato",
// MEDIUM="cambio de distribución entre plataformas", HIGH="cambio de
// estrategia de producto o comercial".
const RISK_BY_LEARNING_TYPE = Object.freeze({
  CONTENT_LEARNING: 'LOW', ENGAGEMENT_LEARNING: 'LOW', PERFORMANCE_LEARNING: 'LOW', FORMAT_LEARNING: 'LOW',
  PLATFORM_LEARNING: 'MEDIUM', STRATEGY_LEARNING: 'MEDIUM', OPPORTUNITY_LEARNING: 'MEDIUM',
  PRODUCT_LEARNING: 'HIGH', COMMERCIAL_LEARNING: 'HIGH',
});

export function riskFor(learningType) {
  return RISK_BY_LEARNING_TYPE[learningType] ?? 'UNKNOWN';
}

// Fase 11 — umbrales YA usados en el proyecto: 0.25 es HIGH_DELTA_THRESHOLD
// (content-strategy/src/performanceAnalysis/confidence.js), 0.10 es
// RELATIVE_CHANGE_THRESHOLD (performance-learning-intelligence/src/
// performanceSignal.js). Nunca inventa un porcentaje de impacto futuro
// (§11: "no escribir 'esperamos +35%' si el sistema no dispone de una
// estimación válida") -- sin delta cuantificado, el impacto nunca sube a
// HIGH solo por la etiqueta de confidence.
export function expectedImpactFor({ confidence, deltaAbs }) {
  if (confidence === 'UNKNOWN') return 'UNKNOWN';
  if (typeof deltaAbs === 'number') {
    if (deltaAbs >= 0.25 && confidence === 'HIGH') return 'HIGH';
    if (deltaAbs >= 0.10) return 'MEDIUM';
    return 'LOW';
  }
  return confidence === 'HIGH' ? 'MEDIUM' : 'LOW';
}

// Fase 13 — product > format > platform > GLOBAL (el más específico gana).
export function scopeTypeFor(learningRecord) {
  if (learningRecord.product) return 'PRODUCT';
  if (learningRecord.format) return 'FORMAT';
  if (learningRecord.platform && learningRecord.platform !== 'all') return 'PLATFORM';
  return 'GLOBAL';
}
void SCOPE_TYPES; // re-exportado por conveniencia de import único en tests

function subjectDimensions(lr) {
  return { platform: lr.platform, format: lr.format, product: lr.product };
}
function overlapsSubject(a, b) {
  return ['platform', 'format', 'product'].some((d) => a[d] && b[d] && a[d] === b[d]);
}
export function directionOf(lr) {
  return lr.evidence?.expectedDirection ?? null;
}

// Fase 9 — pares de dirección que representan una tensión real sobre el
// MISMO subject: opuestos estrictos (IMPROVE/REDUCE) y la tensión
// "funciona bien pero hay que investigar antes de escalar" (IMPROVE/
// INVESTIGATE) -- exactamente el ejemplo de trabajo del encargo
// ("priorizar video" vs "video presenta peor conversión comercial").
export const OPPOSING_DIRECTIONS = new Set(['IMPROVE::REDUCE', 'REDUCE::IMPROVE', 'IMPROVE::INVESTIGATE', 'INVESTIGATE::IMPROVE']);

/**
 * Fase 9 — contradicciones reales: otro LearningRecord ESTRATÉGICO (ver
 * STRATEGIC_LEARNING_TYPES) que comparte al menos una dimensión no nula
 * (platform/format/product) con dirección esperada opuesta.
 * @param {object} learningRecord
 * @param {object[]} allLearningRecords - todos los LearningRecord ACTIVE reales (incluye el propio)
 */
export function detectContradictions(learningRecord, allLearningRecords) {
  if (!STRATEGIC_LEARNING_TYPES.includes(learningRecord.learningType)) return [];
  const myDirection = directionOf(learningRecord);
  if (!myDirection) return [];
  const subject = subjectDimensions(learningRecord);

  const contradictions = [];
  for (const other of allLearningRecords) {
    if (other.id === learningRecord.id) continue;
    if (!STRATEGIC_LEARNING_TYPES.includes(other.learningType)) continue;
    if (!overlapsSubject(subject, subjectDimensions(other))) continue;
    const otherDirection = directionOf(other);
    if (!otherDirection) continue;
    if (OPPOSING_DIRECTIONS.has(`${myDirection}::${otherDirection}`)) {
      contradictions.push({
        learningId: other.id, learningType: other.learningType, scope: other.scope,
        expectedDirection: otherDirection, evidenceCount: other.evidenceCount, confidence: other.confidence,
      });
    }
  }
  return contradictions;
}

const CONFIDENCE_RANK = Object.freeze({ HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 });

/**
 * Fase 15 — REJECT (evidencia dominante contraria) vs DEFER (evidencia
 * mixta comparable). Una contradicción se considera "dominante" solo si el
 * lado opuesto tiene confidence HIGH y al menos el doble de evidenceCount
 * que la recomendación evaluada, mientras esta última no es ya HIGH -- un
 * criterio determinístico y conservador, nunca REJECT por datos
 * insuficientes.
 */
export function isDominatedByStrongerContradiction(learningRecord, contradictions) {
  if (learningRecord.confidence === 'HIGH') return false;
  return contradictions.some((c) => c.confidence === 'HIGH' && c.evidenceCount >= learningRecord.evidenceCount * 2);
}

// Fase 10 — evidencia comercial real: un COMMERCIAL_LEARNING solo se
// generó (learning-strategy-engine/src/commercialIntelligence.js, Fase 8)
// cuando había leads/ventas/revenue no-UNKNOWN reales -- se re-verifica
// aquí de forma independiente (defensa en profundidad, mismo criterio que
// publishingScheduler.js re-verifica APPROVED antes de publicar), nunca
// confía ciegamente en la capa anterior.
export function hasRealCommercialEvidence(learningRecord) {
  if (learningRecord.learningType !== 'COMMERCIAL_LEARNING') return true; // regla no aplica a otros tipos
  const ev = learningRecord.evidence ?? {};
  return (typeof ev.nonUnknownCount === 'number' && ev.nonUnknownCount > 0) || (typeof ev.revenueRecordCount === 'number' && ev.revenueRecordCount > 0);
}

// Fase 8 — consistencia: STRATEGY_LEARNING ya es transversal por
// construcción (learning-strategy-engine/src/patternToLearning.js#buildStrategyLearning);
// para el resto, "consistente" significa evidencia propia ya robusta
// (>= 2×MIN_BASELINE_SAMPLE_SIZE, mismo umbral de confidence.js). Nunca
// exige múltiples plataformas cuando el scope ya es explícitamente de una
// sola plataforma (§8 del encargo).
export function isConsistent(learningRecord) {
  if (learningRecord.learningType === 'STRATEGY_LEARNING') return true;
  return learningRecord.evidenceCount >= CONSISTENCY_SAMPLE_SIZE;
}
