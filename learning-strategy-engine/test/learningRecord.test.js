import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createLearningRecord } from '../src/learningRecord.js';

function validFields(overrides = {}) {
  return {
    learningType: 'FORMAT_LEARNING', scope: 'instagram:format=video (N=8)',
    observation: 'El formato video presenta un engagement 31% superior a la mediana.',
    pattern: 'Diferencia relativa de rendimiento entre formatos',
    evidence: { marketingInsightId: 'mi-1' }, evidenceCount: 8, confidence: 'HIGH',
    implication: 'Existe una señal para priorizar este formato.',
    recommendation: 'Evaluar mayor proporción de este formato en futuras estrategias.',
    platform: 'instagram', format: 'video', relatedInsightIds: ['mi-1'], relatedContentIds: ['c1', 'c2'],
    ...overrides,
  };
}

describe('LearningRecord — contrato (Fase 2)', () => {
  test('learningType debe ser uno de los 10 tipos mínimos', () => {
    assert.throws(() => createLearningRecord(validFields({ learningType: 'MADE_UP' })), /learningType/);
    assert.doesNotThrow(() => createLearningRecord(validFields({ learningType: 'DATA_QUALITY_LEARNING', evidence: { reason: 'x' }, evidenceCount: 0, relatedContentIds: [], relatedInsightIds: [], confidence: 'UNKNOWN' })));
  });

  test('rechaza sin scope/observation/evidence', () => {
    for (const field of ['scope', 'observation', 'evidence']) {
      const fields = validFields();
      delete fields[field];
      assert.throws(() => createLearningRecord(fields), new RegExp(field));
    }
  });

  test('evidenceCount >= 1 obligatorio salvo DATA_QUALITY_LEARNING', () => {
    assert.throws(() => createLearningRecord(validFields({ evidenceCount: 0 })), /evidenceCount/);
    assert.doesNotThrow(() => createLearningRecord({ learningType: 'DATA_QUALITY_LEARNING', scope: 'global', observation: 'Sin datos.', evidence: { reason: 'x' }, evidenceCount: 0, confidence: 'UNKNOWN', relatedInsightIds: [], relatedContentIds: [] }));
  });

  test('relatedContentIds no vacío obligatorio salvo DATA_QUALITY_LEARNING', () => {
    assert.throws(() => createLearningRecord(validFields({ relatedContentIds: [] })), /relatedContentIds/);
  });

  test('rechaza lenguaje causal en observation/pattern/implication/recommendation (Fase 15)', () => {
    assert.throws(() => createLearningRecord(validFields({ observation: 'El video causa más engagement.' })), /causal/);
    assert.throws(() => createLearningRecord(validFields({ implication: 'Esto garantiza mejores resultados.' })), /causal/);
    assert.throws(() => createLearningRecord(validFields({ recommendation: 'Este producto genera más ventas.' })), /causal/);
  });

  test('confidence debe reutilizar HIGH/MEDIUM/LOW/UNKNOWN (Fase 5, sin segundo modelo)', () => {
    assert.throws(() => createLearningRecord(validFields({ confidence: 'CERTAIN' })), /confidence/);
  });

  test('status por defecto ACTIVE, id y generatedAt reales, objeto inmutable', () => {
    const lr = createLearningRecord(validFields());
    assert.equal(lr.status, 'ACTIVE');
    assert.ok(lr.id);
    assert.ok(lr.generatedAt);
    assert.throws(() => { lr.confidence = 'LOW'; }, TypeError);
  });
});
