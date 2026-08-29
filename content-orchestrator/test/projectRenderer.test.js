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
import { applyProjectEdit, applyVoiceRegeneration } from '../src/projectEditor.js';
import {
  renderProjectVersion, normalizeVoiceLoudnessReal, reconcileVoiceTimingReal, VOICE_NORMALIZATION,
  VOICE_TIMING_TOLERANCE_RATIO, SAFE_TEMPO_CORRECTION_RATIO,
} from '../src/projectRenderer.js';
import { validarMp4ConFfprobe } from '../../video-production/src/hyperframesRenderer.js';
import { leerInfoWav } from '../../tts-text-preprocessor/src/audioAssetAdapter.js';

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

    // 8. FINAL VIDEO AUDIO GATE (Corrección "Consistencia de audio...",
    // 2026-08-29, Paso 8 del encargo): v2 real trae audioGate real,
    // ninguna escena real con voiceTimingMismatch (ninguna se regeneró
    // en este test), audio tracks reales presentes.
    assert.ok(v2.audioGate, 'v2 real trae audioGate real');
    assert.equal(v2.audioGate.audioTracksExist, true);
    assert.equal(v2.audioGate.noSevereDurationMismatch, true);
    assert.deepEqual([...v2.audioGate.scenesWithTimingMismatch], []);
  });
});

// AUDIO NORMALIZATION / PROSODY (Corrección "Consistencia de audio y
// persistencia de ediciones de captions", 2026-08-29, Paso 3/5/6 del
// encargo): funciones reales puras sobre WAV reales aislados -- sin
// necesidad de un render real completo (Chrome+ffmpeg de video), mucho
// más rápido real que el test de arriba.
describe('normalizeVoiceLoudnessReal / reconcileVoiceTimingReal — consistencia real de audio (Paso 3/5/6 del encargo)', () => {
  test('normalizeVoiceLoudnessReal produce un WAV real válido (mismo target real de VOICE_NORMALIZATION)', () => {
    const src = join(TEST_TMP_DIR, 'norm-src.wav');
    writeFileSync(src, crearWavSilencioBuffer(3));
    const out = join(TEST_TMP_DIR, 'norm-out.wav');
    normalizeVoiceLoudnessReal(src, out, FFMPEG_BIN_DIR);
    assert.ok(existsSync(out));
    const info = leerInfoWav(out);
    assert.ok(info.duracionSegundos > 0);
  });

  test('reconcileVoiceTimingReal: desviación real DENTRO de tolerancia (< 10%) -> sin corrección real, mismo audioPath', () => {
    const target = 5;
    const measured = target * (1 + VOICE_TIMING_TOLERANCE_RATIO * 0.5); // 5% real, dentro de tolerancia real.
    const src = join(TEST_TMP_DIR, 'timing-ok-src.wav');
    writeFileSync(src, crearWavSilencioBuffer(measured));
    const r = reconcileVoiceTimingReal({
      sourcePath: src, targetDurationSeconds: target, measuredDurationSeconds: measured,
      workDir: join(TEST_TMP_DIR, 'timing-ok-work'), ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    assert.equal(r.audioPath, src, 'sin desviación real significativa, nunca se toca el audio real (Paso 4: "no cambiar el contenido del voiceover")');
    assert.equal(r.voiceTimingMismatch, false);
  });

  test('reconcileVoiceTimingReal: desviación real MODERADA (dentro de la banda segura de corrección) -> corrige real, mismatch resuelto', () => {
    const target = 5;
    const measured = target * (1 + SAFE_TEMPO_CORRECTION_RATIO * 0.8); // ~12% real -- fuera de tolerancia (10%), dentro de la banda segura (15%).
    const src = join(TEST_TMP_DIR, 'timing-moderate-src.wav');
    writeFileSync(src, crearWavSilencioBuffer(measured));
    const r = reconcileVoiceTimingReal({
      sourcePath: src, targetDurationSeconds: target, measuredDurationSeconds: measured,
      workDir: join(TEST_TMP_DIR, 'timing-moderate-work'), ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    assert.notEqual(r.audioPath, src, 'una desviación real fuera de tolerancia SÍ dispara una corrección real de tempo');
    assert.ok(existsSync(r.audioPath));
    assert.ok(Math.abs(r.actualDurationSeconds - target) < Math.abs(measured - target), 'la duración real corregida debe acercarse real al target, nunca alejarse');
    assert.equal(r.voiceTimingMismatch, false, 'una desviación real dentro de la banda segura se resuelve por completo');
  });

  test('reconcileVoiceTimingReal: desviación real EXTREMA (fuera de la banda segura) -> corrige SOLO hasta el límite seguro real, nunca time-stretch extremo, mismatch permanece true', () => {
    const target = 5;
    const measured = target * 1.6; // 60% real -- muy por encima de la banda segura real (15%).
    const src = join(TEST_TMP_DIR, 'timing-extreme-src.wav');
    writeFileSync(src, crearWavSilencioBuffer(measured));
    const r = reconcileVoiceTimingReal({
      sourcePath: src, targetDurationSeconds: target, measuredDurationSeconds: measured,
      workDir: join(TEST_TMP_DIR, 'timing-extreme-work'), ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    assert.notEqual(r.audioPath, src);
    // La corrección real nunca excede la banda segura -- el tempo real
    // aplicado está acotado a [1-SAFE_TEMPO_CORRECTION_RATIO, 1+SAFE_TEMPO_CORRECTION_RATIO],
    // así que la duración real corregida se acerca al target pero NUNCA
    // lo alcanza del todo en un caso real tan extremo.
    assert.ok(r.actualDurationSeconds > target, 'la corrección real acotada mejora pero no elimina la desviación real extrema');
    assert.equal(r.voiceTimingMismatch, true, 'una desviación real que la banda segura no puede resolver del todo queda marcada real (Paso 6), nunca oculta');
  });
});

// VOICE REGENERATION METADATA (Paso 2/6/7 del encargo): applyVoiceRegeneration()
// persiste targetDurationMs/actualDurationMs/voiceTimingMismatch/voiceParams
// reales -- lineage completo, nunca descartado.
describe('applyVoiceRegeneration — lineage real de timing/params (Paso 2/6/7 del encargo)', () => {
  test('persiste targetDurationMs/actualDurationMs/voiceTimingMismatch/voiceParams reales en voiceTrack', () => {
    const projectDir = join(TEST_TMP_DIR, 'lineage-project');
    const audioPath = join(TEST_TMP_DIR, 'lineage-voice.wav');
    writeFileSync(audioPath, crearWavSilencioBuffer(4));
    const jobRecord = {
      productionJobId: 'job-lineage',
      projectDir,
      job: {
        status: 'FULL_PRODUCTION', campaignId: 'c', batchId: 'b', generationId: 'g', creativeId: 'cr',
        scenePlan: { scenes: [{ sceneId: 'scene-1', startSeconds: 0, duration: 4, narration: 'Narración real.', visualIntent: 'CONCEPT_OPENING', visualType: 'TYPOGRAPHIC', visualPrompt: 'p', textOverlay: null }] },
        assetPlan: [{ source: 'TYPOGRAPHIC_FALLBACK', imageSourcePath: null }],
        musicSelection: { status: 'NO_TRACK_AVAILABLE' },
        outputs: [{ profileName: 'INSTAGRAM_REEL' }],
        masterPath: null, qualityReports: [], costReport: null,
      },
      createdAt: new Date().toISOString(),
    };
    const project = buildEditableProjectFromProductionJob({ jobRecord });
    const updated = applyVoiceRegeneration(project, 'scene-1', {
      audioSourcePath: audioPath, audioDurationSeconds: 4.4,
      targetDurationMs: 4000, actualDurationMs: 4400, voiceTimingMismatch: false,
      voiceParams: { voiceProfileId: 'manuel_es_mx', language: 'es', exaggeration: 0.5, cfgWeight: 0.5, temperature: 0.8 },
    });
    const scene = updated.scenes.find((s) => s.sceneId === 'scene-1');
    assert.equal(scene.voiceTrack.targetDurationMs, 4000);
    assert.equal(scene.voiceTrack.actualDurationMs, 4400);
    assert.equal(scene.voiceTrack.voiceTimingMismatch, false);
    assert.deepEqual(scene.voiceTrack.voiceParams, { voiceProfileId: 'manuel_es_mx', language: 'es', exaggeration: 0.5, cfgWeight: 0.5, temperature: 0.8 });
  });

  test('backward compatibility real: sin estos campos nuevos, applyVoiceRegeneration sigue funcionando (defaults reales null/false)', () => {
    const projectDir = join(TEST_TMP_DIR, 'lineage-project-2');
    const audioPath = join(TEST_TMP_DIR, 'lineage-voice-2.wav');
    writeFileSync(audioPath, crearWavSilencioBuffer(3));
    const jobRecord = {
      productionJobId: 'job-lineage-2',
      projectDir,
      job: {
        status: 'FULL_PRODUCTION', campaignId: 'c', batchId: 'b', generationId: 'g', creativeId: 'cr',
        scenePlan: { scenes: [{ sceneId: 'scene-1', startSeconds: 0, duration: 3, narration: 'Narración real.', visualIntent: 'CONCEPT_OPENING', visualType: 'TYPOGRAPHIC', visualPrompt: 'p', textOverlay: null }] },
        assetPlan: [{ source: 'TYPOGRAPHIC_FALLBACK', imageSourcePath: null }],
        musicSelection: { status: 'NO_TRACK_AVAILABLE' },
        outputs: [{ profileName: 'INSTAGRAM_REEL' }],
        masterPath: null, qualityReports: [], costReport: null,
      },
      createdAt: new Date().toISOString(),
    };
    const project = buildEditableProjectFromProductionJob({ jobRecord });
    const updated = applyVoiceRegeneration(project, 'scene-1', { audioSourcePath: audioPath, audioDurationSeconds: 3 });
    const scene = updated.scenes.find((s) => s.sceneId === 'scene-1');
    assert.equal(scene.voiceTrack.targetDurationMs, null);
    assert.equal(scene.voiceTrack.voiceTimingMismatch, false);
    assert.equal(scene.voiceTrack.voiceParams, null);
  });
});
