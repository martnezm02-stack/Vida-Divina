// queryService.js — Learning Loop: API interna de consulta (sección 45 del
// encargo: "interfaz interna", no HTTP). NINGUNA función aquí ejecuta
// last30days/WebSearch/HTTP -- solo lee content-orchestrator/data/
// learning-loop/ (ya poblado por refreshLearnings()).

import { listLearnings, listRecommendations, getLearningLoopManifest } from './learningStore.js';
import { computeLearningScore, classifyLearningFreshness } from './learningRanking.js';
import { MIN_LEARNING_SAMPLE } from './schema.js';

export { refreshLearnings } from './refreshLearnings.js';
export { getLearningLoopManifest };

const FRESHNESS_ELIGIBLE = Object.freeze(['ACTIVE', 'STALE']); // ARCHIVED nunca se sirve como "relevante" (sección 18), pero sigue consultable directo vía listLearnings() si alguien lo pide explícitamente.

/**
 * Learnings relevantes rankeados (sección 45-46). Nunca incluye
 * CONTRADICTED sin marcarlo explícitamente -- se excluye por defecto de
 * "relevante" salvo que el llamador pida status explícito.
 */
export function getRelevantLearnings({ productId = null, audience = null, category = null, userInstruction = null, learningType = null, limit = 10 } = {}) {
  const now = Date.now();
  let learnings = listLearnings({ productId: productId ?? undefined, audience: audience ?? undefined, category: category ?? undefined, learningType: learningType ?? undefined });
  learnings = learnings.filter((l) => l.status !== 'CONTRADICTED' && l.status !== 'ARCHIVED');

  const ranked = learnings
    .map((l) => ({
      learningId: l.id,
      title: l.title,
      description: l.description,
      learningType: l.learningType,
      combinedSourceType: l.combinedSourceType,
      sourceTypes: l.sourceTypes,
      productId: l.productId,
      category: l.category,
      audience: l.audience,
      evidenceLevel: l.evidenceLevel,
      confidence: l.confidence,
      evidenceCount: l.evidenceCount,
      status: l.status,
      freshness: classifyLearningFreshness(l, now),
      creativeImplication: l.creativeImplication,
      score: computeLearningScore(l, { productId, audience, category, now }),
      signalIds: l.signalIds,
      performanceIds: l.performanceIds,
      contentIds: l.contentIds,
      publicationIds: l.publicationIds,
      attributionIds: l.attributionIds,
    }))
    .filter((l) => l.score > 0)
    .sort((a, b) => (b.score - a.score) || a.title.localeCompare(b.title));

  return limit ? ranked.slice(0, limit) : ranked;
}

/** CreativeRecommendation rankeadas por confidence de sus learnings de respaldo (sección 45). */
export function getCreativeRecommendations({ productId = null, audience = null, limit = 10 } = {}) {
  const recs = listRecommendations({ productId: productId ?? undefined, audience: audience ?? undefined });
  const sorted = [...recs].sort((a, b) => (b.confidence - a.confidence) || a.title.localeCompare(b.title));
  return limit ? sorted.slice(0, limit) : sorted;
}

/**
 * validatedLearningContext (secciones 23-24): SOLO learnings relevantes +
 * suficientemente soportados (evidenceCount >= MIN_LEARNING_SAMPLE, es
 * decir status CONFIRMED) + frescos (ACTIVE) + compatibles con producto/
 * audiencia. Diseñado para incrustarse dentro de creativeIntelligenceContext
 * -- nunca se llama por sí solo desde afuera de ese flujo salvo para
 * inspección/debug.
 */
export function getValidatedLearningContext({ productId = null, audience = null, category = null, userInstruction = null, limit = 5 } = {}) {
  const now = Date.now();
  const manifest = getLearningLoopManifest();
  const learnings = listLearnings({ productId: productId ?? undefined, audience: audience ?? undefined, category: category ?? undefined })
    .filter((l) => l.status === 'CONFIRMED' && l.evidenceCount >= MIN_LEARNING_SAMPLE && classifyLearningFreshness(l, now) === 'ACTIVE');

  const ranked = learnings
    .map((l) => ({
      learningId: l.id,
      title: l.title,
      learningType: l.learningType,
      combinedSourceType: l.combinedSourceType,
      productId: l.productId,
      audience: l.audience,
      evidenceLevel: l.evidenceLevel,
      confidence: l.confidence,
      evidenceCount: l.evidenceCount,
      creativeImplication: l.creativeImplication,
      score: computeLearningScore(l, { productId, audience, category, now }),
    }))
    .filter((l) => l.score > 0)
    .sort((a, b) => (b.score - a.score) || a.title.localeCompare(b.title))
    .slice(0, limit);

  return Object.freeze({
    applied: ranked.length > 0,
    learningSnapshotId: manifest.learningSnapshotId,
    learningLoopVersion: manifest.version,
    learnings: Object.freeze(ranked),
  });
}
