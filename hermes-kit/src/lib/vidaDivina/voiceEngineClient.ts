// voiceEngineClient.ts — Voice Engine real de Vida Divina, para Hermes.
//
// NO crea un segundo motor de TTS. Reutiliza EXACTAMENTE
// dashboard/server/lib/voiceEngineClient.js (ya real, probado, en
// producción del Video Workspace) para hablar con POST /v1/speak y
// resolver la ruta real del WAV generado (import directo por ruta
// absoluta -- dashboard/ y hermes-kit/ son paquetes hermanos sin
// workspaces npm compartidos, mismo patrón ya usado en productKnowledge.ts
// para recommendation-engine/).
//
// Lo único nuevo aquí es el paso WAV -> OGG/Opus, porque WhatsApp (Baileys)
// necesita notas de voz en ese formato y el Video Workspace nunca lo
// necesitó. Ese paso llama a voice-engine/app/api/convert.py (endpoint
// nuevo, ver ese archivo) que a su vez reutiliza
// voice-engine/app/services/audio_convert.py -- una función que YA existía,
// con ffmpeg ya implementado, documentada en su propio código como "lista
// para cuando se construya el flujo hacia WhatsApp". Esta es esa conexión:
// no se reimplementa la conversión, solo se expone y se llama.
//
// Abstracción exigida por la fase: generateVoice(text, voiceProfile).

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { REPO_ROOT } from "./productKnowledge";

const DASHBOARD_VOICE_CLIENT_PATH = path.join(REPO_ROOT, "dashboard", "server", "lib", "voiceEngineClient.js");
const AUDIO_ASSET_ADAPTER_PATH = path.join(REPO_ROOT, "tts-text-preprocessor", "src", "audioAssetAdapter.js");

let _dashboardVoiceClient: any = null;
async function dashboardVoiceClient(): Promise<any> {
  if (!_dashboardVoiceClient) {
    _dashboardVoiceClient = await import(pathToFileURL(DASHBOARD_VOICE_CLIENT_PATH).href);
  }
  return _dashboardVoiceClient;
}

let _audioAssetAdapter: any = null;
async function audioAssetAdapter(): Promise<any> {
  if (!_audioAssetAdapter) {
    _audioAssetAdapter = await import(pathToFileURL(AUDIO_ASSET_ADAPTER_PATH).href);
  }
  return _audioAssetAdapter;
}

// Default 127.0.0.1 (no localhost): en esta máquina "localhost" resuelve
// ::1 antes que 127.0.0.1, y WSL2 no reenvía IPv6 loopback para este puerto
// -- el fallback a IPv4 añade un margen medido en ~2.2s en esta máquina
// (ver start-vida-divina.ps1#Get-VoiceEngineHealth), suficiente para tumbar
// el preflight de 2s de isVoiceEngineReachable(). 127.0.0.1 se salta la
// resolución DNS por completo. Diagnóstico real, 2026-09-08.
const VOICE_ENGINE_BASE_URL = process.env.VOICE_ENGINE_URL ?? "http://127.0.0.1:8000";
const VOICE_ENGINE_WSL_USER = process.env.VOICE_ENGINE_WSL_USER ?? "manuel1974";
const VOICE_ENGINE_WSL_OUTPUT_DIR = `/home/${VOICE_ENGINE_WSL_USER}/vida-divina-voice-engine-data/output`;

function voiceEngineApiKey(): string {
  return process.env.VOICE_ENGINE_API_KEY ?? "dev-local-only-change-me";
}

/** true si el Voice Engine real está corriendo -- reutiliza la misma comprobación real del dashboard. */
export async function isVoiceEngineReachable(): Promise<boolean> {
  const c = await dashboardVoiceClient();
  return c.isVoiceEngineReachable();
}

export interface VoiceProfile {
  voiceProfileId?: string;
  language?: string;
  exaggeration?: number;
  cfgWeight?: number;
  temperature?: number;
}

export type GenerateVoiceResult =
  | { ok: true; oggPath: string; wavPath: string; durationSeconds: number | null; sampleRate: number; generationSeconds: number }
  | { ok: false; reason: string };

/**
 * generateVoice(text, voiceProfile) — la abstracción real que exige esta
 * fase. texto -> WAV real (Voice Engine, vía el cliente ya existente del
 * dashboard) -> OGG/Opus real (ffmpeg, vía el conversor ya existente,
 * ahora expuesto por HTTP) -> ruta Windows real lista para leer y enviar
 * por Baileys. Nunca simula audio: si el Voice Engine no está corriendo o
 * la conversión falla, devuelve ok:false con el motivo real.
 */
export async function generateVoice(text: string, voiceProfile: VoiceProfile = {}): Promise<GenerateVoiceResult> {
  // Preflight rápido (~200ms-2s, isVoiceEngineReachable ya existente) antes
  // de intentar generar voz real. Sin esto, un Voice Engine caído/colgado
  // dejaba al cliente esperando hasta el timeout completo de 600s de
  // generateNewVoiceover (~5 min reales observados) antes de degradar a
  // texto -- hallazgo real, 2026-09-05.
  if (!(await isVoiceEngineReachable())) {
    return { ok: false, reason: "Voice Engine no disponible" };
  }

  let wav: any;
  try {
    const c = await dashboardVoiceClient();
    // context: "whatsapp" (2026-09-11, "contexto de generación de voz") --
    // Hermes es siempre el consumidor de WhatsApp; Voice Engine hoy
    // normaliza igual para todos los contextos (ver
    // voice-engine/app/services/tts_text_normalization.py), esto solo
    // identifica el origen real para un ajuste futuro sin duplicar código.
    wav = await c.generateNewVoiceover({ text, voiceParams: voiceProfile, context: "whatsapp" });
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }

  let oggFilename: string;
  try {
    const res = await fetch(`${VOICE_ENGINE_BASE_URL}/v1/convert-to-ogg`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": voiceEngineApiKey() },
      body: JSON.stringify({ wav_filename: wav.output_filename }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, reason: `Voice Engine (conversión a OGG) respondió ${res.status}: ${detail}` };
    }
    const body = (await res.json()) as { ogg_filename: string };
    oggFilename = body.ogg_filename;
  } catch (err) {
    return { ok: false, reason: `No se pudo convertir el audio a OGG/Opus: ${err instanceof Error ? err.message : String(err)}` };
  }

  const adapter = await audioAssetAdapter();
  const oggWslPath = `${VOICE_ENGINE_WSL_OUTPUT_DIR}/${oggFilename}`;
  const oggPath = adapter.wslPathToWindowsUNC(oggWslPath);

  return {
    ok: true,
    oggPath,
    wavPath: wav.resolvedPath,
    durationSeconds: wav.durationSeconds ?? null,
    sampleRate: wav.sample_rate,
    generationSeconds: wav.generation_seconds,
  };
}
