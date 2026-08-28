import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildCarouselSlidesContent } from '../src/carouselCompositor.js';
import { buildCreativeStructure, LEGACY_STRUCTURE } from '../src/creativeStructureEngine.js';

const PRODUCT_FACTS_REAL = Object.freeze({
  nombreComercial: 'TéDivina',
  beneficios: 'Prepara el cuerpo para iniciar un programa de pérdida de peso; promueve la desintoxicación natural; promueve la energía; mejora el tránsito intestinal.',
  ingredientes: null,
});

describe('buildCarouselSlidesContent — deriva slides de hechos 100% reales', () => {
  test('slide 1 = hook real, último slide = CTA real, intermedios = hechos reales distintos', () => {
    const r = buildCarouselSlidesContent({ hook: 'Hook real', cta: 'CTA real', productFacts: PRODUCT_FACTS_REAL, slideCount: 5 });
    assert.equal(r.slides[0].headline, 'Hook real');
    assert.equal(r.slides.at(-1).cta, 'CTA real');
    assert.equal(r.actualSlideCount, 5);
    const bodies = r.slides.slice(1, -1).map((s) => s.body);
    assert.equal(new Set(bodies).size, bodies.length); // ningún hecho repetido
  });

  test('sin suficientes hechos reales distintos, reduce el conteo en vez de inventar relleno', () => {
    const factsPobre = { nombreComercial: 'X', beneficios: 'Un solo beneficio real', ingredientes: null };
    const r = buildCarouselSlidesContent({ hook: 'H', cta: 'C', productFacts: factsPobre, slideCount: 6 });
    assert.ok(r.actualSlideCount < 6);
    assert.ok(r.warnings.length > 0);
    assert.match(r.warnings[0], /en vez de inventar/i);
  });

  test('rechaza hook/cta vacíos -- nunca inventa un hook o CTA', () => {
    assert.throws(() => buildCarouselSlidesContent({ hook: '', cta: 'C', productFacts: PRODUCT_FACTS_REAL, slideCount: 3 }));
    assert.throws(() => buildCarouselSlidesContent({ hook: 'H', cta: '', productFacts: PRODUCT_FACTS_REAL, slideCount: 3 }));
  });

  test('rechaza slideCount < 3', () => {
    assert.throws(() => buildCarouselSlidesContent({ hook: 'H', cta: 'C', productFacts: PRODUCT_FACTS_REAL, slideCount: 2 }));
  });
});

describe('buildCarouselSlidesContent — Creative Structure Engine (integración)', () => {
  test('sin "creativeStructure" real, cae a LEGACY_STRUCTURE explícito (Paso 20, backward compatibility)', () => {
    const r = buildCarouselSlidesContent({ hook: 'Hook real', cta: 'CTA real', productFacts: PRODUCT_FACTS_REAL, slideCount: 5 });
    assert.equal(r.creativeStructure.structureId, LEGACY_STRUCTURE.structureId);
    assert.equal(r.slides[0].stage, LEGACY_STRUCTURE.stages[0]);
    assert.equal(r.slides.at(-1).stage, 'CTA');
    assert.ok(r.slides.every((s) => typeof s.stage === 'string'));
  });

  test('con "creativeStructure" real (ej. sección 15 del encargo), cada slide recibe su función narrativa real, contenido real intacto', () => {
    const creativeStructure = buildCreativeStructure({ contentType: 'CAROUSEL', userInstruction: 'Quiero explicar tres beneficios importantes' });
    const r = buildCarouselSlidesContent({
      hook: 'Hook real', cta: 'CTA real', productFacts: PRODUCT_FACTS_REAL, slideCount: 5, creativeStructure,
    });
    assert.equal(r.creativeStructure.structureId, creativeStructure.structureId);
    assert.deepEqual(r.slides.map((s) => s.stage), r.creativeStructure.stages);
    // Regla central del archivo NUNCA cambia: slide 1 = hook real, último = CTA real.
    assert.equal(r.slides[0].headline, 'Hook real');
    assert.equal(r.slides.at(-1).cta, 'CTA real');
  });

  test('el número de slides sigue controlado por el usuario/warnings existentes, la estructura solo etiqueta la función', () => {
    const creativeStructure = buildCreativeStructure({ contentType: 'CAROUSEL', userInstruction: 'Quiero explicar tres beneficios importantes' });
    const factsPobre = { nombreComercial: 'X', beneficios: 'Un solo beneficio real', ingredientes: null };
    const r = buildCarouselSlidesContent({ hook: 'H', cta: 'C', productFacts: factsPobre, slideCount: 6, creativeStructure });
    assert.ok(r.actualSlideCount < 6);
    assert.equal(r.slides.length, r.creativeStructure.stages.length);
  });
});
