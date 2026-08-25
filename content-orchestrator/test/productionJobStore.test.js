// productionJobStore.test.js — Editable Video Project (2026-08-24).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEST_DATA_ROOT = mkdtempSync(join(tmpdir(), 'production-job-store-test-'));
process.env.PRODUCTION_JOB_DATA_ROOT = TEST_DATA_ROOT;

let saveProductionJob;
let getProductionJob;

before(async () => {
  ({ saveProductionJob, getProductionJob } = await import('../src/productionJobStore.js'));
});
after(() => { rmSync(TEST_DATA_ROOT, { recursive: true, force: true }); delete process.env.PRODUCTION_JOB_DATA_ROOT; });

const JOB_REAL = Object.freeze({ status: 'FULL_PRODUCTION', campaignId: 'c1', creativeId: 'cr1', scenePlan: { scenes: [] } });

describe('productionJobStore — persistencia real e inmutable de un ProductionJob', () => {
  test('guarda y recupera un ProductionJob real', () => {
    const saved = saveProductionJob({ job: JOB_REAL, projectDir: 'C:/fake/dir' });
    const record = getProductionJob(saved.productionJobId);
    assert.equal(record.productionJobId, saved.productionJobId);
    assert.equal(record.projectDir, 'C:/fake/dir');
    assert.deepEqual(record.job, JOB_REAL);
  });

  test('exige "projectDir" real', () => {
    assert.throws(() => saveProductionJob({ job: JOB_REAL, projectDir: '' }), /projectDir/);
  });

  test('exige un job con "status" real', () => {
    assert.throws(() => saveProductionJob({ job: {}, projectDir: 'C:/x' }), /status/);
  });

  test('es inmutable -- guardar dos veces el mismo id real lanza', () => {
    const saved = saveProductionJob({ job: JOB_REAL, projectDir: 'C:/fake/dir2' });
    assert.throws(() => saveProductionJob({ job: JOB_REAL, projectDir: 'C:/otro', productionJobId: saved.productionJobId }), /inmutables/);
  });

  test('getProductionJob sobre un id real inexistente lanza', () => {
    assert.throws(() => getProductionJob('no-existe-real'), /no existe/);
  });
});
