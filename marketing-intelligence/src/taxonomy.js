// taxonomy.js — Taxonomía de Marketing Intelligence (Fase 3).
//
// Fuente única de verdad de qué dimensiones existen. El agente y sus
// detectores (heurísticos hoy, un LLM real más adelante) deben usar estas
// constantes — nunca strings sueltos inventados en cada archivo.
//
// No todo contenido produce evidencia para todas las dimensiones. Ausencia de
// evidencia se representa con NOT_DETECTED, nunca inventando un valor.

export const DIMENSIONS = Object.freeze([
  'HOOK',
  'ANGLE',
  'PROBLEM',
  'DESIRE',
  'PROMISE',
  'MECHANISM',
  'OBJECTION',
  'CTA',
  'AUDIENCE',
  'OFFER',
  'SOCIAL_PROOF',
  'FORMAT',
  'NARRATIVE_STRUCTURE',
  'EMOTIONAL_TRIGGER',
  'PAIN_POINT',
  'BENEFIT',
  'URGENCY',
  'AUTHORITY',
  'CURIOSITY_GAP',
]);

// PATTERN y TREND no son dimensiones por-documento: son resultados agregados
// (Etapa B / cruce entre corridas) que produce el pipeline, no el detector.
// Ver src/pipeline/inference.js (PATTERN = Inferencia agregada) y
// src/pipeline/trend.js (TREND = comparación de Inferencias entre corridas).
export const AGGREGATE_CONCEPTS = Object.freeze(['PATTERN', 'TREND']);

export const NOT_DETECTED = 'not_detected';

export function isValidDimension(dimension) {
  return DIMENSIONS.includes(dimension);
}

// Cobertura real de detección basada en reglas en esta fase (v0.1, sin LLM
// real conectado todavía). Documentado explícitamente para no fingir
// capacidad que el sistema no tiene — ver LIMITACIONES en el reporte final.
export const RULE_BASED_COVERAGE = Object.freeze({
  fully_detected: ['HOOK', 'CTA', 'URGENCY', 'AUTHORITY', 'SOCIAL_PROOF', 'OFFER', 'CURIOSITY_GAP', 'FORMAT'],
  partially_detected: ['ANGLE', 'PROBLEM', 'PAIN_POINT', 'DESIRE', 'BENEFIT', 'PROMISE', 'MECHANISM', 'OBJECTION', 'EMOTIONAL_TRIGGER', 'AUDIENCE'],
  not_detected_by_rules: ['NARRATIVE_STRUCTURE'],
});
