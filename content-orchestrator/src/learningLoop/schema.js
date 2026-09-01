// schema.js — Learning Loop: entidad Learning + CreativeRecommendation.
//
// GOBERNANZA: reutiliza, no duplica. `learning-strategy-engine/` ya tiene
// LearningRecord (performance/atribución propia -> insight mecánico,
// LEARNING_TYPES orientados a analítica: CONTENT_LEARNING, FORMAT_LEARNING,
// etc.) y `strategy-decision-engine/` ya tiene StrategyDecision. Ninguno de
// los dos se toca ni se reimplementa aquí -- se CONSUMEN por id
// (relatedInsightIds/relatedContentIds/relatedPublicationIds ya existentes)
// como evidencia de solo lectura.
//
// La entidad `Learning` de este módulo es DISTINTA y complementaria: nunca
// existió antes un puente que correlacione señal de MERCADO EXTERNO
// (marketingIntelligence/, ej. "las preguntas retienen más") con
// DESEMPEÑO PROPIO (LearningRecord, ej. "nuestro contenido con preguntas
// retiene más") -- eso es exactamente el vacío que esta entidad llena.
// Por eso sus tipos (CREATIVE_LEARNING_TYPES) son orientados a estrategia
// CREATIVA, no a categorías analíticas -- vocabulario distinto a propósito.
//
// PRINCIPIO NO NEGOCIABLE: correlación no es causalidad. creativeImplication
// SIEMPRE se redacta con "la evidencia sugiere"/"asociado con", nunca
// "causó"/"probó que" -- ver buildCreativeImplication().

import { randomUUID, createHash } from 'node:crypto';
import { EVIDENCE_LEVELS, confidenceFromEvidenceLevel } from '../marketingIntelligence/schema.js';

export { EVIDENCE_LEVELS, confidenceFromEvidenceLevel };

/** Sección 8 del encargo -- exactamente estos 12, ninguno adicional. */
export const CREATIVE_LEARNING_TYPES = Object.freeze([
  'AUDIENCE_LEARNING', 'HOOK_LEARNING', 'ANGLE_LEARNING', 'STRUCTURE_LEARNING',
  'CONTENT_LEARNING', 'PRODUCT_LEARNING', 'CTA_LEARNING', 'FORMAT_LEARNING',
  'TIMING_LEARNING', 'CREATIVE_LEARNING', 'CONVERSION_LEARNING', 'OBJECTION_LEARNING',
]);

/** Sección 4 del encargo. Clasificación derivada, nunca fijada a mano contradiciendo sourceTypes. */
export const LEARNING_SOURCE_KINDS = Object.freeze(['MARKET', 'PERFORMANCE', 'ATTRIBUTION']);
export const COMBINED_SOURCE_TYPES = Object.freeze(['MARKET', 'PERFORMANCE', 'ATTRIBUTION', 'COMBINED']);

/** Sección 15 del encargo. */
export const LEARNING_STATUSES = Object.freeze(['PRELIMINARY', 'CONFIRMED', 'CONTRADICTED', 'UNDER_REVIEW', 'STALE', 'ARCHIVED']);

/** Sección 30 del encargo. */
export const LEARNING_SCOPE_TYPES = Object.freeze(['PRODUCT', 'CATEGORY', 'AUDIENCE', 'GENERAL']);

export const IMPACT_LEVELS = Object.freeze(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']); // mismo vocabulario que StrategyDecision.expectedImpact -- no se inventa uno nuevo.

/** Sección 14 del encargo -- centralizado, único lugar. */
export const MIN_LEARNING_SAMPLE = 2;

/**
 * Traduce confidence de 4 niveles de learning-strategy-engine/marketing-intelligence-engine
 * (MARKETING_CONFIDENCE_LEVELS: HIGH/MEDIUM/LOW/UNKNOWN) al evidenceLevel de
 * 5 niveles de marketingIntelligence/schema.js -- mapeo FIJO y conservador
 * (UNKNOWN nunca se traduce a algo mejor que LOW: ausencia de evidencia
 * real no es evidencia débil, es ausencia). Nunca se inventa un nivel
 * intermedio (MEDIUM-HIGH/LOW-MEDIUM) para un dato que solo tiene 4
 * niveles -- se usa el nivel exacto disponible.
 */
const MARKETING_CONFIDENCE_TO_EVIDENCE_LEVEL = Object.freeze({ HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW', UNKNOWN: 'LOW' });
export function evidenceLevelFromMarketingConfidence(marketingConfidence) {
  return MARKETING_CONFIDENCE_TO_EVIDENCE_LEVEL[marketingConfidence] ?? 'LOW';
}

/**
 * Combina dos evidenceLevel en el de una COMBINED_LEARNING -- nunca
 * fabrica un nivel más alto que el mejor de los dos insumos reales
 * (sección 9: "confidence mayor que si solo existiera una fuente" se
 * satisface subiendo UN escalón, nunca inventando certeza absoluta).
 */
const EVIDENCE_LEVEL_RANK = Object.freeze({ LOW: 0, 'LOW-MEDIUM': 1, MEDIUM: 2, 'MEDIUM-HIGH': 3, HIGH: 4 });
export function combineEvidenceLevels(levelA, levelB) {
  const rankA = EVIDENCE_LEVEL_RANK[levelA] ?? 0;
  const rankB = EVIDENCE_LEVEL_RANK[levelB] ?? 0;
  const higherRank = Math.max(rankA, rankB);
  const boosted = Math.min(higherRank + 1, EVIDENCE_LEVEL_RANK.HIGH); // combinación real de 2 fuentes independientes sube un escalón, nunca más.
  return EVIDENCE_LEVELS.find((l) => EVIDENCE_LEVEL_RANK[l] === boosted) ?? 'MEDIUM';
}

/**
 * Redacta la implicación creativa con lenguaje de correlación, nunca de
 * causalidad (sección 10 del encargo). Plantilla determinista -- nunca un
 * LLM, nunca texto libre inventado.
 */
export function buildCreativeImplication({ pattern, scopeLabel, combinedSourceType }) {
  const sujeto = scopeLabel ? `para ${scopeLabel}` : 'en general';
  if (combinedSourceType === 'COMBINED') {
    return `La evidencia de mercado y el desempeño propio coinciden en asociar "${pattern}" con mejor resultado ${sujeto} -- correlación, no causalidad comprobada.`;
  }
  if (combinedSourceType === 'PERFORMANCE' || combinedSourceType === 'ATTRIBUTION') {
    return `El desempeño propio sugiere una asociación entre "${pattern}" y mejor resultado ${sujeto} -- basado en datos internos, aún sin confirmación de mercado externo.`;
  }
  return `Señal de mercado externo sugiere que "${pattern}" podría ser relevante ${sujeto} -- todavía sin evidencia de desempeño propio que lo confirme.`;
}

function normalizeTokensForFingerprint(text) {
  return (text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter((t) => t.length > 3).sort().join('-');
}

/**
 * Fingerprint de deduplicación (sección 50): learningType + scope +
 * pattern normalizado + product/category + audience. Determinista -- el
 * mismo learning real, encontrado dos veces, produce el MISMO fingerprint.
 */
export function computeLearningFingerprint({ learningType, scopeType, productId, category, audience, pattern }) {
  const raw = [learningType, scopeType, productId ?? '', category ?? '', audience ?? '', normalizeTokensForFingerprint(pattern)].join('::');
  return createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 16);
}

function validateEnum(value, allowed, label) {
  if (value !== undefined && value !== null && !allowed.includes(value)) {
    throw new Error(`createLearning: "${label}" inválido: "${value}". Válidos: ${allowed.join(', ')}.`);
  }
}

/**
 * Construye un Learning validado. Lanza si falta evidencia real (sección
 * 5: "nunca generar learning huérfano") -- al menos UNA de las listas de
 * evidencia (signalIds/performanceIds/contentIds/publicationIds/
 * attributionIds) debe tener al menos un elemento.
 */
export function createLearning(fields) {
  const {
    title, description = '', learningType, sourceTypes,
    signalIds = [], performanceIds = [], contentIds = [], publicationIds = [], attributionIds = [],
    scopeType, productId = null, category = null, audience = null,
    evidenceLevel, evidenceCount = 1, supportingRuns = 1,
    impact = 'UNKNOWN', creativeImplication,
    status = 'PRELIMINARY', contradicts = [], contradictedBy = [],
    fingerprint = null, pattern = title,
  } = fields;

  if (!title?.trim()) throw new Error('createLearning: "title" es obligatorio.');
  if (!creativeImplication?.trim()) throw new Error('createLearning: "creativeImplication" es obligatorio -- usar buildCreativeImplication().');
  validateEnum(learningType, CREATIVE_LEARNING_TYPES, 'learningType');
  validateEnum(scopeType, LEARNING_SCOPE_TYPES, 'scopeType');
  validateEnum(evidenceLevel, EVIDENCE_LEVELS, 'evidenceLevel');
  validateEnum(status, LEARNING_STATUSES, 'status');
  validateEnum(impact, IMPACT_LEVELS, 'impact');
  if (!Array.isArray(sourceTypes) || sourceTypes.length === 0) throw new Error('createLearning: "sourceTypes" debe tener al menos un elemento de MARKET/PERFORMANCE/ATTRIBUTION.');
  for (const s of sourceTypes) validateEnum(s, LEARNING_SOURCE_KINDS, 'sourceTypes[]');

  const totalEvidence = signalIds.length + performanceIds.length + contentIds.length + publicationIds.length + attributionIds.length;
  if (totalEvidence === 0) throw new Error('createLearning: ningún learning puede crearse sin evidencia real (signalIds/performanceIds/contentIds/publicationIds/attributionIds vacíos).');

  const combinedSourceType = sourceTypes.length > 1 ? 'COMBINED' : sourceTypes[0];

  return Object.freeze({
    id: randomUUID(),
    title,
    description,
    learningType,
    sourceTypes: Object.freeze([...new Set(sourceTypes)]),
    combinedSourceType,
    signalIds: Object.freeze([...signalIds]),
    performanceIds: Object.freeze([...performanceIds]),
    contentIds: Object.freeze([...contentIds]),
    publicationIds: Object.freeze([...publicationIds]),
    attributionIds: Object.freeze([...attributionIds]),
    scopeType,
    productId,
    category,
    audience,
    evidenceLevel,
    confidence: confidenceFromEvidenceLevel(evidenceLevel), // NUNCA inventado -- mismo mapeo fijo ya usado en marketingIntelligence/.
    evidenceCount,
    supportingRuns,
    impact,
    relevance: Math.min(1, 0.4 + evidenceCount * 0.1), // base determinista, no campaign-specific (eso es learningScore en query time).
    creativeImplication,
    status,
    contradicts: Object.freeze([...contradicts]),
    contradictedBy: Object.freeze([...contradictedBy]),
    fingerprint: fingerprint ?? computeLearningFingerprint({ learningType, scopeType, productId, category, audience, pattern }),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * CreativeRecommendation (sección 20) -- puente Learning(s) -> sugerencia
 * accionable. NUNCA genera texto de hook/script final -- angle/hookPattern/
 * structurePattern/contentPattern son ETIQUETAS de patrón, no copy.
 */
export function createCreativeRecommendation(fields) {
  const {
    title, learningIds = [], productId = null, audience = null,
    angle = null, hookPattern = null, structurePattern = null, contentPattern = null,
    evidenceLevel, rationale, priority = 'P2',
  } = fields;

  if (!title?.trim()) throw new Error('createCreativeRecommendation: "title" es obligatorio.');
  if (!Array.isArray(learningIds) || learningIds.length === 0) throw new Error('createCreativeRecommendation: "learningIds" debe tener al menos un learning real -- nunca una recomendación sin respaldo.');
  if (!rationale?.trim()) throw new Error('createCreativeRecommendation: "rationale" es obligatorio.');
  validateEnum(evidenceLevel, EVIDENCE_LEVELS, 'evidenceLevel');
  validateEnum(priority, ['P0', 'P1', 'P2', 'P3'], 'priority');

  return Object.freeze({
    id: randomUUID(),
    title,
    learningIds: Object.freeze([...learningIds]),
    productId,
    audience,
    angle,
    hookPattern,
    structurePattern,
    contentPattern,
    evidenceLevel,
    confidence: confidenceFromEvidenceLevel(evidenceLevel),
    rationale,
    priority,
    createdAt: new Date().toISOString(),
  });
}
