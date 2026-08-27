// referenceAdaptationProposals.test.js — Adaptar contenido / Video de
// referencia (2026-08-26). Prueba pura (sin servidor, sin motor real): el
// mapeo de un experimento de hipótesis ya construido a 2-3 propuestas
// etiquetadas -- nunca redacta copy, nunca inventa un campo que la
// variante real no tenga.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildAdaptationProposals, ARCHETYPES } from '../server/lib/referenceAdaptationProposals.js';

function fakeVariant(i) {
  return {
    copy: { hook: `Hook real ${i}`, cta: `CTA real ${i}` },
    visualDirection: { aspectRatio: '9:16 REEL / SHORT_VIDEO' },
    creativeVariant: { awareness: 'Problem Aware' },
  };
}
function fakeHypothesisResult(variantCount = 3) {
  return {
    status: 'HYPOTHESIS_EXPERIMENT_READY',
    batchId: 'batch-real-123',
    product: { productId: 'te-divina', nombreComercial: 'TéDivina', nombreVisible: 'Té Divina' },
    variantsDetail: Array.from({ length: variantCount }, (_, i) => fakeVariant(i)),
  };
}
function fakeReferenceAnalysis() {
  return { referenceId: 'ref-1', duration: 22.4, pacing: { sceneCount: 4, avgSceneDurationSeconds: 5.6, cutsPerMinute: 8, rhythm: 'MODERADO' } };
}
/** Forma real de Reference Intelligence (2026-08-27): technicalAnalysis anidado + capas semánticas. */
function fakeReferenceIntelligence({ hookAvailable = false, structureAvailable = false } = {}) {
  return {
    referenceId: 'ref-2',
    technicalAnalysis: fakeReferenceAnalysis(),
    hook: hookAvailable ? { available: true, type: 'question', text: '¿Por qué...?', confidence: 0.65 } : { available: false, reason: 'sin transcript' },
    narrativeStructure: structureAvailable ? { available: true, sequence: ['HOOK', 'PROBLEM', 'CTA'], confidence: 0.5 } : { available: false, reason: 'sin transcript' },
  };
}

describe('buildAdaptationProposals', () => {
  test('lanza si el experimento real no está HYPOTHESIS_EXPERIMENT_READY', () => {
    assert.throws(() => buildAdaptationProposals({ status: 'MISSING_CREATIVE_MATCH' }, fakeReferenceAnalysis()), /HYPOTHESIS_EXPERIMENT_READY/);
  });

  test('con 3 variantes reales, genera exactamente 3 propuestas -- una por arquetipo', () => {
    const proposals = buildAdaptationProposals(fakeHypothesisResult(3), fakeReferenceAnalysis());
    assert.equal(proposals.length, 3);
    assert.deepEqual(proposals.map((p) => p.proposalKey), ARCHETYPES.map((a) => a.key));
    for (const p of proposals) {
      assert.ok(p.label);
      assert.ok(p.keeps);
      assert.ok(p.changes);
    }
  });

  test('cada propuesta usa el nombreVisible del producto, nunca el nombre técnico', () => {
    const [proposal] = buildAdaptationProposals(fakeHypothesisResult(3), fakeReferenceAnalysis());
    assert.equal(proposal.productNombreVisible, 'Té Divina');
    assert.notEqual(proposal.productNombreVisible, 'TéDivina');
  });

  test('la duración/número de escenas objetivo viene del análisis real de la referencia, no inventado', () => {
    const [proposal] = buildAdaptationProposals(fakeHypothesisResult(3), fakeReferenceAnalysis());
    assert.equal(proposal.targetDurationSeconds, 22.4);
    assert.equal(proposal.targetSceneCount, 4);
  });

  test('cada propuesta trae el batchId y variantIndex reales para producir vía el pipeline YA existente (/api/create/produce)', () => {
    const proposals = buildAdaptationProposals(fakeHypothesisResult(3), fakeReferenceAnalysis());
    assert.ok(proposals.every((p) => p.batchId === 'batch-real-123'));
    assert.deepEqual(proposals.map((p) => p.variantIndex), [0, 1, 2]);
  });

  test('el hook/cta de cada propuesta es el copy real de SU variante, nunca copiado del video de referencia', () => {
    const proposals = buildAdaptationProposals(fakeHypothesisResult(3), fakeReferenceAnalysis());
    assert.equal(proposals[0].hook, 'Hook real 0');
    assert.equal(proposals[1].hook, 'Hook real 1');
    assert.equal(proposals[2].hook, 'Hook real 2');
  });

  test('con menos de 3 variantes reales disponibles, genera solo las propuestas que hay evidencia real para respaldar (nunca fabrica una extra)', () => {
    const proposals = buildAdaptationProposals(fakeHypothesisResult(2), fakeReferenceAnalysis());
    assert.equal(proposals.length, 2);
  });

  test('acepta la forma anidada real de Reference Intelligence (technicalAnalysis + hook/narrativeStructure semánticos) -- duración/escenas siguen viniendo del technicalAnalysis real', () => {
    const [proposal] = buildAdaptationProposals(fakeHypothesisResult(3), fakeReferenceIntelligence());
    assert.equal(proposal.targetDurationSeconds, 22.4);
    assert.equal(proposal.targetSceneCount, 4);
  });

  test('sin hook/estructura semánticos detectados (sin transcript real), la propuesta expone available:false explícito -- nunca inventa un tipo de hook', () => {
    const [proposal] = buildAdaptationProposals(fakeHypothesisResult(3), fakeReferenceIntelligence());
    assert.equal(proposal.referenceHook.available, false);
    assert.equal(proposal.referenceStructure.available, false);
    assert.match(proposal.keeps, /ritmo|estructura/i); // cae al texto genérico del arquetipo, nunca a un dato inventado.
  });

  test('con hook/estructura semánticos reales detectados, la propuesta "Adaptación estructural" los cita tal cual', () => {
    const proposals = buildAdaptationProposals(fakeHypothesisResult(3), fakeReferenceIntelligence({ hookAvailable: true, structureAvailable: true }));
    const estructural = proposals.find((p) => p.proposalKey === 'STRUCTURAL');
    assert.equal(estructural.referenceHook.available, true);
    assert.equal(estructural.referenceHook.type, 'question');
    assert.match(estructural.keeps, /question|HOOK → PROBLEM → CTA/);
  });
});
