// visualProductionPackageStore.test.js — 100% local, directorio temporal
// aislado, nunca escribe en creative-intelligence/data/ real. Incluye la
// cadena completa de integración pedida en esta fase:
// ProductionArtifact -> Store -> VisualProductionPackage -> Store -> recuperación.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-vpp-store-test-'));
process.env.CREATIVE_INTELLIGENCE_DATA_ROOT = TEST_DATA_ROOT;

const { saveProductionArtifact, PRODUCTION_ARTIFACTS_DIR } = await import('../production/productionArtifactStore.js');
const {
  saveVisualProductionPackage, getVisualProductionPackage, visualProductionPackageExists,
  listVisualProductionPackages, deleteVisualProductionPackage, listVisualProductionPackagesByProductionArtifact,
  VISUAL_PRODUCTION_PACKAGES_DIR,
} = await import('../production/visualProductionPackageStore.js');
const { createProductionArtifact, BASELINE_NOT_ESTABLISHED } = await import('../production/creativeProductionArtifact.js');
const { createVisualProductionPackage } = await import('../production/visualProductionPackage.js');

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
});

const RISKY_CLAIMS = ['tadalafil/pastilla azul'];

function realArtifact(overrides = {}) {
  return createProductionArtifact({
    creativeCellCandidateId: 'CC-VPP-STORE-TEST',
    concept: 'Concepto real de prueba',
    commercialObjective: 'WHATSAPP_CONVERSATION',
    audienceState: 'personas con estreñimiento crónico',
    coreAngle: 'ángulo real de prueba',
    hook: { type: 'QUESTION', text: 'Hook real', mechanism: 'validación', inspiredByPattern: 'patrón', hypothesisNote: 'nota' },
    format: 'REEL',
    postCopy: 'Copy real. Escríbenos por WhatsApp.',
    cta: { primary: 'Escríbenos por WhatsApp', whatsapp: 'CTA whatsapp real' },
    visualDirection: { setting: 'home', visualMechanism: 'zoom', props: [] },
    screenText: ['Hook real'],
    staticVersion: { applicable: false, description: 'no aplica' },
    videoVersion: { applicable: true, description: 'aplica' },
    whatsappVersion: 'Versión whatsapp real.',
    variants: [
      { label: 'Variante A', changedVariable: 'HOOK', description: 'variante A real' },
      { label: 'Variante B', changedVariable: 'CTA', description: 'variante B real' },
    ],
    complianceNotes: { riskLevel: 'LOW', riskReason: 'sin riesgo' },
    riskyClaims: RISKY_CLAIMS,
    evidenceBasis: ['NONE_OBSERVED_EXPLORATORY'],
    hypothesisRef: 'H-VPP-STORE-TEST',
    primaryMetric: 'whatsapp_conversations',
    discardCriteria: { metric: 'whatsapp_conversations', threshold: BASELINE_NOT_ESTABLISHED, description: 'sin baseline' },
    customerEvidenceRequired: false,
    ...overrides,
  });
}

function realPackage(artifact, overrides = {}) {
  return createVisualProductionPackage({
    productionArtifact: artifact,
    variantLabel: 'Variante A',
    generationPrompt: 'prompt real',
    negativePrompt: 'negprompt real',
    sceneDescription: 'escena real',
    subjectDescription: 'sujeto real',
    productPlacement: { description: 'colocación real' },
    cameraDirection: 'dirección de cámara real',
    lightingDirection: 'luz real',
    screenText: ['texto en pantalla real'],
    voiceover: ['línea de voz real'],
    subtitleText: ['subtítulo real'],
    duration: '20-30s',
    caption: 'caption real',
    cta: 'cta real',
    whatsappCta: 'whatsapp cta real',
    riskyClaims: RISKY_CLAIMS,
    hasRealProductReference: true,
    ...overrides,
  });
}

describe('Directorio aislado de prueba', () => {
  test('VISUAL_PRODUCTION_PACKAGES_DIR apunta al directorio temporal', () => {
    assert.ok(VISUAL_PRODUCTION_PACKAGES_DIR.startsWith(TEST_DATA_ROOT));
  });
});

describe('Trazabilidad — Parte 4/5: relación rota se rechaza', () => {
  test('rechaza guardar un VisualProductionPackage cuyo productionArtifactId no está guardado', () => {
    const artifact = realArtifact(); // construido pero NUNCA guardado en el store
    const pkg = realPackage(artifact);
    assert.throws(() => saveVisualProductionPackage(pkg), /relación rota/);
  });
});

describe('Cadena real completa: ProductionArtifact -> Store -> VisualProductionPackage -> Store -> recuperación', () => {
  test('CREATE + GET reales de punta a punta, con integridad total de datos', () => {
    const artifact = realArtifact();
    saveProductionArtifact(artifact);

    const pkg = realPackage(artifact);
    const saveResult = saveVisualProductionPackage(pkg);
    assert.equal(saveResult.visualProductionPackageId, pkg.visualProductionPackageId);

    const recovered = getVisualProductionPackage(pkg.visualProductionPackageId);
    assert.deepEqual(recovered, pkg);
    // Trazabilidad real: la referencia al ProductionArtifact sobrevive intacta.
    assert.equal(recovered.productionArtifactId, artifact.productionArtifactId);
    assert.equal(recovered.creativeCellCandidateId, artifact.creativeCellCandidateId);
    assert.equal(recovered.voiceover.length, 1);
    assert.equal(recovered.productPlacement.assetStatus, 'PRODUCT_REFERENCE_AVAILABLE');
    assert.equal(recovered.status, 'DRAFT_FOR_REVIEW');

    // Proyección de trazabilidad inversa: ProductionArtifact -> sus VisualProductionPackage.
    const porArtifact = listVisualProductionPackagesByProductionArtifact(artifact.productionArtifactId);
    assert.equal(porArtifact.length, 1);
    assert.equal(porArtifact[0].visualProductionPackageId, pkg.visualProductionPackageId);
  });
});

describe('visualProductionPackageExists', () => {
  test('true tras guardar, false antes', () => {
    const artifact = realArtifact({ creativeCellCandidateId: 'CC-EXISTS-TEST', hypothesisRef: 'H-EXISTS-TEST' });
    saveProductionArtifact(artifact);
    const pkg = realPackage(artifact);
    assert.equal(visualProductionPackageExists(pkg.visualProductionPackageId), false);
    saveVisualProductionPackage(pkg);
    assert.equal(visualProductionPackageExists(pkg.visualProductionPackageId), true);
  });
});

describe('getVisualProductionPackage — objeto inexistente', () => {
  test('lanza si el id no existe, nunca inventa un paquete', () => {
    assert.throws(() => getVisualProductionPackage('id-que-no-existe'), /no existe ningún VisualProductionPackage/);
  });
});

describe('Idempotencia — Parte 7', () => {
  test('un segundo intento de guardar el mismo visualProductionPackageId lanza, nunca duplica', () => {
    const artifact = realArtifact({ creativeCellCandidateId: 'CC-IDEMP-TEST', hypothesisRef: 'H-IDEMP-TEST' });
    saveProductionArtifact(artifact);
    const pkg = realPackage(artifact);
    saveVisualProductionPackage(pkg);
    assert.throws(() => saveVisualProductionPackage(pkg), /ya existe un VisualProductionPackage guardado/);
    const files = fs.readdirSync(VISUAL_PRODUCTION_PACKAGES_DIR).filter((f) => f.includes(pkg.visualProductionPackageId));
    assert.equal(files.length, 1);
  });
});

describe('listVisualProductionPackages', () => {
  test('lista resúmenes reales de todos los paquetes guardados', () => {
    const artifact = realArtifact({ creativeCellCandidateId: 'CC-LIST-VPP', hypothesisRef: 'H-LIST-VPP' });
    saveProductionArtifact(artifact);
    const pkg = realPackage(artifact);
    saveVisualProductionPackage(pkg);
    const listado = listVisualProductionPackages();
    const entry = listado.find((p) => p.visualProductionPackageId === pkg.visualProductionPackageId);
    assert.ok(entry);
    assert.equal(entry.productionArtifactId, artifact.productionArtifactId);
    assert.equal(entry.assetType, 'VIDEO');
  });
});

describe('deleteVisualProductionPackage', () => {
  test('borra un paquete real ya guardado', () => {
    const artifact = realArtifact({ creativeCellCandidateId: 'CC-DEL-VPP', hypothesisRef: 'H-DEL-VPP' });
    saveProductionArtifact(artifact);
    const pkg = realPackage(artifact);
    saveVisualProductionPackage(pkg);
    assert.equal(deleteVisualProductionPackage(pkg.visualProductionPackageId), true);
    assert.equal(visualProductionPackageExists(pkg.visualProductionPackageId), false);
  });

  test('lanza si intenta borrar un id que no existe', () => {
    assert.throws(() => deleteVisualProductionPackage('id-que-no-existe'), /nada que borrar/);
  });
});
