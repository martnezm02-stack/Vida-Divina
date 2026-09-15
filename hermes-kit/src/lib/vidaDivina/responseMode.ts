// responseMode.ts — Decisión texto/voz real para Hermes.
//
// Ajuste `response_mode` ('text' | 'voice' | 'auto', default 'auto') vive
// en la tabla `settings` YA existente (getSetting/setSetting, src/lib/db.ts
// — el mismo almacén que ya usa `audio_enabled` para la transcripción
// entrante). No se crea una tabla nueva.

import { getSetting } from "../db";

export type ResponseMode = "text" | "voice" | "auto";
export type DecidedFormat = "text" | "voice";

const AUDIO_REQUEST_PATTERNS: RegExp[] = [
  /m[aá]ndame.*(audio|nota de voz|voz)/i,
  /env[ií]ame.*(audio|nota de voz|voz)/i,
  /\b(en|por)\s+audio\b/i,
  /nota de voz/i,
  /mensaje de voz/i,
  /expl[ií]cam[eé]lo.*(hablad[oa]|por audio|en audio|con audio)/i,
  /expl[ií]came.*hablad[oa]/i,
  /respond[eé]me.*hablando/i,
  /puedes hablar/i,
  /mandas?\s+un\s+audio/i,
  /d[ií]melo\s+hablado/i,
  /\bcu[ée]ntamelo\s+(hablado|en audio|por audio)\b/i,
];

// Umbral bajo deliberado: solo respuestas de verdad triviales (confirmaciones
// cortas, "Sí", "Perfecto, ahora te cuento") se quedan en texto cuando el
// contexto (audio entrante) sugeriría voz -- una respuesta sustancial SÍ debe
// poder generarse en voz si el contexto lo justifica.
const TRIVIAL_MAX_CHARS = 60;

/** Ajuste real leído del dashboard (settings.response_mode). Default: 'auto'. */
export function getConfiguredResponseMode(): ResponseMode {
  const raw = getSetting("response_mode");
  if (raw === "text" || raw === "voice" || raw === "auto") return raw;
  return "auto";
}

/** true si la voz está habilitada globalmente (settings.voice_enabled, default '1' -- activado). */
export function voiceEnabled(): boolean {
  return getSetting("voice_enabled") !== "0";
}

export interface DecideResponseModeInput {
  userText: string;
  isIncomingAudio: boolean;
  responseText: string;
}

/**
 * decideResponseMode -- exigido explícitamente por la fase: decide el
 * formato de UNA respuesta concreta. Reglas mínimas (en orden):
 *  1. Voz deshabilitada globalmente -> siempre texto.
 *  2. response_mode='text' -> siempre texto. response_mode='voice' -> siempre voz.
 *  3. (modo 'auto') El usuario pide audio explícitamente -> voz.
 *  4. (modo 'auto') El usuario mandó un audio Y la respuesta no es trivial -> voz.
 *  5. Cualquier otro caso -> texto (nunca se genera voz "porque sí").
 */
export function decideResponseMode(input: DecideResponseModeInput): DecidedFormat {
  if (!voiceEnabled()) return "text";

  const configured = getConfiguredResponseMode();
  if (configured === "text") return "text";
  if (configured === "voice") return "voice";

  const pideAudioExplicito = AUDIO_REQUEST_PATTERNS.some((p) => p.test(input.userText));
  if (pideAudioExplicito) return "voice";

  if (input.isIncomingAudio && input.responseText.trim().length > TRIVIAL_MAX_CHARS) {
    return "voice";
  }

  return "text";
}
