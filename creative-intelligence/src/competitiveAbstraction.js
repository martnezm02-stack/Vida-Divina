// competitiveAbstraction.js — Competitive Creative → Competitor Creative
// Record (crudo) → Abstraction Record (estructurado) → Pattern →
// Creative Opportunity.
//
// FRAMEWORK / INSTRUCCIÓN DEL PROPIETARIO: "El sistema que genera conceptos
// de Vida Divina debe trabajar preferentemente con la abstracción, no con
// el creativo original." Esto se cumple ESTRUCTURALMENTE aquí, no solo por
// disciplina: AbstractionRecord no tiene NINGÚN campo para texto literal
// (caption/transcript/hook) — abstractFromRawRecord() nunca los copia hacia
// adelante, solo conserva una referencia (observedEvidenceRef) al registro
// crudo. "Síntesis ciega": quien recibe un AbstractionRecord no puede
// reconstruir el creativo original a partir de él.
//
// Cada campo del registro crudo está clasificado OBSERVED o INFERRED —
// FIELD_KIND documenta la clasificación exacta ya definida en las fases de
// diseño anteriores (Competitive Creative Intelligence, Competitive
// Research Procedure).

import { randomUUID } from 'node:crypto';
import { NARRATOR_TYPES, SCENE_SETUPS, EDIT_RHYTHMS } from './format.js';
import { CONFIDENCE_LEVELS, CUSTOMER_EVIDENCE_REQUIRED } from './evidenceProvenance.js';

export const FIELD_KIND = Object.freeze({
  competitorId: 'internal_reference',
  accountId: 'OBSERVED',
  pageId: 'OBSERVED',
  // "platforms" (plural, arreglo) — renombrado en la Fase "Adaptar
  // Competitive Intelligence a Response Real de Meta": la respuesta real
  // de /ads_archive entrega `publisher_platforms[]` (ej. ["facebook",
  // "instagram"]), nunca una sola plataforma — representarlo como string
  // singular perdía evidencia real observada.
  platforms: 'OBSERVED',
  contentId: 'OBSERVED',
  adId: 'OBSERVED',
  permalink: 'OBSERVED',
  dateObserved: 'OBSERVED',
  // datePublished = ad_delivery_start_time (ya existía con este nombre,
  // reutilizado). dateCreated y dateEnded son campos NUEVOS de esta fase —
  // Meta los distingue de datePublished y nunca deben confundirse entre sí.
  dateCreated: 'OBSERVED',
  datePublished: 'OBSERVED',
  // dateEnded = ad_delivery_stop_time — Meta no lo entrega si el anuncio
  // sigue activo; queda null, NUNCA se infiere una fecha de cierre.
  dateEnded: 'OBSERVED_OR_UNKNOWN',
  mediaType: 'OBSERVED',
  caption: 'OBSERVED',
  transcript: 'OBSERVED',
  // Las 4 estructuras reales de creative copy de Meta — se conservan
  // separadas (arreglos), nunca concatenadas en un string. "caption" (arriba)
  // se deriva de adCreativeBodies[0] cuando existe, como texto primario de
  // conveniencia — pero la estructura completa vive aquí, intacta.
  adCreativeBodies: 'OBSERVED_OR_UNKNOWN',
  adCreativeLinkTitles: 'OBSERVED_OR_UNKNOWN',
  adCreativeLinkDescriptions: 'OBSERVED_OR_UNKNOWN',
  adCreativeLinkCaptions: 'OBSERVED_OR_UNKNOWN',
  visibleOffer: 'OBSERVED_OR_UNKNOWN',
  engagementSignals: 'OBSERVED_ORGANIC_ONLY',
  longevity: 'OBSERVED',
  // Campos específicos de Meta Ad Library (Fase: Preparar Competitive
  // Intelligence para activación) — igual que visibleOffer, Meta los expone
  // como RANGOS o estados, nunca como cifras exactas de negocio. spendRange/
  // impressionRange: confirmado por respuesta real que Meta NO los entrega
  // para anuncios comerciales — esto es comportamiento observado de Meta,
  // no un error de este sistema; quedan 'UNKNOWN' honestamente.
  landingDestination: 'OBSERVED_OR_UNKNOWN',
  spendRange: 'OBSERVED_OR_UNKNOWN',
  impressionRange: 'OBSERVED_OR_UNKNOWN',
  activeStatus: 'OBSERVED_OR_UNKNOWN',
  mediaReference: 'OBSERVED_OR_UNKNOWN',
  format: 'INFERRED',
  hook: 'INFERRED',
  mechanism: 'INFERRED',
  personaHypothesis: 'INFERRED',
  painHypothesis: 'INFERRED',
  awarenessHypothesis: 'INFERRED',
  structuralSignature: 'INFERRED',
});

/** Competitor Creative Record — evidencia cruda. Nunca sale de esta capa hacia la generación de conceptos. */
export function createCompetitorCreativeRecord({
  competitorId,
  accountId,
  pageId = null,
  platforms,
  contentId = null,
  adId = null,
  permalink,
  dateObserved = new Date().toISOString(),
  dateCreated = null,
  datePublished = null,
  dateEnded = null,
  mediaType,
  caption,
  hook = null,
  transcript = null,
  // Las 4 estructuras reales de Meta, conservadas por separado — nunca
  // concatenadas. Todas opcionales/vacías por defecto (fuentes orgánicas
  // como TikTok/Instagram no las tienen; solo Ad Library las entrega).
  adCreativeBodies = [],
  adCreativeLinkTitles = [],
  adCreativeLinkDescriptions = [],
  adCreativeLinkCaptions = [],
  visibleOffer = 'UNKNOWN',
  mechanism = null,
  personaHypothesis = null,
  painHypothesis = null,
  awarenessHypothesis = null,
  structuralSignature = null,
  engagementSignals = 'UNKNOWN',
  longevity = 'UNKNOWN',
  // Campos específicos de Meta Ad Library — null/UNKNOWN cuando Meta no los
  // entrega para ese anuncio en particular, nunca inventados (ver
  // mapAdLibraryRawRecordToCompetitorCreativeRecord en
  // sources/competitiveResearchSource.js).
  landingDestination = null,
  spendRange = 'UNKNOWN',
  impressionRange = 'UNKNOWN',
  activeStatus = 'UNKNOWN',
  mediaReference = null,
  sourceType,
}) {
  if (!competitorId) throw new Error('CompetitorCreativeRecord: "competitorId" es obligatorio.');
  if (!accountId?.trim()) throw new Error('CompetitorCreativeRecord: "accountId" es obligatorio (OBSERVED).');
  if (!Array.isArray(platforms) || platforms.length === 0 || platforms.some((p) => typeof p !== 'string' || !p.trim())) {
    throw new Error('CompetitorCreativeRecord: "platforms" es obligatorio (OBSERVED) y debe ser un arreglo no vacío de strings — Meta entrega publisher_platforms como arreglo, nunca una sola plataforma.');
  }
  if (!permalink?.trim()) throw new Error('CompetitorCreativeRecord: "permalink" es obligatorio (OBSERVED).');
  if (!mediaType?.trim()) throw new Error('CompetitorCreativeRecord: "mediaType" es obligatorio (OBSERVED).');
  if (!caption?.trim()) throw new Error('CompetitorCreativeRecord: "caption" es obligatorio (OBSERVED) — sin esto no hay evidencia cruda real que abstraer.');
  for (const [field, value] of [['adCreativeBodies', adCreativeBodies], ['adCreativeLinkTitles', adCreativeLinkTitles], ['adCreativeLinkDescriptions', adCreativeLinkDescriptions], ['adCreativeLinkCaptions', adCreativeLinkCaptions]]) {
    if (!Array.isArray(value)) throw new Error(`CompetitorCreativeRecord: "${field}" debe ser un arreglo (puede estar vacío, nunca inventado) — refleja la estructura real de Meta, no un string concatenado.`);
  }
  if (sourceType !== 'ORGANIC' && sourceType !== 'PAID') {
    throw new Error('CompetitorCreativeRecord: "sourceType" debe ser "ORGANIC" o "PAID" — orgánico y pagado nunca se mezclan (Parte 2, Competitive Research Procedure).');
  }

  return Object.freeze({
    competitorCreativeRecordId: randomUUID(),
    competitorId,
    accountId,
    pageId,
    platforms: Object.freeze([...platforms]),
    contentId,
    adId,
    permalink,
    dateObserved,
    dateCreated,
    datePublished,
    dateEnded,
    mediaType,
    sourceType,
    caption,
    hook,
    transcript,
    adCreativeBodies: Object.freeze([...adCreativeBodies]),
    adCreativeLinkTitles: Object.freeze([...adCreativeLinkTitles]),
    adCreativeLinkDescriptions: Object.freeze([...adCreativeLinkDescriptions]),
    adCreativeLinkCaptions: Object.freeze([...adCreativeLinkCaptions]),
    visibleOffer,
    mechanism,
    personaHypothesis,
    painHypothesis,
    awarenessHypothesis,
    structuralSignature,
    engagementSignals,
    longevity,
    landingDestination,
    spendRange,
    impressionRange,
    activeStatus,
    mediaReference,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Abstraction Record — lo único que la generación de conceptos de Vida
 * Divina puede ver. Sin caption/transcript/hook literal por diseño de la
 * forma del objeto (no por omisión de disciplina).
 */
export function createAbstractionRecord({
  personaHypothesis,
  painHypothesis,
  awareness,
  angle,
  mechanismFraming,
  format,
  narrativeStructure,
  structuralSignature,
  // Señales estructurales adicionales, todas opcionales — un anuncio
  // estático de Ad Library, por ejemplo, no tiene editRhythm ni scene.
  // "hookStructure" es la ABSTRACCIÓN de cómo abre el creativo (ej.
  // "revelación de autoridad en los primeros segundos"), nunca el hook
  // literal — ver el guard en abstractFromRawRecord.
  hookStructure = null,
  narratorType = null,
  sceneSetup = null,
  editRhythm = null,
  visibleOffer = 'UNKNOWN',
  longevity = 'UNKNOWN',
  observedEvidenceRef,
  confidence,
}) {
  if (!personaHypothesis?.trim()) throw new Error('AbstractionRecord: "personaHypothesis" es obligatorio.');
  if (!painHypothesis?.trim()) throw new Error('AbstractionRecord: "painHypothesis" es obligatorio.');
  if (!awareness?.trim()) throw new Error('AbstractionRecord: "awareness" es obligatorio.');
  if (!angle?.trim()) throw new Error('AbstractionRecord: "angle" es obligatorio.');
  if (!mechanismFraming?.trim()) throw new Error('AbstractionRecord: "mechanismFraming" es obligatorio.');
  if (!format?.trim()) throw new Error('AbstractionRecord: "format" es obligatorio.');
  if (!narrativeStructure?.trim()) throw new Error('AbstractionRecord: "narrativeStructure" es obligatorio.');
  if (narratorType !== null && !NARRATOR_TYPES.includes(narratorType)) {
    throw new Error(`AbstractionRecord: "narratorType" inválido "${narratorType}" (válidos: ${NARRATOR_TYPES.join(', ')}, o null si no aplica/no se observa).`);
  }
  if (sceneSetup !== null && !SCENE_SETUPS.includes(sceneSetup)) {
    throw new Error(`AbstractionRecord: "sceneSetup" inválido "${sceneSetup}" (válidos: ${SCENE_SETUPS.join(', ')}, o null si no aplica/no se observa).`);
  }
  if (editRhythm !== null && !EDIT_RHYTHMS.includes(editRhythm)) {
    throw new Error(`AbstractionRecord: "editRhythm" inválido "${editRhythm}" (válidos: ${EDIT_RHYTHMS.join(', ')}, o null si no aplica/no se observa — ej. un anuncio estático no tiene edit rhythm).`);
  }
  if (!observedEvidenceRef?.recordId) {
    throw new Error('AbstractionRecord: "observedEvidenceRef" debe referenciar un registro real por id — nunca el texto literal.');
  }
  if (!['low', 'medium', 'high'].includes(confidence)) {
    throw new Error('AbstractionRecord: "confidence" debe ser "low", "medium" o "high".');
  }

  return Object.freeze({
    abstractionRecordId: randomUUID(),
    personaHypothesis,
    painHypothesis,
    awareness,
    angle,
    mechanismFraming,
    format,
    narrativeStructure,
    hookStructure,
    narratorType,
    sceneSetup,
    editRhythm,
    structuralSignature: structuralSignature ? Object.freeze({ ...structuralSignature }) : null,
    visibleOffer,
    longevity,
    observedEvidenceRef: Object.freeze({ ...observedEvidenceRef }),
    confidence,
    createdAt: new Date().toISOString(),
  });
}

/**
 * "Síntesis ciega": construye un AbstractionRecord a partir de un registro
 * crudo + las hipótesis de un analista — nunca copia caption/transcript/hook
 * hacia el resultado. `observedEvidenceRef` guarda solo el id y un resumen
 * NO literal (provisto por el analista, no derivado automáticamente del
 * texto crudo).
 */
export function abstractFromRawRecord(rawRecord, { personaHypothesis, painHypothesis, awareness, angle, mechanismFraming, format, narrativeStructure, hookStructure = null, narratorType = null, sceneSetup = null, editRhythm = null, evidenceSummary, confidence }) {
  if (!rawRecord?.competitorCreativeRecordId) {
    throw new Error('abstractFromRawRecord: se requiere un CompetitorCreativeRecord real.');
  }
  if (!evidenceSummary?.trim()) {
    throw new Error('abstractFromRawRecord: "evidenceSummary" es obligatorio — una referencia a la evidencia, nunca el caption/transcript completo.');
  }
  if (hookStructure && rawRecord.hook && hookStructure.trim().toLowerCase() === rawRecord.hook.trim().toLowerCase()) {
    throw new Error('abstractFromRawRecord: "hookStructure" es idéntico al hook literal del competidor — debe ser una abstracción de la estructura (ej. "revelación de autoridad"), nunca el texto original (misma regla que assertNotCopy).');
  }
  return createAbstractionRecord({
    personaHypothesis,
    painHypothesis,
    awareness,
    angle,
    mechanismFraming,
    format,
    narrativeStructure,
    hookStructure,
    narratorType: narratorType ?? rawRecord.structuralSignature?.narratorType ?? null,
    sceneSetup: sceneSetup ?? rawRecord.structuralSignature?.sceneSetup ?? null,
    editRhythm: editRhythm ?? rawRecord.structuralSignature?.editRhythm ?? null,
    structuralSignature: rawRecord.structuralSignature,
    visibleOffer: rawRecord.visibleOffer,
    longevity: rawRecord.longevity,
    observedEvidenceRef: { recordId: rawRecord.competitorCreativeRecordId, summary: evidenceSummary },
    confidence,
  });
}

// ---------------------------------------------------------------------
// Copy / Pattern / Insight / Opportunity — nunca clonación.
// ---------------------------------------------------------------------

export const ABSTRACTION_LEVELS = Object.freeze(['COPY', 'PATTERN', 'INSIGHT', 'OPPORTUNITY']);

// Dominios (evidenceTaxonomy.js) cuyo Pattern puede informar una Opportunity
// vía informedByPattern. MARKET_EVIDENCE/CUSTOMER_RESEARCH quedan fuera
// deliberadamente: esos alimentan Persona/Pain directamente (personaStage.js/
// painStage.js), nunca una Opportunity de esta capa.
export const OPPORTUNITY_INFORMING_DOMAINS = Object.freeze(['COMPETITIVE', 'AFFILIATE']);

/** COPY siempre se rechaza — es el único nivel que nunca se construye como objeto válido. */
export function assertNotCopy({ conceptText, sourceLiteralText }) {
  if (!conceptText?.trim() || !sourceLiteralText?.trim()) return true;
  if (conceptText.trim().toLowerCase() === sourceLiteralText.trim().toLowerCase()) {
    throw new Error('assertNotCopy: el concepto propuesto es idéntico al texto literal de origen — esto es COPY, nunca permitido (Parte 6).');
  }
  return true;
}

/**
 * OPPORTUNITY — la única forma que puede alimentar una CreativeCell (ver
 * creativeCell.js). `informedByPattern`, opcional, cierra el eslabón
 * Evidence → Abstraction → Pattern → Opportunity: si se provee, debe ser un
 * Pattern real de dominio COMPETITIVE o AFFILIATE (evidenceTaxonomy.js,
 * ampliado en la fase "Implementar Capa de Affiliate Intelligence") — nunca
 * un Pattern de otro dominio (en particular, nunca MARKET_EVIDENCE/
 * CUSTOMER_RESEARCH disfrazado de Opportunity) ni un objeto inventado.
 */
export function createOpportunity({
  description,
  basedOnAbstractionRecords,
  whyDifferentFromSource,
  informedByPattern = null,
  confidence = 'UNKNOWN',
  // Declaración honesta, no una verificación automática (esta capa no
  // puede saber si ya existe una Persona/Pain real de Vida Divina en otro
  // módulo): quien construye la Opportunity marca explícitamente si
  // todavía falta evidencia propia de cliente para convertirla en
  // CreativeCell (ver assertOpportunityReadyForCreativeCell más abajo).
  customerEvidenceRequired = false,
  // Referencias por id a Patterns/Learnings que informaron esta
  // Opportunity — a diferencia de informedByPattern (un objeto Pattern
  // real), esto acepta también ids de hallazgos catalogados/declarados por
  // una investigación externa que no se re-derivaron como objetos Pattern
  // en este código (ver competitiveEvidencePreliminary.js).
  sourcePatternIds = [],
}) {
  if (!description?.trim()) throw new Error('Opportunity: "description" es obligatorio.');
  if (!Array.isArray(basedOnAbstractionRecords) || basedOnAbstractionRecords.length === 0) {
    throw new Error('Opportunity: se requiere al menos 1 AbstractionRecord real.');
  }
  if (!whyDifferentFromSource?.trim()) {
    throw new Error('Opportunity: "whyDifferentFromSource" es obligatorio — una Opportunity debe explicar por qué NO reconstruye el creativo original (Parte 6).');
  }
  if (informedByPattern !== null) {
    if (informedByPattern?.type !== 'PATTERN' || !OPPORTUNITY_INFORMING_DOMAINS.includes(informedByPattern?.domain)) {
      throw new Error(`Opportunity: "informedByPattern", si se provee, debe ser un Pattern real de dominio ${OPPORTUNITY_INFORMING_DOMAINS.join(' o ')} (ver evidenceTaxonomy.js) — nunca inventado ni de otro dominio.`);
    }
  }
  if (!CONFIDENCE_LEVELS.includes(confidence)) {
    throw new Error(`Opportunity: "confidence" inválido "${confidence}" (válidos: ${CONFIDENCE_LEVELS.join(', ')}).`);
  }
  if (!Array.isArray(sourcePatternIds)) throw new Error('Opportunity: "sourcePatternIds" debe ser un arreglo de ids (puede estar vacío).');

  return Object.freeze({
    opportunityId: randomUUID(),
    level: 'OPPORTUNITY',
    description,
    basedOnAbstractionRecords: Object.freeze([...basedOnAbstractionRecords]),
    informedByPattern: informedByPattern ? Object.freeze({ patternId: informedByPattern.patternId, description: informedByPattern.description }) : null,
    sourcePatternIds: Object.freeze([...sourcePatternIds]),
    confidence,
    customerEvidenceRequired,
    whyDifferentFromSource,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Cierra el hueco pedido explícitamente: "Si una Opportunity necesita una
 * Persona o Pain real de Vida Divina y todavía no existe evidencia propia:
 * CUSTOMER_EVIDENCE_REQUIRED. No inventes el dato." Lanza si la
 * Opportunity está marcada `customerEvidenceRequired:true` y no se provee
 * evidencia real (`realPersonaId`/`realPainId`) — nunca deja pasar en
 * silencio.
 */
export function assertOpportunityReadyForCreativeCell(opportunity, { realPersonaId = null, realPainId = null } = {}) {
  if (opportunity?.level !== 'OPPORTUNITY') {
    throw new Error('assertOpportunityReadyForCreativeCell: se requiere una Opportunity real.');
  }
  if (opportunity.customerEvidenceRequired && (!realPersonaId || !realPainId)) {
    throw new Error(`assertOpportunityReadyForCreativeCell: ${CUSTOMER_EVIDENCE_REQUIRED} — esta Opportunity está marcada como dependiente de evidencia propia de cliente (Persona/Pain reales de Vida Divina) que todavía no existe. No se fabrica el dato faltante.`);
  }
  return true;
}

/**
 * Evidence strength (distinto de Strategic Priority, ver Competitive
 * Research Procedure, Parte 7) — calculado, no inventado: repetición entre
 * competidores distintos + diversidad estructural.
 */
export function computeEvidenceStrength(abstractionRecords) {
  if (!Array.isArray(abstractionRecords) || abstractionRecords.length === 0) {
    return Object.freeze({ strength: 'INSUFFICIENT_DATA', competitorCount: 0 });
  }
  const distinctSignatures = new Set(abstractionRecords.map((r) => JSON.stringify(r.structuralSignature)));
  let strength;
  if (abstractionRecords.length === 1) strength = 'low';
  else if (abstractionRecords.length >= 2 && abstractionRecords.length <= 3) strength = 'medium';
  else strength = 'high';
  return Object.freeze({ strength, recordCount: abstractionRecords.length, distinctStructuralSignatures: distinctSignatures.size });
}
