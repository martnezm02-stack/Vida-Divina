import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runPostProduction, POSTPRODUCTION_BACKENDS, SUPPORTED_OPERATIONS } from '../src/postProduction.js';
import { getOutputProfile } from '../src/outputProfiles.js';

const FFMPEG_BIN_DIR = 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';

// Todo el I/O de esta suite vive bajo el directorio temporal del SO
// (os.tmpdir()), NUNCA bajo content-orchestrator/ ni video-production/ --
// se observó que archivos MP4 reales escritos dentro de la carpeta del
// proyecto (sincronizada con OneDrive) podían desaparecer segundos
// después de creados (causa externa, ajena a este código: eviction de
// OneDrive Files-on-Demand). El directorio temporal del SO no está
// sincronizado y ya es el patrón usado por el resto del proyecto
// (hyperframesRenderer.test.js, contentOrchestrator.test.js) sin ese
// problema.
const TEST_TMP_DIR = mkdtempSync(join(tmpdir(), 'co-postprod-test-'));
const REAL_MP4 = join(TEST_TMP_DIR, '_fixture-real-source.mp4');

// Se observó en esta máquina que un MP4 recién escrito por un proceso hijo
// (ffmpeg) puede desaparecer del disco unos pocos segundos después de
// creado -- incluso bajo os.tmpdir() (fuera de cualquier sincronización de
// OneDrive), muy probablemente por un escaneo/cuarentena de antivirus en
// tiempo real sobre archivos nuevos generados por procesos externos.
// Regenerar la fixture inmediatamente antes de CADA test (beforeEach, no
// once) es la mitigación real y verificada: el archivo sobrevive lo
// suficiente para que el test que lo usa termine, sin depender de que
// sobreviva minutos u otros tests de por medio.
function regenerarFixtureReal() {
  const ffmpegBin = join(FFMPEG_BIN_DIR, 'ffmpeg.exe');
  const r = spawnSync(ffmpegBin, [
    '-y', '-f', 'lavfi', '-i', 'color=c=0x441C11:s=1080x1920:d=8:r=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8:sample_rate=48000',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
    REAL_MP4,
  ], { encoding: 'utf8', shell: false });
  if (r.status !== 0) throw new Error(`No se pudo generar la fixture real de video: ${r.stderr}`);
}

beforeEach(() => { regenerarFixtureReal(); });
after(() => { rmSync(TEST_TMP_DIR, { recursive: true, force: true }); });

describe('runPostProduction — interfaz abstracta', () => {
  test('POSTPRODUCTION_BACKENDS incluye local_ffmpeg', () => {
    assert.ok(POSTPRODUCTION_BACKENDS.includes('local_ffmpeg'));
  });

  test('rechaza un backend desconocido', () => {
    assert.throws(() => runPostProduction({ inputPath: 'x', outputPath: 'y', outputProfile: {}, operations: ['LOUDNESS_NORMALIZATION'], backend: 'krillinai' }), /backend desconocido/);
  });

  test('rechaza "operations" vacío', () => {
    assert.throws(() => runPostProduction({ inputPath: 'x', outputPath: 'y', outputProfile: {}, operations: [] }), /operations/);
  });

  test('rechaza sin outputProfile', () => {
    assert.throws(() => runPostProduction({ inputPath: 'x', outputPath: 'y', operations: ['LOUDNESS_NORMALIZATION'] }), /outputProfile/);
  });
});

describe('local_ffmpeg backend — real, sobre un MP4 real generado con ffmpeg (fixture hermética)', () => {
  test('LOUDNESS_NORMALIZATION real produce un MP4 válido con audio corregido', () => {
    const outputPath = join(TEST_TMP_DIR, '_tmp-loudnorm.mp4');
    const r = runPostProduction({
      inputPath: REAL_MP4, outputPath,
      outputProfile: getOutputProfile('GENERIC_VERTICAL'),
      operations: ['LOUDNESS_NORMALIZATION'],
      ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    assert.equal(r.status, 'COMPLETADO');
    assert.equal(r.probe.ok, true);
    assert.equal(r.probe.hasAudio, true);
    assert.deepEqual(r.operationsApplied, ['LOUDNESS_NORMALIZATION']);
  });

  test('RESIZE_TO_PROFILE real cambia las dimensiones reales del video (9:16 -> 1:1)', () => {
    const outputPath = join(TEST_TMP_DIR, '_tmp-resize.mp4');
    const r = runPostProduction({
      inputPath: REAL_MP4, outputPath,
      outputProfile: getOutputProfile('GENERIC_SQUARE'),
      operations: ['RESIZE_TO_PROFILE'],
      ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    assert.equal(r.status, 'COMPLETADO');
    assert.equal(r.probe.width, 1080);
    assert.equal(r.probe.height, 1080);
  });

  test('una operación no soportada se reporta como NOT_IMPLEMENTED_YET, nunca se finge realizada', () => {
    const outputPath = join(TEST_TMP_DIR, '_tmp-noop.mp4');
    const r = runPostProduction({
      inputPath: REAL_MP4, outputPath,
      outputProfile: getOutputProfile('GENERIC_VERTICAL'),
      operations: ['SUBTITLE_BURN_KARAOKE'],
      ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    // Estado explícito PARTIAL (ampliado en la fase Content Generation Engine): el archivo se copia
    // igual (sin cambios), pero como una operación pedida no pudo aplicarse, ya no se reporta como
    // un COMPLETADO indistinguible de un éxito total -- ver postProduction.js#UNSUPPORTED_LOCAL_OPERATIONS.
    assert.equal(r.status, 'PARTIAL');
    assert.deepEqual(r.operationsApplied, []);
    assert.equal(r.operationsSkipped[0].operation, 'SUBTITLE_BURN_KARAOKE');
    assert.equal(r.operationsSkipped[0].reason, 'NOT_IMPLEMENTED_YET');
  });

  test('reporta ERROR si el archivo de entrada no existe, nunca fabrica un resultado', () => {
    const r = runPostProduction({
      inputPath: 'C:/no/existe.mp4', outputPath: 'C:/no/importa.mp4',
      outputProfile: getOutputProfile('GENERIC_VERTICAL'),
      operations: ['LOUDNESS_NORMALIZATION'],
    });
    assert.equal(r.status, 'ERROR');
    assert.match(r.error, /no existe el archivo de entrada/);
  });
});

describe('local_ffmpeg backend — operaciones nuevas de Content Generation Engine (EDIT_ENHANCE), reales', () => {
  test('TRIM real recorta la duración real del video', () => {
    const outputPath = join(TEST_TMP_DIR, '_tmp-trim.mp4');
    const r = runPostProduction({
      inputPath: REAL_MP4, outputPath,
      outputProfile: getOutputProfile('GENERIC_VERTICAL'),
      operations: ['TRIM'], operationParams: { TRIM: { startSeconds: 0, endSeconds: 5 } },
      ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    assert.equal(r.status, 'COMPLETADO');
    assert.ok(r.probe.videoDurationSeconds < 7, `duración recortada esperada <7s, fue ${r.probe.videoDurationSeconds}`);
  });

  test('TRIM sin endSeconds real lanza VALIDATION_FAILED, nunca asume una duración', () => {
    const r = runPostProduction({
      inputPath: REAL_MP4, outputPath: 'C:/no/importa.mp4',
      outputProfile: getOutputProfile('GENERIC_VERTICAL'),
      operations: ['TRIM'], operationParams: {},
      ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    assert.equal(r.status, 'VALIDATION_FAILED');
  });

  test('SILENCE_TRIM + AUDIO_CLEANUP reales combinados en un solo paso producen un MP4 válido', () => {
    const outputPath = join(TEST_TMP_DIR, '_tmp-silence-cleanup.mp4');
    const r = runPostProduction({
      inputPath: REAL_MP4, outputPath,
      outputProfile: getOutputProfile('GENERIC_VERTICAL'),
      operations: ['SILENCE_TRIM', 'AUDIO_CLEANUP'],
      ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    assert.equal(r.status, 'COMPLETADO');
    assert.deepEqual(r.operationsApplied.sort(), ['AUDIO_CLEANUP', 'SILENCE_TRIM']);
    assert.equal(r.probe.hasAudio, true);
  });

  test('TEXT_OVERLAY real (drawtext) funciona en Windows -- incluye el fix de escape de ":" en la ruta de fuente (C:/Windows/Fonts/...)', () => {
    const outputPath = join(TEST_TMP_DIR, '_tmp-textoverlay.mp4');
    const r = runPostProduction({
      inputPath: REAL_MP4, outputPath,
      outputProfile: getOutputProfile('GENERIC_VERTICAL'),
      operations: ['TEXT_OVERLAY'],
      operationParams: { TEXT_OVERLAY: { text: 'Escríbenos por WhatsApp', position: 'bottom' } },
      ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    assert.equal(r.status, 'COMPLETADO');
    assert.deepEqual(r.operationsApplied, ['TEXT_OVERLAY']);
    assert.equal(r.probe.ok, true);
  });

  test('TEXT_OVERLAY sin texto real lanza VALIDATION_FAILED -- nunca redacta el copy aquí', () => {
    const r = runPostProduction({
      inputPath: REAL_MP4, outputPath: 'C:/no/importa.mp4',
      outputProfile: getOutputProfile('GENERIC_VERTICAL'),
      operations: ['TEXT_OVERLAY'], operationParams: {},
      ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    assert.equal(r.status, 'VALIDATION_FAILED');
  });

  test('LOGO_OVERLAY sin logoPath real se reporta SOURCE_ASSET_REQUIRED, nunca se finge aplicado', () => {
    const outputPath = join(TEST_TMP_DIR, '_tmp-logo-missing.mp4');
    const r = runPostProduction({
      inputPath: REAL_MP4, outputPath,
      outputProfile: getOutputProfile('GENERIC_VERTICAL'),
      operations: ['LOGO_OVERLAY'], operationParams: {},
      ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    assert.equal(r.status, 'PARTIAL');
    assert.deepEqual(r.operationsApplied, []);
    assert.equal(r.operationsSkipped[0].reason, 'SOURCE_ASSET_REQUIRED');
  });

  test('MUSIC_REPLACEMENT sin musicPath real se reporta SOURCE_ASSET_REQUIRED', () => {
    const outputPath = join(TEST_TMP_DIR, '_tmp-music-missing.mp4');
    const r = runPostProduction({
      inputPath: REAL_MP4, outputPath,
      outputProfile: getOutputProfile('GENERIC_VERTICAL'),
      operations: ['MUSIC_REPLACEMENT'], operationParams: {},
      ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    assert.equal(r.status, 'PARTIAL');
    assert.equal(r.operationsSkipped[0].reason, 'SOURCE_ASSET_REQUIRED');
  });

  test('INTRO_OUTRO sin ningún clip real se reporta SOURCE_ASSET_REQUIRED', () => {
    const outputPath = join(TEST_TMP_DIR, '_tmp-introoutro-missing.mp4');
    const r = runPostProduction({
      inputPath: REAL_MP4, outputPath,
      outputProfile: getOutputProfile('GENERIC_VERTICAL'),
      operations: ['INTRO_OUTRO'], operationParams: {},
      ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    assert.equal(r.status, 'PARTIAL');
    assert.equal(r.operationsSkipped[0].reason, 'SOURCE_ASSET_REQUIRED');
  });

  test('una operación real UNSUPPORTED_LOCAL_OPERATION (SCENE_TIMING_CHANGE) se reporta con su motivo real, nunca instala un modelo pesado', () => {
    const outputPath = join(TEST_TMP_DIR, '_tmp-unsupported.mp4');
    const r = runPostProduction({
      inputPath: REAL_MP4, outputPath,
      outputProfile: getOutputProfile('GENERIC_VERTICAL'),
      operations: ['SCENE_TIMING_CHANGE'],
      ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    assert.equal(r.status, 'PARTIAL');
    assert.equal(r.operationsSkipped[0].reason, 'UNSUPPORTED_LOCAL_OPERATION');
    assert.match(r.operationsSkipped[0].detail, /HyperFrames/);
  });
});

describe('Windows path handling', () => {
  test('rutas con espacios en el nombre de archivo y backslashes se resuelven correctamente, sin shell', () => {
    const outputPath = join(TEST_TMP_DIR, '_tmp-winpath test with spaces.mp4');
    const r = runPostProduction({
      inputPath: REAL_MP4, outputPath,
      outputProfile: getOutputProfile('GENERIC_VERTICAL'),
      operations: ['LOUDNESS_NORMALIZATION'],
      ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    assert.equal(r.status, 'COMPLETADO');
    assert.ok(existsSync(outputPath));
  });

  test('el propio directorio temporal real ya ejercita backslashes de Windows en cada ruta usada arriba', () => {
    assert.ok(TEST_TMP_DIR.includes('\\'));
  });
});

describe('SUPPORTED_OPERATIONS', () => {
  test('incluye las 9 operaciones reales implementadas (2 de la fase PostProduction + 7 de Content Generation Engine)', () => {
    assert.deepEqual([...SUPPORTED_OPERATIONS].sort(), [
      'AUDIO_CLEANUP', 'INTRO_OUTRO', 'LOGO_OVERLAY', 'LOUDNESS_NORMALIZATION',
      'MUSIC_REPLACEMENT', 'RESIZE_TO_PROFILE', 'SILENCE_TRIM', 'TEXT_OVERLAY', 'TRIM',
    ]);
  });
});
