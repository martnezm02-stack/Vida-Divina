// visualContinuityContext.test.js — Corrección integral "Crear contenido"
// (2026-08-28), Paso 8/9/10 del encargo. Cobertura real de la extracción
// determinista de contexto visual global desde userInstruction/
// campaignIntent, y de los resolvers que treatment.describe() usa para
// mantener el MISMO sujeto/entorno en toda la pieza.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildVisualContinuityContext, resolveContinuityAudience, resolveContinuityTerritory } from '../src/visualContinuityContext.js';

describe('buildVisualContinuityContext — extracción real desde userInstruction (Paso 8)', () => {
  test('detecta subjectGender/subjectAgeRange/environment reales de una instrucción real', () => {
    const ctx = buildVisualContinuityContext({
      userInstruction: 'Quiero un video de una mujer adulta trabajando en una oficina, mostrando cómo puede integrar el producto en su rutina diaria.',
    });
    assert.equal(ctx.subjectGender, 'female');
    assert.equal(ctx.subjectAgeRange, 'adult');
    assert.equal(ctx.environment, 'oficina moderna');
    assert.match(ctx.subjectDescription, /mujer adulta/);
  });

  test('género ambiguo o no mencionado -> subjectGender null real (nunca asumido)', () => {
    const ctx = buildVisualContinuityContext({ userInstruction: 'Quiero explicar tres beneficios del producto de forma clara.' });
    assert.equal(ctx.subjectGender, null);
  });

  test('sin userInstruction/campaignIntent real -> contexto vacío real (backward compatibility, Paso 31)', () => {
    const ctx = buildVisualContinuityContext({});
    assert.equal(ctx.subjectGender, null);
    assert.equal(ctx.subjectAgeRange, null);
    assert.equal(ctx.subjectDescription, null);
    assert.equal(ctx.environment, null);
  });

  test('wardrobe real derivado del entorno detectado (Corrección "Diversidad Visual", Paso 2)', () => {
    const ctx = buildVisualContinuityContext({ userInstruction: 'Mujer adulta en un gimnasio moderno.' });
    assert.equal(ctx.wardrobe, 'ropa deportiva');
  });

  test('nunca inventa wardrobe/hairstyle/visualStyle sin señal real en el texto', () => {
    const ctx = buildVisualContinuityContext({ userInstruction: 'Quiero explicar tres beneficios del producto de forma clara.' });
    assert.equal(ctx.wardrobe, null);
    assert.equal(ctx.hairstyle, null);
    assert.equal(ctx.visualStyle, null);
  });

  test('characterContinuityRequired real true en cuanto hay señal de identidad/entorno, false sin userInstruction (Paso 2)', () => {
    const conContexto = buildVisualContinuityContext({ userInstruction: 'Mujer adulta en una oficina moderna.' });
    assert.equal(conContexto.characterContinuityRequired, true);
    const sinContexto = buildVisualContinuityContext({});
    assert.equal(sinContexto.characterContinuityRequired, false);
  });
});

describe('resolveContinuityAudience/resolveContinuityTerritory — compatibilidad hacia atrás (Paso 31)', () => {
  test('con contexto real: gana sobre el fallback preexistente', () => {
    const ctx = buildVisualContinuityContext({ userInstruction: 'Hombre adulto en su cocina.' });
    assert.equal(resolveContinuityAudience(ctx, 'fallback viejo'), 'hombre adulto');
    assert.equal(resolveContinuityTerritory(ctx, 'fallback viejo'), 'cocina de casa');
  });

  test('sin contexto real (contexto vacío): preserva EXACTAMENTE el fallback preexistente -- ningún llamador antiguo ve un cambio', () => {
    const ctx = buildVisualContinuityContext({});
    assert.equal(resolveContinuityAudience(ctx, 'la audiencia real de esta campaña'), 'la audiencia real de esta campaña');
    assert.equal(resolveContinuityTerritory(ctx, 'narración de una escena cualquiera'), 'narración de una escena cualquiera');
  });
});
