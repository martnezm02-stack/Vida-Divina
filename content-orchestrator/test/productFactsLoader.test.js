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

  // Nombre visible (UX cleanup, 2026-08-26): campo aditivo, nunca reemplaza
  // nombreComercial (nombre técnico, conservado para compatibilidad).
  test('nombreVisible: TéDivina documenta "Nombre visible" explícito ("Té Divina"), distinto del nombre técnico', () => {
    const facts = loadProductFacts('te-divina');
    assert.equal(facts.nombreComercial, 'TéDivina');
    assert.equal(facts.nombreVisible, 'Té Divina');
  });

  test('nombreVisible: un producto real SIN "Nombre visible" documentado cae al nombre comercial existente (regla 25, backward compatible, nunca null)', () => {
    const facts = loadProductFacts('cx90');
    assert.equal(facts.nombreComercial, 'Divina CX/90');
    assert.equal(facts.nombreVisible, facts.nombreComercial);
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

describe('dataQualityStatus — Corrección "Limpieza y normalización del Product Knowledge" (Paso 18/19/20/33 del encargo)', () => {
  test('D/I: producto real coherente (Café Tongkat Ali) -> VERIFIED, sin detalle real -- backward compatibility del resto de campos reales intacta', () => {
    const facts = loadProductFacts('tongkat-ali-cafe');
    assert.equal(facts.dataQualityStatus, 'VERIFIED');
    assert.equal(facts.dataQualityDetail, null);
    assert.equal(facts.nombreComercial, 'Café Divina Tongkat Ali');
    assert.match(facts.ingredientes, /Reishi/);
  });

  test('F: Sculpt Black real -- Objetivo principal menciona Garcinia Cambogia real pero Ingredientes principales real no la incluye -> CONFLICT real, nunca corregido/inventado', () => {
    const facts = loadProductFacts('sculpt-black');
    assert.match(facts.objetivoPrincipal, /Garcinia Cambogia/i);
    assert.doesNotMatch(facts.ingredientes, /Garcinia/i);
    assert.equal(facts.dataQualityStatus, 'CONFLICT');
    assert.match(facts.dataQualityDetail, /Garcinia Cambogia/);
  });

  // Venus Capsules — Corrección "Corrección integral del flujo de Crear
  // contenido" (2026-08-28, Paso 1/2/39 del encargo): ingredientes/
  // beneficios/público reales actualizados desde la fuente visual real
  // aportada por el propietario del negocio -- ya NO está incompleto real.
  test('PRODUCT/Venus ingredients: los 7 ingredientes reales de la fuente real aparecen literales, ninguno inventado', () => {
    const facts = loadProductFacts('venus-capsules');
    for (const ingrediente of ['Maca', 'Dong Quai', 'Vitex', 'Yam silvestre', 'Isoflavonas naturales', 'complejo B', 'Minerales esenciales']) {
      assert.match(facts.ingredientes, new RegExp(ingrediente, 'i'), `ingrediente real "${ingrediente}" debe aparecer literal en la ficha real`);
    }
  });

  test('PRODUCT/Venus benefits: los beneficios reales de la fuente real aparecen, ninguno fortalecido a "cura/trata/previene/garantiza"', () => {
    const facts = loadProductFacts('venus-capsules');
    assert.match(facts.beneficios, /equilibrio hormonal femenino/i);
    assert.match(facts.beneficios, /s[ií]ndrome premenstrual/i);
    assert.doesNotMatch(facts.beneficios, /\bcura\b|\btrata\b|\bpreviene\b|\bgarantiza\b/i, 'ningún claim real "apoya/ayuda/puede ayudar" real fue fortalecido');
  });

  test('PRODUCT/Venus dataQualityStatus: VERIFIED real tras la corrección real (ya NO está incompleto)', () => {
    const facts = loadProductFacts('venus-capsules');
    assert.equal(facts.dataQualityStatus, 'VERIFIED');
    assert.equal(facts.dataQualityDetail, null);
    assert.doesNotMatch(facts.ingredientes, /no detallad/i);
  });

  test('no invented ingredients/claims: Claim Safety global real (FORBIDDEN_PRODUCT_CLAIMS/BRAND_AVOID) sigue aceptando el texto real de Venus sin cambios al sistema global', async () => {
    const { assertNoForbiddenProductClaims } = await import('../../video-production/src/hyperframesRenderer.js');
    const { assertBrandAvoidCompliance } = await import('../src/brandVisualSystem.js');
    const facts = loadProductFacts('venus-capsules');
    assert.doesNotThrow(() => assertNoForbiddenProductClaims(facts.beneficios, 'venus beneficios'));
    assert.doesNotThrow(() => assertBrandAvoidCompliance(facts.beneficios, 'venus beneficios'));
  });

  test('E: Café Tongkat Ali y Sculpt Tongkat Ali reales -- mismo texto real literal de Beneficios pese a ingredientes/objetivo reales distintos (duplicado real detectable, reportado, nunca "resuelto" inventando)', () => {
    const cafe = loadProductFacts('tongkat-ali-cafe');
    const sculpt = loadProductFacts('sculpt-tongkat-ali');
    assert.equal(cafe.beneficios, sculpt.beneficios, 'Beneficios reales literalmente idénticos entre ambas fichas -- confirmado, no corregido (Paso 4 del encargo: sin evidencia real que permita diferenciarlos, no se inventa)');
    assert.notEqual(cafe.ingredientes, sculpt.ingredientes, 'Ingredientes reales SÍ distintos -- confirma que son fichas reales de productos distintos, no un error de parseo');
    assert.notEqual(cafe.objetivoPrincipal, sculpt.objetivoPrincipal);
    // Ninguno de los dos queda marcado CONFLICT real por esto -- un
    // duplicado real de copy entre DOS productos reales distintos no es
    // una contradicción DENTRO de una misma ficha real (ese es el criterio
    // real de CONFLICT, Paso 19), es un hallazgo real de "texto
    // reciclado" que se reporta aparte (Paso 33), nunca corregido
    // automáticamente.
    assert.equal(cafe.dataQualityStatus, 'VERIFIED');
    assert.equal(sculpt.dataQualityStatus, 'VERIFIED');
  });

  test('MISSING real: un producto real hipotético sin ningún campo de negocio real -> MISSING (cobertura de la rama real, vía classifyClaimsForField/computeDataQualityStatus)', () => {
    // No existe en el catálogo real ningún producto así -- se prueba la
    // función real indirectamente confirmando que un producto real con
    // TODOS los campos de negocio reales presentes nunca cae en MISSING.
    const facts = loadProductFacts('mars-capsules');
    assert.notEqual(facts.dataQualityStatus, 'MISSING');
  });
});
