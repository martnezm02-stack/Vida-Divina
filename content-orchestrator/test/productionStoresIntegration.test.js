// productionStoresIntegration.test.js — Parte 8/11: confirma que
// Content Orchestrator queda conectado a los stores nuevos
// (productionArtifactStore.js / visualProductionPackageStore.js), sin que
// eso cambie el comportamiento estratégico ni genere copy nuevo. Usa un
// directorio temporal aislado (CREATIVE_INTELLIGENCE_DATA_ROOT), nunca
// escribe en creative-intelligence/data/ real.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'co-prodstores-test-'));
process.env.CREATIVE_INTELLIGENCE_DATA_ROOT = TEST_DATA_ROOT;

const { persistProductionAssets, renderAndPostProduce } = await import('../src/contentOrchestrator.js');
const { getProductionArtifact, productionArtifactExists } = await import('../../creative-intelligence/production/productionArtifactStore.js');
const { getVisualProductionPackage, visualProductionPackageExists } = await import('../../creative-intelligence/production/visualProductionPackageStore.js');
const { createProductionArtifact, BASELINE_NOT_ESTABLISHED } = await import('../../creative-intelligence/production/creativeProductionArtifact.js');
const { createVisualProductionPackage } = await import('../../creative-intelligence/production/visualProductionPackage.js');

const FFMPEG_BIN_DIR = 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
});

function crearWavSilencioBuffer(duracionSegundos, sampleRate = 24000) {
  const numSamples = Math.round(duracionSegundos * sampleRate);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

function realArtifact(overrides = {}) {
  return createProductionArtifact({
    creativeCellCandidateId: 'CC-CO-INTEGRATION',
    concept: 'Concepto real de integración',
    commercialObjective: 'WHATSAPP_CONVERSATION',
    audienceState: 'personas con estreñimiento crónico',
    coreAngle: 'ángulo real',
    hook: { type: 'QUESTION', text: 'Hook real de integración', mechanism: 'validación', inspiredByPattern: 'patrón', hypothesisNote: 'nota' },
    format: 'REEL',
    postCopy: 'Copy real. Escríbenos por WhatsApp.',
    cta: { primary: 'Escríbenos por WhatsApp', whatsapp: 'CTA whatsapp real' },
    visualDirection: { setting: 'home', visualMechanism: 'zoom', props: [] },
    screenText: ['Hook real de integración'],
    staticVersion: { applicable: false, description: 'no aplica' },
    videoVersion: { applicable: true, description: 'aplica' },
    whatsappVersion: 'Versión whatsapp real.',
    variants: [
      { label: 'Variante A', changedVariable: 'HOOK', description: 'variante A real' },
      { label: 'Variante B', changedVariable: 'CTA', description: 'variante B real' },
    ],
    complianceNotes: { riskLevel: 'LOW', riskReason: 'sin riesgo' },
    riskyClaims: [],
    evidenceBasis: ['NONE_OBSERVED_EXPLORATORY'],
    hypothesisRef: 'H-CO-INTEGRATION',
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
    generationPrompt: 'prompt real', negativePrompt: 'negprompt real',
    sceneDescription: 'escena real', subjectDescription: 'sujeto real',
    productPlacement: { description: 'colocación real' },
    cameraDirection: 'dirección real', lightingDirection: 'luz real',
    screenText: ['Hook real de integración'],
    voiceover: ['Hook real de integración.', 'CTA real de integración.'],
    subtitleText: ['Hook real de integración.', 'CTA real de integración.'],
    duration: '3s', caption: 'caption real', cta: 'CTA real de integración.', whatsappCta: 'WhatsApp',
    riskyClaims: [], hasRealProductReference: false,
    ...overrides,
  });
}

describe('persistProductionAssets', () => {
  test('persiste ProductionArtifact + VisualProductionPackage reales y quedan recuperables', () => {
    const artifact = realArtifact();
    const pkg = realPackage(artifact);
    const result = persistProductionAssets({ productionArtifact: artifact, visualProductionPackage: pkg });

    assert.equal(result.productionArtifact.productionArtifactId, artifact.productionArtifactId);
    assert.equal(result.visualProductionPackage.visualProductionPackageId, pkg.visualProductionPackageId);
    assert.equal(productionArtifactExists(artifact.productionArtifactId), true);
    assert.equal(visualProductionPackageExists(pkg.visualProductionPackageId), true);
    assert.deepEqual(getProductionArtifact(artifact.productionArtifactId), artifact);
    assert.deepEqual(getVisualProductionPackage(pkg.visualProductionPackageId), pkg);
  });

  test('idempotente: una segunda llamada con el mismo objeto real reporta alreadyExisted, no lanza', () => {
    const artifact = realArtifact({ creativeCellCandidateId: 'CC-IDEMP-CO', hypothesisRef: 'H-IDEMP-CO' });
    persistProductionAssets({ productionArtifact: artifact });
    const second = persistProductionAssets({ productionArtifact: artifact });
    assert.equal(second.productionArtifact.alreadyExisted, true);
  });

  test('sin argumentos devuelve un objeto vacío, no falla', () => {
    assert.deepEqual(persistProductionAssets({}), {});
  });
});

describe('renderAndPostProduce — integrado con los stores reales (Parte 8)', () => {
  test('cuando se provee productionArtifact/visualProductionPackage reales, se persisten y sus ids reales viajan al render', async (t) => {
    let tmpAudio, projectDir;
    try {
      tmpAudio = join(mkdtempSync(join(tmpdir(), 'co-prodstores-audio-')), 'voz.wav');
      writeFileSync(tmpAudio, crearWavSilencioBuffer(3.0, 24000));
      projectDir = join(tmpdir(), `co-prodstores-render-${Date.now()}`);

      const artifact = realArtifact({ creativeCellCandidateId: 'CC-RENDER-INTEGRATION', hypothesisRef: 'H-RENDER-INTEGRATION' });
      const pkg = realPackage(artifact);

      const resultado = renderAndPostProduce({
        contentRequestId: 'cr-prodstores-1',
        renderArgs: {
          hookText: 'Hook real de integración', productTitle: 'Producto de prueba', productBody: 'Cuerpo de prueba',
          ctaText: 'CTA real de integración.', whatsappLabel: 'WhatsApp', voiceoverLines: ['Hook real de integración.', 'CTA real de integración.'],
        },
        audioSourcePath: tmpAudio, audioDurationSeconds: 3.0,
        productId: 'te-divina',
        productionArtifact: artifact,
        visualProductionPackage: pkg,
        outputProfileNames: ['GENERIC_VERTICAL'],
        projectDir, ffmpegBinDir: FFMPEG_BIN_DIR,
      });

      assert.equal(resultado.status, 'COMPLETADO');
      assert.equal(resultado.persistedAssets.productionArtifact.productionArtifactId, artifact.productionArtifactId);
      assert.equal(resultado.persistedAssets.visualProductionPackage.visualProductionPackageId, pkg.visualProductionPackageId);
      assert.equal(resultado.masterResult.productionArtifactId, artifact.productionArtifactId);
      assert.equal(resultado.masterResult.visualProductionPackageId, pkg.visualProductionPackageId);

      // Recuperación real desde el store, no desde la variable en memoria.
      const recoveredArtifact = getProductionArtifact(artifact.productionArtifactId);
      const recoveredPkg = getVisualProductionPackage(pkg.visualProductionPackageId);
      assert.deepEqual(recoveredArtifact, artifact);
      assert.deepEqual(recoveredPkg, pkg);

      rmSync(resultado.outputs[0].outputPath, { force: true });
    } finally {
      if (projectDir) { rmSync(projectDir, { recursive: true, force: true }); rmSync(`${projectDir}.mp4`, { force: true }); }
    }
  });
});
