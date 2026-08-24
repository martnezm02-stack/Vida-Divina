// sourceReference.js — Fase 13. Content Strategy es el PRIMER módulo que
// necesita referenciar, de forma trazable, a las CUATRO capas de
// inteligencia existentes (marketing-intelligence, website-intelligence,
// viral-content-intelligence, performance-learning-intelligence).
//
// website-intelligence/src/contentBrief.js ya tiene createPatternReference(),
// pero su REFERENCE_MODULES está cerrado a
// ['marketing_intelligence', 'website_intelligence'] — no incluye los dos
// módulos nuevos. Modificar ese archivo está fuera de alcance de esta fase
// (website-intelligence no debe tocarse salvo incompatibilidad
// estrictamente necesaria, y aquí SÍ existe una — documentada, no evadida).
// En vez de tocarlo, Content Strategy define su PROPIA referencia, con la
// misma disciplina (rationale obligatorio, nunca copia el contenido
// referenciado) pero soportando los 4 módulos reales del sistema.

export const SOURCE_MODULES = Object.freeze([
  'marketing_intelligence',
  'website_intelligence',
  'viral_content_intelligence',
  'performance_learning_intelligence',
]);

export function createSourceReference({ source_module, reference_type, reference_id, rationale }) {
  if (!SOURCE_MODULES.includes(source_module)) {
    throw new Error(`SourceReference: source_module inválido "${source_module}" (válidos: ${SOURCE_MODULES.join(', ')})`);
  }
  if (!reference_type) throw new Error('SourceReference: "reference_type" es obligatorio.');
  if (!reference_id) throw new Error('SourceReference: "reference_id" es obligatorio.');
  if (!rationale || !rationale.trim()) {
    throw new Error('SourceReference: "rationale" es obligatorio — ninguna referencia puede quedar sin responder "¿por qué se usó esto?".');
  }
  return Object.freeze({ source_module, reference_type, reference_id, rationale });
}
