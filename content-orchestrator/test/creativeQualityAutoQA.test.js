// creativeQualityAutoQA.test.js — Corrección "Cierre del Creative
// Director" (2026-08-28). Cobertura real determinista del Auto-QA global
// -- SOLO lee datos ya generados, nunca reconstruye.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCreativeProposal, MIN_CREATIVE_QUALITY_SCORE } from '../src/creativeQualityAutoQA.js';

const COHERENTE_REAL = Object.freeze({
  primaryAngle: { id: 'aspiration', label: 'Aspiración' },
  hadUserInstruction: true,
  hookRelevanceScore: 0.7,
  hookRepetitionPenalty: 0,
  relevantClaims: { core: ['Líbido saludable'], supporting: ['agudeza mental'], irrelevant: [] },
  structureId: 'HOOK_STORY_PRODUCT_CTA',
  copy: { hook: 'Hook real.', voiceover: ['Hook real.', 'Cuerpo real.'] },
  visualIntent: 'hombre adulto, Aspiración',
  visualContinuityContext: { characterContinuityRequired: true },
});

describe('evaluateCreativeProposal', () => {
  test('SCORE: propuesta real coherente -> creativeQualityScore real >= umbral real, status ACCEPTED', () => {
    const r = evaluateCreativeProposal(COHERENTE_REAL);
    assert.ok(r.creativeQualityScore >= MIN_CREATIVE_QUALITY_SCORE, `score real ${r.creativeQualityScore} debía ser >= ${MIN_CREATIVE_QUALITY_SCORE}`);
    assert.equal(r.creativeQualityStatus, 'ACCEPTED');
  });

  test('COMPONENTS: expone visibilidad interna real de cada componente (Paso 3 del encargo)', () => {
    const r = evaluateCreativeProposal(COHERENTE_REAL);
    for (const key of ['hookScore', 'angleScore', 'claimScore', 'structureScore', 'scriptVoiceScore', 'visualScore', 'continuityScore', 'repetitionPenalty']) {
      assert.equal(typeof r.components[key], 'number', `components.${key} real debe ser un número real`);
    }
  });

  test('INCONSISTENTE: hook bajo + visualIntent genérico real + sin claims -> creativeQualityScore real < umbral, LOW_CONFIDENCE', () => {
    const r = evaluateCreativeProposal({
      ...COHERENTE_REAL,
      hookRelevanceScore: 0.1,
      relevantClaims: { core: [], supporting: [], irrelevant: [] },
      visualIntent: 'Explicación clara y visual relacionada con esta campaña.',
      visualContinuityContext: null,
    });
    assert.ok(r.creativeQualityScore < MIN_CREATIVE_QUALITY_SCORE);
    assert.equal(r.creativeQualityStatus, 'LOW_CONFIDENCE');
  });

  test('NO FALSE BLOCKING: sin userInstruction real (compatibilidad hacia atrás) todavía puede alcanzar un score real razonable, nunca 0', () => {
    const r = evaluateCreativeProposal({
      ...COHERENTE_REAL, hadUserInstruction: false, visualContinuityContext: null,
    });
    assert.ok(r.creativeQualityScore > 0.3, `score real ${r.creativeQualityScore} no debía colapsar a un valor artificialmente bajo`);
  });

  test('REPETITION PENALTY real: reutiliza el repetitionPenalty real de hookIntelligence.js, nunca lo recalcula', () => {
    const alta = evaluateCreativeProposal({ ...COHERENTE_REAL, hookRepetitionPenalty: 0 });
    const baja = evaluateCreativeProposal({ ...COHERENTE_REAL, hookRepetitionPenalty: 1 });
    assert.ok(baja.creativeQualityScore < alta.creativeQualityScore);
  });

  test('script/voiceover desalineado real (hook no encabeza el voiceover) penaliza scriptVoiceScore real', () => {
    const r = evaluateCreativeProposal({ ...COHERENTE_REAL, copy: { hook: 'Hook real.', voiceover: ['Otra cosa real.'] } });
    assert.ok(r.components.scriptVoiceScore < 1);
  });
});

describe('evaluateCreativeProposal — Refinamiento creativo (Paso 14 del encargo: naturalidad/especificidad/claimCoherence/structureDiversityContext)', () => {
  test('WEAK HOOK REPAIRED: hookNaturalnessScore/hookSpecificityScore reales bajos reducen hookScore real, incluso con hookRelevanceScore real decente -- sin ellos (compatibilidad hacia atrás), el componente real no cambia', () => {
    const sinNaturalidad = evaluateCreativeProposal(COHERENTE_REAL);
    const conNaturalidadBaja = evaluateCreativeProposal({
      ...COHERENTE_REAL, hookNaturalnessScore: 0.2, hookSpecificityScore: 0.2,
    });
    assert.ok(conNaturalidadBaja.components.hookScore < sinNaturalidad.components.hookScore, 'hookScore real cae real cuando naturalidad/especificidad reales son bajas');
    assert.ok(conNaturalidadBaja.creativeQualityScore < sinNaturalidad.creativeQualityScore);
  });

  test('GENERIC HOOK REJECTED cuando existe mejor opción real: naturalidad/especificidad reales altas suben el score real compuesto por encima del caso genérico real', () => {
    const generico = evaluateCreativeProposal({ ...COHERENTE_REAL, hookNaturalnessScore: 0.3, hookSpecificityScore: 0.3 });
    const especifico = evaluateCreativeProposal({ ...COHERENTE_REAL, hookNaturalnessScore: 0.95, hookSpecificityScore: 0.9 });
    assert.ok(especifico.creativeQualityScore > generico.creativeQualityScore);
  });

  test('CLAIM COHERENCE: más de 2 claims CORE reales (sobrecargado, Paso 13 del encargo) reduce claimScore real -- 1-2 CORE reales puntúa completo', () => {
    const enfocado = evaluateCreativeProposal({ ...COHERENTE_REAL, relevantClaims: { core: ['Claim A', 'Claim B'], supporting: [] } });
    const sobrecargado = evaluateCreativeProposal({ ...COHERENTE_REAL, relevantClaims: { core: ['Claim A', 'Claim B', 'Claim C', 'Claim D'], supporting: [] } });
    assert.equal(enfocado.components.claimScore, 1);
    assert.ok(sobrecargado.components.claimScore < 1, 'claimCoherence real penaliza real un CORE real sobrecargado');
  });

  test('REPETITIVE STRUCTURE PENALIZED: structureDiversityContext real -- una estructura real ya usada en otra variante real de la campaña reduce structureScore real', () => {
    const nueva = evaluateCreativeProposal(COHERENTE_REAL);
    const repetida = evaluateCreativeProposal({ ...COHERENTE_REAL, previousStructureIds: ['HOOK_STORY_PRODUCT_CTA'] });
    assert.ok(repetida.components.structureScore < nueva.components.structureScore, 'structureScore real cae real cuando esta estructura real ya se usó en otra variante real');
  });

  test('PROPOSAL ACCEPTED AFTER REPAIR: una propuesta real inicialmente LOW_CONFIDENCE (hook genérico + claims vacíos + estructura repetida + visual genérico) puede llegar a ACCEPTED real tras "reparar" cada pieza real (simulado con valores reales mejorados, nunca un segundo score paralelo)', () => {
    const antes = evaluateCreativeProposal({
      ...COHERENTE_REAL,
      hookRelevanceScore: 0.4, hookNaturalnessScore: 0.3, hookSpecificityScore: 0.3,
      relevantClaims: { core: [], supporting: [], irrelevant: [] },
      previousStructureIds: ['HOOK_STORY_PRODUCT_CTA'],
      visualIntent: 'Explicación clara y visual relacionada con esta campaña.',
    });
    assert.equal(antes.creativeQualityStatus, 'LOW_CONFIDENCE');
    const despues = evaluateCreativeProposal({
      ...COHERENTE_REAL, hookRelevanceScore: 0.85, hookNaturalnessScore: 0.9, hookSpecificityScore: 0.85, previousStructureIds: [],
    });
    assert.equal(despues.creativeQualityStatus, 'ACCEPTED');
    assert.ok(despues.creativeQualityScore > antes.creativeQualityScore);
  });
});
