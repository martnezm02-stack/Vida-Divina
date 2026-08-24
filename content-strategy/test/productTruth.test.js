import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createProductFact, TEDIVINA_PRODUCT_FACTS, findSupportingProductFact } from '../src/productTruth.js';

describe('ProductFact — solo hechos respaldados por la fuente primaria (§2)', () => {
  test('crea un ProductFact válido con basis PRIMARY_PRODUCT_CONTEXT', () => {
    const fact = createProductFact({ product_ref: 'TéDivina', field: 'presentacion', value: 'Bolsitas de té', source_document: 'docs/productos/01-control-de-peso/tedivina.md' });
    assert.equal(fact.basis, 'PRIMARY_PRODUCT_CONTEXT');
    assert.equal(fact.requires_human_review, true);
    assert.equal(fact.source_reference.document, 'docs/productos/01-control-de-peso/tedivina.md');
  });

  test('rechaza sin source_document — nunca un hecho sin documento real', () => {
    assert.throws(() => createProductFact({ product_ref: 'TéDivina', field: 'x', value: 'y' }));
  });

  test('rechaza value vacío', () => {
    assert.throws(() => createProductFact({ product_ref: 'TéDivina', field: 'x', value: '', source_document: 'doc.md' }));
  });

  test('TEDIVINA_PRODUCT_FACTS contiene los hechos reales ya citados en fases anteriores (ingredientes, problema, presentación)', () => {
    const ingredientFacts = TEDIVINA_PRODUCT_FACTS.filter((f) => f.field === 'ingrediente');
    assert.ok(ingredientFacts.some((f) => f.value === 'malva'));
    assert.ok(TEDIVINA_PRODUCT_FACTS.some((f) => f.field === 'problema_que_ayuda_a_resolver'));
  });
});

describe('findSupportingProductFact — sin NLP, sin falsos positivos de una sola palabra', () => {
  test('encuentra el ProductFact real que respalda un texto sobre el problema documentado', () => {
    const fact = findSupportingProductFact('la desintoxicación corporal previa a un programa de pérdida de peso');
    assert.ok(fact, 'debería encontrar el ProductFact de "problema_que_ayuda_a_resolver"');
    assert.equal(fact.field, 'problema_que_ayuda_a_resolver');
  });

  test('no encuentra respaldo para un texto sin relación real con el catálogo', () => {
    const fact = findSupportingProductFact('el clima de la ciudad estuvo agradable ayer por la tarde');
    assert.equal(fact, null);
  });
});
