import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildCarouselSlidesContent } from '../src/carouselCompositor.js';

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
