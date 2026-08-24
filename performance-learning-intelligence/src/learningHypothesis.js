// learningHypothesis.js — Contrato LearningHypothesis (Fase 12, §7).
//
// Mismo principio que hypothesis.js en marketing-intelligence: toda
// hipótesis es explícitamente especulativa (basis:"HIPOTESIS",
// requires_human_review:true) y SIEMPRE incluye testable_prediction — para
// que en una fase futura pueda comprobarse con datos reales, nunca se
// presenta como un hecho ya demostrado.

import { randomUUID } from 'node:crypto';

const CAUSAL_PHRASES = [/\bcausa\b/i, /\bgarantiza\b/i, /\bconvierte mejor\b/i, /\bhace viral\b/i];

function assertNoCausalLanguage(text, field) {
  for (const pattern of CAUSAL_PHRASES) {
    if (pattern.test(text)) throw new Error(`LearningHypothesis: "${field}" contiene lenguaje causal prohibido — una hipótesis nunca se presenta como hecho.`);
  }
}

export function createLearningHypothesis({ dimension, hypothesis, based_on_insight_id, testable_prediction }) {
  if (!dimension) throw new Error('LearningHypothesis: "dimension" es obligatorio.');
  if (!hypothesis) throw new Error('LearningHypothesis: "hypothesis" es obligatorio.');
  assertNoCausalLanguage(hypothesis, 'hypothesis');
  if (!based_on_insight_id) throw new Error('LearningHypothesis: "based_on_insight_id" es obligatorio — toda hipótesis debe originarse en un LearningInsight real.');
  if (!testable_prediction) throw new Error('LearningHypothesis: "testable_prediction" es obligatorio — sin ella la hipótesis no podría comprobarse después.');
  assertNoCausalLanguage(testable_prediction, 'testable_prediction');

  return Object.freeze({
    hypothesis_id: randomUUID(),
    dimension,
    hypothesis,
    based_on_insight_id,
    testable_prediction,
    requires_human_review: true,
    basis: 'HIPOTESIS',
    created_at: new Date().toISOString(),
  });
}
