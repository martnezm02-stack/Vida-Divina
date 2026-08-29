// voiceEngineClient.js — capa real hacia el Voice Engine existente
// (voice-engine/, servicio FastAPI). NO crea un segundo motor de voz.
//
// Dos capacidades reales:
//  1. listExistingAudioAssets() -- lee los WAV reales ya generados y
//     conservados en video-production/_audio-cache/ (curados, no el
//     volcado completo de experimentos), con su duración real leída del
//     propio header WAV (reutiliza leerInfoWav() de
//     tts-text-preprocessor/src/audioAssetAdapter.js, sin duplicarla).
//  2. generateNewVoiceover() -- llama de verdad a POST /v1/speak. Si el
//     servicio no está corriendo, se reporta un error real y honesto
//     (nunca un audio simulado) -- ver docs/CONTENT_GENERATION_ENGINE.md
//     y el hallazgo de esta fase: el servicio no estaba activo en este
//     entorno al momento de esta implementación.

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { leerInfoWav, wslPathToWindowsUNC } from '../../../tts-text-preprocessor/src/audioAssetAdapter.js';
import { leerArchivoConReintentos } from '../../../content-orchestrator/src/assetPackage.js';
import { PROJECT_ROOT } from './safePaths.js';

const AUDIO_CACHE_DIR = join(PROJECT_ROOT, 'video-production', '_audio-cache');
const VOICE_ENGINE_BASE_URL = process.env.VOICE_ENGINE_URL ?? 'http://localhost:8000';
// Leída en cada llamada (nunca cacheada en una const de módulo): las
// importaciones estáticas de ESM se evalúan antes que el resto de
// index.js, así que una const de nivel de módulo capturaría el fallback
// ANTES de que loadIntegrationEnv() cargue voice-engine/.env. Mismo
// default de desarrollo local ya documentado en voice-engine/app/config.py
// -- nunca un secreto real de producción, y nunca se expone al frontend.
function voiceEngineApiKey() {
  return process.env.VOICE_ENGINE_API_KEY ?? 'dev-local-only-change-me';
}
// Mismo usuario WSL ya usado en el resto del proyecto (tts-text-preprocessor/,
// scripts reales de fases anteriores) -- Voice Engine nunca devuelve una ruta
// absoluta de servidor (por diseño de seguridad, ver voice-engine/README.md),
// solo el nombre del archivo; el directorio real (voice-engine/app/config.py#OUTPUT_DIR)
// es "~/vida-divina-voice-engine-data/output/" dentro de esa misma distro.
const VOICE_ENGINE_WSL_USER = process.env.VOICE_ENGINE_WSL_USER ?? 'manuel1974';
const VOICE_ENGINE_WSL_OUTPUT_DIR = `/home/${VOICE_ENGINE_WSL_USER}/vida-divina-voice-engine-data/output`;

/** Lista los Audio Assets reales ya generados y disponibles para reutilizar en CREATE, con duración real leída del WAV. */
export function listExistingAudioAssets() {
  let archivos = [];
  try {
    archivos = readdirSync(AUDIO_CACHE_DIR).filter((f) => extname(f).toLowerCase() === '.wav');
  } catch {
    return [];
  }
  return archivos.map((f) => {
    const filePath = join(AUDIO_CACHE_DIR, f);
    const stat = statSync(filePath);
    let durationSeconds = null;
    try {
      const info = leerInfoWav(filePath);
      durationSeconds = info.duracionSegundos ?? info.durationSeconds ?? null;
    } catch { /* WAV real pero header no parseable con este lector mínimo -- se reporta sin duración, nunca inventada. */ }
    return { filename: f, path: filePath, fileSizeBytes: stat.size, durationSeconds };
  });
}

/** Verifica en vivo si el Voice Engine real está corriendo -- nunca asume que sí. */
export async function isVoiceEngineReachable() {
  try {
    // Ruta real confirmada en voice-engine/app/api/health.py: "/health", sin prefijo "/v1" (ese prefijo solo existe en "/v1/speak").
    const res = await fetch(`${VOICE_ENGINE_BASE_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

// DEFAULT_VOICE_PARAMS (Corrección "Consistencia de audio y persistencia
// de ediciones de captions", 2026-08-29, Paso 2/7 del encargo): ÚNICA
// fuente real centralizada de los parámetros reales de voz que Voice
// Engine SÍ soporta (ver voice-engine/app/api/speak.py#SpeakRequest --
// nunca "speed"/"pitch"/"seed", el proveedor real no los expone, Paso 2:
// "no inventar parámetros que el proveedor no soporte"). Antes, estos
// valores vivían implícitos como defaults de argumento en
// generateNewVoiceover() -- ahora son explícitos y reutilizables, para
// que una regeneración real de escena pueda declarar "mismos parámetros
// reales que la producción original" en vez de depender en silencio de
// que nadie los cambie.
export const DEFAULT_VOICE_PARAMS = Object.freeze({
  voiceProfileId: 'manuel_es_mx', language: 'es', exaggeration: 0.5, cfgWeight: 0.5, temperature: 0.8,
});

/**
 * Genera un voiceover REAL nuevo vía el Voice Engine ya existente. Si el
 * servicio no responde, lanza con un mensaje real y accionable -- nunca
 * fabrica un audio ni un resultado simulado.
 *
 * voiceParams (Paso 2/7 del encargo): real, opcional -- por defecto
 * DEFAULT_VOICE_PARAMS (comportamiento preexistente intacto). Un
 * llamador real (ej. "Regenerar voz" de una escena ya existente) puede
 * pasar los MISMOS parámetros reales ya usados por esa escena
 * (scene.voiceTrack.voiceParams) para conservar identidad de voz real
 * consistente -- nunca varía en silencio entre la producción original y
 * una regeneración real.
 */
export async function generateNewVoiceover({ text, voiceParams = {} }) {
  if (!text?.trim()) throw new Error('generateNewVoiceover: "text" es obligatorio.');
  const {
    voiceProfileId = DEFAULT_VOICE_PARAMS.voiceProfileId, language = DEFAULT_VOICE_PARAMS.language,
    exaggeration = DEFAULT_VOICE_PARAMS.exaggeration, cfgWeight = DEFAULT_VOICE_PARAMS.cfgWeight,
    temperature = DEFAULT_VOICE_PARAMS.temperature,
  } = voiceParams;
  let res;
  try {
    res = await fetch(`${VOICE_ENGINE_BASE_URL}/v1/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': voiceEngineApiKey() },
      body: JSON.stringify({
        text, language, voice_profile_id: voiceProfileId, exaggeration, cfg_weight: cfgWeight, temperature,
      }),
      signal: AbortSignal.timeout(600_000), // la generación real puede tardar varios minutos.
    });
  } catch (err) {
    throw new Error(`generateNewVoiceover: Voice Engine no está disponible en ${VOICE_ENGINE_BASE_URL} (${err.message}). Inícialo con "uvicorn app.main:app" dentro de voice-engine/ para generar audio nuevo, o usa un Audio Asset ya existente.`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`generateNewVoiceover: Voice Engine respondió ${res.status}: ${detail}`);
  }
  const body = await res.json();

  // Traduce el output_filename real (nunca una ruta absoluta -- por diseño
  // de seguridad del propio Voice Engine) a la ruta real accesible desde
  // Windows, y lee su duración real del header WAV. Si el archivo no
  // aparece donde se espera (ej. VOICE_ENGINE_WSL_USER real distinto),
  // se reporta explícitamente en vez de inventar una ruta.
  const wslPath = `${VOICE_ENGINE_WSL_OUTPUT_DIR}/${body.output_filename}`;
  const windowsPath = wslPathToWindowsUNC(wslPath);
  if (!existsSync(windowsPath)) {
    throw new Error(`generateNewVoiceover: Voice Engine generó "${body.output_filename}" pero no se encontró en la ruta real esperada (${windowsPath}) -- revisa VOICE_ENGINE_WSL_USER si tu usuario de WSL es distinto de "${VOICE_ENGINE_WSL_USER}".`);
  }
  // Auditoría "Video Workspace + Voice Engine" (2026-08-23): existsSync()
  // puede pasar y una lectura real fallar de todos modos sobre una ruta
  // UNC de WSL2 recién escrita (mount no estabilizado / archivo aún
  // liberándose del lado WSL). Confirma con reintentos acotados ANTES de
  // devolver esta ruta como si ya fuera un Audio Asset listo -- si nunca
  // se estabiliza, lanza aquí (con contexto real), nunca deja pasar una
  // ruta que el resto del pipeline creerá lista y fallará más adelante.
  leerArchivoConReintentos(windowsPath, 'AUDIO_VOICE');
  let durationSeconds = null;
  try {
    const info = leerInfoWav(windowsPath);
    durationSeconds = info.duracionSegundos ?? info.durationSeconds ?? null;
  } catch { /* WAV real pero header no parseable -- se reporta sin duración, nunca inventada. */ }

  // resolvedVoiceParams (Paso 2/7 del encargo): los parámetros reales
  // EFECTIVAMENTE usados en esta llamada real (defaults ya resueltos,
  // nunca los valores crudos del llamador que podrían venir undefined) --
  // el llamador los persiste en scene.voiceTrack.voiceParams para que la
  // PRÓXIMA regeneración real de esta MISMA escena los reutilice tal
  // cual (Paso 2: "conservar los mismos parámetros de voz").
  return {
    ...body,
    resolvedPath: windowsPath,
    durationSeconds,
    resolvedVoiceParams: Object.freeze({
      voiceProfileId, language, exaggeration, cfgWeight, temperature,
    }),
  };
}

export { VOICE_ENGINE_BASE_URL };
