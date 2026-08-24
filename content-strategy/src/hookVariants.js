// hookVariants.js — Fase 14, §3. Pequeña taxonomía de variantes de hook.
//
// Cada variante declara el patrón real que la origina — HOOK/ANGLE/PROBLEM
// ya existen en marketing-intelligence/src/taxonomy.js y en los detectores
// reales (hooksAndAngles.js/persuasionSignals.js). MYTH y STORY son las
// únicas dos variantes sin un detector automático hoy — se marcan
// explícitamente como no respaldadas por un detector, aunque MYTH sí está
// inspirado en un patrón real OBSERVADO manualmente en la Fase 9
// (estructura "mito vs. hecho" de MedicineNet/Northwell Health).

export const HOOK_VARIANTS = Object.freeze({
  QUESTION: { originating_dimension: 'HOOK', originating_value: 'pregunta', detector_backed: true, description: 'Apertura en forma de pregunta directa — detectada por hooksAndAngles.js.' },
  CURIOSITY: { originating_dimension: 'HOOK', originating_value: 'curiosidad', detector_backed: true, description: 'Brecha de curiosidad explícita — detectada por hooksAndAngles.js.' },
  CONTRAST: { originating_dimension: 'ANGLE', originating_value: 'comparación', detector_backed: true, description: 'Comparación explícita (vs./mejor que) — detectada por hooksAndAngles.js.' },
  PROBLEM: { originating_dimension: 'PROBLEM', originating_value: 'problema_explicito', detector_backed: true, description: 'Apertura centrada en un problema — detectada por persuasionSignals.js.' },
  EDUCATIONAL: { originating_dimension: 'ANGLE', originating_value: 'educación', detector_backed: true, description: 'Apertura instruccional ("cómo/how to") — detectada por hooksAndAngles.js.' },
  MYTH: { originating_dimension: 'OBSERVACIÓN_MANUAL', originating_value: 'estructura_mito_vs_hecho', detector_backed: false, description: 'Desmontar una creencia — observado manualmente en fuentes REFERENCE/EDITORIAL de la Fase 9 (MedicineNet/Northwell), sin detector automático hoy.' },
  STORY: { originating_dimension: null, originating_value: null, detector_backed: false, description: 'Apertura narrativa/anecdótica — sin patrón real que la respalde todavía; se incluye solo como variante estructural, no como patrón observado.' },
});

export function isValidHookVariant(name) {
  return Object.prototype.hasOwnProperty.call(HOOK_VARIANTS, name);
}

export function isHookVariantDetectorBacked(name) {
  return Boolean(HOOK_VARIANTS[name]?.detector_backed);
}
