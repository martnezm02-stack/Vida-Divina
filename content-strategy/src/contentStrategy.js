// contentStrategy.js — Contrato ContentStrategy (Fase 13, §3 y §12-13).
//
// Combina tres señales (market_pattern_refs, viral_pattern_refs,
// learning_refs) — NUNCA como una suma numérica arbitraria, solo como
// listas de referencias trazables con su propio rationale. Toda hipótesis
// de aprendizaje propio (Performance & Learning) se conserva como
// recomendación experimental (§13): esta función RECHAZA cualquier
// recommended_hooks/formats/angles que venga acompañado de lenguaje de
// regla absoluta ("always", "siempre usar", "nunca usar otro").

import { randomUUID } from 'node:crypto';
import { isValidPillar } from './contentPillars.js';

const ABSOLUTE_RULE_PHRASES = [/\bsiempre usar\b/i, /\balways use\b/i, /\bnunca usar otro\b/i, /\bobligatorio usar\b/i];

function assertNoAbsoluteRules(list, field) {
  for (const item of list) {
    for (const pattern of ABSOLUTE_RULE_PHRASES) {
      if (pattern.test(item)) {
        throw new Error(`ContentStrategy: "${field}" contiene lenguaje de regla absoluta ("${item}") — el aprendizaje propio nunca se convierte en regla fija, solo en prioridad experimental (§13).`);
      }
    }
  }
}

function assertAllReferencesOfModule(refs, moduleName, fieldName) {
  for (const ref of refs) {
    if (ref.source_module !== moduleName) {
      throw new Error(`ContentStrategy: "${fieldName}" solo acepta referencias de source_module "${moduleName}" — se recibió "${ref.source_module}".`);
    }
  }
}

export function createContentStrategy({
  objective,
  product_ref,
  audience_refs = [],
  market_pattern_refs = [],
  viral_pattern_refs = [],
  learning_refs = [],
  content_pillars,
  recommended_formats = [],
  recommended_hooks = [],
  recommended_angles = [],
  experiments = [],
  constraints = [],
}) {
  if (!objective) throw new Error('ContentStrategy: "objective" es obligatorio.');
  if (!product_ref) throw new Error('ContentStrategy: "product_ref" es obligatorio — toda estrategia debe anclarse a un producto real del catálogo (PRIMARY PRODUCT CONTEXT).');
  if (!Array.isArray(content_pillars) || content_pillars.length === 0) throw new Error('ContentStrategy: "content_pillars" debe ser un arreglo no vacío.');
  for (const pillar of content_pillars) {
    if (!isValidPillar(pillar)) throw new Error(`ContentStrategy: pilar inválido "${pillar}".`);
  }

  assertAllReferencesOfModule(market_pattern_refs, 'marketing_intelligence', 'market_pattern_refs');
  assertAllReferencesOfModule(viral_pattern_refs, 'viral_content_intelligence', 'viral_pattern_refs');
  assertAllReferencesOfModule(learning_refs, 'performance_learning_intelligence', 'learning_refs');

  assertNoAbsoluteRules(recommended_hooks, 'recommended_hooks');
  assertNoAbsoluteRules(recommended_formats, 'recommended_formats');
  assertNoAbsoluteRules(recommended_angles, 'recommended_angles');

  const source_references = [...market_pattern_refs, ...viral_pattern_refs, ...learning_refs];
  if (source_references.length === 0) {
    throw new Error('ContentStrategy: se requiere al menos una referencia real (market_pattern_refs, viral_pattern_refs o learning_refs) — nunca una estrategia sin evidencia trazable.');
  }

  return Object.freeze({
    strategy_id: randomUUID(),
    objective,
    product_ref,
    audience_refs,
    market_pattern_refs,
    viral_pattern_refs,
    learning_refs,
    content_pillars,
    recommended_formats,
    recommended_hooks,
    recommended_angles,
    experiments, // ids de ContentExperiment ya creados — nunca se embebe el objeto completo aquí
    constraints,
    // Constante fija — igual criterio que createClaimReference en
    // website-intelligence: ningún llamador puede relajar esta política.
    claims_policy: Object.freeze({ default_status: 'UNVERIFIED', requires_human_review: true }),
    source_references,
    requires_human_review: true,
    created_at: new Date().toISOString(),
  });
}
