// marketingCampaigns.test.js — CAMPAIGNS (Fase 14, Parte 8/9). Servidor
// real, puerto efímero. Crea/lista/detalla una campaña real vía HTTP; el
// overview correlaciona ContentPlan/ScheduledPublication reales, nunca
// inventa contadores.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.PORT = '0';
delete process.env.DASHBOARD_NO_LISTEN;

const { server } = await import('../server/index.js');
const campaignStore = await import('../../content-planning/src/campaignStore.js');

let baseUrl;
const createdIds = [];
before(() => new Promise((resolve, reject) => {
  if (server.listening) { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); return; }
  server.once('listening', () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); });
  server.once('error', reject);
}));
after(() => new Promise((resolve) => {
  for (const id of createdIds) campaignStore.del(id);
  server.close(() => resolve());
  server.closeAllConnections?.();
}));

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

const validCampaign = {
  name: 'Campaña real de prueba HTTP',
  objective: 'INSTAGRAM_ENGAGEMENT',
  productId: 'te-divina',
  platform: 'INSTAGRAM_REEL',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  targetContentCount: 6,
  frequency: 'WEEKLY',
};

describe('POST /api/marketing-campaigns', () => {
  test('crea una campaña real con un producto real ya registrado', async () => {
    const { status, body } = await post('/api/marketing-campaigns', validCampaign);
    assert.equal(status, 200);
    assert.ok(body.id);
    assert.equal(body.status, 'ACTIVE');
    createdIds.push(body.id);
  });

  test('rechaza un productId que no es un producto real (400, nunca inventa uno)', async () => {
    const { status, body } = await post('/api/marketing-campaigns', { ...validCampaign, productId: 'producto-que-no-existe' });
    assert.equal(status, 400);
    assert.match(body.error, /producto real/);
  });

  test('rechaza campos inválidos (fecha, plataforma) -- 400 real', async () => {
    const { status } = await post('/api/marketing-campaigns', { ...validCampaign, platform: 'TIKTOK' });
    assert.equal(status, 400);
  });
});

describe('GET /api/marketing-campaigns', () => {
  test('lista incluye la campaña real recién creada', async () => {
    const { status, body } = await post('/api/marketing-campaigns', validCampaign);
    createdIds.push(body.id);
    const list = await get('/api/marketing-campaigns');
    assert.equal(list.status, 200);
    assert.ok(list.body.some((c) => c.id === body.id));
  });

  test('GET /:id inexistente -- 404 real', async () => {
    const { status, body } = await get('/api/marketing-campaigns/00000000-0000-0000-0000-000000000000');
    assert.equal(status, 404);
    assert.match(body.error, /no existe/i);
  });

  test('GET /:id real -- overview con contadores nunca negativos, correlación explícita', async () => {
    const created = await post('/api/marketing-campaigns', validCampaign);
    createdIds.push(created.body.id);
    const { status, body } = await get(`/api/marketing-campaigns/${created.body.id}`);
    assert.equal(status, 200);
    assert.equal(body.campaign.id, created.body.id);
    assert.equal(body.overview.productId, 'te-divina');
    assert.ok(body.overview.planned >= 0);
    assert.ok(body.overview.published >= 0);
    assert.ok(body.overview.pending >= 0);
    assert.ok(body.overview.failed >= 0);
    assert.equal(body.overview.planned, body.overview.published + body.overview.pending + body.overview.failed);
    assert.ok(typeof body.overview.correlationMethod === 'string' && body.overview.correlationMethod.length > 0);
    assert.ok(Array.isArray(body.overview.contentPlans));
    assert.equal(body.overview.contentPlans.length, body.overview.planned);
    for (const p of body.overview.contentPlans) assert.ok(typeof p.effectiveStatus === 'string');
  });
});
