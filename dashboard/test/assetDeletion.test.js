// assetDeletion.test.js — eliminación REAL de assets de prueba desde la
// Biblioteca de Assets del Dashboard (corrección 2026-08-26). Cubre: borrado
// físico real cuando no hay dependencias, bloqueo real cuando SÍ las hay
// (ProductionJob/EditableVideoProject/ScheduledPublication/otro asset
// derivado), protección de RAW, y que cancelar/bloquear nunca borra nada.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PORT = '0';
delete process.env.DASHBOARD_NO_LISTEN;

// Aísla ProductionJobStore/EditableProjectStore/AssetLineage a directorios
// temporales -- nunca escribe datos de prueba dentro de los stores reales
// del proyecto (mismo criterio que HYPOTHESIS_BATCH_DATA_ROOT en server.test.js).
const TEST_PRODUCTION_JOB_ROOT = mkdtempSync(join(tmpdir(), 'dash-asset-del-jobs-'));
const TEST_EDITABLE_PROJECT_ROOT = mkdtempSync(join(tmpdir(), 'dash-asset-del-projects-'));
const TEST_LINEAGE_ROOT = mkdtempSync(join(tmpdir(), 'dash-asset-del-lineage-'));
process.env.PRODUCTION_JOB_DATA_ROOT = TEST_PRODUCTION_JOB_ROOT;
process.env.EDITABLE_PROJECT_DATA_ROOT = TEST_EDITABLE_PROJECT_ROOT;
process.env.CONTENT_ORCHESTRATOR_DATA_ROOT = TEST_LINEAGE_ROOT;

const { server } = await import('../server/index.js');
const productionJobStore = await import('../../content-orchestrator/src/productionJobStore.js');
const editableProjectStore = await import('../../content-orchestrator/src/editableProjectStore.js');
const assetLineage = await import('../../content-orchestrator/src/assetLineage.js');
const scheduledPublicationStore = await import('../../publishing-scheduler/src/scheduledPublicationStore.js');

// Carpeta real de prueba DENTRO de video-production/ (nunca fuera de las
// raíces permitidas) -- se crea y se borra por completo al final, nunca
// toca ningún Final Output real ya producido por otro flujo.
const VIDEO_PRODUCTION_ROOT = fileURLToPath(new URL('../../video-production', import.meta.url));
const TEST_ASSETS_DIR = join(VIDEO_PRODUCTION_ROOT, 'dashboard-outputs', '__test-asset-deletion__');

let baseUrl;
before(() => new Promise((resolve, reject) => {
  mkdirSync(TEST_ASSETS_DIR, { recursive: true });
  if (server.listening) { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); return; }
  server.once('listening', () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); });
  server.once('error', reject);
}));
after(async () => {
  await new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); });
  rmSync(TEST_ASSETS_DIR, { recursive: true, force: true });
  rmSync(TEST_PRODUCTION_JOB_ROOT, { recursive: true, force: true });
  rmSync(TEST_EDITABLE_PROJECT_ROOT, { recursive: true, force: true });
  rmSync(TEST_LINEAGE_ROOT, { recursive: true, force: true });
});

let contador = 0;
function nuevoAssetDePrueba() {
  contador += 1;
  const p = join(TEST_ASSETS_DIR, `test-video-${Date.now()}-${contador}.mp4`);
  writeFileSync(p, `contenido real de prueba #${contador}`);
  return p;
}

async function deleteAsset(sourcePath) {
  const res = await fetch(`${baseUrl}/api/assets/delete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourcePath }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe('Eliminación real de assets — sin dependencias', () => {
  test('un asset de prueba real sin ninguna dependencia se elimina del disco de verdad', async () => {
    const p = nuevoAssetDePrueba();
    assert.ok(existsSync(p), 'precondición: el archivo real existe antes de borrar');

    const { status, body } = await deleteAsset(p);
    assert.equal(status, 200);
    assert.equal(body.deleted, true);
    assert.equal(body.fileDeleted, true);
    assert.equal(existsSync(p), false, 'el archivo físico real debe haber desaparecido del disco');
  });

  test('un sourcePath inexistente responde 404, nunca inventa un archivo', async () => {
    const { status } = await deleteAsset(join(TEST_ASSETS_DIR, 'no-existe-de-verdad.mp4'));
    assert.equal(status, 404);
  });
});

describe('Eliminación real de assets — protección de dependencias reales', () => {
  test('bloquea el borrado si un ProductionJob real todavía referencia el archivo (masterPath)', async () => {
    const p = nuevoAssetDePrueba();
    productionJobStore.saveProductionJob({
      job: { status: 'FULL_PRODUCTION', masterPath: p, outputs: [] },
      projectDir: TEST_ASSETS_DIR,
      productionJobId: `test-job-${contador}`,
    });

    const { status, body } = await deleteAsset(p);
    assert.equal(status, 409);
    assert.equal(body.deleted, false);
    assert.match(body.usedBy, /ProductionJob/);
    assert.ok(existsSync(p), 'el archivo real NUNCA debe borrarse cuando hay una dependencia real');
  });

  test('bloquea el borrado si un EditableVideoProject real referencia el archivo (version.masterPath)', async () => {
    const p = nuevoAssetDePrueba();
    editableProjectStore.saveProject({
      projectId: `test-project-${contador}`,
      creativeId: 'test-creative',
      scenes: [],
      versions: [{ versionNumber: 1, status: 'COMPLETED', masterPath: p, outputs: [] }],
    });

    const { status, body } = await deleteAsset(p);
    assert.equal(status, 409);
    assert.match(body.usedBy, /proyecto editable/);
    assert.ok(existsSync(p), 'el archivo real NUNCA debe borrarse cuando hay una dependencia real');
  });

  test('bloquea el borrado si una ScheduledPublication real referencia el archivo', async () => {
    const p = nuevoAssetDePrueba();
    const record = {
      id: `test-pub-${contador}`,
      platform: 'INSTAGRAM',
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      assetPackageSnapshot: { outputAssets: [{ path: p }] },
    };
    scheduledPublicationStore.save(record);
    try {
      const { status, body } = await deleteAsset(p);
      assert.equal(status, 409);
      assert.match(body.usedBy, /publicación/);
      assert.ok(existsSync(p), 'el archivo real NUNCA debe borrarse cuando hay una dependencia real');
    } finally {
      scheduledPublicationStore.del(record.id); // limpieza real -- nunca deja basura en el store real de publicaciones.
    }
  });

  test('bloquea el borrado si otro asset real ya fue derivado de este (lineage real)', async () => {
    const original = nuevoAssetDePrueba();
    const derivado = nuevoAssetDePrueba();
    const sourceAssetId = assetLineage.hashFile(original);
    assetLineage.recordLineage({
      derivedAssetId: assetLineage.hashFile(derivado),
      derivedAssetPath: derivado,
      sourceAssetIds: [sourceAssetId],
      sourceAssetPaths: [original],
      operation: 'EDIT_TEST',
    });

    const { status, body } = await deleteAsset(original);
    assert.equal(status, 409);
    assert.match(body.usedBy, /fuente real de otro asset/);
    assert.ok(existsSync(original), 'el asset fuente real (compartido) nunca debe borrarse mientras algo dependa de él');

    // El derivado, sin nada que dependa de él, sí debe poder borrarse normalmente después.
    const del2 = await deleteAsset(derivado);
    assert.equal(del2.status, 200);
    assert.equal(del2.body.deleted, true);
  });
});

describe('Eliminación real de assets — nunca RAW del catálogo, nunca fuera de las raíces permitidas', () => {
  test('un intento de eliminar una fotografía RAW real del catálogo se rechaza (400), el archivo real sigue intacto', async () => {
    const assetsRes = await fetch(`${baseUrl}/api/assets`);
    const { rawAssets } = await assetsRes.json();
    const raw = rawAssets.find((a) => a.productSlug === 'te-divina' && a.sourcePath);
    assert.ok(raw, 'precondición: debe existir al menos una foto RAW real de te-divina');

    const { status, body } = await deleteAsset(raw.sourcePath);
    assert.equal(status, 400);
    assert.match(body.error, /RAW/);
    assert.ok(existsSync(raw.sourcePath), 'la fotografía real del catálogo nunca debe borrarse por esta vía');
  });

  test('una ruta fuera de cualquier raíz permitida responde 404, nunca toca el filesystem', async () => {
    const { status } = await deleteAsset('C:/Windows/win.ini');
    assert.equal(status, 404);
  });
});
