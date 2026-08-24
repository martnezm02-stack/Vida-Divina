import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { assertValidImageProvider, generateImage, IMAGE_PROVIDER_CAPABILITY_KEYS } from '../src/imageProvider.js';
import { createImageGenerationResult, IMAGE_GENERATION_STATUSES } from '../src/imageGenerationResult.js';

function fingerprint(seed) {
  return createHash('sha256').update(seed).digest('hex');
}

function minimalRequest(overrides = {}) {
  return Object.freeze({
    requestId: randomUUID(),
    visualProductionPackageId: 'vpp-1',
    providerName: 'mock',
    model: 'mock-image-model',
    generationPrompt: 'prompt real de prueba',
    negativePrompt: 'negative prompt real de prueba',
    aspectRatio: '4:5 FEED',
    productReference: null,
    generationFingerprint: fingerprint('prompt real de prueba'),
    ...overrides,
  });
}

function workingMockProvider(overrides = {}) {
  return {
    providerName: 'mock',
    model: 'mock-image-model',
    capabilities: Object.freeze({ textToImage: true }),
    isConfigured: () => true,
    generate: async (req) => createImageGenerationResult({
      status: 'SUCCESS',
      requestId: req.requestId,
      visualProductionPackageId: req.visualProductionPackageId,
      providerName: 'mock',
      model: 'mock-image-model',
      isMock: true,
      generationFingerprint: req.generationFingerprint,
      asset: { assetId: null, sourcePath: 'C:/fake/out.mock', type: 'GENERATED_IMAGE', format: 'mock', aspectRatio: req.aspectRatio },
    }),
    ...overrides,
  };
}

describe('assertValidImageProvider — contrato mínimo', () => {
  test('acepta un provider con la forma real completa', () => {
    assert.equal(assertValidImageProvider(workingMockProvider()), true);
  });

  test('rechaza sin providerName', () => {
    const p = workingMockProvider(); delete p.providerName;
    assert.throws(() => assertValidImageProvider(p), /providerName/);
  });

  test('rechaza sin model', () => {
    const p = workingMockProvider(); delete p.model;
    assert.throws(() => assertValidImageProvider(p), /model/);
  });

  test('rechaza sin capabilities', () => {
    const p = workingMockProvider(); delete p.capabilities;
    assert.throws(() => assertValidImageProvider(p), /capabilities/);
  });

  test('rechaza sin isConfigured()', () => {
    const p = workingMockProvider(); delete p.isConfigured;
    assert.throws(() => assertValidImageProvider(p), /isConfigured/);
  });

  test('rechaza sin generate()', () => {
    const p = workingMockProvider(); delete p.generate;
    assert.throws(() => assertValidImageProvider(p), /generate/);
  });

  test('rechaza un provider que no es un objeto', () => {
    assert.throws(() => assertValidImageProvider(null));
    assert.throws(() => assertValidImageProvider('mock'));
  });

  test('IMAGE_PROVIDER_CAPABILITY_KEYS documenta el vocabulario de referencia', () => {
    assert.ok(IMAGE_PROVIDER_CAPABILITY_KEYS.includes('textToImage'));
    assert.ok(IMAGE_PROVIDER_CAPABILITY_KEYS.includes('referenceImagePreservation'));
  });
});

describe('generateImage — configuration gate (Parte 6)', () => {
  test('provider real sin credenciales -> CONFIGURATION_REQUIRED, NUNCA llama generate()', async () => {
    let generateCalled = false;
    const provider = workingMockProvider({
      providerName: 'flux', model: 'flux-pro',
      isConfigured: () => false,
      generate: async () => { generateCalled = true; throw new Error('generate() nunca debió llamarse'); },
    });
    const req = minimalRequest({ providerName: 'flux', model: 'flux-pro' });
    const result = await generateImage({ provider, request: req });
    assert.equal(result.status, 'CONFIGURATION_REQUIRED');
    assert.equal(result.isMock, false);
    assert.match(result.error, /no está configurado/);
    assert.equal(generateCalled, false);
  });

  test('CONFIGURATION_REQUIRED está disponible como status real para cualquier provider (no solo mock)', () => {
    assert.ok(IMAGE_GENERATION_STATUSES.includes('CONFIGURATION_REQUIRED'));
  });
});

describe('generateImage — errores del provider nunca se convierten en SUCCESS', () => {
  test('generate() que lanza -> PROVIDER_ERROR explícito, nunca SUCCESS', async () => {
    const provider = workingMockProvider({ generate: async () => { throw new Error('fallo real simulado del provider'); } });
    const req = minimalRequest();
    const result = await generateImage({ provider, request: req });
    assert.equal(result.status, 'PROVIDER_ERROR');
    assert.notEqual(result.status, 'SUCCESS');
    assert.match(result.error, /fallo real simulado del provider/);
  });

  test('generate() que devuelve un resultado sin "status" real -> PROVIDER_ERROR, nunca se pasa tal cual', async () => {
    const provider = workingMockProvider({ generate: async () => ({ ok: true }) });
    const req = minimalRequest();
    const result = await generateImage({ provider, request: req });
    assert.equal(result.status, 'PROVIDER_ERROR');
  });

  test('mismatch provider/model entre el request y el provider real -> lanza, nunca ejecuta', async () => {
    const provider = workingMockProvider({ providerName: 'openai', model: 'dalle' });
    const req = minimalRequest({ providerName: 'mock', model: 'mock-image-model' });
    await assert.rejects(() => generateImage({ provider, request: req }), /construido para/);
  });
});

describe('generateImage — camino real de éxito', () => {
  test('provider configurado + generate() exitoso -> SUCCESS, mismo fingerprint', async () => {
    const provider = workingMockProvider();
    const req = minimalRequest();
    const result = await generateImage({ provider, request: req });
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.generationFingerprint, req.generationFingerprint);
    assert.equal(result.error, null);
  });
});

describe('createImageGenerationResult — contrato uniforme (reutilizado por generateImage)', () => {
  test('SUCCESS exige "asset" real', () => {
    assert.throws(() => createImageGenerationResult({
      status: 'SUCCESS', requestId: 'r1', providerName: 'mock', model: 'mock-image-model',
      isMock: true, generationFingerprint: fingerprint('x'), asset: null,
    }), /requiere "asset"/);
  });

  test('status distinto de SUCCESS exige "error" explícito', () => {
    assert.throws(() => createImageGenerationResult({
      status: 'PROVIDER_ERROR', requestId: 'r1', providerName: 'mock', model: 'mock-image-model',
      isMock: true, generationFingerprint: fingerprint('x'), error: null,
    }), /requiere "error" explícito/);
  });

  test('un status no válido lanza, nunca se acepta silenciosamente', () => {
    assert.throws(() => createImageGenerationResult({
      status: 'ALMOST_SUCCESS', requestId: 'r1', providerName: 'mock', model: 'mock-image-model',
      isMock: true, generationFingerprint: fingerprint('x'), error: 'x',
    }), /status.*inválido/);
  });

  test('"isMock" debe ser boolean explícito, nunca implícito', () => {
    assert.throws(() => createImageGenerationResult({
      status: 'PROVIDER_ERROR', requestId: 'r1', providerName: 'mock', model: 'mock-image-model',
      generationFingerprint: fingerprint('x'), error: 'x',
    }), /isMock/);
  });

  test('asset generado nace en reviewStatus DRAFT, fijo, nunca aprobado por el propio resultado', () => {
    const result = createImageGenerationResult({
      status: 'SUCCESS', requestId: 'r1', providerName: 'mock', model: 'mock-image-model',
      isMock: true, generationFingerprint: fingerprint('x'),
      asset: { assetId: null, sourcePath: 'C:/x.mock', type: 'GENERATED_IMAGE' },
    });
    assert.equal(result.asset.reviewStatus, 'DRAFT');
  });
});
