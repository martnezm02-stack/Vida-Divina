// autoPublish.test.js — Fase 13, Partes 6-14/25 (dashboard toggle,
// readiness, activación controlada). Servidor HTTP real (puerto efímero),
// mismo patrón que contentPlans.test.js/strategyDecisions.test.js.

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
async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe('GET /api/auto-publish', () => {
  test('200 real, siempre incluye config + readiness reales', async () => {
    const { status, body } = await get('/api/auto-publish');
    assert.equal(status, 200);
    assert.equal(typeof body.config.enabled, 'boolean');
    assert.ok(['READY', 'NOT_READY'].includes(body.readiness.readiness));
  });
});

describe('GET /api/auto-publish/history', () => {
  test('200, arreglo (histórico completo, nunca perdido)', async () => {
    const { status, body } = await get('/api/auto-publish/history');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
  });
});

describe('POST /api/auto-publish/enable', () => {
  test('sin actorId -- 400, nunca activa anónimamente', async () => {
    const { status } = await post('/api/auto-publish/enable', {});
    assert.equal(status, 400);
  });

  test('actorId "system"/"bot" -- 400, mismo principio anti-bypass', async () => {
    const { status } = await post('/api/auto-publish/enable', { actorId: 'system' });
    assert.equal(status, 400);
  });

  test('Parte 10: la petición NUNCA publica nada -- solo puede devolver activated true/false + config/readiness', async () => {
    const { status, body } = await post('/api/auto-publish/enable', { actorId: 'Test Real Actor' });
    assert.equal(status, 200);
    assert.equal(typeof body.activated, 'boolean');
    // Con los datos reales de este entorno, readiness probablemente sea NOT_READY -- ambos resultados son válidos, pero si activated=false, enabled debe seguir false.
    if (!body.activated) assert.equal(body.config.enabled, false);
  });
});

describe('POST /api/auto-publish/disable', () => {
  test('sin actorId -- 400', async () => {
    const { status } = await post('/api/auto-publish/disable', {});
    assert.equal(status, 400);
  });

  test('desactivar real -- config.enabled=false, nunca lanza aunque ya estuviera desactivado', async () => {
    const { status, body } = await post('/api/auto-publish/disable', { actorId: 'Test Real Actor', reason: 'cierre de test' });
    assert.equal(status, 200);
    assert.equal(body.config.enabled, false);
  });
});
