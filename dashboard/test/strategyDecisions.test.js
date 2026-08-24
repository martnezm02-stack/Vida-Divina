// strategyDecisions.test.js — Strategy Decision Engine, Fase 22/27 (filtros
// API + solo lectura + sin endpoint de ejecución). Servidor HTTP real
// (puerto efímero) golpeado con fetch() real, mismo patrón que
// learning.test.js/intelligence.test.js.

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
async function post(path) {
  const res = await fetch(`${baseUrl}${path}`, { method: 'POST' });
  return { status: res.status };
}

describe('GET /api/strategy-decisions', () => {
  test('sin filtros: 200, arreglo real, executionStatus siempre NOT_EXECUTED', async () => {
    const { status, body } = await get('/api/strategy-decisions');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
    for (const d of body) {
      assert.equal(d.executionStatus, 'NOT_EXECUTED');
      assert.ok(['ACCEPT', 'REJECT', 'DEFER'].includes(d.decision));
      assert.doesNotMatch(d.decisionReason, /\bcausa\b/i);
    }
  });

  test('decision inválida -- 400', async () => { assert.equal((await get('/api/strategy-decisions?decision=MAYBE')).status, 400); });
  test('risk inválido -- 400', async () => { assert.equal((await get('/api/strategy-decisions?risk=EXTREME')).status, 400); });
  test('scope inválido -- 400', async () => { assert.equal((await get('/api/strategy-decisions?scope=REGION')).status, 400); });

  test('ninguna decisión REJECT existe sin contradictions/supersedes (Fase 15, re-verificado end-to-end)', async () => {
    const { body } = await get('/api/strategy-decisions?decision=REJECT');
    assert.ok(body.every((d) => d.contradictions.length > 0 || d.supersedes));
  });
});

describe('GET /api/strategy-decisions/summary', () => {
  test('200, status OK o INSUFFICIENT_DECISION_DATA -- ambos válidos', async () => {
    const { status, body } = await get('/api/strategy-decisions/summary');
    assert.equal(status, 200);
    assert.ok(['OK', 'INSUFFICIENT_DECISION_DATA'].includes(body.status));
  });
});

describe('sin endpoint de ejecución (Fase 22/25)', () => {
  test('no existe ninguna ruta que ejecute una decisión', async () => {
    for (const path of ['/api/strategy-decisions/execute', '/api/strategy-decisions/accept', '/api/strategy-decisions/apply']) {
      const { status } = await post(path);
      assert.notEqual(status, 200);
    }
  });
});
