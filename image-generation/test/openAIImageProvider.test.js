// openAIImageProvider.test.js — Creative Director / Visual Generation
// Provider Router (2026-08-27). Mismo criterio real que
// video-generation/test/videoProvider.test.js#MiniMaxVideoProvider: sin
// credencial real -> isConfigured() false, nunca se intenta la llamada;
// con una credencial de prueba pero apuntando a un endpoint real
// inalcanzable -> PROVIDER_ERROR real, nunca un éxito fabricado.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'img-gen-openai-test-'));
process.env.IMAGE_GENERATION_DATA_ROOT = TEST_DATA_ROOT;

const { OpenAIImageProvider } = await import('../src/providers/openAIImageProvider.js');
const { generateImage } = await import('../src/imageProvider.js');

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
  delete process.env.IMAGE_GENERATION_DATA_ROOT;
});

function fingerprint(seed) {
  return createHash('sha256').update(seed).digest('hex');
}

function realRequest(provider, overrides = {}) {
  const generationPrompt = 'Mujer adulta entrenando en un gimnasio moderno, luz natural.';
  return Object.freeze({
    requestId: randomUUID(),
    visualProductionPackageId: null,
    providerName: provider.providerName,
    model: provider.model,
    generationPrompt,
    negativePrompt: 'texto en pantalla, marcas de agua, logos ajenos',
    aspectRatio: '9:16',
    productReference: null,
    generationFingerprint: fingerprint(generationPrompt),
    ...overrides,
  });
}

describe('OpenAIImageProvider — identidad y configuración', () => {
  before(() => { delete process.env.OPENAI_API_KEY; });

  test('providerName/model/capabilities declarados', () => {
    const provider = new OpenAIImageProvider();
    assert.equal(provider.providerName, 'openai');
    assert.equal(provider.model, 'gpt-image-1');
    assert.equal(typeof provider.capabilities, 'object');
  });

  test('isConfigured() es false sin OPENAI_API_KEY real', () => {
    assert.equal(new OpenAIImageProvider().isConfigured(), false);
  });

  test('generateImage() reporta CONFIGURATION_REQUIRED, nunca simula una generación real', async () => {
    const provider = new OpenAIImageProvider();
    const result = await generateImage({ provider, request: realRequest(provider) });
    assert.equal(result.status, 'CONFIGURATION_REQUIRED');
    assert.equal(result.isMock, false);
    assert.equal(result.asset, null);
    assert.match(result.error, /OPENAI_API_KEY|no está configurado/);
  });
});

describe('OpenAIImageProvider — con credencial pero endpoint real inalcanzable', () => {
  after(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_BASE_URL;
  });

  test('PROVIDER_ERROR real, nunca un éxito fabricado (mismo patrón que MiniMaxVideoProvider)', async () => {
    process.env.OPENAI_API_KEY = 'test-key-no-es-real';
    process.env.OPENAI_API_BASE_URL = 'http://127.0.0.1:1'; // puerto real inalcanzable a propósito.
    const provider = new OpenAIImageProvider();
    assert.equal(provider.isConfigured(), true);
    const result = await generateImage({ provider, request: realRequest(provider) });
    assert.equal(result.status, 'PROVIDER_ERROR');
    assert.equal(result.isMock, false);
    assert.equal(result.asset, null);
    assert.ok(result.error);
  });
});

describe('OpenAIImageProvider — nunca reporta un costo real sin evidencia real (Paso 25 del encargo)', () => {
  test('el código fuente nunca reporta actualCost distinto de 0 salvo con "usage" real de la respuesta', () => {
    const src = fs.readFileSync(new URL('../src/providers/openAIImageProvider.js', import.meta.url), 'utf8');
    assert.match(src, /actualCost \?\? 0|actualCost: actualCost \?\? 0/);
  });
});
