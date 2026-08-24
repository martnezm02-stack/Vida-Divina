import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyClaim, CLAIM_CATEGORIES } from '../src/claimClassification.js';
import { TEDIVINA_PRODUCT_FACTS } from '../src/productTruth.js';

describe('classifyClaim — las 3 distinciones del §3, nunca confundidas', () => {
  test('SUPPORTED_PRODUCT_FACT: texto respaldado por un ProductFact real, sin lenguaje fisiológico sin marcar', () => {
    const result = classifyClaim({ text: 'TéDivina se presenta en bolsitas de té, 3 oz, 1 bolsita por sobre.', productFacts: TEDIVINA_PRODUCT_FACTS });
    assert.equal(result.category, 'SUPPORTED_PRODUCT_FACT');
    assert.ok(result.supporting_fact_id);
  });

  test('HEALTH_CLAIM_REQUIRES_REVIEW: "ayuda a perder peso" nunca pasa como hecho respaldado sin más', () => {
    const result = classifyClaim({ text: 'Este té ayuda a perder peso rápidamente.', productFacts: TEDIVINA_PRODUCT_FACTS });
    assert.equal(result.category, 'HEALTH_CLAIM_REQUIRES_REVIEW');
  });

  test('UNSUPPORTED_CLAIM: lenguaje causal o de certeza inventada nunca pasa silenciosamente', () => {
    const result = classifyClaim({ text: 'Este té causa una pérdida de peso garantizada.', productFacts: TEDIVINA_PRODUCT_FACTS });
    assert.equal(result.category, 'UNSUPPORTED_CLAIM');
  });

  test('MARKETING_LANGUAGE: el disclaimer estándar del generador nunca se confunde con un hecho', () => {
    const result = classifyClaim({ text: 'Contenido experimental — los resultados pueden variar de persona a persona.', productFacts: TEDIVINA_PRODUCT_FACTS });
    assert.equal(result.category, 'MARKETING_LANGUAGE');
  });

  test('CTA y QUESTION se distinguen de afirmaciones sobre el producto', () => {
    assert.equal(classifyClaim({ text: 'Conoce más en el catálogo oficial.', productFacts: TEDIVINA_PRODUCT_FACTS }).category, 'CTA');
    assert.equal(classifyClaim({ text: '¿Sabías que la preparación previa importa?', productFacts: TEDIVINA_PRODUCT_FACTS }).category, 'QUESTION');
  });

  test('nunca confunde un PATRÓN DE MERCADO (ej. "detox tea" genérico) con un PRODUCT FACT de TéDivina', () => {
    // "detox tea" es vocabulario de la categoría externa, no del catálogo interno.
    const result = classifyClaim({ text: 'El mercado de "detox tea" en general promete resultados rápidos.', productFacts: TEDIVINA_PRODUCT_FACTS });
    assert.notEqual(result.category, 'SUPPORTED_PRODUCT_FACT');
  });

  test('las 7 categorías del contrato están exactamente las pedidas en §4', () => {
    assert.deepEqual(CLAIM_CATEGORIES, ['SUPPORTED_PRODUCT_FACT', 'MARKETING_LANGUAGE', 'UNSUPPORTED_CLAIM', 'HEALTH_CLAIM_REQUIRES_REVIEW', 'OPINION', 'QUESTION', 'CTA']);
  });

  test('nunca lanza, siempre devuelve una clasificación (incluso ante texto vacío)', () => {
    assert.doesNotThrow(() => classifyClaim({ text: '', productFacts: TEDIVINA_PRODUCT_FACTS }));
  });
});
