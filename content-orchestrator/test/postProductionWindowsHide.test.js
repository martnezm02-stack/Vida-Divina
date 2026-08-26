// postProductionWindowsHide.test.js — Fix HyperFrames: eliminar consolas/
// ventanas visibles de render (2026-08-26).
//
// Mismo criterio que video-production/test/windowsHide.test.js -- verifica
// que el correr() interno de postProduction.js (usado por MULTI_SCENE_CONCAT/
// MUSIC_REPLACEMENT/RESIZE_TO_PROFILE, etc., todos los pasos ffmpeg reales
// de la fase de postproducción) SIEMPRE pasa windowsHide:true a spawnSync
// real. correr() no está exportado (es interno de postProduction.js) --
// se ejercita indirectamente vía runPostProduction() real sobre un MP4
// fixture real, interceptando child_process.spawnSync real (mismo shim,
// instalado ANTES del primer import real de postProduction.js -- ver nota
// de cabecera de windowsHide.test.js: la ligadura ESM se captura una sola
// vez en el momento real de evaluación del módulo importador).

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const FFMPEG_BIN_DIR = 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';

// Shim real instalado ANTES de importar postProduction.js más abajo --
// graba cada llamada real mientras `handler` esté activo; si no, delega al
// spawnSync REAL original (nunca deja el proceso sin spawnSync funcional).
const cp = require('node:child_process');
const spawnSyncReal = cp.spawnSync;
let handler = null;
cp.spawnSync = (...args) => (handler ? handler(...args) : spawnSyncReal(...args));

const { runPostProduction } = await import('../src/postProduction.js');
const { getOutputProfile } = await import('../src/outputProfiles.js');

// Fixture real corta (spawnSync REAL, sin interceptar -- handler sigue null aquí).
const TEST_TMP_DIR = mkdtempSync(join(tmpdir(), 'co-postprod-windowshide-test-'));
const REAL_MP4 = join(TEST_TMP_DIR, '_fixture.mp4');
const ffmpegBin = join(FFMPEG_BIN_DIR, 'ffmpeg.exe');
const fixtureResult = spawnSyncReal(ffmpegBin, [
  '-y', '-f', 'lavfi', '-i', 'color=c=0x441C11:s=640x360:d=2:r=24',
  '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2:sample_rate=48000',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart',
  REAL_MP4,
], { encoding: 'utf8', shell: false, windowsHide: true });
if (fixtureResult.status !== 0) throw new Error(`No se pudo generar la fixture real: ${fixtureResult.stderr}`);
if (!existsSync(REAL_MP4)) throw new Error('La fixture real no se escribió en disco.');

after(() => rmSync(TEST_TMP_DIR, { recursive: true, force: true }));

describe('postProduction.js#correr() (interno) -- windowsHide real en cada paso ffmpeg real', () => {
  test('RESIZE_TO_PROFILE real: TODA llamada real a spawnSync (ffmpeg + ffprobe de validación) lleva windowsHide:true', () => {
    const llamadas = [];
    handler = (cmd, args, opts) => {
      llamadas.push({ cmd, args, opts });
      return spawnSyncReal(cmd, args, opts);
    };
    let resultado;
    try {
      resultado = runPostProduction({
        inputPath: REAL_MP4,
        outputPath: join(TEST_TMP_DIR, '_out-resize.mp4'),
        outputProfile: getOutputProfile('INSTAGRAM_FEED'),
        operations: ['RESIZE_TO_PROFILE'],
        ffmpegBinDir: FFMPEG_BIN_DIR,
      });
    } finally {
      handler = null;
    }
    assert.equal(resultado.status, 'COMPLETADO', `postproducción real falló: ${resultado.error}`);
    assert.ok(llamadas.length >= 2, `se esperaban al menos 2 llamadas reales (ffmpeg + ffprobe), hubo ${llamadas.length}.`);
    for (const l of llamadas) {
      assert.equal(l.opts.windowsHide, true, `la llamada real a "${l.cmd}" no llevó windowsHide:true.`);
    }
  });
});
