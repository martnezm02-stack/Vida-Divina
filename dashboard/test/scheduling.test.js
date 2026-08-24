// scheduling.test.js — suite real del CALENDARIO (Media Hosting +
// Publishing Scheduler) sobre el servidor HTTP real del dashboard (puerto
// efímero, nunca mockeado). En este entorno no hay credenciales R2 ni Meta
// configuradas -- la cadena completa se prueba hasta CONFIGURATION_REQUIRED
// explícito, nunca se intenta una publicación real (§16 del encargo).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PORT = '0';
process.env.DASHBOARD_NO_SCHEDULER = '1'; // el tick automático no debe correr durante el test -- se dispara manualmente vía /api/schedule/run-now.
delete process.env.DASHBOARD_NO_LISTEN;

const { server } = await import('../server/index.js');
const scheduledPublicationStore = await import('../../publishing-scheduler/src/scheduledPublicationStore.js');

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

function tempFinalAsset() {
  const dir = mkdtempSync(join(tmpdir(), 'dash-sched-test-'));
  const p = join(dir, 'final.mp4');
  writeFileSync(p, 'contenido real de prueba');
  return p;
}

function completedPackage() {
  return { requestId: `req-${Math.random().toString(36).slice(2)}`, status: 'COMPLETED', assetPackageType: 'SINGLE', outputAssets: [{ assetId: `asset-${Math.random().toString(36).slice(2)}`, path: tempFinalAsset() }] };
}

const createdIds = [];
after(() => { for (const id of createdIds) scheduledPublicationStore.del(id); });

describe('CALENDARIO — HTTP real', () => {
  test('GET /api/media-hosting/status refleja que R2 no está configurado en este entorno', async () => {
    const { status, body } = await get('/api/media-hosting/status');
    assert.equal(status, 200);
    assert.equal(body.configured, false);
  });

  test('POST /api/schedule crea un registro DRAFT real; GET /api/schedule lo lista; GET /api/schedule/:id lo recupera', async () => {
    const { status, body } = await post('/api/schedule', { assetPackage: completedPackage(), platform: 'INSTAGRAM', caption: 'Hola desde el dashboard' });
    assert.equal(status, 200);
    assert.equal(body.status, 'DRAFT');
    createdIds.push(body.id);

    const list = await get('/api/schedule');
    assert.ok(list.body.some((r) => r.id === body.id));

    const single = await get(`/api/schedule/${body.id}`);
    assert.equal(single.body.id, body.id);
    assert.equal(single.body.assetPackageSnapshot.status, 'COMPLETED');
  });

  test('POST /api/schedule rechaza sin caption real', async () => {
    const { status, body } = await post('/api/schedule', { assetPackage: completedPackage(), platform: 'INSTAGRAM' });
    assert.equal(status, 400);
    assert.match(body.error, /caption/);
  });

  test('flujo completo: crear -> aprobar -> programar -> cancelar', async () => {
    const created = await post('/api/schedule', { assetPackage: completedPackage(), platform: 'FACEBOOK', caption: 'Cancelable' });
    createdIds.push(created.body.id);

    const approved = await post(`/api/schedule/${created.body.id}/approve`, { approvedBy: 'martnezm02' });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.status, 'APPROVED');

    const programmed = await post(`/api/schedule/${created.body.id}/program`, { date: '2026-08-25', time: '08:30', timezone: 'America/Mexico_City' });
    assert.equal(programmed.status, 200);
    assert.equal(programmed.body.status, 'SCHEDULED');
    assert.equal(programmed.body.scheduledAt, '2026-08-25T14:30:00.000Z');

    const cancelled = await post(`/api/schedule/${created.body.id}/cancel`, {});
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.status, 'CANCELLED');
  });

  test('approve sin approvedBy responde 400, nunca aprueba anónimamente', async () => {
    const created = await post('/api/schedule', { assetPackage: completedPackage(), platform: 'INSTAGRAM', caption: 'Sin aprobador' });
    createdIds.push(created.body.id);
    const { status, body } = await post(`/api/schedule/${created.body.id}/approve`, {});
    assert.equal(status, 400);
    assert.match(body.error, /approvedBy/);
  });

  test('publicación vencida real vía /api/schedule/run-now: sin credenciales R2, CONFIGURATION_REQUIRED explícito, nunca PUBLISHED falso', async () => {
    const created = await post('/api/schedule', { assetPackage: completedPackage(), platform: 'INSTAGRAM', caption: 'Vencida real' });
    createdIds.push(created.body.id);
    await post(`/api/schedule/${created.body.id}/approve`, { approvedBy: 'martnezm02' });
    // Se programa a una fecha claramente pasada -- ya vencida en el momento del run-now.
    await post(`/api/schedule/${created.body.id}/program`, { date: '2020-01-01', time: '00:00', timezone: 'UTC' });

    const run = await post('/api/schedule/run-now', {});
    assert.equal(run.status, 200);
    const processed = run.body.results.find((r) => r.id === created.body.id);
    assert.ok(processed, 'el registro vencido debe aparecer en los resultados del tick real');
    assert.equal(processed.status, 'CONFIGURATION_REQUIRED');
    assert.match(processed.error, /R2/);
  });

  test('PUBLICAR AHORA (/api/publish) sigue funcionando sin CALENDARIO -- sin credenciales, CONFIGURATION_REQUIRED real del adapter (nunca falla con un error genérico)', async () => {
    const pkg = completedPackage();
    const { status, body } = await post('/api/publish', { assetPackage: pkg, platform: 'INSTAGRAM', caption: 'Publicación inmediata' });
    assert.equal(status, 200);
    assert.equal(body.status, 'CONFIGURATION_REQUIRED');
  });
});
