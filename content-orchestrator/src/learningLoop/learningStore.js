// learningStore.js — Learning Loop: persistencia de Learning +
// CreativeRecommendation. Mismo patrón que marketingIntelligence/signalStore.js
// y assetLineage.js: DATA_ROOT overrideable por CONTENT_ORCHESTRATOR_DATA_ROOT
// para tests aislados, un archivo JSON por registro.
//
// content-orchestrator/data/ está en .gitignore -- estos JSON son un
// artefacto regenerable (correr refreshLearnings()), nunca la fuente de
// verdad versionada. La fuente de verdad real son los SISTEMAS que este
// módulo consume por id (marketingIntelligence/, learning-strategy-engine/,
// marketing-intelligence-engine/, attribution-engine/) -- este store solo
// guarda la CORRELACIÓN entre ellos.

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLearning, createCreativeRecommendation, MIN_LEARNING_SAMPLE, confidenceFromEvidenceLevel } from './schema.js';

export const DATA_ROOT = process.env.CONTENT_ORCHESTRATOR_DATA_ROOT
  ? join(process.env.CONTENT_ORCHESTRATOR_DATA_ROOT)
  : fileURLToPath(new URL('../../data', import.meta.url));
export const LEARNING_LOOP_ROOT = join(DATA_ROOT, 'learning-loop');
const LEARNINGS_DIR = join(LEARNING_LOOP_ROOT, 'learnings');
const RECOMMENDATIONS_DIR = join(LEARNING_LOOP_ROOT, 'recommendations');
const MANIFEST_PATH = join(LEARNING_LOOP_ROOT, 'manifest.json');

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function learningPath(id) {
  return join(LEARNINGS_DIR, `${id}.json`);
}
function recommendationPath(id) {
  return join(RECOMMENDATIONS_DIR, `${id}.json`);
}

export function listLearnings(filters = {}) {
  if (!existsSync(LEARNINGS_DIR)) return Object.freeze([]);
  const { learningType, sourceType, productId, category, audience, status, minEvidenceLevel } = filters;
  const all = readdirSync(LEARNINGS_DIR).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(LEARNINGS_DIR, f), 'utf8')));
  return Object.freeze(all.filter((l) => (
    (learningType === undefined || l.learningType === learningType)
    && (sourceType === undefined || l.sourceTypes.includes(sourceType) || l.combinedSourceType === sourceType)
    && (productId === undefined || l.productId === productId)
    && (category === undefined || l.category === category)
    && (audience === undefined || l.audience === audience)
    && (status === undefined || l.status === status)
    && (minEvidenceLevel === undefined || l.confidence >= minEvidenceLevel)
  )));
}

export function getLearning(id) {
  const filePath = learningPath(id);
  if (!existsSync(filePath)) throw new Error(`getLearning: no existe el learning "${id}".`);
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

/**
 * Inserta o refuerza por fingerprint (secciones 16, 49, 50): un learning
 * nuevo con el MISMO fingerprint que uno ya existente NO se duplica --
 * incrementa evidenceCount/supportingRuns y fusiona listas de evidencia
 * (unión de ids, nunca se pierden referencias previas). NUNCA "altera
 * artificialmente confidence" al reforzar (sección 16) -- si el nuevo
 * evidenceLevel es más fuerte, se recalcula confidence con el MISMO mapeo
 * fijo de schema.js (nunca un ajuste manual); si es más débil, se
 * conserva el evidenceLevel más alto ya alcanzado (un learning no
 * retrocede solo porque una corrida nueva trae menos evidencia por sí
 * sola -- eso sería igual de artificial que subirlo sin motivo).
 */
export function upsertLearning(fields) {
  const candidate = createLearning(fields);
  const existing = listLearnings().find((l) => l.fingerprint === candidate.fingerprint);
  if (!existing) {
    ensureDir(LEARNINGS_DIR);
    const promoted = candidate.evidenceCount >= MIN_LEARNING_SAMPLE && candidate.status === 'PRELIMINARY'
      ? { ...candidate, status: 'CONFIRMED' } : candidate;
    writeFileSync(learningPath(candidate.id), JSON.stringify(promoted, null, 2), 'utf8');
    return promoted;
  }

  // Idempotencia real (sección 49), no solo "no crear un objeto duplicado":
  // si TODA la evidencia del candidato ya está registrada, es un no-op
  // exacto -- no incrementa evidenceCount/supportingRuns. El refuerzo
  // (sección 16) solo ocurre cuando llega evidencia GENUINAMENTE nueva
  // (una corrida posterior con datos que cambiaron), nunca por re-ejecutar
  // refreshLearnings() dos veces sobre el mismo estado.
  const existingIds = new Set([...existing.signalIds, ...existing.performanceIds, ...existing.contentIds, ...existing.publicationIds, ...existing.attributionIds]);
  const candidateIds = [...candidate.signalIds, ...candidate.performanceIds, ...candidate.contentIds, ...candidate.publicationIds, ...candidate.attributionIds];
  const hasNewEvidence = candidateIds.some((id) => !existingIds.has(id));
  if (!hasNewEvidence) return existing;

  const mergedEvidenceLevel = EVIDENCE_LEVEL_RANK(candidate.evidenceLevel) > EVIDENCE_LEVEL_RANK(existing.evidenceLevel) ? candidate.evidenceLevel : existing.evidenceLevel;
  const nextEvidenceCount = existing.evidenceCount + 1;
  const merged = Object.freeze({
    ...existing,
    sourceTypes: Object.freeze([...new Set([...existing.sourceTypes, ...candidate.sourceTypes])]),
    combinedSourceType: new Set([...existing.sourceTypes, ...candidate.sourceTypes]).size > 1 ? 'COMBINED' : existing.combinedSourceType,
    signalIds: Object.freeze([...new Set([...existing.signalIds, ...candidate.signalIds])]),
    performanceIds: Object.freeze([...new Set([...existing.performanceIds, ...candidate.performanceIds])]),
    contentIds: Object.freeze([...new Set([...existing.contentIds, ...candidate.contentIds])]),
    publicationIds: Object.freeze([...new Set([...existing.publicationIds, ...candidate.publicationIds])]),
    attributionIds: Object.freeze([...new Set([...existing.attributionIds, ...candidate.attributionIds])]),
    evidenceLevel: mergedEvidenceLevel,
    confidence: confidenceFromEvidenceLevel(mergedEvidenceLevel), // mismo mapeo fijo de schema.js -- nunca un ajuste manual (sección 16).
    evidenceCount: nextEvidenceCount,
    supportingRuns: existing.supportingRuns + 1,
    status: existing.status === 'PRELIMINARY' && nextEvidenceCount >= MIN_LEARNING_SAMPLE ? 'CONFIRMED' : existing.status,
    updatedAt: new Date().toISOString(),
  });
  writeFileSync(learningPath(existing.id), JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

// Mismo orden real de EVIDENCE_LEVELS en schema.js -- usado solo para
// comparar cuál de dos niveles es más fuerte al fusionar (nunca para
// derivar confidence, eso siempre pasa por confidenceFromEvidenceLevel()).
const _RANK = { LOW: 0, 'LOW-MEDIUM': 1, MEDIUM: 2, 'MEDIUM-HIGH': 3, HIGH: 4 };
function EVIDENCE_LEVEL_RANK(level) { return _RANK[level] ?? 0; }

/**
 * Marca contradicción bidireccional entre dos learnings reales (sección
 * 17, 51): NUNCA elimina ninguno, conserva ambos, solo agrega la
 * referencia cruzada. Idempotente.
 */
export function markContradiction(learningIdA, learningIdB) {
  const a = getLearning(learningIdA);
  const b = getLearning(learningIdB);
  const aUpdated = Object.freeze({
    ...a,
    status: a.status === 'ARCHIVED' ? a.status : 'CONTRADICTED',
    contradictedBy: Object.freeze([...new Set([...a.contradictedBy, learningIdB])]),
    updatedAt: new Date().toISOString(),
  });
  const bUpdated = Object.freeze({
    ...b,
    status: b.status === 'ARCHIVED' ? b.status : 'CONTRADICTED',
    contradictedBy: Object.freeze([...new Set([...b.contradictedBy, learningIdA])]),
    updatedAt: new Date().toISOString(),
  });
  writeFileSync(learningPath(a.id), JSON.stringify(aUpdated, null, 2), 'utf8');
  writeFileSync(learningPath(b.id), JSON.stringify(bUpdated, null, 2), 'utf8');
  return { a: aUpdated, b: bUpdated };
}

export function saveRecommendation(fields) {
  const rec = createCreativeRecommendation(fields);
  ensureDir(RECOMMENDATIONS_DIR);
  writeFileSync(recommendationPath(rec.id), JSON.stringify(rec, null, 2), 'utf8');
  return rec;
}

export function listRecommendations(filters = {}) {
  if (!existsSync(RECOMMENDATIONS_DIR)) return Object.freeze([]);
  const { productId, audience } = filters;
  const all = readdirSync(RECOMMENDATIONS_DIR).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(RECOMMENDATIONS_DIR, f), 'utf8')));
  return Object.freeze(all.filter((r) => (
    (productId === undefined || r.productId === productId || r.productId === null)
    && (audience === undefined || r.audience === audience || r.audience === null)
  )));
}

/**
 * Manifest del Learning Loop (secciones 42-44): versión monotónica, NO
 * fecha de research -- los learnings se acumulan/refuerzan continuamente
 * (no se re-investigan en ventanas de 30 días como marketingIntelligence/).
 * `learningSnapshotId` deja constancia de "qué sabía el sistema" en un
 * momento dado, sin forzar el modelo de snapshot fechado que sí tiene
 * sentido para research externo pero no para desempeño propio acumulativo.
 */
export function getLearningLoopManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    return Object.freeze({ version: 0, learningSnapshotId: 'learning-loop-v0', lastRefreshedAt: null, learningCount: 0, recommendationCount: 0 });
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

export function bumpLearningLoopVersion() {
  const current = getLearningLoopManifest();
  const nextVersion = current.version + 1;
  const manifest = Object.freeze({
    version: nextVersion,
    learningSnapshotId: `learning-loop-v${nextVersion}`,
    lastRefreshedAt: new Date().toISOString(),
    learningCount: listLearnings().length,
    recommendationCount: listRecommendations().length,
  });
  ensureDir(LEARNING_LOOP_ROOT);
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}
