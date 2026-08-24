// productFactsLoader.test.js — Fase 19, corrección real: archivos de
// docs/productos/ que documentan MÁS DE UN producto ancla (ej.
// 08-intimidad-libido.md: Mars + Venus) antes devolvían los campos del
// ÚLTIMO producto del archivo para cualquier slug que apuntara a ese
// archivo -- Mars Capsules era inalcanzable. Usa datos REALES ya
// persistidos en docs/productos/, ningún fixture inventado.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadProductFacts, listAllProductSlugs } from '../src/productFactsLoader.js';

describe('loadProductFacts — secciones ancladas reales (archivos multi-producto)', () => {
  test('Mars Capsules y Venus Capsules (mismo archivo real 08-intimidad-libido.md) resuelven de forma independiente, sin mezclar campos', () => {
    const mars = loadProductFacts('mars-capsules');
    const venus = loadProductFacts('venus-capsules');
    assert.equal(mars.nombreComercial, 'Divina Mars Capsules');
    assert.equal(venus.nombreComercial, 'Divina Venus Capsules');
    assert.notEqual(mars.problema, venus.problema);
    assert.match(mars.problema, /libido en hombres/i);
    assert.match(venus.problema, /menopausia|ciclo menstrual/i);
  });

  test('Ripped Capsules (único producto ancla real de 07-rendimiento-fisico.md) resuelve por su ancla real', () => {
    const r = loadProductFacts('ripped-capsules');
    assert.equal(r.nombreComercial, 'Divina Ripped Capsules');
    assert.match(r.ingredientes, /Tongkat Ali/);
  });

  test('compatibilidad real: el slug de archivo anterior sigue resolviendo cuando el archivo tiene un único producto ancla (07-rendimiento-fisico)', () => {
    const r = loadProductFacts('07-rendimiento-fisico');
    assert.equal(r.nombreComercial, 'Divina Ripped Capsules');
  });

  test('archivos de un solo producto sin anclas -- comportamiento intacto (TéDivina, Café Divina Tongkat Ali)', () => {
    assert.equal(loadProductFacts('tedivina').nombreComercial, 'TéDivina');
    assert.equal(loadProductFacts('te-divina').nombreComercial, 'TéDivina');
    assert.equal(loadProductFacts('tongkat-ali-cafe').nombreComercial, 'Café Divina Tongkat Ali');
  });

  test('listAllProductSlugs incluye mars-capsules y venus-capsules como slugs reales independientes', () => {
    const slugs = listAllProductSlugs();
    assert.ok(slugs.includes('mars-capsules'));
    assert.ok(slugs.includes('venus-capsules'));
    assert.ok(slugs.includes('ripped-capsules'));
  });

  test('un id de ancla inventado que no existe en ningún archivo real -- error explícito, nunca inventa', () => {
    assert.throws(() => loadProductFacts('producto-ancla-que-no-existe'), /no existe ningún archivo real/);
  });
});
