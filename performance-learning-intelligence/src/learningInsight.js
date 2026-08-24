// learningInsight.js — Contrato LearningInsight (Fase 12, §6) + conexión con
// Viral Content Intelligence (§8) + StrategyInput (§9).
//
// Nunca afirma causalidad: "presentan una métrica superior al baseline en
// esta muestra", nunca "esto causa X" o "esto garantiza Y". direction usa el
// mismo vocabulario neutro de PerformanceSignal (ABOVE_BASELINE/etc.) —
// nunca introduce la palabra "viral".

import { randomUUID } from 'node:crypto';
import { SIGNAL_TYPES } from './performanceSignal.js';

function assertNonEmptyArray(value, field) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`LearningInsight: "${field}" debe ser un arreglo no vacío — ningún insight puede carecer de evidencia real trazable.`);
}

const CAUSAL_PHRASES = [/\bcausa\b/i, /\bgarantiza\b/i, /\bconvierte mejor\b/i, /\bhace viral\b/i];

function assertNoCausalLanguage(text, field) {
  for (const pattern of CAUSAL_PHRASES) {
    if (pattern.test(text)) throw new Error(`LearningInsight: "${field}" contiene lenguaje causal prohibido (coincide con ${pattern}) — un insight solo describe lo observado en la muestra, nunca afirma causalidad.`);
  }
}

export function createLearningInsight({
  dimension,
  pattern,
  evidence,
  based_on_content_ids,
  based_on_performance_observation_ids,
  based_on_signal_ids,
  scope,
  direction,
  confidence,
  confidence_basis,
  external_reference = null, // §8: { source_module: 'viral_content_intelligence', content_opportunity_id }
}) {
  if (!dimension) throw new Error('LearningInsight: "dimension" es obligatorio.');
  if (!pattern) throw new Error('LearningInsight: "pattern" es obligatorio.');
  if (!evidence) throw new Error('LearningInsight: "evidence" es obligatorio — nunca un insight sin describir en qué se basa.');
  assertNoCausalLanguage(evidence, 'evidence');
  assertNonEmptyArray(based_on_content_ids, 'based_on_content_ids');
  assertNonEmptyArray(based_on_performance_observation_ids, 'based_on_performance_observation_ids');
  assertNonEmptyArray(based_on_signal_ids, 'based_on_signal_ids');
  if (!scope) throw new Error('LearningInsight: "scope" es obligatorio (ej. "own_content_sample (N=10)").');
  if (!SIGNAL_TYPES.includes(direction)) throw new Error(`LearningInsight: "direction" inválida "${direction}" (válidas: ${SIGNAL_TYPES.join(', ')})`);
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) throw new Error('LearningInsight: "confidence" debe estar en [0,1].');
  if (!confidence_basis) throw new Error('LearningInsight: "confidence_basis" es obligatorio.');
  if (external_reference && external_reference.source_module !== 'viral_content_intelligence') {
    throw new Error('LearningInsight: "external_reference.source_module" solo soporta "viral_content_intelligence" en este MVP.');
  }

  return Object.freeze({
    insight_id: randomUUID(),
    dimension,
    pattern,
    evidence,
    based_on_content_ids,
    based_on_performance_observation_ids,
    based_on_signal_ids,
    scope,
    direction,
    confidence,
    confidence_basis,
    basis: 'INFERENCIA',
    requires_human_review: true,
    external_reference,
    created_at: new Date().toISOString(),
  });
}

/**
 * §9: combina un patrón EXTERNO (ej. de Viral Content Intelligence) con un
 * aprendizaje PROPIO ya validado (un LearningInsight real) en un
 * strategy_input — una recomendación experimental, nunca una garantía.
 * Deliberadamente NO genera nada de forma masiva: una llamada = un
 * strategy_input, para un par patrón-externo/insight-propio ya elegido por
 * el llamador.
 */
export function createStrategyInput({ external_pattern, own_insight }) {
  if (!external_pattern || !external_pattern.description) {
    throw new Error('StrategyInput: "external_pattern.description" es obligatorio.');
  }
  if (!own_insight || !own_insight.insight_id) {
    throw new Error('StrategyInput: "own_insight" debe ser un LearningInsight real ya generado, nunca uno inventado aquí.');
  }

  const text = `Patrón externo observado ("${external_pattern.description}") coincide con un aprendizaje propio (${own_insight.dimension} → "${own_insight.pattern}", ${own_insight.direction}, ${own_insight.scope}). Recomendación experimental: priorizar pruebas en esta línea — no es una garantía de resultado.`;

  return Object.freeze({
    strategy_input_id: randomUUID(),
    strategy_input: text,
    based_on_external_pattern: { description: external_pattern.description, source_module: 'viral_content_intelligence', content_opportunity_id: external_pattern.content_opportunity_id ?? null },
    based_on_insight_id: own_insight.insight_id,
    requires_human_review: true,
    basis: 'HIPOTESIS', // es una recomendación de estrategia, no un hecho verificado
    created_at: new Date().toISOString(),
  });
}
