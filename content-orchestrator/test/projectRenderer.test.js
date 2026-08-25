// projectRenderer.test.js — Editable Video Project (2026-08-24). Render
// REAL (Chrome headless + ffmpeg, sin mocks) -- lento por diseño, mismo
// criterio que creativeProductionOrchestrator.test.js. Produce un
// ProductionJob real corto, lo envuelve, edita el estilo de UNA escena +
// la música del proyecto, renderiza v2, y verifica que las escenas NO
// afectadas se REUTILIZARON (mismo archivo real, sin volver a invocar
// Chrome) mientras la afectada sí se re-renderizó.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, writeFileSync, mkdtempSync, rmSync, statSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { produceCreative } from '../src/creativeProductionOrchestrator.js';
import { buildEditableProjectFromProductionJob, getLatestVersion } from '../src/editableVideoProject.js';
import { applyProjectEdit } from '../src/projectEditor.js';
import { renderProjectVersion } from '../src/projectRenderer.js';
import { validarMp4ConFfprobe } from '../../video-production/src/hyperframesRenderer.js';

const FFMPEG_BIN_DIR = 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';
const TEST_TMP_DIR = mkdtempSync(join(tmpdir(), 'project-renderer-test-'));

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

describe('EditableVideoProject — edición y render real de una versión nueva (v2) sin regenerar lo que no cambió', () => {
  test('reutiliza escenas no afectadas, re-renderiza solo la editada, agrega música real', async () => {
    const projectDir = join(TEST_TMP_DIR, 'job-1');
    const audioPath = join(TEST_TMP_DIR, 'voice-1.wav');
    writeFileSync(audioPath, crearWavSilencioBuffer(6));

    const job = await produceCreative({
      creativeVariant: CREATIVE_VARIANT_REAL, campaignIntent: CAMPAIGN_INTENT_REAL, productRawAssets: [],
      audioSourcePath: audioPath, audioDurationSeconds: 6,
      outputProfileNames: ['INSTAGRAM_REEL'],
      projectDir, ffmpegBinDir: FFMPEG_BIN_DIR,
      campaignId: 'sculpt-black-test', batchId: 'batch-1', generationId: 'gen-1', creativeId: 'creative-1',
    });
    assert.ok(['FULL_PRODUCTION', 'DEGRADED_PRODUCTION'].includes(job.status), `status inesperado: ${job.status} / error: ${job.error}`);
    assert.equal(job.scenePlan.scenes.length, 4);

    // 1. Envuelve el ProductionJob real recién producido en un proyecto editable.
    const jobRecord = { productionJobId: 'job-1', projectDir, job, createdAt: new Date().toISOString() };
    const project = buildEditableProjectFromProductionJob({ jobRecord });
    const v1 = getLatestVersion(project);
    const primeraEscenaId = project.scenes[0].sceneId;
    const otrasEscenasIds = project.scenes.slice(1).map((s) => s.sceneId);

    // 2. Edita el captionStyle de SOLO la primera escena + agrega música real (biblioteca sintetizada de esta fase).
    const edited = applyProjectEdit(project, {
      scenes: { [primeraEscenaId]: { captionStyleOverride: { fontSizePx: 60, textColor: '#ffcc00' } } },
      musicTrack: { trackFilename: 'ambient-calm-01.wav', volume: 0.15, startSeconds: 0, fadeInSeconds: 0.5, fadeOutSeconds: 0.5 },
    });

    // 3. Render real de la versión 2.
    const v2 = await renderProjectVersion(edited, { ffmpegBinDir: FFMPEG_BIN_DIR, mode: 'RENDER' });
    assert.ok(['FULL_PRODUCTION', 'DEGRADED_PRODUCTION'].includes(v2.status), `v2 status inesperado: ${v2.status} / error: ${v2.error}`);
    assert.equal(v2.versionNumber, 2);

    // 4. La escena editada SÍ se re-renderizó (ruta real distinta); las demás se REUTILIZARON (ruta real idéntica a v1 -- prueba de que no se volvió a invocar Chrome para ellas).
    assert.deepEqual([...v2.changeset.rerenderedSceneIds], [primeraEscenaId]);
    assert.notEqual(v2.sceneClipPaths[primeraEscenaId], v1.sceneClipPaths[primeraEscenaId]);
    for (const sceneId of otrasEscenasIds) {
      assert.equal(v2.sceneClipPaths[sceneId], v1.sceneClipPaths[sceneId], `la escena "${sceneId}" debía reutilizarse (mismo archivo real), no re-renderizarse.`);
    }

    // 5. Costo real: cero -- ningún cambio de esta versión requirió IA (solo estilo local + música local).
    assert.equal(v2.costReport.estimatedTotal, 0);

    // 6. El master real de v2 SÍ incluye música (v1 no tenía ninguna pista real disponible en su momento).
    assert.ok(v2.masterPath.includes('master.mp4') || existsSync(v2.masterPath));
    const probeV2 = validarMp4ConFfprobe(v2.outputs[0].outputPath, { ffprobeBin: join(FFMPEG_BIN_DIR, 'ffprobe.exe') });
    assert.ok(probeV2.ok);
    assert.ok(probeV2.hasVideo);
    assert.ok(probeV2.hasAudio);
    assert.equal(v2.qualityReports[0].checks.musicIncluded, true);

    // 7. Preview: mismo mecanismo, pero NO consume un número de versión real ni se agrega a versions[].
    const preview = await renderProjectVersion(edited, { ffmpegBinDir: FFMPEG_BIN_DIR, mode: 'PREVIEW' });
    assert.equal(preview.mode, 'PREVIEW');
    assert.equal(preview.outputs.length, 1); // preview real: solo 1 formato (rápido), nunca todos los formatos pedidos.
  });
});
