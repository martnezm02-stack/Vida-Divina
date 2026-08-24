// youtubeAdapter.js — Adapter de la fuente YouTube (Fase 10).
//
// Mismo patrón que webAdapter.js: el adapter no sabe CÓMO se obtiene el
// contenido — solo conoce la interfaz AcquisitionBackend y normaliza SIEMPRE
// al contrato existente (src/contract.js, sin modificar ni un campo). Backend
// seleccionable vía YOUTUBE_BACKEND (hoy solo existe 'youtube_transcript_direct';
// el punto de extensión queda documentado para un futuro backend oficial vía
// YouTube Data API v3, si algún día se autoriza esa API key).
//
// contract.js NO restringe "source" ni "platform_object_type" a un enum
// cerrado — solo access_method y fetch_status lo están, y ambos ya tienen un
// valor que describe honestamente este mecanismo: access_method
// "public_web_direct" (lectura directa de una página pública, sin API oficial,
// igual que rssAdapter.js) y fetch_status "partial" para transcripciones
// truncadas por límite de tamaño (no existe un valor "too_long" en el enum
// existente y no se modificó el enum para inventar uno — "partial" ya
// significa exactamente "se obtuvo contenido pero incompleto").

import { createRecord } from '../contract.js';
import { wrapExternalContent } from '../security/untrustedContent.js';
import { YouTubeTranscriptBackend } from '../acquisition/youtube/youtubeTranscriptBackend.js';
import { YouTubeTranscriptApiBackend } from '../acquisition/youtube/youtubeTranscriptApiBackend.js';

// Fase 10E: segundo backend intercambiable, vía la librería Python
// `youtube-transcript-api` (auditada en Fases 10B-10D, subproceso aislado,
// nunca instalada automáticamente). Mismo patrón que jina/agent_reach en
// webAdapter.js: la clave del mapa es corta, el nombre descriptivo real vive
// en backend.name. Seleccionable con YOUTUBE_BACKEND=youtube_transcript_api.
const BACKENDS = Object.freeze({
  youtube_transcript_direct: () => new YouTubeTranscriptBackend(),
  youtube_transcript_api: () => new YouTubeTranscriptApiBackend(),
});

// Alineado con CHARS_PER_TOKEN_ESTIMATE=4 ya usado en marketingIntelligenceAgent.js
// (Fase 5) — ~4000 tokens de transcripción antes de truncar en la adquisición
// misma. CostGuard.exceedsTokenLimit() (sin modificar) sigue aplicando su
// propio chequeo independiente en la etapa de análisis; este límite es
// deliberadamente más generoso, solo evita RAW records absurdamente grandes.
const MAX_TRANSCRIPT_CHARS = 16000;

function resolveBackend(explicitBackend, backendName) {
  if (explicitBackend) return explicitBackend;
  const name = backendName ?? process.env.YOUTUBE_BACKEND ?? 'youtube_transcript_direct';
  const factory = BACKENDS[name];
  if (!factory) throw new Error(`youtubeAdapter: YOUTUBE_BACKEND desconocido: "${name}" (válidos: ${Object.keys(BACKENDS).join(', ')})`);
  return factory();
}

export async function fetchYouTubeVideo(url, options = {}) {
  const { backend: explicitBackend, backendName, ...backendOptions } = options;
  const backend = resolveBackend(explicitBackend, backendName);
  const result = await backend.fetch(url, backendOptions);

  const baseMetadata = { platform_specific: { backend: backend.name, video_id: result.videoId ?? null } };

  if (!result.ok) {
    return [createRecord({
      source: 'youtube',
      platform_object_type: 'video',
      url,
      content: '',
      access_method: 'public_web_direct',
      fetch_status: result.blocked ? 'blocked_by_platform' : 'error',
      metadata: { platform_specific: { ...baseMetadata.platform_specific, reason: result.error ?? result.blockReason ?? 'unknown' } },
    })];
  }

  if (!result.transcriptAvailable) {
    // Sin transcript, el ÚNICO texto real y literal que tenemos es el título
    // público del video — nunca se fabrica contenido para rellenar este
    // hueco. Se usa como respaldo explícitamente etiquetado
    // (content_source: 'title_only') para que el pipeline de análisis pueda
    // ejercitarse honestamente sobre datos reales, nunca inventados; sigue
    // siendo fetch_status "partial" porque el objetivo (transcript) no se
    // cumplió.
    const titleFallback = result.metadata?.title ?? '';
    const { content, content_flags } = wrapExternalContent(titleFallback);
    return [createRecord({
      source: 'youtube',
      platform_object_type: 'video',
      url,
      title: result.metadata?.title ?? null,
      author: result.metadata?.channel ?? null,
      published_at: result.metadata?.publishDate ?? null,
      content,
      content_flags,
      metrics: result.metrics ?? {},
      access_method: 'public_web_direct',
      source_reliability: 'medium',
      fetch_status: 'partial',
      metadata: {
        platform_specific: {
          ...baseMetadata.platform_specific,
          ...result.metadata,
          transcript_available: false,
          transcript_reason: result.transcriptReason,
          content_source: titleFallback ? 'title_only' : 'none',
        },
      },
    })];
  }

  let transcript = result.transcript;
  let fetchStatus = 'ok';
  let truncated = false;
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    transcript = transcript.slice(0, MAX_TRANSCRIPT_CHARS);
    fetchStatus = 'partial';
    truncated = true;
  }

  const { content, content_flags } = wrapExternalContent(transcript);

  return [createRecord({
    source: 'youtube',
    platform_object_type: 'video',
    url,
    title: result.metadata?.title ?? null,
    author: result.metadata?.channel ?? null,
    published_at: result.metadata?.publishDate ?? null,
    content,
    content_flags,
    metrics: result.metrics ?? {},
    access_method: 'public_web_direct',
    source_reliability: 'medium',
    fetch_status: fetchStatus,
    metadata: {
      platform_specific: {
        ...baseMetadata.platform_specific,
        ...result.metadata,
        transcript_available: true,
        transcript_type: result.transcriptType,
        transcript_language: result.transcriptLanguage,
        transcript_truncated: truncated,
        transcript_truncated_reason: truncated ? `excede MAX_TRANSCRIPT_CHARS=${MAX_TRANSCRIPT_CHARS}` : null,
        content_source: 'transcript',
      },
    },
  })];
}
