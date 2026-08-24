// learning.test.js — Learning & Strategy Feedback Engine, Fase 18/23
// (filtros API + comportamiento de solo lectura). Servidor HTTP real
// (puerto efímero) golpeado con fetch() real, mismo patrón que
// intelligence.test.js/attribution.test.js. Lee el performanceLearningStore
// real del proyecto -- solo valida forma/contrato y validación de filtros.

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

describe('GET /api/learning', () => {
  test('sin filtros: 200, arreglo real', async () => {
    const { status, body } = await get('/api/learning');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
    for (const lr of body) {
      assert.ok(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].includes(lr.confidence));
      assert.doesNotMatch(lr.observation, /\bcausa\b/i);
      assert.ok('supersededBy' in lr);
    }
  });

  test('platform inválido -- 400', async () => { assert.equal((await get('/api/learning?platform=tiktok')).status, 400); });
  test('learningType inválido -- 400', async () => { assert.equal((await get('/api/learning?learningType=NOT_A_TYPE')).status, 400); });
  test('confidence inválida -- 400', async () => { assert.equal((await get('/api/learning?confidence=CERTAIN')).status, 400); });

  test('DATA_QUALITY_LEARNING nunca trae recommendation (§21)', async () => {
    const { body } = await get('/api/learning?learningType=DATA_QUALITY_LEARNING');
    assert.ok(body.every((lr) => lr.recommendation === null));
  });
});

describe('GET /api/learning/summary', () => {
  test('200, status OK o INSUFFICIENT_LEARNING_DATA -- ambos válidos', async () => {
    const { status, body } = await get('/api/learning/summary');
    assert.equal(status, 200);
    assert.ok(['OK', 'INSUFFICIENT_LEARNING_DATA'].includes(body.status));
  });
  test('platform inválido -- 400', async () => { assert.equal((await get('/api/learning/summary?platform=tiktok')).status, 400); });
});

describe('GET /api/strategy-feedback', () => {
  test('sin filtros: 200, arreglo real, todo status=PROPOSED (sin workflow de aprobación todavía)', async () => {
    const { status, body } = await get('/api/strategy-feedback');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
    assert.ok(body.every((sf) => sf.status === 'PROPOSED'));
  });

  test('status inválido -- 400', async () => { assert.equal((await get('/api/strategy-feedback?status=AUTO_APPLIED')).status, 400); });
});
