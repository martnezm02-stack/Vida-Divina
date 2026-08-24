import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyConfidence, CONFIDENCE_LEVELS } from '../../src/performanceAnalysis/confidence.js';

describe('classifyConfidence', () => {
  test('menos del mínimo de evidencia -- LOW', () => {
    assert.equal(classifyConfidence({ evidenceCount: 2, deltaAbs: 0.9, allMetricsAvailable: true }), 'LOW');
  });
  test('evidencia suficiente pero delta pequeño o métrica faltante -- MEDIUM', () => {
    assert.equal(classifyConfidence({ evidenceCount: 20, deltaAbs: 0.05, allMetricsAvailable: true }), 'MEDIUM');
    assert.equal(classifyConfidence({ evidenceCount: 20, deltaAbs: 0.9, allMetricsAvailable: false }), 'MEDIUM');
  });
  test('evidencia >= 2x el mínimo, delta grande y métricas completas -- HIGH', () => {
    assert.equal(classifyConfidence({ evidenceCount: 20, deltaAbs: 0.9, allMetricsAvailable: true }), 'HIGH');
  });
  test('CONFIDENCE_LEVELS expone exactamente LOW/MEDIUM/HIGH', () => {
    assert.deepEqual(CONFIDENCE_LEVELS, ['LOW', 'MEDIUM', 'HIGH']);
  });
});
