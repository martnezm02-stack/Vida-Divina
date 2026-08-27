// hideChildProcessConsoleWindows.cjs — Fix ventanas de consola visibles
// durante un render (2026-08-27).
//
// ROOT CAUSE real, confirmado leyendo (sin modificar) node_modules/hyperframes/
// dist/cli.js: nuestro spawn real de `node <hyperframes-cli> render ...`
// (video-production/src/hyperframesRenderer.js#correr, ver windowsHide:true
// ahí) SÍ oculta la consola de ESE proceso hijo directo -- pero ese mismo
// proceso node.exe, YA SIN consola propia, vuelve a llamar internamente a
// `child_process.spawn(getFfmpegBinary(), ...)` varias veces (detección de
// encoder GPU, encode real, ffprobe, encoder streaming -- 5 sitios reales
// distintos dentro de node_modules/hyperframes/dist/cli.js) SIN
// `windowsHide:true`. En Windows, cuando un proceso sin consola propia
// lanza un nuevo proceso de subsistema de consola (ffmpeg.exe/ffprobe.exe)
// sin CREATE_NO_WINDOW, Windows le asigna una consola NUEVA Y VISIBLE
// (conhost.exe) -- ese es el origen real de las ventanas que el usuario ve
// durante el render. Puppeteer/Chrome NO es la causa: @puppeteer/browsers
// (video-production/node_modules/@puppeteer/browsers/lib/launch.js) ya
// pasa windowsHide:true al lanzar el binario real de Chrome.
//
// FIX (sin tocar node_modules, punto de control real desde nuestra propia
// aplicación): este archivo se precarga con `node --require
// hideChildProcessConsoleWindows.cjs <hyperframes-cli> render ...` (ver
// hyperframesRenderer.js#correr, único sitio real que invoca el CLI) --
// Node.js built-ins comparten el MISMO objeto de módulo real entre
// require('child_process') (CJS, aquí) e `import ... from "child_process"`
// (ESM, dentro del bundle de HyperFrames) -- parchar spawn/spawnSync/
// execFile aquí intercepta TODOS los spawns reales que HyperFrames hace
// más adelante en el mismo proceso, sin editar un solo byte de
// node_modules. Verificado empíricamente antes de escribir esto (spawn de
// prueba real vía un script ESM separado, interceptado correctamente).
//
// Solo agrega windowsHide:true (Windows real, CREATE_NO_WINDOW real) --
// nunca cambia stdio, nunca cambia detached, nunca oculta logging real
// (windowsHide no afecta stdout/stderr, mismo criterio ya documentado en
// hyperframesRenderer.js#correr). Nunca toca fork() (procesos Node reales
// con IPC, fuera del alcance de este problema). No-op fuera de win32.

'use strict';

if (process.platform === 'win32') {
  const cp = require('child_process');

  function forceWindowsHide(args, optsIndex) {
    const opts = args[optsIndex];
    if (opts === undefined || opts === null) {
      args[optsIndex] = { windowsHide: true };
    } else if (typeof opts === 'object' && opts.windowsHide === undefined) {
      args[optsIndex] = { ...opts, windowsHide: true };
    }
    return args;
  }

  const originalSpawn = cp.spawn;
  cp.spawn = function spawnConsolaOculta(...args) {
    // spawn(command, args?, options?) -- options es el último argumento real si es un objeto plano.
    const optsIndex = typeof args[1] === 'object' && !Array.isArray(args[1]) ? 1 : 2;
    return originalSpawn.apply(this, forceWindowsHide(args, optsIndex));
  };

  const originalSpawnSync = cp.spawnSync;
  cp.spawnSync = function spawnSyncConsolaOculta(...args) {
    const optsIndex = typeof args[1] === 'object' && !Array.isArray(args[1]) ? 1 : 2;
    return originalSpawnSync.apply(this, forceWindowsHide(args, optsIndex));
  };

  const originalExecFile = cp.execFile;
  cp.execFile = function execFileConsolaOculta(...args) {
    // execFile(file, args?, options?, callback?) -- options real es el primer objeto plano que no sea el callback.
    const optsIndex = args.findIndex((a, i) => i > 0 && typeof a === 'object' && a !== null && !Array.isArray(a));
    if (optsIndex !== -1) forceWindowsHide(args, optsIndex);
    return originalExecFile.apply(this, args);
  };
}
