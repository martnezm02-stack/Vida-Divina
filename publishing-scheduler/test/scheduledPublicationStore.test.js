import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../src/scheduledPublicationStore.js';
import { createScheduledPublication } from '../src/scheduledPublication.js';

function completedPackage() {
  return { requestId: `req-${Math.random().toString(36).slice(2)}`, status: 'COMPLETED', assetPackageType: 'SINGLE', outputAssets: [{ assetId: 'asset-1', path: '/tmp/final.mp4' }] };
}

const createdIds = [];
after(() => { for (const id of createdIds) store.del(id); });

describe('scheduledPublicationStore', () => {
  test('save/get/exists/list/delete real sobre archivo', () => {
    const rec = createScheduledPublication({ assetPackage: completedPackage(), platform: 'INSTAGRAM', caption: 'Hola' });
    createdIds.push(rec.id);

    assert.equal(store.exists(rec.id), false);
    store.save(rec);
    assert.equal(store.exists(rec.id), true);

    const loaded = store.get(rec.id);
    assert.equal(loaded.id, rec.id);
    assert.equal(loaded.status, 'DRAFT');

    assert.ok(store.list().some((r) => r.id === rec.id));

    const ok = store.del(rec.id);
    assert.equal(ok, true);
    assert.equal(store.exists(rec.id), false);
    assert.equal(store.get(rec.id), null);
  });

  test('save es upsert -- una segunda llamada con el mismo id sobrescribe, nunca duplica', () => {
    const rec = createScheduledPublication({ assetPackage: completedPackage(), platform: 'FACEBOOK', caption: 'Hola' });
    createdIds.push(rec.id);
    store.save(rec);
    store.save({ ...rec, status: 'APPROVED' });
    const loaded = store.get(rec.id);
    assert.equal(loaded.status, 'APPROVED');
    assert.equal(store.list().filter((r) => r.id === rec.id).length, 1);
  });

  test('get de un id inexistente devuelve null, nunca lanza', () => {
    assert.equal(store.get('no-existe-id'), null);
  });
});
