import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebsiteRawStore } from '../src/acquisition/rawStore.js';
import { createWebsiteRawRecord } from '../src/acquisition/websiteRawRecord.js';

function record(overrides = {}) {
  return createWebsiteRawRecord({
    url: 'https://ejemplo-ficticio.test/pagina',
    acquisition_method: 'http_direct',
    fetch_status: 'ok',
    html: '<html>contenido v1</html>',
    ...overrides,
  });
}

describe('WebsiteRawStore — dedup, versionado y aislamiento por sitio', () => {
  let dir;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'website-intelligence-rawstore-'));
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('caso 1: misma URL + mismo contenido = duplicado real, no se vuelve a guardar', () => {
    const store = new WebsiteRawStore(join(dir, 'caso1'));
    const r1 = record();
    const first = store.save(r1);
    assert.equal(first.stored, true);

    const r2 = record(); // mismo html => mismo content_hash, URL igual
    const second = store.save(r2);
    assert.equal(second.stored, false);
    assert.equal(second.reason, 'duplicate_content_same_url');
    assert.equal(second.existing_raw_id, r1.raw_id);
  });

  test('caso 2: misma URL + contenido distinto = nueva versión, enlazada automáticamente a la anterior', () => {
    const store = new WebsiteRawStore(join(dir, 'caso2'));
    const v1 = store.save(record({ html: '<html>contenido v1</html>' }));
    const r2 = record({ html: '<html>contenido v2, cambió</html>' });
    const v2 = store.save(r2);

    assert.equal(v2.stored, true);
    assert.equal(v2.is_new_version, true);
    assert.equal(v2.previous_raw_id, v1.raw_id);

    const versions = store.loadVersions('https://ejemplo-ficticio.test/pagina', 'ejemplo-ficticio.test');
    assert.equal(versions.length, 2);
    assert.equal(versions[1].version_of, v1.raw_id);
  });

  test('caso 3: URLs distintas + mismo contenido = NO es duplicado, se guardan ambas y se informa la coincidencia', () => {
    const store = new WebsiteRawStore(join(dir, 'caso3'));
    const html = '<html>contenido idéntico en dos URLs</html>';
    const rA = record({ url: 'https://ejemplo-ficticio.test/a', html });
    const rB = record({ url: 'https://ejemplo-ficticio.test/b', html });

    const savedA = store.save(rA);
    const savedB = store.save(rB);

    assert.equal(savedA.stored, true);
    assert.equal(savedB.stored, true);
    assert.deepEqual(savedB.same_content_as_urls, ['https://ejemplo-ficticio.test/a']);
  });

  test('loadLatest devuelve siempre la versión más reciente', () => {
    const store = new WebsiteRawStore(join(dir, 'caso4'));
    store.save(record({ html: '<html>v1</html>' }));
    const v2 = store.save(record({ html: '<html>v2</html>' }));
    const latest = store.loadLatest('https://ejemplo-ficticio.test/pagina', 'ejemplo-ficticio.test');
    assert.equal(latest.raw_id, v2.raw_id);
  });

  test('loadByRawId busca en todos los archivos de sitio sin necesitar saber cuál', () => {
    const store = new WebsiteRawStore(join(dir, 'caso5'));
    const saved = store.save(record({ url: 'https://otro-sitio-ficticio.test/x', html: '<html>x</html>' }));
    const found = store.loadByRawId(saved.raw_id);
    assert.ok(found);
    assert.equal(found.site, 'otro-sitio-ficticio.test');
  });

  test('persistencia real en disco: una nueva instancia del store lee lo ya guardado (rebuild del índice)', () => {
    const path = join(dir, 'caso6');
    const store1 = new WebsiteRawStore(path);
    const saved = store1.save(record());

    const store2 = new WebsiteRawStore(path);
    const dup = store2.save(record()); // mismo contenido, debe detectarse como duplicado tras recargar desde disco
    assert.equal(dup.stored, false);
    assert.equal(dup.existing_raw_id, saved.raw_id);
  });

  test('tolera líneas corruptas al reconstruir el índice interno (dedup sigue funcionando)', () => {
    const path = join(dir, 'caso7');
    const store1 = new WebsiteRawStore(path);
    store1.save(record());

    // Se corrompe manualmente una línea escribiendo texto no-JSON al final.
    // _ensureLoaded() (usado por save()) ignora la línea corrupta y sigue
    // indexando el resto — igual que en marketing-intelligence/src/storage/rawStore.js.
    // loadAll() en cambio no filtra JSON inválido (mismo comportamiento que el
    // store de marketing-intelligence): esa garantía de tolerancia es solo del
    // índice interno, no de la lectura cruda completa.
    const filePath = join(path, 'ejemplo-ficticio.test.jsonl');
    appendFileSync(filePath, 'esto no es json valido\n', 'utf8');

    const store2 = new WebsiteRawStore(path);
    const dup = store2.save(record()); // fuerza _ensureLoaded(), que debe tolerar la línea corrupta
    assert.equal(dup.stored, false, 'el índice debe reconocer el registro válido pese a la línea corrupta');
  });
});
