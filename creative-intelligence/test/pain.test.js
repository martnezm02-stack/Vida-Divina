import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPain, validatePain, comparePainDepth, groupByCluster } from '../src/pain.js';

function baseArgs(overrides = {}) {
  return {
    personaId: 'persona-123',
    painPoint: 'Sentirse hinchada e incómoda después de cada comida',
    plainCustomerLanguage: 'me siento como globo',
    verbatimQuote: 'literal me siento como globo después de comer, ya ni quiero salir',
    sourcePlatform: 'reddit:r/wellness',
    frequency: 1,
    ...overrides,
  };
}

describe('Pain validation — Pillar 2', () => {
  test('crea un Pain válido con evidencia real', () => {
    const pain = createPain(baseArgs());
    assert.ok(pain.painId);
    assert.equal(pain.highFrequencyAnchor, false);
  });

  test('un pain requiere evidencia — rechaza sin verbatimQuote', () => {
    assert.throws(() => createPain(baseArgs({ verbatimQuote: '' })), /verbatimQuote/);
  });

  test('un pain requiere evidencia — rechaza sin sourcePlatform', () => {
    assert.throws(() => createPain(baseArgs({ sourcePlatform: '' })), /sourcePlatform/);
  });

  test('un pain requiere evidencia — rechaza sin personaId (no existe pain sin persona)', () => {
    assert.throws(() => createPain(baseArgs({ personaId: undefined })), /personaId/);
  });

  test('marca HIGH-FREQUENCY ANCHOR con 3+ apariciones (Prompt 3)', () => {
    const pain = createPain(baseArgs({ frequency: 3 }));
    assert.equal(pain.highFrequencyAnchor, true);
  });

  test('no marca HIGH-FREQUENCY ANCHOR con 2 apariciones', () => {
    const pain = createPain(baseArgs({ frequency: 2 }));
    assert.equal(pain.highFrequencyAnchor, false);
  });

  test('validatePain revalida un objeto ya construido', () => {
    const pain = createPain(baseArgs());
    assert.equal(validatePain(pain), true);
  });
});

describe('Pain Pressure Test — Prompt 4', () => {
  test('comparePainDepth exige surfaceSymptom y rootPain reales', () => {
    assert.throws(() => comparePainDepth({ surfaceSymptom: '', rootPain: 'algo' }));
    const result = comparePainDepth({ surfaceSymptom: 'me siento hinchada', rootPain: 'miedo a no ser tomada en serio por mi cuerpo' });
    assert.equal(result.isSameText, false);
  });

  test('groupByCluster agrupa pains ya etiquetados, sin clasificar nada nuevo', () => {
    const p1 = createPain(baseArgs({ cluster: 'digestion' }));
    const p2 = createPain(baseArgs({ cluster: 'digestion' }));
    const p3 = createPain(baseArgs({ cluster: null }));
    const grouped = groupByCluster([p1, p2, p3]);
    assert.equal(grouped.get('digestion').length, 2);
    assert.equal(grouped.get('UNCLUSTERED').length, 1);
  });
});
