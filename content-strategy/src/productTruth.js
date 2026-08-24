// productTruth.js — Fase 15, §2. ProductFact: únicamente hechos respaldados
// por la fuente primaria de Vida Divina — nunca copia el documento completo,
// solo el campo puntual necesario + de dónde viene.
//
// PRIMARY_PRODUCT_CONTEXT (usado como objeto plano desde la Fase 13) se
// formaliza aquí como un arreglo de ProductFact trazables — mismos hechos ya
// citados literalmente en docs/productos/01-control-de-peso/tedivina.md
// (Fases 9/11/13/14), nunca reinvestigados.

import { randomUUID } from 'node:crypto';

const SOURCE_DOCUMENT = 'docs/productos/01-control-de-peso/tedivina.md';

export function createProductFact({ product_ref, field, value, source_document, field_in_document }) {
  if (!product_ref) throw new Error('ProductFact: "product_ref" es obligatorio.');
  if (!field) throw new Error('ProductFact: "field" es obligatorio.');
  if (value === undefined || value === null || value === '') throw new Error('ProductFact: "value" es obligatorio — nunca un hecho vacío.');
  if (!source_document) throw new Error('ProductFact: "source_document" es obligatorio — todo hecho debe apuntar a un documento real, nunca a "internet" o a nada.');

  return Object.freeze({
    fact_id: randomUUID(),
    product_ref,
    field,
    value,
    source_document,
    source_reference: { document: source_document, field_in_document: field_in_document ?? field },
    basis: 'PRIMARY_PRODUCT_CONTEXT',
    requires_human_review: true,
  });
}

// Hechos reales de TéDivina, citados literalmente desde el catálogo — NUNCA
// desde investigación externa. Cada ingrediente es su propio ProductFact
// para que una mención puntual en un draft pueda trazarse a UN hecho, no a
// todo el documento.
export const TEDIVINA_PRODUCT_FACTS = Object.freeze([
  createProductFact({ product_ref: 'TéDivina', field: 'objetivo_principal', value: 'Limpiar mente y cuerpo como base para iniciar un estilo de vida saludable.', source_document: SOURCE_DOCUMENT, field_in_document: 'Objetivo principal' }),
  createProductFact({ product_ref: 'TéDivina', field: 'problema_que_ayuda_a_resolver', value: 'Necesidad de desintoxicación corporal antes de comenzar un programa de pérdida de peso; tránsito intestinal lento.', source_document: SOURCE_DOCUMENT, field_in_document: 'Problema que ayuda a resolver' }),
  ...['malva', 'mirra', 'cardo bendito', 'malvavisco', 'papaya', 'chaga', 'arándano rojo', 'cardo santo', 'manzanilla', 'hojas de caqui', 'fibra soluble', 'ganoderma', 'jengibre'].map((ingredient) =>
    createProductFact({ product_ref: 'TéDivina', field: 'ingrediente', value: ingredient, source_document: SOURCE_DOCUMENT, field_in_document: 'Ingredientes principales' })
  ),
  createProductFact({ product_ref: 'TéDivina', field: 'presentacion', value: 'Bolsitas de té, 3 oz / 50 mg. 1 bolsita de té por sobre.', source_document: SOURCE_DOCUMENT, field_in_document: 'Presentación' }),
  createProductFact({ product_ref: 'TéDivina', field: 'posicion_en_ventas', value: 'Producto #1 en ventas de Vida Divina.', source_document: SOURCE_DOCUMENT, field_in_document: 'nota introductoria del catálogo' }),
]);

/**
 * Busca, entre los ProductFact reales, alguno cuyo "value" comparta
 * vocabulario sustancial con el texto dado — heurística simple deliberada
 * (§15 pide no construir lógica excesivamente compleja): no es NLP, es
 * coincidencia de palabras significativas (>=5 caracteres) compartidas.
 * Nunca decide por sí sola que algo es SUPPORTED_PRODUCT_FACT — eso lo
 * decide claimClassification.js combinando esto con el guard fisiológico.
 */
export function findSupportingProductFact(text, productFacts = TEDIVINA_PRODUCT_FACTS) {
  const words = new Set(text.toLowerCase().match(/[a-záéíóúñ]{5,}/g) ?? []);
  let best = null;
  let bestRatio = 0;
  for (const fact of productFacts) {
    const factWords = fact.value.toLowerCase().match(/[a-záéíóúñ]{5,}/g) ?? [];
    if (factWords.length === 0) continue;
    const matched = factWords.filter((w) => words.has(w)).length;
    // Umbral relativo al tamaño del hecho: un ingrediente de una sola
    // palabra (ej. "malva") exige coincidencia TOTAL (1/1); un hecho largo
    // (ej. "problema_que_ayuda_a_resolver") exige al menos 2 palabras
    // compartidas, para evitar falsos positivos de una sola palabra común.
    const required = factWords.length <= 2 ? factWords.length : 2;
    if (matched < required) continue;
    const ratio = matched / factWords.length;
    if (ratio > bestRatio) { bestRatio = ratio; best = fact; }
  }
  return best;
}
