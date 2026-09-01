// mediaInspector.test.js — Validación real de archivo (§20) + probe real
// de duración vía ffprobe (§21, §22). Usa los fixtures reales de test/fixtures/
// (video/audio de 1s reales generados con ffmpeg, no simulados).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateMediaFile, probeMediaFile, mediaKindForExtension, SUPPORTED_EXTENSIONS } from '../src/mediaInspector.js';

const FIXTURES_DIR = fileURLToPath(new URL('./fixtures', import.meta.url));
const VIDEO = join(FIXTURES_DIR, 'Venus_menopausia_testimonio.mp4');
const AUDIO = join(FIXTURES_DIR, 'audio_presentacion_venus.mp3');

describe('validateMediaFile', () => {
  test('archivo real existente y soportado -- valid:true', () => {
    const v = validateMediaFile(VIDEO);
    assert.equal(v.valid, true);
    assert.equal(v.kind, 'video');
    assert.equal(v.mimeType, 'video/mp4');
    assert.ok(v.fileSizeBytes > 0);
  });

  test('archivo inexistente -- valid:false, error explícito, nunca lanza', () => {
    const v = validateMediaFile(join(FIXTURES_DIR, 'no-existe.mp4'));
    assert.equal(v.valid, false);
    assert.match(v.errors[0], /no existe/);
  });

  test('extensión no soportada -- valid:false', () => {
    const v = validateMediaFile(join(FIXTURES_DIR, '..', '..', 'package.json')); // commercial-media/package.json, archivo real existente, extensión .json no soportada.
    assert.equal(v.valid, false);
    assert.ok(v.errors.some((e) => e.includes('no soportada')));
  });

  test('SUPPORTED_EXTENSIONS no incluye PDF/documentos todavía (§54: futuro, no implementado ahora)', () => {
    assert.ok(!SUPPORTED_EXTENSIONS.includes('.pdf'));
  });
});

describe('mediaKindForExtension', () => {
  test('clasifica video/audio/imagen reales, null para lo no soportado', () => {
    assert.equal(mediaKindForExtension('.mp4'), 'video');
    assert.equal(mediaKindForExtension('.mp3'), 'audio');
    assert.equal(mediaKindForExtension('.png'), 'image');
    assert.equal(mediaKindForExtension('.pdf'), null);
  });
});

describe('probeMediaFile — ffprobe real (§21, §22)', () => {
  test('video real: duración + resolución reales detectadas', () => {
    const probe = probeMediaFile(VIDEO, 'video');
    assert.equal(probe.probeError, null);
    assert.ok(probe.durationSeconds > 0 && probe.durationSeconds <= 2);
    assert.equal(probe.width, 64);
    assert.equal(probe.height, 64);
  });

  test('audio real: duración real detectada, sin resolución (no aplica)', () => {
    const probe = probeMediaFile(AUDIO, 'audio');
    assert.equal(probe.probeError, null);
    assert.ok(probe.durationSeconds > 0 && probe.durationSeconds <= 2);
    assert.equal(probe.width, null);
    assert.equal(probe.height, null);
  });

  test('imagen: sin duración/resolución de video real, nunca lanza', () => {
    const probe = probeMediaFile('/cualquier/ruta.png', 'image');
    assert.deepEqual(probe, { durationSeconds: null, width: null, height: null, probeError: null });
  });
});
