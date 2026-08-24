// httpDirectBackend.js — Backend de adquisición REAL por defecto (Fase 8).
//
// Hace exactamente un fetch() HTTP directo a la URL y lee el HTML servido por
// el servidor — SIN ejecutar JavaScript, SIN renderizar, SIN interactuar. Es
// "leer una página", no "observar una página": captura solo lo que el
// servidor entrega en la respuesta inicial. Páginas que dependen de
// client-side rendering para su contenido principal solo se leerán
// parcialmente con este backend — eso es una limitación real y documentada
// (ver informe §2), no un defecto oculto.
//
// capabilities: rendersJavaScript=false, capturesScreenshots=false,
// capturesInteractions=false, respectsViewport=false (no hay concepto de
// viewport sin un motor de layout real), supportsAuthentication=false.
//
// Es el backend recomendado como DEFAULT en esta fase porque:
//   1. No depende de ninguna herramienta externa ni de instalar nada nuevo.
//   2. No depende de claude-in-chrome, que se verificó NO CONECTADO en este
//      entorno (ver informe §1) — a diferencia de asumirlo disponible.
//   3. Cubre honestamente los casos donde de verdad basta con leer HTML
//      servidor (estructura semántica, metadatos, muchos sitios de
//      referencia estáticos o server-rendered).

import { AcquisitionBackend } from '../acquisitionBackend.js';

const LOGIN_WALL_MARKERS = [/<input[^>]+type=["']?password["']?/i, /\/login(\?|["'])/i, /sign[\s-]?in to continue/i];
const ANTIBOT_MARKERS = [/attention required.*cloudflare/i, /\bcaptcha\b/i, /verifying you are human/i];

function looksLikeLoginWall(html) {
  const head = html.slice(0, 8192);
  return LOGIN_WALL_MARKERS.some((re) => re.test(head));
}

function looksLikeAntiBot(html) {
  const head = html.slice(0, 4096);
  return ANTIBOT_MARKERS.some((re) => re.test(head));
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim() : null;
}

function stripTags(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export class HttpDirectBackend extends AcquisitionBackend {
  constructor({ fetchImpl = fetch } = {}) {
    super();
    this._fetchImpl = fetchImpl;
  }

  get name() {
    return 'http_direct';
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this._fetchImpl(url, { signal: controller.signal, redirect: 'follow' });
      const html = await response.text();

      if (response.status === 401 || response.status === 403) {
        return { ok: false, blocked: false, authRequired: true, httpStatus: response.status, html: null, text: null, title: null };
      }
      if (!response.ok) {
        return { ok: false, blocked: false, authRequired: false, httpStatus: response.status, html: null, text: null, title: null };
      }
      if (looksLikeAntiBot(html)) {
        return { ok: false, blocked: true, authRequired: false, httpStatus: response.status, html: null, text: null, title: null };
      }
      if (looksLikeLoginWall(html)) {
        return { ok: false, blocked: false, authRequired: true, httpStatus: response.status, html: null, text: null, title: null };
      }

      return { ok: true, blocked: false, authRequired: false, httpStatus: response.status, html, text: stripTags(html), title: extractTitle(html) };
    } finally {
      clearTimeout(timer);
    }
  }
}
