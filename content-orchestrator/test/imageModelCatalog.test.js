// imageModelCatalog.test.js — Modelo Sugerido + Selección Manual + Krea MCP
// Directo (2026-08-27).
//
// Krea REST (KreaImageProvider) y el puente `claude -p` fueron ambos
// retirados (decisión de arquitectura real: KREA_API_TOKEN revocado,
// Krea MCP DIRECTO desde Node -- kreaMcpClient.js, sin Claude -- es el
// acceso real que se conserva). El catálogo real hoy tiene 5 modelos:
// krea-2-turbo/medium/large + runway-gen4 (vía kreaMcpImageProvider.js) +
// openai-gpt-image. isKreaMcpConfigured() ahora es real y rápido (lee
// tokens reales persistidos en disco, ver kreaMcpAuthStore.js) -- se
// aísla real vía IMAGE_GENERATION_DATA_ROOT (mismo criterio real que el
// resto de tests de image-generation/) para NUNCA leer/tocar los tokens
// reales de producción ya persistidos en este entorno real.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  IMAGE_MODEL_CATALOG, listAvailableImageModels, recommendImageModel, buildModelSelection, getImageModel,
} from '../src/imageModelCatalog.js';

const ORIGINAL_OPENAI_KEY = process.env.OPENAI_API_KEY;
const ORIGINAL_DATA_ROOT = process.env.IMAGE_GENERATION_DATA_ROOT;

function sinNingunaCredencialReal() {
  delete process.env.OPENAI_API_KEY;
  process.env.IMAGE_GENERATION_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-test-sin-krea-'));
}
function conOpenAiSoloConfigurado() {
  process.env.OPENAI_API_KEY = 'test-key-catalog';
  process.env.IMAGE_GENERATION_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-test-openai-'));
}
function conKreaMcpSoloConfigurado() {
  delete process.env.OPENAI_API_KEY;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-test-krea-mcp-'));
  fs.writeFileSync(path.join(dir, 'krea-mcp-auth.json'), JSON.stringify({ tokens: { access_token: 'fake-test-token-not-real' } }));
  process.env.IMAGE_GENERATION_DATA_ROOT = dir;
}

after(() => {
  if (ORIGINAL_OPENAI_KEY === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_KEY;
  if (ORIGINAL_DATA_ROOT === undefined) delete process.env.IMAGE_GENERATION_DATA_ROOT; else process.env.IMAGE_GENERATION_DATA_ROOT = ORIGINAL_DATA_ROOT;
});

describe('IMAGE_MODEL_CATALOG — vocabulario real pedido por el encargo (Krea MCP)', () => {
  test('expone los 5 modelos reales (4 krea-mcp + 1 openai), nunca nombres técnicos de endpoint/modelo', () => {
    assert.deepEqual(IMAGE_MODEL_CATALOG.map((m) => m.id).sort(), ['krea-2-large', 'krea-2-medium', 'krea-2-turbo', 'openai-gpt-image', 'runway-gen4'].sort());
    for (const m of IMAGE_MODEL_CATALOG) {
      assert.doesNotMatch(m.displayName, /generate\/image|krea-2\/|gen-4-image/);
      assert.ok(m.description?.length > 0);
      assert.ok(['LOW', 'BALANCED', 'HIGH', 'PREMIUM'].includes(m.costTier));
      assert.ok(['FAST', 'STANDARD', 'SLOW'].includes(m.speedTier));
      assert.equal(typeof m.buildProvider, 'function');
    }
    const krea = IMAGE_MODEL_CATALOG.filter((m) => m.provider === 'krea-mcp');
    assert.equal(krea.length, 4);
    assert.ok(krea.every((m) => m.aspectRatios.includes('9:16') && m.aspectRatios.includes('4:5')));
  });

  test('solo runway-gen4 declara supportsProductReference:true (verificado real vía Krea MCP)', () => {
    const conReferencia = IMAGE_MODEL_CATALOG.filter((m) => m.supportsProductReference);
    assert.deepEqual(conReferencia.map((m) => m.id), ['runway-gen4']);
  });

  test('getImageModel() lanza para un id inexistente', () => {
    assert.throws(() => getImageModel('no-existe'), /no es un modelo real/);
  });
});

describe('Validación D/E — disponibilidad real (nunca se muestra lo no disponible)', () => {
  after(sinNingunaCredencialReal);

  test('E: sin ninguna credencial real (ni Krea MCP ni OpenAI) -> listAvailableImageModels() vacío', () => {
    sinNingunaCredencialReal();
    assert.deepEqual([...listAvailableImageModels({ productReferenceAvailable: true })], []);
  });

  test('con Krea MCP real conectado (esta máquina) -> los 3 krea-2/* aparecen disponibles, runway-gen4 NO sin asset real de producto', () => {
    conKreaMcpSoloConfigurado();
    const disponibles = listAvailableImageModels({ productReferenceAvailable: false });
    assert.ok(disponibles.some((m) => m.id === 'krea-2-turbo'));
    assert.ok(disponibles.some((m) => m.id === 'krea-2-medium'));
    assert.ok(disponibles.some((m) => m.id === 'krea-2-large'));
    assert.ok(disponibles.every((m) => m.id !== 'runway-gen4'));
  });

  test('D: con Krea MCP real conectado Y asset real de producto -> runway-gen4 SÍ aparece disponible', () => {
    conKreaMcpSoloConfigurado();
    const disponibles = listAvailableImageModels({ productReferenceAvailable: true });
    assert.ok(disponibles.some((m) => m.id === 'runway-gen4'));
  });

  test('con solo OPENAI_API_KEY real (Krea MCP forzado no disponible) -> solo openai-gpt-image aparece', () => {
    conOpenAiSoloConfigurado();
    const disponibles = listAvailableImageModels({ productReferenceAvailable: true });
    assert.deepEqual(disponibles.map((m) => m.id), ['openai-gpt-image']);
  });

  test('aspectRatio real: un aspecto no soportado por ningún modelo excluye todo el catálogo, nunca inventa compatibilidad', () => {
    conKreaMcpSoloConfigurado();
    const disponibles = listAvailableImageModels({ productReferenceAvailable: true, aspectRatio: '21:9' });
    assert.deepEqual([...disponibles], []);
  });
});

describe('Validación C — recomendación real cuando la escena requiere identidad de producto', () => {
  after(sinNingunaCredencialReal);

  test('escena con producto real (treatment PRODUCT_HUMAN + asset real disponible) + Krea MCP real disponible -> recomienda runway-gen4', () => {
    conKreaMcpSoloConfigurado();
    const { recommendedModel, recommendationReason } = recommendImageModel({
      productAssetAvailable: true, visualTreatmentId: 'PRODUCT_HUMAN', hasGenerationRequiredScenes: true,
    });
    assert.equal(recommendedModel.id, 'runway-gen4');
    assert.equal(recommendationReason, 'Recomendado porque esta escena requiere preservar la referencia del producto.');
  });

  test('mismo treatment product-prominent pero solo openai disponible (sin modelo real de referencia) -> cae al criterio de costo, nunca lanza', () => {
    conOpenAiSoloConfigurado();
    const { recommendedModel, recommendationReason } = recommendImageModel({
      productAssetAvailable: true, visualTreatmentId: 'PRODUCT_HUMAN', hasGenerationRequiredScenes: true,
    });
    assert.equal(recommendedModel.id, 'openai-gpt-image');
    assert.equal(recommendationReason, 'Recomendado por su menor costo para generar variantes.');
  });

  test('treatment sin producto (LIFESTYLE) + Krea MCP real disponible -> recomienda el modelo real de menor costo (Krea 2 Turbo)', () => {
    conKreaMcpSoloConfigurado();
    const { recommendedModel, recommendationReason } = recommendImageModel({
      productAssetAvailable: true, visualTreatmentId: 'LIFESTYLE', hasGenerationRequiredScenes: true,
    });
    assert.equal(recommendedModel.id, 'krea-2-turbo');
    assert.equal(recommendationReason, 'Recomendado por su menor costo para generar variantes.');
  });

  test('sin ningún modelo real disponible -> recommendedModel null, nunca lanza', () => {
    sinNingunaCredencialReal();
    const { recommendedModel, recommendationReason } = recommendImageModel({ productAssetAvailable: true, visualTreatmentId: 'PRODUCT_HUMAN' });
    assert.equal(recommendedModel, null);
    assert.match(recommendationReason, /Ningún modelo real/);
  });
});

describe('Validación A/B — el sistema recomienda, el usuario decide (buildModelSelection)', () => {
  before(conKreaMcpSoloConfigurado);
  after(sinNingunaCredencialReal);

  test('A: usuario acepta el modelo sugerido -> selectionMode "automatic"', () => {
    const rec = recommendImageModel({ productAssetAvailable: false, visualTreatmentId: 'LIFESTYLE' });
    const seleccion = buildModelSelection({ ...rec, selectedModelId: null, productAssetAvailable: false });
    assert.equal(seleccion.selectionMode, 'automatic');
    assert.equal(seleccion.finalModelId, rec.recommendedModel.id);
    assert.equal(seleccion.selectedModel, rec.recommendedModel.id);
    assert.equal(seleccion.recommendedProvider, 'krea-mcp');
  });

  test('B: usuario cambia el modelo -> selectionMode "user_selected", sobrescribe la recomendación', () => {
    const rec = recommendImageModel({ productAssetAvailable: false, visualTreatmentId: 'LIFESTYLE' }); // recomienda krea-2-turbo
    const seleccion = buildModelSelection({ ...rec, selectedModelId: 'krea-2-large', productAssetAvailable: false });
    assert.equal(seleccion.selectionMode, 'user_selected');
    assert.equal(seleccion.finalModelId, 'krea-2-large');
    assert.equal(seleccion.selectedModel, 'krea-2-large');
    assert.equal(seleccion.recommendedModel, 'krea-2-turbo'); // recomendación original sigue registrada para lineage.
  });

  test('lineage completo: recommendedProvider/recommendedModel/recommendationReason/selectedProvider/selectedModel/selectionMode, todos presentes', () => {
    const rec = recommendImageModel({ productAssetAvailable: true, visualTreatmentId: 'PRODUCT_HUMAN' });
    const seleccion = buildModelSelection({ ...rec, selectedModelId: null, productAssetAvailable: true });
    for (const campo of ['recommendedProvider', 'recommendedModel', 'recommendationReason', 'selectedProvider', 'selectedModel', 'selectionMode']) {
      assert.ok(campo in seleccion, `falta el campo de lineage "${campo}"`);
    }
  });

  test('seleccionar un modelo real NO disponible (runway-gen4 sin asset real de producto) lanza -- el usuario nunca puede forzar un modelo no disponible', () => {
    const rec = recommendImageModel({ productAssetAvailable: false, visualTreatmentId: 'LIFESTYLE' });
    assert.throws(() => buildModelSelection({ ...rec, selectedModelId: 'runway-gen4', productAssetAvailable: false }), /no es un modelo real disponible/);
  });

  test('seleccionar un modelo real que no soporta el aspectRatio pedido lanza', () => {
    const rec = recommendImageModel({ productAssetAvailable: false, visualTreatmentId: 'LIFESTYLE' });
    assert.throws(() => buildModelSelection({
      ...rec, selectedModelId: 'krea-2-large', productAssetAvailable: false, aspectRatio: '21:9',
    }), /no es un modelo real disponible/);
  });
});
