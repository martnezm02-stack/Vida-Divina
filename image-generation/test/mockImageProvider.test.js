import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

// Mismo patrón que content-orchestrator/test/assetLineage.test.js: aislar el
// directorio de datos ANTES de importar el módulo (DATA_ROOT se calcula al
// cargar el archivo), y limpiarlo al terminar.
const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'img-gen-mock-test-'));
process.env.IMAGE_GENERATION_DATA_ROOT = TEST_DATA_ROOT;

const { MockImageProvider, DATA_ROOT, MOCK_OUTPUT_DIR } = await import('../src/providers/mockImageProvider.js');

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
  delete process.env.IMAGE_GENERATION_DATA_ROOT;
});

function fingerprint(seed) {
  return createHash('sha256').update(seed).digest('hex');
}

function realRequest(overrides = {}) {
  return Object.freeze({
    requestId: randomUUID(),
    visualProductionPackageId: 'vpp-1',
    providerName: 'mock',
    model: 'mock-image-model',
    generationPrompt: 'Fotografía real de producto sobre mesa de madera.',
    negativePrompt: 'Sin empaque inventado, sin logotipos falsos.',
    aspectRatio: '4:5 FEED',
    productReference: null,
    generationFingerprint: fingerprint('Fotografía real de producto sobre mesa de madera.'),
    ...overrides,
  });
}

describe('Directorio aislado de prueba', () => {
  test('DATA_ROOT/MOCK_OUTPUT_DIR apuntan al directorio temporal, nunca a image-generation/data real', () => {
    assert.ok(DATA_ROOT.startsWith(TEST_DATA_ROOT));
    assert.ok(MOCK_OUTPUT_DIR.startsWith(TEST_DATA_ROOT));
  });
});

describe('MockImageProvider — identidad y configuración', () => {
  test('providerName/model declarados, capabilities es un objeto real', () => {
    const provider = new MockImageProvider();
    assert.equal(provider.providerName, 'mock');
    assert.equal(provider.model, 'mock-image-model');
    assert.equal(typeof provider.capabilities, 'object');
  });

  test('isConfigured() siempre true -- nunca requiere credenciales', () => {
    const provider = new MockImageProvider();
    assert.equal(provider.isConfigured(), true);
  });
});

describe('MockImageProvider.generate() — nunca llama internet, resultado MOCK explícito', () => {
  test('genera un resultado SUCCESS con isMock=true, nunca oculto', async () => {
    const provider = new MockImageProvider();
    const req = realRequest();
    const result = await provider.generate(req);
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.isMock, true);
    assert.equal(result.providerName, 'mock');
  });

  test('el asset real escrito en disco es un archivo de texto ".mock", nunca una imagen real fingida', async () => {
    const provider = new MockImageProvider();
    const req = realRequest();
    const result = await provider.generate(req);
    assert.ok(result.asset.sourcePath.endsWith('.mock'));
    assert.ok(fs.existsSync(result.asset.sourcePath));
    const contenido = fs.readFileSync(result.asset.sourcePath, 'utf8');
    assert.match(contenido, /ESTE ARCHIVO NO ES UNA IMAGEN REAL/);
    assert.match(contenido, /MOCK IMAGE GENERATION RESULT/);
  });

  test('el asset resultante es content-addressed (assetId = hash real del contenido escrito)', async () => {
    const provider = new MockImageProvider();
    const req = realRequest();
    const result = await provider.generate(req);
    const contenido = fs.readFileSync(result.asset.sourcePath, 'utf8');
    const hashReal = createHash('sha256').update(contenido).digest('hex');
    assert.equal(result.asset.assetId, hashReal);
  });

  test('mismo fingerprint (misma solicitud) -> mismo archivo de salida, no se duplica ni se reescribe', async () => {
    const provider = new MockImageProvider();
    const req = realRequest();
    const r1 = await provider.generate(req);
    const r2 = await provider.generate(req);
    assert.equal(r1.asset.sourcePath, r2.asset.sourcePath);
    assert.equal(r1.asset.assetId, r2.asset.assetId);
  });

  test('fingerprint distinto -> archivo de salida distinto', async () => {
    const provider = new MockImageProvider();
    const r1 = await provider.generate(realRequest({ generationPrompt: 'prompt A', generationFingerprint: fingerprint('prompt A') }));
    const r2 = await provider.generate(realRequest({ generationPrompt: 'prompt B', generationFingerprint: fingerprint('prompt B') }));
    assert.notEqual(r1.asset.sourcePath, r2.asset.sourcePath);
  });

  test('preserva aspectRatio de la solicitud en el asset resultante', async () => {
    const provider = new MockImageProvider();
    const req = realRequest({ aspectRatio: '9:16 STORY' });
    const result = await provider.generate(req);
    assert.equal(result.asset.aspectRatio, '9:16 STORY');
  });

  test('nunca hace una llamada de red real (sin fetch/https en el módulo, verificado por inspección del código fuente)', async () => {
    const fs2 = await import('node:fs');
    const src = fs2.readFileSync(new URL('../src/providers/mockImageProvider.js', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /node:https|node:http\b|fetch\(/);
  });

  test('solicitud sin campos mínimos reales -> INVALID_REQUEST, nunca SUCCESS ni escribe archivo', async () => {
    const provider = new MockImageProvider();
    const before = fs.existsSync(MOCK_OUTPUT_DIR) ? fs.readdirSync(MOCK_OUTPUT_DIR).length : 0;
    const result = await provider.generate({ requestId: 'r-invalid' });
    assert.equal(result.status, 'INVALID_REQUEST');
    assert.notEqual(result.status, 'SUCCESS');
    const after_ = fs.existsSync(MOCK_OUTPUT_DIR) ? fs.readdirSync(MOCK_OUTPUT_DIR).length : 0;
    assert.equal(after_, before);
  });

  test('costo estimado y real son 0 -- Mock nunca reporta un gasto real', async () => {
    const provider = new MockImageProvider();
    const result = await provider.generate(realRequest());
    assert.equal(result.estimatedCost, 0);
    assert.equal(result.actualCost, 0);
  });

  test('el asset generado nace en reviewStatus DRAFT -- el mock nunca aprueba su propio resultado', async () => {
    const provider = new MockImageProvider();
    const result = await provider.generate(realRequest());
    assert.equal(result.asset.reviewStatus, 'DRAFT');
  });
});
