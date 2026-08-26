// postProduction.js — interfaz abstracta de postproducción (Parte 7/10) +
// backend real "local_ffmpeg". El backend es intercambiable sin tocar
// Creative Intelligence ni HyperFrames (Parte 10): contentOrchestrator.js
// solo llama a runPostProduction({ backend, ... }); si en el futuro se
// justifica otro backend (ver auditoría de herramientas del reporte de la
// fase de PostProduction), se agrega una función más al registro
// POSTPRODUCTION_BACKENDS sin cambiar la forma de la llamada.
//
// AMPLIADO en la fase "Content Generation Engine" (modo EDIT_ENHANCE) con
// operaciones reales adicionales, todas ffmpeg -- sin dependencias nuevas,
// sin modelos de IA pesados. Dos grupos:
//   - SIMPLE (se aplican en un solo paso de ffmpeg vía -vf/-af, igual que
//     antes): LOUDNESS_NORMALIZATION, RESIZE_TO_PROFILE, TRIM,
//     SILENCE_TRIM, AUDIO_CLEANUP, TEXT_OVERLAY.
//   - COMPLEX (requieren un input adicional real -- logo, música, clip de
//     intro/outro -- y corren como un paso de ffmpeg propio, encadenado
//     sobre la salida del paso anterior; ver justificación en
//     runLocalFfmpegBackend): LOGO_OVERLAY, MUSIC_REPLACEMENT, INTRO_OUTRO,
//     MULTI_SCENE_CONCAT.
// Cualquier operación no reconocida, o una COMPLEX sin el asset real que
// requiere, se reporta explícitamente (NOT_IMPLEMENTED_YET /
// SOURCE_ASSET_REQUIRED) -- nunca se finge realizada.
//
// MULTI_SCENE_CONCAT (Creative Production Orchestrator, 2026-08-24):
// generalización real de INTRO_OUTRO -- MISMO filter_complex de concat de
// N clips reales (nunca duplicado, INTRO_OUTRO ya no reimplementa su
// propio concat, delega aquí), para el caso real de un Scene Plan con
// más de 3 escenas (hook/problem/mechanism/benefit/cta...), no solo
// intro+main+outro.

import { spawnSync } from 'node:child_process';
import { existsSync, unlinkSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { validarMp4ConFfprobe } from '../../video-production/src/hyperframesRenderer.js';

export const POSTPRODUCTION_BACKENDS = Object.freeze(['local_ffmpeg']);

// Operaciones "simple": un solo paso ffmpeg, solo -vf/-af, sin input adicional.
export const SIMPLE_OPERATIONS = Object.freeze([
  'LOUDNESS_NORMALIZATION', 'RESIZE_TO_PROFILE', 'TRIM', 'SILENCE_TRIM', 'AUDIO_CLEANUP', 'TEXT_OVERLAY',
]);
// Operaciones "compleja": requieren un asset real adicional (logo/música/clip) vía un segundo -i.
export const COMPLEX_OPERATIONS = Object.freeze(['LOGO_OVERLAY', 'MUSIC_REPLACEMENT', 'INTRO_OUTRO', 'MULTI_SCENE_CONCAT']);
export const SUPPORTED_OPERATIONS = Object.freeze([...SIMPLE_OPERATIONS, ...COMPLEX_OPERATIONS]);

// Operaciones reales del vocabulario de la Parte "EDIT/ENHANCE — TIPOS DE
// OPERACIÓN" que NO son alcanzables localmente hoy -- documentado
// explícitamente, nunca se instala un modelo pesado para fingir que sí.
export const UNSUPPORTED_LOCAL_OPERATIONS = Object.freeze({
  SCENE_TIMING_CHANGE: 'Requiere volver a componer con HyperFrames desde el proyecto fuente (index.html) -- no es una operación de postproducción sobre un MP4 ya renderizado.',
  REORDER: 'Mismo motivo que SCENE_TIMING_CHANGE -- reordenar escenas requiere la composición fuente, no el MP4 final.',
  AUTO_SUBTITLE_GENERATION: 'Requeriría transcripción automática (whisper-cpp) -- no instalado en este entorno. SUBTITLE_BURN sí está disponible si el texto/timing ya se conoce (ver TEXT_OVERLAY).',
  AI_VISUAL_ENHANCEMENT: 'Requeriría un modelo de upscaling/enhancement (ej. Real-ESRGAN) -- no instalado; hardware sin GPU dedicada relevante (ver auditoría de hardware de fases anteriores).',
});

// windowsHide (Fix HyperFrames -- eliminar consolas/ventanas visibles de
// render, 2026-08-26): mismo criterio real que hyperframesRenderer.js#correr()
// -- CREATE_NO_WINDOW real para los 2 sitios reales de esta postproducción
// (MULTI_SCENE_CONCAT/MUSIC_REPLACEMENT/RESIZE_TO_PROFILE, todos vía
// ffmpeg), sin afectar stdout/stderr capturados por pipe real.
function correr(cmd, args, opts) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8', shell: false, windowsHide: true, ...opts,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function resolverBin(ffmpegBinDir, nombre) {
  return ffmpegBinDir ? join(ffmpegBinDir, `${nombre}.exe`) : nombre;
}

function construirFiltroResize(targetWidth, targetHeight) {
  // "cover" centrado: escala hasta cubrir el recuadro destino, luego recorta al centro.
  return `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}`;
}

// Fuente real del sistema (Windows) usada por TEXT_OVERLAY -- mismo
// criterio que otras rutas de esta fase ya hardcodean el entorno real de
// desarrollo (ver FFMPEG_BIN_DIR en los tests de video-production/).
const DEFAULT_FONT_FILE = 'C:\\Windows\\Fonts\\arial.ttf';

const POSICIONES_TEXTO = Object.freeze({
  top: 'x=(w-text_w)/2:y=80',
  center: 'x=(w-text_w)/2:y=(h-text_h)/2',
  bottom: 'x=(w-text_w)/2:y=h-text_h-120',
});

function escaparTextoFfmpeg(texto) {
  return String(texto).replace(/\\/g, '\\\\\\\\').replace(/:/g, '\\:').replace(/'/g, "\u2019");
}

/** Construye los filtros -vf/-af de las operaciones SIMPLE. Lanza si a alguna le falta un parámetro real obligatorio -- nunca asume un valor de negocio (ej. qué texto poner). */
function construirFiltrosSimples(reconocidas, { outputProfile, operationParams }) {
  const filtrosVideo = [];
  const filtrosAudio = [];
  let necesitaReencodeVideo = false;
  let necesitaReencodeAudio = false;
  const trimArgs = [];

  if (reconocidas.includes('TRIM')) {
    const { startSeconds = 0, endSeconds } = operationParams.TRIM ?? {};
    if (typeof endSeconds !== 'number') throw new Error('construirFiltrosSimples: TRIM requiere "operationParams.TRIM.endSeconds" real.');
    trimArgs.push('-ss', String(startSeconds), '-to', String(endSeconds));
    necesitaReencodeVideo = true; necesitaReencodeAudio = true;
  }

  if (reconocidas.includes('RESIZE_TO_PROFILE')) {
    if (typeof outputProfile?.width !== 'number' || typeof outputProfile?.height !== 'number') {
      throw new Error('construirFiltrosSimples: RESIZE_TO_PROFILE requiere "outputProfile.width/height" reales.');
    }
    filtrosVideo.push(construirFiltroResize(outputProfile.width, outputProfile.height));
    necesitaReencodeVideo = true;
  }

  if (reconocidas.includes('TEXT_OVERLAY')) {
    const { text, position = 'bottom', fontSizePx = 44, colorHex = '#FFFFFF', fontFile = DEFAULT_FONT_FILE } = operationParams.TEXT_OVERLAY ?? {};
    if (!text?.trim()) throw new Error('construirFiltrosSimples: TEXT_OVERLAY requiere "operationParams.TEXT_OVERLAY.text" real (nunca redactado aquí).');
    if (!existsSync(fontFile)) throw new Error(`construirFiltrosSimples: TEXT_OVERLAY requiere una fuente real en disco (${fontFile}).`);
    const pos = POSICIONES_TEXTO[position] ?? POSICIONES_TEXTO.bottom;
    const colorFfmpeg = colorHex.replace('#', '0x');
    // ffmpeg trata ":" como separador de opciones del filtro incluso dentro de
    // comillas simples -- el ":" de la unidad de Windows ("C:") debe escaparse
    // con "\\:" o el parser del filtro falla ("No option name near...").
    const fontFileFfmpeg = fontFile.replace(/\\/g, '/').replace(':', '\\:');
    filtrosVideo.push(`drawtext=fontfile='${fontFileFfmpeg}':text='${escaparTextoFfmpeg(text)}':fontcolor=${colorFfmpeg}:fontsize=${fontSizePx}:box=1:boxcolor=0x000000@0.55:boxborderw=16:${pos}`);
    necesitaReencodeVideo = true;
  }

  if (reconocidas.includes('LOUDNESS_NORMALIZATION')) {
    const targetLufs = outputProfile?.audio?.loudnessTargetLufs ?? -14;
    filtrosAudio.push(`loudnorm=I=${targetLufs}:TP=-1.5:LRA=11`);
    necesitaReencodeAudio = true;
  }

  if (reconocidas.includes('SILENCE_TRIM')) {
    const { silenceThresholdDb = -35, minSilenceDurationSeconds = 0.5 } = operationParams.SILENCE_TRIM ?? {};
    filtrosAudio.push(`silenceremove=stop_periods=-1:stop_duration=${minSilenceDurationSeconds}:stop_threshold=${silenceThresholdDb}dB`);
    necesitaReencodeAudio = true;
  }

  if (reconocidas.includes('AUDIO_CLEANUP')) {
    filtrosAudio.push('afftdn');
    necesitaReencodeAudio = true;
  }

  return { filtrosVideo, filtrosAudio, necesitaReencodeVideo, necesitaReencodeAudio, trimArgs };
}

function ejecutarPasoFfmpeg({ ffmpegBin, ffprobeBin, extraInputArgs = [], inputPath, trimArgs = [], filtrosVideo = [], filtrosAudio = [], filterComplex = null, mapArgs = [], necesitaReencodeVideo, necesitaReencodeAudio, outputProfile, outputPath }) {
  const args = ['-y', ...trimArgs, '-i', inputPath, ...extraInputArgs];

  if (filterComplex) {
    args.push('-filter_complex', filterComplex, ...mapArgs);
  } else {
    if (filtrosVideo.length > 0) args.push('-vf', filtrosVideo.join(','));
    if (filtrosAudio.length > 0) args.push('-af', filtrosAudio.join(','));
  }

  args.push('-c:v', necesitaReencodeVideo ? 'libx264' : 'copy');
  if (necesitaReencodeVideo) {
    args.push('-pix_fmt', 'yuv420p');
    if (typeof outputProfile?.videoBitrateBps === 'number') args.push('-b:v', String(outputProfile.videoBitrateBps));
  }
  args.push('-c:a', necesitaReencodeAudio ? 'aac' : 'copy');
  if (necesitaReencodeAudio) args.push('-b:a', '192k');
  args.push('-movflags', '+faststart', outputPath);

  const resultado = correr(ffmpegBin, args);
  if (resultado.status !== 0) return { ok: false, error: resultado.stderr || resultado.stdout };

  const probe = validarMp4ConFfprobe(outputPath, { ffprobeBin });
  if (!probe.ok) return { ok: false, error: `postproducción produjo un archivo inválido: ${probe.error}` };
  return { ok: true, probe };
}

/** Ejecuta UNA operación COMPLEX real como su propio paso de ffmpeg (ver nota de cabecera: se encadenan, no se funden en un solo filter_complex gigante -- más simple y correcto, a costa de un re-encode por operación compleja). Devuelve {ok:false, reason:'SOURCE_ASSET_REQUIRED', detail} si el asset real que requiere no fue provisto o no existe -- nunca simula el efecto. */
function ejecutarOperacionCompleja(op, { inputPath, outputPath, operationParams, ffmpegBin, ffprobeBin, necesitaReencodeVideoPrevio, necesitaReencodeAudioPrevio, outputProfile }) {
  if (op === 'LOGO_OVERLAY') {
    const { logoPath, position = 'top-right' } = operationParams.LOGO_OVERLAY ?? {};
    if (!logoPath || !existsSync(logoPath)) return { ok: false, reason: 'SOURCE_ASSET_REQUIRED', detail: `LOGO_OVERLAY requiere "operationParams.LOGO_OVERLAY.logoPath" real (recibido: ${logoPath ?? 'ninguno'}).` };
    const posOverlay = { 'top-right': 'W-w-40:40', 'top-left': '40:40', 'bottom-right': 'W-w-40:H-h-40', 'bottom-left': '40:H-h-40' }[position] ?? 'W-w-40:40';
    const r = ejecutarPasoFfmpeg({
      ffmpegBin, ffprobeBin, inputPath, extraInputArgs: ['-i', logoPath],
      filterComplex: `[0:v][1:v]overlay=${posOverlay}[vout]`, mapArgs: ['-map', '[vout]', '-map', '0:a?'],
      necesitaReencodeVideo: true, necesitaReencodeAudio: necesitaReencodeAudioPrevio, outputProfile, outputPath,
    });
    return r.ok ? { ok: true, probe: r.probe } : { ok: false, reason: 'RENDER_FAILED', detail: r.error };
  }

  if (op === 'MUSIC_REPLACEMENT') {
    const { musicPath, musicVolume = 0.15, mode = 'mix' } = operationParams.MUSIC_REPLACEMENT ?? {};
    if (!musicPath || !existsSync(musicPath)) return { ok: false, reason: 'SOURCE_ASSET_REQUIRED', detail: `MUSIC_REPLACEMENT requiere "operationParams.MUSIC_REPLACEMENT.musicPath" real (recibido: ${musicPath ?? 'ninguno'}).` };
    const filterComplex = mode === 'replace'
      ? null
      : `[0:a]volume=1.0[a0];[1:a]volume=${musicVolume}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[aout]`;
    const r = ejecutarPasoFfmpeg({
      ffmpegBin, ffprobeBin, inputPath, extraInputArgs: ['-i', musicPath],
      filterComplex, mapArgs: mode === 'replace' ? ['-map', '0:v', '-map', '1:a', '-shortest'] : ['-map', '0:v', '-map', '[aout]'],
      necesitaReencodeVideo: false, necesitaReencodeAudio: true, outputProfile, outputPath,
    });
    return r.ok ? { ok: true, probe: r.probe } : { ok: false, reason: 'RENDER_FAILED', detail: r.error };
  }

  if (op === 'INTRO_OUTRO') {
    const { introPath = null, outroPath = null } = operationParams.INTRO_OUTRO ?? {};
    if (!introPath && !outroPath) return { ok: false, reason: 'SOURCE_ASSET_REQUIRED', detail: 'INTRO_OUTRO requiere al menos "introPath" u "outroPath" real.' };
    if (introPath && !existsSync(introPath)) return { ok: false, reason: 'SOURCE_ASSET_REQUIRED', detail: `INTRO_OUTRO: no existe introPath real "${introPath}".` };
    if (outroPath && !existsSync(outroPath)) return { ok: false, reason: 'SOURCE_ASSET_REQUIRED', detail: `INTRO_OUTRO: no existe outroPath real "${outroPath}".` };
    // Limitación real documentada: requiere que intro/outro ya compartan
    // codec/resolución/fps con el clip principal (concat demuxer stream-copy) --
    // no se reescala automáticamente aquí (ver docs/CONTENT_GENERATION_ENGINE.md).
    const partes = [introPath, inputPath, outroPath].filter(Boolean);
    return concatenarClipsReal(partes, outputPath, { ffmpegBin, ffprobeBin });
  }

  if (op === 'MULTI_SCENE_CONCAT') {
    // Generalización real de INTRO_OUTRO -- N clips reales ya renderizados
    // (uno por escena real del Scene Plan, ver
    // content-orchestrator/src/scenePlanner.js), en el orden real que
    // vienen. inputPath (el "clip principal" de runPostProduction) NUNCA
    // se usa aquí -- el master real es la concatenación de "scenePaths".
    const { scenePaths = [] } = operationParams.MULTI_SCENE_CONCAT ?? {};
    if (!Array.isArray(scenePaths) || scenePaths.length < 2) {
      return { ok: false, reason: 'SOURCE_ASSET_REQUIRED', detail: `MULTI_SCENE_CONCAT requiere "operationParams.MULTI_SCENE_CONCAT.scenePaths" real, con al menos 2 clips (recibido: ${scenePaths.length ?? 0}).` };
    }
    const faltante = scenePaths.find((p) => !existsSync(p));
    if (faltante) return { ok: false, reason: 'SOURCE_ASSET_REQUIRED', detail: `MULTI_SCENE_CONCAT: no existe el clip real de escena "${faltante}".` };
    return concatenarClipsReal(scenePaths, outputPath, { ffmpegBin, ffprobeBin });
  }

  return { ok: false, reason: 'NOT_IMPLEMENTED_YET', detail: `operación compleja desconocida "${op}".` };
}

/** Concatena N clips MP4 reales (video+audio, filter_complex concat -- nunca stream-copy silencioso que podría fallar en silencio con codecs distintos) en UN mp4 real. Compartido por INTRO_OUTRO y MULTI_SCENE_CONCAT -- nunca duplicado. */
function concatenarClipsReal(clipPaths, outputPath, { ffmpegBin, ffprobeBin }) {
  let filterInputs = '';
  clipPaths.forEach((_, i) => { filterInputs += `[${i}:v:0][${i}:a:0]`; });
  const filterComplex = `${filterInputs}concat=n=${clipPaths.length}:v=1:a=1[vout][aout]`;
  const args = ['-y'];
  for (const p of clipPaths) args.push('-i', p);
  args.push('-filter_complex', filterComplex, '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outputPath);
  const resultado = correr(ffmpegBin, args);
  if (resultado.status !== 0) return { ok: false, reason: 'RENDER_FAILED', detail: resultado.stderr || resultado.stdout };
  const probe = validarMp4ConFfprobe(outputPath, { ffprobeBin });
  return probe.ok ? { ok: true, probe } : { ok: false, reason: 'RENDER_FAILED', detail: probe.error };
}

/**
 * Backend real "local_ffmpeg". Aplica primero TODAS las operaciones SIMPLE
 * pedidas en un solo paso ffmpeg (evita recodificar varias veces), y luego
 * cada operación COMPLEX pedida como su propio paso encadenado (requiere
 * un input real adicional que una sola pasada -vf/-af no puede expresar
 * con la misma simplicidad). Nunca declara éxito sin volver a validar con
 * ffprobe real en cada paso.
 */
function runLocalFfmpegBackend({ inputPath, outputPath, outputProfile, operations, operationParams = {}, ffmpegBinDir = null }) {
  if (!existsSync(inputPath)) {
    return { status: 'ERROR', error: `runLocalFfmpegBackend: no existe el archivo de entrada real ${inputPath}.`, operationsApplied: [], operationsSkipped: operations };
  }

  const ffmpegBin = resolverBin(ffmpegBinDir, 'ffmpeg');
  const ffprobeBin = resolverBin(ffmpegBinDir, 'ffprobe');

  const simplesReconocidas = operations.filter((op) => SIMPLE_OPERATIONS.includes(op));
  const complejasReconocidas = operations.filter((op) => COMPLEX_OPERATIONS.includes(op));
  const reconocidas = [...simplesReconocidas, ...complejasReconocidas];
  const noReconocidas = operations.filter((op) => !SUPPORTED_OPERATIONS.includes(op));
  const operationsSkipped = noReconocidas.map((op) => ({
    operation: op,
    reason: UNSUPPORTED_LOCAL_OPERATIONS[op] ? 'UNSUPPORTED_LOCAL_OPERATION' : 'NOT_IMPLEMENTED_YET',
    detail: UNSUPPORTED_LOCAL_OPERATIONS[op] ?? null,
  }));

  let currentInput = inputPath;
  let currentOutput = simplesReconocidas.length > 0 || complejasReconocidas.length === 0 ? outputPath : `${outputPath}.step0.mp4`;
  const operationsApplied = [];
  const intermediateFiles = [];
  let ultimoProbe = null;
  let necesitaReencodeAudioAcumulado = false;

  if (simplesReconocidas.length > 0) {
    let filtros;
    try {
      filtros = construirFiltrosSimples(simplesReconocidas, { outputProfile, operationParams });
    } catch (err) {
      return { status: 'VALIDATION_FAILED', error: err.message, operationsApplied: [], operationsSkipped };
    }
    const r = ejecutarPasoFfmpeg({
      ffmpegBin, ffprobeBin, inputPath: currentInput, trimArgs: filtros.trimArgs,
      filtrosVideo: filtros.filtrosVideo, filtrosAudio: filtros.filtrosAudio,
      necesitaReencodeVideo: filtros.necesitaReencodeVideo, necesitaReencodeAudio: filtros.necesitaReencodeAudio,
      outputProfile, outputPath: currentOutput,
    });
    if (!r.ok) return { status: 'POSTPRODUCTION_FAILED', error: r.error, operationsApplied, operationsSkipped };
    operationsApplied.push(...simplesReconocidas);
    ultimoProbe = r.probe;
    necesitaReencodeAudioAcumulado = filtros.necesitaReencodeAudio;
    currentInput = currentOutput;
  }

  for (let i = 0; i < complejasReconocidas.length; i++) {
    const op = complejasReconocidas[i];
    const esUltima = i === complejasReconocidas.length - 1;
    const pasoOutput = esUltima ? outputPath : `${outputPath}.step${i + 1}.mp4`;
    const r = ejecutarOperacionCompleja(op, {
      inputPath: currentInput, outputPath: pasoOutput, operationParams, ffmpegBin, ffprobeBin,
      necesitaReencodeAudioPrevio: necesitaReencodeAudioAcumulado, outputProfile,
    });
    if (!r.ok) {
      operationsSkipped.push({ operation: op, reason: r.reason, detail: r.detail });
      continue; // una operación compleja sin asset real no bloquea las demás -- se reporta y se sigue.
    }
    operationsApplied.push(op);
    ultimoProbe = r.probe;
    if (currentInput !== inputPath) intermediateFiles.push(currentInput);
    currentInput = pasoOutput;
  }

  // Si ninguna operación simple/compleja real se aplicó (ej. todas las
  // pedidas eran NOT_IMPLEMENTED_YET/UNSUPPORTED_LOCAL_OPERATION, o cada
  // COMPLEX requería un asset real que no llegó), el archivo de entrada se
  // copia sin cambios -- un resultado PARTIAL válido (archivo real
  // entregado, cambios reales no aplicados), nunca un error fabricado.
  if (currentInput !== outputPath) {
    if (!existsSync(currentInput)) {
      return { status: 'POSTPRODUCTION_FAILED', error: 'runLocalFfmpegBackend: no se produjo ningún archivo de salida real.', operationsApplied, operationsSkipped };
    }
    copyFileSync(currentInput, outputPath);
    // Solo se marca para limpieza si es un archivo intermedio REAL creado
    // por esta función (un *.stepN.mp4 propio) -- nunca el inputPath
    // original del llamador. Bug real corregido: antes, cuando ninguna
    // operación aplicaba, currentInput seguía siendo el inputPath original
    // y terminaba borrado por el unlinkSync de más abajo.
    if (currentInput !== inputPath) intermediateFiles.push(currentInput);
    ultimoProbe = validarMp4ConFfprobe(outputPath, { ffprobeBin });
    if (!ultimoProbe.ok) {
      return { status: 'POSTPRODUCTION_FAILED', error: `postproducción produjo un archivo inválido: ${ultimoProbe.error}`, operationsApplied, operationsSkipped };
    }
  }

  for (const f of intermediateFiles) { try { unlinkSync(f); } catch { /* limpieza best-effort */ } }

  return {
    status: operationsSkipped.length > 0 ? 'PARTIAL' : 'COMPLETADO',
    outputPath,
    probe: ultimoProbe,
    operationsApplied,
    operationsSkipped,
  };
}

const BACKEND_IMPLEMENTATIONS = Object.freeze({
  local_ffmpeg: runLocalFfmpegBackend,
});

/**
 * Interfaz abstracta de postproducción (Parte 10). Firma estable: cambiar
 * `backend` cambia la implementación sin cambiar cómo se llama esta
 * función ni cómo Creative Intelligence/HyperFrames se conectan a ella.
 *
 * @param {{
 *   inputAssetPackage?: object, visualProductionPackage?: object,
 *   inputPath: string, outputPath: string, outputProfile: object,
 *   operations: string[], operationParams?: object, backend?: string, ffmpegBinDir?: string,
 * }} args
 */
export function runPostProduction({ inputPath, outputPath, outputProfile, operations, operationParams = {}, backend = 'local_ffmpeg', ffmpegBinDir = null }) {
  if (!POSTPRODUCTION_BACKENDS.includes(backend)) {
    throw new Error(`runPostProduction: backend desconocido "${backend}" (válidos: ${POSTPRODUCTION_BACKENDS.join(', ')}).`);
  }
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error('runPostProduction: "operations" debe ser un arreglo no vacío.');
  }
  if (!outputProfile) throw new Error('runPostProduction: "outputProfile" es obligatorio (ver outputProfiles.js).');

  const impl = BACKEND_IMPLEMENTATIONS[backend];
  return impl({ inputPath, outputPath, outputProfile, operations, operationParams, ffmpegBinDir });
}
