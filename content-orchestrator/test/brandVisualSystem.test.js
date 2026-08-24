import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  BRAND_COLORS, BRAND_AVOID, deriveBrandSceneColors,
  findBrandAvoidViolations, assertBrandAvoidCompliance, isOfficialBrandColor,
} from '../src/brandVisualSystem.js';

describe('BRAND_COLORS — fuente única de verdad', () => {
  test('expone exactamente los 6 colores oficiales reales', () => {
    assert.equal(BRAND_COLORS.forestGreen, '#0E1E11');
    assert.equal(BRAND_COLORS.oliveGreen, '#29361C');
    assert.equal(BRAND_COLORS.warmCream, '#E6DFD0');
    assert.equal(BRAND_COLORS.burgundy, '#441C11');
    assert.equal(BRAND_COLORS.warmGold, '#B58C33');
    assert.equal(BRAND_COLORS.softBlack, '#26231F');
  });
});

describe('deriveBrandSceneColors', () => {
  test('deriva colores de escena reales, todos oficiales o el verde WhatsApp', () => {
    const c = deriveBrandSceneColors();
    for (const key of ['hookBackgroundGradientFrom', 'hookBackgroundGradientTo', 'ctaBackgroundGradientFrom', 'ctaBackgroundGradientTo', 'hookTextColor', 'ctaTextColor']) {
      assert.ok(isOfficialBrandColor(c[key]), `${key} = ${c[key]} debería ser un color oficial de marca`);
    }
    assert.equal(c.whatsappPillBackground, '#25D366');
  });
});

describe('findBrandAvoidViolations / assertBrandAvoidCompliance', () => {
  test('detecta cada frase real de la lista "evitar"', () => {
    for (const { label } of BRAND_AVOID) {
      const texto = `dirección visual: usa ${label} en el fondo`;
      assert.ok(findBrandAvoidViolations(texto).length > 0, `debería detectar "${label}"`);
    }
  });

  test('texto limpio no dispara ninguna violación', () => {
    assert.deepEqual(findBrandAvoidViolations('Fotografía real del producto sobre madera clara, luz natural, tono cálido y confiable.'), []);
  });

  test('assertBrandAvoidCompliance lanza cuando hay violación real', () => {
    assert.throws(() => assertBrandAvoidCompliance('fondo neón brillante', 'campo'), /Brand Visual System/);
  });

  test('assertBrandAvoidCompliance no lanza con texto on-brand', () => {
    assert.equal(assertBrandAvoidCompliance('Escena natural con hojas y madera, estética elegante y confiable.', 'campo'), true);
  });

  test('texto no-string no lanza (guard tolerante a null/undefined, igual que los demás guards del proyecto)', () => {
    assert.doesNotThrow(() => assertBrandAvoidCompliance(undefined, 'campo'));
  });
});

describe('isOfficialBrandColor', () => {
  test('acepta mayúsculas/minúsculas indistintamente', () => {
    assert.equal(isOfficialBrandColor('#0e1e11'), true);
    assert.equal(isOfficialBrandColor('#0E1E11'), true);
  });

  test('rechaza un hex que no es de la paleta oficial', () => {
    assert.equal(isOfficialBrandColor('#FF00FF'), false);
  });
});
