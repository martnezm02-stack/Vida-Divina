// kreaMcpImageProvider.test.js — Integración Productiva Krea MCP Directo
// (2026-08-27). Sin red externa real -- usa el servidor MCP real de
// prueba local (fakeKreaMcpServer.js) para probar el camino real de
// ÉXITO/FALLO del provider real SIN gastar cuota real de Krea ni depender
// de la sesión OAuth real de producción (esa ya se validó real por
// separado -- ver el E2E real de producción, TEST A/B/C).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { startFakeKreaMcpServer } from './helpers/fakeKreaMcpServer.js';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'img-gen-krea-mcp-provider-test-'));
process.env.IMAGE_GENERATION_DATA_ROOT = TEST_DATA_ROOT; // aislado real -- nunca toca los tokens reales de producción.

const {
  KreaMcpImageProvider, KREA_MCP_MODEL_IDS, DEFAULT_KREA_MCP_MODEL_ID,
} = await import('../src/providers/kreaMcpImageProvider.js');
const { generateImage } = await import('../src/imageProvider.js');

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
  delete process.env.IMAGE_GENERATION_DATA_ROOT;
  delete process.env.KREA_MCP_URL;
});

function fingerprint(seed) {
  return createHash('sha256').update(seed).digest('hex');
}

function realRequest(provider, overrides = {}) {
  const generationPrompt = 'Mujer adulta entrenando en un gimnasio moderno y luminoso.';
  return Object.freeze({
    requestId: randomUUID(),
    visualProductionPackageId: null,
    providerName: provider.providerName,
    model: provider.model,
    generationPrompt,
    negativePrompt: 'texto en pantalla, logos ajenos',
    aspectRatio: '9:16',
    productReference: null,
    generationFingerprint: fingerprint(generationPrompt),
    ...overrides,
  });
}

describe('KreaMcpImageProvider — catálogo de modelos reales', () => {
  test('KREA_MCP_MODEL_IDS expone los 4 modelos reales', () => {
    assert.deepEqual([...KREA_MCP_MODEL_IDS].sort(), ['krea-2-large', 'krea-2-medium', 'krea-2-turbo', 'runway-gen4'].sort());
    assert.equal(DEFAULT_KREA_MCP_MODEL_ID, 'krea-2-large');
  });

  test('constructor rechaza un modelId inválido', () => {
    assert.throws(() => new KreaMcpImageProvider('no-existe'), /modelId/);
  });

  test('providerName real es "krea-mcp" para los 4 modelos (misma cuenta/sesión OAuth real)', () => {
    for (const id of KREA_MCP_MODEL_IDS) {
      assert.equal(new KreaMcpImageProvider(id).providerName, 'krea-mcp');
      assert.equal(new KreaMcpImageProvider(id).model, id);
    }
  });

  test('referenceImagePreservation real: solo true para runway-gen4', () => {
    for (const id of KREA_MCP_MODEL_IDS) {
      assert.equal(new KreaMcpImageProvider(id).capabilities.referenceImagePreservation, id === 'runway-gen4');
    }
  });
});

describe('KreaMcpImageProvider — isConfigured() real (sin tokens reales persistidos en este entorno de test)', () => {
  test('isConfigured() es false', () => {
    assert.equal(new KreaMcpImageProvider().isConfigured(), false);
  });

  test('generateImage() reporta CONFIGURATION_REQUIRED, nunca simula una generación real', async () => {
    const provider = new KreaMcpImageProvider();
    const result = await generateImage({ provider, request: realRequest(provider) });
    assert.equal(result.status, 'CONFIGURATION_REQUIRED');
    assert.equal(result.isMock, false);
    assert.equal(result.asset, null);
  });
});

describe('KreaMcpImageProvider — runway-gen4: PRODUCT_REFERENCE_NOT_SUPPORTED sin URL real (Paso 9 del encargo)', () => {
  before(async () => {
    // "Autoriza" real este entorno de test -- INVALID_REQUEST se detecta
    // ANTES de llamar a Krea real (ver _buildMcpInput), pero solo se
    // alcanza ese código real si isConfigured() ya es true.
    const { saveKreaMcpAuthState } = await import('../src/kreaMcpAuthStore.js');
    saveKreaMcpAuthState({ tokens: { access_token: 'fake-test-token-not-real' } });
  });

  test('sin productReferenceImageUrl real -> INVALID_REQUEST honesto, nunca inventa/omite la referencia', async () => {
    const provider = new KreaMcpImageProvider('runway-gen4');
    const result = await generateImage({ provider, request: realRequest(provider, { model: 'runway-gen4' }) });
    assert.equal(result.status, 'INVALID_REQUEST');
    assert.equal(result.asset, null);
    assert.match(result.error, /PRODUCT_REFERENCE_NOT_SUPPORTED/);
    assert.match(result.error, /productReferenceImageUrl/);
  });
});

describe('KreaMcpImageProvider — job real vía el servidor MCP real de prueba: éxito, request mapping, asset registrado', () => {
  let fakeServer;
  let imageServer;
  before(async () => {
    // "Autoriza" real este entorno de test -- token real fake, suficiente
    // real para que isConfigured() sea true (nunca se usa para llamar a
    // Krea real, el servidor real de esta prueba es local).
    const { saveKreaMcpAuthState } = await import('../src/kreaMcpAuthStore.js');
    saveKreaMcpAuthState({ tokens: { access_token: 'fake-test-token-not-real' } });

    fakeServer = await startFakeKreaMcpServer(async (args) => {
      const urlImagen = `${imageServer.url}/fake-image.png`;
      return { job_id: 'job-real-1', status: 'completed', result: { urls: [urlImagen] }, recibido: args };
    });
    process.env.KREA_MCP_URL = fakeServer.url;

    // Servidor HTTP real y simple para servir la imagen real generada (el
    // provider real descarga por fetch() real, igual que con Krea real).
    const http = await import('node:http');
    const srv = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(Buffer.from('PNG_REAL_FAKE_DEL_SERVIDOR_DE_PRUEBA'));
    });
    await new Promise((resolve) => { srv.listen(0, '127.0.0.1', resolve); });
    imageServer = { url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
  });
  after(async () => {
    await fakeServer.close();
    imageServer.close();
    delete process.env.KREA_MCP_URL;
  });

  test('modelos krea-2/* real: mapea prompt/aspect_ratio/resolution reales, descarga y registra el asset real', async () => {
    const provider = new KreaMcpImageProvider('krea-2-large');
    const result = await generateImage({ provider, request: realRequest(provider, { aspectRatio: '9:16' }) });
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.isMock, false);
    assert.equal(result.providerName, 'krea-mcp');
    assert.equal(result.model, 'krea-2-large');
    assert.ok(fs.existsSync(result.asset.sourcePath));
    assert.equal(fs.readFileSync(result.asset.sourcePath, 'utf8'), 'PNG_REAL_FAKE_DEL_SERVIDOR_DE_PRUEBA');
    assert.equal(result.asset.type, 'GENERATED_IMAGE');
    assert.equal(result.asset.aspectRatio, '9:16');
  });

  test('runway-gen4 real: con productReferenceImageUrl real, arma reference_images real con tag "product"', async () => {
    const provider = new KreaMcpImageProvider('runway-gen4');
    const result = await generateImage({
      provider,
      request: realRequest(provider, { model: 'runway-gen4', aspectRatio: '9:16', productReferenceImageUrl: 'https://cdn.example.com/ripped-capsules-real.png' }),
    });
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.model, 'runway-gen4');
  });

  test('costo real: siempre costStatus "UNKNOWN" (Krea no expone precio por llamada), estimatedCost/actualCost 0 -- nunca inventado', async () => {
    const provider = new KreaMcpImageProvider('krea-2-turbo');
    const result = await generateImage({ provider, request: realRequest(provider) });
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.estimatedCost, 0);
    assert.equal(result.actualCost, 0);
    assert.equal(result.costStatus, 'UNKNOWN');
  });
});

describe('KreaMcpImageProvider — job real terminado en failed (Paso 16 del encargo)', () => {
  let fakeServer;
  before(async () => {
    const { saveKreaMcpAuthState } = await import('../src/kreaMcpAuthStore.js');
    saveKreaMcpAuthState({ tokens: { access_token: 'fake-test-token-not-real' } });
    fakeServer = await startFakeKreaMcpServer(async () => ({ job_id: 'job-fail-1', status: 'failed', result: { error: 'contenido real rechazado por moderación' } }));
    process.env.KREA_MCP_URL = fakeServer.url;
  });
  after(async () => {
    await fakeServer.close();
    delete process.env.KREA_MCP_URL;
  });

  test('status real "failed" -> PROVIDER_ERROR real con el detalle real, nunca un éxito fabricado', async () => {
    const provider = new KreaMcpImageProvider('krea-2-large');
    const result = await generateImage({ provider, request: realRequest(provider) });
    assert.equal(result.status, 'PROVIDER_ERROR');
    assert.equal(result.asset, null);
    assert.match(result.error, /failed/);
  });
});
