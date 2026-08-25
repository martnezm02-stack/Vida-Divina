// musicProvider.js — Creative Production Orchestrator (2026-08-24).
// Abstracción real de música de fondo -- MISMO criterio que
// voiceEngineClient.js#listExistingAudioAssets() para audio existente: una
// biblioteca curada real en disco (video-production/_music-library/),
// nunca música protegida sin control, nunca un archivo fabricado. Sin
// pistas reales todavía en este entorno -- se reporta explícitamente
// (NO_TRACK_AVAILABLE), nunca se inventa una.

import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resuelto relativo a ESTE archivo (content-orchestrator/src/), nunca
// importando de dashboard/ (violaría la capa: dashboard consume
// content-orchestrator, nunca al revés) -- mismo criterio que el resto
// del proyecto para ubicar video-production/ desde aquí.
export const MUSIC_LIBRARY_DIR = fileURLToPath(new URL('../../video-production/_music-library', import.meta.url));
export const MUSIC_PROVIDER_STATUSES = Object.freeze(['SUCCESS', 'NO_TRACK_AVAILABLE']);

/**
 * Lista pistas reales curadas, con su metadata de licencia si existe un
 * archivo real "<mismo-nombre>.license.json" junto a la pista (nunca se
 * inventa una licencia si ese archivo no existe -- license queda null,
 * explícito, para que el llamador decida si puede usarla igual).
 */
export function listMusicLibrary() {
  if (!existsSync(MUSIC_LIBRARY_DIR)) return [];
  const archivos = readdirSync(MUSIC_LIBRARY_DIR).filter((f) => ['.mp3', '.wav', '.m4a'].includes(extname(f).toLowerCase()));
  return archivos.map((f) => {
    const filePath = join(MUSIC_LIBRARY_DIR, f);
    const licensePath = join(MUSIC_LIBRARY_DIR, `${basename(f, extname(f))}.license.json`);
    let license = null;
    if (existsSync(licensePath)) {
      try { license = JSON.parse(readFileSync(licensePath, 'utf8')); } catch { license = null; }
    }
    return { filename: f, path: filePath, fileSizeBytes: statSync(filePath).size, license };
  });
}

/**
 * Selecciona UNA pista real determinista para una escena/pieza real.
 *
 * Editable Video Project (2026-08-24): ahora es real content-aware por
 * `mood` -- si se pide un mood real y existe al menos una pista real con
 * licencia real conocida que lo declare (`license.mood`), se prioriza esa;
 * si no, cae de forma determinista a la primera pista real CON LICENCIA
 * CONOCIDA de la biblioteca (nunca una sin `license` real -- "NO incluyas
 * música con licencia desconocida" es una regla dura, no solo una
 * preferencia). El usuario siempre puede sobre-escribir explícitamente
 * pasando `trackFilename` (ver editableVideoProject.js/projectEditor.js),
 * que este provider respeta igual, con la misma validación de licencia.
 */
export function selectMusicTrack({ mood = null, trackFilename = null } = {}) {
  const tracks = listMusicLibrary().filter((t) => t.license); // nunca se ofrece una pista sin licencia real conocida.
  if (tracks.length === 0) {
    return Object.freeze({
      status: 'NO_TRACK_AVAILABLE',
      track: null,
      reason: `musicProvider: no hay pistas reales CON LICENCIA CONOCIDA en ${MUSIC_LIBRARY_DIR} -- ninguna música de fondo real disponible todavía en este entorno (nunca se usa una pista de licencia desconocida).`,
    });
  }
  if (trackFilename) {
    const elegida = tracks.find((t) => t.filename === trackFilename);
    if (!elegida) {
      return Object.freeze({
        status: 'NO_TRACK_AVAILABLE',
        track: null,
        reason: `musicProvider: "${trackFilename}" no existe en la biblioteca real, o existe sin licencia conocida.`,
      });
    }
    return Object.freeze({ status: 'SUCCESS', track: Object.freeze(elegida), reason: null, moodRequested: mood });
  }
  const porMood = mood ? tracks.find((t) => t.license?.mood === mood) : null;
  const elegida = porMood ?? tracks[0];
  return Object.freeze({ status: 'SUCCESS', track: Object.freeze(elegida), reason: null, moodRequested: mood });
}
