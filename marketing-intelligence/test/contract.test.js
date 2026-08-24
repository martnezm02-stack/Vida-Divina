import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRecord, hashContent } from '../src/contract.js';

describe('contract.createRecord', () => {
  test('crea un registro válido con los campos obligatorios', () => {
    const record = createRecord({
      source: 'web',
      platform_object_type: 'article',
      url: 'https://example.com/post',
      content: 'Hola mundo',
      access_method: 'specialized_tool',
    });

    assert.equal(record.source, 'web');
    assert.equal(record.url, 'https://example.com/post');
    assert.equal(record.content, 'Hola mundo');
    assert.equal(record.fetch_status, 'ok');
    assert.ok(record.record_id);
    assert.ok(record.retrieved_at);
    assert.equal(record.content_hash, hashContent('Hola mundo'));
  });

  test('el content_hash es determinista para el mismo contenido', () => {
    const a = createRecord({ source: 'web', platform_object_type: 'article', url: 'u1', content: 'mismo texto', access_method: 'specialized_tool' });
    const b = createRecord({ source: 'web', platform_object_type: 'article', url: 'u2', content: 'mismo texto', access_method: 'specialized_tool' });
    assert.equal(a.content_hash, b.content_hash);
    assert.notEqual(a.record_id, b.record_id);
  });

  test('el content_hash cambia si el contenido cambia', () => {
    const a = createRecord({ source: 'web', platform_object_type: 'article', url: 'u1', content: 'texto A', access_method: 'specialized_tool' });
    const b = createRecord({ source: 'web', platform_object_type: 'article', url: 'u1', content: 'texto B', access_method: 'specialized_tool' });
    assert.notEqual(a.content_hash, b.content_hash);
  });

  test('rechaza access_method desconocido', () => {
    assert.throws(() => createRecord({
      source: 'web', platform_object_type: 'article', url: 'u1', content: 'x', access_method: 'algo_inventado',
    }));
  });

  test('rechaza fetch_status desconocido', () => {
    assert.throws(() => createRecord({
      source: 'web', platform_object_type: 'article', url: 'u1', content: 'x',
      access_method: 'specialized_tool', fetch_status: 'algo_inventado',
    }));
  });

  test('rechaza registros sin source, sin url o sin platform_object_type', () => {
    assert.throws(() => createRecord({ platform_object_type: 'article', url: 'u1', access_method: 'specialized_tool' }));
    assert.throws(() => createRecord({ source: 'web', url: 'u1', access_method: 'specialized_tool' }));
    assert.throws(() => createRecord({ source: 'web', platform_object_type: 'article', access_method: 'specialized_tool' }));
  });

  test('el registro devuelto es inmutable (Object.freeze)', () => {
    const record = createRecord({ source: 'web', platform_object_type: 'article', url: 'u1', content: 'x', access_method: 'specialized_tool' });
    assert.throws(() => { record.content = 'modificado'; }, /Cannot assign/);
  });
});
