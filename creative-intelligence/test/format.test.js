import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createFormatDecision, validateFormatDecision, computeAndromedaRisk, FORMAT_LIBRARY } from '../src/format.js';

function sig(overrides = {}) {
  return { narratorType: 'expert', sceneSetup: 'studio', editRhythm: 'slow cut', ...overrides };
}

function baseArgs(overrides = {}) {
  return {
    angleId: 'angle-123',
    recommendedFormat: 'Pharmacist / authority figure in-studio',
    justification: 'Autoridad en bata refuerza credibilidad para un pain de desconfianza médica',
    alternativeFormat: 'POV personal story',
    whyBeatsDefault: 'El UGC genérico no aporta credibilidad clínica que este pain necesita',
    structuralSignature: sig(),
    ...overrides,
  };
}

describe('Format & Diversity Decision — Pillar 4', () => {
  test('crea una decisión de formato válida', () => {
    const decision = createFormatDecision(baseArgs());
    assert.ok(decision.formatId);
    assert.equal(decision.recommendedFormat, 'Pharmacist / authority figure in-studio');
  });

  test('rechaza un formato fuera de la Format Library del framework', () => {
    assert.throws(() => createFormatDecision(baseArgs({ recommendedFormat: 'Anuncio genérico de marca' })));
  });

  test('rechaza sin angleId — format se decide para un angle, no para la marca en general', () => {
    assert.throws(() => createFormatDecision(baseArgs({ angleId: undefined })), /angleId/);
  });

  test('rechaza structuralSignature con valores fuera de las listas fijas', () => {
    assert.throws(() => createFormatDecision(baseArgs({ structuralSignature: sig({ narratorType: 'robot' }) })));
  });

  test('validateFormatDecision revalida un objeto ya construido', () => {
    assert.equal(validateFormatDecision(createFormatDecision(baseArgs())), true);
  });

  test('FORMAT_LIBRARY tiene exactamente los 10 formatos del framework', () => {
    assert.equal(FORMAT_LIBRARY.length, 10);
  });
});

describe('Andromeda Structural Diversity Check — Prompt 8', () => {
  function decisionWith(signature) {
    return createFormatDecision(baseArgs({ structuralSignature: signature }));
  }

  test('LOW risk con 5+ signatures distintas', () => {
    const decisions = [
      decisionWith(sig({ narratorType: 'expert' })),
      decisionWith(sig({ narratorType: 'creator' })),
      decisionWith(sig({ narratorType: 'actor' })),
      decisionWith(sig({ sceneSetup: 'outdoor' })),
      decisionWith(sig({ sceneSetup: 'street' })),
    ];
    const result = computeAndromedaRisk(decisions);
    assert.equal(result.risk, 'LOW');
    assert.equal(result.needsStructuralBreak, false);
  });

  test('HIGH risk cuando 1-2 signatures dominan 80%+', () => {
    const dominant = sig();
    const decisions = [decisionWith(dominant), decisionWith(dominant), decisionWith(dominant), decisionWith(dominant), decisionWith(sig({ narratorType: 'creator' }))];
    const result = computeAndromedaRisk(decisions);
    assert.equal(result.risk, 'HIGH');
    assert.equal(result.needsStructuralBreak, true);
  });

  test('HIGH risk cuando solo existe 1 signature (100% del total)', () => {
    const decisions = [decisionWith(sig()), decisionWith(sig())];
    const result = computeAndromedaRisk(decisions);
    assert.equal(result.risk, 'HIGH');
    assert.equal(result.distinctSignatureCount, 1);
  });

  test('MEDIUM risk con 2-4 signatures distintas sin dominancia extrema', () => {
    const decisions = [decisionWith(sig({ narratorType: 'expert' })), decisionWith(sig({ narratorType: 'creator' })), decisionWith(sig({ narratorType: 'actor' }))];
    const result = computeAndromedaRisk(decisions);
    assert.equal(result.risk, 'MEDIUM');
  });

  test('rechaza una lista vacía', () => {
    assert.throws(() => computeAndromedaRisk([]));
  });
});
