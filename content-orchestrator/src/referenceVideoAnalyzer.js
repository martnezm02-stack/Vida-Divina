// referenceVideoAnalyzer.js — Adaptar contenido / Video de referencia
// (2026-08-26). Extrae la ESTRUCTURA técnica real de un video de referencia
// (duración, formato, escenas, ritmo, silencios, keyframes) usando
// EXCLUSIVAMENTE ffprobe/ffmpeg, ya instalados y ya usados en todo el
// proyecto (video-production/src/hyperframesRenderer.js) -- nunca un
// proveedor de IA nuevo, nunca OpenMontage.
//
// REGLA CENTRAL: lo que no se puede medir de forma determinista con
// ffprobe/ffmpeg en este entorno (transcripción, hook/CTA/estructura
// narrativa semántica, texto en pantalla, estilo de captions, presencia de
// producto/persona/música/voz) se reporta EXPLÍCITAMENTE como no
// disponible -- nunca se inventa ni se aproxima con una heurística débil.
// Mismo criterio ya usado en postProduction.js#UNSUPPORTED_LOCAL_OPERATIONS.
//
// Este módulo SOLO produce el ReferenceAnalysis real (evidencia técnica).
// NUNCA genera guion/hook/CTA/voiceover -- eso sigue siendo,
// exclusivamente, el Creative Strategy Engine real ya existente
// (hypothesisCreativeEngine.js), que nunca se sustituye ni se duplica.

import { existsSync, mkdirSync, copyFileSync, statSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, extname } from 'node:path';
import { correr, validarMp4ConFfprobe } from '../../video-production/src/hyperframesRenderer.js';

const NOT_AVAILABLE_REASON_NO_TRANSCRIPTION = 'No disponible en este entorno -- requiere un proveedor de transcripción (speech-to-text) que no está instalado (mismo criterio ya documentado para AUTO_SUBTITLE_GENERATION en postProduction.js).';
const NOT_AVAILABLE_REASON_NO_VISION = 'No disponible en este entorno -- requiere reconocimiento visual/OCR (texto en pantalla, presencia de producto/persona, estilo de captions) que no está instalado.';

/** Hash real de contenido del archivo -- mismo criterio content-addressed ya usado en assetLineage.js#hashFile. */
export function hashReferenceFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/**
 * Copia el video de referencia real a una carpeta contenida y
 * content-addressed (nunca lee/reescribe el archivo original del usuario,
 * nunca acumula duplicados del mismo video -- si el hash ya existe, es un
 * no-op idempotente).
 */
export function ingestReferenceVideo(sourcePath, { referenceDir }) {
  if (!sourcePath?.trim()) throw new Error('ingestReferenceVideo: "sourcePath" es obligatorio.');
  if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
    throw new Error(`ingestReferenceVideo: no existe ningún archivo real en "${sourcePath}".`);
  }
  const referenceId = hashReferenceFile(sourcePath);
  const dir = join(referenceDir, referenceId);
  const destPath = join(dir, `original${extname(sourcePath) || '.mp4'}`);
  if (!existsSync(destPath)) {
    mkdirSync(dir, { recursive: true });
    copyFileSync(sourcePath, destPath);
  }
  return { referenceId, path: destPath, dir };
}

function simplifiedAspectRatio(width, height) {
  if (!width || !height) return null;
  function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
  const d = gcd(width, height);
  return `${width / d}:${height / d}`;
}

/**
 * Detección real de cortes de escena vía el filtro `scene` de ffmpeg
 * (mismo binario ya usado en todo el proyecto) -- ningún modelo nuevo.
 * Devuelve los timestamps reales (segundos) donde ffmpeg detecta un
 * cambio de escena significativo.
 */
function detectSceneCuts(videoPath, { ffmpegBin, threshold = 0.35 }) {
  const r = correr(ffmpegBin, [
    '-i', videoPath, '-filter:v', `select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-',
  ]);
  const salida = `${r.stdout}\n${r.stderr}`;
  const timestamps = [...salida.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
  return [...new Set(timestamps)].sort((a, b) => a - b);
}

/** Detección real de silencios vía el filtro `silencedetect` de ffmpeg. */
function detectSilences(videoPath, { ffmpegBin, noiseDb = -30, minDurationSeconds = 0.5 }) {
  const r = correr(ffmpegBin, [
    '-i', videoPath, '-af', `silencedetect=noise=${noiseDb}dB:d=${minDurationSeconds}`, '-f', 'null', '-',
  ]);
  const salida = r.stderr ?? '';
  const silences = [];
  const starts = [...salida.matchAll(/silence_start:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...salida.matchAll(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g)];
  for (let i = 0; i < starts.length; i += 1) {
    const end = ends[i];
    silences.push({ startSeconds: starts[i], endSeconds: end ? Number(end[1]) : null, durationSeconds: end ? Number(end[2]) : null });
  }
  return silences;
}

/** Extrae UN frame JPEG real en el segundo indicado -- keyframe representativo de una escena, nunca inventado. */
function extractKeyframe(videoPath, timeSeconds, outputPath, { ffmpegBin }) {
  const r = correr(ffmpegBin, ['-ss', String(Math.max(0, timeSeconds)), '-i', videoPath, '-frames:v', '1', '-q:v', '4', '-y', outputPath]);
  return r.status === 0 && existsSync(outputPath);
}

/**
 * Construye las escenas reales (a partir de los cortes reales detectados +
 * inicio/fin del video) y el ritmo real (pacing) derivado exclusivamente de
 * esos timestamps -- ninguna interpretación semántica, solo aritmética
 * sobre evidencia real.
 */
function buildScenesAndPacing(sceneCuts, totalDurationSeconds) {
  const boundaries = [0, ...sceneCuts.filter((t) => t > 0.05 && t < totalDurationSeconds - 0.05), totalDurationSeconds];
  const uniqueBoundaries = [...new Set(boundaries.map((b) => Math.round(b * 100) / 100))].sort((a, b) => a - b);
  const rawScenes = [];
  for (let i = 0; i < uniqueBoundaries.length - 1; i += 1) {
    const startSeconds = uniqueBoundaries[i];
    const endSeconds = uniqueBoundaries[i + 1];
    if (endSeconds - startSeconds < 0.15) continue; // corte real espurio, demasiado corto para ser una escena
    rawScenes.push({ startSeconds, endSeconds, durationSeconds: Math.round((endSeconds - startSeconds) * 100) / 100 });
  }
  if (rawScenes.length === 0) rawScenes.push({ startSeconds: 0, endSeconds: totalDurationSeconds, durationSeconds: totalDurationSeconds });

  // Posición estructural real (aritmética sobre el conteo final de escenas,
  // nunca semántica) -- rule 2/8: "estructura de escenas", no "de qué habla
  // cada escena". Se calcula DESPUÉS de conocer cuántas escenas reales
  // quedaron (nunca inline durante la construcción, para que un video de
  // una sola escena real se etiquete "ÚNICA" y no "APERTURA").
  const scenes = rawScenes.map((s, i) => ({
    sceneIndex: i,
    ...s,
    position: rawScenes.length === 1 ? 'ÚNICA' : (i === 0 ? 'APERTURA' : (i === rawScenes.length - 1 ? 'CIERRE' : 'DESARROLLO')),
  }));
  const avgSceneDurationSeconds = scenes.reduce((sum, s) => sum + s.durationSeconds, 0) / scenes.length;
  const cutsPerMinute = totalDurationSeconds > 0 ? Math.round(((scenes.length - 1) / totalDurationSeconds) * 60 * 10) / 10 : 0;
  const rhythm = avgSceneDurationSeconds <= 1.5 ? 'MUY_RAPIDO' : avgSceneDurationSeconds <= 3 ? 'RAPIDO' : avgSceneDurationSeconds <= 6 ? 'MODERADO' : 'PAUSADO';
  return {
    scenes,
    pacing: { sceneCount: scenes.length, avgSceneDurationSeconds: Math.round(avgSceneDurationSeconds * 100) / 100, cutsPerMinute, rhythm },
  };
}

/**
 * Análisis real completo de un video de referencia ya ingerido
 * (ingestReferenceVideo()). Nunca lanza sobre campos que no se pueden medir
 * -- los reporta como { available:false, reason }.
 *
 * @returns {object} ReferenceAnalysis real (ver contrato en referenceAnalysisStore.js).
 */
export function analyzeReferenceVideo({ referenceId, videoPath, referenceDir, ffmpegBinDir }) {
  const ffmpegBin = ffmpegBinDir ? join(ffmpegBinDir, 'ffmpeg.exe') : 'ffmpeg';
  const ffprobeBin = ffmpegBinDir ? join(ffmpegBinDir, 'ffprobe.exe') : 'ffprobe';

  const probe = validarMp4ConFfprobe(videoPath, { ffprobeBin });
  if (!probe.ok) throw new Error(`analyzeReferenceVideo: ffprobe no pudo leer "${videoPath}" -- ${probe.error}`);

  const totalDurationSeconds = probe.videoDurationSeconds;
  const sceneCuts = detectSceneCuts(videoPath, { ffmpegBin });
  const { scenes, pacing } = buildScenesAndPacing(sceneCuts, totalDurationSeconds);
  const silences = probe.hasAudio ? detectSilences(videoPath, { ffmpegBin }) : [];

  const keyframesDir = join(referenceDir, referenceId, 'keyframes');
  mkdirSync(keyframesDir, { recursive: true });
  const keyframes = [];
  for (const scene of scenes) {
    const midpoint = scene.startSeconds + (scene.durationSeconds / 2);
    const outputPath = join(keyframesDir, `scene-${scene.sceneIndex + 1}.jpg`);
    if (extractKeyframe(videoPath, midpoint, outputPath, { ffmpegBin })) {
      keyframes.push({ sceneIndex: scene.sceneIndex, timeSeconds: Math.round(midpoint * 100) / 100, path: outputPath });
    }
  }

  const notAvailable = (reason) => ({ available: false, reason });

  return Object.freeze({
    referenceId,
    source: { originalPath: videoPath },
    duration: totalDurationSeconds,
    aspectRatio: simplifiedAspectRatio(probe.width, probe.height),
    width: probe.width,
    height: probe.height,
    fps: probe.fps,
    // Semántico -- requiere transcripción real (no instalada en este entorno). Nunca se inventa.
    transcript: notAvailable(NOT_AVAILABLE_REASON_NO_TRANSCRIPTION),
    hook: notAvailable(NOT_AVAILABLE_REASON_NO_TRANSCRIPTION),
    cta: notAvailable(NOT_AVAILABLE_REASON_NO_TRANSCRIPTION),
    // Estructural real (aritmética sobre cortes de escena reales) -- nunca una interpretación de "de qué trata" cada escena.
    scenes: Object.freeze(scenes),
    pacing: Object.freeze(pacing),
    narrativeStructure: Object.freeze(scenes.map((s) => s.position)),
    audioStructure: Object.freeze({
      hasAudio: probe.hasAudio,
      audioDurationSeconds: probe.audioDurationSeconds,
      silences: Object.freeze(silences),
      // Distinguir voz/música real requeriría clasificación de audio -- no instalada.
      musicDetected: notAvailable(NOT_AVAILABLE_REASON_NO_VISION),
      voiceDetected: notAvailable(NOT_AVAILABLE_REASON_NO_VISION),
    }),
    visibleText: notAvailable(NOT_AVAILABLE_REASON_NO_VISION),
    captionStyle: notAvailable(NOT_AVAILABLE_REASON_NO_VISION),
    productPresence: notAvailable(NOT_AVAILABLE_REASON_NO_VISION),
    personPresence: notAvailable(NOT_AVAILABLE_REASON_NO_VISION),
    keyframes: Object.freeze(keyframes),
    analyzedAt: new Date().toISOString(),
  });
}
