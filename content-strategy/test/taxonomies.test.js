import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HOOK_VARIANTS, isValidHookVariant, isHookVariantDetectorBacked } from '../src/hookVariants.js';
import { ANGLE_SUPPORT, isAngleSupportedByRealPattern, assertAngleSupported } from '../src/angleVariants.js';
import { FORMAT_STRUCTURES, isValidFormat, structureBlocksFor } from '../src/formatStructures.js';

describe('HookVariants (§3) — trazabilidad hacia el patrón que origina cada variante', () => {
  test('cada variante declara si tiene o no un detector real que la respalde', () => {
    assert.equal(isHookVariantDetectorBacked('QUESTION'), true);
    assert.equal(isHookVariantDetectorBacked('MYTH'), false);
    assert.equal(isHookVariantDetectorBacked('STORY'), false);
  });

  test('QUESTION/CURIOSITY/CONTRAST/PROBLEM/EDUCATIONAL declaran su dimensión de origen real', () => {
    for (const name of ['QUESTION', 'CURIOSITY', 'CONTRAST', 'PROBLEM', 'EDUCATIONAL']) {
      assert.ok(HOOK_VARIANTS[name].originating_dimension, `${name} debe declarar una dimensión de origen`);
    }
  });

  test('isValidHookVariant distingue variantes reales de inventadas', () => {
    assert.equal(isValidHookVariant('QUESTION'), true);
    assert.equal(isValidHookVariant('INVENTADA'), false);
  });
});

describe('AngleVariants (§4) — no todos los ángulos conceptuales están respaldados hoy', () => {
  test('educación/comparación/objeción/problema/mecanismo están respaldados por un detector real', () => {
    for (const angle of ['educación', 'comparación', 'objeción', 'problema', 'mecanismo']) {
      assert.equal(isAngleSupportedByRealPattern(angle), true, `${angle} debería estar respaldado`);
    }
  });

  test('descubrimiento y experiencia NO están respaldados — no se asume que todos los ángulos son válidos', () => {
    assert.equal(isAngleSupportedByRealPattern('descubrimiento'), false);
    assert.equal(isAngleSupportedByRealPattern('experiencia'), false);
    assert.throws(() => assertAngleSupported('descubrimiento'));
  });
});

describe('FormatStructures (§5) — estructura propia, nunca copiada de una fuente externa', () => {
  test('slideshow/short_video/static tienen estructuras de bloques distintas', () => {
    assert.deepEqual(structureBlocksFor('slideshow'), ['hook', 'contexto', 'desarrollo', 'insight', 'cta']);
    assert.deepEqual(structureBlocksFor('static'), ['headline', 'supporting_message', 'cta']);
    assert.notDeepEqual(FORMAT_STRUCTURES.slideshow, FORMAT_STRUCTURES.static);
  });

  test('rechaza un formato desconocido', () => {
    assert.equal(isValidFormat('formato_inventado'), false);
    assert.throws(() => structureBlocksFor('formato_inventado'));
  });
});
