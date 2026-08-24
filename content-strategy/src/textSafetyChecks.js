// textSafetyChecks.js — Fase 14, §8. Detectores NO-lanzantes (a diferencia
// de los guards de contentDraft.js, que lanzan) — se extraen aquí para que
// tanto los guards que SÍ lanzan (creación de un draft) como el
// QualityGate (que solo reporta, nunca lanza, §15) reutilicen exactamente
// la MISMA lista de frases, sin duplicarla en dos lugares que podrían
// desincronizarse.

export const INVENTED_CERTAINTY_PHRASES = Object.freeze([
  'certificado por', 'estudio clínico', 'garantizado', 'cura ', 'elimina el', '100% efectivo', 'aprobado por la fda',
]);

export const CAUSAL_PHRASES = Object.freeze([/\bcausa\b/i, /\bgarantiza\b/i, /\bconvierte mejor\b/i, /\bhace viral\b/i]);

/** Devuelve la primera frase de certeza inventada encontrada, o null. */
export function detectInventedCertainty(text) {
  const lower = text.toLowerCase();
  return INVENTED_CERTAINTY_PHRASES.find((phrase) => lower.includes(phrase)) ?? null;
}

/** Devuelve el patrón causal que coincide, o null. */
export function detectCausalLanguage(text) {
  return CAUSAL_PHRASES.find((pattern) => pattern.test(text)) ?? null;
}

/**
 * Devuelve el primer fragmento de 25+ caracteres copiado literalmente de
 * cualquiera de los ejemplos externos, o null. Misma ventana deslizante
 * usada desde la Fase 13 — "fortalecer" (§8) significa reutilizarla desde
 * un único lugar, no reinventar el umbral en cada módulo.
 */
export function detectCopiedFragment(text, externalExampleTexts = []) {
  const lower = text.toLowerCase();
  for (const example of externalExampleTexts) {
    const normalized = example.toLowerCase().trim();
    for (let i = 0; i + 25 <= normalized.length; i += 5) {
      const window = normalized.slice(i, i + 25);
      if (lower.includes(window)) return window;
    }
  }
  return null;
}
