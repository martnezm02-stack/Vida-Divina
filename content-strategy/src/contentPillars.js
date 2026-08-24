// contentPillars.js — Fase 13, §11. Taxonomía PEQUEÑA y deliberada, inspirada
// en conceptos que YA existen en marketing-intelligence/src/taxonomy.js
// (PROBLEM→PROBLEM_AWARENESS, OBJECTION→OBJECTION_HANDLING, SOCIAL_PROOF→
// SOCIAL_PROOF) más 4 categorías de nivel-pilar que no son dimensiones de
// observación sino agrupadores de ESTRATEGIA (más amplios que una sola
// dimensión). No se importa taxonomy.js literalmente porque un "pilar" no es
// lo mismo que una "dimensión" — es una categoría editorial que puede
// combinar varias dimensiones (ej. PROBLEM_AWARENESS puede usar
// observaciones PROBLEM + PAIN_POINT + DESIRE a la vez).

export const CONTENT_PILLARS = Object.freeze([
  'EDUCATION',
  'PROBLEM_AWARENESS',
  'OBJECTION_HANDLING',
  'PRODUCT_CONTEXT',
  'SOCIAL_PROOF',
  'FAQ',
  'EXPERIMENTAL',
]);

export function isValidPillar(pillar) {
  return CONTENT_PILLARS.includes(pillar);
}

// Fase 14, §6: el MISMO patrón produce una pieza distinta según el pilar —
// esto es la ÓPTICA editorial, nunca un claim médico nuevo. PRODUCT_CONTEXT
// se redacta deliberadamente sin verbo de beneficio, solo de descripción.
export const PILLAR_FRAMING = Object.freeze({
  EDUCATION: 'explicar',
  PROBLEM_AWARENESS: 'hacer visible un problema',
  OBJECTION_HANDLING: 'responder una duda',
  PRODUCT_CONTEXT: 'describir el producto sin afirmar un resultado',
  SOCIAL_PROOF: 'mostrar cómo otros perciben la categoría',
  FAQ: 'responder una pregunta frecuente',
  EXPERIMENTAL: 'probar una variación sin conclusión previa',
});
