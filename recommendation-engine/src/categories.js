// categories.js
// Vocabulario público del Recommendation Engine, tal como lo pidió el
// encargo del sprint (PRIMARY / COMPLEMENTARY / OPTIONAL / NOT_RECOMMENDED),
// y su mapeo hacia el tipo_relacion que ahora emite el Knowledge Compiler
// (Sprint 3B) en español, consistente con el resto del esquema compilado
// (ver docs/RECOMMENDATION_ENGINE.md §4).

export const CATEGORIAS = Object.freeze({
  PRIMARY: 'PRIMARY',
  COMPLEMENTARY: 'COMPLEMENTARY',
  OPTIONAL: 'OPTIONAL',
  NOT_RECOMMENDED: 'NOT_RECOMMENDED',
});

// Orden de presentación: el asesor siempre lidera con PRIMARY, luego
// OPTIONAL (otras alternativas dentro de "recomendados"), luego
// COMPLEMENTARY (venta cruzada), y NOT_RECOMMENDED al final solo como
// referencia de qué evitar — nunca se ofrece de entrada.
export const ORDEN_PRESENTACION = [
  CATEGORIAS.PRIMARY,
  CATEGORIAS.OPTIONAL,
  CATEGORIAS.COMPLEMENTARY,
  CATEGORIAS.NOT_RECOMMENDED,
];

const TIPO_RELACION_A_CATEGORIA = {
  recomienda_primario: CATEGORIAS.PRIMARY,
  recomienda_opcional: CATEGORIAS.OPTIONAL,
  recomienda_complementario: CATEGORIAS.COMPLEMENTARY,
  no_recomendado: CATEGORIAS.NOT_RECOMMENDED,
};

/**
 * @param {string} tipoRelacion - tal como viene en knowledge/compiled/relationships.json
 * @returns {string|null} una de CATEGORIAS, o null si la relación no es clasificable (ej. "referencia" genérica)
 */
export function categoriaDesdeTipoRelacion(tipoRelacion) {
  return TIPO_RELACION_A_CATEGORIA[tipoRelacion] ?? null;
}
