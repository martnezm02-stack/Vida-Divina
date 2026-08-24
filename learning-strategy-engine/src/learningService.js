// learningService.js — LearningService (Fase 17). Orquesta, sin
// reimplementar ninguno:
//   - generateMarketingIntelligence (marketing-intelligence-engine, ya
//     agrega Performance Analysis + Attribution -- nunca se llama a Graph
//     API aquí, los datos ya existen)
//   - patternToLearning.js (este mismo módulo, Fases 6-12)
//
// Generación (pura) separada de persistencia -- mismo patrón que
// marketing-intelligence-engine/src/marketingIntelligenceService.js: el GET
// de la API lee learning_record/strategy_feedback YA persistidos, nunca
// genera como efecto secundario de una lectura.

import { performanceLearningStore as defaultStore } from '../../content-strategy/src/performanceLearningStoreInstance.js';
import { generateMarketingIntelligence } from '../../marketing-intelligence-engine/src/marketingIntelligenceService.js';
import { buildLearningFromMarketingInsight, buildLearningFromDataQualitySignal, buildStrategyFeedback, buildStrategyLearning } from './patternToLearning.js';
import { STRATEGIC_LEARNING_TYPES } from './learningTypes.js';

function countBy(items, field) {
  const counts = {};
  for (const item of items) counts[item[field] ?? 'null'] = (counts[item[field] ?? 'null'] ?? 0) + 1;
  return counts;
}

/** Fase 17 — genera LearningRecord + StrategyFeedback en memoria, sin persistir. */
export function generateLearning({ store = defaultStore, platform = null } = {}) {
  const generatedAt = new Date().toISOString();
  const mi = generateMarketingIntelligence({ store, platform });

  if (mi.status !== 'OK') {
    return { status: 'INSUFFICIENT_DATA', reason: mi.reason, generatedAt, summary: null, learningRecords: [], strategyFeedback: [] };
  }

  const learningRecords = [];
  const strategyFeedback = [];
  for (const insight of mi.insights) {
    const lr = buildLearningFromMarketingInsight(insight);
    if (!lr) continue;
    learningRecords.push(lr);
    const sf = buildStrategyFeedback(lr);
    if (sf) strategyFeedback.push(sf);
  }
  for (const signal of mi.dataQualitySignals) {
    learningRecords.push(buildLearningFromDataQualitySignal(signal));
  }
  for (const sl of buildStrategyLearning(learningRecords)) {
    learningRecords.push(sl);
    const sf = buildStrategyFeedback(sl);
    if (sf) strategyFeedback.push(sf);
  }

  return {
    status: 'OK',
    generatedAt,
    summary: {
      totalLearningRecords: learningRecords.length,
      totalStrategyFeedback: strategyFeedback.length,
      byLearningType: countBy(learningRecords, 'learningType'),
      byConfidence: countBy(learningRecords, 'confidence'),
    },
    learningRecords,
    strategyFeedback,
  };
}

/** Clave de idempotencia para LearningRecord -- mismo criterio que marketing_insight (Fase 8): scope solo no basta, distintos content_id reales deben poder coexistir. */
function learningDedupeKey(lr) {
  // evidence.category/evidence.reason distingue DataQualitySignal reales
  // que comparten scope/platform (ej. CONVERSION vs REVENUE, ambos
  // "MISSING_ATTRIBUTION" sobre el mismo scope "all (N=9)") -- sin esto
  // colisionarían entre sí como si fueran el mismo aprendizaje.
  return [lr.learningType, lr.platform, lr.format, lr.product, lr.scope, lr.evidence?.category ?? '', lr.evidence?.reason ?? '', [...lr.relatedContentIds].sort().join(',')].join('::');
}
/**
 * Clave de idempotencia para StrategyFeedback -- basada en contenido,
 * nunca en `learningId` (que cambia en cada regeneración en memoria de su
 * LearningRecord de origen). Incluye evidence.learningType + rationale
 * además de recommendation/scope/relatedContentIds: dos LearningRecord
 * DISTINTOS (ej. CONTENT_LEARNING/TOP_PERFORMER y ENGAGEMENT_LEARNING/
 * ENGAGEMENT_PATTERN) sobre el MISMO content_id pueden compartir texto de
 * "recommendation" y hasta el mismo "scope" numérico (N coincide por
 * casualidad) siendo conclusiones reales distintas -- rationale (=
 * implication de un template distinto) y learningType nunca coinciden en
 * ese caso, así que evitan la colisión sin perder ninguna de las dos.
 */
function feedbackDedupeKey(sf) {
  return [sf.recommendation, sf.rationale, sf.affectedPlatform, sf.affectedFormat, sf.affectedProduct, sf.evidence?.learningType ?? '', sf.evidence?.scope ?? '', [...(sf.evidence?.relatedContentIds ?? [])].sort().join(',')].join('::');
}

/**
 * Fase 17/18 — genera Y persiste (idempotente) en performanceLearningStore,
 * kinds "learning_record"/"strategy_feedback". Cuando un LearningRecord
 * generado en esta corrida ya existe (misma clave), StrategyFeedback se
 * construye sobre el registro YA persistido (mismo id real), nunca sobre
 * el id descartable de la copia recién generada en memoria.
 */
export function generateAndPersistLearning({ store = defaultStore, platform = null } = {}) {
  const result = generateLearning({ store, platform });
  if (result.status !== 'OK') return { ...result, savedLearning: [], skippedLearning: [], savedFeedback: [], skippedFeedback: [] };

  const existingByKey = new Map(store.loadAll('learning_record').map((lr) => [learningDedupeKey(lr), lr]));
  const savedLearning = [];
  const skippedLearning = [];
  const resolved = [];

  for (const lr of result.learningRecords) {
    const key = learningDedupeKey(lr);
    const existing = existingByKey.get(key);
    if (existing) { skippedLearning.push({ key, reason: 'ALREADY_RECORDED' }); resolved.push({ ...lr, id: existing.id }); continue; }
    store.save('learning_record', lr);
    existingByKey.set(key, lr);
    savedLearning.push(lr);
    resolved.push(lr);
  }

  const existingFeedbackByKey = new Map(store.loadAll('strategy_feedback').map((sf) => [feedbackDedupeKey(sf), sf]));
  const savedFeedback = [];
  const skippedFeedback = [];
  for (const lr of resolved) {
    const sf = buildStrategyFeedback(lr);
    if (!sf) continue;
    const key = feedbackDedupeKey(sf);
    if (existingFeedbackByKey.has(key)) { skippedFeedback.push({ key, reason: 'ALREADY_RECORDED' }); continue; }
    store.save('strategy_feedback', sf);
    existingFeedbackByKey.set(key, sf);
    savedFeedback.push(sf);
  }

  return { ...result, savedLearning, skippedLearning, savedFeedback, skippedFeedback };
}

/**
 * Fase 20 — historial: nunca muta el store. "supersededBy" se calcula en
 * lectura agrupando por subject (learningType+platform+format+product) y
 * quedándose con el más reciente por generatedAt -- los anteriores siguen
 * existiendo, solo se anotan. Solo aplica a STRATEGIC_LEARNING_TYPES: un
 * CONTENT_LEARNING/ENGAGEMENT_LEARNING/PERFORMANCE_LEARNING describe UNA
 * publicación puntual, nunca "reemplaza" a otro de su mismo tipo aunque
 * compartan plataforma/producto (ver comentario en learningTypes.js).
 */
function annotateSupersession(records) {
  const bySubject = new Map();
  for (const lr of records) {
    if (!STRATEGIC_LEARNING_TYPES.includes(lr.learningType)) continue; // DATA_QUALITY_LEARNING y tipos por-publicación nunca "supersede" ni son "supersedidos"
    const subject = [lr.learningType, lr.platform, lr.format, lr.product].join('::');
    if (!bySubject.has(subject)) bySubject.set(subject, []);
    bySubject.get(subject).push(lr);
  }
  const latestBySubject = new Map();
  for (const [subject, group] of bySubject) {
    // ">=" (no solo ">"): en un empate exacto de generatedAt (misma
    // corrida, resolución de milisegundo), se prefiere el último en orden
    // de inserción real del store (append-only, `group` conserva ese
    // orden) -- nunca resultado indefinido.
    const latest = group.reduce((a, b) => (new Date(b.generatedAt) >= new Date(a.generatedAt) ? b : a));
    latestBySubject.set(subject, latest.id);
  }
  return records.map((lr) => {
    if (!STRATEGIC_LEARNING_TYPES.includes(lr.learningType)) return { ...lr, supersededBy: null };
    const subject = [lr.learningType, lr.platform, lr.format, lr.product].join('::');
    const latestId = latestBySubject.get(subject);
    return { ...lr, supersededBy: latestId === lr.id ? null : latestId };
  });
}

const VALID_LEARNING_FILTERS = Object.freeze(['platform', 'learningType', 'confidence', 'product', 'format', 'status']);

/** Fase 18 — GET /api/learning. */
export function listLearningRecords({ store = defaultStore, platform = null, learningType = null, confidence = null, product = null, format = null, status = null } = {}) {
  let records = annotateSupersession(store.loadAll('learning_record'));
  if (platform) records = records.filter((r) => r.platform === platform);
  if (learningType) records = records.filter((r) => r.learningType === learningType);
  if (confidence) records = records.filter((r) => r.confidence === confidence);
  if (product) records = records.filter((r) => r.product === product);
  if (format) records = records.filter((r) => r.format === format);
  if (status) records = records.filter((r) => r.status === status);
  return records;
}

/** Fase 18 — GET /api/learning/summary. */
export function summarizeLearning({ store = defaultStore, platform = null } = {}) {
  const records = listLearningRecords({ store, platform });
  if (records.length === 0) {
    return { status: 'INSUFFICIENT_LEARNING_DATA', reason: 'No hay LearningRecord generados todavía. Ejecutar generateAndPersistLearning primero.', byLearningType: {}, byConfidence: {} };
  }
  return {
    status: 'OK',
    totalRecords: records.length,
    byLearningType: countBy(records, 'learningType'),
    byConfidence: countBy(records, 'confidence'),
    supersededCount: records.filter((r) => r.supersededBy !== null).length,
  };
}

/** Fase 18 — GET /api/strategy-feedback. */
export function listStrategyFeedback({ store = defaultStore, platform = null, confidence = null, product = null, format = null, status = null } = {}) {
  let records = store.loadAll('strategy_feedback');
  if (platform) records = records.filter((r) => r.affectedPlatform === platform);
  if (confidence) records = records.filter((r) => r.confidence === confidence);
  if (product) records = records.filter((r) => r.affectedProduct === product);
  if (format) records = records.filter((r) => r.affectedFormat === format);
  if (status) records = records.filter((r) => r.status === status);
  return records;
}

export { VALID_LEARNING_FILTERS };
