import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createProductionBrief, validateProductionBrief, NOT_ESTABLISHED } from '../src/productionBrief.js';

function baseArgs(overrides = {}) {
  return {
    creativeCellId: 'cell-123',
    persona: 'Madre trabajadora con digestión lenta',
    pain: 'Hinchazón después de comer',
    awareness: 'Problem Aware',
    angle: 'La hinchazón no es normal',
    format: 'Pharmacist / authority figure in-studio',
    hookDirection: 'Farmacéutico mira a cámara: "Nadie te ha dicho esto sobre la hinchazón"',
    mechanismEntry: 'Explica brevemente por qué la digestión lenta genera hinchazón visible',
    credibilityAnchorTiming: 'segundo 8 — bata blanca + placa visible',
    productRevealTiming: 'segundo 20',
    narrator: 'expert',
    setting: 'farmacia',
    runtime: '30-45s',
    ...overrides,
  };
}

describe('ProductionBrief validation — Prompt 10', () => {
  test('crea un ProductionBrief válido con NOT_ESTABLISHED por defecto en métricas', () => {
    const brief = createProductionBrief(baseArgs());
    assert.ok(brief.productionBriefId);
    assert.equal(brief.successMetrics, NOT_ESTABLISHED);
    assert.equal(brief.killCriteria, NOT_ESTABLISHED);
  });

  test('rechaza sin creativeCellId — nunca un brief sin CreativeCell que lo origine', () => {
    assert.throws(() => createProductionBrief(baseArgs({ creativeCellId: undefined })), /creativeCellId/);
  });

  test('rechaza sin hookDirection', () => {
    assert.throws(() => createProductionBrief(baseArgs({ hookDirection: '' })), /hookDirection/);
  });

  test('no inventar métricas universales — rechaza un número desnudo sin fuente', () => {
    assert.throws(() => createProductionBrief(baseArgs({ successMetrics: { targetReach: 5000 } })), /source/);
  });

  test('acepta un benchmark real siempre que declare su fuente', () => {
    const brief = createProductionBrief(baseArgs({ successMetrics: { targetReach: 5000, source: 'promedio histórico Q1 2026, campaña X' } }));
    assert.equal(brief.successMetrics.targetReach, 5000);
  });

  test('validateProductionBrief revalida un objeto ya construido', () => {
    assert.equal(validateProductionBrief(createProductionBrief(baseArgs())), true);
  });
});
