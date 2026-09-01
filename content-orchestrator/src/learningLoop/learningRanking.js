// learningRanking.js — Learning Loop: learningScore determinista (sección
// 26 del encargo). Complementa, NUNCA reemplaza, intelligenceScore de
// marketingIntelligence/ranking.js -- ese sigue midiendo calidad de una
// señal de mercado individual; learningScore mide qué tan útil es un
// Learning YA CORRELACIONADO (posiblemente de múltiples fuentes) para una
// consulta dada.

export const LEARNING_RANKING_CONFIG = Object.freeze({
  relevanceWeight: 0.25,
  confidenceWeight: 0.25,
  recencyWeight: 0.15,
  evidenceCountWeight: 0.15,
  performanceSupportWeight: 0.10,
  marketSupportWeight: 0.10,
});

const STALENESS_THRESHOLDS_DAYS = Object.freeze({ active: 60, stale: 180 }); // Learning acumulativo, decae más lento que una señal de mercado individual (sección 18).
const DAY_MS = 24 * 60 * 60 * 1000;

/** learningFreshness (sección 18): ACTIVE/STALE/ARCHIVED según updatedAt -- nunca borra, solo clasifica. */
export function classifyLearningFreshness(learning, now = Date.now()) {
  const updated = new Date(learning.updatedAt ?? learning.createdAt).getTime();
  if (Number.isNaN(updated)) return 'ACTIVE';
  const ageDays = (now - updated) / DAY_MS;
  if (ageDays <= STALENESS_THRESHOLDS_DAYS.active) return 'ACTIVE';
  if (ageDays <= STALENESS_THRESHOLDS_DAYS.stale) return 'STALE';
  return 'ARCHIVED';
}

const FRESHNESS_RECENCY_SCORE = Object.freeze({ ACTIVE: 1.0, STALE: 0.5, ARCHIVED: 0.15 });
const EVIDENCE_COUNT_SATURATION = 5; // a partir de 5 refuerzos independientes, el componente de evidenceCount satura en 1.0 -- evita que un learning con 50 refuerzos domine desproporcionadamente el ranking.

/**
 * relevanceToQuery (0-1) -- qué tan bien encaja este Learning con
 * productId/audience/category pedidos. Determinista, sin recalcular
 * confidence/evidenceLevel (sección 26: "no reemplazar intelligenceScore").
 */
function computeRelevanceToQuery(learning, { productId, audience, category }) {
  if (learning.status === 'ARCHIVED') return 0;
  if (productId && learning.productId && learning.productId !== productId) return 0; // sección 29: un learning de Venus no contamina Tongkat Ali.
  if (audience && learning.audience && learning.audience !== audience) return 0;

  let score = 0.4;
  if (productId && learning.productId === productId) score += 0.3;
  else if (category && learning.category === category) score += 0.2;
  else if (learning.scopeType === 'GENERAL') score += 0.1;
  if (audience && learning.audience === audience) score += 0.2;
  return Math.min(1, score);
}

/** learningScore (0-1) para UNA consulta -- nunca se guarda en el Learning persistido, se calcula en tiempo de consulta (mismo criterio que creativeContextScore en creativeIntelligenceContext.js). */
export function computeLearningScore(learning, { productId = null, audience = null, category = null, now = Date.now() } = {}) {
  const weights = LEARNING_RANKING_CONFIG;
  const relevance = computeRelevanceToQuery(learning, { productId, audience, category });
  if (relevance === 0) return 0;

  const freshness = classifyLearningFreshness(learning, now);
  const recency = FRESHNESS_RECENCY_SCORE[freshness];
  const evidenceCountScore = Math.min(1, learning.evidenceCount / EVIDENCE_COUNT_SATURATION);
  const performanceSupport = learning.sourceTypes.includes('PERFORMANCE') || learning.sourceTypes.includes('ATTRIBUTION') ? 1 : 0;
  const marketSupport = learning.sourceTypes.includes('MARKET') ? 1 : 0;

  const score = (
    relevance * weights.relevanceWeight
    + learning.confidence * weights.confidenceWeight
    + recency * weights.recencyWeight
    + evidenceCountScore * weights.evidenceCountWeight
    + performanceSupport * weights.performanceSupportWeight
    + marketSupport * weights.marketSupportWeight
  );
  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}
