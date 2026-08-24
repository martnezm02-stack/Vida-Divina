// angle.js — Pillar 3: Angles per Awareness Level.
// Prompt 5 (Angle Generator) + Prompt 6 (Empty-Cell Warning Check).
//
// FRAMEWORK ORIGINAL, principio central: awareness describe QUÉ DICE EL
// SCRIPT — nunca personality, customer IQ, mindset ni identidad de la
// persona (ver awareness.js). El mismo persona + mismo pain puede producir
// distintos angles según lo que el script deba hacer. Pain stays
// consistent — angle changes.
//
// Un Angle NO es un Hook: un Hook (Prompt 10, ProductionBrief) es solo la
// dirección de apertura de 3 segundos. Un Angle exige, además del texto,
// una dirección de guion completa (scriptDirection) y un anclaje explícito
// al Pain que interpreta (painAnchor) — createAngle() rechaza cualquier
// objeto que tenga forma de "solo un hook" (le falten esos dos campos).

import { randomUUID } from 'node:crypto';
import { AWARENESS_STAGES, assertValidAwarenessStage } from './awareness.js';

export const EMPTY_CELL_REASONS = Object.freeze(['CATEGORY_GAP', 'PERSONA_MIS_DEFINED']);

export function createAngle({
  personaId,
  painId,
  awarenessStage,
  angleText,
  scriptDirection,
  painAnchor,
  urgencyMechanic = null,
}) {
  if (!personaId) throw new Error('Angle: "personaId" es obligatorio.');
  if (!painId) throw new Error('Angle: "painId" es obligatorio.');
  assertValidAwarenessStage(awarenessStage);
  if (!angleText?.trim()) throw new Error('Angle: "angleText" es obligatorio (una sola línea, Prompt 5).');
  if (!scriptDirection?.trim()) {
    throw new Error('Angle: "scriptDirection" es obligatorio — un Angle no es un Hook: necesita dirección de guion completa, no solo una apertura de 3 segundos (ver ProductionBrief.hookDirection).');
  }
  if (!painAnchor?.trim()) {
    throw new Error('Angle: "painAnchor" es obligatorio — el pain debe permanecer identificable y constante mientras el angle cambia (regla central de Pillar 3).');
  }
  if (awarenessStage === 'Most Aware' && !urgencyMechanic?.trim()) {
    throw new Error('Angle: "urgencyMechanic" es obligatorio para el stage "Most Aware" (Prompt 5).');
  }

  return Object.freeze({
    angleId: randomUUID(),
    personaId,
    painId,
    awarenessStage,
    angleText,
    scriptDirection,
    painAnchor,
    urgencyMechanic,
    isEmptyCell: false,
    emptyCellReason: null,
    createdAt: new Date().toISOString(),
  });
}

export function validateAngle(angle) {
  createAngle(angle);
  return true;
}

/**
 * Prompt 5: "tolerar empty cells. NO forzar un Unaware angle cuando
 * realmente no existe." Representa una celda vacía del grid persona ×
 * awareness — nunca un Angle inventado.
 */
export function createEmptyCell({ personaId, painId, awarenessStage, reason }) {
  if (!EMPTY_CELL_REASONS.includes(reason)) {
    throw new Error(`createEmptyCell: "reason" inválido "${reason}" (válidos: ${EMPTY_CELL_REASONS.join(', ')}).`);
  }
  assertValidAwarenessStage(awarenessStage);
  return Object.freeze({
    angleId: null,
    personaId,
    painId,
    awarenessStage,
    isEmptyCell: true,
    emptyCellReason: reason,
    // Prompt 6: si la causa es PERSONA_MIS_DEFINED, la celda debe marcarse
    // para re-cutting en Pillar 1 — este flag es lo que Persona/§ consume.
    flagForPillar1Recut: reason === 'PERSONA_MIS_DEFINED',
  });
}

/**
 * Prompt 6 — Empty-Cell Warning Check: detecta cuando un angle marcado
 * "Unaware" en realidad describe Problem/Solution Aware. No decide sola —
 * expone la comparación para que un analista aplique el diagnóstico.
 */
export function diagnoseEmptyCell({ awarenessStage, angleText, appearsToDescribeStage }) {
  assertValidAwarenessStage(awarenessStage);
  if (!appearsToDescribeStage) return null; // sin evidencia de discrepancia, no hay diagnóstico que hacer.
  assertValidAwarenessStage(appearsToDescribeStage);
  if (awarenessStage === appearsToDescribeStage) return null;
  return {
    declaredStage: awarenessStage,
    actualAppearsToBe: appearsToDescribeStage,
    diagnosis: 'CATEGORY_GAP', // por defecto — PERSONA_MIS_DEFINED se determina aparte (ver evaluateSubPersonaSplit en persona.js)
  };
}

/**
 * Construye el grid completo persona × awareness (Prompt 6: "clean angle
 * map, persona × awareness grid"). Acepta una lista mixta de Angle y
 * celdas vacías ya creadas — no genera contenido, solo organiza.
 */
export function buildAngleGrid(entries) {
  const grid = {};
  for (const stage of AWARENESS_STAGES) grid[stage] = null;
  for (const entry of entries) {
    assertValidAwarenessStage(entry.awarenessStage);
    grid[entry.awarenessStage] = entry;
  }
  return grid;
}
