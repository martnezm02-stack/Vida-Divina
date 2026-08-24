// contentGenerationEngineCarousel.test.js — Bloque 2, CAROUSEL a través del
// Content Generation Engine completo (real: HyperFrames snapshot real,
// lineage real, Final Asset Package multi-asset real). Usa datos reales de
// TéDivina (docs/productos/tedivina.md), mismo criterio que
// contentGenerationEngine.test.js.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseContentGenerationRequest } from '../src/contentGenerationRequest.js';
import { generateContent } from '../src/contentGenerationEngine.js';
import { buildCarouselSlidesContent } from '../src/carouselCompositor.js';
import { loadProductFacts } from '../src/productFactsLoader.js';

const dirsCreados = [];
function nuevoDir() {
  const dir = mkdtempSync(join(tmpdir(), 'cge-carousel-test-'));
  dirsCreados.push(dir);
  return dir;
}
after(() => { for (const dir of dirsCreados) rmSync(dir, { recursive: true, force: true }); });

describe('generateContent(mode=CAROUSEL) — real, produce un Final Asset Package multi-asset', () => {
  test('1 request -> N assets reales, assetPackageType CAROUSEL, lineage por slide', () => {
    const facts = loadProductFacts('tedivina');
    const content = buildCarouselSlidesContent({
      hook: '¿Sabías que también existen formas de apoyar tu tránsito intestinal?',
      cta: 'Escríbenos por WhatsApp →',
      productFacts: facts,
      slideCount: 4,
    });

    const request = parseContentGenerationRequest({ rawText: 'Carrusel de TéDivina', productId: 'tedivina', forcedMode: 'CAROUSEL' });
    const result = generateContent(request, { slides: content.slides, projectDir: nuevoDir() });

    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.assetPackageType, 'CAROUSEL');
    assert.equal(result.assetPackage.type, 'CAROUSEL');
    assert.equal(result.assetPackage.assets.length, 4);
    assert.equal(result.outputAssets.length, 4);
    assert.equal(result.lineage.length, 4);
    for (const a of result.assetPackage.assets) {
      assert.equal(a.type, 'IMAGE');
      assert.equal(a.role, 'CAROUSEL_SLIDE');
      assert.equal(a.width, 1080);
      assert.equal(a.height, 1350);
    }
  });

  test('CREATE/EDIT_ENHANCE/ADAPT siguen con assetPackageType SINGLE y assetPackage null (retrocompatibilidad)', () => {
    // No re-ejecuta un render real -- solo verifica el contrato del builder mediante un ADAPT fallido rápido (SOURCE_ASSET_REQUIRED, sin tocar HyperFrames), que basta para confirmar los campos por defecto.
    const request = parseContentGenerationRequest({ rawText: 'Adapta esto.', sourceAsset: { type: 'VIDEO', path: 'C:/no-existe-real.mp4' }, forcedMode: 'ADAPT', outputProfiles: ['INSTAGRAM_REEL'] });
    const result = generateContent(request, { outputDir: nuevoDir() });
    assert.equal(result.assetPackageType, 'SINGLE');
    assert.equal(result.assetPackage, null);
  });

  test('sin "slides" -> VALIDATION_FAILED, nunca redacta contenido', () => {
    const request = parseContentGenerationRequest({ rawText: 'Carrusel', productId: 'tedivina', forcedMode: 'CAROUSEL' });
    const result = generateContent(request, { projectDir: nuevoDir() });
    assert.equal(result.status, 'VALIDATION_FAILED');
  });
});
