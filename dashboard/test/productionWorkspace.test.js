// productionWorkspace.test.js — Corrección "Nueva Biblioteca de Producción
// Activa" (2026-08-29, Paso 35 del encargo). Cubre workspace reset,
// filtrado ACTIVE/LEGACY/TEST/ARCHIVED/UNKNOWN, separación de catálogo,
// producción después del reset, producción antigua oculta, referencias
// preservadas (master/lineage/proyecto) e IDs sin cambios -- mismo patrón
// de aislamiento (DATA_ROOT propio vía env vars) ya usado en
// assetClassification.test.js/projects.test.js.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_JOB_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-job-'));
const TEST_PROJECT_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-project-'));
const TEST_BATCH_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-batch-'));
const TEST_OVERRIDE_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-override-'));
const TEST_WORKSPACE_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-workspace-'));
process.env.PRODUCTION_JOB_DATA_ROOT = TEST_JOB_DATA_ROOT;
process.env.EDITABLE_PROJECT_DATA_ROOT = TEST_PROJECT_DATA_ROOT;
process.env.HYPOTHESIS_BATCH_DATA_ROOT = TEST_BATCH_DATA_ROOT;
process.env.ASSET_OVERRIDE_DATA_ROOT = TEST_OVERRIDE_DATA_ROOT;
process.env.WORKSPACE_DATA_ROOT = TEST_WORKSPACE_DATA_ROOT;

const { saveProductionJob, PRODUCTION_JOBS_DIR } = await import('../../content-orchestrator/src/productionJobStore.js');
const { saveProject } = await import('../../content-orchestrator/src/editableProjectStore.js');
const { saveBatch } = await import('../../creative-intelligence/src/hypothesisBatchStore.js');
const {
  classifyFinalOutputs, classifyRawAsset, classifyAudioAsset, computeVisibilityScope,
} = await import('../server/lib/assetClassification.js');
const {
  getWorkspaceStartedAt, startNewProductionWorkspace, WorkspaceAlreadyStartedError,
} = await import('../server/lib/workspaceStore.js');

after(() => {
  for (const dir of [TEST_JOB_DATA_ROOT, TEST_PROJECT_DATA_ROOT, TEST_BATCH_DATA_ROOT, TEST_OVERRIDE_DATA_ROOT, TEST_WORKSPACE_DATA_ROOT]) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const WORKSPACE_STARTED_AT = '2026-08-29T12:00:00.000Z';
const OLD_CREATED_AT = '2026-08-29T10:00:00.000Z'; // antes del reset real
const NEW_CREATED_AT = '2026-08-29T13:00:00.000Z'; // después del reset real
const TEST_AFTER_RESET_CREATED_AT = '2026-08-29T14:00:00.000Z'; // prueba ejecutada DESPUÉS del reset

const BATCH_ID = 'batch-workspace-test';

function overwriteCreatedAt(productionJobId, createdAtIso) {
  const filePath = path.join(PRODUCTION_JOBS_DIR, `${productionJobId}.json`);
  const record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  record.createdAt = createdAtIso;
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
}

before(() => {
  saveBatch({
    batchId: BATCH_ID, campaignId: 'venus-capsules', batchNumber: 1, generationId: 'gen-1',
    fingerprints: ['fp-1'], createdAt: new Date().toISOString(),
    product: { productId: 'venus-capsules', nombreComercial: 'Divina Venus Capsules', nombreVisible: 'Cápsulas Venus' },
  });

  // Producción real ANTES del reset -- debe quedar LEGACY (Paso 9/10/11: "old production hidden").
  saveProductionJob({
    productionJobId: 'job-old-production',
    job: {
      status: 'FULL_PRODUCTION', campaignId: 'venus-capsules', batchId: BATCH_ID, creativeId: `${BATCH_ID}-v0`,
      masterPath: 'C:\\fake\\produce-old\\master.mp4',
      outputs: [{ profileName: 'INSTAGRAM_REEL', outputPath: 'C:\\fake\\produce-old\\output-INSTAGRAM_REEL.mp4', status: 'COMPLETADO' }],
    },
    projectDir: 'C:\\fake\\produce-old',
  });
  overwriteCreatedAt('job-old-production', OLD_CREATED_AT);

  // Producción real DESPUÉS del reset -- debe ser ACTIVE (Paso 6/23: "production after reset").
  saveProductionJob({
    productionJobId: 'job-new-production',
    job: {
      status: 'FULL_PRODUCTION', campaignId: 'venus-capsules', batchId: BATCH_ID, creativeId: `${BATCH_ID}-v1`,
      masterPath: 'C:\\fake\\produce-new\\master.mp4',
      outputs: [{ profileName: 'INSTAGRAM_REEL', outputPath: 'C:\\fake\\produce-new\\output-INSTAGRAM_REEL.mp4', status: 'COMPLETADO' }],
    },
    projectDir: 'C:\\fake\\produce-new',
  });
  overwriteCreatedAt('job-new-production', NEW_CREATED_AT);

  // Prueba E2E ejecutada DESPUÉS del reset -- NUNCA debe contaminar ACTIVE (Paso 24/25).
  saveProductionJob({
    productionJobId: 'job-test-after-reset',
    job: {
      status: 'FULL_PRODUCTION', campaignId: 'venus-capsules', batchId: 'real-e2e-workspace-test', creativeId: 'real-e2e-workspace-test-v0',
      masterPath: 'C:\\fake\\produce-e2e-after-reset\\master.mp4',
      outputs: [{ profileName: 'INSTAGRAM_REEL', outputPath: 'C:\\fake\\produce-e2e-after-reset\\output-INSTAGRAM_REEL.mp4', status: 'COMPLETADO' }],
    },
    projectDir: 'C:\\fake\\produce-e2e-after-reset',
  });
  overwriteCreatedAt('job-test-after-reset', TEST_AFTER_RESET_CREATED_AT);

  // EditableVideoProject envolviendo el job antiguo -- confirma que master/lineage/proyecto siguen intactos y accesibles aunque el scope sea LEGACY (Paso 27).
  saveProject({
    projectId: 'project-old-wrapped', productionJobId: 'job-old-production', campaignId: 'venus-capsules', batchId: BATCH_ID,
    creativeId: `${BATCH_ID}-v0`, sourceProjectDir: 'C:\\fake\\produce-old',
    createdAt: OLD_CREATED_AT, updatedAt: OLD_CREATED_AT, scenes: [],
    versions: [{
      versionNumber: 1, createdAt: OLD_CREATED_AT, editsSummary: 'Producción original.',
      masterPath: 'C:\\fake\\produce-old\\master.mp4',
      outputs: [{ profileName: 'INSTAGRAM_REEL', outputPath: 'C:\\fake\\produce-old\\output-INSTAGRAM_REEL.mp4', status: 'COMPLETADO' }],
    }],
  });

  // Ahora sí: crear el punto de referencia real DESPUÉS de haber sembrado los datos de prueba.
  startNewProductionWorkspace();
  // Se sobreescribe con un valor FIJO (no el "ahora" real de la llamada
  // anterior) para que las comparaciones de este test sean deterministas.
  fs.writeFileSync(
    path.join(TEST_WORKSPACE_DATA_ROOT, 'productionWorkspace.json'),
    JSON.stringify({ productionWorkspaceStartedAt: WORKSPACE_STARTED_AT }, null, 2),
    'utf8',
  );
});

describe('workspaceStore — reset', () => {
  test('getWorkspaceStartedAt refleja el valor real ya guardado', () => {
    assert.equal(getWorkspaceStartedAt(), WORKSPACE_STARTED_AT);
  });

  test('reintentar el reset SIN force lanza WorkspaceAlreadyStartedError con el valor real ya existente (Paso 18: protección contra sobrescritura accidental)', () => {
    assert.throws(() => startNewProductionWorkspace(), (err) => {
      assert.ok(err instanceof WorkspaceAlreadyStartedError);
      assert.equal(err.existing, WORKSPACE_STARTED_AT);
      return true;
    });
    // Nunca se sobrescribió por el intento fallido.
    assert.equal(getWorkspaceStartedAt(), WORKSPACE_STARTED_AT);
  });

  test('con force:true SÍ reemplaza el punto de referencia real (acción administrativa explícita)', () => {
    const nuevo = startNewProductionWorkspace({ force: true });
    assert.notEqual(nuevo, WORKSPACE_STARTED_AT);
    assert.equal(getWorkspaceStartedAt(), nuevo);
    // Se restaura el valor fijo para no afectar el resto de los tests de este archivo.
    fs.writeFileSync(
      path.join(TEST_WORKSPACE_DATA_ROOT, 'productionWorkspace.json'),
      JSON.stringify({ productionWorkspaceStartedAt: WORKSPACE_STARTED_AT }, null, 2),
      'utf8',
    );
  });
});

describe('computeVisibilityScope — reglas puras', () => {
  test('ARCHIVED gana siempre, sin importar origin/fecha (Paso 14/28)', () => {
    assert.equal(computeVisibilityScope({ origin: 'PRODUCTION', assetStatus: 'ARCHIVED', createdAt: NEW_CREATED_AT, workspaceStartedAt: WORKSPACE_STARTED_AT }), 'ARCHIVED');
  });

  test('sin workspace iniciado, nada es ACTIVE (Paso 34: vista vacía por defecto)', () => {
    assert.equal(computeVisibilityScope({ origin: 'PRODUCTION', assetStatus: 'GENERATED', createdAt: NEW_CREATED_AT, workspaceStartedAt: null }), 'LEGACY');
  });

  test('assetStatus GENERATED por sí solo NUNCA implica ACTIVE (Paso 8)', () => {
    assert.equal(computeVisibilityScope({ origin: 'PRODUCTION', assetStatus: 'GENERATED', createdAt: OLD_CREATED_AT, workspaceStartedAt: WORKSPACE_STARTED_AT }), 'LEGACY');
  });

  test('origin PRODUCTION por sí solo NUNCA implica ACTIVE sin fecha real posterior al reset (Paso 9)', () => {
    assert.equal(computeVisibilityScope({ origin: 'PRODUCTION', assetStatus: 'GENERATED', createdAt: null, workspaceStartedAt: WORKSPACE_STARTED_AT }), 'LEGACY');
  });

  test('TEST nunca es ACTIVE aunque su fecha real sea posterior al reset (Paso 24/25)', () => {
    assert.equal(computeVisibilityScope({ origin: 'TEST', assetStatus: 'GENERATED', createdAt: TEST_AFTER_RESET_CREATED_AT, workspaceStartedAt: WORKSPACE_STARTED_AT }), 'LEGACY');
  });

  test('UNKNOWN permanece LEGACY (Paso 13)', () => {
    assert.equal(computeVisibilityScope({ origin: 'UNKNOWN', assetStatus: 'GENERATED', createdAt: null, workspaceStartedAt: WORKSPACE_STARTED_AT }), 'LEGACY');
  });
});

describe('classifyFinalOutputs — integración real con el workspace', () => {
  function outputEntry(path_) {
    return { path: path_, filename: path_.split('\\').pop(), fileSizeBytes: 1, modifiedAt: new Date().toISOString(), lineage: null };
  }

  test('producción real ANTERIOR al reset queda LEGACY, sin borrar ni alterar ningún ID real (Paso 9/11/33 — old production hidden)', () => {
    const [out] = classifyFinalOutputs([outputEntry('C:\\fake\\produce-old\\output-INSTAGRAM_REEL.mp4')]);
    assert.equal(out.origin, 'PRODUCTION');
    assert.equal(out.visibilityScope, 'LEGACY');
    assert.equal(out.productionJobId, 'job-old-production');
    assert.equal(out.projectId, 'project-old-wrapped'); // referencia de proyecto preservada (Paso 27).
  });

  test('producción real POSTERIOR al reset es ACTIVE automáticamente, sin clasificación manual (Paso 6/23)', () => {
    const [out] = classifyFinalOutputs([outputEntry('C:\\fake\\produce-new\\output-INSTAGRAM_REEL.mp4')]);
    assert.equal(out.origin, 'PRODUCTION');
    assert.equal(out.visibilityScope, 'ACTIVE');
    assert.equal(out.productionJobId, 'job-new-production');
  });

  test('una prueba E2E ejecutada DESPUÉS del reset nunca contamina ACTIVE (Paso 24/25 — test filtering)', () => {
    const [out] = classifyFinalOutputs([outputEntry('C:\\fake\\produce-e2e-after-reset\\output-INSTAGRAM_REEL.mp4')]);
    assert.equal(out.origin, 'TEST');
    assert.equal(out.visibilityScope, 'LEGACY');
  });

  test('un archivo UNKNOWN (sin ProductionJob/EditableProject real) se preserva LEGACY, nunca se descarta (unknown filtering)', () => {
    const [out] = classifyFinalOutputs([outputEntry('C:\\fake\\huerfano-sin-registro\\output-X.mp4')]);
    assert.equal(out.origin, 'UNKNOWN');
    assert.equal(out.visibilityScope, 'LEGACY');
  });

  test('el master real del ProductionJob antiguo sigue siendo referenciable (mismo path, sin cambios) aunque su scope sea LEGACY (master references preserved)', () => {
    const [out] = classifyFinalOutputs([outputEntry('C:\\fake\\produce-old\\master.mp4')]);
    assert.equal(out.visibilityScope, 'LEGACY');
    assert.equal(out.path, 'C:\\fake\\produce-old\\master.mp4');
    assert.equal(out.productionJobId, 'job-old-production'); // IDs unchanged.
  });
});

describe('classifyRawAsset / classifyAudioAsset — separación de catálogo (Paso 32)', () => {
  test('una fotografía de catálogo nunca tiene visibilityScope ACTIVE/LEGACY -- queda fuera del reparto (catalog separation)', () => {
    const out = classifyRawAsset({ assetId: 'abc', productId: 'venus-capsules', originalFilename: 'foto.jpg', productSlug: 'venus-capsules' }, 'Cápsulas Venus');
    assert.equal(out.visibilityScope, null);
    assert.equal(out.origin, 'CATALOG');
  });

  test('un Audio Asset del sistema no archivado tampoco entra al reparto ACTIVE/LEGACY', () => {
    const out = classifyAudioAsset({ filename: 'clip.wav', path: 'C:\\fake\\_audio-cache\\clip.wav', fileSizeBytes: 1, durationSeconds: 1 });
    assert.equal(out.visibilityScope, null);
  });
});
