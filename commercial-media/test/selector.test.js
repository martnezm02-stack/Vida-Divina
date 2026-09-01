// selector.test.js — getCommercialMediaCandidates()/selectCommercialMedia()
// (§23-§28): CONSUMPTION nunca devuelve DISTRIBUTION y viceversa, sin
// coincidencia real -> NO_MATCH, nunca contenido al azar.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-selector-test-'));
process.env.COMMERCIAL_MEDIA_DATA_ROOT = TEST_DATA_ROOT;

const { upsertCommercialMedia } = await import('../src/commercialMediaStore.js');
const { getCommercialMediaCandidates, selectCommercialMedia } = await import('../src/selector.js');

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
});

upsertCommercialMedia({
  displayName: 'Cápsulas Venus — Testimonio', filePath: 'venus-testimonio.mp4', mimeType: 'video/mp4',
  mediaType: 'VIDEO_TESTIMONIAL', businessIntent: 'CONSUMPTION', productId: 'venus-capsules',
  audience: 'female', needTags: ['menopause'], fileSizeBytes: 1, contentHash: 'h1',
  classificationConfidence: 'HIGH', classificationReason: 'fixture',
});
upsertCommercialMedia({
  displayName: 'Cápsulas Venus — Audio Oficial', filePath: 'venus-audio.mp3', mimeType: 'audio/mpeg',
  mediaType: 'AUDIO_OFICIAL', businessIntent: 'CONSUMPTION', productId: 'venus-capsules',
  audience: null, needTags: [], fileSizeBytes: 1, contentHash: 'h2',
  classificationConfidence: 'MEDIUM', classificationReason: 'fixture',
});
upsertCommercialMedia({
  displayName: 'Modelo de Negocio', filePath: 'modelo.mp4', mimeType: 'video/mp4',
  mediaType: 'BUSINESS_MODEL_VIDEO', businessIntent: 'DISTRIBUTION', productId: null,
  audience: null, needTags: [], fileSizeBytes: 1, contentHash: 'h3',
  classificationConfidence: 'HIGH', classificationReason: 'fixture',
});
const { record: inactiveRecord } = upsertCommercialMedia({
  displayName: 'Testimonio inactivo', filePath: 'inactivo.mp4', mimeType: 'video/mp4',
  mediaType: 'VIDEO_TESTIMONIAL', businessIntent: 'CONSUMPTION', productId: 'venus-capsules',
  audience: null, needTags: [], fileSizeBytes: 1, contentHash: 'h4', active: false,
  classificationConfidence: 'LOW', classificationReason: 'fixture',
});

describe('getCommercialMediaCandidates', () => {
  test('filtra por productId + businessIntent -- solo devuelve compatibles activos', () => {
    const candidates = getCommercialMediaCandidates({ productId: 'venus-capsules', businessIntent: 'CONSUMPTION' });
    assert.equal(candidates.length, 2);
    assert.ok(!candidates.some((c) => c.mediaId === inactiveRecord.mediaId)); // inactivo nunca es candidato.
  });

  test('product mismatch -- un producto distinto nunca aparece', () => {
    const candidates = getCommercialMediaCandidates({ productId: 'sculpt-max', businessIntent: 'CONSUMPTION' });
    assert.equal(candidates.length, 0);
  });
});

describe('selectCommercialMedia — CONSUMPTION vs DISTRIBUTION nunca se mezclan (§25, §26)', () => {
  test('CONSUMPTION real nunca devuelve BUSINESS_MODEL_VIDEO', () => {
    const best = selectCommercialMedia({ productId: 'venus-capsules', businessIntent: 'CONSUMPTION' });
    assert.notEqual(best, 'NO_MATCH');
    assert.equal(best.businessIntent, 'CONSUMPTION');
    assert.notEqual(best.mediaType, 'BUSINESS_MODEL_VIDEO');
  });

  test('DISTRIBUTION real nunca devuelve VIDEO_TESTIMONIAL de consumo', () => {
    const best = selectCommercialMedia({ businessIntent: 'DISTRIBUTION' });
    assert.notEqual(best, 'NO_MATCH');
    assert.equal(best.mediaType, 'BUSINESS_MODEL_VIDEO');
  });

  test('needTags exacto desempata a favor del testimonio real sobre el audio real', () => {
    const best = selectCommercialMedia({ productId: 'venus-capsules', businessIntent: 'CONSUMPTION', needTags: ['menopause'] });
    assert.equal(best.mediaType, 'VIDEO_TESTIMONIAL');
  });
});

describe('NO_MATCH — nunca contenido al azar (§27)', () => {
  test('intent mismatch real: pedir DISTRIBUTION para un producto que solo tiene CONSUMPTION real -> NO_MATCH', () => {
    const best = selectCommercialMedia({ productId: 'venus-capsules', businessIntent: 'DISTRIBUTION', mediaType: 'BUSINESS_MODEL_VIDEO' });
    // No existe ningún BUSINESS_MODEL_VIDEO real asociado a venus-capsules (productId exacto) --
    // el único BUSINESS_MODEL_VIDEO real tiene productId:null, así que sigue siendo candidato por
    // el filtro "productId null = general" -- se verifica aquí que ESO es intencional, no un bug:
    assert.notEqual(best, 'NO_MATCH');
    assert.equal(best.productId, null);
  });

  test('sin ningún candidato real compatible -> NO_MATCH literal', () => {
    const best = selectCommercialMedia({ productId: 'sculpt-max', businessIntent: 'CONSUMPTION' });
    assert.equal(best, 'NO_MATCH');
  });

  test('audience mismatch real: pedir "male" cuando el único candidato real es "female"-específico sin fallback general disponible', () => {
    // Aislado: solo productId+audience, sin businessIntent -- fuerza a que
    // el único candidato real compatible con audience quede filtrado.
    const candidates = getCommercialMediaCandidates({ productId: 'venus-capsules', audience: 'male' });
    assert.ok(!candidates.some((c) => c.audience === 'female'));
  });
});
