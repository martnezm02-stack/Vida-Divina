// contentBrief.js — Contrato de ContentBrief (Fase 7).
//
// El ContentBrief es el ÚNICO artefacto genuinamente nuevo de esta fase (ver
// informe de arquitectura, Fase 6 §11). Todo lo que ya existe como dimensión
// en marketing-intelligence (audiencia, problema, deseo, promesa, mecanismo,
// objeciones, prueba social, CTA) o en Website Intelligence (estructura,
// patrones de diseño/conversión) se REFERENCIA por id — nunca se copia como
// texto libre dentro del brief. Los únicos campos de texto libre son
// decisiones genuinamente nuevas que no existen en ningún lado todavía
// (objective, main_message, constraints).
//
// page_type distingue el tipo de página SIN duplicar la estructura del
// contrato (§12 del encargo) — es un solo campo, no un contrato distinto por
// tipo de página.

import { randomUUID } from 'node:crypto';

export const PAGE_TYPES = Object.freeze(['sitio_principal', 'pagina_producto', 'landing_campana', 'otro']);

const REFERENCE_MODULES = Object.freeze(['marketing_intelligence', 'website_intelligence']);
const REFERENCE_TYPES = Object.freeze(['observation', 'inference', 'hypothesis']);

/**
 * PatternReference — apunta a UN registro ya existente en marketing-intelligence
 * o website-intelligence. Nunca copia el contenido de ese registro, solo su
 * identidad + la razón por la que se eligió para esta página (§10: "¿por qué
 * estamos utilizando este patrón?" debe tener respuesta explícita, nunca una
 * decisión "mágica" del agente).
 */
export function createPatternReference({ source_module, reference_type, reference_id, rationale }) {
  if (!REFERENCE_MODULES.includes(source_module)) {
    throw new Error(`PatternReference: source_module inválido "${source_module}"`);
  }
  if (!REFERENCE_TYPES.includes(reference_type)) {
    throw new Error(`PatternReference: reference_type inválido "${reference_type}"`);
  }
  if (!reference_id) throw new Error('PatternReference: reference_id es obligatorio.');
  if (!rationale || rationale.trim().length === 0) {
    throw new Error('PatternReference: rationale es obligatorio — ninguna referencia puede quedar sin justificar por qué se eligió.');
  }
  return Object.freeze({ source_module, reference_type, reference_id, rationale });
}

/**
 * ClaimReference — política de claims idéntica a la de marketing-intelligence
 * (§11 del encargo). Nunca se instancia con verified_by_vida_divina=true ni
 * requires_human_review=false — esos dos campos no son parámetros de entrada,
 * son constantes fijas de la función, precisamente para que ningún llamador
 * pueda "saltarse" la política por accidente.
 */
export function createClaimReference({ claim_text, claim_type, source_claim_id = null }) {
  if (!claim_text) throw new Error('ClaimReference: claim_text es obligatorio.');
  if (!claim_type) throw new Error('ClaimReference: claim_type es obligatorio.');
  return Object.freeze({
    claim_text,
    claim_type,
    source_claim_id,
    verified_by_vida_divina: false,
    requires_human_review: true,
  });
}

export function createContentBrief(fields) {
  const {
    page_type,
    objective,
    product_ref = null,
    audience = [],
    problem = [],
    desire = [],
    promise = [],
    mechanism = [],
    objections = [],
    social_proof = [],
    offer = null,
    cta = [],
    main_message,
    structure_refs = [],
    design_pattern_refs = [],
    design_system_ref = null,
    constraints = [],
    claims = [],
  } = fields;

  if (!PAGE_TYPES.includes(page_type)) throw new Error(`ContentBrief: page_type inválido "${page_type}"`);
  if (!objective) throw new Error('ContentBrief: "objective" es obligatorio.');
  if (!main_message) throw new Error('ContentBrief: "main_message" es obligatorio.');

  for (const list of [audience, problem, desire, promise, mechanism, objections, social_proof, cta, structure_refs, design_pattern_refs]) {
    if (!Array.isArray(list)) throw new Error('ContentBrief: los campos de referencias deben ser arreglos de PatternReference.');
  }

  return Object.freeze({
    content_brief_id: randomUUID(),
    page_type,
    objective,
    product_ref,
    audience,
    problem,
    desire,
    promise,
    mechanism,
    objections,
    social_proof,
    offer, // { description: string, pattern_refs: PatternReference[] } | null — el precio/condiciones reales son decisión de Vida Divina, no un patrón observado
    cta,
    main_message,
    structure_refs,
    design_pattern_refs,
    design_system_ref, // null mientras no exista un Design System real de Vida Divina (Fase 6 §14) — solo el mecanismo para referenciarlo cuando exista
    constraints,
    claims,
    // Fijo en true SIEMPRE: ningún ContentBrief se considera listo para pasar
    // a Information Architecture sin que un humano lo revise — sin importar
    // cuántas referencias tenga o cuán completo parezca.
    requires_human_review: true,
    created_at: new Date().toISOString(),
  });
}
