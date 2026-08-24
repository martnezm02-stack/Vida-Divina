import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createCampaign, CAMPAIGN_EXECUTION_MODES, CAMPAIGN_PLATFORMS, CAMPAIGN_FREQUENCIES } from '../src/campaign.js';

const validFields = {
  name: 'Lanzamiento TéDivina Septiembre',
  objective: 'INSTAGRAM_ENGAGEMENT',
  productId: 'tedivina',
  platform: 'INSTAGRAM_REEL',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  targetContentCount: 8,
  frequency: 'WEEKLY',
};

describe('Campaign — contrato (Fase 14, Parte 8)', () => {
  test('crea una campaña real con executionMode por defecto PREPARE_ONLY (el más seguro)', () => {
    const c = createCampaign(validFields);
    assert.ok(c.id);
    assert.equal(c.executionMode, 'PREPARE_ONLY');
    assert.equal(c.status, 'ACTIVE');
    assert.ok(c.createdAt);
  });

  test('objeto inmutable', () => {
    const c = createCampaign(validFields);
    assert.throws(() => { c.name = 'otro'; }, TypeError);
  });

  test('rechaza campos obligatorios ausentes', () => {
    assert.throws(() => createCampaign({ ...validFields, name: '' }), /name/);
    assert.throws(() => createCampaign({ ...validFields, objective: '' }), /objective/);
    assert.throws(() => createCampaign({ ...validFields, productId: '' }), /productId/);
  });

  test('rechaza platform/frequency/executionMode inválidos -- nunca inventa un valor no soportado', () => {
    assert.throws(() => createCampaign({ ...validFields, platform: 'TIKTOK' }), /platform/);
    assert.throws(() => createCampaign({ ...validFields, frequency: 'HOURLY' }), /frequency/);
    assert.throws(() => createCampaign({ ...validFields, executionMode: 'MAGIC' }), /executionMode/);
  });

  test('rechaza fechas inválidas o endDate anterior a startDate', () => {
    assert.throws(() => createCampaign({ ...validFields, startDate: 'not-a-date' }), /startDate/);
    assert.throws(() => createCampaign({ ...validFields, endDate: '2026-08-01' }), /endDate/);
  });

  test('rechaza targetContentCount no entero o menor a 1', () => {
    assert.throws(() => createCampaign({ ...validFields, targetContentCount: 0 }), /targetContentCount/);
    assert.throws(() => createCampaign({ ...validFields, targetContentCount: 2.5 }), /targetContentCount/);
  });

  test('vocabularios reales expuestos para el dashboard', () => {
    assert.ok(CAMPAIGN_PLATFORMS.includes('INSTAGRAM_REEL'));
    assert.ok(CAMPAIGN_FREQUENCIES.includes('WEEKLY'));
    assert.deepEqual(CAMPAIGN_EXECUTION_MODES, ['PREPARE_ONLY', 'HUMAN_REVIEW', 'AUTO_PUBLISH']);
  });
});
