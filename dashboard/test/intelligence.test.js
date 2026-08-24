// intelligence.test.js — Marketing Intelligence Engine, Fase 16/18 (filtros
// API). Servidor HTTP real (puerto efímero) golpeado con fetch() real,
// mismo patrón que attribution/performance. Lee el performanceLearningStore
// real del proyecto (compartido con Performance/Attribution) -- por eso
// solo valida forma/contrato de la respuesta y validación de filtros, nunca
// cuenta exacta de registros (que depende de qué otras fases ya corrieron).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.PORT = '0';
delete process.env.DASHBOARD_NO_LISTEN;

const { server } = await import('../server/index.js');

let baseUrl;
before(() => new Promise((resolve, reject) => {
  if (server.listening) { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); return; }
  server.once('listening', () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); });
  server.once('error', reject);
}));
after(() => new Promise((resolve) => {
  server.close(() => resolve());
  server.closeAllConnections?.();
}));

async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe('GET /api/intelligence', () => {
  test('sin filtros: 200, arreglo (vacío o con MarketingInsight reales)', async () => {
    const { status, body } = await get('/api/intelligence');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
    for (const insight of body) {
      assert.ok(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].includes(insight.confidence));
      assert.ok(Array.isArray(insight.relatedContentIds));
      assert.doesNotMatch(insight.summary, /\bcausa\b/i);
    }
  });

  test('platform inválido -- 400, nunca ignora el filtro en silencio', async () => {
    const { status } = await get('/api/intelligence?platform=tiktok');
    assert.equal(status, 400);
  });

  test('category inválida -- 400', async () => {
    const { status } = await get('/api/intelligence?category=NOT_A_CATEGORY');
    assert.equal(status, 400);
  });

  test('confidence inválida -- 400', async () => {
    const { status } = await get('/api/intelligence?confidence=CERTAIN');
    assert.equal(status, 400);
  });

  test('category válida filtra correctamente (o arreglo vacío si no hay evidencia todavía)', async () => {
    const { status, body } = await get('/api/intelligence?category=CAMPAIGN_PERFORMANCE');
    assert.equal(status, 200);
    // Fase 8: Campaign Intelligence nunca persiste un insight real (siempre INSUFFICIENT_DATA).
    assert.deepEqual(body, []);
  });
});

describe('GET /api/intelligence/summary', () => {
  test('200, status OK o INSUFFICIENT_MARKETING_INTELLIGENCE -- ambos resultados válidos', async () => {
    const { status, body } = await get('/api/intelligence/summary');
    assert.equal(status, 200);
    assert.ok(['OK', 'INSUFFICIENT_MARKETING_INTELLIGENCE'].includes(body.status));
  });

  test('platform inválido -- 400', async () => {
    const { status } = await get('/api/intelligence/summary?platform=tiktok');
    assert.equal(status, 400);
  });
});
