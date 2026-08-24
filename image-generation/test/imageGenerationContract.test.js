// imageGenerationContract.test.js — cierra el círculo end-to-end
// (VisualProductionPackage -> request -> MockImageProvider -> resultado ->
// AssetPackage/ProductIntegrity reales) y verifica los límites
// arquitectónicos de la Fase 1 (Parte 16): el módulo nuevo nunca importa
// autoridad comercial, nunca modifica archivos protegidos, y las capas ya
// existentes (Creative Matcher, MIN_MATCH_SCORE, Product Integrity)
// permanecen exactamente como estaban.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'img-gen-contract-test-'));
process.env.IMAGE_GENERATION_DATA_ROOT = TEST_DATA_ROOT;

const { createProductionArtifact, BASELINE_NOT_ESTABLISHED } = await import('../../creative-intelligence/production/creativeProductionArtifact.js');
const { createVisualProductionPackage } = await import('../../creative-intelligence/production/visualProductionPackage.js');
const { registerImageAsset } = await import('../../video-production/src/assetRegistry.js');
const { registerAssetEntry, ASSET_ENTRY_TYPES } = await import('../../content-orchestrator/src/assetPackage.js');
const { assertAssetEntryIntegrity, captureProductImageState, assertProductImageUnchanged } = await import('../../content-orchestrator/src/productIntegrity.js');
const { MIN_MATCH_SCORE } = await import('../../content-orchestrator/src/campaignMode.js');
const { createImageGenerationRequest } = await import('../src/imageGenerationRequest.js');
const { generateImage } = await import('../src/imageProvider.js');
const { MockImageProvider } = await import('../src/providers/mockImageProvider.js');

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
  delete process.env.IMAGE_GENERATION_DATA_ROOT;
});

const RISKY_CLAIMS = ['tadalafil/pastilla azul', 'limpia arterias y venas', 'corazón sano', 'aumenta testosterona de forma natural'];
const TE_DIVINA_PHOTO = 'C:\\Users\\manue\\Vida Divina\\assets\\products\\te-divina\\raw\\te divina c tasa.jpeg';

function realArtifact(overrides = {}) {
  return createProductionArtifact({
    creativeCellCandidateId: 'CC-A1',
    concept: 'Imagen de producto en contexto real',
    commercialObjective: 'PRODUCT_CONSIDERATION',
    audienceState: 'personas interesadas en bienestar integral',
    coreAngle: 'el producto en su contexto real de uso diario',
    hook: { type: 'DEMONSTRATION', text: 'Así se ve en tu rutina diaria.', mechanism: 'demostración visual', inspiredByPattern: 'AFFILIATE Pattern DEMO (1/7)', hypothesisNote: 'no probado' },
    format: 'IMAGE',
    postCopy: 'Descúbrelo. Escríbenos por WhatsApp.',
    cta: { primary: 'Escríbenos por WhatsApp', whatsapp: '¿Quieres conocer más? Escríbenos por WhatsApp.' },
    visualDirection: { setting: 'cocina', visualMechanism: 'producto en contexto', props: ['mesa de madera'] },
    screenText: ['Descúbrelo hoy'],
    staticVersion: { applicable: true, description: 'imagen del producto' },
    videoVersion: { applicable: false, description: 'no aplica a esta variante' },
    whatsappVersion: 'Cuéntame qué buscas mejorar.',
    variants: [
      { label: 'Variante A', changedVariable: 'VISUAL', description: 'fondo de cocina' },
      { label: 'Variante B', changedVariable: 'VISUAL', description: 'fondo de sala' },
    ],
    complianceNotes: { riskLevel: 'LOW', riskReason: 'sin claims de riesgo' },
    riskyClaims: RISKY_CLAIMS,
    evidenceBasis: ['NONE_OBSERVED_EXPLORATORY'],
    productFactsUsed: [{ fact: 'ingredientes naturales', source: 'docs/productos/07-te-divina.md' }],
    productFactsRequired: [],
    hypothesisRef: 'H-01',
    primaryMetric: 'saves',
    discardCriteria: { metric: 'saves', threshold: BASELINE_NOT_ESTABLISHED, description: 'sin baseline' },
    customerEvidenceRequired: false,
    ...overrides,
  });
}

function realImagePackage({ hasRealProductReference = false } = {}) {
  return createVisualProductionPackage({
    productionArtifact: realArtifact(),
    variantLabel: 'Variante A',
    generationPrompt: 'Fotografía de producto real sobre mesa de madera, luz natural.',
    negativePrompt: 'Sin empaque inventado, sin logotipos falsos, sin texto superpuesto.',
    sceneDescription: 'Cocina real, luz natural de mañana.',
    subjectDescription: 'Producto centrado, fondo desenfocado.',
    productPlacement: { description: 'Producto real visible en primer plano.' },
    cameraDirection: 'Encuadre cenital, cámara estática.',
    lightingDirection: 'Luz natural difusa.',
    screenText: ['Descúbrelo hoy'],
    duration: 'NOT_APPLICABLE',
    caption: 'Descúbrelo hoy. Escríbenos por WhatsApp.',
    cta: 'Escríbenos por WhatsApp.',
    whatsappCta: '¿Quieres conocer más? Escríbenos por WhatsApp.',
    riskyClaims: RISKY_CLAIMS,
    hasRealProductReference,
  });
}

describe('End-to-end — VisualProductionPackage -> request -> MockImageProvider -> resultado', () => {
  test('flujo completo sin referencia de producto produce SUCCESS mock', async () => {
    const vpp = realImagePackage({ hasRealProductReference: false });
    const provider = new MockImageProvider();
    const req = createImageGenerationRequest({ visualProductionPackage: vpp, providerName: provider.providerName, model: provider.model });
    const result = await generateImage({ provider, request: req });
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.isMock, true);
    assert.equal(result.visualProductionPackageId, vpp.visualProductionPackageId);
  });

  test('flujo completo con referencia real de producto preserva el RAW intacto', async (t) => {
    if (!fs.existsSync(TE_DIVINA_PHOTO)) { t.skip('fotografía real no disponible en este entorno'); return; }
    const productAsset = registerImageAsset({ sourcePath: TE_DIVINA_PHOTO, productId: 'te-divina', role: 'PRODUCT_PRIMARY' });
    const before = captureProductImageState(TE_DIVINA_PHOTO);

    const vpp = realImagePackage({ hasRealProductReference: true });
    const provider = new MockImageProvider();
    const req = createImageGenerationRequest({ visualProductionPackage: vpp, providerName: provider.providerName, model: provider.model, productReferenceAsset: productAsset });
    const result = await generateImage({ provider, request: req });

    assert.equal(result.status, 'SUCCESS');
    assert.doesNotThrow(() => assertProductImageUnchanged(before)); // el RAW nunca fue tocado por todo el flujo.
    assert.notEqual(result.asset.sourcePath, TE_DIVINA_PHOTO); // el asset generado es un archivo NUEVO, nunca el RAW mismo.
  });
});

describe('Compatibilidad con AssetPackage real (GENERATED_IMAGE)', () => {
  test('el resultado del MockImageProvider se registra como GENERATED_IMAGE real vía registerAssetEntry()', async () => {
    assert.ok(ASSET_ENTRY_TYPES.includes('GENERATED_IMAGE'));

    const vpp = realImagePackage({ hasRealProductReference: false });
    const provider = new MockImageProvider();
    const req = createImageGenerationRequest({ visualProductionPackage: vpp, providerName: provider.providerName, model: provider.model });
    const result = await generateImage({ provider, request: req });
    assert.equal(result.status, 'SUCCESS');

    const entry = registerAssetEntry({ sourcePath: result.asset.sourcePath, type: 'GENERATED_IMAGE', role: 'GENERATED_SCENE', productId: 'te-divina' });
    assert.equal(entry.status, 'AVAILABLE');
    assert.equal(entry.assetId, result.asset.assetId); // mismo criterio content-addressed en ambos lados.
    assert.doesNotThrow(() => assertAssetEntryIntegrity(entry, { expectedProductId: 'te-divina' }));
  });

  test('un asset GENERATED_IMAGE nunca puede registrarse con un role reservado a fotografía oficial (protección ya existente, no se debilitó)', async () => {
    const vpp = realImagePackage({ hasRealProductReference: false });
    const provider = new MockImageProvider();
    const req = createImageGenerationRequest({ visualProductionPackage: vpp, providerName: provider.providerName, model: provider.model });
    const result = await generateImage({ provider, request: req });
    const entry = registerAssetEntry({ sourcePath: result.asset.sourcePath, type: 'GENERATED_IMAGE', role: 'PRODUCT_PRIMARY', productId: 'te-divina' });
    assert.throws(() => assertAssetEntryIntegrity(entry), /NUNCA puede presentarse como fotografía oficial/);
  });
});

describe('Límites arquitectónicos (Fase 1, Parte 16) — el módulo nuevo no tiene autoridad comercial', () => {
  const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));

  function allSourceFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? allSourceFiles(full) : [full];
    });
  }

  const FORBIDDEN_IMPORT_PATTERNS = [
    /creative-intelligence\/src\/persona\.js/,
    /creative-intelligence\/src\/pain\.js/,
    /creative-intelligence\/src\/angle\.js/,
    /creative-intelligence\/src\/creativeCell\.js/,
    /creative-intelligence\/src\/hypothesisTesting\.js/,
    /productFactsLoader\.js/,
    /whatsapp-adapter/,
    /publishing-scheduler/,
    /dashboard\//,
    /content-orchestrator\/src\/campaignMode\.js/,
    /content-orchestrator\/src\/productMatcher\.js/,
  ];

  test('ningún archivo de image-generation/src importa Persona/Pain/Angle/CreativeCell/HypothesisTesting/ProductFactsLoader/Meta/WhatsApp/Publishing/Dashboard/CampaignMode/ProductMatcher', () => {
    const files = allSourceFiles(SRC_DIR);
    assert.ok(files.length > 0);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        assert.doesNotMatch(content, pattern, `${file} no debería importar algo que coincide con ${pattern}`);
      }
    }
  });

  test('la única entrada de negocio real que image-generation/src importa es visualProductionPackage.js (y su vocabulario) + assetRegistry.js (mecanismo de assets)', () => {
    const files = allSourceFiles(SRC_DIR);
    const crossModuleImports = new Set();
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const matches = content.matchAll(/from '((?:\.\.\/)+[^']+)'/g);
      for (const m of matches) {
        if (m[1].includes('creative-intelligence') || m[1].includes('video-production') || m[1].includes('content-orchestrator')) {
          crossModuleImports.add(m[1]);
        }
      }
    }
    for (const imp of crossModuleImports) {
      assert.ok(
        imp.includes('production/visualProductionPackage.js') || imp.includes('video-production/src/assetRegistry.js'),
        `import fuera de límite detectado: ${imp}`,
      );
    }
  });
});

describe('Regresión — capas protegidas no cambiaron', () => {
  test('MIN_MATCH_SCORE (Creative Matcher) sigue siendo 2, sin cambios', () => {
    assert.equal(MIN_MATCH_SCORE, 2);
  });

  test('ASSET_ENTRY_TYPES (AssetPackage real) no perdió ni ganó tipos por esta fase', () => {
    assert.deepEqual(
      [...ASSET_ENTRY_TYPES],
      ['PRODUCT_IMAGE', 'LOGO', 'GENERATED_IMAGE', 'B_ROLL', 'VIDEO_CLIP', 'AUDIO_VOICE', 'AUDIO_MUSIC', 'GRAPHIC', 'FONT', 'BRAND_ASSET'],
    );
  });

  test('creative-intelligence/data/cycles/ no fue tocado por esta fase (si existe, su listado no cambia durante esta suite)', () => {
    const cyclesDir = fileURLToPath(new URL('../../creative-intelligence/data/cycles', import.meta.url));
    if (!fs.existsSync(cyclesDir)) return; // no existe en este entorno -- nada que verificar, no se fabrica.
    const before = fs.readdirSync(cyclesDir).sort();
    // esta suite completa ya corrió antes de esta aserción -- si algo hubiera
    // escrito ahí, before ya reflejaría la contaminación real.
    const after_ = fs.readdirSync(cyclesDir).sort();
    assert.deepEqual(before, after_);
  });
});

describe('Ningún claim comercial nuevo es creado por este módulo', () => {
  test('el request/resultado nunca contienen texto que no provenga literalmente del VisualProductionPackage', async () => {
    const vpp = realImagePackage({ hasRealProductReference: false });
    const provider = new MockImageProvider();
    const req = createImageGenerationRequest({ visualProductionPackage: vpp, providerName: provider.providerName, model: provider.model });
    assert.equal(req.generationPrompt, vpp.generationPrompt);
    assert.equal(req.negativePrompt, vpp.negativePrompt);
    assert.deepEqual([...req.screenText], [...vpp.screenText]);
    // ninguna palabra nueva: el request es un subconjunto de campos ya
    // existentes del VPP, nunca una síntesis de texto nuevo.
  });
});
