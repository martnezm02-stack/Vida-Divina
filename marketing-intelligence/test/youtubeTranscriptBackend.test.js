// youtubeTranscriptBackend.test.js — Fase 10. Todo mockeado (fetchImpl
// inyectado) — nunca se llama a la red real en esta suite.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { YouTubeTranscriptBackend } from '../src/acquisition/youtube/youtubeTranscriptBackend.js';

function fakePlayerResponse(overrides = {}) {
  return {
    playabilityStatus: { status: 'OK' },
    videoDetails: {
      videoId: 'abc12345678',
      title: 'Un video de prueba con "comillas" y }llaves{ dentro del texto',
      author: 'Canal de Prueba',
      lengthSeconds: '600',
      viewCount: '12345',
      isLiveContent: false,
    },
    microformat: { playerMicroformatRenderer: { publishDate: '2026-01-01' } },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          { baseUrl: 'https://caption.test/auto.xml', languageCode: 'en', kind: 'asr' },
          { baseUrl: 'https://caption.test/manual.xml', languageCode: 'en' },
        ],
      },
    },
    ...overrides,
  };
}

function watchPageHtml(playerResponse) {
  return `<html><body><script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script></body></html>`;
}

function fakeTimedText(lines) {
  const body = lines.map((l, i) => `<text start="${i}" dur="1">${l}</text>`).join('');
  return `<?xml version="1.0" encoding="utf-8" ?><transcript>${body}</transcript>`;
}

function mockFetch(routes) {
  return async (url) => {
    for (const [pattern, handler] of routes) {
      if (typeof pattern === 'string' ? url.includes(pattern) : pattern.test(url)) {
        return handler(url);
      }
    }
    throw new Error(`mockFetch: sin ruta para ${url}`);
  };
}

function okResponse(text) {
  return { ok: true, status: 200, text: async () => text };
}

describe('YouTubeTranscriptBackend — extracción de video id', () => {
  test('URL inválida (no YouTube) devuelve ok:false sin intentar red', async () => {
    const backend = new YouTubeTranscriptBackend({ fetchImpl: async () => { throw new Error('no debería llamarse'); } });
    const result = await backend.fetch('https://ejemplo-ficticio.test/no-es-youtube');
    assert.equal(result.ok, false);
    assert.equal(result.error, 'invalid_youtube_url');
  });

  test('acepta youtu.be y youtube.com/watch?v=', async () => {
    const backend1 = new YouTubeTranscriptBackend({
      fetchImpl: mockFetch([[/youtube\.com\/watch/, () => okResponse(watchPageHtml(fakePlayerResponse()))], [/caption\.test/, () => okResponse(fakeTimedText(['hola']))]]),
    });
    const r1 = await backend1.fetch('https://youtu.be/abc12345678');
    assert.equal(r1.ok, true);
    assert.equal(r1.videoId, 'abc12345678');
  });
});

describe('YouTubeTranscriptBackend — metadata pública (OBSERVADO)', () => {
  test('extrae título/canal/duración/fecha/viewCount desde el JSON público embebido, con JSON que contiene llaves y comillas dentro de strings', async () => {
    const backend = new YouTubeTranscriptBackend({
      fetchImpl: mockFetch([[/youtube\.com\/watch/, () => okResponse(watchPageHtml(fakePlayerResponse()))], [/caption\.test\/manual/, () => okResponse(fakeTimedText(['Hola', 'mundo']))]]),
    });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');
    assert.equal(result.ok, true);
    assert.match(result.metadata.title, /comillas/);
    assert.equal(result.metadata.channel, 'Canal de Prueba');
    assert.equal(result.metadata.durationSeconds, 600);
    assert.equal(result.metadata.publishDate, '2026-01-01');
    assert.equal(result.metadata.viewCount, 12345);
  });

  test('views_available=true, pero likes/comments SIEMPRE null con motivo explícito — nunca inventados', async () => {
    const backend = new YouTubeTranscriptBackend({
      fetchImpl: mockFetch([[/youtube\.com\/watch/, () => okResponse(watchPageHtml(fakePlayerResponse()))], [/caption\.test\/manual/, () => okResponse(fakeTimedText(['x']))]]),
    });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');
    assert.equal(result.metrics.views, 12345);
    assert.equal(result.metrics.views_available, true);
    assert.equal(result.metrics.likes, null);
    assert.equal(result.metrics.likes_available, false);
    assert.ok(result.metrics.likes_reason.length > 0);
    assert.equal(result.metrics.comments, null);
    assert.ok(result.metrics.comments_reason.length > 0);
  });
});

describe('YouTubeTranscriptBackend — jerarquía de subtítulos (manual > automático)', () => {
  test('con pista manual Y automática disponibles, prefiere la manual', async () => {
    let requestedCaptionUrl = null;
    const backend = new YouTubeTranscriptBackend({
      fetchImpl: mockFetch([
        [/youtube\.com\/watch/, () => okResponse(watchPageHtml(fakePlayerResponse()))],
        [/caption\.test/, (url) => { requestedCaptionUrl = url; return okResponse(fakeTimedText(['contenido de la pista'])); }],
      ]),
    });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');
    assert.equal(requestedCaptionUrl, 'https://caption.test/manual.xml');
    assert.equal(result.transcriptType, 'manual');
  });

  test('sin pista manual, usa la automática (asr)', async () => {
    const onlyAuto = fakePlayerResponse({
      captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: 'https://caption.test/auto.xml', languageCode: 'en', kind: 'asr' }] } },
    });
    const backend = new YouTubeTranscriptBackend({
      fetchImpl: mockFetch([[/youtube\.com\/watch/, () => okResponse(watchPageHtml(onlyAuto))], [/caption\.test/, () => okResponse(fakeTimedText(['auto']))]]),
    });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');
    assert.equal(result.transcriptType, 'auto');
  });

  test('sin ninguna pista de subtítulos, transcriptAvailable=false con motivo — nunca intenta Whisper ni descarga audio', async () => {
    const noCaptions = fakePlayerResponse({ captions: undefined });
    const backend = new YouTubeTranscriptBackend({
      fetchImpl: mockFetch([[/youtube\.com\/watch/, () => okResponse(watchPageHtml(noCaptions))]]),
    });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');
    assert.equal(result.ok, true);
    assert.equal(result.transcriptAvailable, false);
    assert.match(result.transcriptReason, /sin pistas/);
  });
});

describe('YouTubeTranscriptBackend — transcripción (timedtext → texto plano, deduplicado)', () => {
  test('deduplica líneas consecutivas repetidas (mismo problema que subtítulos auto-generados)', async () => {
    const backend = new YouTubeTranscriptBackend({
      fetchImpl: mockFetch([[/youtube\.com\/watch/, () => okResponse(watchPageHtml(fakePlayerResponse()))], [/caption\.test\/manual/, () => okResponse(fakeTimedText(['Hola', 'Hola', 'mundo']))]]),
    });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');
    assert.equal(result.transcript, 'Hola mundo');
  });

  test('decodifica entidades HTML en el texto de la pista', async () => {
    const backend = new YouTubeTranscriptBackend({
      fetchImpl: mockFetch([[/youtube\.com\/watch/, () => okResponse(watchPageHtml(fakePlayerResponse()))], [/caption\.test\/manual/, () => okResponse(fakeTimedText(['Tom &amp; Jerry']))]]),
    });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');
    assert.equal(result.transcript, 'Tom & Jerry');
  });
});

describe('YouTubeTranscriptBackend — bloqueo/privado/login: nunca se intenta evadir', () => {
  test('página de consentimiento/antibot se reporta como blocked', async () => {
    const backend = new YouTubeTranscriptBackend({
      fetchImpl: async () => okResponse('<html>Before you continue to YouTube...</html>'),
    });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');
    assert.equal(result.blocked, true);
    assert.equal(result.blockReason, 'consent_or_antibot_page');
  });

  test('video privado/con login requerido nunca se fuerza — se reporta authRequired', async () => {
    const loginRequired = fakePlayerResponse({ playabilityStatus: { status: 'LOGIN_REQUIRED' } });
    const backend = new YouTubeTranscriptBackend({ fetchImpl: async () => okResponse(watchPageHtml(loginRequired)) });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');
    assert.equal(result.ok, false);
    assert.equal(result.authRequired, true);
  });

  test('video eliminado/no reproducible (UNPLAYABLE) se reporta como error, no como éxito parcial', async () => {
    const unplayable = fakePlayerResponse({ playabilityStatus: { status: 'ERROR' } });
    const backend = new YouTubeTranscriptBackend({ fetchImpl: async () => okResponse(watchPageHtml(unplayable)) });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');
    assert.equal(result.ok, false);
    assert.equal(result.authRequired, false);
  });

  test('HTTP no-ok en la página de watch se reporta como error, nunca como bloqueado sin evidencia', async () => {
    const backend = new YouTubeTranscriptBackend({ fetchImpl: async () => ({ ok: false, status: 404, text: async () => '' }) });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');
    assert.equal(result.ok, false);
    assert.equal(result.error, 'http_404');
  });

  test('página sin ytInitialPlayerResponse parseable se reporta como error explícito, nunca inventa metadata', async () => {
    const backend = new YouTubeTranscriptBackend({ fetchImpl: async () => okResponse('<html>contenido irrelevante</html>') });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');
    assert.equal(result.ok, false);
    assert.equal(result.error, 'unparseable_page_structure');
  });
});
