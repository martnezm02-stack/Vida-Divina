// mediaInspector.js — Commercial Media: validación de archivo real +
// duración/resolución (encargo §20, §21, §22). Reutiliza ffprobe/ffmpeg ya
// instalados y usados en todo el proyecto -- para MP4 reutiliza
// validarMp4ConFfprobe() (video-production/src/hyperframesRenderer.js) tal
// cual, sin reimplementarlo; para audio (sin stream de video, esa función
// lo rechaza) usa el mismo binario/spawn real (correr(), también
// reutilizado) con un comando ffprobe reducido propio.

import { existsSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { validarMp4ConFfprobe, correr } from '../../video-production/src/hyperframesRenderer.js';

const MIME_BY_EXTENSION = Object.freeze({
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
});

const VIDEO_EXTENSIONS = Object.freeze(['.mp4']);
const AUDIO_EXTENSIONS = Object.freeze(['.mp3', '.m4a', '.ogg', '.opus', '.aac', '.wav']);
const IMAGE_EXTENSIONS = Object.freeze(['.jpg', '.jpeg', '.png']);
export const SUPPORTED_EXTENSIONS = Object.freeze([...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS, ...IMAGE_EXTENSIONS]);

// §54 (futuro): PDF/documentos NO se soportan todavía -- fuera de
// SUPPORTED_EXTENSIONS a propósito, nunca se valida un tipo no soportado
// como si lo fuera.
const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200MB -- límite real generoso para video comercial corto, evita registrar accidentalmente un archivo corrupto/gigante.

export function mediaKindForExtension(ext) {
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  return null;
}

/**
 * Valida un archivo real (§20): existe, extensión soportada, tamaño
 * razonable. Nunca lanza -- devuelve { valid, errors, ext, kind, mimeType,
 * fileSizeBytes }, quien llama decide qué hacer con errores.
 */
export function validateMediaFile(filePath) {
  const errors = [];
  if (!existsSync(filePath)) {
    return { valid: false, errors: [`el archivo no existe: ${filePath}`], ext: null, kind: null, mimeType: null, fileSizeBytes: null };
  }
  const stat = statSync(filePath);
  if (!stat.isFile()) errors.push('la ruta no es un archivo real.');

  const ext = extname(filePath).toLowerCase();
  const kind = mediaKindForExtension(ext);
  if (!kind) errors.push(`extensión "${ext}" no soportada todavía (soportadas: ${SUPPORTED_EXTENSIONS.join(', ')}).`);

  const mimeType = MIME_BY_EXTENSION[ext] ?? null;
  if (stat.isFile() && stat.size === 0) errors.push('el archivo real está vacío (0 bytes).');
  if (stat.isFile() && stat.size > MAX_FILE_SIZE_BYTES) errors.push(`el archivo real excede el tamaño máximo soportado (${MAX_FILE_SIZE_BYTES} bytes).`);

  return {
    valid: errors.length === 0,
    errors,
    ext,
    kind,
    mimeType,
    fileSizeBytes: stat.isFile() ? stat.size : null,
  };
}

function probeAudioDuration(filePath, ffprobeBin) {
  const r = correr(ffprobeBin, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', filePath]);
  if (r.status !== 0) return { ok: false, error: `ffprobe falló (exit ${r.status}) al leer audio: ${r.stderr}` };
  try {
    const parsed = JSON.parse(r.stdout);
    const durationSeconds = Number(parsed.format?.duration);
    return { ok: true, durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null };
  } catch (e) {
    return { ok: false, error: `no se pudo parsear la salida de ffprobe: ${e.message}` };
  }
}

/**
 * Duración/resolución reales (§21, §22) -- solo cuando aplica (video/audio;
 * imagen no tiene duración). Nunca lanza: si ffprobe falla, se devuelve
 * durationSeconds:null con el error explícito, la clasificación sigue
 * (§20 trata esto como "mejor esfuerzo", no un bloqueo del registro).
 */
export function probeMediaFile(filePath, kind, { ffprobeBin = 'ffprobe' } = {}) {
  if (kind === 'video') {
    const probe = validarMp4ConFfprobe(filePath, { ffprobeBin });
    if (!probe.ok) return { durationSeconds: null, width: null, height: null, probeError: probe.error };
    return { durationSeconds: probe.videoDurationSeconds ?? null, width: probe.width ?? null, height: probe.height ?? null, probeError: null };
  }
  if (kind === 'audio') {
    const probe = probeAudioDuration(filePath, ffprobeBin);
    if (!probe.ok) return { durationSeconds: null, width: null, height: null, probeError: probe.error };
    return { durationSeconds: probe.durationSeconds, width: null, height: null, probeError: null };
  }
  return { durationSeconds: null, width: null, height: null, probeError: null }; // imagen: sin duración/resolución de video real.
}
