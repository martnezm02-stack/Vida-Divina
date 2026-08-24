// contentPlans.test.js — Content Planning & Execution, Fase 22/23/29
// (filtros API + solo lectura + sin endpoint de ejecución). Servidor HTTP
// real (puerto efímero), mismo patrón que strategyDecisions.test.js.

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

describe('GET /api/content-plans', () => {
  test('sin filtros: 200, arreglo real', async () => {
    const { status, body } = await get('/api/content-plans');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
    for (const p of body) {
      assert.ok(['PREPARE_ONLY', 'HUMAN_REVIEW', 'AUTO_PUBLISH'].includes(p.executionMode));
      assert.ok(Array.isArray(p.strategyDecisionIds));
    }
  });

  test('status inválido -- 400', async () => { assert.equal((await get('/api/content-plans?status=MADE_UP')).status, 400); });
  test('executionMode inválido -- 400', async () => { assert.equal((await get('/api/content-plans?executionMode=MADE_UP')).status, 400); });

  test('ningún ContentPlan real de AUTO_PUBLISH llegó a PUBLISHED/PUBLISHING (Fase 13 §29: nunca se publicó/llamó Meta durante la validación)', async () => {
    const { body } = await get('/api/content-plans?executionMode=AUTO_PUBLISH');
    assert.ok(body.every((p) => !['PUBLISHED', 'PUBLISHING'].includes(p.status)));
    // SCHEDULED solo puede ocurrir con la política real explícitamente activada y elegibilidad real -- nunca de forma implícita.
    for (const p of body.filter((x) => x.status === 'SCHEDULED')) assert.equal(p.autoPublish?.eligible, true);
  });
});

describe('GET /api/content-plans/:id', () => {
  test('id inexistente -- 404 real', async () => {
    const { status } = await get('/api/content-plans/no-existe-123');
    assert.equal(status, 404);
  });
});

describe('sin endpoint de ejecución/publicación (Fase 23)', () => {
  test('no existe ninguna ruta que ejecute/publique un ContentPlan', async () => {
    for (const path of ['/api/content-plans/execute', '/api/content-plans/publish', '/api/content-plans/auto-publish']) {
      const { status } = await post(path);
      assert.notEqual(status, 200);
    }
  });
});
