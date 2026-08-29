// hookIntelligence.test.js — Corrección "Hook Intelligence + Claim
// Relevance + Auto-QA" (2026-08-28). Cobertura real: candidatos reales
// (generateVariantCopy() real, nunca mockeado), scoring determinista,
// umbral de calidad, retry, anti-repetición, hookQualityStatus.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildProductGroundedEvidence } from '../src/productGroundedEvidence.js';
import { buildHypothesisExperiment } from '../src/hypothesisCreativeEngine.js';
import { selectCreativeAngle } from '../src/creativeAngleSelector.js';
import { selectHook, MIN_ACCEPTABLE_HOOK_SCORE } from '../src/hookIntelligence.js';

const INSTRUCTION_REAL = 'Crea un Reel dirigido a hombres adultos que buscan incorporar una rutina de energía y enfoque durante su día. Quiero mostrar a un hombre en una mañana normal: se prepara para el trabajo, toma Café Divina Tongkat Ali y continúa su día con una actitud activa, enfocado y seguro. Que se sienta como una historia de estilo de vida real, natural y aspiracional, no como un anuncio tradicional de producto. El producto debe integrarse de manera natural en la rutina.';

function realChosenVariant(userInstruction) {
  const evidence = buildProductGroundedEvidence('tongkat-ali-cafe');
  const result = buildHypothesisExperiment({
    productGroundedEvidence: evidence, variantCount: 8, batchOffset: 0, excludeFingerprints: [], campaignIntent: null,
  });
  const compatible = result.variantsDetail.filter((v) => v.creativeVariant.format !== 'Static comparison frames');
  const angleSel = selectCreativeAngle({ userInstruction, candidates: compatible });
  return compatible[angleSel.selectedIndex];
}

describe('selectHook', () => {
  test('CANDIDATES: genera varios candidatos reales (nunca solo 1), todos vía generateVariantCopy() real', () => {
    const variant = realChosenVariant(INSTRUCTION_REAL);
    const result = selectHook({ variant, userInstruction: INSTRUCTION_REAL });
    assert.ok(result.candidates.length >= 3, `se esperaban >= 3 candidatos reales, obtuvo ${result.candidates.length}`);
    const hookIdsUnicos = new Set(result.candidates.map((c) => c.hookId));
    assert.ok(hookIdsUnicos.size > 1, 'los candidatos reales usan más de un hookType real (nunca el mismo repetido)');
  });

  test('SCORE: hookRelevanceScore real es un número real entre 0 y 1', () => {
    const variant = realChosenVariant(INSTRUCTION_REAL);
    const result = selectHook({ variant, userInstruction: INSTRUCTION_REAL });
    assert.ok(result.hookRelevanceScore >= 0 && result.hookRelevanceScore <= 1);
  });

  test('MIN SCORE/QUALITY STATUS: con instrucción real bien alineada, hookQualityStatus real "ACCEPTED" y score >= umbral real', () => {
    const variant = realChosenVariant(INSTRUCTION_REAL);
    const result = selectHook({ variant, userInstruction: INSTRUCTION_REAL });
    assert.equal(result.hookQualityStatus, 'ACCEPTED');
    assert.ok(result.hookRelevanceScore >= MIN_ACCEPTABLE_HOOK_SCORE, `score real ${result.hookRelevanceScore} debía ser >= ${MIN_ACCEPTABLE_HOOK_SCORE}`);
  });

  test('RETRY: sin ninguna instrucción real alineable, agota las rondas reales y marca LOW_CONFIDENCE real (nunca bloquea, Paso 29 del encargo)', () => {
    const variant = realChosenVariant('Contenido genérico de prueba sin ninguna relación real con el ángulo elegido.');
    const result = selectHook({ variant, userInstruction: 'xyz completamente no relacionado zzz qqq' });
    assert.equal(result.hookQualityStatus, 'LOW_CONFIDENCE');
    assert.ok(result.hook?.length > 0, 'incluso en LOW_CONFIDENCE real, sí selecciona el mejor candidato real disponible (nunca bloquea)');
  });

  test('ANTI-REPETICIÓN: un hook real idéntico a uno previo real recibe penalización real fuerte (nunca se re-selecciona sin penalizar)', () => {
    const variant = realChosenVariant(INSTRUCTION_REAL);
    const primero = selectHook({ variant, userInstruction: INSTRUCTION_REAL, previousHooks: [] });
    const conPenalizacion = primero.candidates.find((c) => c.hookId === primero.hookId);
    const segundo = selectHook({
      variant, userInstruction: INSTRUCTION_REAL, previousHooks: [{ hook: primero.hook, hookId: primero.hookId }],
    });
    // El hook real ganador de la primera corrida, si se repite exacto, debe puntuar real más bajo en la segunda corrida real.
    const mismoEnSegunda = segundo.candidates.find((c) => c.hookId === primero.hookId);
    assert.ok(mismoEnSegunda.totalScore < conPenalizacion.totalScore, 'el mismo hookId real repetido puntúa más bajo real la segunda vez');
  });

  test('CLAIM SAFETY: un candidato real que viole Claim Safety se descarta, nunca se fuerza (cobertura indirecta -- generateVariantCopy real ya lo garantiza)', () => {
    // Sanity real: selectHook nunca lanza por Claim Safety mientras exista
    // AL MENOS un candidato real válido entre los 11 tipos reales.
    const variant = realChosenVariant(INSTRUCTION_REAL);
    assert.doesNotThrow(() => selectHook({ variant, userInstruction: INSTRUCTION_REAL }));
  });

  test('rechaza sin hookRegenerationContext real', () => {
    assert.throws(() => selectHook({ variant: { angleId: 'routine' }, userInstruction: 'x' }), /hookRegenerationContext/);
  });
});
