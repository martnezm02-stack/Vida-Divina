// angleVariants.js — Fase 14, §4. NO todos los ángulos conceptuales del
// encargo tienen un patrón real que los respalde hoy — se audita
// explícitamente cuál sí y cuál no, en vez de asumir que los 7 son válidos.
//
// Respaldados por un detector real (marketing-intelligence/src/agent/
// heuristics/): educación y comparación (hooksAndAngles.js, dimensión
// ANGLE); objeción, problema y mecanismo (persuasionSignals.js, dimensiones
// OBJECTION/PROBLEM/MECHANISM — conceptualmente el mismo ángulo editorial
// aplicado a una pieza, aunque el nombre del ángulo no sea idéntico al
// nombre de la dimensión). Descubrimiento y experiencia NO tienen ningún
// detector real que los produzca — se documentan como NO respaldados y se
// EXCLUYEN del batch de esta fase (§4: "no asumir que todos son válidos").

export const ANGLE_SUPPORT = Object.freeze({
  'educación': { supported: true, originating_dimension: 'ANGLE' },
  'comparación': { supported: true, originating_dimension: 'ANGLE' },
  'objeción': { supported: true, originating_dimension: 'OBJECTION' },
  'problema': { supported: true, originating_dimension: 'PROBLEM' },
  'mecanismo': { supported: true, originating_dimension: 'MECHANISM' },
  'descubrimiento': { supported: false, originating_dimension: null },
  'experiencia': { supported: false, originating_dimension: null },
});

export function isAngleSupportedByRealPattern(angle) {
  return Boolean(ANGLE_SUPPORT[angle]?.supported);
}

export function assertAngleSupported(angle) {
  if (!isAngleSupportedByRealPattern(angle)) {
    throw new Error(`angleVariants: el ángulo "${angle}" no tiene ningún detector real que lo respalde hoy (marketing-intelligence) — no se usa en producción hasta que exista evidencia real, solo se documenta como conceptual.`);
  }
}
