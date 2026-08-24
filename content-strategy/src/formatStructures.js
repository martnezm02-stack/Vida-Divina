// formatStructures.js — Fase 14, §5. Estructuras propias (nunca copiadas de
// una fuente externa) — son plantillas de FORMA, el contenido de cada
// bloque se genera por pieza en productionProvider.js.

export const FORMAT_STRUCTURES = Object.freeze({
  slideshow: ['hook', 'contexto', 'desarrollo', 'insight', 'cta'],
  short_video: ['hook', 'desarrollo', 'proof_context', 'cta'],
  static: ['headline', 'supporting_message', 'cta'],
  talking_head: ['hook', 'desarrollo', 'proof_context', 'cta'], // mismo esqueleto que short_video — es un formato de video hablado
});

export function isValidFormat(format) {
  return Object.prototype.hasOwnProperty.call(FORMAT_STRUCTURES, format);
}

/** Devuelve la lista de bloques (nombres, no contenido) para un formato. */
export function structureBlocksFor(format) {
  if (!isValidFormat(format)) throw new Error(`formatStructures: formato desconocido "${format}"`);
  return [...FORMAT_STRUCTURES[format]];
}
