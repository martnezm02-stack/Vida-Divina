// contentOpportunity.js — ContentOpportunity (Fase 11, §12).
//
// Conecta un patrón observado en la muestra (market_pattern) con una señal de
// rendimiento opcional (performance_signal) y una hipótesis (hypothesis),
// añadiendo una inferencia SEPARADA y explícita de por qué podría ser
// relevante para Vida Divina (vida_divina_relevance) — nunca copiando la
// solución del video externo, nunca afirmando que el patrón "funciona" o
// "es viral". requires_human_review es una constante fija, igual que
// createClaimReference en website-intelligence — no puede sobreescribirse
// por accidente.

import { randomUUID } from 'node:crypto';

function assertNonEmptyArray(value, fieldName) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`ContentOpportunity: "${fieldName}" debe ser un arreglo no vacío — ninguna oportunidad puede carecer de evidencia real que la respalde.`);
  }
}

export function createContentOpportunity({
  market_pattern,
  performance_signal = null,
  source_observation_ids,
  hypothesis,
  vida_divina_relevance,
}) {
  if (!market_pattern || !market_pattern.description) {
    throw new Error('ContentOpportunity: "market_pattern" es obligatorio y debe incluir "description" — no se puede referenciar un patrón sin describirlo.');
  }
  assertNonEmptyArray(source_observation_ids, 'source_observation_ids');
  if (!hypothesis || !hypothesis.hypothesis_id) {
    throw new Error('ContentOpportunity: "hypothesis" es obligatorio y debe incluir "hypothesis_id" — toda oportunidad debe apuntar a una hipótesis real ya generada, nunca a una nueva inventada aquí.');
  }
  if (!vida_divina_relevance || !vida_divina_relevance.relation_to_primary_context) {
    throw new Error('ContentOpportunity: "vida_divina_relevance.relation_to_primary_context" es obligatorio — la relevancia para Vida Divina es una inferencia separada, nunca implícita.');
  }
  if (performance_signal !== null && typeof performance_signal.metric_value !== 'number') {
    throw new Error('ContentOpportunity: si se incluye "performance_signal", debe traer un "metric_value" numérico real (nunca inventado).');
  }

  return Object.freeze({
    content_opportunity_id: randomUUID(),
    market_pattern: {
      description: market_pattern.description,
      dimension: market_pattern.dimension ?? null,
      frequency: market_pattern.frequency ?? null,
      scope: market_pattern.scope ?? null,
      inference_id: market_pattern.inference_id ?? null,
    },
    performance_signal, // null es válido: no todo patrón tiene una señal de rendimiento vinculada
    source_observation_ids,
    hypothesis: { hypothesis_id: hypothesis.hypothesis_id, text: hypothesis.text ?? hypothesis.hypothesis ?? null },
    vida_divina_relevance: {
      relation_to_primary_context: vida_divina_relevance.relation_to_primary_context,
      product_ref: vida_divina_relevance.product_ref ?? null,
      risk_note: vida_divina_relevance.risk_note ?? 'Ninguna: esta relevancia es una hipótesis de posicionamiento, no una afirmación de eficacia ni de rendimiento comercial.',
    },
    // Constante fija — igual que createClaimReference en website-intelligence,
    // no se acepta como parámetro para que nadie pueda pasar false por error.
    requires_human_review: true,
    created_at: new Date().toISOString(),
  });
}
