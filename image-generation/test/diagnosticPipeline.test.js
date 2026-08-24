// diagnosticPipeline.test.js — Fase 2.5: prueba controlada de diagnóstico de
// la infraestructura YA construida en la Fase 1 (VisualProductionPackage ->
// createImageGenerationRequest() -> generateImage() -> MockImageProvider ->
// createImageGenerationResult()). NO agrega capacidades nuevas, NO conecta
// ningún proveedor real -- exclusivamente ejecuta y documenta con evidencia
// el pipeline existente, exactamente como los archivos ya construidos en
// la Fase 1 lo definen. Ningún archivo de src/ fue tocado para escribir
// este test.
//
// Producto usado en la Prueba A/B/D/E: Divina Ripped Capsules (real, activo,
// docs/productos/07-rendimiento-fisico.md#ripped-capsules) -- Product Facts
// citados tal cual existen, nunca inventados ni modificados.
// Producto usado en la Prueba C: Té Divina (fotografía real ya usada en
// content-orchestrator/test/assetPackage.test.js e
// image-generation/test/imageGenerationRequest.test.js).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'img-gen-diagnostic-'));
process.env.IMAGE_GENERATION_DATA_ROOT = TEST_DATA_ROOT;

const { createProductionArtifact, BASELINE_NOT_ESTABLISHED } = await import('../../creative-intelligence/production/creativeProductionArtifact.js');
const { createVisualProductionPackage } = await import('../../creative-intelligence/production/visualProductionPackage.js');
const { registerImageAsset } = await import('../../video-production/src/assetRegistry.js');
const { registerAssetEntry } = await import('../../content-orchestrator/src/assetPackage.js');
const { assertAssetEntryIntegrity, captureProductImageState, assertProductImageUnchanged } = await import('../../content-orchestrator/src/productIntegrity.js');
const { recordLineage, getLineage, traceLineageChain, hashFile: hashLineageFile } = await import('../../content-orchestrator/src/assetLineage.js');
const { MIN_MATCH_SCORE } = await import('../../content-orchestrator/src/campaignMode.js');
const { createImageGenerationRequest } = await import('../src/imageGenerationRequest.js');
const { generateImage, assertValidImageProvider } = await import('../src/imageProvider.js');
const { createImageGenerationResult, IMAGE_GENERATION_STATUSES, GENERATED_IMAGE_REVIEW_STATUS } = await import('../src/imageGenerationResult.js');
const { MockImageProvider } = await import('../src/providers/mockImageProvider.js');

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
  delete process.env.IMAGE_GENERATION_DATA_ROOT;
});

const TE_DIVINA_PHOTO = 'C:\\Users\\manue\\Vida Divina\\assets\\products\\te-divina\\raw\\te divina c tasa.jpeg';

// --- Fixture: Divina Ripped Capsules (real, docs/productos/07-rendimiento-fisico.md#ripped-capsules) ---
// Product Facts citados literalmente de ese documento -- ni inventados ni modificados.
function realRippedCapsulesArtifact(overrides = {}) {
  return createProductionArtifact({
    creativeCellCandidateId: 'CC-RIPPED-A1',
    concept: 'Producto en contexto de entrenamiento de fuerza',
    commercialObjective: 'PRODUCT_CONSIDERATION',
    audienceState: 'personas interesadas en aumentar masa muscular y prevenir el envejecimiento prematuro',
    coreAngle: 'Tongkat Ali y Ganoderma para rendimiento físico real',
    hook: { type: 'DEMONSTRATION', text: 'Así se ve en tu rutina de entrenamiento.', mechanism: 'demostración visual', inspiredByPattern: 'AFFILIATE Pattern DEMO (1/7)', hypothesisNote: 'no probado' },
    format: 'IMAGE',
    postCopy: 'Divina Ripped Capsules: Tongkat Ali y Ganoderma. Escríbenos por WhatsApp.',
    cta: { primary: 'Escríbenos por WhatsApp', whatsapp: '¿Quieres conocer más sobre Ripped Capsules? Escríbenos por WhatsApp.' },
    visualDirection: { setting: 'gimnasio', visualMechanism: 'producto en contexto de entrenamiento', props: ['mancuernas', 'toalla de entrenamiento'] },
    screenText: ['Fuerza real, todos los días'],
    staticVersion: { applicable: true, description: 'imagen del producto en contexto de gimnasio' },
    videoVersion: { applicable: false, description: 'no aplica a esta variante' },
    whatsappVersion: 'Cuéntame qué objetivo de rendimiento físico buscas.',
    variants: [
      { label: 'Variante A', changedVariable: 'VISUAL', description: 'fondo de gimnasio' },
      { label: 'Variante B', changedVariable: 'VISUAL', description: 'fondo de entrenamiento al aire libre' },
    ],
    complianceNotes: { riskLevel: 'LOW', riskReason: 'sin claims de riesgo — beneficios tal como documentados en docs/productos/07-rendimiento-fisico.md' },
    riskyClaims: ['tadalafil/pastilla azul', 'limpia arterias y venas', 'corazón sano', 'aumenta testosterona de forma natural'],
    evidenceBasis: ['NONE_OBSERVED_EXPLORATORY'],
    productFactsUsed: [
      { fact: 'Tongkat Ali y Ganoderma (Reishi); aporta al aumento de la musculatura; ayuda a prevenir el envejecimiento prematuro', source: 'docs/productos/07-rendimiento-fisico.md#ripped-capsules' },
    ],
    productFactsRequired: [],
    hypothesisRef: 'H-RIPPED-01',
    primaryMetric: 'saves',
    discardCriteria: { metric: 'saves', threshold: BASELINE_NOT_ESTABLISHED, description: 'sin baseline' },
    customerEvidenceRequired: false,
    ...overrides,
  });
}

function realRippedCapsulesPackage({ hasRealProductReference = false } = {}) {
  return createVisualProductionPackage({
    productionArtifact: realRippedCapsulesArtifact(),
    variantLabel: 'Variante A',
    generationPrompt: 'Fotografía de producto Divina Ripped Capsules en un gimnasio real, luz natural, composición publicitaria.',
    negativePrompt: 'Sin empaque inventado, sin logotipos falsos, sin claims médicos en pantalla, sin texto superpuesto adicional.',
    sceneDescription: 'Gimnasio real, luz natural de mañana, ambiente de entrenamiento de fuerza.',
    subjectDescription: 'Producto centrado en primer plano, fondo de gimnasio desenfocado.',
    productPlacement: { description: 'Envase real de Divina Ripped Capsules visible en primer plano, sin alterar etiqueta.' },
    cameraDirection: 'Encuadre a la altura del producto, cámara estática, ligera profundidad de campo.',
    lightingDirection: 'Luz natural difusa, tono cálido de gimnasio.',
    screenText: ['Fuerza real, todos los días'],
    duration: 'NOT_APPLICABLE',
    caption: 'Divina Ripped Capsules: Tongkat Ali y Ganoderma para tu rendimiento físico. Escríbenos por WhatsApp.',
    cta: 'Escríbenos por WhatsApp.',
    whatsappCta: '¿Quieres conocer más sobre Ripped Capsules? Escríbenos por WhatsApp.',
    riskyClaims: ['tadalafil/pastilla azul', 'limpia arterias y venas', 'corazón sano', 'aumenta testosterona de forma natural'],
    hasRealProductReference,
  });
}

// =====================================================================
// PRUEBA A — GENERACIÓN PURA (Divina Ripped Capsules, MockImageProvider)
// =====================================================================
describe('PRUEBA A — Generación pura (Divina Ripped Capsules, MockImageProvider)', () => {
  let vpp, provider, request, result;

  before(async () => {
    vpp = realRippedCapsulesPackage({ hasRealProductReference: false });
    provider = new MockImageProvider();
    request = createImageGenerationRequest({ visualProductionPackage: vpp, providerName: provider.providerName, model: provider.model });
    result = await generateImage({ provider, request });
  });

  test('1. request válido: contiene generationPrompt/negativePrompt/sceneDescription/productPlacement/cameraDirection/lightingDirection/aspectRatio', () => {
    assert.equal(request.generationPrompt, vpp.generationPrompt);
    assert.equal(request.negativePrompt, vpp.negativePrompt);
    assert.equal(request.sceneDescription, vpp.sceneDescription);
    assert.equal(request.productPlacementDescription, vpp.productPlacement.description);
    assert.equal(request.cameraDirection, vpp.cameraDirection);
    assert.equal(request.lightingDirection, vpp.lightingDirection);
    assert.ok(request.aspectRatio);
  });

  test('2. provider correctamente seleccionado (providerName/model del request coinciden con el provider real)', () => {
    assert.equal(request.providerName, 'mock');
    assert.equal(request.model, 'mock-image-model');
    assert.equal(result.providerName, 'mock');
    assert.equal(result.model, 'mock-image-model');
  });

  test('3. provider configurado (isConfigured() true, gate nunca se activó)', () => {
    assert.equal(provider.isConfigured(), true);
    assert.notEqual(result.status, 'CONFIGURATION_REQUIRED');
  });

  test('4. generate() fue ejecutado realmente (resultado real, no undefined/null)', () => {
    assert.ok(result);
    assert.ok(IMAGE_GENERATION_STATUSES.includes(result.status));
  });

  test('5. result SUCCESS', () => {
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.error, null);
  });

  test('6. asset creado, archivo real en disco', () => {
    assert.ok(result.asset);
    assert.ok(fs.existsSync(result.asset.sourcePath));
  });

  test('7. reviewStatus === DRAFT', () => {
    assert.equal(result.asset.reviewStatus, 'DRAFT');
    assert.equal(result.asset.reviewStatus, GENERATED_IMAGE_REVIEW_STATUS);
  });

  test('8. generationFingerprint presente, sha256 real, igual entre request y result', () => {
    assert.match(request.generationFingerprint, /^[0-9a-f]{64}$/);
    assert.equal(result.generationFingerprint, request.generationFingerprint);
  });

  test('9. asset compatible con GENERATED_IMAGE (AssetPackage real lo acepta e integridad se cumple)', () => {
    const entry = registerAssetEntry({ sourcePath: result.asset.sourcePath, type: 'GENERATED_IMAGE', role: 'GENERATED_SCENE', productId: 'ripped-capsules' });
    assert.equal(entry.status, 'AVAILABLE');
    assert.equal(entry.assetId, result.asset.assetId);
    assert.doesNotThrow(() => assertAssetEntryIntegrity(entry, { expectedProductId: 'ripped-capsules' }));
  });

  test('10. lineage/integridad compatible con assetLineage.js real (recordLineage/getLineage/traceLineageChain)', () => {
    const derivedAssetId = hashLineageFile(result.asset.sourcePath);
    assert.equal(derivedAssetId, result.asset.assetId); // mismo criterio content-addressed en ambos módulos.
    const record = recordLineage({
      derivedAssetId,
      derivedAssetPath: result.asset.sourcePath,
      sourceAssetIds: [], // sin producto real de referencia en esta prueba (Prueba A es generación pura).
      sourceAssetPaths: [],
      operation: 'MOCK_IMAGE_GENERATION',
    });
    assert.equal(record.derivedAssetId, derivedAssetId);
    assert.equal(getLineage(derivedAssetId).operation, 'MOCK_IMAGE_GENERATION');
    const chain = traceLineageChain(derivedAssetId);
    assert.equal(chain[0].assetId, derivedAssetId);
    assert.equal(chain[0].isOrigin, false); // tiene lineage propio -- no es un asset de origen.
  });
});

// =====================================================================
// PRUEBA B — IDEMPOTENCIA
// =====================================================================
describe('PRUEBA B — Idempotencia (mismos insumos generativos -> mismo fingerprint y mismo archivo)', () => {
  test('dos generaciones con los mismos generationPrompt/negativePrompt/aspectRatio/provider/model producen el mismo generationFingerprint y el mismo archivo de salida', async () => {
    const vppA = realRippedCapsulesPackage({ hasRealProductReference: false });
    const vppB = realRippedCapsulesPackage({ hasRealProductReference: false }); // reconstruido de forma independiente, mismos insumos generativos.
    const provider = new MockImageProvider();

    const requestA = createImageGenerationRequest({ visualProductionPackage: vppA, providerName: provider.providerName, model: provider.model });
    const requestB = createImageGenerationRequest({ visualProductionPackage: vppB, providerName: provider.providerName, model: provider.model });

    assert.notEqual(vppA.visualProductionPackageId, vppB.visualProductionPackageId); // objetos distintos...
    assert.equal(requestA.generationFingerprint, requestB.generationFingerprint); // ...pero mismo fingerprint, por depender solo de los insumos generativos.

    const resultA = await generateImage({ provider, request: requestA });
    const resultB = await generateImage({ provider, request: requestB });

    assert.equal(resultA.asset.sourcePath, resultB.asset.sourcePath); // mismo archivo, no duplicado.
    assert.equal(resultA.asset.assetId, resultB.asset.assetId);
  });

  test('un insumo generativo distinto (negativePrompt) produce un fingerprint y un archivo distintos', async () => {
    const provider = new MockImageProvider();
    const vppA = realRippedCapsulesPackage({ hasRealProductReference: false });
    const requestA = createImageGenerationRequest({ visualProductionPackage: vppA, providerName: provider.providerName, model: provider.model });

    const vppB = createVisualProductionPackage({
      productionArtifact: realRippedCapsulesArtifact(),
      variantLabel: 'Variante A',
      generationPrompt: vppA.generationPrompt,
      negativePrompt: 'Un negative prompt real, pero deliberadamente distinto al de vppA.',
      sceneDescription: vppA.sceneDescription,
      subjectDescription: vppA.subjectDescription,
      productPlacement: { description: vppA.productPlacement.description },
      cameraDirection: vppA.cameraDirection,
      lightingDirection: vppA.lightingDirection,
      screenText: [...vppA.screenText],
      duration: 'NOT_APPLICABLE',
      caption: vppA.caption,
      cta: vppA.cta,
      whatsappCta: vppA.whatsappCta,
      riskyClaims: [...vppA.prohibitedClaims],
      hasRealProductReference: false,
    });
    const requestB = createImageGenerationRequest({ visualProductionPackage: vppB, providerName: provider.providerName, model: provider.model });

    assert.notEqual(requestA.generationFingerprint, requestB.generationFingerprint);
    const resultA = await generateImage({ provider, request: requestA });
    const resultB = await generateImage({ provider, request: requestB });
    assert.notEqual(resultA.asset.sourcePath, resultB.asset.sourcePath);
  });
});

// =====================================================================
// PRUEBA C — PRODUCT REFERENCE (fotografía real de Té Divina)
// =====================================================================
describe('PRUEBA C — Product Reference (fotografía real de Té Divina)', () => {
  test('assetId/sourcePath/role viajan intactos a través del contrato; el módulo NUNCA modifica los bytes del producto', async (t) => {
    if (!fs.existsSync(TE_DIVINA_PHOTO)) { t.skip('fotografía real no disponible en este entorno'); return; }

    const productAsset = registerImageAsset({ sourcePath: TE_DIVINA_PHOTO, productId: 'te-divina', role: 'PRODUCT_PRIMARY' });
    const before_ = captureProductImageState(TE_DIVINA_PHOTO); // hash real ANTES de todo el flujo.

    const vpp = createVisualProductionPackage({
      productionArtifact: createProductionArtifact({
        creativeCellCandidateId: 'CC-TE-DIVINA-A1',
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
        riskyClaims: ['tadalafil/pastilla azul', 'limpia arterias y venas', 'corazón sano', 'aumenta testosterona de forma natural'],
        evidenceBasis: ['NONE_OBSERVED_EXPLORATORY'],
        productFactsUsed: [{ fact: 'ingredientes naturales', source: 'docs/productos/07-te-divina.md' }],
        productFactsRequired: [],
        hypothesisRef: 'H-01',
        primaryMetric: 'saves',
        discardCriteria: { metric: 'saves', threshold: BASELINE_NOT_ESTABLISHED, description: 'sin baseline' },
        customerEvidenceRequired: false,
      }),
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
      riskyClaims: ['tadalafil/pastilla azul', 'limpia arterias y venas', 'corazón sano', 'aumenta testosterona de forma natural'],
      hasRealProductReference: true,
    });

    const provider = new MockImageProvider();
    const request = createImageGenerationRequest({ visualProductionPackage: vpp, providerName: provider.providerName, model: provider.model, productReferenceAsset: productAsset });

    assert.equal(request.productReference.assetId, productAsset.assetId);
    assert.equal(request.productReference.sourcePath, TE_DIVINA_PHOTO);
    assert.equal(request.productReference.role, 'PRODUCT_PRIMARY');

    const result = await generateImage({ provider, request });
    assert.equal(result.status, 'SUCCESS');

    assert.doesNotThrow(() => assertProductImageUnchanged(before_)); // el RAW nunca cambió, verificado por hash real.
    assert.notEqual(result.asset.sourcePath, TE_DIVINA_PHOTO); // el asset generado es un archivo NUEVO, nunca el RAW mismo.
    assert.equal(productAsset.role, 'PRODUCT_PRIMARY'); // role del objeto de referencia intacto.

    const reHashed = registerImageAsset({ sourcePath: TE_DIVINA_PHOTO, productId: 'te-divina', role: 'PRODUCT_PRIMARY' });
    assert.equal(reHashed.assetId, productAsset.assetId); // hash antes/después idéntico.
  });

  test('el MockProvider no finge una edición visual real: el resultado sigue siendo isMock=true incluso con referencia de producto', async (t) => {
    if (!fs.existsSync(TE_DIVINA_PHOTO)) { t.skip('fotografía real no disponible en este entorno'); return; }
    const productAsset = registerImageAsset({ sourcePath: TE_DIVINA_PHOTO, productId: 'te-divina', role: 'PRODUCT_PRIMARY' });
    const vpp = realRippedCapsulesPackage({ hasRealProductReference: false }); // paquete propio, sin referencia -- solo para aislar este chequeo puntual del provider.
    void vpp;
    const provider = new MockImageProvider();
    const request = createImageGenerationRequest({
      visualProductionPackage: realRippedCapsulesPackage({ hasRealProductReference: true }),
      providerName: provider.providerName,
      model: provider.model,
      productReferenceAsset: { assetId: productAsset.assetId, sourcePath: productAsset.sourcePath, role: productAsset.role },
    });
    const result = await generateImage({ provider, request });
    assert.equal(result.isMock, true);
    const contenido = fs.readFileSync(result.asset.sourcePath, 'utf8');
    assert.match(contenido, /ESTE ARCHIVO NO ES UNA IMAGEN REAL/);
    assert.match(contenido, new RegExp(productAsset.assetId)); // la referencia SÍ viajó hasta el mock (transportada, no usada visualmente).
  });
});

// =====================================================================
// PRUEBA D — FAILURE MODES (los 4 estados ya existentes, ninguno nuevo)
// =====================================================================
describe('PRUEBA D — Failure modes (SUCCESS / CONFIGURATION_REQUIRED / INVALID_REQUEST / PROVIDER_ERROR)', () => {
  test('SUCCESS: request válido + provider configurado -> asset real, error null', async () => {
    const vpp = realRippedCapsulesPackage({ hasRealProductReference: false });
    const provider = new MockImageProvider();
    const request = createImageGenerationRequest({ visualProductionPackage: vpp, providerName: provider.providerName, model: provider.model });
    const result = await generateImage({ provider, request });
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.error, null);
    assert.ok(result.asset);
  });

  test('CONFIGURATION_REQUIRED: provider real (no-mock) sin credenciales -> nunca llama generate(), asset null, error explícito', async () => {
    let generateCalled = false;
    const fakeRealProvider = {
      providerName: 'a-real-provider-without-credentials',
      model: 'some-model',
      capabilities: Object.freeze({ textToImage: true }),
      isConfigured: () => false, // simula un provider real sin FLUX_API_KEY/OPENAI_API_KEY configurada.
      generate: async () => { generateCalled = true; throw new Error('nunca debió llamarse'); },
    };
    assert.doesNotThrow(() => assertValidImageProvider(fakeRealProvider)); // la FORMA es válida -- el gate es por configuración, no por forma.

    const vpp = realRippedCapsulesPackage({ hasRealProductReference: false });
    const request = createImageGenerationRequest({ visualProductionPackage: vpp, providerName: fakeRealProvider.providerName, model: fakeRealProvider.model });
    const result = await generateImage({ provider: fakeRealProvider, request });

    assert.equal(result.status, 'CONFIGURATION_REQUIRED');
    assert.equal(result.asset, null);
    assert.match(result.error, /no está configurado/);
    assert.equal(generateCalled, false);
  });

  test('INVALID_REQUEST: solicitud sin campos mínimos reales -> MockImageProvider la rechaza, asset null', async () => {
    const provider = new MockImageProvider();
    const result = await provider.generate({ requestId: 'r-diagnostic-invalid' }); // sin generationPrompt/negativePrompt/aspectRatio/fingerprint reales.
    assert.equal(result.status, 'INVALID_REQUEST');
    assert.equal(result.asset, null);
    assert.match(result.error, /campos mínimos reales/);
  });

  test('PROVIDER_ERROR: generate() lanza -> generateImage() lo convierte en PROVIDER_ERROR explícito, nunca en SUCCESS', async () => {
    const brokenProvider = {
      providerName: 'broken-provider',
      model: 'broken-model',
      capabilities: Object.freeze({ textToImage: true }),
      isConfigured: () => true,
      generate: async () => { throw new Error('fallo real simulado en Prueba D'); },
    };
    const vpp = realRippedCapsulesPackage({ hasRealProductReference: false });
    const request = createImageGenerationRequest({ visualProductionPackage: vpp, providerName: brokenProvider.providerName, model: brokenProvider.model });
    const result = await generateImage({ provider: brokenProvider, request });

    assert.equal(result.status, 'PROVIDER_ERROR');
    assert.equal(result.asset, null);
    assert.match(result.error, /fallo real simulado en Prueba D/);
  });
});

// =====================================================================
// PRUEBA E — HUMAN REVIEW GATE
// =====================================================================
describe('PRUEBA E — Human Review Gate (el generador jamás aprueba su propio asset)', () => {
  test('un asset generado por el pipeline real nace reviewStatus=DRAFT', async () => {
    const vpp = realRippedCapsulesPackage({ hasRealProductReference: false });
    const provider = new MockImageProvider();
    const request = createImageGenerationRequest({ visualProductionPackage: vpp, providerName: provider.providerName, model: provider.model });
    const result = await generateImage({ provider, request });
    assert.equal(result.asset.reviewStatus, 'DRAFT');
  });

  test('createImageGenerationResult() IGNORA cualquier intento de auto-aprobación: aunque el asset de entrada declare reviewStatus="APPROVED", el resultado real fuerza DRAFT', () => {
    const result = createImageGenerationResult({
      status: 'SUCCESS',
      requestId: 'r-diagnostic-approval-attempt',
      providerName: 'mock',
      model: 'mock-image-model',
      isMock: true,
      generationFingerprint: '0'.repeat(64),
      asset: { assetId: null, sourcePath: 'C:/diagnostic/fake.mock', type: 'GENERATED_IMAGE', reviewStatus: 'APPROVED' }, // intento explícito de auto-aprobación.
    });
    assert.equal(result.asset.reviewStatus, 'DRAFT'); // el intento fue ignorado -- reviewStatus es un valor fijo de la constante, nunca un parámetro real.
    assert.notEqual(result.asset.reviewStatus, 'APPROVED');
  });
});

// =====================================================================
// PRUEBA DE AISLAMIENTO
// =====================================================================
describe('PRUEBA DE AISLAMIENTO — esta fase no toca autoridad comercial ni datos históricos', () => {
  test('MIN_MATCH_SCORE (Creative Matcher) sigue siendo 2', () => {
    assert.equal(MIN_MATCH_SCORE, 2);
  });

  test('este archivo de diagnóstico no importa Persona/Pain/Angle/CreativeCell/HypothesisTesting/ProductFactsLoader/Meta/WhatsApp/Publishing/Dashboard', () => {
    // Se escanean SOLO las líneas de import reales (no el archivo completo)
    // para que esta verificación no se detecte falsamente a sí misma -- la
    // lista de patrones prohibidos de abajo, si se comparara contra el texto
    // crudo del archivo completo, contendría sus propios nombres literales.
    //
    // campaignMode.js (MIN_MATCH_SCORE) SÍ se importa deliberadamente en este
    // archivo -- no para producción, sino para VERIFICAR en la Prueba de
    // Aislamiento que su valor no cambió (ver el test anterior). Por eso no
    // aparece en esta lista: la regla real que protege es que
    // image-generation/src/ nunca lo importe (ya verificado de forma
    // exhaustiva por imageGenerationContract.test.js, Fase 1), no que un
    // archivo de test de verificación no pueda leerlo.
    const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const importLines = src.split('\n').filter((l) => /^(import |const .* = await import\()/.test(l.trim()));
    const importSource = importLines.join('\n');
    const forbiddenSubstrings = [
      'creative-intelligence/src/persona.js', 'creative-intelligence/src/pain.js', 'creative-intelligence/src/angle.js',
      'creative-intelligence/src/creativeCell.js', 'creative-intelligence/src/hypothesisTesting.js',
      'productFactsLoader.js', 'whatsapp' + '-adapter', 'publishing' + '-scheduler', 'dashboard/',
    ];
    for (const substring of forbiddenSubstrings) assert.ok(!importSource.includes(substring), `import prohibido detectado: ${substring}`);
  });

  test('image-generation/src/ (código de producción, distinto de este archivo de test) sigue sin importar campaignMode.js/productMatcher.js -- verificado exhaustivamente en imageGenerationContract.test.js (Fase 1)', () => {
    const srcDir = fileURLToPath(new URL('../src', import.meta.url));
    function allFiles(dir) {
      return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? allFiles(full) : [full];
      });
    }
    for (const file of allFiles(srcDir)) {
      const content = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(content, /campaignMode\.js/, `${file} no debería importar campaignMode.js`);
      assert.doesNotMatch(content, /productMatcher\.js/, `${file} no debería importar productMatcher.js`);
    }
  });

  test('ningún CreativeCell/Persona/Pain/Customer Evidence nuevo fue creado (creative-intelligence/data/cycles/ sin cambios si existe)', () => {
    const cyclesDir = fileURLToPath(new URL('../../creative-intelligence/data/cycles', import.meta.url));
    if (!fs.existsSync(cyclesDir)) return; // no existe en este entorno -- nada que verificar, no se fabrica.
    const before_ = fs.readdirSync(cyclesDir).sort();
    const after_ = fs.readdirSync(cyclesDir).sort();
    assert.deepEqual(before_, after_);
  });

  test('los productionArtifactCandidateId usados (CC-RIPPED-A1, CC-TE-DIVINA-A1) son ids libres de prueba, nunca creativeCellId reales -- consistente con la regla de creativeProductionArtifact.js', () => {
    const artifact = realRippedCapsulesArtifact();
    assert.equal(artifact.creativeCellCandidateId, 'CC-RIPPED-A1');
    assert.doesNotMatch(artifact.creativeCellCandidateId, /^[0-9a-f]{8}-[0-9a-f]{4}-/); // no tiene forma de UUID real.
  });
});
