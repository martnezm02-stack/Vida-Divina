import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createProductionArtifact, BASELINE_NOT_ESTABLISHED } from '../production/creativeProductionArtifact.js';
import {
  createVisualProductionPackage, deriveAssetType, ASSET_TYPES, PACKAGE_STATUS, PRODUCT_REFERENCE_STATUSES,
} from '../production/visualProductionPackage.js';

const RISKY_CLAIMS = ['tadalafil/pastilla azul', 'limpia arterias y venas', 'corazón sano', 'aumenta testosterona de forma natural'];

function realArtifact(overrides = {}) {
  return createProductionArtifact({
    creativeCellCandidateId: 'CC-A1',
    concept: 'Contraste de rutina de café',
    commercialObjective: 'WHATSAPP_CONVERSATION',
    audienceState: 'personas con una rutina de café establecida',
    coreAngle: 'tu café de siempre puede hacer más por ti',
    hook: { type: 'CONTRAST', text: 'Cada mañana preparas tu café igual... ¿y si pudiera hacer más por ti?', mechanism: 'pattern-interrupt', inspiredByPattern: 'AFFILIATE Pattern CONTRAST (3/7)', hypothesisNote: 'no probado' },
    format: 'SHORT_VIDEO',
    script: { durationRangeSeconds: '15-20s', beats: [{ beat: 'HOOK', content: 'taza de café' }, { beat: 'CTA', content: 'Escríbenos por WhatsApp' }] },
    postCopy: 'Tu café de siempre puede hacer más por ti. Escríbenos por WhatsApp.',
    cta: { primary: 'Escríbenos por WhatsApp', whatsapp: '¿Quieres conocer más? Escríbenos por WhatsApp.' },
    visualDirection: { setting: 'cocina', visualMechanism: 'contraste continuo', props: ['sobre del producto'] },
    screenText: ['Tu café de siempre...', 'Escríbenos por WhatsApp'],
    staticVersion: { applicable: true, description: 'imagen del empaque' },
    videoVersion: { applicable: true, description: 'script arriba' },
    whatsappVersion: 'Cuéntame qué buscas mejorar.',
    variants: [
      { label: 'Variante A', changedVariable: 'HOOK', description: 'cambia el hook a QUESTION' },
      { label: 'Variante B', changedVariable: 'CTA', description: 'cambia el CTA a comentario' },
    ],
    complianceNotes: { riskLevel: 'MEDIUM', riskReason: 'categoría intimidad/libido' },
    riskyClaims: RISKY_CLAIMS,
    evidenceBasis: ['AFFILIATE Pattern CONTRAST (3/7)'],
    productFactsUsed: [{ fact: 'libido saludable, agudeza mental, antioxidante', source: 'docs/productos/02-cafe-divina/tongkat-ali-cafe.md' }],
    productFactsRequired: [],
    hypothesisRef: 'H-01',
    primaryMetric: 'whatsapp_conversations',
    discardCriteria: { metric: 'whatsapp_conversations', threshold: BASELINE_NOT_ESTABLISHED, description: 'sin baseline' },
    customerEvidenceRequired: true,
    ...overrides,
  });
}

function basePackageArgs(overrides = {}) {
  return {
    productionArtifact: realArtifact(),
    variantLabel: 'Variante A',
    generationPrompt: 'Video vertical 9:16, manos anónimas preparan café, se agrega el producto, cierre con CTA de WhatsApp.',
    negativePrompt: 'Sin rostros como testimonio, sin resultados corporales, sin empaque inventado, sin lenguaje de garantía.',
    sceneDescription: 'Cocina real, luz natural matutina, taza de café siendo preparada.',
    subjectDescription: 'Manos anónimas, sin rostro visible.',
    productPlacement: { description: 'Sobre de Café Divina Tongkat Ali visible al añadirse al café.' },
    cameraDirection: 'Encuadre cercano sobre la encimera, cámara estática, sin cortes bruscos.',
    lightingDirection: 'Luz natural de mañana, cálida.',
    screenText: ['¿Sabías que tu café puede aportar más que solo energía?', 'Escríbenos por WhatsApp'],
    voiceover: ['¿Sabías que tu café puede aportar más que solo energía?', 'Café Divina Tongkat Ali combina Reishi, Tongkat Ali y café arábico.', 'Escríbenos por WhatsApp y te contamos cómo incluirlo en tu rutina.'],
    subtitleText: ['¿Sabías que tu café puede aportar más que solo energía?', 'Café Divina Tongkat Ali combina Reishi, Tongkat Ali y café arábico.', 'Escríbenos por WhatsApp y te contamos cómo incluirlo en tu rutina.'],
    duration: '15-20s (sugerido, no benchmark)',
    caption: '¿Sabías que tu café puede aportar más que solo energía? Café Divina Tongkat Ali combina Reishi, Tongkat Ali y café arábico. Escríbenos por WhatsApp.',
    cta: 'Escríbenos por WhatsApp y te contamos cómo incluirlo en tu rutina.',
    whatsappCta: '¿Quieres conocer más? Escríbenos por WhatsApp.',
    riskyClaims: RISKY_CLAIMS,
    hasRealProductReference: false,
    ...overrides,
  };
}

describe('createVisualProductionPackage — forma y campos obligatorios', () => {
  test('construye un paquete real, status DRAFT_FOR_REVIEW, humanReviewRequired true', () => {
    const pkg = createVisualProductionPackage(basePackageArgs());
    assert.equal(pkg.status, PACKAGE_STATUS);
    assert.equal(pkg.status, 'DRAFT_FOR_REVIEW');
    assert.equal(pkg.humanReviewRequired, true);
    assert.equal(pkg.variantId, 'CC-A1-A');
    assert.equal(pkg.creativeCellCandidateId, 'CC-A1');
  });

  test('assetType se deriva del ProductionArtifact.format, no es libre', () => {
    const pkg = createVisualProductionPackage(basePackageArgs());
    assert.equal(pkg.assetType, 'VIDEO');
    assert.deepEqual([...pkg.aspectRatios], ['9:16 REEL / SHORT_VIDEO', '9:16 STORY']);
  });

  test('deriveAssetType mapea IMAGE/CAROUSEL correctamente', () => {
    assert.equal(deriveAssetType({ format: 'IMAGE' }), 'IMAGE');
    assert.equal(deriveAssetType({ format: 'CAROUSEL' }), 'CAROUSEL');
    assert.throws(() => deriveAssetType({ format: 'BILLBOARD' }));
  });

  test('rechaza una variantLabel que no existe en el ProductionArtifact', () => {
    assert.throws(() => createVisualProductionPackage(basePackageArgs({ variantLabel: 'Variante Z' })), /no existe una variante/);
  });

  test('rechaza un productionArtifact que no sea real / no esté DRAFT_FOR_REVIEW', () => {
    assert.throws(() => createVisualProductionPackage(basePackageArgs({ productionArtifact: { status: 'APPROVED' } })));
  });

  test('assetType VIDEO exige voiceover y subtitleText no vacíos', () => {
    assert.throws(() => createVisualProductionPackage(basePackageArgs({ voiceover: null })), /requiere "voiceover"/);
    assert.throws(() => createVisualProductionPackage(basePackageArgs({ subtitleText: [] })), /requiere "subtitleText"/);
  });

  test('assetType IMAGE/CAROUSEL rechaza voiceover/subtitleText no-null', () => {
    const imageArtifact = realArtifact({ creativeCellCandidateId: 'CC-B2', format: 'IMAGE', script: null, staticVersion: { applicable: true, description: 'x' }, videoVersion: { applicable: false, description: 'no aplica' } });
    assert.throws(() => createVisualProductionPackage(basePackageArgs({ productionArtifact: imageArtifact, voiceover: ['x'] })), /no lleva voiceover/);
  });

  test('sin riskyClaims (no arreglo) se rechaza', () => {
    assert.throws(() => createVisualProductionPackage(basePackageArgs({ riskyClaims: undefined })), /riskyClaims/);
  });
});

describe('assetStatus / product reference', () => {
  test('hasRealProductReference=false -> assetStatus PRODUCT_REFERENCE_REQUIRED', () => {
    const pkg = createVisualProductionPackage(basePackageArgs());
    assert.equal(pkg.productPlacement.assetStatus, 'PRODUCT_REFERENCE_REQUIRED');
    assert.ok(PRODUCT_REFERENCE_STATUSES.includes(pkg.productPlacement.assetStatus));
  });

  test('hasRealProductReference=true -> assetStatus PRODUCT_REFERENCE_AVAILABLE', () => {
    const pkg = createVisualProductionPackage(basePackageArgs({ hasRealProductReference: true }));
    assert.equal(pkg.productPlacement.assetStatus, 'PRODUCT_REFERENCE_AVAILABLE');
  });

  test('el llamador no puede fijar assetStatus directamente (se calcula, no se acepta del input)', () => {
    const pkg = createVisualProductionPackage(basePackageArgs({ productPlacement: { description: 'x', assetStatus: 'PRODUCT_REFERENCE_AVAILABLE' } }));
    // hasRealProductReference sigue en false (default) -> debe ganar el cálculo real, no el valor colado en el objeto de entrada.
    assert.equal(pkg.productPlacement.assetStatus, 'PRODUCT_REFERENCE_REQUIRED');
  });
});

describe('Guards de compliance reutilizados (no duplicados)', () => {
  test('rechaza generationPrompt que reproduce un claim de riesgo', () => {
    assert.throws(() => createVisualProductionPackage(basePackageArgs({ generationPrompt: 'Mostrar que limpia arterias y venas.' })), /claim de riesgo de compliance/);
  });

  test('rechaza caption con lenguaje de promesa absoluta', () => {
    assert.throws(() => createVisualProductionPackage(basePackageArgs({ caption: 'Resultado garantizado en 7 días.' })), /lenguaje de promesa absoluta/);
  });

  test('rechaza si el paquete completo contiene VALIDATED/WINNER/PROVEN', () => {
    assert.throws(() => createVisualProductionPackage(basePackageArgs({ sceneDescription: 'Escena VALIDATED por el mercado.' })), /VALIDATED/);
  });

  test('rechaza negativePrompt vacío', () => {
    assert.throws(() => createVisualProductionPackage(basePackageArgs({ negativePrompt: '' })), /negativePrompt/);
  });
});

describe('sourceFacts — nunca Product Facts inventados', () => {
  test('sourceFacts se hereda literalmente de productionArtifact.productFactsUsed, cada uno con fact+source reales', () => {
    const pkg = createVisualProductionPackage(basePackageArgs());
    assert.equal(pkg.sourceFacts.length, 1);
    assert.equal(pkg.sourceFacts[0].source, 'docs/productos/02-cafe-divina/tongkat-ali-cafe.md');
    assert.ok(pkg.sourceFacts[0].fact?.trim());
  });

  test('un ProductionArtifact sin productFactsUsed reales (vacío) se refleja como vacío, nunca se completa con un hecho inventado', () => {
    const artifact = realArtifact({ productFactsUsed: [] });
    const pkg = createVisualProductionPackage(basePackageArgs({ productionArtifact: artifact }));
    assert.deepEqual([...pkg.sourceFacts], []);
  });
});

describe('ASSET_TYPES', () => {
  test('incluye exactamente VIDEO/IMAGE/CAROUSEL', () => {
    assert.deepEqual([...ASSET_TYPES], ['VIDEO', 'IMAGE', 'CAROUSEL']);
  });
});
