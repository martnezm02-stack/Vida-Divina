// displayName.test.js — Corrección "Flujo creativo integral" (2026-08-28,
// Paso 17/18 del encargo). Cobertura real del nombre humano por video --
// nunca inventa un segmento que no viene de datos reales.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildDisplayName } from '../src/displayName.js';

describe('buildDisplayName', () => {
  test('formato real: [Producto] — [Concepto] — [Formato] — v[versión]', () => {
    const { displayName, displayFilename } = buildDisplayName({
      nombreVisible: 'Cápsulas Venus', conceptId: 'problem_agitation', outputProfileName: 'INSTAGRAM_REEL', versionNumber: 1,
    });
    assert.equal(displayName, 'Cápsulas Venus — Problem Agitation — Instagram Reel — v1');
    assert.equal(displayFilename, 'Cápsulas Venus — Problem Agitation — Instagram Reel — v1.mp4');
  });

  test('versionNumber real distinto produce un nombre real distinto (v1 vs v2)', () => {
    const v1 = buildDisplayName({ nombreVisible: 'Cápsulas Venus', conceptId: 'discovery', outputProfileName: 'INSTAGRAM_REEL', versionNumber: 1 });
    const v2 = buildDisplayName({ nombreVisible: 'Cápsulas Venus', conceptId: 'discovery', outputProfileName: 'INSTAGRAM_REEL', versionNumber: 2 });
    assert.notEqual(v1.displayName, v2.displayName);
    assert.match(v1.displayName, /v1$/);
    assert.match(v2.displayName, /v2$/);
  });

  test('nombreComercial real como fallback cuando no hay nombreVisible real', () => {
    const { displayName } = buildDisplayName({ nombreComercial: 'Divina Venus Capsules', outputProfileName: 'INSTAGRAM_REEL', versionNumber: 1 });
    assert.match(displayName, /^Divina Venus Capsules/);
  });

  test('angleId real como fallback cuando no hay conceptId real', () => {
    const { displayName } = buildDisplayName({ nombreVisible: 'Cápsulas Venus', angleId: 'comparison', outputProfileName: 'INSTAGRAM_REEL', versionNumber: 1 });
    assert.match(displayName, /Comparison/);
  });

  test('nunca inventa un segmento real ausente -- lo omite (nunca "null"/"undefined" literal)', () => {
    const { displayName } = buildDisplayName({ nombreVisible: 'Cápsulas Venus', versionNumber: 1 });
    assert.doesNotMatch(displayName, /null|undefined/i);
    assert.equal(displayName, 'Cápsulas Venus — v1');
  });

  test('sin ningún dato real -> displayName/displayFilename null real (nunca un nombre falso)', () => {
    const { displayName, displayFilename } = buildDisplayName({ versionNumber: null });
    assert.equal(displayName, null);
    assert.equal(displayFilename, null);
  });

  test('displayFilename real nunca incluye caracteres inválidos de Windows', () => {
    const { displayFilename } = buildDisplayName({ nombreVisible: 'Producto: "Especial"?', outputProfileName: 'INSTAGRAM_REEL', versionNumber: 1 });
    assert.doesNotMatch(displayFilename, /[\\/:*?"<>|]/);
  });
});
