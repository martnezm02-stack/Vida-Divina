// claimClassification.js — Fase 15, §3-4. Distingue explícitamente PRODUCT
// FACT / MARKETING PATTERN / GENERATED CLAIM — nunca asume que un patrón de
// mercado equivale a un hecho o a un claim de producto.

import { detectPhysiologicalClaim } from './physiologicalClaimGuard.js';
import { findSupportingProductFact } from './productTruth.js';
import { detectCausalLanguage, detectInventedCertainty } from './textSafetyChecks.js';

export const CLAIM_CATEGORIES = Object.freeze([
  'SUPPORTED_PRODUCT_FACT',
  'MARKETING_LANGUAGE',
  'UNSUPPORTED_CLAIM',
  'HEALTH_CLAIM_REQUIRES_REVIEW',
  'OPINION',
  'QUESTION',
  'CTA',
]);

const CTA_PATTERNS = [/^conoce\b/i, /^descubre\b/i, /^lee más\b/i, /^compara\b/i, /^visita\b/i, /^suscríbete\b/i];

/**
 * Clasifica UN fragmento de texto (bloque de scene_structure, hook o
 * caption — nunca el draft completo de una sola vez, para que cada
 * afirmación tenga su propia clasificación explicable). Nunca lanza —
 * siempre devuelve una categoría, aunque sea HEALTH_CLAIM_REQUIRES_REVIEW
 * por defecto ante la duda (§14: "es preferible REQUIRES_HUMAN_REVIEW que
 * una afirmación incorrecta").
 */
export function classifyClaim({ text, productFacts, isCta = false }) {
  if (!text || !text.trim()) return { text, category: 'OPINION', reasoning: 'texto vacío o nulo, sin afirmación que clasificar' };

  // Orden de precedencia DELIBERADO (Fase 15, corregido tras auditoría real):
  // 1) causalidad/certeza inventada (lo más severo) y 2) lenguaje fisiológico
  // se evalúan ANTES que CTA/QUESTION — una pregunta o un CTA pueden ocultar
  // un claim de salud ("¿Sabías que esto elimina toxinas?" sigue siendo un
  // claim fisiológico aunque termine en "?"). Clasificar por forma
  // (pregunta/CTA) antes que por contenido dejaría pasar exactamente lo que
  // este módulo existe para atrapar.
  if (detectCausalLanguage(text) || detectInventedCertainty(text)) {
    return { text, category: 'UNSUPPORTED_CLAIM', reasoning: 'contiene lenguaje de causalidad o de certeza no verificada — no puede pasar como hecho ni como lenguaje de marketing seguro.' };
  }

  const physio = detectPhysiologicalClaim(text);
  if (physio.matched && !physio.negated) {
    return { text, category: 'HEALTH_CLAIM_REQUIRES_REVIEW', reasoning: `contiene lenguaje fisiológico ("${physio.term}") sin una negación/disclaimer claro en el mismo texto — nunca se clasifica como hecho respaldado sin evidencia primaria explícita.` };
  }

  if (isCta || CTA_PATTERNS.some((p) => p.test(text.trim()))) {
    return { text, category: 'CTA', reasoning: 'texto identificado como llamada a la acción, no como afirmación sobre el producto.' };
  }
  if (text.trim().endsWith('?')) {
    return { text, category: 'QUESTION', reasoning: 'termina en signo de pregunta y no contiene lenguaje fisiológico/causal sin marcar — invita a la reflexión, no afirma un hecho.' };
  }

  const supportingFact = findSupportingProductFact(text, productFacts);
  if (physio.matched && physio.negated && supportingFact) {
    return { text, category: 'MARKETING_LANGUAGE', reasoning: `menciona "${physio.term}" pero con una negación/disclaimer explícito en el mismo texto, y coincide con un ProductFact real (${supportingFact.field}) — se trata como lenguaje de marketing prudente, no como claim de salud sin marcar.`, supporting_fact_id: supportingFact.fact_id };
  }
  if (physio.matched && physio.negated) {
    // Negado pero SIN respaldo de un ProductFact real: el detector no puede
    // confirmar con confianza que es seguro — ante la duda, se mantiene en revisión.
    return { text, category: 'HEALTH_CLAIM_REQUIRES_REVIEW', reasoning: `contiene lenguaje fisiológico ("${physio.term}") con una posible negación, pero sin un ProductFact real que lo respalde — el detector no puede confirmarlo con confianza suficiente.` };
  }

  if (supportingFact) {
    return { text, category: 'SUPPORTED_PRODUCT_FACT', reasoning: `coincide con un ProductFact real (${supportingFact.field}: "${supportingFact.value}") — respaldado por ${supportingFact.source_document}.`, supporting_fact_id: supportingFact.fact_id };
  }

  // Sin respaldo de un ProductFact, sin lenguaje fisiológico ni causal: es
  // lenguaje editorial/de marketing genérico (ej. el disclaimer estándar del
  // generador), nunca se asume que es un hecho.
  return { text, category: 'MARKETING_LANGUAGE', reasoning: 'lenguaje editorial/experimental genérico, sin afirmación fisiológica ni respaldo directo de un ProductFact — no se asume como hecho.' };
}

/** Clasifica todos los bloques relevantes de un ContentDraft (hook, body, caption, scene_structure). */
export function classifyDraft(draft, productFacts) {
  const pieces = [];
  if (draft.hook) pieces.push({ field: 'hook', ...classifyClaim({ text: draft.hook, productFacts }) });
  if (draft.body) pieces.push({ field: 'body', ...classifyClaim({ text: draft.body, productFacts }) });
  if (draft.caption) pieces.push({ field: 'caption', ...classifyClaim({ text: draft.caption, productFacts }) });
  if (draft.cta) pieces.push({ field: 'cta', ...classifyClaim({ text: draft.cta, productFacts, isCta: true }) });
  for (const block of draft.scene_structure ?? []) {
    if (block.content) pieces.push({ field: `scene_structure.${block.block}`, ...classifyClaim({ text: block.content, productFacts, isCta: block.block === 'cta' }) });
  }
  return pieces;
}
