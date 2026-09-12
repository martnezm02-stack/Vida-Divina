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
import http from 'node:http';
import { leerInfoWav, wslPathToWindowsUNC } from '../../../tts-text-preprocessor/src/audioAssetAdapter.js';
import { leerArchivoConReintentos } from '../../../content-orchestrator/src/assetPackage.js';
import { PROJECT_ROOT } from './safePaths.js';

const AUDIO_CACHE_DIR = join(PROJECT_ROOT, 'video-production', '_audio-cache');
// Default 127.0.0.1 (no localhost): en esta máquina "localhost" resuelve
// ::1 antes que 127.0.0.1, y WSL2 no reenvía IPv6 loopback para este puerto
// -- el fallback a IPv4 añade un margen medido en ~2.2s en esta máquina
// (ver start-vida-divina.ps1#Get-VoiceEngineHealth), suficiente para tumbar
// el preflight de 2s de isVoiceEngineReachable(). 127.0.0.1 se salta la
// resolución DNS por completo. Diagnóstico real, 2026-09-08.
const VOICE_ENGINE_BASE_URL = process.env.VOICE_ENGINE_URL ?? 'http://127.0.0.1:8000';
// Leída en cada llamada (nunca cacheada en una const de módulo): las
// importaciones estáticas de ESM se evalúan antes que el resto de
// index.js, así que una const de nivel de módulo capturaría el fallback
// ANTES de que loadIntegrationEnv() cargue voice-engine/.env. Mismo
// default de desarrollo local ya documentado en voice-engine/app/config.py
// -- nunca un secreto real de producción, y nunca se expone al frontend.
function voiceEngineApiKey() {
  return process.env.VOICE_ENGINE_API_KEY ?? 'dev-local-only-change-me';
}

// httpPostJson (hallazgo real, 2026-09-09, segunda vuelta): la generación
// larga seguía fallando con "fetch failed" incluso con reintento -- una
// traza real con node:http mostró que fetch()/undici NO activa keepalive
// TCP a nivel de socket para una petición en curso. Durante los ~30-60s+
// (a veces varios minutos con textos largos o el motor ocupado) en que
// Chatterbox genera sin enviar ni un byte de vuelta, el puente de reenvío
// de localhost de WSL2 (wslrelay.exe) trata esa conexión como inactiva y
// la corta -- silenciosamente, sin RST inmediato visible del lado Node,
// por eso el error tardaba minutos en aparecer en vez de fallar rápido.
// Sustituye fetch() por node:http puro SOLO para esta llamada real, para
// poder activar socket.setKeepAlive(true, ...) -- sondas TCP periódicas
// que mantienen la conexión "viva" ante wslrelay mientras Voice Engine
// sigue computando en silencio. Nunca cambia el contrato HTTP real (mismo
// método, headers, body, código de estado) -- solo el transporte.
function httpPostJson(url, bodyObj, { headers = {}, timeoutMs = 600_000 } = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(bodyObj);
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr), ...headers },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            text: async () => text,
            json: async () => JSON.parse(text),
          });
        });
        res.on('error', reject);
      }
    );
    // Sonda TCP cada 15s sobre el socket real -- ver comentario de arriba.
    // No interfiere con la petición/respuesta real: son paquetes vacíos de
    // nivel TCP, transparentes para HTTP y para Voice Engine. Confirmado en
    // producción (2026-09-09): una generación real de 691 caracteres tardó
    // 269s completamente en silencio en el cable y completó sin cortes.
    req.on('socket', (socket) => socket.setKeepAlive(true, 15_000));
    req.on('timeout', () => req.destroy(new Error(`timeout tras ${timeoutMs}ms sin respuesta`)));
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// postConReintentoSeguro (Fase 4, hallazgo 2026-09-09): el retry anterior
// (fetchConReintento) reintentaba la petición completa ante CUALQUIER
// fallo de red, sin importar cuánto tiempo llevaba en curso. Como
// POST /v1/speak es síncrono y Voice Engine no tiene idempotencia real,
// reintentar tras un corte tardío (ej. a los 40s, con Chatterbox ya
// generando o ya terminado) arriesgaba una generación real duplicada --
// exactamente el riesgo que confirmó el diagnóstico de esta fase. Regla
// aplicada: un fallo RÁPIDO (antes de umbralMsFalloRapido) es compatible
// con "nunca llegó a conectar" -- seguro reintentar. Un fallo TARDÍO
// implica que el servidor probablemente ya recibió la petición y pudo
// haber empezado (o terminado) la generación -- NUNCA se reintenta solo,
// se corta y se avisa explícitamente en el mensaje de error.
async function postConReintentoSeguro(url, bodyObj, opts, { intentos = 2, esperaMsEntreIntentos = 1000, umbralMsFalloRapido = 5000 } = {}) {
  let ultimoError;
  for (let intento = 1; intento <= intentos; intento++) {
    const inicio = Date.now();
    try {
      return await httpPostJson(url, bodyObj, opts);
    } catch (err) {
      const transcurridoMs = Date.now() - inicio;
      ultimoError = err;
      if (transcurridoMs >= umbralMsFalloRapido) {
        err.noReintentarPorRiesgoDeDuplicado = true;
        err.transcurridoMs = transcurridoMs;
        throw err;
      }
      if (intento < intentos) await new Promise((r) => setTimeout(r, esperaMsEntreIntentos));
    }
  }
  throw ultimoError;
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

// FASE "Voice Engine automático" (2026-09-04): estado real de 3 valores para
// el Command Center -- isVoiceEngineReachable() de arriba ya devolvía true
// en cuanto /health respondía, aunque el modelo Chatterbox siguiera
// cargando (~15-30s reales, ver voice-engine/README.md), así que un arranque
// automático se veía indistinguible de "ya operativo". No sustituye a
// isVoiceEngineReachable (otros llamadores reales ya dependen de su forma
// booleana) -- se añade aparte.
export async function getVoiceEngineStatus() {
  try {
    const res = await fetch(`${VOICE_ENGINE_BASE_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return 'NO_DISPONIBLE';
    const body = await res.json().catch(() => null);
    return body?.model_loaded ? 'OPERATIVO' : 'ARRANCANDO';
  } catch {
    return 'NO_DISPONIBLE';
  }
}

/**
 * Convierte un WAV ya generado por /v1/speak (mismo output_filename real
 * devuelto por generateNewVoiceover) a OGG/Opus real -- llama al endpoint
 * REAL ya existente (voice-engine/app/api/convert.py, que a su vez reutiliza
 * services/audio_convert.py + ffmpeg, sin reimplementar nada). Devuelve la
 * ruta Windows real del OGG, con el mismo criterio de reintentos/estabilidad
 * ya usado para el WAV en generateNewVoiceover().
 */
export async function convertWavToOgg(wavFilename) {
  let res;
  try {
    res = await postConReintentoSeguro(
      `${VOICE_ENGINE_BASE_URL}/v1/convert-to-ogg`,
      { wav_filename: wavFilename },
      { headers: { 'x-api-key': voiceEngineApiKey() }, timeoutMs: 60_000 }
    );
  } catch (err) {
    const sufijo = err.noReintentarPorRiesgoDeDuplicado
      ? ` (falló tras ${err.transcurridoMs}ms, ya en curso -- no se reintentó para evitar una conversión duplicada; probablemente el WAV real ya existe, revisa antes de reintentar a mano)`
      : ' tras reintentar';
    throw new Error(`convertWavToOgg: Voice Engine no está disponible en ${VOICE_ENGINE_BASE_URL} (${err.message})${sufijo}.`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`convertWavToOgg: Voice Engine respondió ${res.status}: ${detail}`);
  }
  const body = await res.json();
  const oggWslPath = `${VOICE_ENGINE_WSL_OUTPUT_DIR}/${body.ogg_filename}`;
  const oggWindowsPath = wslPathToWindowsUNC(oggWslPath);
  if (!existsSync(oggWindowsPath)) {
    throw new Error(`convertWavToOgg: se generó "${body.ogg_filename}" pero no se encontró en la ruta real esperada (${oggWindowsPath}).`);
  }
  leerArchivoConReintentos(oggWindowsPath, 'AUDIO_OGG');
  return { oggFilename: body.ogg_filename, resolvedPath: oggWindowsPath };
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
export async function generateNewVoiceover({ text, voiceParams = {}, context = 'default' }) {
  if (!text?.trim()) throw new Error('generateNewVoiceover: "text" es obligatorio.');
  const {
    voiceProfileId = DEFAULT_VOICE_PARAMS.voiceProfileId, language = DEFAULT_VOICE_PARAMS.language,
    exaggeration = DEFAULT_VOICE_PARAMS.exaggeration, cfgWeight = DEFAULT_VOICE_PARAMS.cfgWeight,
    temperature = DEFAULT_VOICE_PARAMS.temperature,
  } = voiceParams;
  let res;
  try {
    res = await postConReintentoSeguro(
      `${VOICE_ENGINE_BASE_URL}/v1/speak`,
      // context (2026-09-11, "contexto de generación de voz"): identifica de
      // qué consumidor real viene el texto (whatsapp/advertisement/video/
      // manual/default) -- Voice Engine hoy normaliza igual para todos
      // (normalizar_texto_para_tts sigue siendo una sola función, sin reglas
      // por contexto todavía); esto solo transporta el dato hasta allá para
      // que un futuro ajuste por contexto no necesite duplicar código ni
      // tocar a ningún consumidor otra vez. Un llamador que no lo pase
      // (compatibilidad hacia atrás) sigue funcionando igual: cae a
      // 'default' aquí mismo, antes de salir de este archivo.
      { text, language, voice_profile_id: voiceProfileId, exaggeration, cfg_weight: cfgWeight, temperature, context },
      // 1_500_000ms (25 min) -- hallazgo real 2026-09-09: con la segmentacion
      // de texto largo (ver voice-engine/app/services/text_segmentation.py)
      // una generacion real de 1489 caracteres (3 segmentos) tardo hasta
      // ~1207s (~20min) en FP32/CPU -- 600s ya no alcanza. El propio techo
      // interno de Voice Engine (MAX_TIMEOUT_S=900s, config.py, sin tocar)
      // sigue siendo el limite real mas restrictivo para textos aun mas
      // largos -- este timeout del Dashboard solo debe dejar de ser EL QUE
      // corta primero, nunca whatsoever mas corto que ese techo interno.
      { headers: { 'x-api-key': voiceEngineApiKey() }, timeoutMs: 1_500_000 }
    );
  } catch (err) {
    if (err.noReintentarPorRiesgoDeDuplicado) {
      throw new Error(
        `generateNewVoiceover: se perdió la conexión con Voice Engine (${VOICE_ENGINE_BASE_URL}) tras ${err.transcurridoMs}ms, cuando ya pudo haber empezado a generar (${err.message}). ` +
        'No se reintentó automáticamente para evitar una generación duplicada -- espera un momento y vuelve a intentarlo manualmente si hace falta.'
      );
    }
    throw new Error(`generateNewVoiceover: Voice Engine no está disponible en ${VOICE_ENGINE_BASE_URL} (${err.message}) tras reintentar. Inícialo con "uvicorn app.main:app" dentro de voice-engine/ para generar audio nuevo, o usa un Audio Asset ya existente.`);
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
