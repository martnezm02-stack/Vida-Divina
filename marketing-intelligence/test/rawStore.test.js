import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RawStore } from '../src/storage/rawStore.js';
import { createRecord } from '../src/contract.js';

describe('RawStore — capa A, separada de la inteligencia derivada', () => {
  let dir;
  let store;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'mi-rawstore-'));
    store = new RawStore(dir);
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('guarda un registro nuevo', () => {
    const record = createRecord({ source: 'web', platform_object_type: 'article', url: 'https://a.com', content: 'contenido único 1', access_method: 'specialized_tool' });
    const result = store.save(record);
    assert.equal(result.stored, true);
    assert.equal(store.loadAll('web').length, 1);
  });

  test('deduplica por content_hash: no vuelve a guardar contenido idéntico', () => {
    const recordA = createRecord({ source: 'web', platform_object_type: 'article', url: 'https://a.com', content: 'contenido repetido', access_method: 'specialized_tool' });
    const recordB = createRecord({ source: 'web', platform_object_type: 'article', url: 'https://b.com', content: 'contenido repetido', access_method: 'specialized_tool' });

    const resultA = store.save(recordA);
    const resultB = store.save(recordB);

    assert.equal(resultA.stored, true);
    assert.equal(resultB.stored, false);
    assert.equal(resultB.reason, 'duplicate_content_hash');
  });

  test('loadByRecordId recupera un registro por su id sin conocer la fuente de antemano', () => {
    const record = createRecord({ source: 'github', platform_object_type: 'repo', url: 'https://github.com/x/y', content: 'repo de prueba', access_method: 'official_api' });
    store.save(record);
    const found = store.loadByRecordId(record.record_id);
    assert.ok(found);
    assert.equal(found.url, 'https://github.com/x/y');
  });

  test('loadByRecordId devuelve null si el id no existe', () => {
    assert.equal(store.loadByRecordId('id-inexistente'), null);
  });
});
