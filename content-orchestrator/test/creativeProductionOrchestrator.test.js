// creativeProductionOrchestrator.test.js — Creative Production
// Orchestrator (2026-08-24). Render real (Chrome headless + ffmpeg, sin
// mocks) -- lento por diseño (mismo criterio que
// hyperframesRenderer.test.js/postProduction.test.js). Usa un guion
// corto real (pocas palabras por sección) para mantener el tiempo de test
// razonable sin dejar de ser un render 100% real.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { produceCreative } from '../src/creativeProductionOrchestrator.js';

const FFMPEG_BIN_DIR = 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';
const TEST_TMP_DIR = mkdtempSync(join(tmpdir(), 'co-orchestrator-test-'));

function crearWavSilencioBuffer(duracionSegundos, sampleRate = 24000) {
  const numSamples = Math.round(duracionSegundos * sampleRate);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

after(() => rmSync(TEST_TMP_DIR, { recursive: true, force: true }));

const CREATIVE_VARIANT_REAL = Object.freeze({
  conceptId: 'problem_agitation', angleId: 'problem_agitation', hookId: 'question',
  copy: Object.freeze({
    hook: '¿vitalidad?', bodyLines: Object.freeze(['Baja vitalidad real.', 'Reishi real.']),
    sectionsUsed: Object.freeze([{ section: 'problem', sourceField: 'problema' }, { section: 'mechanism', sourceField: 'ingredientes' }]),
    cta: 'Escríbenos.',
  }),
  creativeVariant: Object.freeze({ format: 'Native TikTok-style' }),
  copyStyle: 'UGC_CONVERSATIONAL',
});
const CAMPAIGN_INTENT_REAL = Object.freeze({ targetAudience: 'hombres adultos', problemOrNeed: 'baja vitalidad real', campaignTerritory: 'vitalidad masculina' });

describe('produceCreative — pipeline real completo (sin mocks)', () => {
  test('produce un ProductionJob real: N escenas, master concatenado, 2 formatos, QA', async () => {
    const projectDir = join(TEST_TMP_DIR, 'job-1');
    const audioPath = join(TEST_TMP_DIR, 'voice-1.wav');
    writeFileSync(audioPath, crearWavSilencioBuffer(6));

    const job = await produceCreative({
      creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: CAMPAIGN_INTENT_REAL, productRawAssets: [],
      audioSourcePath: audioPath, audioDurationSeconds: 6,
      outputProfileNames: ['INSTAGRAM_REEL', 'INSTAGRAM_FEED'],
      projectDir, ffmpegBinDir: FFMPEG_BIN_DIR,
      campaignId: 'sculpt-black-test', batchId: 'batch-1', generationId: 'gen-1', creativeId: 'creative-1',
    });

    assert.ok(['FULL_PRODUCTION', 'DEGRADED_PRODUCTION'].includes(job.status), `status inesperado: ${job.status} / error: ${job.error}`);
    assert.equal(job.scenePlan.scenes.length, 4); // hook + problem + mechanism + cta
    assert.ok(!job.scenePlan.allScenesShowProduct); // sin productRawAssets -- ninguna PRODUCT_ASSET, pero eso no es "todas muestran producto" (ninguna lo hace).
    assert.equal(job.outputs.length, 2);
    for (const out of job.outputs) {
      assert.equal(out.status, 'COMPLETADO');
      assert.ok(existsSync(out.outputPath));
      assert.ok(out.fileSizeBytes > 0);
    }
    assert.equal(job.qualityReports.length, 2);
    assert.equal(job.campaignId, 'sculpt-black-test');
    assert.equal(job.creativeId, 'creative-1');
    assert.equal(job.conceptId, 'problem_agitation');
  });

  test('rechaza sin audioSourcePath real', async () => {
    await assert.rejects(() => produceCreative({
      creativeVariant: CREATIVE_VARIANT_REAL, audioSourcePath: 'C:/no/existe.wav', audioDurationSeconds: 5,
      outputProfileNames: ['INSTAGRAM_REEL'], projectDir: join(TEST_TMP_DIR, 'job-invalid'),
    }), /audioSourcePath/);
  });
});
