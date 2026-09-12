// voiceGenerator.js — "Generar archivo de voz" (FASE "Voice Engine
// automático + generador de voz", 2026-09-04). Orquesta EXCLUSIVAMENTE
// infraestructura ya real y existente:
//   texto -> generateNewVoiceover() [Voice Engine real, /v1/speak] -> WAV
//         -> convertWavToOgg()     [Voice Engine real, /v1/convert-to-ogg] -> OGG/Opus
//         -> commercial-media/incoming/<nombre>.ogg (misma carpeta real que
//            ya usa scanCommercialMedia -- nunca un directorio nuevo)
//         -> upsertCommercialMedia() [Commercial Media Registry real]
// No crea un segundo TTS, un segundo Asset Registry, ni un segundo mecanismo
// de guardado de media -- todas las piezas ya existían antes de esta fase,
// salvo la propia orquestación (este archivo) y convertWavToOgg/
// getVoiceEngineStatus (extensiones puntuales de voiceEngineClient.js).

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sendJson, badRequest, serverError, readJsonBody } from '../lib/http.js';
import { toMediaUrl } from '../lib/safePaths.js';
import { generateNewVoiceover, convertWavToOgg, DEFAULT_VOICE_PARAMS, isVoiceEngineReachable } from '../lib/voiceEngineClient.js';
import { probeMediaFile } from '../../../commercial-media/src/mediaInspector.js';
import { upsertCommercialMedia, listCommercialMedia } from '../../../commercial-media/src/commercialMediaStore.js';
import { INCOMING_DIR } from '../../../commercial-media/src/scanCommercialMedia.js';

// Único voice profile real conocido hoy (voice-engine/app/models/voice_profiles.py
// solo tiene "manuel_es_mx" registrado -- no existe todavía un endpoint HTTP
// para listar perfiles, ver voice-engine/README.md "Qué falta". Se refleja
// aquí el mismo default real ya usado en generateNewVoiceover(), nunca un
// perfil ficticio inventado para rellenar una lista.
const VOICE_PROFILES = Object.freeze([
  { voiceProfileId: DEFAULT_VOICE_PARAMS.voiceProfileId, label: 'Voz oficial Vida Divina (manuel_es_mx)' },
]);

function slugify(nombre) {
  return String(nombre ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function hashFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export async function handleVoiceProfiles(req, res) {
  const reachable = await isVoiceEngineReachable();
  sendJson(res, 200, { profiles: VOICE_PROFILES, voiceEngineReachable: reachable });
}

/**
 * POST /api/voice-generator/generate -- genera un audio REAL nuevo y lo deja
 * ya en su ubicación final real (commercial-media/incoming/<slug>.ogg), listo
 * para reproducirse (previewUrl) y, si el usuario decide guardarlo, para
 * registrarse tal cual con handleSaveVoiceAsset (sin mover el archivo).
 */
export async function handleGenerateVoiceAsset(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    badRequest(res, err.message);
    return;
  }
  const text = body?.text?.trim();
  const nombreCrudo = body?.semanticName?.trim();
  const voiceProfileId = body?.voiceProfileId?.trim() || DEFAULT_VOICE_PARAMS.voiceProfileId;

  if (!text) { badRequest(res, 'Falta "text" (el texto real a convertir en voz).'); return; }
  if (!nombreCrudo) { badRequest(res, 'Falta "semanticName" (el nombre del archivo).'); return; }
  const slug = slugify(nombreCrudo);
  if (!slug) { badRequest(res, `"semanticName" ("${nombreCrudo}") no produce un nombre de archivo válido -- usa letras/números/guiones.`); return; }

  let wav;
  try {
    wav = await generateNewVoiceover({ text, voiceParams: { voiceProfileId }, context: 'manual' });
  } catch (err) {
    // Fallback honesto (§13 del encargo): nunca se simula un audio. El
    // generador manual debe mostrar el error real tal cual.
    serverError(res, err);
    return;
  }

  let ogg;
  try {
    ogg = await convertWavToOgg(wav.output_filename);
  } catch (err) {
    serverError(res, err);
    return;
  }

  mkdirSync(INCOMING_DIR, { recursive: true });
  const destino = join(INCOMING_DIR, `${slug}.ogg`);
  copyFileSync(ogg.resolvedPath, destino);

  const probe = probeMediaFile(destino, 'audio');
  const stat = statSync(destino);
  const previewUrl = toMediaUrl(destino);

  sendJson(res, 200, {
    ok: true,
    semanticName: slug,
    filename: `${slug}.ogg`,
    previewUrl,
    durationSeconds: probe.durationSeconds,
    fileSizeBytes: stat.size,
    sampleRate: wav.sample_rate,
    generationSeconds: wav.generation_seconds,
    format: 'audio/ogg (Opus)',
  });
}

const BUSINESS_INTENT_TO_MEDIA_TYPE = Object.freeze({
  CONSUMPTION: 'AUDIO_OFICIAL',
  DISTRIBUTION: 'BUSINESS_MODEL_AUDIO',
});

/**
 * POST /api/voice-generator/save-asset -- registra en el Commercial Media
 * Registry real el archivo ya generado por handleGenerateVoiceAsset (mismo
 * nombre semántico -> mismo archivo físico en commercial-media/incoming/).
 * No mueve el archivo, no lo reconvierte: solo lo da de alta con metadata
 * real ya conocida (nunca inferida/adivinada, a diferencia del clasificador
 * automático de scanCommercialMedia.js -- aquí el usuario ya la dio).
 */
export async function handleSaveVoiceAsset(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    badRequest(res, err.message);
    return;
  }
  const semanticName = body?.semanticName?.trim();
  if (!semanticName) { badRequest(res, 'Falta "semanticName".'); return; }
  const filePath = join(INCOMING_DIR, `${semanticName}.ogg`);
  if (!existsSync(filePath)) { badRequest(res, `No existe un audio generado real para "${semanticName}" -- genera el audio primero.`); return; }

  const businessIntent = BUSINESS_INTENT_TO_MEDIA_TYPE[body?.businessIntent] ? body.businessIntent : 'CONSUMPTION';
  const mediaType = BUSINESS_INTENT_TO_MEDIA_TYPE[businessIntent];
  const productId = body?.productId?.trim() || null;

  const probe = probeMediaFile(filePath, 'audio');
  const stat = statSync(filePath);

  try {
    const { record, wasNew } = upsertCommercialMedia({
      displayName: semanticName,
      filePath,
      sourcePath: filePath,
      mimeType: 'audio/ogg',
      mediaType,
      businessIntent,
      productId,
      needTags: [],
      language: 'es',
      durationSeconds: probe.durationSeconds,
      fileSizeBytes: stat.size,
      contentHash: hashFile(filePath),
      classificationConfidence: 'HIGH',
      classificationReason: 'Generado manualmente vía "Generar archivo de voz" del Dashboard (Voice Engine real) -- nombre semántico y metadata asignados directamente por el usuario, no inferidos.',
    });
    sendJson(res, 200, { ok: true, mediaId: record.mediaId, wasNew, displayName: record.displayName });
  } catch (err) {
    serverError(res, err);
  }
}

/** GET /api/voice-generator/assets -- lista los audios reales ya guardados (para "sigue disponible tras recargar" y para depurar la resolución por nombre). */
export async function handleListVoiceAssets(req, res) {
  const audios = listCommercialMedia().filter((r) => r.mimeType === 'audio/ogg');
  sendJson(res, 200, { assets: audios.map((r) => ({ mediaId: r.mediaId, displayName: r.displayName, productId: r.productId, mediaType: r.mediaType, durationSeconds: r.durationSeconds, fileSizeBytes: r.fileSizeBytes, previewUrl: toMediaUrl(r.filePath), active: r.active })) });
}
