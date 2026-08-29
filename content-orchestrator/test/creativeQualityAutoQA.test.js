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
