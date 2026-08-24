// persona.js — Pillar 1: Customer Persona Mapping.
// Prompt 1 (Persona Generator) + Prompt 2 (Sub-Persona Split Check).
//
// FRAMEWORK ORIGINAL, regla no negociable: una Persona es un TYPE OF
// CUSTOMER. NO es awareness level, mindset trait, funnel position, ni un
// simple segmento demográfico. Se define por life situation + relationship
// to the problem, y debe poder existir a través de los 5 awareness levels.
//
// Cumplimiento ESTRUCTURAL de la regla (no solo documental): este objeto
// NUNCA tiene un campo de awareness — es imposible construir una Persona
// "por awareness" porque no existe dónde ponerlo. Además, validatePersona()
// rechaza explícitamente si life situation o relationship to the problem
// coinciden con uno de los 5 awareness stages (error común a atrapar).

import { randomUUID } from 'node:crypto';
import { AWARENESS_STAGES } from './awareness.js';

export const COVERAGE_STATES = Object.freeze(['Scaling', 'Testing', 'Not Running', 'UNKNOWN']);

// Agregado en la Fase "Creative Intelligence — Integración de Evidencia +
// Primer Ciclo": sin Customer Evidence propia todavía, una Persona
// construida sobre Market Evidence nunca puede presentarse con la misma
// solidez que una respaldada por clientes reales de Vida Divina.
// PROVISIONAL es el techo hasta que exista evidencia propia; CUSTOMER_VALIDATED
// se deja definido para cuando exista, pero nada en este archivo lo asigna
// automáticamente — quien construye la Persona debe declararlo explícitamente
// y solo tiene sentido si evidenceType también es evidencia propia.
export const PERSONA_CONFIDENCE_LEVELS = Object.freeze(['PROVISIONAL', 'CUSTOMER_VALIDATED', 'UNKNOWN']);
// De dónde viene la evidencia que sostiene esta Persona — nunca se mezcla
// (ver evidenceProvenance.js/competitiveEvidencePreliminary.js, mismo
// principio de separación de dominios).
export const PERSONA_EVIDENCE_TYPES = Object.freeze(['MARKET_EVIDENCE', 'CUSTOMER_EVIDENCE', 'AFFILIATE_EVIDENCE_CONTEXTUAL', 'UNKNOWN']);

const AWARENESS_STAGES_LOWER = new Set(AWARENESS_STAGES.map((s) => s.toLowerCase()));

function looksLikeAwarenessStage(value) {
  return typeof value === 'string' && AWARENESS_STAGES_LOWER.has(value.trim().toLowerCase());
}

/**
 * @param {{phrase: string, sourceCitation: string}[]} verbatimPhrases
 */
function assertVerbatimPhrases(verbatimPhrases) {
  if (!Array.isArray(verbatimPhrases) || verbatimPhrases.length < 3 || verbatimPhrases.length > 5) {
    throw new Error('Persona: "verbatimPhrases" debe tener entre 3 y 5 elementos (Prompt 1).');
  }
  for (const entry of verbatimPhrases) {
    if (!entry?.phrase?.trim()) throw new Error('Persona: cada verbatim phrase requiere "phrase" no vacío.');
    if (!entry?.sourceCitation?.trim()) throw new Error('Persona: cada verbatim phrase requiere "sourceCitation" — nunca lenguaje verbal sin fuente (Prompt 1).');
  }
}

/**
 * Construye y valida una Persona. Lanza si viola la regla central del
 * framework — nunca crea una Persona "silenciosamente inválida".
 */
export function createPersona({
  name,
  lifeSituation,
  painContext,
  relationshipToProblem,
  whatTheyveTried,
  whatTheyFear,
  whatTheyWant,
  verbatimPhrases,
  whyRespondToBrand,
  coverageState = 'UNKNOWN',
  subPersonaOf = null,
  confidence = 'UNKNOWN',
  evidenceType = 'UNKNOWN',
  evidenceIds = [],
}) {
  if (!name?.trim()) throw new Error('Persona: "name" es obligatorio.');
  if (!lifeSituation?.trim()) throw new Error('Persona: "lifeSituation" es obligatorio (Prompt 1 — una Persona se define por life situation, no solo por demografía).');
  if (!relationshipToProblem?.trim()) throw new Error('Persona: "relationshipToProblem" es obligatorio (Prompt 1).');

  // Regla estructural: ni lifeSituation ni relationshipToProblem pueden ser
  // literalmente un awareness stage — el error más común que el framework
  // pide evitar explícitamente.
  if (looksLikeAwarenessStage(lifeSituation)) {
    throw new Error(`Persona: "lifeSituation" no puede ser un awareness level ("${lifeSituation}") — una Persona NO es un awareness stage (regla central de Prompt 1).`);
  }
  if (looksLikeAwarenessStage(relationshipToProblem)) {
    throw new Error(`Persona: "relationshipToProblem" no puede ser un awareness level ("${relationshipToProblem}") — una Persona NO es un awareness stage (regla central de Prompt 1).`);
  }

  assertVerbatimPhrases(verbatimPhrases);

  if (!COVERAGE_STATES.includes(coverageState)) {
    throw new Error(`Persona: "coverageState" inválido "${coverageState}" (válidos: ${COVERAGE_STATES.join(', ')}).`);
  }
  if (!PERSONA_CONFIDENCE_LEVELS.includes(confidence)) {
    throw new Error(`Persona: "confidence" inválido "${confidence}" (válidos: ${PERSONA_CONFIDENCE_LEVELS.join(', ')}).`);
  }
  if (!PERSONA_EVIDENCE_TYPES.includes(evidenceType)) {
    throw new Error(`Persona: "evidenceType" inválido "${evidenceType}" (válidos: ${PERSONA_EVIDENCE_TYPES.join(', ')}).`);
  }
  if (confidence === 'CUSTOMER_VALIDATED' && evidenceType !== 'CUSTOMER_EVIDENCE') {
    throw new Error('Persona: "confidence" no puede ser "CUSTOMER_VALIDATED" a menos que "evidenceType" sea "CUSTOMER_EVIDENCE" real — nunca se declara validada por cliente sobre Market/Affiliate Evidence.');
  }
  if (!Array.isArray(evidenceIds)) throw new Error('Persona: "evidenceIds" debe ser un arreglo (puede estar vacío).');

  return Object.freeze({
    personaId: randomUUID(),
    name,
    lifeSituation,
    painContext: painContext ?? null,
    relationshipToProblem,
    whatTheyveTried: whatTheyveTried ?? null,
    whatTheyFear: whatTheyFear ?? null,
    whatTheyWant: whatTheyWant ?? null,
    verbatimPhrases: Object.freeze(verbatimPhrases.map((p) => Object.freeze({ ...p }))),
    whyRespondToBrand: whyRespondToBrand ?? null,
    coverageState,
    subPersonaOf,
    confidence,
    evidenceType,
    evidenceIds: Object.freeze([...evidenceIds]),
    createdAt: new Date().toISOString(),
  });
}

/**
 * Revalida una Persona ya construida — útil para validar objetos que
 * llegan de una fuente externa (ej. CustomerResearchSource futura) sin
 * pasar por createPersona().
 */
export function validatePersona(persona) {
  createPersona({ ...persona, verbatimPhrases: [...(persona?.verbatimPhrases ?? [])] });
  return true;
}

// ---------------------------------------------------------------------
// Prompt 2 — Sub-Persona Split Check.
// FRAMEWORK ORIGINAL: evaluar múltiples emotional wounds, failure modes,
// language patterns, relationships to the problem — nunca decide sola, solo
// estructura la evaluación que un humano/analista completa.
// ---------------------------------------------------------------------

/**
 * @param {{
 *   multipleEmotionalWounds: boolean,
 *   multipleFailureModes: boolean,
 *   multipleLanguagePatterns: boolean,
 *   multipleRelationshipsToProblem: boolean,
 * }} signals
 * @returns {{ shouldSplit: boolean, reasons: string[] }}
 */
export function evaluateSubPersonaSplit(signals) {
  const reasons = [];
  if (signals?.multipleEmotionalWounds) reasons.push('multiple emotional wounds');
  if (signals?.multipleFailureModes) reasons.push('multiple failure modes');
  if (signals?.multipleLanguagePatterns) reasons.push('multiple language patterns');
  if (signals?.multipleRelationshipsToProblem) reasons.push('multiple relationships to the problem');
  return { shouldSplit: reasons.length > 0, reasons };
}

/**
 * Validación de una sub-persona ya creada (createPersona con subPersonaOf
 * definido) contra las 3 condiciones adicionales de Prompt 2 que
 * createPersona por sí sola no puede verificar (existencia de un persona
 * padre real, y que efectivamente pueda existir a través de los 5
 * awareness levels — esto último es una afirmación conceptual, no
 * verificable estructuralmente; se documenta como responsabilidad de quien
 * completa Pillar 3, Angle Generator).
 */
export function validateSubPersona(subPersona, parentPersonaId) {
  validatePersona(subPersona);
  if (!subPersona.subPersonaOf) {
    throw new Error('SubPersona: "subPersonaOf" es obligatorio — una sub-persona debe referenciar a la persona de la que se dividió.');
  }
  if (parentPersonaId && subPersona.subPersonaOf !== parentPersonaId) {
    throw new Error('SubPersona: "subPersonaOf" no coincide con el personaId del padre esperado.');
  }
  return true;
}
