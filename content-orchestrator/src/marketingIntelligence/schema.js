// schema.js — Marketing Intelligence: contrato de señales externas de
// mercado (last30days + WebSearch), organizadas por snapshot.
//
// Esta capa es deliberadamente independiente de dos sistemas ya existentes
// en el repo (ver docs/research/vida-divina-marketing-intelligence-model-2026-08-31.md,
// sección "Gobernanza", para el detalle completo):
//   - marketing-intelligence/        -- Internet Access Layer (adapters
//     Web/RSS/GitHub, heurísticas de regex sobre texto crudo, pipeline
//     Observación->Inferencia->Hipótesis). Nunca conectó fuentes sociales.
//   - marketing-intelligence-engine/ -- motor interno de performance/
//     atribución (Fase 8), no hace research de mercado externo.
// Ninguno de los dos es un encaje real para señales curadas de redes
// sociales (last30days) con el modelo de 14 entidades usado aquí, así que
// esta carpeta NO los duplica ni los reemplaza -- es una tercera capa con
// propósito distinto (research externo curado, no scraping crudo ni
// analítica interna).
//
// PRINCIPIO NO NEGOCIABLE: nunca almacenar una INFERENCE como si fuera un
// FACT. claimType (FACT/SIGNAL/INFERENCE/RECOMMENDATION) y evidenceLevel
// (HIGH..LOW) son ejes distintos y ambos obligatorios en toda señal.

import { randomUUID, createHash } from 'node:crypto';

/** 13 entidades pedidas por el encargo + CatalogDiscrepancy (sección 30: "registrar separadamente" -- estructuralmente distinta, compara señal externa vs. dato interno). */
export const SIGNAL_TYPES = Object.freeze([
  'TrendSignal',
  'AudienceSignal',
  'PainPoint',
  'DesireSignal',
  'Objection',
  'HookPattern',
  'ContentPattern',
  'CreativeAngleSignal',
  'CompetitorSignal',
  'CreatorSignal',
  'PurchaseTrigger',
  'BrandSignal',
  'RegulatoryRisk',
  'CatalogDiscrepancy',
]);

export const SOURCE_TYPES = Object.freeze([
  'OFFICIAL', 'SOCIAL', 'WEB', 'USER_GENERATED', 'RESEARCH', 'INTERNAL', 'INFERENCE',
]);

// Incluye las combinaciones "MEDIUM-HIGH"/"LOW-MEDIUM" tal como aparecen
// literalmente en el reporte de origen -- no se fuerzan a HIGH/MEDIUM/LOW
// puros porque eso perdería precisión ya expresada por los agentes de
// investigación.
export const EVIDENCE_LEVELS = Object.freeze(['HIGH', 'MEDIUM-HIGH', 'MEDIUM', 'LOW-MEDIUM', 'LOW']);

export const CLAIM_TYPES = Object.freeze(['FACT', 'SIGNAL', 'INFERENCE', 'RECOMMENDATION']);

export const TIME_WINDOWS = Object.freeze(['30d', '90d', 'not_time_bound']);

export const HOOK_SATURATION_LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);
export const TREND_DIRECTIONS = Object.freeze(['RISING', 'STABLE', 'DECLINING', 'EMERGING']);
export const CREATOR_VERIFICATION_STATUSES = Object.freeze(['RELEVANT_CREATOR', 'POTENTIAL_CREATOR', 'NOT_VERIFIED']);
export const BRAND_SENTIMENT_TYPES = Object.freeze(['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'QUESTION', 'COMPLAINT', 'ADVOCACY']);
export const PRIORITIES = Object.freeze(['P0', 'P1', 'P2', 'P3']);

// Mapeo FIJO y documentado evidenceLevel -> confidence numérica (sección 9
// del encargo: "no inventar precisión falsa"). No es un juicio caso por
// caso -- es una conversión determinista de la etiqueta cualitativa que ya
// asignaron los agentes de investigación en
// docs/research/vida-divina-market-intelligence-2026-08-31.md. Cambiar
// este mapeo cambia la confidence de TODAS las señales por igual, nunca de
// una sola.
const CONFIDENCE_BY_EVIDENCE_LEVEL = Object.freeze({
  HIGH: 0.8,
  'MEDIUM-HIGH': 0.65,
  MEDIUM: 0.5,
  'LOW-MEDIUM': 0.35,
  LOW: 0.2,
});

export function confidenceFromEvidenceLevel(evidenceLevel) {
  const value = CONFIDENCE_BY_EVIDENCE_LEVEL[evidenceLevel];
  if (value === undefined) throw new Error(`confidenceFromEvidenceLevel: evidenceLevel inválido: "${evidenceLevel}".`);
  return value;
}

/**
 * signalStrength es una etiqueta relativa (sección 10: "no presentarlo
 * como métrica científica"), derivada de forma transparente de
 * evidenceLevel + confirmación cruzada -- nunca un score inventado por
 * señal individual.
 */
export function deriveSignalStrength({ evidenceLevel, crossSourceConfirmed }) {
  if (evidenceLevel === 'HIGH' || evidenceLevel === 'MEDIUM-HIGH') return crossSourceConfirmed ? 'HIGH' : 'MEDIUM';
  if (evidenceLevel === 'MEDIUM') return 'MEDIUM';
  return 'LOW'; // LOW-MEDIUM, LOW
}

function stableDedupeKey(type, title) {
  return createHash('sha256').update(`${type}::${title.trim().toLowerCase()}`, 'utf8').digest('hex').slice(0, 16);
}

function validateEnumIfPresent(value, allowed, fieldLabel) {
  if (value !== undefined && value !== null && !allowed.includes(value)) {
    throw new Error(`createSignal: "${fieldLabel}" inválido: "${value}". Valores permitidos: ${allowed.join(', ')}.`);
  }
}

/**
 * Construye una señal validada. Lanza si faltan campos obligatorios de
 * gobernanza -- sección 51 del encargo: "no crear señales sin
 * source/evidence." Campos que la evidencia real no cubre se dejan en
 * null/[] (sección 6: "no rellenar campos que no existan en la
 * evidencia"), nunca se inventan.
 */
export function createSignal(fields) {
  const {
    type, title, description = '', productId = null, category = null, audience = null,
    source, sourceUrl = null, sourceType, capturedAt, timeWindow,
    observation, whyItMatters = null, evidenceLevel, claimType,
    engagement = null, tags = [], sourceCount = 1, independentSourceCount = 1,
    rawReference = null, details = {},
  } = fields;

  if (!SIGNAL_TYPES.includes(type)) throw new Error(`createSignal: "type" inválido: "${type}".`);
  if (!title?.trim()) throw new Error('createSignal: "title" es obligatorio.');
  if (!source?.trim()) throw new Error('createSignal: "source" es obligatorio -- nunca se crea una señal sin fuente.');
  if (!observation?.trim()) throw new Error('createSignal: "observation" es obligatorio -- nunca se crea una señal sin evidencia observada.');
  if (!SOURCE_TYPES.includes(sourceType)) throw new Error(`createSignal: "sourceType" inválido: "${sourceType}".`);
  if (!EVIDENCE_LEVELS.includes(evidenceLevel)) throw new Error(`createSignal: "evidenceLevel" inválido: "${evidenceLevel}".`);
  if (!CLAIM_TYPES.includes(claimType)) throw new Error(`createSignal: "claimType" inválido: "${claimType}".`);
  if (!TIME_WINDOWS.includes(timeWindow)) throw new Error(`createSignal: "timeWindow" inválido: "${timeWindow}".`);
  if (!capturedAt?.trim()) throw new Error('createSignal: "capturedAt" es obligatorio.');

  validateEnumIfPresent(details?.saturationLevel, HOOK_SATURATION_LEVELS, 'details.saturationLevel');
  validateEnumIfPresent(details?.direction, TREND_DIRECTIONS, 'details.direction');
  validateEnumIfPresent(details?.verificationStatus, CREATOR_VERIFICATION_STATUSES, 'details.verificationStatus');
  validateEnumIfPresent(details?.sentimentType, BRAND_SENTIMENT_TYPES, 'details.sentimentType');

  if (type === 'CatalogDiscrepancy') {
    if (!productId) throw new Error('createSignal: CatalogDiscrepancy requiere "productId".');
    if (!details?.externalSignal?.trim()) throw new Error('createSignal: CatalogDiscrepancy requiere "details.externalSignal".');
    if (!details?.currentInternalData?.trim()) throw new Error('createSignal: CatalogDiscrepancy requiere "details.currentInternalData".');
  }

  const crossSourceConfirmed = independentSourceCount >= 2;

  return Object.freeze({
    id: randomUUID(),
    dedupeKey: stableDedupeKey(type, title),
    type,
    title,
    description,
    productId,
    category,
    audience,
    source,
    sourceUrl,
    sourceType,
    capturedAt,
    timeWindow,
    signalStrength: deriveSignalStrength({ evidenceLevel, crossSourceConfirmed }),
    evidenceLevel,
    confidence: confidenceFromEvidenceLevel(evidenceLevel),
    claimType,
    engagement,
    recency: timeWindow, // snapshot estático: no hay cálculo de decaimiento de frescura independiente de timeWindow en esta fase.
    observation,
    whyItMatters,
    tags: Object.freeze([...tags]),
    sourceCount,
    independentSourceCount,
    crossSourceConfirmed,
    rawReference,
    details: Object.freeze({ ...details }),
    createdAt: new Date().toISOString(),
  });
}
