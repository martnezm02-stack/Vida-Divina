import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaHostingService } from '../src/mediaHostingService.js';
import { MockMediaHostingProvider } from '../src/mockMediaHostingProvider.js';

function tempFile(name, content = 'contenido real de prueba') {
  const dir = mkdtempSync(join(tmpdir(), 'mhs-test-'));
  const p = join(dir, name);
  writeFileSync(p, content);
  return p;
}

function mockService() {
  const dir = mkdtempSync(join(tmpdir(), 'mock-r2-'));
  return new MediaHostingService({ provider: 'mock', mockProvider: new MockMediaHostingProvider(dir) });
}

describe('MediaHostingService — gate de seguridad', () => {
  test('upload: acepta un FINAL aprobado real (mock)', async () => {
    const svc = mockService();
    const localPath = tempFile('final.jpg');
    const result = await svc.upload({ assetId: 'asset-1', localPath, assetKind: 'FINAL', approved: true });
    assert.equal(result.status, 'UPLOADED');
    assert.ok(result.publicUrl.startsWith('https://mock-media-host.invalid/'));
  });

  test('upload: rechaza RAW', async () => {
    const svc = mockService();
    const localPath = tempFile('raw.jpg');
    const result = await svc.upload({ assetId: 'asset-2', localPath, assetKind: 'RAW', approved: true });
    assert.equal(result.status, 'REJECTED');
    assert.match(result.error, /RAW/);
  });

  test('upload: rechaza GENERATED no aprobado', async () => {
    const svc = mockService();
    const localPath = tempFile('gen.png');
    const result = await svc.upload({ assetId: 'asset-3', localPath, assetKind: 'GENERATED', approved: true });
    assert.equal(result.status, 'REJECTED');
  });

  test('upload: rechaza FINAL sin approved=true', async () => {
    const svc = mockService();
    const localPath = tempFile('final2.jpg');
    const result = await svc.upload({ assetId: 'asset-4', localPath, assetKind: 'FINAL', approved: false });
    assert.equal(result.status, 'REJECTED');
    assert.match(result.error, /approved/);
  });

  test('upload: rechaza extensión no soportada', async () => {
    const svc = mockService();
    const localPath = tempFile('doc.pdf');
    const result = await svc.upload({ assetId: 'asset-5', localPath, assetKind: 'FINAL', approved: true });
    assert.equal(result.status, 'REJECTED');
    assert.match(result.error, /JPEG\/PNG\/MP4/);
  });

  test('upload: URL pública es HTTPS real', async () => {
    const svc = mockService();
    const localPath = tempFile('final3.mp4');
    const result = await svc.upload({ assetId: 'asset-6', localPath, assetKind: 'FINAL', approved: true });
    assert.equal(new URL(result.publicUrl).protocol, 'https:');
  });

  test('preserva el original local (nunca lo mueve/borra)', async () => {
    const svc = mockService();
    const localPath = tempFile('final4.jpg', 'contenido-original-intacto');
    await svc.upload({ assetId: 'asset-7', localPath, assetKind: 'FINAL', approved: true });
    const { readFileSync, existsSync } = await import('node:fs');
    assert.ok(existsSync(localPath));
    assert.equal(readFileSync(localPath, 'utf8'), 'contenido-original-intacto');
  });

  test('delete: borra la copia remota real (mock)', async () => {
    const svc = mockService();
    const localPath = tempFile('final5.png');
    await svc.upload({ assetId: 'asset-8', localPath, assetKind: 'FINAL', approved: true });
    const before = await svc.exists('asset-8');
    assert.equal(before.status, 'UPLOADED');
    const del = await svc.delete('asset-8');
    assert.equal(del.status, 'DELETED');
    const after = await svc.exists('asset-8');
    assert.equal(after.status, 'NOT_FOUND');
  });

  test('sin credenciales R2 reales: CONFIGURATION_REQUIRED en upload/exists/delete, sin intentar red', async () => {
    const svc = new MediaHostingService({ r2Overrides: { accountId: null, accessKeyId: null, secretAccessKey: null, bucket: null, publicBaseUrl: null } });
    assert.equal(svc.isConfigured(), false);
    const localPath = tempFile('final6.jpg');
    const up = await svc.upload({ assetId: 'asset-9', localPath, assetKind: 'FINAL', approved: true });
    assert.equal(up.status, 'CONFIGURATION_REQUIRED');
    const ex = await svc.exists('asset-9');
    assert.equal(ex.status, 'CONFIGURATION_REQUIRED');
    const del = await svc.delete('asset-9');
    assert.equal(del.status, 'CONFIGURATION_REQUIRED');
    assert.equal(svc.getPublicUrl('asset-9'), null);
  });

  test('upload: rechaza un localPath que no existe', async () => {
    const svc = mockService();
    const result = await svc.upload({ assetId: 'asset-10', localPath: 'C:/no/existe/archivo.jpg', assetKind: 'FINAL', approved: true });
    assert.equal(result.status, 'REJECTED');
  });
});
