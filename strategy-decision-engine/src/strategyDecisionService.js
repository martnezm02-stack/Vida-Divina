// strategyDecisionService.js — StrategyDecisionService (Fase 21). Orquesta,
// sin reimplementar ninguno:
//   - listLearningRecords (learning-strategy-engine -- ya anota
//     supersededBy en lectura, Fase 9 §20, se reutiliza tal cual)
//   - listStrategyFeedback (learning-strategy-engine)
//   - decisionRules.js (este mismo módulo, Fases 4-17)
//
// Generación (pura) separada de persistencia -- mismo patrón que
// marketing-intelligence-engine/learning-strategy-engine: el GET de la API
// lee strategy_decision YA persistidos, nunca genera como efecto
// secundario de una lectura.

import { performanceLearningStore as defaultStore } from '../../content-strategy/src/performanceLearningStoreInstance.js';
import { listLearningRecords, listStrategyFeedback } from '../../learning-strategy-engine/src/learningService.js';
import { createStrategyDecision } from './strategyDecision.js';
import {
  MIN_BASELINE_SAMPLE_SIZE, CONSISTENCY_SAMPLE_SIZE, riskFor, expectedImpactFor, scopeTypeFor,
  detectContradictions, isDominatedByStrongerContradiction, hasRealCommercialEvidence, isConsistent,
  directionOf, OPPOSING_DIRECTIONS,
} from './decisionRules.js';

const DECISION_VALIDITY_DAYS = 30; // Fase 18 -- expiración lógica propia de este engine; no existe un equivalente ya establecido en el proyecto para "cuánto dura vigente una decisión estratégica".

const REASON_TEXT = Object.freeze({
  LEARNING_RECORD_NOT_FOUND: 'No se encontró el LearningRecord de origen -- no hay evidencia trazable que evaluar.',
  CONFIDENCE_UNKNOWN: 'La recomendación tiene confidence UNKNOWN -- no hay evidencia suficiente para decidir todavía.',
  CONFIDENCE_LOW: 'La recomendación tiene confidence LOW -- se requiere más evidencia antes de decidir.',
  SAMPLE_SIZE_INSUFFICIENT: `La muestra real (evidenceCount) está por debajo del mínimo requerido (${MIN_BASELINE_SAMPLE_SIZE}).`,
  MEDIUM_CONFIDENCE_WITHOUT_CONSISTENCY: `Confidence MEDIUM sin evidencia adicional consistente (se requiere evidenceCount >= ${CONSISTENCY_SAMPLE_SIZE} o un patrón transversal confirmado).`,
  CONTRADICTORY_EVIDENCE: 'Existe evidencia contradictoria de fuerza comparable sobre el mismo alcance -- no se acepta ni se rechaza automáticamente ninguna de las dos señales.',
  DOMINATED_BY_STRONGER_CONTRADICTION: 'Existe evidencia contraria con confidence HIGH y muestra sustancialmente mayor sobre el mismo alcance -- esta recomendación queda dominada por esa evidencia.',
  SUPERSEDED_BY_CONTRADICTING_EVIDENCE: 'El aprendizaje de origen fue reemplazado por evidencia más reciente con una dirección esperada opuesta.',
  UNKNOWN_ATTRIBUTION: 'El aprendizaje comercial no está respaldado por AttributionRecord real (no-UNKNOWN) -- atribución UNKNOWN nunca se usa como evidencia positiva de revenue.',
  EVIDENCE_SUFFICIENT: 'La recomendación cumple evidencia mínima, confidence, consistencia y no presenta contradicciones sobre su alcance.',
});

function baseFieldsFor(feedback, learningRecord) {
  return {
    strategyFeedbackId: feedback.id,
    confidence: feedback.confidence,
    evidenceCount: feedback.evidence?.evidenceCount ?? 1,
    scope: feedback.evidence?.scope ?? learningRecord?.scope ?? 'unknown',
    scopeType: learningRecord ? scopeTypeFor(learningRecord) : 'GLOBAL',
    affectedPlatform: feedback.affectedPlatform,
    affectedFormat: feedback.affectedFormat,
    affectedProduct: feedback.affectedProduct,
    expectedDirection: feedback.expectedDirection,
  };
}

function defer(base, { reasonCode, extra = {}, contradictions = [], risk }) {
  return createStrategyDecision({
    ...base, risk, decision: 'DEFER', decisionReason: REASON_TEXT[reasonCode],
    evidence: { reasonCode, deferRequirements: extra }, expectedImpact: 'UNKNOWN', contradictions,
  });
}
function reject(base, { reasonCode, contradictions, risk }) {
  return createStrategyDecision({
    ...base, risk, decision: 'REJECT', decisionReason: REASON_TEXT[reasonCode],
    evidence: { reasonCode }, expectedImpact: 'UNKNOWN', contradictions,
  });
}
function accept(base, { risk, expectedImpact, evidence }) {
  const expiresAt = new Date(Date.now() + DECISION_VALIDITY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  return createStrategyDecision({
    ...base, risk, decision: 'ACCEPT', decisionReason: REASON_TEXT.EVIDENCE_SUFFICIENT,
    evidence: { reasonCode: 'EVIDENCE_SUFFICIENT', ...evidence }, expectedImpact, contradictions: [], expiresAt,
  });
}

/**
 * Fase 4-17 — evalúa UN StrategyFeedback real con reglas determinísticas.
 * Nunca usa ML/LLM (§4) -- misma entrada siempre produce la misma salida.
 * @param {{feedback:object, learningRecord:object|null, allLearningRecords:object[]}} params
 */
export function evaluateFeedback({ feedback, learningRecord, allLearningRecords, minSampleSize = MIN_BASELINE_SAMPLE_SIZE }) {
  const base = baseFieldsFor(feedback, learningRecord);

  if (!learningRecord) {
    return defer(base, { reasonCode: 'LEARNING_RECORD_NOT_FOUND', risk: 'UNKNOWN', extra: { missingEvidence: 'LearningRecord de origen' } });
  }
  const risk = riskFor(learningRecord.learningType);

  // Fase 6/5 -- confidence
  if (feedback.confidence === 'UNKNOWN') return defer(base, { reasonCode: 'CONFIDENCE_UNKNOWN', risk, extra: { missingEvidence: 'confidence real (no UNKNOWN)' } });
  if (feedback.confidence === 'LOW') return defer(base, { reasonCode: 'CONFIDENCE_LOW', risk, extra: { missingEvidence: 'mayor confidence (MEDIUM o HIGH)' } });

  // Fase 7 -- sample size
  if (base.evidenceCount < minSampleSize) {
    return defer(base, { reasonCode: 'SAMPLE_SIZE_INSUFFICIENT', risk, extra: { requiredSampleSize: minSampleSize, observedSampleSize: base.evidenceCount } });
  }

  // Fase 6/8 -- MEDIUM exige consistencia adicional
  if (feedback.confidence === 'MEDIUM' && !isConsistent(learningRecord)) {
    return defer(base, { reasonCode: 'MEDIUM_CONFIDENCE_WITHOUT_CONSISTENCY', risk, extra: { requiredSampleSize: CONSISTENCY_SAMPLE_SIZE, observedSampleSize: base.evidenceCount } });
  }

  // Fase 9 -- contradicciones
  const contradictions = detectContradictions(learningRecord, allLearningRecords);
  if (contradictions.length > 0) {
    if (isDominatedByStrongerContradiction(learningRecord, contradictions)) {
      return reject(base, { reasonCode: 'DOMINATED_BY_STRONGER_CONTRADICTION', contradictions, risk });
    }
    return defer(base, { reasonCode: 'CONTRADICTORY_EVIDENCE', contradictions, risk, extra: { missingEvidence: 'resolución de la contradicción (más evidencia o un patrón dominante claro)' } });
  }

  // Fase 15/18 -- el LearningRecord de origen fue reemplazado por evidencia más nueva y opuesta (supersededBy ya viene anotado por learning-strategy-engine, no se recalcula aquí).
  if (learningRecord.supersededBy) {
    const newer = allLearningRecords.find((l) => l.id === learningRecord.supersededBy);
    const myDirection = directionOf(learningRecord);
    const newerDirection = newer ? directionOf(newer) : null;
    if (newer && myDirection && newerDirection && OPPOSING_DIRECTIONS.has(`${myDirection}::${newerDirection}`)) {
      return reject(base, {
        reasonCode: 'SUPERSEDED_BY_CONTRADICTING_EVIDENCE', risk,
        contradictions: [{ learningId: newer.id, learningType: newer.learningType, scope: newer.scope, expectedDirection: newerDirection, evidenceCount: newer.evidenceCount, confidence: newer.confidence }],
      });
    }
  }

  // Fase 10 -- evidencia comercial real
  if (!hasRealCommercialEvidence(learningRecord)) {
    return defer(base, { reasonCode: 'UNKNOWN_ATTRIBUTION', risk, extra: { requiredAttribution: 'attributionType != UNKNOWN respaldando este aprendizaje comercial' } });
  }

  // Todas las reglas superadas -- ACCEPT (Fase 17: solo READY_FOR_STRATEGY_UPDATE, nunca ejecución).
  const deltaAbs = typeof learningRecord.evidence?.delta === 'number' ? Math.abs(learningRecord.evidence.delta) : null;
  const expectedImpact = expectedImpactFor({ confidence: feedback.confidence, deltaAbs });
  return accept(base, {
    risk, expectedImpact,
    evidence: { learningType: learningRecord.learningType, deltaAbs, commercialEvidenceConfirmed: learningRecord.learningType === 'COMMERCIAL_LEARNING', readyForStrategyUpdate: true },
  });
}

/** Fase 21 — genera StrategyDecision en memoria para TODOS los StrategyFeedback reales, sin persistir. */
export function generateStrategyDecisions({ store = defaultStore, platform = null } = {}) {
  const feedback = listStrategyFeedback({ store, platform });
  const allLearningRecords = listLearningRecords({ store }); // sin filtro de plataforma -- contradicciones/consistencia deben verse a través de todo el histórico real
  const learningById = new Map(allLearningRecords.map((lr) => [lr.id, lr]));

  const decisions = feedback.map((sf) => evaluateFeedback({ feedback: sf, learningRecord: learningById.get(sf.learningId) ?? null, allLearningRecords }));

  return {
    status: feedback.length === 0 ? 'INSUFFICIENT_DATA' : 'OK',
    generatedAt: new Date().toISOString(),
    summary: {
      totalDecisions: decisions.length,
      byDecision: countBy(decisions, 'decision'),
      byRisk: countBy(decisions, 'risk'),
    },
    decisions,
  };
}

function countBy(items, field) {
  const counts = {};
  for (const item of items) counts[item[field] ?? 'null'] = (counts[item[field] ?? 'null'] ?? 0) + 1;
  return counts;
}

/**
 * Fase 19 — clave de idempotencia: ancla en strategyFeedbackId REAL
 * (persistido, estable) + el ESTADO de evidencia evaluado (decision,
 * confidence, evidenceCount, risk, y los learningId de las
 * contradicciones) -- nunca solo scope/platform/texto (eso ya colisionó en
 * las Fases 8 y 9). Mismo feedback + mismo estado = mismo resultado =
 * dedupe; si el estado cambia (nueva evidencia), la clave cambia y se crea
 * una decisión nueva con `supersedes` apuntando a la anterior.
 */
function decisionDedupeKey(d) {
  return [d.strategyFeedbackId, d.decision, d.confidence, d.evidenceCount, d.risk, [...d.contradictions.map((c) => c.learningId)].sort().join(',')].join('::');
}

/** Fase 20/21 — genera Y persiste (idempotente). No muta decisiones previas -- cada decisión nueva sobre un feedback ya evaluado declara `supersedes` hacia la más reciente anterior. */
export function generateAndPersistStrategyDecisions({ store = defaultStore, platform = null } = {}) {
  const result = generateStrategyDecisions({ store, platform });
  if (result.status !== 'OK') return { ...result, saved: [], skipped: [] };

  const existingAll = store.loadAll('strategy_decision');
  const existingByKey = new Set(existingAll.map(decisionDedupeKey));
  const latestByFeedbackId = new Map();
  for (const d of existingAll) {
    const prev = latestByFeedbackId.get(d.strategyFeedbackId);
    if (!prev || new Date(d.createdAt) >= new Date(prev.createdAt)) latestByFeedbackId.set(d.strategyFeedbackId, d);
  }

  const saved = [];
  const skipped = [];
  for (const decision of result.decisions) {
    const key = decisionDedupeKey(decision);
    if (existingByKey.has(key)) { skipped.push({ key, reason: 'ALREADY_RECORDED' }); continue; }

    const priorForFeedback = latestByFeedbackId.get(decision.strategyFeedbackId);
    const toSave = priorForFeedback ? { ...decision, supersedes: priorForFeedback.id } : decision;
    store.save('strategy_decision', toSave);
    existingByKey.add(key);
    latestByFeedbackId.set(decision.strategyFeedbackId, toSave);
    saved.push(toSave);
  }

  return { ...result, saved, skipped };
}

/** Fase 22 — GET /api/strategy-decisions. */
export function listStrategyDecisions({ store = defaultStore, decision = null, platform = null, scope = null, confidence = null, risk = null, status = null } = {}) {
  let records = store.loadAll('strategy_decision');
  if (decision) records = records.filter((r) => r.decision === decision);
  if (platform) records = records.filter((r) => r.affectedPlatform === platform);
  if (scope) records = records.filter((r) => r.scopeType === scope);
  if (confidence) records = records.filter((r) => r.confidence === confidence);
  if (risk) records = records.filter((r) => r.risk === risk);
  if (status) records = records.filter((r) => r.status === status);
  return records;
}

/** Fase 22 — GET /api/strategy-decisions/summary. */
export function summarizeStrategyDecisions({ store = defaultStore, platform = null } = {}) {
  const records = listStrategyDecisions({ store, platform });
  if (records.length === 0) {
    return { status: 'INSUFFICIENT_DECISION_DATA', reason: 'No hay StrategyDecision generadas todavía. Ejecutar generateAndPersistStrategyDecisions primero.', byDecision: {}, byRisk: {} };
  }
  return {
    status: 'OK',
    totalRecords: records.length,
    byDecision: countBy(records, 'decision'),
    byRisk: countBy(records, 'risk'),
    byExpectedImpact: countBy(records, 'expectedImpact'),
    allExecutionStatus: [...new Set(records.map((r) => r.executionStatus))],
  };
}
