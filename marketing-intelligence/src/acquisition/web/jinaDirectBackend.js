// jinaDirectBackend.js — Backend de adquisición Web: Jina Reader, llamado
// directamente (SIN Agent Reach instalado). Es exactamente la lógica que
// vivía en webAdapter.js desde la Fase 2 — se extrajo aquí para que el
// Adapter pueda elegir entre este backend y otros (ver agentReachWebBackend.js)
// sin cambiar su propio código.
//
// Backend por defecto (WEB_BACKEND=jina o sin configurar).

import { AcquisitionBackend } from '../acquisitionBackend.js';

const JINA_READER_BASE = 'https://r.jina.ai/';
const ANTIBOT_MARKERS = [/attention required.*cloudflare/i, /\bcaptcha\b/i, /verifying you are human/i];

function looksLikeAntiBot(text) {
  const head = text.slice(0, 4096);
  return ANTIBOT_MARKERS.some((re) => re.test(head));
}

function extractTitle(markdown) {
  const match = markdown.match(/^Title:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

export class JinaDirectBackend extends AcquisitionBackend {
  get name() {
    return 'jina_direct';
  }

  async fetch(url, { timeoutMs = 20000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${JINA_READER_BASE}${url}`, { signal: controller.signal });
      const text = await response.text();

      if (!response.ok) {
        return { ok: false, blocked: false, httpStatus: response.status, title: null, text: '' };
      }
      if (looksLikeAntiBot(text)) {
        return { ok: false, blocked: true, blockReason: 'antibot_page_detected', httpStatus: response.status, title: null, text: '' };
      }
      return { ok: true, blocked: false, httpStatus: response.status, title: extractTitle(text), text };
    } finally {
      clearTimeout(timer);
    }
  }
}
