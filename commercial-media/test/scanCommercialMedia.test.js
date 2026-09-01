// scanCommercialMedia.test.js — E2E real (§46, §47): incoming/ -> scan ->
// classification -> registry, usando los fixtures reales de test/fixtures/
// (video/audio de 1s reales generados con ffmpeg -- NO simulados). Casos:
// A. Venus testimonial, B. Business model video, C. Official audio,
// D. NEEDS_METADATA (video_01.mp4).

import { test, describe, after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-scan-data-'));
const TEST_INCOMING = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-scan-incoming-'));
process.env.COMMERCIAL_MEDIA_DATA_ROOT = TEST_DATA_ROOT;
process.env.COMMERCIAL_MEDIA_INCOMING_DIR = TEST_INCOMING;

const FIXTURES_DIR = fileURLToPath(new URL('./fixtures', import.meta.url));
const FIXTURE_FILES = ['Venus_menopausia_testimonio.mp4', 'Modelo_negocio_Vida_Divina.mp4', 'audio_presentacion_venus.mp3', 'video_01.mp4'];

const { scanCommercialMedia } = await import('../src/scanCommercialMedia.js');
const { listCommercialMedia } = await import('../src/commercialMediaStore.js');

before(() => {
  for (const f of FIXTURE_FILES) fs.copyFileSync(path.join(FIXTURES_DIR, f), path.join(TEST_INCOMING, f));
});

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
  fs.rmSync(TEST_INCOMING, { recursive: true, force: true });
});

describe('E2E real: incoming/ -> scan -> classification -> registry (§47)', () => {
  test('DRY RUN (§37): reporta pero no escribe nada en el registry', () => {
    const report = scanCommercialMedia({ dryRun: true });
    assert.equal(report.registered.length + report.needsMetadata.length, FIXTURE_FILES.length);
    assert.equal(listCommercialMedia().length, 0); // dry-run real: el registry sigue vacío.
  });

  test('scan real (no dry-run): registra A (testimonial), B (business model), C (audio), y D queda NEEDS_METADATA', () => {
    const report = scanCommercialMedia({});
    assert.equal(report.invalid.length, 0);

    const testimonial = report.registered.find((r) => r.mediaType === 'VIDEO_TESTIMONIAL');
    assert.ok(testimonial, 'A: Venus testimonial debe registrarse');
    assert.equal(testimonial.productId, 'venus-capsules');
    assert.ok(testimonial.durationSeconds > 0); // duración real probada con ffprobe, no inventada.

    const businessModel = report.registered.find((r) => r.mediaType === 'BUSINESS_MODEL_VIDEO');
    assert.ok(businessModel, 'B: Business model video debe registrarse');
    assert.equal(businessModel.businessIntent, 'DISTRIBUTION');

    const officialAudio = report.registered.find((r) => r.mediaType === 'AUDIO_OFICIAL');
    assert.ok(officialAudio, 'C: Official audio debe registrarse');
    assert.equal(officialAudio.productId, 'venus-capsules');

    assert.equal(report.needsMetadata.length, 1);
    assert.equal(report.needsMetadata[0].active, false); // §14: NEEDS_METADATA nunca active.
  });

  test('idempotencia real de hash (§16): re-escanear el mismo incoming/ sin cambios no duplica registros', () => {
    const before = listCommercialMedia().length;
    const report = scanCommercialMedia({});
    assert.equal(report.registered.length, 0); // nada "nuevo" -- todo ya conocido por contentHash.
    assert.equal(listCommercialMedia().length, before);
  });

  test('displayName nunca es un UUID (§11)', () => {
    for (const r of listCommercialMedia()) {
      assert.doesNotMatch(r.displayName, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    }
  });

  test('cada registro es trazable: sourcePath real + classificationReason real (§42)', () => {
    for (const r of listCommercialMedia()) {
      assert.ok(r.sourcePath.includes(TEST_INCOMING) || fs.existsSync(r.sourcePath));
      assert.ok(r.classificationReason?.length > 0);
      assert.ok(r.contentHash?.length === 64); // sha256 hex real.
    }
  });
});

describe('Manifest override en incoming/manifest.json (§6)', () => {
  test('un archivo NEEDS_METADATA se resuelve con manifest explícito en la siguiente corrida', () => {
    fs.writeFileSync(path.join(TEST_INCOMING, 'manifest.json'), JSON.stringify([
      { file: 'video_01.mp4', mediaType: 'BRAND_MEDIA', businessIntent: 'GENERAL', displayName: 'Video institucional Vida Divina' },
    ]));
    const report = scanCommercialMedia({});
    const updated = listCommercialMedia().find((r) => r.displayName === 'Video institucional Vida Divina');
    assert.ok(updated, 'el manifest debe resolver el archivo antes NEEDS_METADATA');
    assert.equal(updated.mediaType, 'BRAND_MEDIA');
    assert.equal(updated.active, true);
    assert.equal(report.needsMetadata.length, 0);
  });
});
