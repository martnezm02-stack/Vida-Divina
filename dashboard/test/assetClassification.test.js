// assetClassification.test.js — Corrección "Normalizar Asset Registry y
// Dashboard Assets" (2026-08-29, Paso 31 del encargo). Cubre displayName,
// origin (PRODUCTION/TEST/UNKNOWN), assetStatus (EDITING/GENERATED/
// FINAL_APPROVED/ARCHIVED), product, campaign, version, UUID oculto del
// nombre principal, separación producción/prueba, preservación de UNKNOWN y
// el filtro de archivado -- mismo patrón de aislamiento (DATA_ROOT propio
// vía env vars) ya usado en dashboard/test/projects.test.js.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_JOB_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-classification-job-'));
const TEST_PROJECT_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-classification-project-'));
const TEST_BATCH_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-classification-batch-'));
const TEST_OVERRIDE_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-classification-override-'));
process.env.PRODUCTION_JOB_DATA_ROOT = TEST_JOB_DATA_ROOT;
process.env.EDITABLE_PROJECT_DATA_ROOT = TEST_PROJECT_DATA_ROOT;
process.env.HYPOTHESIS_BATCH_DATA_ROOT = TEST_BATCH_DATA_ROOT;
process.env.ASSET_OVERRIDE_DATA_ROOT = TEST_OVERRIDE_DATA_ROOT;

const { saveProductionJob } = await import('../../content-orchestrator/src/productionJobStore.js');
const { saveProject } = await import('../../content-orchestrator/src/editableProjectStore.js');
const { saveBatch } = await import('../../creative-intelligence/src/hypothesisBatchStore.js');
const { setArchived } = await import('../server/lib/assetOverrideStore.js');
const { classifyFinalOutputs, classifyAudioAsset, classifyRawAsset, computeAssetStatus } = await import('../server/lib/assetClassification.js');

after(() => {
  for (const dir of [TEST_JOB_DATA_ROOT, TEST_PROJECT_DATA_ROOT, TEST_BATCH_DATA_ROOT, TEST_OVERRIDE_DATA_ROOT]) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const VENUS_BATCH_ID = 'batch-venus-classification-test';
const REAL_E2E_BATCH_ID = 'real-e2e-classification-test';

before(() => {
  saveBatch({
    batchId: VENUS_BATCH_ID, campaignId: 'venus-capsules', batchNumber: 1, generationId: 'gen-1',
    fingerprints: ['fp-1'], createdAt: new Date().toISOString(),
    product: { productId: 'venus-capsules', nombreComercial: 'Divina Venus Capsules', nombreVisible: 'Cápsulas Venus' },
  });

  // Job "plano" (nunca abierto en el editor) -- origin PRODUCTION esperado.
  saveProductionJob({
    productionJobId: 'job-plain-production',
    job: {
      status: 'FULL_PRODUCTION', campaignId: 'venus-capsules', batchId: VENUS_BATCH_ID,
      creativeId: `${VENUS_BATCH_ID}-v0`, conceptId: 'problem_agitation', angleId: null,
      masterPath: 'C:\\fake\\produce-plain\\master.mp4',
      outputs: [{ profileName: 'INSTAGRAM_REEL', outputPath: 'C:\\fake\\produce-plain\\output-INSTAGRAM_REEL.mp4', status: 'COMPLETADO' }],
    },
    projectDir: 'C:\\fake\\produce-plain',
  });

  // Job real-e2e (batchId auto-declarado de prueba) -- origin TEST esperado.
  saveProductionJob({
    productionJobId: 'job-real-e2e',
    job: {
      status: 'FULL_PRODUCTION', campaignId: 'venus-capsules', batchId: REAL_E2E_BATCH_ID,
      creativeId: `${REAL_E2E_BATCH_ID}-v0`,
      masterPath: 'C:\\fake\\produce-e2e\\master.mp4',
      outputs: [{ profileName: 'INSTAGRAM_REEL', outputPath: 'C:\\fake\\produce-e2e\\output-INSTAGRAM_REEL.mp4', status: 'COMPLETADO' }],
    },
    projectDir: 'C:\\fake\\produce-e2e',
  });

  // Job envuelto por un EditableVideoProject con 2 versiones reales -- v2 ya
  // trae displayName propio (como projects.js#handleRenderProject de verdad
  // los construye), v1 no.
  saveProductionJob({
    productionJobId: 'job-wrapped',
    job: {
      status: 'FULL_PRODUCTION', campaignId: 'venus-capsules', batchId: VENUS_BATCH_ID,
      creativeId: `${VENUS_BATCH_ID}-v1`, conceptId: 'comparison', angleId: null,
      masterPath: 'C:\\fake\\produce-wrapped\\master.mp4',
      outputs: [{ profileName: 'TIKTOK', outputPath: 'C:\\fake\\produce-wrapped\\output-TIKTOK.mp4', status: 'COMPLETADO' }],
    },
    projectDir: 'C:\\fake\\produce-wrapped',
  });
  saveProject({
    projectId: 'project-wrapped-1', productionJobId: 'job-wrapped', campaignId: 'venus-capsules', batchId: VENUS_BATCH_ID,
    creativeId: `${VENUS_BATCH_ID}-v1`, sourceProjectDir: 'C:\\fake\\produce-wrapped',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    scenes: [],
    versions: [
      {
        versionNumber: 1, createdAt: new Date().toISOString(), editsSummary: 'Producción original.',
        masterPath: 'C:\\fake\\produce-wrapped\\master.mp4',
        outputs: [{ profileName: 'TIKTOK', outputPath: 'C:\\fake\\produce-wrapped\\output-TIKTOK.mp4', status: 'COMPLETADO' }],
      },
      {
        versionNumber: 2, createdAt: new Date().toISOString(), editsSummary: 'voz regenerada en scene-1.',
        masterPath: 'C:\\fake\\produce-wrapped\\versions\\v2\\master.mp4',
        outputs: [{
          profileName: 'TIKTOK', outputPath: 'C:\\fake\\produce-wrapped\\versions\\v2\\output-TIKTOK.mp4', status: 'COMPLETADO',
          displayName: 'Cápsulas Venus — Comparison — TikTok — v2', displayFilename: 'Cápsulas Venus — Comparison — TikTok — v2.mp4',
        }],
      },
    ],
  });
});

function findByPath(list, p) {
  return list.find((a) => a.path === p);
}

describe('assetClassification — origin', () => {
  test('un ProductionJob real (sin marcador de prueba) se clasifica PRODUCTION', () => {
    const [out] = classifyFinalOutputs([{ path: 'C:\\fake\\produce-plain\\output-INSTAGRAM_REEL.mp4', filename: 'output-INSTAGRAM_REEL.mp4', fileSizeBytes: 1000, modifiedAt: new Date().toISOString(), lineage: null }]);
    assert.equal(out.origin, 'PRODUCTION');
    assert.ok(out.originEvidence.length > 0);
  });

  test('batchId con literal "real-e2e" se clasifica TEST', () => {
    const [out] = classifyFinalOutputs([{ path: 'C:\\fake\\produce-e2e\\output-INSTAGRAM_REEL.mp4', filename: 'output-INSTAGRAM_REEL.mp4', fileSizeBytes: 1000, modifiedAt: new Date().toISOString(), lineage: null }]);
    assert.equal(out.origin, 'TEST');
  });

  test('separación real producción/prueba: ambos coexisten sin contaminarse en la misma llamada', () => {
    const results = classifyFinalOutputs([
      { path: 'C:\\fake\\produce-plain\\output-INSTAGRAM_REEL.mp4', filename: 'a.mp4', fileSizeBytes: 1, modifiedAt: new Date().toISOString(), lineage: null },
      { path: 'C:\\fake\\produce-e2e\\output-INSTAGRAM_REEL.mp4', filename: 'b.mp4', fileSizeBytes: 1, modifiedAt: new Date().toISOString(), lineage: null },
    ]);
    assert.equal(findByPath(results, 'C:\\fake\\produce-plain\\output-INSTAGRAM_REEL.mp4').origin, 'PRODUCTION');
    assert.equal(findByPath(results, 'C:\\fake\\produce-e2e\\output-INSTAGRAM_REEL.mp4').origin, 'TEST');
  });

  test('un archivo sin ningún ProductionJob/EditableProject real asociado se preserva como UNKNOWN (nunca se descarta ni se fuerza a TEST/PRODUCTION)', () => {
    const [out] = classifyFinalOutputs([{ path: 'C:\\fake\\huerfano-sin-registro\\output-X.mp4', filename: 'output-X.mp4', fileSizeBytes: 500, modifiedAt: new Date().toISOString(), lineage: null }]);
    assert.equal(out.origin, 'UNKNOWN');
    assert.equal(out.productId, null);
    assert.equal(out.displayName, null);
    assert.equal(out.path, 'C:\\fake\\huerfano-sin-registro\\output-X.mp4'); // sigue presente en la lista, nunca desaparece.
  });
});

describe('assetClassification — product / campaign / version / displayName', () => {
  test('productId y nombreVisible reales se resuelven vía el Batch real (nunca inventados)', () => {
    const [out] = classifyFinalOutputs([{ path: 'C:\\fake\\produce-plain\\output-INSTAGRAM_REEL.mp4', filename: 'a.mp4', fileSizeBytes: 1, modifiedAt: new Date().toISOString(), lineage: null }]);
    assert.equal(out.productId, 'venus-capsules');
    assert.equal(out.nombreVisible, 'Cápsulas Venus');
  });

  test('campaignId real se humaniza a un campaignLabel legible sin inventar un nombre nuevo', () => {
    const [out] = classifyFinalOutputs([{ path: 'C:\\fake\\produce-plain\\output-INSTAGRAM_REEL.mp4', filename: 'a.mp4', fileSizeBytes: 1, modifiedAt: new Date().toISOString(), lineage: null }]);
    assert.equal(out.campaignId, 'venus-capsules');
    assert.equal(out.campaignLabel, 'Venus Capsules');
  });

  test('displayName real sigue el patrón Producto — Concepto — Formato — versión', () => {
    const [out] = classifyFinalOutputs([{ path: 'C:\\fake\\produce-plain\\output-INSTAGRAM_REEL.mp4', filename: 'a.mp4', fileSizeBytes: 1, modifiedAt: new Date().toISOString(), lineage: null }]);
    assert.equal(out.displayName, 'Cápsulas Venus — Problem Agitation — Instagram Reel — v1');
  });

  test('displayName NUNCA contiene el UUID/productionJobId técnico -- el UUID vive aparte, en su propio campo', () => {
    const [out] = classifyFinalOutputs([{ path: 'C:\\fake\\produce-plain\\output-INSTAGRAM_REEL.mp4', filename: 'a.mp4', fileSizeBytes: 1, modifiedAt: new Date().toISOString(), lineage: null }]);
    assert.equal(out.productionJobId, 'job-plain-production');
    assert.ok(!out.displayName.includes('job-plain-production'));
  });

  test('un ProductionJob nunca abierto en el editor reporta versionNumber 1, sin projectId', () => {
    const [out] = classifyFinalOutputs([{ path: 'C:\\fake\\produce-plain\\output-INSTAGRAM_REEL.mp4', filename: 'a.mp4', fileSizeBytes: 1, modifiedAt: new Date().toISOString(), lineage: null }]);
    assert.equal(out.versionNumber, 1);
    assert.equal(out.projectId, null);
  });

  test('la v2 de un EditableVideoProject reporta versionNumber 2, projectId real, y REUTILIZA el displayName ya construido por projects.js (nunca lo recalcula)', () => {
    const [out] = classifyFinalOutputs([{ path: 'C:\\fake\\produce-wrapped\\versions\\v2\\output-TIKTOK.mp4', filename: 'output-TIKTOK.mp4', fileSizeBytes: 1, modifiedAt: new Date().toISOString(), lineage: null }]);
    assert.equal(out.versionNumber, 2);
    assert.equal(out.projectId, 'project-wrapped-1');
    assert.equal(out.displayName, 'Cápsulas Venus — Comparison — TikTok — v2');
  });

  test('la v1 del mismo proyecto (sin displayName propio persistido) lo calcula igual, vía el mismo buildDisplayName', () => {
    const [out] = classifyFinalOutputs([{ path: 'C:\\fake\\produce-wrapped\\output-TIKTOK.mp4', filename: 'output-TIKTOK.mp4', fileSizeBytes: 1, modifiedAt: new Date().toISOString(), lineage: null }]);
    assert.equal(out.versionNumber, 1);
    assert.equal(out.projectId, 'project-wrapped-1');
    assert.equal(out.displayName, 'Cápsulas Venus — Comparison — TikTok — v1');
  });
});

describe('assetClassification — assetStatus', () => {
  test('sin evidencia de aprobación/edición/archivado, un output real es GENERATED (nunca "aprobado" solo por terminar de renderizar)', () => {
    assert.equal(computeAssetStatus({ sourcePath: 'C:\\fake\\x.mp4', lineage: null, approvedPaths: new Set(), archivedPaths: new Set() }), 'GENERATED');
  });

  test('lineage.operation que empieza con EDIT se clasifica EDITING', () => {
    assert.equal(computeAssetStatus({ sourcePath: 'C:\\fake\\x.mp4', lineage: { operation: 'EDIT_ENHANCE' }, approvedPaths: new Set(), archivedPaths: new Set() }), 'EDITING');
  });

  test('un sourcePath con approvedAt real (ScheduledPublication.approve()) se clasifica FINAL_APPROVED', () => {
    const approved = new Set(['c:\\fake\\x.mp4']);
    assert.equal(computeAssetStatus({ sourcePath: 'C:\\fake\\x.mp4', lineage: null, approvedPaths: approved, archivedPaths: new Set() }), 'FINAL_APPROVED');
  });

  test('ARCHIVED tiene prioridad sobre FINAL_APPROVED (un asset archivado no debe volver a aparecer como activo)', () => {
    const approved = new Set(['c:\\fake\\x.mp4']);
    const archived = new Set(['c:\\fake\\x.mp4']);
    assert.equal(computeAssetStatus({ sourcePath: 'C:\\fake\\x.mp4', lineage: null, approvedPaths: approved, archivedPaths: archived }), 'ARCHIVED');
  });
});

describe('assetClassification — archive filter (metadata pura, nunca borra el archivo)', () => {
  test('setArchived + classifyAudioAsset refleja ARCHIVED sin tocar el archivo físico', () => {
    const audioPath = 'C:\\fake\\_audio-cache\\clip-real.wav';
    let classified = classifyAudioAsset({ filename: 'clip-real.wav', path: audioPath, fileSizeBytes: 100, durationSeconds: 3 });
    assert.equal(classified.assetStatus, 'GENERATED');

    setArchived(audioPath, true);
    classified = classifyAudioAsset({ filename: 'clip-real.wav', path: audioPath, fileSizeBytes: 100, durationSeconds: 3 });
    assert.equal(classified.assetStatus, 'ARCHIVED');
    assert.equal(fs.existsSync(audioPath), false); // nunca se crea/toca el archivo físico -- solo metadata.

    setArchived(audioPath, false);
    classified = classifyAudioAsset({ filename: 'clip-real.wav', path: audioPath, fileSizeBytes: 100, durationSeconds: 3 });
    assert.equal(classified.assetStatus, 'GENERATED');
  });
});

describe('assetClassification — fotografías de catálogo (CATALOG)', () => {
  test('una fotografía RAW real nunca se mezcla con GENERADO -- origin fijo CATALOG', () => {
    const out = classifyRawAsset({ assetId: 'abc123', productId: 'venus-capsules', originalFilename: 'foto.jpg', productSlug: 'venus-capsules' }, 'Cápsulas Venus');
    assert.equal(out.origin, 'CATALOG');
    assert.equal(out.assetType, 'PHOTO');
    assert.equal(out.displayName, 'Cápsulas Venus — Fotografía de producto');
  });

  test('sin nombreVisible real disponible, no se inventa un displayName', () => {
    const out = classifyRawAsset({ assetId: 'abc123', productId: 'sin-catalogo', originalFilename: 'foto.jpg', productSlug: 'sin-catalogo' }, null);
    assert.equal(out.displayName, null);
  });
});
