// youtubeTranscriptBackend.js — Backend de adquisición para YouTube (Fase 10).
//
// Implementa AcquisitionBackend (src/acquisition/acquisitionBackend.js) —
// mismo contrato que JinaDirectBackend/AgentReachWebBackend. Nunca devuelve
// nuestro contrato normalizado directamente: devuelve un payload crudo que
// youtubeAdapter.js traduce a createRecord() (src/contract.js, sin modificar).
//
// Diseño (Fase 10, referencia conceptual: la jerarquía manual→auto de la
// skill "youtube-transcript" auditada en la fase anterior — NUNCA instalada,
// solo su lógica reimplementada aquí con `fetch` nativo):
//
//   1. Página pública de "watch" (fetch directo, sin login, sin cookies) —
//      contiene el JSON embebido `ytInitialPlayerResponse` que YouTube envía
//      a cualquier visitante no autenticado. De ahí se leen metadata pública
//      (título, canal, duración, fecha, view count) y la lista de pistas de
//      subtítulos disponibles (captionTracks).
//   2. Se prefiere una pista de subtítulos MANUAL (kind !== 'asr') sobre una
//      AUTOMÁTICA (kind === 'asr') — igual jerarquía que la skill de
//      referencia, sin necesidad de yt-dlp: la URL de la pista ya viene en el
//      JSON público del paso 1, y es en sí misma una URL pública sin login.
//   3. NUNCA se descarga audio ni video — si no hay ninguna pista de
//      subtítulos, se reporta transcript_available:false con motivo, nunca
//      Whisper ni ningún método que requiera instalar algo nuevo.
//
// Métricas: view count SÍ aparece en el JSON público (videoDetails.viewCount).
// Likes y comment count NO se extraen aquí — a diferencia del view count, no
// viven en el payload público de la página en un campo estable y documentado
// para la mayoría de los videos; obtenerlos de forma confiable requiere la
// API oficial (YouTube Data API v3, API key) o inspeccionar respuestas
// internas no destinadas a consumo público — ninguna de las dos está
// autorizada en esta fase. Se reportan explícitamente como null + motivo,
// nunca inventados ni aproximados.

import { AcquisitionBackend } from '../acquisitionBackend.js';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function extractVideoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.slice(1).split('/')[0] || null;
    if (parsed.pathname.startsWith('/shorts/')) return parsed.pathname.split('/')[2] || null;
    if (parsed.searchParams.get('v')) return parsed.searchParams.get('v');
    return null;
  } catch {
    return null;
  }
}

/** Extrae un objeto JSON balanceado empezando en el primer "{" tras `marker`, sin asumir que termina en el primer "});" (podría haber "});" dentro de un string). */
function extractBalancedJson(text, marker) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) return null;
  const start = text.indexOf('{', markerIndex);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let stringChar = null;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try { return JSON.parse(candidate); } catch { return null; }
      }
    }
  }
  return null;
}

function decodeXmlEntities(str) {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** Convierte el XML de timedtext de YouTube a texto plano, deduplicando líneas consecutivas repetidas (mismo problema documentado en subtítulos auto-generados que la skill de referencia resuelve). */
function timedTextToPlainText(xml) {
  const matches = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)];
  const lines = [];
  let lastLine = null;
  for (const m of matches) {
    const clean = decodeXmlEntities(m[1].replace(/<[^>]+>/g, '')).trim();
    if (clean && clean !== lastLine) {
      lines.push(clean);
      lastLine = clean;
    }
  }
  return lines.join(' ');
}

function looksBlocked(html) {
  return /consent\.youtube\.com|Before you continue to YouTube|unusual traffic/i.test(html.slice(0, 5000));
}

export class YouTubeTranscriptBackend extends AcquisitionBackend {
  constructor({ fetchImpl = fetch, preferredLanguage = 'en' } = {}) {
    super();
    this._fetchImpl = fetchImpl;
    this._preferredLanguage = preferredLanguage;
  }

  get name() {
    return 'youtube_transcript_direct';
  }

  get capabilities() {
    return Object.freeze({
      rendersJavaScript: false,
      capturesScreenshots: false,
      capturesInteractions: false,
      respectsViewport: false,
      supportsAuthentication: false,
    });
  }

  async fetch(url, { timeoutMs = 20000 } = {}) {
    const videoId = extractVideoId(url);
    if (!videoId) {
      return { ok: false, blocked: false, error: 'invalid_youtube_url', videoId: null };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let html;
    try {
      const response = await this._fetchImpl(`https://www.youtube.com/watch?v=${videoId}`, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
      });
      if (!response.ok) {
        return { ok: false, blocked: false, error: `http_${response.status}`, videoId };
      }
      html = await response.text();
    } catch (err) {
      return { ok: false, blocked: false, error: err.message, videoId };
    } finally {
      clearTimeout(timer);
    }

    if (looksBlocked(html)) {
      return { ok: false, blocked: true, blockReason: 'consent_or_antibot_page', videoId };
    }

    const playerResponse = extractBalancedJson(html, 'ytInitialPlayerResponse');
    if (!playerResponse) {
      return { ok: false, blocked: false, error: 'unparseable_page_structure', videoId };
    }

    const status = playerResponse.playabilityStatus?.status;
    if (status && status !== 'OK') {
      // LOGIN_REQUIRED, UNPLAYABLE (privado/eliminado), etc. — nunca se intenta evadir.
      return { ok: false, blocked: status === 'LOGIN_REQUIRED', authRequired: status === 'LOGIN_REQUIRED', error: `playability_${status}`, videoId };
    }

    const details = playerResponse.videoDetails ?? {};
    const microformat = playerResponse.microformat?.playerMicroformatRenderer ?? {};
    const captionTracks = playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

    const metadata = {
      videoId,
      title: details.title ?? null,
      channel: details.author ?? null,
      durationSeconds: details.lengthSeconds ? Number(details.lengthSeconds) : null,
      publishDate: microformat.publishDate ?? microformat.uploadDate ?? null,
      viewCount: details.viewCount ? Number(details.viewCount) : null,
      isLiveContent: Boolean(details.isLiveContent),
    };

    const metrics = {
      views: metadata.viewCount,
      views_available: metadata.viewCount !== null,
      views_reason: metadata.viewCount !== null ? 'presente en metadata pública de la página (videoDetails.viewCount)' : 'no presente en la respuesta pública de la página',
      likes: null,
      likes_available: false,
      likes_reason: 'no disponible sin YouTube Data API v3 (API key) — no se intentó inferir de estructuras internas no documentadas para no exceder el alcance de "metadata pública"',
      comments: null,
      comments_available: false,
      comments_reason: 'requiere un endpoint de continuación interno paginado, no una lectura directa de metadata pública — no autorizado en esta fase',
    };

    if (captionTracks.length === 0) {
      return { ok: true, blocked: false, videoId, metadata, metrics, transcript: null, transcriptAvailable: false, transcriptReason: 'sin pistas de subtítulos (ni manuales ni automáticas) reportadas por la página' };
    }

    const manual = captionTracks.find((t) => t.kind !== 'asr' && (!this._preferredLanguage || t.languageCode === this._preferredLanguage));
    const manualAny = captionTracks.find((t) => t.kind !== 'asr');
    const autoPreferred = captionTracks.find((t) => t.kind === 'asr' && t.languageCode === this._preferredLanguage);
    const track = manual ?? manualAny ?? autoPreferred ?? captionTracks[0];
    const trackType = track.kind === 'asr' ? 'auto' : 'manual';

    let transcriptText = null;
    let transcriptError = null;
    try {
      const capResponse = await this._fetchImpl(track.baseUrl, { headers: { 'User-Agent': USER_AGENT } });
      if (capResponse.ok) {
        const xml = await capResponse.text();
        transcriptText = timedTextToPlainText(xml);
      } else {
        transcriptError = `http_${capResponse.status}_fetching_captions`;
      }
    } catch (err) {
      transcriptError = err.message;
    }

    if (!transcriptText) {
      return { ok: true, blocked: false, videoId, metadata, metrics, transcript: null, transcriptAvailable: false, transcriptReason: transcriptError ?? 'la pista de subtítulos no devolvió texto utilizable' };
    }

    return {
      ok: true,
      blocked: false,
      videoId,
      metadata,
      metrics,
      transcript: transcriptText,
      transcriptAvailable: true,
      transcriptType: trackType,
      transcriptLanguage: track.languageCode ?? null,
    };
  }
}
