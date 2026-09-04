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

  // Corrección "Persistencia de fecha/hora/timezone desde DRAFT" (2026-09-04).
  describe('date/time/timezone opcionales desde DRAFT', () => {
    test('TEST 1/2: si se pasan date/time/timezone válidos, quedan persistidos en el registro DRAFT (nunca en scheduledAt)', () => {
      const rec = createScheduledPublication({
        assetPackage: completedPackage(), platform: 'INSTAGRAM', caption: 'Hola',
        date: '2027-01-15', time: '10:00', timezone: 'America/Mexico_City',
      });
      assert.equal(rec.status, 'DRAFT');
      assert.equal(rec.pendingDate, '2027-01-15');
      assert.equal(rec.pendingTime, '10:00');
      assert.equal(rec.timezone, 'America/Mexico_City');
      // scheduledAt sigue significando EXCLUSIVAMENTE "ya confirmado en SCHEDULED" -- un DRAFT nunca lo tiene, aunque traiga pending*.
      assert.equal(rec.scheduledAt, null);
    });

    test('TEST 7: sin date/time/timezone (uso preexistente), el registro queda igual que antes -- backward compatible', () => {
      const rec = createScheduledPublication({ assetPackage: completedPackage(), platform: 'INSTAGRAM', caption: 'Hola' });
      assert.equal(rec.pendingDate, null);
      assert.equal(rec.pendingTime, null);
      assert.equal(rec.timezone, null);
      assert.equal(rec.scheduledAt, null);
    });

    test('rechaza date/time/timezone incompletos o inválidos (misma validación real que /program, zonedTimeToUtcIso)', () => {
      assert.throws(() => createScheduledPublication({ assetPackage: completedPackage(), platform: 'INSTAGRAM', caption: 'Hola', date: '2027-01-15' }), /time/i);
      assert.throws(() => createScheduledPublication({ assetPackage: completedPackage(), platform: 'INSTAGRAM', caption: 'Hola', date: '2027-01-15', time: '10:00', timezone: 'No/Existe' }), /timeZone/i);
    });
  });
});
