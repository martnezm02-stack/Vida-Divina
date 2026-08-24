// physiologicalClaimGuard.js — Fase 15, §5-6. Guardia CONSERVADORA para
// expresiones que impliquen funcionamiento interno del cuerpo. Analiza el
// TEXTO (frase/bloque), nunca una palabra aislada fuera de contexto — pero
// tampoco intenta un análisis semántico complejo (§15: "no construir lógica
// excesivamente compleja"). Cuando hay duda, el resultado siempre empuja
// hacia HEALTH_CLAIM_REQUIRES_REVIEW, nunca hacia una clasificación segura.

const PHYSIOLOGICAL_PATTERNS = Object.freeze([
  { term: 'desintoxicación', pattern: /desintoxica/i },
  { term: 'pérdida de peso', pattern: /pérdida de peso|perder peso|bajar de peso/i },
  { term: 'eliminación de toxinas', pattern: /elimina(r|n)?\s+toxinas|eliminación de toxinas/i },
  { term: 'metabolismo', pattern: /metabolismo|metabólic[oa]/i },
  { term: 'mecanismo fisiológico', pattern: /cómo actúa|actúa en el cuerpo|mecanismo de acción/i },
  { term: 'órganos', pattern: /\b(hígado|riñones?|intestinos?|colon)\b/i },
  { term: 'inflamación', pattern: /inflamaci[oó]n|antiinflamatori[oa]/i },
  { term: 'hormonas', pattern: /hormonas?|hormonal/i },
  { term: 'enfermedades/prevención/tratamiento', pattern: /\b(cura|curar|tratamiento|prevenir|prevención|enfermedad)\b/i },
  { term: 'resultado garantizado', pattern: /resultados? garantizados?|garantiza(do)?/i },
  { term: 'efecto causal en el organismo', pattern: /acelera|activa el|estimula el cuerpo|regula el cuerpo/i },
]);

export const NEGATION_CUES = Object.freeze([
  'no está demostrado', 'no se afirma', 'no afirma', 'no garantiza', 'sin afirmar', 'no hay evidencia', 'no significa', 'no implica', 'pueden variar de persona a persona',
]);

/**
 * Analiza UN texto (bloque/frase, no un documento completo) y devuelve
 * { matched, term, negated } — negated=true solo si una frase de negación
 * REAL aparece en el mismo texto. Si el propio detector no puede decidir
 * con confianza (ej. negación ambigua), negated queda en false — por
 * diseño, eso empuja la clasificación hacia REQUIRES_REVIEW, nunca al revés.
 */
export function detectPhysiologicalClaim(text) {
  const lower = text.toLowerCase();
  for (const { term, pattern } of PHYSIOLOGICAL_PATTERNS) {
    if (pattern.test(text)) {
      const negated = NEGATION_CUES.some((cue) => lower.includes(cue));
      return { matched: true, term, negated };
    }
  }
  return { matched: false, term: null, negated: false };
}
