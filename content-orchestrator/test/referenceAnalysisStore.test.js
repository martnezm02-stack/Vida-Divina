// referenceAnalysisStore.test.js — Adaptar contenido / Video de referencia
// (2026-08-26). Persistencia real, aislada en un directorio temporal (mismo
// criterio que assetLineage.test.js) -- nunca toca content-orchestrator/data/ real.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'co-refanalysis-test-'));
process.env.CONTENT_ORCHESTRATOR_DATA_ROOT = TEST_DATA_ROOT;

const {
  saveReferenceAnalysis, getReferenceAnalysis, referenceAnalysisExists, listReferenceAnalyses, REFERENCE_ANALYSIS_DIR,
} = await import('../src/referenceAnalysisStore.js');

after(() => { fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true }); });

function fakeAnalysis(referenceId, overrides = {}) {
  return { referenceId, duration: 12.5, aspectRatio: '9:16', scenes: [], pacing: { sceneCount: 1 }, ...overrides };
}

describe('Directorio aislado de prueba', () => {
  test('REFERENCE_ANALYSIS_DIR apunta al directorio temporal', () => {
    assert.ok(REFERENCE_ANALYSIS_DIR.startsWith(TEST_DATA_ROOT));
  });
});

describe('saveReferenceAnalysis / getReferenceAnalysis', () => {
  test('un ReferenceAnalysis real se persiste y se recupera igual', () => {
    const analysis = fakeAnalysis('ref-abc123');
    saveReferenceAnalysis(analysis);
    const recovered = getReferenceAnalysis('ref-abc123');
    assert.deepEqual(recovered, analysis);
  });

  test('lanza sin referenceId real', () => {
    assert.throws(() => saveReferenceAnalysis({ duration: 1 }), /referenceId/);
  });

  test('getReferenceAnalysis de un id que nunca se analizó -- null explícito, nunca inventa uno', () => {
    assert.equal(getReferenceAnalysis('id-que-no-existe-de-verdad'), null);
  });

  test('referenceAnalysisExists refleja el estado real', () => {
    assert.equal(referenceAnalysisExists('ref-xyz'), false);
    saveReferenceAnalysis(fakeAnalysis('ref-xyz'));
    assert.equal(referenceAnalysisExists('ref-xyz'), true);
  });

  test('reanalizar el MISMO referenceId real (mismo hash de archivo) sobrescribe de forma idempotente -- nunca duplica', () => {
    saveReferenceAnalysis(fakeAnalysis('ref-dup', { duration: 5 }));
    saveReferenceAnalysis(fakeAnalysis('ref-dup', { duration: 5 }));
    const all = listReferenceAnalyses().filter((a) => a.referenceId === 'ref-dup');
    assert.equal(all.length, 1);
  });
});

describe('listReferenceAnalyses', () => {
  test('incluye todos los análisis reales ya persistidos en este directorio aislado', () => {
    saveReferenceAnalysis(fakeAnalysis('ref-list-1'));
    saveReferenceAnalysis(fakeAnalysis('ref-list-2'));
    const ids = listReferenceAnalyses().map((a) => a.referenceId);
    assert.ok(ids.includes('ref-list-1'));
    assert.ok(ids.includes('ref-list-2'));
  });
});
