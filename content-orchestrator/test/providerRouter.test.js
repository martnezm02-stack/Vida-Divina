// providerRouter.test.js — Creative Production Orchestrator (2026-08-24).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { selectProvider, PROVIDER_TASKS } from '../src/providerRouter.js';

function fakeProvider(providerName, configured) {
  return { providerName, isConfigured: () => configured };
}

describe('selectProvider', () => {
  test('rechaza un task inválido', () => {
    assert.throws(() => selectProvider({ task: 'INVENTADO', candidates: [{ provider: fakeProvider('x', true) }] }), /task/);
  });

  test('rechaza candidates vacío', () => {
    assert.throws(() => selectProvider({ task: 'image', candidates: [] }), /candidates/);
  });

  test('elige el primer candidato real configurado, en el orden dado (prioridad = orden)', () => {
    const r = selectProvider({
      task: 'video',
      candidates: [
        { provider: fakeProvider('local', false), estimatedCost: 0 },
        { provider: fakeProvider('minimax', true), estimatedCost: 0.5 },
      ],
    });
    assert.equal(r.chosen.providerName, 'minimax');
    assert.equal(r.chosenEstimatedCost, 0.5);
    assert.equal(r.alternatives.length, 2);
  });

  test('ningún candidato real configurado -> chosen:null, razón explícita, nunca un fallback silencioso', () => {
    const r = selectProvider({ task: 'music', candidates: [{ provider: fakeProvider('a', false) }, { provider: fakeProvider('b', false) }] });
    assert.equal(r.chosen, null);
    assert.match(r.reason, /ningún candidato/);
  });

  test('PROVIDER_TASKS expone los 4 tasks reales', () => {
    assert.deepEqual([...PROVIDER_TASKS], ['image', 'video', 'music', 'enhancement']);
  });
});
