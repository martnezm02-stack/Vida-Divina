// windowsHide.test.js — Fix HyperFrames: eliminar consolas/ventanas
// visibles de render (2026-08-26).
//
// Verifica que correr() (el ÚNICO punto real por el que Vida Divina lanza
// procesos de sistema -- hyperframes CLI, ffmpeg, ffprobe, powershell.exe/
// taskkill.exe del cleanup de huérfanos) SIEMPRE pasa windowsHide:true a
// spawnSync real -- sin depender de una captura visual de Windows (frágil,
// no reproducible en CI/headless), sino interceptando la llamada real a
// child_process.spawnSync y verificando el objeto de opciones real que
// recibe.
//
// IMPORTANTE (hallazgo real de esta fase): la ligadura ESM real de
// `import { spawnSync } from 'node:child_process'` que usa
// hyperframesRenderer.js se resuelve UNA sola vez, en el momento real en
// que ese módulo se evalúa por primera vez -- reasignar
// `require('node:child_process').spawnSync` DESPUÉS de haber importado
// hyperframesRenderer.js en este mismo proceso NO surte efecto (confirmado
// empíricamente). Por eso este archivo instala el shim real de
// spawnSync ANTES de cualquier import real de hyperframesRenderer.js (a
// nivel de módulo, antes del primer `await import(...)`) -- node --test
// corre cada archivo de test en su propio proceso real, así que esto no
// interfiere con ningún otro archivo de test.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const THIS_FILE = fileURLToPath(import.meta.url);

// Shim real instalado ANTES de importar hyperframesRenderer.js más abajo --
// delega a `handler` (mutable, una función real por test) o, si no hay
// handler activo, al spawnSync real original (nunca deja el proceso sin
// spawnSync funcional entre tests).
const cp = require('node:child_process');
const spawnSyncReal = cp.spawnSync;
let handler = null;
cp.spawnSync = (...args) => (handler ? handler(...args) : spawnSyncReal(...args));

const {
  correr, limpiarProcesosHuerfanosChrome, validarMp4ConFfprobe,
} = await import('../src/hyperframesRenderer.js');

/** Instala un handler real que graba cada llamada real durante `fn()`, y siempre lo desinstala al terminar (incluso si `fn` lanza). */
function grabarLlamadasSpawnSync(fn) {
  const llamadas = [];
  handler = (cmd, args, opts) => {
    llamadas.push({ cmd, args, opts });
    return { status: 0, stdout: 'ok', stderr: '', pid: 12345 };
  };
  try {
    fn();
    return llamadas;
  } finally {
    handler = null;
  }
}

describe('correr() (video-production/src/hyperframesRenderer.js) -- windowsHide real en cada spawn real', () => {
  test('pasa windowsHide:true por default -- CREATE_NO_WINDOW real, ninguna consola visible', () => {
    const llamadas = grabarLlamadasSpawnSync(() => correr('ffprobe', ['-version']));
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].opts.windowsHide, true);
  });

  test('nunca deja de capturar stdout/stderr real (encoding utf8, sin shell) -- windowsHide no afecta la captura de logs', () => {
    const llamadas = grabarLlamadasSpawnSync(() => correr('ffprobe', ['-version']));
    assert.equal(llamadas[0].opts.encoding, 'utf8');
    assert.equal(llamadas[0].opts.shell, false);
  });

  test('un `opts` explícito real puede sobreescribir windowsHide si algún llamador futuro lo necesitara (nunca lo hace hoy)', () => {
    const llamadas = grabarLlamadasSpawnSync(() => correr('ffprobe', ['-version'], { windowsHide: false }));
    assert.equal(llamadas[0].opts.windowsHide, false);
  });

  test('limpiarProcesosHuerfanosChrome() real (powershell.exe/taskkill.exe) usa el mismo correr() -- mismo windowsHide real, sin duplicar el spawn', () => {
    const llamadas = grabarLlamadasSpawnSync(() => limpiarProcesosHuerfanosChrome({ padrePids: [999999] }));
    assert.ok(llamadas.length >= 1, 'limpiarProcesosHuerfanosChrome debe invocar powershell.exe real vía correr().');
    assert.ok(llamadas.every((l) => l.opts.windowsHide === true), 'TODAS las llamadas reales (powershell.exe, y taskkill.exe si aplica) deben llevar windowsHide:true.');
  });

  test('validarMp4ConFfprobe() real usa el mismo correr() -- mismo windowsHide real', () => {
    let llamadas;
    handler = (cmd, args, opts) => {
      llamadas = llamadas ?? [];
      llamadas.push({ cmd, args, opts });
      return { status: 0, stdout: JSON.stringify({ format: {}, streams: [{ codec_type: 'video' }] }), stderr: '' };
    };
    try {
      // existsSync real del archivo se valida ANTES de spawnSync -- usa un path real (este mismo archivo) solo para pasar ese guard.
      validarMp4ConFfprobe(THIS_FILE);
    } finally {
      handler = null;
    }
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].opts.windowsHide, true);
  });
});
