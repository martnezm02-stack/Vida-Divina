// creativeCell.js — Pillar 5: Synthesis + Production Briefs.
// Prompt 9 (Strategy Map Synthesis + Test Queue).
//
// FRAMEWORK ORIGINAL: strategy map fields = Persona/sub-persona, Pain
// anchor, Awareness stage, Angle, Format, Andromeda signature, Coverage
// state, Priority. Starring criteria: highest verbatim source match,
// structurally distinct format, new entity ID, underserved persona,
// fast-executable format.
//
// IMPORTANTE (dado en esta fase): una CreativeCell NO es todavía un
// anuncio — es una hipótesis estratégica que posteriormente produce un
// ProductionBrief. Este archivo no genera copy ni contenido, solo la
// estructura de la celda.

import { randomUUID } from 'node:crypto';
import { assertValidAwarenessStage } from './awareness.js';
import { COVERAGE_STATES } from './persona.js';

export const PRIORITY_LEVELS = Object.freeze(['starred', 'candidate', 'not_prioritized', 'UNKNOWN']);

export function createCreativeCell({
  personaId,
  subPersonaId = null,
  painId,
  awareness,
  angleId,
  formatId,
  mechanism,
  priority = 'UNKNOWN',
  coverageState = 'UNKNOWN',
  evidence = [],
  sourceReferences = [],
}) {
  if (!personaId) throw new Error('CreativeCell: "personaId" es obligatorio.');
  if (!painId) throw new Error('CreativeCell: "painId" es obligatorio.');
  assertValidAwarenessStage(awareness);
  if (!angleId) throw new Error('CreativeCell: "angleId" es obligatorio.');
  if (!formatId) throw new Error('CreativeCell: "formatId" es obligatorio.');
  if (!mechanism?.trim()) throw new Error('CreativeCell: "mechanism" es obligatorio.');
  if (!PRIORITY_LEVELS.includes(priority)) {
    throw new Error(`CreativeCell: "priority" inválido "${priority}" (válidos: ${PRIORITY_LEVELS.join(', ')}).`);
  }
  if (!COVERAGE_STATES.includes(coverageState)) {
    throw new Error(`CreativeCell: "coverageState" inválido "${coverageState}" (válidos: ${COVERAGE_STATES.join(', ')}).`);
  }
  if (!Array.isArray(evidence)) throw new Error('CreativeCell: "evidence" debe ser un arreglo (puede estar vacío, nunca inventado).');
  if (!Array.isArray(sourceReferences)) throw new Error('CreativeCell: "sourceReferences" debe ser un arreglo.');

  return Object.freeze({
    creativeCellId: randomUUID(),
    personaId,
    subPersonaId,
    painId,
    awareness,
    angleId,
    formatId,
    mechanism,
    hypothesisId: null, // se completa después de createHypothesis() — nunca se inventa aquí
    priority,
    coverageState,
    evidence: Object.freeze([...evidence]),
    sourceReferences: Object.freeze([...sourceReferences]),
    createdAt: new Date().toISOString(),
  });
}

export function validateCreativeCell(cell) {
  createCreativeCell(cell);
  return true;
}

/** Vincula una Hypothesis ya creada a una CreativeCell — nunca las crea juntas implícitamente. */
export function attachHypothesis(cell, hypothesis) {
  if (hypothesis.creativeCellId !== cell.creativeCellId) {
    throw new Error('attachHypothesis: la Hypothesis no pertenece a esta CreativeCell (creativeCellId no coincide).');
  }
  return Object.freeze({ ...cell, hypothesisId: hypothesis.hypothesisId });
}

/**
 * Prompt 9 — criterios de starring, expuestos como evaluación, no como
 * decisión automática. Devuelve qué criterios se cumplen; starrear sigue
 * siendo una decisión humana (Pillar 5 no define una fórmula numérica).
 */
export function evaluateStarringCriteria({
  hasHighestVerbatimSourceMatch,
  hasStructurallyDistinctFormat,
  isNewEntityId,
  isUnderservedPersona,
  isFastExecutableFormat,
}) {
  const criteriaMet = [];
  if (hasHighestVerbatimSourceMatch) criteriaMet.push('highest_verbatim_source_match');
  if (hasStructurallyDistinctFormat) criteriaMet.push('structurally_distinct_format');
  if (isNewEntityId) criteriaMet.push('new_entity_id');
  if (isUnderservedPersona) criteriaMet.push('underserved_persona');
  if (isFastExecutableFormat) criteriaMet.push('fast_executable_format');
  return Object.freeze({ criteriaMet, count: criteriaMet.length });
}
