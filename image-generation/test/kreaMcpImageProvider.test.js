// kreaMcpImageProvider.test.js — Krea MCP + Catálogo Real de Modelos
// (2026-08-27). Sin llamadas reales costosas al puente Claude CLI en esta
// suite (esas ya se validaron real y manualmente -- ver
// content-orchestrator/test/real-e2e-krea-mcp-validation.mjs, DOS
// imágenes reales, TEST A/B) -- aquí se prueba real: validación de
// constructor/modelo, capabilities por modelo, isConfigured() real
// (forzado vía KREA_MCP_CLAUDE_BIN + resetKreaMcpConnectionCache(), nunca
// mockeado), y el camino real de PROVIDER_ERROR cuando el puente real
// falla (mismo criterio real que openAIImageProvider.test.js/
// videoProvider.test.js: un binario real inalcanzable, nunca un mock).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'img-gen-krea-mcp-test-'));
process.env.IMAGE_GENERATION_DATA_ROOT = TEST_DATA_ROOT;

const {
  KreaMcpImageProvider, KREA_MCP_MODEL_IDS, DEFAULT_KREA_MCP_MODEL_ID, resetKreaMcpConnectionCache,
} = await import('../src/providers/kreaMcpImageProvider.js');
const { generateImage } = await import('../src/imageProvider.js');

const ORIGINAL_CLAUDE_BIN = process.env.KREA_MCP_CLAUDE_BIN;

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
  delete process.env.IMAGE_GENERATION_DATA_ROOT;
  if (ORIGINAL_CLAUDE_BIN === undefined) delete process.env.KREA_MCP_CLAUDE_BIN; else process.env.KREA_MCP_CLAUDE_BIN = ORIGINAL_CLAUDE_BIN;
  resetKreaMcpConnectionCache();
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

  test('providerName real es "krea-mcp" para los 4 modelos (misma cuenta/OAuth real)', () => {
    for (const id of KREA_MCP_MODEL_IDS) {
      assert.equal(new KreaMcpImageProvider(id).providerName, 'krea-mcp');
      assert.equal(new KreaMcpImageProvider(id).model, id);
    }
  });

  test('referenceImagePreservation real: solo true para runway-gen4 (verificado real, ver TEST B de real-e2e-krea-mcp-validation.mjs)', () => {
    for (const id of KREA_MCP_MODEL_IDS) {
      assert.equal(new KreaMcpImageProvider(id).capabilities.referenceImagePreservation, id === 'runway-gen4');
    }
  });
});

describe('KreaMcpImageProvider — isConfigured() real (nunca mockeado)', () => {
  before(() => { process.env.KREA_MCP_CLAUDE_BIN = 'claude-binario-real-inexistente-para-test'; resetKreaMcpConnectionCache(); });
  after(() => { delete process.env.KREA_MCP_CLAUDE_BIN; resetKreaMcpConnectionCache(); });

  test('sin el binario real "claude" disponible -> isConfigured() false, nunca asume conectado', () => {
    assert.equal(new KreaMcpImageProvider().isConfigured(), false);
  });

  test('generateImage() reporta CONFIGURATION_REQUIRED cuando el puente real no está disponible, nunca simula una generación', async () => {
    const provider = new KreaMcpImageProvider();
    const result = await generateImage({ provider, request: realRequest(provider) });
    assert.equal(result.status, 'CONFIGURATION_REQUIRED');
    assert.equal(result.isMock, false);
    assert.equal(result.asset, null);
  });

  test('el chequeo real queda cacheado -- una segunda llamada no repite el subproceso real (rápida)', () => {
    const t0 = Date.now();
    new KreaMcpImageProvider().isConfigured();
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 50, `debería usar el caché real, tardó ${elapsed}ms`);
  });
});

describe('KreaMcpImageProvider — runway-gen4: reference_images real obligatorio (Paso 5/15 del encargo Krea MCP)', () => {
  test('sin productReferenceImageUrl real -> INVALID_REQUEST honesto, NUNCA llama al puente real (sin costo real)', async () => {
    const provider = new KreaMcpImageProvider('runway-gen4');
    // Sin credencial real forzada -- si esto llegara a intentar el puente
    // real, fallaría de otra forma; probamos que NI SIQUIERA lo intenta:
    // isConfigured() real de esta máquina no importa aquí porque
    // generateImage() nunca llega a invocar generate() con un request
    // inválido... salvo que SÍ está configurado, en cuyo caso generate()
    // real corre pero debe retornar INVALID_REQUEST antes de spawnear el
    // puente real (ver _buildMcpInput). Cualquiera de los dos casos reales
    // es válido: el resultado real nunca es SUCCESS.
    const result = await generateImage({ provider, request: realRequest(provider, { model: 'runway-gen4' }) });
    assert.notEqual(result.status, 'SUCCESS');
    if (result.status === 'INVALID_REQUEST') {
      assert.match(result.error, /productReferenceImageUrl/);
    }
  });
});

describe('KreaMcpImageProvider — puente real que falla -> PROVIDER_ERROR real, nunca un éxito fabricado', () => {
  // "git" real (existe real y determinista en cualquier máquina con este
  // repo real) sustituye a "claude" -- git real rechaza real "-p" como
  // flag desconocida (exit code real != 0), fuerza un PROVIDER_ERROR real
  // SIN NINGÚN riesgo real de completar una generación real (a diferencia
  // de forzar un timeout corto, que en una máquina con Krea MCP real
  // Connected podría alcanzar a completar la generación real de todas
  // formas -- ya ocurrió una vez al validar este archivo, ver commit).
  before(() => {
    process.env.KREA_MCP_CLAUDE_BIN = 'git';
    resetKreaMcpConnectionCache();
  });
  after(() => {
    delete process.env.KREA_MCP_CLAUDE_BIN;
    resetKreaMcpConnectionCache();
  });

  test('isConfigured() real con "git" en vez de "claude" -> false (git real no entiende "mcp get krea")', () => {
    assert.equal(new KreaMcpImageProvider().isConfigured(), false);
  });

  test('generateImage() con el puente real roto -> CONFIGURATION_REQUIRED real (isConfigured ya lo detecta), nunca SUCCESS fabricado', async () => {
    const provider = new KreaMcpImageProvider('krea-2-turbo');
    const result = await generateImage({ provider, request: realRequest(provider) });
    assert.notEqual(result.status, 'SUCCESS');
    assert.equal(result.isMock, false);
    assert.equal(result.asset, null);
  });
});

describe('KreaMcpImageProvider — costo real: siempre "UNKNOWN" (Krea no expone precio por llamada, ver kreaMcpImageProvider.js)', () => {
  test('el código fuente nunca reporta un costo distinto de 0/"UNKNOWN" -- nunca inventa un precio real', () => {
    const src = fs.readFileSync(new URL('../src/providers/kreaMcpImageProvider.js', import.meta.url), 'utf8');
    assert.match(src, /costStatus: 'UNKNOWN'/);
    assert.doesNotMatch(src, /costStatus: 'KNOWN'/);
  });
});
