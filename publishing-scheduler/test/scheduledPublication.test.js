import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createScheduledPublication, SCHEDULED_PUBLICATION_STATUSES, SCHEDULABLE_PLATFORMS } from '../src/scheduledPublication.js';

function completedPackage(overrides = {}) {
  return { requestId: 'req-1', status: 'COMPLETED', assetPackageType: 'SINGLE', outputAssets: [{ assetId: 'asset-1', path: '/tmp/final.mp4' }], ...overrides };
}

describe('createScheduledPublication', () => {
  test('crea un registro DRAFT real con todos los campos del modelo', () => {
    const rec = createScheduledPublication({ assetPackage: completedPackage(), platform: 'INSTAGRAM', caption: 'Hola' });
    assert.equal(rec.status, 'DRAFT');
    assert.ok(rec.id);
    assert.equal(rec.assetPackageId, 'req-1');
    assert.equal(rec.platform, 'INSTAGRAM');
    assert.equal(rec.caption, 'Hola');
    assert.equal(rec.retryCount, 0);
    assert.equal(rec.externalPublicationId, null);
    assert.ok(SCHEDULED_PUBLICATION_STATUSES.includes(rec.status));
  });

  test('rechaza un Final Asset Package que no está COMPLETED', () => {
    assert.throws(() => createScheduledPublication({ assetPackage: completedPackage({ status: 'PARTIAL' }), platform: 'INSTAGRAM', caption: 'Hola' }), /COMPLETED/);
  });

  test('rechaza platform no soportada', () => {
    assert.throws(() => createScheduledPublication({ assetPackage: completedPackage(), platform: 'WHATSAPP', caption: 'Hola' }));
    assert.deepEqual(SCHEDULABLE_PLATFORMS, ['INSTAGRAM', 'FACEBOOK']);
  });

  test('rechaza caption vacío', () => {
    assert.throws(() => createScheduledPublication({ assetPackage: completedPackage(), platform: 'FACEBOOK', caption: '  ' }));
  });

  test('rechaza sin assetPackage', () => {
    assert.throws(() => createScheduledPublication({ platform: 'FACEBOOK', caption: 'Hola' }));
  });
});
