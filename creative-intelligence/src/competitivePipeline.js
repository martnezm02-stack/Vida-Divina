// competitivePipeline.js — conecta el pipeline pedido en la fase
// "Preparar Competitive Intelligence para activación":
//
// COMPETITOR RESEARCH → OBSERVED DATA → OBSERVATION → PATTERN → LEARNING →
// RECOMMENDATION → (informa) → PERSONA / PAIN / ANGLE / FORMAT →
// CREATIVE CELL → HYPOTHESIS → PRODUCTION BRIEF.
//
// Este archivo NO redefine ninguna pieza ya construida (evidenceTaxonomy.js,
// competitiveAbstraction.js, persona.js, pain.js, angle.js, format.js,
// creativeCell.js, hypothesis.js, productionBrief.js) — solo agrega el
// pegamento entre ellas, fijando domain='COMPETITIVE' donde corresponde y
// aplicando los guards anti-fabricación en el punto exacto donde el
// framework los exige.
//
// REGLA CENTRAL (dada explícitamente en esta fase): Persona y Pain NUNCA se
// fabrican a partir de evidencia competitiva — ambos exigen verbatim/cita
// real de un cliente real (ver persona.js/pain.js, sin cambios en esta
// fase). Lo que la evidencia competitiva puede alimentar de forma segura es:
// (a) una Opportunity que sirve de EVIDENCIA dentro de una CreativeCell ya
// construida con Persona/Pain reales de Vida Divina, y (b) el contenido
// narrativo (angleText/scriptDirection) de un Angle NUEVO para una
// Persona/Pain que YA EXISTEN — nunca la Persona/Pain en sí. Esa frontera es
// una decisión de quien arma el Angle/CreativeCell, no algo que este archivo
// pueda automatizar sin violar la regla.

import { randomUUID } from 'node:crypto';
import { createDataPoint, createObservation, createPattern, createLearning, createRecommendation, assertNoUnverifiedBusinessClaim } from './evidenceTaxonomy.js';
import { FIELD_KIND } from './competitiveAbstraction.js';
import { CONFIDENCE_LEVELS } from './evidenceProvenance.js';

const OBSERVED_FIELD_KINDS = new Set(['OBSERVED', 'OBSERVED_OR_UNKNOWN', 'OBSERVED_ORGANIC_ONLY']);

// ---------------------------------------------------------------------
// Observed Data → Observation → Pattern → Learning → Recommendation,
// fijado a domain='COMPETITIVE'.
// ---------------------------------------------------------------------

/**
 * DATA — construye un DataPoint SOLO a partir de un campo realmente
 * observado de un CompetitorCreativeRecord (ver FIELD_KIND en
 * competitiveAbstraction.js). Rechaza construir un DataPoint desde un campo
 * INFERRED (ej. personaHypothesis, structuralSignature) disfrazándolo de
 * dato crudo — exactamente la confusión OBSERVED/INFERRED que FIELD_KIND
 * existe para prevenir.
 */
export function deriveDataPointFromCompetitorRecord(record, field) {
  if (!record?.competitorCreativeRecordId) {
    throw new Error('deriveDataPointFromCompetitorRecord: se requiere un CompetitorCreativeRecord real.');
  }
  const kind = FIELD_KIND[field];
  if (!kind || !OBSERVED_FIELD_KINDS.has(kind)) {
    throw new Error(`deriveDataPointFromCompetitorRecord: "${field}" no es un campo OBSERVED de CompetitorCreativeRecord (kind: ${kind ?? 'desconocido'}) — un DataPoint solo puede construirse desde lo realmente observado, nunca desde un campo INFERRED.`);
  }
  return createDataPoint({
    domain: 'COMPETITIVE',
    field,
    value: record[field] ?? 'UNKNOWN',
    source: record.permalink ?? record.competitorCreativeRecordId,
  });
}

/** OBSERVATION — una descripción sobre UN registro competitivo, respaldada por sus DataPoints OBSERVED reales. */
export function deriveCompetitiveObservation(record, description, fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error('deriveCompetitiveObservation: se requiere al menos 1 campo OBSERVED real para respaldar la observación.');
  }
  const dataPoints = fields.map((field) => deriveDataPointFromCompetitorRecord(record, field));
  return createObservation({ domain: 'COMPETITIVE', description, basedOnData: dataPoints });
}

/** PATTERN — fija domain='COMPETITIVE'; createPattern ya exige ≥2 Observations (nunca de 1 sola, ver evidenceTaxonomy.js). */
export function deriveCompetitivePattern(observations, description, confidence = 'UNKNOWN') {
  return createPattern({ domain: 'COMPETITIVE', description, basedOnObservations: observations, confidence });
}

/** LEARNING — aplica el guard anti-claim automáticamente, no depende de que el llamador recuerde invocarlo. */
export function deriveCompetitiveLearning(patterns, description, confidence = 'UNKNOWN') {
  const learning = createLearning({ description, basedOnPatterns: patterns, confidence });
  assertNoUnverifiedBusinessClaim(learning); // lanza si afirma un resultado de negocio sin evidencia OWN_PERFORMANCE real
  return learning;
}

/** RECOMMENDATION — createRecommendation ya aplica el mismo guard internamente (ver evidenceTaxonomy.js). */
export function deriveCompetitiveRecommendation(learning, description) {
  return createRecommendation({ description, basedOnLearning: learning });
}

// ---------------------------------------------------------------------
// Opportunity → CreativeCell.evidence — nunca fabrica la CreativeCell en
// sí (eso sigue exigiendo Persona/Pain/Angle/Format reales, ver
// creativeCell.js sin cambios); solo empaqueta lo que createCreativeCell()
// puede recibir en su parámetro `evidence`.
// ---------------------------------------------------------------------

export function buildCreativeCellEvidenceFromOpportunity(opportunity, recommendation = null) {
  if (opportunity?.level !== 'OPPORTUNITY') {
    throw new Error('buildCreativeCellEvidenceFromOpportunity: se requiere una Opportunity real (level "OPPORTUNITY", ver competitiveAbstraction.js).');
  }
  const evidence = [{ type: 'OPPORTUNITY', opportunityId: opportunity.opportunityId, description: opportunity.description }];
  if (recommendation) {
    if (recommendation.type !== 'RECOMMENDATION') {
      throw new Error('buildCreativeCellEvidenceFromOpportunity: "recommendation", si se provee, debe ser una Recommendation real.');
    }
    evidence.push({ type: 'RECOMMENDATION', recommendationId: recommendation.recommendationId, description: recommendation.description });
  }
  return Object.freeze(evidence);
}

// ---------------------------------------------------------------------
// Strategic Priority — checklist cualitativo, NO una fórmula matemática
// (el framework original no define una). Mismo patrón ya usado en
// evaluateStarringCriteria (creativeCell.js): expone qué criterios se
// cumplen; priorizar sigue siendo una decisión humana.
// ---------------------------------------------------------------------

/**
 * Eje 2 de la priorización — "¿esta oportunidad merece atención estratégica
 * de Vida Divina ahora?", independiente de qué tan fuerte es la evidencia
 * (eso es el eje 1: computeEvidenceStrength(), en competitiveAbstraction.js
 * — los dos ejes nunca se combinan en un solo número, ver
 * summarizeEvidenceAndPriority más abajo).
 */
export function computeStrategicPriority({
  painMatchesRealPain,
  personaIsUnderserved,
  structurallyDiverse,
  formatIsExecutable,
  isStrategicOpportunity,
}) {
  const criteriaMet = [];
  if (painMatchesRealPain) criteriaMet.push('pain_matches_real_pain');
  if (personaIsUnderserved) criteriaMet.push('persona_is_underserved');
  if (structurallyDiverse) criteriaMet.push('structurally_diverse');
  if (formatIsExecutable) criteriaMet.push('format_is_executable');
  if (isStrategicOpportunity) criteriaMet.push('is_strategic_opportunity');
  return Object.freeze({ criteriaMet, count: criteriaMet.length });
}

/**
 * Combina los dos ejes SIN multiplicarlos en un score — los devuelve
 * juntos, cada uno documentado, para que un humano decida. El "×" de la
 * instrucción original significa "ambos ejes considerados juntos", no un
 * producto matemático (regla explícita de esta fase: no inventar una
 * fórmula que el framework no define).
 */
export function summarizeEvidenceAndPriority(evidenceStrengthResult, strategicPriorityResult) {
  if (!evidenceStrengthResult?.strength) {
    throw new Error('summarizeEvidenceAndPriority: se requiere un resultado real de computeEvidenceStrength() (competitiveAbstraction.js).');
  }
  if (!strategicPriorityResult || !Array.isArray(strategicPriorityResult.criteriaMet)) {
    throw new Error('summarizeEvidenceAndPriority: se requiere un resultado real de computeStrategicPriority().');
  }
  return Object.freeze({
    evidenceStrength: Object.freeze({
      ...evidenceStrengthResult,
      meaning: 'qué tan repetido y estructuralmente diverso es el patrón entre competidores DISTINTOS — ver computeEvidenceStrength().',
    }),
    strategicPriority: Object.freeze({
      ...strategicPriorityResult,
      meaning: 'cuántos criterios estratégicos de Vida Divina cumple esta oportunidad (pain real, persona subatendida, diversidad estructural, formato ejecutable, oportunidad estratégica) — ver computeStrategicPriority().',
    }),
  });
}

// ---------------------------------------------------------------------
// Representatividad de mercado — reglas #20/#21 ("una sola cuenta no
// puede representar todo el mercado", "un competidor dominante no debe
// monopolizar automáticamente la síntesis"). Descriptivo, no bloqueante:
// createPattern() ya permite legítimamente un Pattern grounded en 1 solo
// competidor (ej. 2 piezas del mismo distribuidor) — lo que esta función
// agrega es la señal honesta de que ESO es lo que pasó, para que nadie
// aguas abajo trate ese Pattern como si representara "el mercado".
// ---------------------------------------------------------------------

/**
 * @param {object[]} records CompetitorCreativeRecord[] (o cualquier objeto
 *   con competitorId/accountId) que respaldan un Pattern/Learning.
 */
export function describeMarketRepresentativeness(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('describeMarketRepresentativeness: se requiere al menos 1 registro real.');
  }
  const distinctAccounts = new Set(records.map((r) => r.accountId ?? r.advertiser ?? r.competitorId ?? r.competitor));
  const distinctCompetitors = new Set(records.map((r) => r.competitorId ?? r.competitor));
  return Object.freeze({
    recordCount: records.length,
    distinctAccountCount: distinctAccounts.size,
    distinctCompetitorCount: distinctCompetitors.size,
    singleAccountOnly: distinctAccounts.size === 1,
    singleCompetitorOnly: distinctCompetitors.size === 1,
    caveat: distinctCompetitors.size === 1
      ? 'Toda la evidencia proviene de un solo competidor — no representa "el mercado" ni al resto de la categoría.'
      : null,
  });
}

// ---------------------------------------------------------------------
// Hipótesis estratégicas preliminares — anteriores a que exista una
// CreativeCell (que exige Persona/Pain reales de Vida Divina, ver
// creativeCell.js). Deliberadamente un tipo DISTINTO de la Hypothesis del
// Pilar 5 (hypothesis.js, exige creativeCellId real) — confundir ambas
// permitiría que una hipótesis estructural sobre un patrón competitivo se
// disfrazara de hipótesis lista para producción sin Persona/Pain reales.
// ---------------------------------------------------------------------

const PRELIMINARY_HYPOTHESIS_STATUS = 'PRIORITY_HYPOTHESIS_FOR_TESTING'; // nunca configurable — ver reglas #14/#15.

/**
 * @param {{
 *   label: string,
 *   description: string,
 *   competitiveEvidenceRef: string,
 *   confidence: string,
 *   customerEvidenceRequired: boolean,
 * }} args
 */
export function createPreliminaryStrategicHypothesis({ label, description, competitiveEvidenceRef, confidence = 'UNKNOWN', customerEvidenceRequired = true }) {
  if (!label?.trim()) throw new Error('PreliminaryStrategicHypothesis: "label" es obligatorio (ej. "H1").');
  if (!description?.trim()) throw new Error('PreliminaryStrategicHypothesis: "description" es obligatorio.');
  if (!competitiveEvidenceRef?.trim()) {
    throw new Error('PreliminaryStrategicHypothesis: "competitiveEvidenceRef" es obligatorio — toda hipótesis preliminar debe citar el Pattern/Learning competitivo que la origina.');
  }
  if (!CONFIDENCE_LEVELS.includes(confidence)) {
    throw new Error(`PreliminaryStrategicHypothesis: "confidence" inválido "${confidence}" (válidos: ${CONFIDENCE_LEVELS.join(', ')}).`);
  }
  return Object.freeze({
    preliminaryHypothesisId: randomUUID(),
    label,
    description,
    competitiveEvidenceRef,
    confidence,
    customerEvidenceRequired,
    status: PRELIMINARY_HYPOTHESIS_STATUS, // estructural: no hay parámetro para sobrescribirlo con WINNER/VALIDATED/PROVEN.
    createdAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------
// Mención observada de Vida Divina en contenido de un competidor — regla
// #16: se conserva como OBSERVED_COMPETITIVE_DATA, nunca como awareness/
// percepción/cuota de mercado (esos campos no existen en la forma, por
// diseño, igual que AbstractionRecord no tiene campo para copy literal).
// ---------------------------------------------------------------------

export const OBSERVED_COMPETITIVE_DATA = 'OBSERVED_COMPETITIVE_DATA';

export function createObservedCompetitiveMention({
  mentionedBrand,
  mentioningCompetitor,
  mentioningAccountHandle,
  sourceUrl,
  observedAt,
  contentDate = null,
  contextDescription,
}) {
  if (!mentionedBrand?.trim()) throw new Error('ObservedCompetitiveMention: "mentionedBrand" es obligatorio.');
  if (!mentioningCompetitor?.trim()) throw new Error('ObservedCompetitiveMention: "mentioningCompetitor" es obligatorio.');
  if (!sourceUrl?.trim()) throw new Error('ObservedCompetitiveMention: "sourceUrl" es obligatorio — sin URL no es auditable.');
  if (!observedAt?.trim()) throw new Error('ObservedCompetitiveMention: "observedAt" es obligatorio.');
  if (!contextDescription?.trim()) {
    throw new Error('ObservedCompetitiveMention: "contextDescription" es obligatorio — debe describir SOLO lo observado (ej. "mencionada en una comparación pública"), nunca awareness/percepción/cuota de mercado inferidos.');
  }
  return Object.freeze({
    type: OBSERVED_COMPETITIVE_DATA,
    mentionedBrand,
    mentioningCompetitor,
    mentioningAccountHandle: mentioningAccountHandle ?? null,
    sourceUrl,
    observedAt,
    contentDate,
    contextDescription,
  });
}

/**
 * Construye el permalink público y determinístico de un video de TikTok a
 * partir de handle + id (`tiktok.com/@handle/video/id`) — formateo
 * mecánico de datos ya reales, no un hecho nuevo inventado (mismo criterio
 * que buildAdLibrarySnapshotUrl en sources/competitiveResearchSource.js).
 */
export function buildTikTokPermalink(accountHandle, videoId) {
  if (!accountHandle?.trim()) throw new Error('buildTikTokPermalink: se requiere "accountHandle" real.');
  if (!videoId?.trim()) throw new Error('buildTikTokPermalink: se requiere "videoId" real.');
  const handle = accountHandle.startsWith('@') ? accountHandle : `@${accountHandle}`;
  return `https://www.tiktok.com/${handle}/video/${videoId}`;
}

// ---------------------------------------------------------------------
// Selección de los primeros 5–8 conceptos — SOLO cuando exista evidencia
// real. Nunca fabrica candidatos ni declara ganadores: son hipótesis
// prioritarias para testing (ver hypothesis.js), nunca un resultado.
// ---------------------------------------------------------------------

const EVIDENCE_STRENGTH_RANK = Object.freeze({ high: 3, medium: 2, low: 1, INSUFFICIENT_DATA: 0 });

/**
 * @param {{ creativeCell: object, evidenceStrength: object, strategicPriority: object }[]} candidates
 * @param {{ max?: number }} [options]
 * @returns {ReadonlyArray<{ creativeCellId: string, status: 'PRIORITY_HYPOTHESIS_FOR_TESTING', evidenceStrength: string, strategicPriorityCount: number }>}
 */
export function selectPriorityCreativeCells(candidates, { max = 8 } = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return Object.freeze([]); // sin candidatos reales, nunca se inventa una selección.
  }

  const eligible = candidates.filter(
    (c) => c?.creativeCell?.creativeCellId && (EVIDENCE_STRENGTH_RANK[c.evidenceStrength?.strength] ?? 0) > 0
  );

  const sorted = [...eligible].sort((a, b) => {
    const strengthDiff = (EVIDENCE_STRENGTH_RANK[b.evidenceStrength.strength] ?? 0) - (EVIDENCE_STRENGTH_RANK[a.evidenceStrength.strength] ?? 0);
    if (strengthDiff !== 0) return strengthDiff;
    return (b.strategicPriority?.count ?? 0) - (a.strategicPriority?.count ?? 0);
  });

  return Object.freeze(
    sorted.slice(0, max).map((c) =>
      Object.freeze({
        creativeCellId: c.creativeCell.creativeCellId,
        status: 'PRIORITY_HYPOTHESIS_FOR_TESTING', // nunca 'WINNER' — son hipótesis a testear, no ganadores declarados.
        evidenceStrength: c.evidenceStrength.strength,
        strategicPriorityCount: c.strategicPriority.count,
      })
    )
  );
}
