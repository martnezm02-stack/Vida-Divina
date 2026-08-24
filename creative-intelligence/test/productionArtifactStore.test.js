// productionArtifactStore.test.js — 100% local, directorio temporal
// aislado (mismo patrón que cycleStore.test.js), nunca escribe en
// creative-intelligence/data/ real.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-productionartifactstore-test-'));
process.env.CREATIVE_INTELLIGENCE_DATA_ROOT = TEST_DATA_ROOT;

const {
  saveProductionArtifact, getProductionArtifact, productionArtifactExists,
  listProductionArtifacts, deleteProductionArtifact, PRODUCTION_ARTIFACTS_DIR,
} = await import('../production/productionArtifactStore.js');
const { createProductionArtifact, BASELINE_NOT_ESTABLISHED } = await import('../production/creativeProductionArtifact.js');

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
});

const RISKY_CLAIMS = ['tadalafil/pastilla azul', 'aumenta testosterona de forma natural'];

function realArtifact(overrides = {}) {
  return createProductionArtifact({
    creativeCellCandidateId: 'CC-STORE-TEST',
    concept: 'Concepto de prueba real del store',
    commercialObjective: 'WHATSAPP_CONVERSATION',
    audienceState: 'personas con estreñimiento crónico, texto libre',
    coreAngle: 'ángulo de prueba',
    hook: { type: 'QUESTION', text: '¿Alguna vez te preguntaste si eso es normal?', mechanism: 'validación', inspiredByPattern: 'AFFILIATE Pattern QUESTION', hypothesisNote: 'no probado' },
    format: 'REEL',
    script: { durationRangeSeconds: '20-30s', beats: [{ beat: 'HOOK', content: 'pregunta directa' }, { beat: 'CTA', content: 'WhatsApp' }] },
    postCopy: 'Copy real de prueba. Escríbenos por WhatsApp.',
    cta: { primary: 'Escríbenos por WhatsApp', whatsapp: '¿Quieres conocer más? Escríbenos por WhatsApp.' },
    visualDirection: { setting: 'home', visualMechanism: 'zoom lento', props: [] },
    screenText: ['Hook real', 'Escríbenos por WhatsApp'],
    staticVersion: { applicable: false, description: 'no aplica' },
    videoVersion: { applicable: true, description: 'script arriba' },
    whatsappVersion: 'Cuéntame qué buscas mejorar.',
    variants: [
      { label: 'Variante A', changedVariable: 'HOOK', description: 'cambia el hook' },
      { label: 'Variante B', changedVariable: 'CTA', description: 'cambia el CTA' },
    ],
    complianceNotes: { riskLevel: 'LOW', riskReason: 'sin riesgo detectado' },
    riskyClaims: RISKY_CLAIMS,
    evidenceBasis: ['NONE_OBSERVED_EXPLORATORY'],
    productFactsUsed: [{ fact: 'tránsito intestinal lento', source: 'docs/productos/01-control-de-peso/tedivina.md' }],
    productFactsRequired: [],
    hypothesisRef: 'H-STORE-TEST',
    primaryMetric: 'whatsapp_conversations',
    discardCriteria: { metric: 'whatsapp_conversations', threshold: BASELINE_NOT_ESTABLISHED, description: 'sin baseline' },
    customerEvidenceRequired: false,
    ...overrides,
  });
}

describe('Directorio aislado de prueba', () => {
  test('PRODUCTION_ARTIFACTS_DIR apunta al directorio temporal, no a creative-intelligence/data/ real', () => {
    assert.ok(PRODUCTION_ARTIFACTS_DIR.startsWith(TEST_DATA_ROOT));
  });
});

describe('saveProductionArtifact / getProductionArtifact — CREATE + GET reales', () => {
  test('guarda un ProductionArtifact real y lo recupera con integridad total de datos', () => {
    const artifact = realArtifact();
    const result = saveProductionArtifact(artifact);
    assert.equal(result.productionArtifactId, artifact.productionArtifactId);
    assert.ok(fs.existsSync(result.path));

    const recovered = getProductionArtifact(artifact.productionArtifactId);
    assert.deepEqual(recovered, artifact);
    // Trazabilidad explícita (Parte 4): hypothesisRef y creativeCellCandidateId sobreviven intactos.
    assert.equal(recovered.hypothesisRef, 'H-STORE-TEST');
    assert.equal(recovered.creativeCellCandidateId, 'CC-STORE-TEST');
    assert.equal(recovered.variants.length, 2);
    assert.equal(recovered.status, 'DRAFT_FOR_REVIEW');
  });

  test('usa exactamente el productionArtifactId ya generado por createProductionArtifact() — nunca genera uno nuevo', () => {
    const artifact = realArtifact();
    const result = saveProductionArtifact(artifact);
    assert.match(result.productionArtifactId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.equal(result.productionArtifactId, artifact.productionArtifactId);
  });

  test('rechaza un objeto sin la forma real de un ProductionArtifact (sin productionArtifactId)', () => {
    assert.throws(() => saveProductionArtifact({ status: 'DRAFT_FOR_REVIEW' }), /productionArtifactId.*obligatorio/);
  });

  test('rechaza un status que no sea DRAFT_FOR_REVIEW (nunca vino de createProductionArtifact real)', () => {
    const artifact = realArtifact();
    assert.throws(() => saveProductionArtifact({ ...artifact, status: 'APPROVED' }), /status.*inesperado/);
  });
});

describe('productionArtifactExists', () => {
  test('true para un artifact real ya guardado, false para uno que no existe', () => {
    const artifact = realArtifact();
    assert.equal(productionArtifactExists(artifact.productionArtifactId), false);
    saveProductionArtifact(artifact);
    assert.equal(productionArtifactExists(artifact.productionArtifactId), true);
  });
});

describe('getProductionArtifact — objeto inexistente', () => {
  test('lanza si el id no existe, nunca inventa un artifact', () => {
    assert.throws(() => getProductionArtifact('id-que-no-existe'), /no existe ningún ProductionArtifact/);
  });
});

describe('Idempotencia — Parte 7', () => {
  test('un segundo intento de guardar el mismo productionArtifactId lanza, nunca crea un segundo registro ni sobrescribe', () => {
    const artifact = realArtifact();
    saveProductionArtifact(artifact);
    assert.throws(() => saveProductionArtifact(artifact), /ya existe un ProductionArtifact guardado/);
    // Confirma que sigue habiendo exactamente 1 archivo para ese id.
    const files = fs.readdirSync(PRODUCTION_ARTIFACTS_DIR).filter((f) => f.includes(artifact.productionArtifactId));
    assert.equal(files.length, 1);
  });
});

describe('listProductionArtifacts', () => {
  test('lista resúmenes reales de todos los artifacts guardados, ordenados por createdAt', () => {
    const a1 = realArtifact({ creativeCellCandidateId: 'CC-LIST-1', hypothesisRef: 'H-LIST-1' });
    const a2 = realArtifact({ creativeCellCandidateId: 'CC-LIST-2', hypothesisRef: 'H-LIST-2' });
    saveProductionArtifact(a1);
    saveProductionArtifact(a2);
    const listado = listProductionArtifacts();
    const ids = listado.map((s) => s.productionArtifactId);
    assert.ok(ids.includes(a1.productionArtifactId));
    assert.ok(ids.includes(a2.productionArtifactId));
    const entry = listado.find((s) => s.productionArtifactId === a1.productionArtifactId);
    assert.equal(entry.creativeCellCandidateId, 'CC-LIST-1');
    assert.equal(entry.hypothesisRef, 'H-LIST-1');
  });
});

describe('deleteProductionArtifact', () => {
  test('borra un artifact real ya guardado', () => {
    const artifact = realArtifact();
    saveProductionArtifact(artifact);
    assert.equal(deleteProductionArtifact(artifact.productionArtifactId), true);
    assert.equal(productionArtifactExists(artifact.productionArtifactId), false);
  });

  test('lanza si intenta borrar un id que no existe', () => {
    assert.throws(() => deleteProductionArtifact('id-que-no-existe'), /nada que borrar/);
  });
});
