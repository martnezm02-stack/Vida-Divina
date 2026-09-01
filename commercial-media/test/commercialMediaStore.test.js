// commercialMediaStore.test.js — Registry: dedupe por contentHash (§16),
// active/inactive sin borrar (§17, §18), cola NEEDS_METADATA (§38).

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-store-test-'));
process.env.COMMERCIAL_MEDIA_DATA_ROOT = TEST_DATA_ROOT;

const {
  upsertCommercialMedia, findByContentHash, listCommercialMedia, getCommercialMedia,
  setCommercialMediaActive, getCommercialMediaNeedingMetadata,
} = await import('../src/commercialMediaStore.js');

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
});

function baseFields(overrides = {}) {
  return {
    displayName: 'Cápsulas Venus — Testimonio', filePath: 'C:/incoming/venus.mp4', mimeType: 'video/mp4',
    mediaType: 'VIDEO_TESTIMONIAL', businessIntent: 'CONSUMPTION', productId: 'venus-capsules',
    audience: null, needTags: ['menopause'], fileSizeBytes: 12345, contentHash: 'hash-a',
    classificationConfidence: 'HIGH', classificationReason: 'test fixture.',
    ...overrides,
  };
}

describe('upsertCommercialMedia — dedupe por contentHash (§16)', () => {
  test('primera vez: wasNew:true, crea un registro real', () => {
    const { record, wasNew } = upsertCommercialMedia(baseFields());
    assert.equal(wasNew, true);
    assert.ok(record.mediaId);
    assert.equal(getCommercialMedia(record.mediaId).mediaId, record.mediaId);
  });

  test('mismo contentHash real dos veces -- NUNCA se registra dos veces, mismo mediaId', () => {
    const first = upsertCommercialMedia(baseFields({ contentHash: 'hash-b' }));
    const second = upsertCommercialMedia(baseFields({ contentHash: 'hash-b', displayName: 'Nombre actualizado' }));
    assert.equal(second.wasNew, false);
    assert.equal(second.record.mediaId, first.record.mediaId);
    assert.equal(listCommercialMedia({ productId: 'venus-capsules' }).filter((r) => r.contentHash === 'hash-b').length, 1);
  });

  test('findByContentHash real -- null si no existe, nunca inventa', () => {
    assert.equal(findByContentHash('hash-que-no-existe'), null);
  });
});

describe('active/inactive — nunca borra (§17, §18)', () => {
  test('desactivar conserva el registro real, solo cambia active', () => {
    const { record } = upsertCommercialMedia(baseFields({ contentHash: 'hash-c' }));
    const updated = setCommercialMediaActive(record.mediaId, false);
    assert.equal(updated.active, false);
    assert.equal(updated.mediaId, record.mediaId);
    assert.equal(updated.filePath, record.filePath); // el archivo/registro real sigue intacto, solo active cambió.
    assert.doesNotThrow(() => getCommercialMedia(record.mediaId)); // sigue existiendo, no se eliminó.
  });
});

describe('NEEDS_METADATA — nunca active/selectable (§14)', () => {
  test('un registro con businessIntent=NEEDS_METADATA siempre queda active:false, sin importar lo pedido', () => {
    const { record } = upsertCommercialMedia(baseFields({
      contentHash: 'hash-d', mediaType: null, businessIntent: 'NEEDS_METADATA', active: true, // intento explícito de forzar active:true
    }));
    assert.equal(record.active, false);
  });

  test('getCommercialMediaNeedingMetadata real -- lista solo los NEEDS_METADATA (§38)', () => {
    const list = getCommercialMediaNeedingMetadata();
    assert.ok(list.every((r) => r.businessIntent === 'NEEDS_METADATA'));
    assert.ok(list.some((r) => r.contentHash === 'hash-d'));
  });
});

describe('Validación de gobernanza heredada del schema', () => {
  test('sin contentHash real -- lanza, nunca un registro sin trazabilidad de dedupe', () => {
    assert.throws(() => upsertCommercialMedia(baseFields({ contentHash: undefined })), /contentHash/);
  });
});
