// visualContinuityContext.test.js — Corrección integral "Crear contenido"
// (2026-08-28), Paso 8/9/10 del encargo. Cobertura real de la extracción
// determinista de contexto visual global desde userInstruction/
// campaignIntent, y de los resolvers que treatment.describe() usa para
// mantener el MISMO sujeto/entorno en toda la pieza.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVisualContinuityContext, resolveContinuityAudience, resolveContinuityTerritory,
  computeInstructionCoverage, applyPromptGate, MIN_INSTRUCTION_COVERAGE_SCORE,
} from '../src/visualContinuityContext.js';

// Instrucción real de Venus Capsules (Corrección "Corrección integral del
// flujo de Crear contenido", 2026-08-28, Paso 33/40 del encargo) -- caso
// real reportado (Problema 2): esta instrucción real, con el bug real de
// contains() (substring desnudo), degradaba "mujer adulta" a "persona
// adulto" porque "posteriormente"/"de manera natural" contienen "men"/
// "man" como substring real.
const VENUS_INSTRUCTION_REAL = 'Quiero contar una historia cotidiana y natural: una mujer adulta atraviesa un día de trabajo en el que se siente incómoda o distraída por situaciones relacionadas con su ciclo, continúa con su rutina diaria y posteriormente incorpora Cápsulas Venus de manera natural. El video debe mostrar una evolución visual desde una situación inicial de incomodidad hacia un estado final más tranquilo, activo y seguro.';

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

describe('SUBJECT LOCK — Corrección "Corrección integral del flujo de Crear contenido" (Paso 7/8/40 del encargo, caso real Venus)', () => {
  test('BUG REAL CORREGIDO: la instrucción real de Venus (con "posteriormente"/"de manera natural") ya NO degrada female->null (root cause real: contains() era substring desnudo, "posteriormente" contiene "men", "manera" contiene "man")', () => {
    const ctx = buildVisualContinuityContext({ userInstruction: VENUS_INSTRUCTION_REAL });
    assert.equal(ctx.subjectGender, 'female', 'subjectGender real NUNCA debe degradarse a null por un falso positivo real de substring');
    assert.notEqual(ctx.subjectGender, null);
  });

  test('userInstruction "woman"/"mujer" -> female: propagación real completa subjectGender -> subjectDescription -> narrativeIntent', () => {
    const ctx = buildVisualContinuityContext({ userInstruction: 'Quiero mostrar a a woman in her adult routine.' });
    assert.equal(ctx.subjectGender, 'female');
    const ctx2 = buildVisualContinuityContext({ userInstruction: VENUS_INSTRUCTION_REAL });
    assert.match(ctx2.subjectDescription, /mujer/);
    assert.doesNotMatch(ctx2.subjectDescription, /persona adulto/);
  });

  test('narrativeIntent persistence: EXACTAMENTE el texto real de userInstruction, nunca resumido/alterado (Paso 6/41 del encargo)', () => {
    const ctx = buildVisualContinuityContext({ userInstruction: VENUS_INSTRUCTION_REAL });
    assert.equal(ctx.narrativeIntent, VENUS_INSTRUCTION_REAL);
  });

  test('sin userInstruction real -> narrativeIntent null real, nunca inventado', () => {
    const ctx = buildVisualContinuityContext({});
    assert.equal(ctx.narrativeIntent, null);
  });
});

describe('computeInstructionCoverage / applyPromptGate — Paso 14/15/36/37/43 del encargo', () => {
  const ctx = buildVisualContinuityContext({ userInstruction: 'una mujer adulta trabaja en una oficina' });

  test('INSTRUCTION COVERAGE: prompt real que SÍ incluye sujeto/entorno reales -> score real 1.0', () => {
    const r = computeInstructionCoverage({ context: ctx, combinedPromptText: 'mujer adulta, oficina moderna, hace su rutina diaria.' });
    assert.equal(r.instructionCoverageScore, 1);
    assert.deepEqual(r.missing, []);
  });

  test('GENERIC PROMPT REJECTION: prompt real reducido a "persona adulto, estilo genérico" -> score real bajo, subjectGender real en missing', () => {
    const r = computeInstructionCoverage({ context: ctx, combinedPromptText: 'persona adulto, estilo genérico.' });
    assert.ok(r.instructionCoverageScore < MIN_INSTRUCTION_COVERAGE_SCORE);
    assert.ok(r.missing.includes('subjectGender'));
  });

  test('sin userInstruction real (characterContinuityRequired false) -> score real 1 (compatibilidad hacia atrás, Paso 31)', () => {
    const sinContexto = buildVisualContinuityContext({});
    const r = computeInstructionCoverage({ context: sinContexto, combinedPromptText: 'cualquier texto real.' });
    assert.equal(r.instructionCoverageScore, 1);
  });

  test('PROMPT GATE: un prompt real INVALID se repara real reinyectando SOLO las señales reales ya conocidas (nunca inventa una nueva)', () => {
    const gate = applyPromptGate({ context: ctx, scenePrompt: 'persona adulto, estilo genérico.' });
    assert.equal(gate.repaired, true);
    assert.equal(gate.status, 'VALID');
    assert.match(gate.prompt, /mujer/);
    assert.match(gate.prompt, /oficina/);
  });

  test('PROMPT GATE: un prompt real ya VALID no se toca (repaired:false, mismo texto real)', () => {
    const gate = applyPromptGate({ context: ctx, scenePrompt: 'mujer adulta, oficina moderna, revisa documentos.' });
    assert.equal(gate.repaired, false);
    assert.equal(gate.status, 'VALID');
    assert.equal(gate.prompt, 'mujer adulta, oficina moderna, revisa documentos.');
  });
});
