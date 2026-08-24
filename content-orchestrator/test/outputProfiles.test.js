import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { OUTPUT_PROFILES, OUTPUT_PROFILE_NAMES, getOutputProfile, assertValidCarouselSlide } from '../src/outputProfiles.js';

const REQUIRED_MULTIPLATFORM_PROFILES = [
  'INSTAGRAM_REEL', 'INSTAGRAM_STORY', 'INSTAGRAM_FEED',
  'FACEBOOK_REEL', 'FACEBOOK_STORY', 'FACEBOOK_FEED',
  'YOUTUBE_SHORT', 'YOUTUBE_VIDEO',
  'WHATSAPP_VIDEO',
  'GENERIC_VERTICAL', 'GENERIC_SQUARE', 'GENERIC_LANDSCAPE',
  'CAROUSEL',
];

describe('OUTPUT_PROFILES — cobertura multiplataforma requerida', () => {
  test('existen los 13 perfiles mínimos de la adenda multiplataforma', () => {
    for (const name of REQUIRED_MULTIPLATFORM_PROFILES) {
      assert.ok(OUTPUT_PROFILE_NAMES.includes(name), `falta el perfil ${name}`);
    }
  });

  test('cada perfil de video tiene los campos técnicos reales requeridos (no son solo strings)', () => {
    for (const name of REQUIRED_MULTIPLATFORM_PROFILES.filter((n) => n !== 'CAROUSEL')) {
      const p = getOutputProfile(name);
      assert.equal(p.kind, 'VIDEO');
      assert.ok(p.platform);
      assert.ok(p.placement);
      assert.ok(p.aspectRatio);
      assert.equal(typeof p.width, 'number');
      assert.equal(typeof p.height, 'number');
      assert.ok(p.durationConstraints);
      assert.ok(p.safeZones);
      assert.equal(p.codec, 'h264');
      assert.equal(typeof p.videoBitrateBps, 'number');
      assert.ok(p.audio?.loudnessTargetLufs);
      assert.ok(p.captionTreatment);
      assert.ok(p.ctaTreatment);
      assert.ok(p.exportSettings);
    }
  });

  test('CAROUSEL es un kind distinto de VIDEO, con slideConstraints', () => {
    const carousel = getOutputProfile('CAROUSEL');
    assert.equal(carousel.kind, 'CAROUSEL');
    assert.ok(carousel.slideConstraints);
    assert.equal(typeof carousel.slideConstraints.minSlides, 'number');
  });

  test('Instagram Reel y YouTube Video tienen dimensiones reales distintas (vertical vs horizontal)', () => {
    const reel = getOutputProfile('INSTAGRAM_REEL');
    const yt = getOutputProfile('YOUTUBE_VIDEO');
    assert.equal(reel.aspectRatio, '9:16');
    assert.equal(yt.aspectRatio, '16:9');
    assert.ok(reel.height > reel.width);
    assert.ok(yt.width > yt.height);
  });

  test('getOutputProfile lanza sobre un nombre desconocido, nunca inventa un perfil', () => {
    assert.throws(() => getOutputProfile('TIKTOK_VIDEO'), /perfil desconocido/);
  });

  test('los perfiles son objetos congelados (inmutables) — no hardcodeables por accidente desde un caller', () => {
    const p = getOutputProfile('INSTAGRAM_REEL');
    assert.throws(() => { p.width = 999; }, TypeError);
  });
});

describe('assertValidCarouselSlide', () => {
  test('acepta un slide real con headline e imageAssetRef', () => {
    assert.equal(assertValidCarouselSlide({ headline: 'TéDivina', imageAssetRef: 'asset-1' }, 0), true);
  });

  test('rechaza un slide sin headline', () => {
    assert.throws(() => assertValidCarouselSlide({ imageAssetRef: 'asset-1' }, 0), /headline/);
  });

  test('rechaza un slide sin imageAssetRef', () => {
    assert.throws(() => assertValidCarouselSlide({ headline: 'x' }, 0), /imageAssetRef/);
  });
});
