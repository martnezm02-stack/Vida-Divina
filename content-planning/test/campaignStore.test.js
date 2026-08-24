import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';

import { createCampaign } from '../src/campaign.js';
import * as campaignStore from '../src/campaignStore.js';

const createdIds = [];
after(() => { for (const id of createdIds) campaignStore.del(id); });

function realCampaign(overrides = {}) {
  const c = createCampaign({
    name: 'Campaña de prueba real',
    objective: 'INSTAGRAM_ENGAGEMENT',
    productId: 'tedivina',
    platform: 'INSTAGRAM_REEL',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    targetContentCount: 4,
    frequency: 'WEEKLY',
    ...overrides,
  });
  createdIds.push(c.id);
  return c;
}

describe('campaignStore — persistencia real (Fase 14, Parte 8)', () => {
  test('save/get real -- upsert por id', () => {
    const c = realCampaign();
    campaignStore.save(c);
    const loaded = campaignStore.get(c.id);
    assert.deepEqual(loaded, c);
  });

  test('get de un id inexistente devuelve null -- nunca inventa un registro', () => {
    assert.equal(campaignStore.get('00000000-0000-0000-0000-000000000000'), null);
  });

  test('list incluye las campañas reales guardadas', () => {
    const c = realCampaign({ name: 'Otra campaña real' });
    campaignStore.save(c);
    const all = campaignStore.list();
    assert.ok(all.some((x) => x.id === c.id));
  });
});
