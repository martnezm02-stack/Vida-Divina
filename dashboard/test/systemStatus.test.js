// systemStatus.test.js — GET /api/system-status (Fase 14, Parte 2: VIDA
// DIVINA COMMAND CENTER). Servidor real, puerto efímero. autoPublish.enabled
// se lee con la misma getCurrentAutoPublishConfig() real que usa
// /api/auto-publish (autoPublish.js) -- por construcción nunca puede
// divergir, así que no se repite como un segundo test HTTP (sería una
// comparación de dos lecturas separadas, sensible a otras suites que
// activan/desactivan la política real en paralelo sobre el mismo store).

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

describe('GET /api/system-status', () => {
  test('200, estructura real por subsistema', async () => {
    const res = await fetch(`${baseUrl}/api/system-status`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.contentGeneration.status, 'OPERATIONAL');
    assert.equal(typeof body.contentGeneration.voiceEngineReachable, 'boolean');
    assert.equal(typeof body.publishing.instagram.configured, 'boolean');
    assert.equal(typeof body.publishing.facebook.configured, 'boolean');
    assert.equal(typeof body.publishing.whatsapp.configured, 'boolean');
    assert.equal(typeof body.publishing.mediaHosting.configured, 'boolean');
    assert.equal(typeof body.performance.publishedCount, 'number');
    assert.equal(typeof body.autoPublish.enabled, 'boolean');
    assert.ok(['READY', 'NOT_READY'].includes(body.autoPublish.readiness));
  });
});
