// awareness.js — Pillar 3 (Angles per Awareness Level), principio central.
//
// FRAMEWORK ORIGINAL: los 5 awareness levels son fijos, en este orden
// exacto. Awareness describe QUÉ DICE EL SCRIPT — nunca personality,
// customer IQ, mindset ni identidad de la persona. Este archivo existe
// separado de persona.js precisamente para que sea estructuralmente
// imposible definir una Persona usando un valor de awareness (ver
// persona.js — Persona no tiene ningún campo de awareness).

export const AWARENESS_STAGES = Object.freeze([
  'Unaware',
  'Problem Aware',
  'Solution Aware',
  'Product Aware',
  'Most Aware',
]);

export function isValidAwarenessStage(stage) {
  return AWARENESS_STAGES.includes(stage);
}

export function assertValidAwarenessStage(stage) {
  if (!isValidAwarenessStage(stage)) {
    throw new Error(`awareness: "${stage}" no es uno de los 5 awareness levels del framework (${AWARENESS_STAGES.join(', ')}).`);
  }
}
