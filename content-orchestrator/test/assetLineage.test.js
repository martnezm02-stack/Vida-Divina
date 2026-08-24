import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);
const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'co-lineage-test-'));
process.env.CONTENT_ORCHESTRATOR_DATA_ROOT = TEST_DATA_ROOT;

const { recordLineage, getLineage, lineageExists, traceLineageChain, listLineageBySourceAsset, hashFile, LINEAGE_DIR } = await import('../src/assetLineage.js');

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
});

describe('Directorio aislado de prueba', () => {
  test('LINEAGE_DIR apunta al directorio temporal', () => {
    assert.ok(LINEAGE_DIR.startsWith(TEST_DATA_ROOT));
  });
});

describe('hashFile', () => {
  test('hash real y determinista de un archivo real', () => {
    const h1 = hashFile(THIS_FILE);
    assert.match(h1, /^[0-9a-f]{64}$/);
  });

  test('lanza si el archivo no existe', () => {
    assert.throws(() => hashFile('C:/no/existe.mp4'), /no existe el archivo real/);
  });
});

describe('recordLineage / getLineage', () => {
  test('registra y recupera un lineage real con todos los campos', () => {
    const rec = recordLineage({
      derivedAssetId: 'a'.repeat(64), derivedAssetPath: 'C:/out.mp4',
      sourceAssetIds: ['b'.repeat(64), 'c'.repeat(64)], sourceAssetPaths: ['C:/voz.wav', 'C:/foto.jpeg'],
      operation: 'HYPERFRAMES_RENDER', productionArtifactId: 'pa-1', visualProductionPackageId: 'vpp-1',
    });
    assert.equal(rec.derivedAssetId, 'a'.repeat(64));
    assert.equal(lineageExists('a'.repeat(64)), true);
    const recovered = getLineage('a'.repeat(64));
    assert.deepEqual([...recovered.sourceAssetIds], ['b'.repeat(64), 'c'.repeat(64)]);
    assert.equal(recovered.operation, 'HYPERFRAMES_RENDER');
    assert.equal(recovered.productionArtifactId, 'pa-1');
  });

  test('idempotente: registrar el mismo derivedAssetId dos veces no falla ni duplica contenido', () => {
    const args = { derivedAssetId: 'd'.repeat(64), derivedAssetPath: 'C:/out2.mp4', sourceAssetIds: [], sourceAssetPaths: [], operation: 'ADAPT:RESIZE_TO_PROFILE' };
    const r1 = recordLineage(args);
    const r2 = recordLineage(args);
    assert.equal(r1.createdAt, r2.createdAt);
  });

  test('rechaza sin operation -- nunca se registra un lineage sin decir con qué operación se produjo', () => {
    assert.throws(() => recordLineage({ derivedAssetId: 'e'.repeat(64), derivedAssetPath: 'x', sourceAssetIds: [] }), /operation.*obligatorio/);
  });

  test('getLineage lanza para un id inexistente, nunca inventa un registro', () => {
    assert.throws(() => getLineage('no-existe'), /no existe ningún registro de lineage/);
  });
});

describe('traceLineageChain — cadena real: video -> video -> voz/foto', () => {
  test('recorre CREATE -> ADAPT hasta los orígenes reales (assets sin lineage propio)', () => {
    const masterId = 'm'.repeat(64);
    const vozId = 'v'.repeat(64);
    const fotoId = 'f'.repeat(64);
    const derivadoId = 'r'.repeat(64);

    recordLineage({ derivedAssetId: masterId, derivedAssetPath: 'C:/master.mp4', sourceAssetIds: [vozId, fotoId], sourceAssetPaths: ['C:/voz.wav', 'C:/foto.jpeg'], operation: 'HYPERFRAMES_RENDER' });
    recordLineage({ derivedAssetId: derivadoId, derivedAssetPath: 'C:/reel.mp4', sourceAssetIds: [masterId], sourceAssetPaths: ['C:/master.mp4'], operation: 'ADAPT:RESIZE_TO_PROFILE', outputProfileName: 'INSTAGRAM_REEL' });

    const cadena = traceLineageChain(derivadoId);
    const ids = cadena.map((c) => c.assetId);
    assert.ok(ids.includes(derivadoId));
    assert.ok(ids.includes(masterId));
    assert.ok(ids.includes(vozId));
    assert.ok(ids.includes(fotoId));
    // voz y foto son orígenes reales (nunca tuvieron su propio registro de lineage).
    assert.equal(cadena.find((c) => c.assetId === vozId).isOrigin, true);
    assert.equal(cadena.find((c) => c.assetId === derivadoId).isOrigin, false);
    assert.equal(cadena.find((c) => c.assetId === derivadoId).outputProfileName, 'INSTAGRAM_REEL');
  });
});

describe('listLineageBySourceAsset', () => {
  test('encuentra todos los derivados reales de un asset fuente', () => {
    const masterId = 'z'.repeat(64);
    const reelId = 'y'.repeat(63) + '1';
    const storyId = 'y'.repeat(63) + '2';
    recordLineage({ derivedAssetId: reelId, derivedAssetPath: 'C:/reel.mp4', sourceAssetIds: [masterId], sourceAssetPaths: ['C:/master.mp4'], operation: 'ADAPT', outputProfileName: 'INSTAGRAM_REEL' });
    recordLineage({ derivedAssetId: storyId, derivedAssetPath: 'C:/story.mp4', sourceAssetIds: [masterId], sourceAssetPaths: ['C:/master.mp4'], operation: 'ADAPT', outputProfileName: 'INSTAGRAM_STORY' });
    const derivados = listLineageBySourceAsset(masterId);
    assert.equal(derivados.length, 2);
    assert.deepEqual(new Set(derivados.map((d) => d.outputProfileName)), new Set(['INSTAGRAM_REEL', 'INSTAGRAM_STORY']));
  });
});
