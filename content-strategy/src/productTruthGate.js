// productTruthGate.js — Fase 15, §7. Extiende el control de calidad SIN
// modificar qualityGate.js (Fase 14) — se ejecutan juntos
// (ProductTruthGate + QualityGate, §9), nunca se fusionan en una sola
// función, porque resuelven preguntas distintas: qualityGate.js pregunta
// "¿esta pieza rompe una regla estructural?"; productTruthGate.js pregunta
// "¿esta pieza afirma algo sobre el producto que no podemos respaldar?".

import { classifyDraft } from './claimClassification.js';
import { TEDIVINA_PRODUCT_FACTS } from './productTruth.js';
import { NEGATION_CUES } from './physiologicalClaimGuard.js';

const TESTIMONIAL_PATTERN = /\b(testimonios?|clientes? (dicen|confirman|reportan)|usuarios? (dicen|confirman|reportan))\b/i;
const STATISTIC_PATTERN = /\b\d{1,3}\s?%/;

/** Evita que un descargo de responsabilidad propio ("no afirma testimonios...") dispare la alarma de contenido inventado — mismas señales de negación del guard fisiológico. */
function hasNegationNearby(text) {
  const lower = text.toLowerCase();
  return NEGATION_CUES.some((cue) => lower.includes(cue));
}

function detectInventedIngredient(text, productFacts) {
  // Heurística deliberadamente simple (§15): busca la palabra "ingrediente(s)"
  // seguida de una lista, y verifica que cada término mencionado exista
  // entre los ProductFact de tipo "ingrediente". No es NLP — es una red de
  // seguridad adicional, nunca un sustituto de la revisión humana.
  const knownIngredients = new Set(productFacts.filter((f) => f.field === 'ingrediente').map((f) => f.value.toLowerCase()));
  const match = text.match(/ingredientes?[^.:]*:?\s*([a-záéíóúñ,\s]+)/i);
  if (!match) return null;
  const mentioned = match[1].split(/,|\by\b/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const unknown = mentioned.filter((m) => m.length > 3 && ![...knownIngredients].some((k) => k.includes(m) || m.includes(k)));
  return unknown.length > 0 ? unknown : null;
}

export function runProductTruthGate({ item, draft, productFacts = TEDIVINA_PRODUCT_FACTS }) {
  const classifications = classifyDraft(draft, productFacts);
  const reasons = [];

  const healthClaims = classifications.filter((c) => c.category === 'HEALTH_CLAIM_REQUIRES_REVIEW');
  const unsupportedClaims = classifications.filter((c) => c.category === 'UNSUPPORTED_CLAIM');

  for (const c of healthClaims) reasons.push(`[${c.field}] HEALTH_CLAIM_REQUIRES_REVIEW: ${c.reasoning}`);
  for (const c of unsupportedClaims) reasons.push(`[${c.field}] UNSUPPORTED_CLAIM: ${c.reasoning}`);

  const fullText = [draft.hook, draft.body, draft.caption, ...(draft.scene_structure ?? []).map((b) => b.content)].filter(Boolean).join(' ');

  const negated = hasNegationNearby(fullText);
  const testimonialFlag = TESTIMONIAL_PATTERN.test(fullText) && !negated;
  const statisticFlag = STATISTIC_PATTERN.test(fullText) && !negated;
  if (testimonialFlag) reasons.push('posible testimonio invocado sin evidencia primaria (§7-7).');
  if (statisticFlag) reasons.push('posible estadística/porcentaje mencionado sin fuente primaria verificable (§7-9).');

  const inventedIngredients = detectInventedIngredient(fullText, productFacts);
  if (inventedIngredients) reasons.push(`posible(s) ingrediente(s) no presente(s) en el catálogo: ${inventedIngredients.join(', ')} (§7-10).`);

  // Veredicto: BLOCKED si hay algo claramente no respaldado o inventado;
  // REVIEW_REQUIRED si hay lenguaje fisiológico/de salud sin resolver;
  // PASS solo si ninguna de las dos condiciones anteriores aplica. Nunca se
  // "mejora" ni se completa una afirmación — ante la duda, nunca PASS.
  let status;
  if (unsupportedClaims.length > 0 || testimonialFlag || statisticFlag || inventedIngredients) {
    status = 'BLOCKED';
  } else if (healthClaims.length > 0) {
    status = 'REVIEW_REQUIRED';
  } else {
    status = 'PASS';
  }

  return {
    status,
    reasons,
    classifications,
    supported_facts_used: [...new Set(classifications.filter((c) => c.supporting_fact_id).map((c) => c.supporting_fact_id))],
  };
}
