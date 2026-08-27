// referenceVideoAnalyzer.test.js — Adaptar contenido / Video de referencia
// (2026-08-26). Análisis real vía ffprobe/ffmpeg (mismo binario ya usado en
// todo el proyecto) sobre fixtures reales generadas con `lavfi` (mismo
// criterio que postProduction.test.js -- nunca un MP4 binario en el repo).
// Todo el I/O vive bajo os.tmpdir() (mismo motivo documentado en
// postProduction.test.js: archivos reales dentro de la carpeta del
// proyecto pueden desaparecer por sincronización de OneDrive).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, mkdtempSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ingestReferenceVideo, analyzeReferenceVideo, hashReferenceFile,
} from '../src/referenceVideoAnalyzer.js';

const FFMPEG_BIN_DIR = 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';
const ffmpegBin = join(FFMPEG_BIN_DIR, 'ffmpeg.exe');

const TEST_TMP_DIR = mkdtempSync(join(tmpdir(), 'co-refvideo-test-'));
const REFERENCE_DIR = join(TEST_TMP_DIR, 'reference-analysis');
const SINGLE_SCENE_MP4 = join(TEST_TMP_DIR, 'single-scene.mp4');
const TWO_SCENE_MP4 = join(TEST_TMP_DIR, 'two-scene.mp4');
const SINGLE_SCENE_DURATION_S = 6;

/** Video real de un solo color (sin cortes de escena reales) -- duración/aspect ratio conocidos de antemano para verificar la extracción real. */
function generarFixtureUnaEscena() {
  const r = spawnSync(ffmpegBin, [
    '-y', '-f', 'lavfi', '-i', `color=c=0x29361C:s=640x360:d=${SINGLE_SCENE_DURATION_S}:r=30`,
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${SINGLE_SCENE_DURATION_S}:sample_rate=48000`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
    SINGLE_SCENE_MP4,
  ], { encoding: 'utf8', shell: false });
  if (r.status !== 0) throw new Error(`No se pudo generar la fixture real de 1 escena: ${r.stderr}`);
}

/** Video real con un corte de escena real y visible (rojo -> azul en el segundo 3) -- prueba real de detección de escenas, nunca simulada. */
function generarFixtureDosEscenas() {
  const r = spawnSync(ffmpegBin, [
    '-y',
    '-f', 'lavfi', '-i', 'color=c=red:s=640x360:d=3:r=30',
    '-f', 'lavfi', '-i', 'color=c=blue:s=640x360:d=3:r=30',
    '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]',
    '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    TWO_SCENE_MP4,
  ], { encoding: 'utf8', shell: false });
  if (r.status !== 0) throw new Error(`No se pudo generar la fixture real de 2 escenas: ${r.stderr}`);
}

before(() => {
  generarFixtureUnaEscena();
  generarFixtureDosEscenas();
});
after(() => { rmSync(TEST_TMP_DIR, { recursive: true, force: true }); });

describe('ingestReferenceVideo — copia real, content-addressed', () => {
  test('copia el archivo real a una carpeta contenida, direccionada por el hash real del contenido', () => {
    const ingested = ingestReferenceVideo(SINGLE_SCENE_MP4, { referenceDir: REFERENCE_DIR });
    assert.equal(ingested.referenceId, hashReferenceFile(SINGLE_SCENE_MP4));
    assert.ok(existsSync(ingested.path));
    assert.match(ingested.referenceId, /^[0-9a-f]{64}$/);
  });

  test('ingerir el MISMO video real dos veces es idempotente -- mismo referenceId, no duplica el archivo', () => {
    const a = ingestReferenceVideo(SINGLE_SCENE_MP4, { referenceDir: REFERENCE_DIR });
    const b = ingestReferenceVideo(SINGLE_SCENE_MP4, { referenceDir: REFERENCE_DIR });
    assert.equal(a.referenceId, b.referenceId);
    assert.equal(a.path, b.path);
  });

  test('lanza si el sourcePath real no existe', () => {
    assert.throws(() => ingestReferenceVideo(join(TEST_TMP_DIR, 'no-existe.mp4'), { referenceDir: REFERENCE_DIR }), /no existe/);
  });
});

describe('analyzeReferenceVideo — extracción técnica real (ffprobe/ffmpeg, sin IA)', () => {
  test('duración/formato/audio reales, medidos con ffprobe -- nunca asumidos', () => {
    const ingested = ingestReferenceVideo(SINGLE_SCENE_MP4, { referenceDir: REFERENCE_DIR });
    const analysis = analyzeReferenceVideo({ referenceId: ingested.referenceId, videoPath: ingested.path, referenceDir: REFERENCE_DIR, ffmpegBinDir: FFMPEG_BIN_DIR });
    assert.ok(Math.abs(analysis.duration - SINGLE_SCENE_DURATION_S) < 0.5);
    assert.equal(analysis.aspectRatio, '16:9');
    assert.equal(analysis.width, 640);
    assert.equal(analysis.height, 360);
    assert.equal(analysis.audioStructure.hasAudio, true);
  });

  test('un video de una sola escena real -- pacing.sceneCount 1, sin cortes falsos', () => {
    const ingested = ingestReferenceVideo(SINGLE_SCENE_MP4, { referenceDir: REFERENCE_DIR });
    const analysis = analyzeReferenceVideo({ referenceId: ingested.referenceId, videoPath: ingested.path, referenceDir: REFERENCE_DIR, ffmpegBinDir: FFMPEG_BIN_DIR });
    assert.equal(analysis.pacing.sceneCount, 1);
    assert.equal(analysis.scenes[0].position, 'ÚNICA');
  });

  test('un video real con un corte de escena visible (rojo->azul en el segundo 3) -- detecta 2 escenas reales, con el corte cerca del segundo 3', () => {
    const ingested = ingestReferenceVideo(TWO_SCENE_MP4, { referenceDir: REFERENCE_DIR });
    const analysis = analyzeReferenceVideo({ referenceId: ingested.referenceId, videoPath: ingested.path, referenceDir: REFERENCE_DIR, ffmpegBinDir: FFMPEG_BIN_DIR });
    assert.equal(analysis.pacing.sceneCount, 2);
    assert.equal(analysis.scenes[0].position, 'APERTURA');
    assert.equal(analysis.scenes[1].position, 'CIERRE');
    assert.ok(Math.abs(analysis.scenes[0].endSeconds - 3) < 0.5, `corte detectado en ${analysis.scenes[0].endSeconds}s, se esperaba ~3s`);
  });

  test('extrae keyframes reales (1 JPEG real por escena, con contenido real en disco)', () => {
    const ingested = ingestReferenceVideo(TWO_SCENE_MP4, { referenceDir: REFERENCE_DIR });
    const analysis = analyzeReferenceVideo({ referenceId: ingested.referenceId, videoPath: ingested.path, referenceDir: REFERENCE_DIR, ffmpegBinDir: FFMPEG_BIN_DIR });
    assert.equal(analysis.keyframes.length, analysis.scenes.length);
    for (const kf of analysis.keyframes) {
      assert.ok(existsSync(kf.path));
      assert.ok(statSync(kf.path).size > 0);
    }
  });

  test('campos semánticos (transcript/hook/cta/texto visible/estilo de captions/presencia de producto o persona) se reportan explícitamente NO disponibles -- nunca se inventan sin transcripción/visión real instalada', () => {
    const ingested = ingestReferenceVideo(SINGLE_SCENE_MP4, { referenceDir: REFERENCE_DIR });
    const analysis = analyzeReferenceVideo({ referenceId: ingested.referenceId, videoPath: ingested.path, referenceDir: REFERENCE_DIR, ffmpegBinDir: FFMPEG_BIN_DIR });
    for (const field of [analysis.transcript, analysis.hook, analysis.cta, analysis.visibleText, analysis.captionStyle, analysis.productPresence, analysis.personPresence, analysis.audioStructure.musicDetected, analysis.audioStructure.voiceDetected]) {
      assert.equal(field.available, false);
      assert.ok(field.reason?.length > 0);
    }
  });
});
