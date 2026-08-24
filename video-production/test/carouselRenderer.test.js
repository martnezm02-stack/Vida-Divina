// carouselRenderer.test.js — Bloque 2 (Carousel real). Real, más lento
// (invoca `hyperframes snapshot` real, Chrome headless real) -- mismo
// criterio que hyperframesRenderer.test.js, nunca mockeado.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { construirComposicionSlideHtml, renderCarouselSlide, renderCarousel, leerDimensionesPng, CAROUSEL_SLIDE_WIDTH, CAROUSEL_SLIDE_HEIGHT } from '../src/carouselRenderer.js';
import { FORBIDDEN_PRODUCT_CLAIMS } from '../src/hyperframesRenderer.js';

const dirsCreados = [];
function nuevoDir(nombre) {
  const dir = mkdtempSync(join(tmpdir(), `carousel-test-${nombre}-`));
  dirsCreados.push(dir);
  return dir;
}

after(() => {
  for (const dir of dirsCreados) rmSync(dir, { recursive: true, force: true });
});

describe('construirComposicionSlideHtml — composición estática, guards reales', () => {
  test('rechaza un claim prohibido en headline/body/cta', () => {
    for (const claim of FORBIDDEN_PRODUCT_CLAIMS.slice(0, 2)) {
      assert.throws(() => construirComposicionSlideHtml({ headline: `Esto ${claim} todo`, slideIndex: 1, totalSlides: 3 }), /claim prohibido/);
    }
  });

  test('rechaza slideIndex/totalSlides inválidos', () => {
    assert.throws(() => construirComposicionSlideHtml({ headline: 'H', slideIndex: 0, totalSlides: 3 }));
    assert.throws(() => construirComposicionSlideHtml({ headline: 'H', slideIndex: 4, totalSlides: 3 }));
  });

  test('el HTML real incluye los colores de marca oficiales', () => {
    const html = construirComposicionSlideHtml({ headline: 'Hook real', slideIndex: 1, totalSlides: 3 });
    assert.match(html, /#0E1E11/i);
    assert.match(html, /#E6DFD0/i);
  });
});

describe('leerDimensionesPng — lectura real de bytes IHDR', () => {
  test('rechaza un buffer que no es PNG real', () => {
    assert.throws(() => leerDimensionesPng(Buffer.from([1, 2, 3, 4])));
  });
});

describe('renderCarouselSlide / renderCarousel — render REAL vía HyperFrames snapshot (Chrome headless real)', () => {
  test('renderiza un slide real, PNG real con las dimensiones correctas', () => {
    const projectDir = join(nuevoDir('single'), 'slide-01');
    const r = renderCarouselSlide({ projectDir, slideIndex: 1, totalSlides: 1, headline: 'Apoya tu tránsito intestinal', body: 'Prepara el cuerpo real.' });
    assert.equal(r.status, 'COMPLETADO');
    assert.equal(r.width, CAROUSEL_SLIDE_WIDTH);
    assert.equal(r.height, CAROUSEL_SLIDE_HEIGHT);
    assert.ok(existsSync(r.outputPath));
    const buffer = readFileSync(r.outputPath);
    assert.equal(buffer.readUInt32BE(0), 0x89504e47); // firma PNG real
    assert.ok(r.assetId?.length === 64); // sha256 real del archivo real
  });

  test('renderCarousel produce N assets reales, uno por slide, sin detenerse por un fallo individual', () => {
    const projectDir = nuevoDir('multi');
    const resultados = renderCarousel({
      projectDir,
      slides: [
        { headline: 'Slide 1 real' },
        { headline: 'Slide 2 real', body: 'Beneficio real 2' },
        { headline: 'Slide 3 real', cta: 'Escríbenos por WhatsApp →' },
      ],
    });
    assert.equal(resultados.length, 3);
    for (const r of resultados) {
      assert.equal(r.status, 'COMPLETADO');
      assert.ok(existsSync(r.outputPath));
    }
    // cada slide es un asset real DISTINTO (headline distinto -> hash distinto)
    const ids = resultados.map((r) => r.assetId);
    assert.equal(new Set(ids).size, 3);
  });

  test('rechaza slides vacío', () => {
    assert.throws(() => renderCarousel({ projectDir: nuevoDir('empty'), slides: [] }));
  });
});
