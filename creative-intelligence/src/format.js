// format.js — Pillar 4: Format & Diversity Decision.
// Prompt 7 (Format-to-Angle Matcher) + Prompt 8 (Andromeda Structural
// Diversity Check).
//
// FRAMEWORK ORIGINAL, principio central: FORMAT IS DISTRIBUTION STRATEGY,
// no producción decorativa. Match format al angle — nunca al default de
// marca (FORMAT_LIBRARY es la lista cerrada del framework; no se inventan
// formatos nuevos aquí).

import { randomUUID } from 'node:crypto';

export const FORMAT_LIBRARY = Object.freeze([
  'Podcast clip',
  'Pharmacist / authority figure in-studio',
  'Street interview / vox-pop with authority reveal',
  'POV personal story',
  'Skit conversation',
  'Long-form yapper / VSL',
  'Educational walk-and-talk',
  'Spokesperson / debate',
  'Static comparison frames',
  'Native TikTok-style',
]);

// 'distributor'/'celebrity', 'product environment' y 'handheld'/'UNKNOWN'
// se agregaron en la Fase "Incorporar y Normalizar Competitive Evidence" —
// necesarios para representar con fidelidad structural signatures REALES
// observadas en contenido de competidores (ej. un distribuidor de Fuxion
// narrando desde su casa) que el framework original, pensado para
// decisiones propias de Vida Divina, no anticipaba. Extensión puramente
// aditiva: ningún valor existente se renombró ni se quitó, así que
// createFormatDecision()/AbstractionRecord siguen validando exactamente
// igual para todo el código anterior a esta fase.
export const NARRATOR_TYPES = Object.freeze(['creator', 'expert', 'actor', 'multi-actor', 'distributor', 'celebrity', 'UNKNOWN']);
export const SCENE_SETUPS = Object.freeze(['studio', 'outdoor', 'home', 'pharmacy', 'street', 'product environment', 'UNKNOWN']);
export const EDIT_RHYTHMS = Object.freeze(['slow cut', 'fast cut', 'single-take', 'multi-scene', 'handheld', 'UNKNOWN']);

function assertStructuralSignature(signature) {
  if (!signature) throw new Error('Format: "structuralSignature" es obligatorio (Prompt 8).');
  if (!NARRATOR_TYPES.includes(signature.narratorType)) {
    throw new Error(`Format: structuralSignature.narratorType inválido "${signature.narratorType}" (válidos: ${NARRATOR_TYPES.join(', ')}).`);
  }
  if (!SCENE_SETUPS.includes(signature.sceneSetup)) {
    throw new Error(`Format: structuralSignature.sceneSetup inválido "${signature.sceneSetup}" (válidos: ${SCENE_SETUPS.join(', ')}).`);
  }
  if (!EDIT_RHYTHMS.includes(signature.editRhythm)) {
    throw new Error(`Format: structuralSignature.editRhythm inválido "${signature.editRhythm}" (válidos: ${EDIT_RHYTHMS.join(', ')}).`);
  }
}

export function createFormatDecision({
  angleId,
  recommendedFormat,
  justification,
  alternativeFormat = null,
  whyBeatsDefault,
  castingNotes = null,
  settingNotes = null,
  energy = null,
  structuralSignature,
}) {
  if (!angleId) throw new Error('Format: "angleId" es obligatorio — un Format siempre se decide para un Angle específico (Prompt 7: match format al angle, no al default de marca).');
  if (!FORMAT_LIBRARY.includes(recommendedFormat)) {
    throw new Error(`Format: "recommendedFormat" no está en la Format Library del framework (${recommendedFormat}).`);
  }
  if (!justification?.trim()) throw new Error('Format: "justification" es obligatorio (one-sentence justification, Prompt 7).');
  if (alternativeFormat && !FORMAT_LIBRARY.includes(alternativeFormat)) {
    throw new Error(`Format: "alternativeFormat" no está en la Format Library del framework (${alternativeFormat}).`);
  }
  if (!whyBeatsDefault?.trim()) throw new Error('Format: "whyBeatsDefault" es obligatorio (Prompt 7).');
  assertStructuralSignature(structuralSignature);

  return Object.freeze({
    formatId: randomUUID(),
    angleId,
    recommendedFormat,
    justification,
    alternativeFormat,
    whyBeatsDefault,
    castingNotes,
    settingNotes,
    energy,
    structuralSignature: Object.freeze({ ...structuralSignature }),
    createdAt: new Date().toISOString(),
  });
}

export function validateFormatDecision(decision) {
  createFormatDecision(decision);
  return true;
}

/**
 * Prompt 8 — Andromeda Structural Diversity Check. Clusteriza las
 * structuralSignature de un conjunto de FormatDecision y calcula el riesgo
 * exactamente con los umbrales del framework: LOW 5+ signatures distintas,
 * MEDIUM 2–4, HIGH 1–2 dominan 80%+.
 */
export function computeAndromedaRisk(formatDecisions) {
  if (!Array.isArray(formatDecisions) || formatDecisions.length === 0) {
    throw new Error('computeAndromedaRisk: se requiere al menos un FormatDecision.');
  }

  const signatureCounts = new Map();
  for (const decision of formatDecisions) {
    const key = JSON.stringify(decision.structuralSignature);
    signatureCounts.set(key, (signatureCounts.get(key) ?? 0) + 1);
  }

  const distinctCount = signatureCounts.size;
  const total = formatDecisions.length;
  const maxShare = Math.max(...signatureCounts.values()) / total;
  const top2Share = [...signatureCounts.values()].sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0) / total;

  // Orden de evaluación importa: el umbral de dominancia (HIGH) se checa
  // ANTES que el rango general 2-4 (MEDIUM), porque "1-2 dominan 80%+" es
  // un caso más específico que se solapa con ese rango en distinctCount=2.
  let risk;
  if (distinctCount === 1) {
    risk = 'HIGH';
  } else if (distinctCount === 2 && top2Share >= 0.8) {
    risk = 'HIGH';
  } else if (distinctCount >= 2 && distinctCount <= 4) {
    risk = 'MEDIUM';
  } else {
    risk = 'LOW'; // distinctCount >= 5
  }

  return Object.freeze({
    risk,
    distinctSignatureCount: distinctCount,
    totalDecisions: total,
    dominantShare: Math.max(maxShare, top2Share),
    // Prompt 8: para Medium/High, identificar celdas que necesitan structural breaks.
    needsStructuralBreak: risk !== 'LOW',
  });
}
