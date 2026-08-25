// videoProvider.test.js — Creative Production Orchestrator, 2026-08-24.
// Mismo criterio que image-generation/test/*: directorio temporal aislado,
// sin red, sin credenciales reales.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'video-generation-test-'));
process.env.VIDEO_GENERATION_DATA_ROOT = TEST_DATA_ROOT;

const { generateVideo, assertValidVideoProvider } = await import('../src/videoProvider.js');
const { createVideoGenerationRequest } = await import('../src/videoGenerationRequest.js');
const { MockVideoProvider } = await import('../src/providers/mockVideoProvider.js');
const { MiniMaxVideoProvider } = await import('../src/providers/miniMaxVideoProvider.js');

describe('assertValidVideoProvider', () => {
  test('MockVideoProvider y MiniMaxVideoProvider cumplen la forma real', () => {
    assert.ok(assertValidVideoProvider(new MockVideoProvider()));
    assert.ok(assertValidVideoProvider(new MiniMaxVideoProvider()));
  });
});

describe('MockVideoProvider — nunca llama red, resultado MOCK explícito', () => {
  test('genera un resultado SUCCESS con isMock=true', async () => {
    const provider = new MockVideoProvider();
    const request = createVideoGenerationRequest({
      sceneId: 'scene-1', visualIntent: 'hombre adulto en rutina matutina, lifestyle',
      narration: 'baja vitalidad y confianza', durationSeconds: 4, aspectRatio: '9:16',
      providerName: provider.providerName, model: provider.model,
    });
    const result = await generateVideo({ provider, request });
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.isMock, true);
    assert.ok(fs.existsSync(result.asset.sourcePath));
    assert.equal(result.asset.format, 'mock');
  });

  test('nunca produce un archivo con extensión de video real (evita que se confunda con un MP4 real)', async () => {
    const provider = new MockVideoProvider();
    const request = createVideoGenerationRequest({
      sceneId: 'scene-2', visualIntent: 'contexto', narration: 'x', durationSeconds: 3, aspectRatio: '9:16',
      providerName: provider.providerName, model: provider.model,
    });
    const result = await generateVideo({ provider, request });
    assert.ok(!result.asset.sourcePath.endsWith('.mp4'));
  });
});

describe('MiniMaxVideoProvider — sin credencial real, nunca intenta la llamada de red', () => {
  before(() => { delete process.env.MINIMAX_API_KEY; });

  test('isConfigured() es false sin MINIMAX_API_KEY real', () => {
    assert.equal(new MiniMaxVideoProvider().isConfigured(), false);
  });

  test('generateVideo() reporta CONFIGURATION_REQUIRED, nunca simula una generación', async () => {
    const provider = new MiniMaxVideoProvider();
    const request = createVideoGenerationRequest({
      sceneId: 'scene-1', visualIntent: 'hombre adulto, vitalidad', narration: 'x', durationSeconds: 6, aspectRatio: '9:16',
      providerName: provider.providerName, model: provider.model,
    });
    const result = await generateVideo({ provider, request });
    assert.equal(result.status, 'CONFIGURATION_REQUIRED');
    assert.equal(result.isMock, false);
    assert.equal(result.asset, null);
    assert.match(result.error, /MINIMAX_API_KEY/);
  });

  test('con MINIMAX_API_KEY configurada pero un endpoint real inalcanzable: PROVIDER_ERROR real, nunca un éxito fabricado', async () => {
    process.env.MINIMAX_API_KEY = 'test-key-no-es-real';
    process.env.MINIMAX_API_BASE_URL = 'http://127.0.0.1:1'; // puerto real inalcanzable a propósito.
    const provider = new MiniMaxVideoProvider();
    assert.equal(provider.isConfigured(), true);
    const request = createVideoGenerationRequest({
      sceneId: 'scene-1', visualIntent: 'x', narration: 'x', durationSeconds: 5, aspectRatio: '9:16',
      providerName: provider.providerName, model: provider.model,
    });
    const result = await generateVideo({ provider, request });
    assert.equal(result.status, 'PROVIDER_ERROR');
    assert.equal(result.asset, null);
    assert.ok(result.error);
    delete process.env.MINIMAX_API_KEY;
    delete process.env.MINIMAX_API_BASE_URL;
  });
});
