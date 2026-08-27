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
import { existsSync } from 'node:fs';

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
  argsRenderOculto, HIDE_CONSOLE_PRELOAD, resolverHyperframesCli,
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

// ---------------------------------------------------------------------
// Fix real (2026-08-27): ventanas de consola visibles durante el render.
// ROOT CAUSE real (confirmado leyendo, sin modificar, node_modules/
// hyperframes/dist/cli.js): windowsHide:true en el `correr()` de ARRIBA
// solo oculta la consola del proceso hijo DIRECTO (node.exe ejecutando la
// CLI de HyperFrames) -- pero ESE proceso, ya sin consola propia, vuelve a
// llamar internamente a child_process.spawn(ffmpeg/ffprobe) en 5 sitios
// reales distintos SIN windowsHide, lo que en Windows real crea una
// consola NUEVA Y VISIBLE para cada uno. El fix (hideChildProcessConsoleWindows.cjs)
// se precarga vía `node --require <preload> <hyperframesCli> render ...`
// (ver argsRenderOculto()) -- intercepta esos spawns reales sin tocar
// node_modules.
// ---------------------------------------------------------------------
describe('argsRenderOculto() -- invocación real de HyperFrames con el preload que oculta sus spawns internos', () => {
  test('el preload real existe en disco -- nunca una ruta rota', () => {
    assert.ok(existsSync(HIDE_CONSOLE_PRELOAD), `HIDE_CONSOLE_PRELOAD debe apuntar a un archivo real: ${HIDE_CONSOLE_PRELOAD}`);
  });

  test('antepone `--require <preload>` real ANTES del entry point de la CLI -- Node solo aplica --require si va antes del script', () => {
    const args = argsRenderOculto('C:\\ruta\\real\\hyperframes.mjs', 'C:\\ruta\\real\\output.mp4');
    assert.deepEqual(args.slice(0, 2), ['--require', HIDE_CONSOLE_PRELOAD]);
    assert.equal(args[2], 'C:\\ruta\\real\\hyperframes.mjs');
    assert.equal(args[3], 'render');
  });

  test('correr(process.execPath, argsRenderOculto(...)) real -- el spawnSync real recibe windowsHide:true Y el --require real como primeros argumentos', () => {
    const hyperframesCli = resolverHyperframesCli();
    const llamadas = grabarLlamadasSpawnSync(() => correr(process.execPath, argsRenderOculto(hyperframesCli, 'C:\\salida.mp4'), { cwd: '.', env: process.env }));
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].opts.windowsHide, true);
    assert.equal(llamadas[0].args[0], '--require');
    assert.equal(llamadas[0].args[1], HIDE_CONSOLE_PRELOAD);
    assert.ok(llamadas[0].args.includes(hyperframesCli));
  });
});

describe('hideChildProcessConsoleWindows.cjs -- comportamiento real del preload (subproceso real, sin node_modules)', () => {
  test('cargado en un proceso real: parcha spawn/spawnSync/execFile de child_process (win32) -- funcionalidad y logging real preservados', () => {
    if (process.platform !== 'win32') return; // no-op fuera de win32, por diseño -- nada que verificar.
    const r = spawnSyncReal(process.execPath, [
      '--require', HIDE_CONSOLE_PRELOAD, '-e',
      "const cp=require('child_process'); const r=cp.spawnSync('cmd.exe',['/c','echo','hidden-ok']); process.stdout.write(r.stdout.toString());",
    ], { encoding: 'utf8', windowsHide: true });
    assert.equal(r.status, 0, `subproceso real de prueba falló: ${r.stderr}`);
    assert.match(r.stdout, /hidden-ok/, 'stdout real del hijo (ffmpeg/cmd) debe seguir capturado -- windowsHide nunca oculta logging.');
  });

  test('no interfiere entre spawns concurrentes reales -- dos spawns reales simultáneos, ambos con windowsHide real, sin error', () => {
    if (process.platform !== 'win32') return;
    const args = ['--require', HIDE_CONSOLE_PRELOAD, '-e', "require('child_process').spawnSync('cmd.exe',['/c','exit','0']);process.exit(0);"];
    const [r1, r2] = [
      spawnSyncReal(process.execPath, args, { windowsHide: true }),
      spawnSyncReal(process.execPath, args, { windowsHide: true }),
    ];
    assert.equal(r1.status, 0);
    assert.equal(r2.status, 0);
  });

  test('real, sin captura de pantalla (regla 10): el proceso hijo real (cmd.exe) spawneado bajo el preload NUNCA reporta una ventana visible real (MainWindowHandle) durante su vida real -- verificado vía Win32 real (Get-Process) sobre SU PID exacto, nunca sobre procesos ajenos del escritorio del usuario', async () => {
    if (process.platform !== 'win32') return;
    // El script hijo imprime el PID real del cmd.exe que lanza (fire-and-forget,
    // vida ≈1.5s) -- así la comprobación de ventana se filtra EXACTAMENTE a ESE
    // proceso real, nunca a cmd.exe/conhost.exe ajenos que puedan existir en el
    // escritorio real del usuario (regla 4: nunca tocar/evaluar un proceso ajeno).
    const child = spawnSyncReal(process.execPath, [
      '--require', HIDE_CONSOLE_PRELOAD, '-e',
      "const p=require('child_process').spawn('cmd.exe',['/c','ping -n 2 127.0.0.1 >nul']); process.stdout.write(String(p.pid));",
    ], { windowsHide: true, encoding: 'utf8' });
    assert.equal(child.status, 0, `subproceso real falló: ${child.stderr}`);
    const cmdPid = Number(child.stdout.trim());
    assert.ok(Number.isInteger(cmdPid) && cmdPid > 0, `PID real inválido: "${child.stdout}"`);

    // Tiempo real suficiente para que, SI Windows le hubiera asignado una
    // consola nueva real, ya hubiera aparecido antes de que el comando termine.
    await new Promise((resolve) => { setTimeout(resolve, 1200); });
    const ps = spawnSyncReal('powershell.exe', [
      '-NoProfile', '-Command',
      `Get-Process -Id ${cmdPid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty MainWindowHandle`,
    ], { encoding: 'utf8', windowsHide: true });
    const handle = ps.stdout.trim();
    assert.ok(handle === '' || handle === '0', `el cmd.exe real (PID ${cmdPid}) reportó una ventana visible real (MainWindowHandle=${handle}) mientras el preload estaba activo.`);
  });
});
