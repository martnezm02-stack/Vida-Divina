// evidenceProvenance.js — el "de dónde salió este dato" que TODA
// Competitive Evidence Preliminary debe conservar (Fase: Incorporar y
// Normalizar Competitive Evidence — Preliminary).
//
// Responde estructuralmente: ¿de dónde salió?, ¿qué competidor lo produjo?,
// ¿en qué plataforma?, ¿cuándo se observó?, ¿es un dato observado o una
// interpretación?, ¿con qué nivel de confianza? Todo identificador
// específico de plataforma (adLibraryId, videoId, mediaId, postId,
// creativeId, advertiserId, accountHandle) es opcional — se conserva
// cuando la fuente lo entrega, nunca se inventa (null si no aplica).
//
// NOTA sobre los dos vocabularios de confianza que coexisten en este
// módulo, deliberadamente, sin unificarse: `AbstractionRecord.confidence`
// (competitiveAbstraction.js, fase anterior) usa 'low'/'medium'/'high'.
// Este archivo define un vocabulario DISTINTO — STRONG/MODERATE/WEAK/
// UNKNOWN — pedido explícitamente para Provenance/Pattern/Learning/
// Opportunity en esta fase. Ninguno reemplaza al otro (mismo criterio ya
// usado en el proyecto para las dos fórmulas de Hypothesis EN/ES).

import { randomUUID } from 'node:crypto';
import { EVIDENCE_DOMAINS } from './evidenceTaxonomy.js';

export const CONFIDENCE_LEVELS = Object.freeze(['STRONG', 'MODERATE', 'WEAK', 'UNKNOWN']);
export const EVIDENCE_STATUS_VALUES = Object.freeze(['PRELIMINARY', 'VERIFIED']);
export const SOURCE_CURRENTLY_UNAVAILABLE = 'SOURCE_CURRENTLY_UNAVAILABLE';
export const CUSTOMER_EVIDENCE_REQUIRED = 'CUSTOMER_EVIDENCE_REQUIRED';
export const INSUFFICIENT_PRELIMINARY_EVIDENCE = 'INSUFFICIENT_PRELIMINARY_EVIDENCE';
export const NO_PATTERN_ESTABLISHED = 'NO_PATTERN_ESTABLISHED';

export function createProvenance({
  // Fase 4C (Customer Research Ingestion Engine): antes de esta fase,
  // createProvenance() estaba codificado exclusivamente para evidencia
  // COMPETITIVE -- `evidenceDomain` era un literal fijo ('COMPETITIVE',
  // nunca un parámetro) y `competitor` era siempre obligatorio, sin
  // sentido para un verbatim real de un cliente de Vida Divina (no hay
  // "competidor" en una reseña de cliente). Se generaliza de forma
  // aditiva y retrocompatible: el default sigue siendo 'COMPETITIVE' con
  // `competitor` obligatorio (cero cambio de comportamiento para los 3
  // llamadores reales existentes, ver competitiveEvidencePreliminary.js),
  // y ahora también acepta 'CUSTOMER_RESEARCH' (uno de los EVIDENCE_DOMAINS
  // ya definidos en evidenceTaxonomy.js, nunca un vocabulario nuevo) donde
  // `competitor` no aplica y queda null.
  evidenceDomain = 'COMPETITIVE',
  source,
  sourceUrl,
  sourcePlatform,
  sourceType,
  observedAt,
  contentDate = null,
  competitor = null,
  originalEvidenceId,
  confidence = 'UNKNOWN',
  evidenceStatus = 'PRELIMINARY',
  adLibraryId = null,
  videoId = null,
  mediaId = null,
  postId = null,
  creativeId = null,
  advertiserId = null,
  accountHandle = null,
  sourceCurrentlyUnavailable = false,
}) {
  if (!EVIDENCE_DOMAINS.includes(evidenceDomain)) {
    throw new Error(`Provenance: "evidenceDomain" inválido "${evidenceDomain}" (válidos: ${EVIDENCE_DOMAINS.join(', ')}).`);
  }
  if (!source?.trim()) throw new Error('Provenance: "source" es obligatorio.');
  if (!sourceUrl?.trim() && !sourceCurrentlyUnavailable) {
    throw new Error(`Provenance: "sourceUrl" es obligatorio salvo que se marque explícitamente sourceCurrentlyUnavailable:true (ver ${SOURCE_CURRENTLY_UNAVAILABLE}).`);
  }
  if (!sourcePlatform?.trim()) throw new Error('Provenance: "sourcePlatform" es obligatorio.');
  if (!sourceType?.trim()) throw new Error('Provenance: "sourceType" es obligatorio.');
  if (!observedAt?.trim()) throw new Error('Provenance: "observedAt" es obligatorio — nunca evidencia sin fecha de observación.');
  if (evidenceDomain === 'COMPETITIVE' && !competitor?.trim()) {
    throw new Error('Provenance: "competitor" es obligatorio cuando evidenceDomain es COMPETITIVE.');
  }
  if (!originalEvidenceId?.trim()) {
    throw new Error('Provenance: "originalEvidenceId" es obligatorio — el id que la investigación original le dio a este dato (ej. "Pattern-01", "AR-06").');
  }
  if (!CONFIDENCE_LEVELS.includes(confidence)) {
    throw new Error(`Provenance: "confidence" inválido "${confidence}" (válidos: ${CONFIDENCE_LEVELS.join(', ')}).`);
  }
  if (!EVIDENCE_STATUS_VALUES.includes(evidenceStatus)) {
    throw new Error(`Provenance: "evidenceStatus" inválido "${evidenceStatus}" (válidos: ${EVIDENCE_STATUS_VALUES.join(', ')}).`);
  }

  return Object.freeze({
    provenanceId: randomUUID(),
    evidenceDomain,
    evidenceStatus,
    confidence,
    source,
    sourceUrl: sourceUrl ?? null,
    sourceCurrentlyUnavailable,
    sourcePlatform,
    sourceType,
    observedAt,
    contentDate,
    competitor,
    originalEvidenceId,
    adLibraryId,
    videoId,
    mediaId,
    postId,
    creativeId,
    advertiserId,
    accountHandle,
  });
}

/**
 * Validación #11 ("La fuente y fecha permanecen después de todos los
 * mappings") y #12 ("Los IDs originales permanecen") — confirma que una
 * Provenance sobrevivió intacta a un mapping/transformación.
 */
export function assertProvenancePreserved(original, mapped) {
  const requiredFields = ['source', 'sourceUrl', 'sourcePlatform', 'sourceType', 'observedAt', 'competitor', 'originalEvidenceId'];
  for (const field of requiredFields) {
    if (original?.[field] !== mapped?.[field]) {
      throw new Error(`assertProvenancePreserved: el campo "${field}" no sobrevivió al mapping (original: ${JSON.stringify(original?.[field])}, mapeado: ${JSON.stringify(mapped?.[field])}).`);
    }
  }
  return true;
}

// Nombres de competidores conocidos por esta investigación — usado
// exclusivamente por el guard de abajo, nunca para inferir contenido.
const KNOWN_COMPETITOR_NAMES = Object.freeze([
  'Herbalife', 'Omnilife', 'Fuxion', 'Total Life Changes', 'Iaso Tea', 'Organo Gold',
]);

/**
 * Regla #1, aplicada ESTRUCTURALMENTE en el único punto donde es posible
 * hacerlo sin modificar persona.js/pain.js (fuera de alcance de esta fase):
 * antes de citar un `sourceCitation` como evidencia de un Vida Divina
 * Persona/Pain real (createPersona/createPain), debe pasar este guard.
 * Rechaza cualquier sourceCitation que mencione a un competidor conocido —
 * evidencia competitiva NUNCA puede presentarse como evidencia de cliente
 * real de Vida Divina.
 */
export function assertNotCompetitiveSourceForCustomerEvidence(sourceCitation) {
  if (!sourceCitation?.trim()) return true;
  const lower = sourceCitation.toLowerCase();
  const matched = KNOWN_COMPETITOR_NAMES.find((name) => lower.includes(name.toLowerCase()));
  if (matched) {
    throw new Error(`assertNotCompetitiveSourceForCustomerEvidence: "sourceCitation" menciona a un competidor ("${matched}") — evidencia competitiva nunca puede citarse como fuente de Customer Evidence real de Vida Divina (Persona/Pain). Ver ${CUSTOMER_EVIDENCE_REQUIRED}.`);
  }
  return true;
}
