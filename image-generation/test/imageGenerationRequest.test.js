import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createProductionArtifact, BASELINE_NOT_ESTABLISHED } from '../../creative-intelligence/production/creativeProductionArtifact.js';
import { createVisualProductionPackage } from '../../creative-intelligence/production/visualProductionPackage.js';
import { registerImageAsset } from '../../video-production/src/assetRegistry.js';
import { createImageGenerationRequest, computeGenerationFingerprint } from '../src/imageGenerationRequest.js';

const RISKY_CLAIMS = ['tadalafil/pastilla azul', 'limpia arterias y venas', 'corazón sano', 'aumenta testosterona de forma natural'];
const TE_DIVINA_PHOTO = 'C:\\Users\\manue\\Vida Divina\\assets\\products\\te-divina\\raw\\te divina c tasa.jpeg';

// Mismo builder real de creative-intelligence/test/visualProductionPackage.test.js
// (Fase Creative Production Engine v1) -- no se inventa un fixture paralelo,
// se reutiliza el mismo criterio de datos reales.
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

describe('createImageGenerationRequest — mapeo determinista desde VisualProductionPackage', () => {
  test('preserva generationPrompt/negativePrompt/aspectRatio literalmente, sin reescribir', () => {
    const vpp = realImagePackage();
    const req = createImageGenerationRequest({ visualProductionPackage: vpp, providerName: 'mock', model: 'mock-image-model' });
    assert.equal(req.generationPrompt, vpp.generationPrompt);
    assert.equal(req.negativePrompt, vpp.negativePrompt);
    assert.equal(req.aspectRatio, vpp.aspectRatios[0]);
    assert.equal(req.visualProductionPackageId, vpp.visualProductionPackageId);
  });

  test('sin referencia de producto (assetStatus REQUIRED): productReference queda null', () => {
    const vpp = realImagePackage({ hasRealProductReference: false });
    assert.equal(vpp.productPlacement.assetStatus, 'PRODUCT_REFERENCE_REQUIRED');
    const req = createImageGenerationRequest({ visualProductionPackage: vpp, providerName: 'mock', model: 'mock-image-model' });
    assert.equal(req.productReference, null);
  });

  test('rechaza proveer productReferenceAsset cuando el VPP declara PRODUCT_REFERENCE_REQUIRED', () => {
    const vpp = realImagePackage({ hasRealProductReference: false });
    if (!existsSync(TE_DIVINA_PHOTO)) return; // sin fotografía real disponible, se omite este caso concreto (ver test de skip abajo)
    const asset = registerImageAsset({ sourcePath: TE_DIVINA_PHOTO, productId: 'te-divina', role: 'PRODUCT_PRIMARY' });
    assert.throws(() => createImageGenerationRequest({ visualProductionPackage: vpp, providerName: 'mock', model: 'mock-image-model', productReferenceAsset: asset }), /debe ser null, nunca inventado/);
  });

  test('rechaza construir la solicitud cuando el VPP declara PRODUCT_REFERENCE_AVAILABLE sin proveer productReferenceAsset', () => {
    const vpp = realImagePackage({ hasRealProductReference: true });
    assert.equal(vpp.productPlacement.assetStatus, 'PRODUCT_REFERENCE_AVAILABLE');
    assert.throws(() => createImageGenerationRequest({ visualProductionPackage: vpp, providerName: 'mock', model: 'mock-image-model' }), /no se proveyó "productReferenceAsset"/);
  });

  test('con referencia real de producto disponible: se transporta assetId/sourcePath/role sin copiar ni modificar el archivo', (t) => {
    if (!existsSync(TE_DIVINA_PHOTO)) { t.skip('fotografía real no disponible en este entorno'); return; }
    const asset = registerImageAsset({ sourcePath: TE_DIVINA_PHOTO, productId: 'te-divina', role: 'PRODUCT_PRIMARY' });
    const vpp = realImagePackage({ hasRealProductReference: true });
    const req = createImageGenerationRequest({ visualProductionPackage: vpp, providerName: 'mock', model: 'mock-image-model', productReferenceAsset: asset });
    assert.equal(req.productReference.assetId, asset.assetId);
    assert.equal(req.productReference.sourcePath, TE_DIVINA_PHOTO);
    assert.equal(req.productReference.role, 'PRODUCT_PRIMARY');
    // el archivo real sigue existiendo tal cual, con el mismo hash -- nunca se movió/copió/sobrescribió.
    const reHashed = registerImageAsset({ sourcePath: TE_DIVINA_PHOTO, productId: 'te-divina', role: 'PRODUCT_PRIMARY' });
    assert.equal(reHashed.assetId, asset.assetId);
  });

  test('rechaza una productReferenceAsset apuntando a un archivo que no existe', () => {
    const vpp = realImagePackage({ hasRealProductReference: true });
    const fakeAsset = { assetId: 'a'.repeat(64), sourcePath: 'C:/no/existe/foto.jpeg', role: 'PRODUCT_PRIMARY' };
    assert.throws(() => createImageGenerationRequest({ visualProductionPackage: vpp, providerName: 'mock', model: 'mock-image-model', productReferenceAsset: fakeAsset }), /no existe físicamente/);
  });

  test('rechaza un role de referencia inválido', () => {
    if (!existsSync(TE_DIVINA_PHOTO)) return;
    const vpp = realImagePackage({ hasRealProductReference: true });
    const badAsset = { assetId: 'a'.repeat(64), sourcePath: TE_DIVINA_PHOTO, role: 'NOT_A_ROLE' };
    assert.throws(() => createImageGenerationRequest({ visualProductionPackage: vpp, providerName: 'mock', model: 'mock-image-model', productReferenceAsset: badAsset }), /role.*inválido/);
  });

  test('rechaza un VisualProductionPackage sin forma real', () => {
    assert.throws(() => createImageGenerationRequest({ visualProductionPackage: { generationPrompt: 'x' }, providerName: 'mock', model: 'mock-image-model' }));
  });

  test('rechaza providerName/model vacíos', () => {
    const vpp = realImagePackage();
    assert.throws(() => createImageGenerationRequest({ visualProductionPackage: vpp, providerName: '', model: 'mock-image-model' }), /providerName/);
    assert.throws(() => createImageGenerationRequest({ visualProductionPackage: vpp, providerName: 'mock', model: '' }), /model/);
  });
});

describe('computeGenerationFingerprint — determinismo', () => {
  const base = { generationPrompt: 'prompt A', negativePrompt: 'neg A', aspectRatio: '4:5 FEED', providerName: 'mock', model: 'mock-image-model', productReference: null };

  test('mismos insumos generativos -> mismo fingerprint', () => {
    assert.equal(computeGenerationFingerprint(base), computeGenerationFingerprint({ ...base }));
  });

  test('un generationPrompt distinto produce un fingerprint distinto', () => {
    assert.notEqual(computeGenerationFingerprint(base), computeGenerationFingerprint({ ...base, generationPrompt: 'prompt B' }));
  });

  test('un negativePrompt distinto produce un fingerprint distinto', () => {
    assert.notEqual(computeGenerationFingerprint(base), computeGenerationFingerprint({ ...base, negativePrompt: 'neg B' }));
  });

  test('un aspectRatio distinto produce un fingerprint distinto', () => {
    assert.notEqual(computeGenerationFingerprint(base), computeGenerationFingerprint({ ...base, aspectRatio: '9:16 STORY' }));
  });

  test('una referencia de producto distinta produce un fingerprint distinto', () => {
    const withRef = { ...base, productReference: { assetId: 'a'.repeat(64) } };
    const withOtherRef = { ...base, productReference: { assetId: 'b'.repeat(64) } };
    assert.notEqual(computeGenerationFingerprint(withRef), computeGenerationFingerprint(withOtherRef));
    assert.notEqual(computeGenerationFingerprint(base), computeGenerationFingerprint(withRef));
  });

  test('createImageGenerationRequest: dos llamadas con los mismos insumos producen el mismo fingerprint (requestId/createdAt distintos, fingerprint igual)', () => {
    const vpp = realImagePackage();
    const r1 = createImageGenerationRequest({ visualProductionPackage: vpp, providerName: 'mock', model: 'mock-image-model' });
    const r2 = createImageGenerationRequest({ visualProductionPackage: vpp, providerName: 'mock', model: 'mock-image-model' });
    assert.notEqual(r1.requestId, r2.requestId);
    assert.equal(r1.generationFingerprint, r2.generationFingerprint);
  });
});
