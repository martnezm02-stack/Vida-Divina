// classifier.test.js — Motor de clasificación determinista (§4, §7, §39,
// §41). Todos los casos de ejemplo del encargo, más manifest override,
// audiencia, need tags, y ambigüedad real del catálogo.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCommercialMedia } from '../src/classifier.js';

describe('Casos de ejemplo del encargo (§7) -- deterministas, sin LLM', () => {
  test('Venus_menopausia_testimonio.mp4 -> VIDEO_TESTIMONIAL / CONSUMPTION / venus-capsules / menopause', () => {
    const r = classifyCommercialMedia({ fileName: 'Venus_menopausia_testimonio.mp4', kind: 'video' });
    assert.equal(r.mediaType, 'VIDEO_TESTIMONIAL');
    assert.equal(r.businessIntent, 'CONSUMPTION');
    assert.equal(r.productId, 'venus-capsules');
    assert.deepEqual([...r.needTags], ['menopause']);
    assert.equal(r.classificationConfidence, 'HIGH');
  });

  test('Modelo_negocio_Vida_Divina.mp4 -> BUSINESS_MODEL_VIDEO / DISTRIBUTION, sin producto', () => {
    const r = classifyCommercialMedia({ fileName: 'Modelo_negocio_Vida_Divina.mp4', kind: 'video' });
    assert.equal(r.mediaType, 'BUSINESS_MODEL_VIDEO');
    assert.equal(r.businessIntent, 'DISTRIBUTION');
    assert.equal(r.productId, null);
  });

  test('audio_presentacion_venus.mp3 -> AUDIO_OFICIAL / CONSUMPTION / venus-capsules', () => {
    const r = classifyCommercialMedia({ fileName: 'audio_presentacion_venus.mp3', kind: 'audio' });
    assert.equal(r.mediaType, 'AUDIO_OFICIAL');
    assert.equal(r.businessIntent, 'CONSUMPTION');
    assert.equal(r.productId, 'venus-capsules');
  });

  test('video_01.mp4 -> NEEDS_METADATA (sin patrón, sin producto)', () => {
    const r = classifyCommercialMedia({ fileName: 'video_01.mp4', kind: 'video' });
    assert.equal(r.mediaType, null);
    assert.equal(r.businessIntent, 'NEEDS_METADATA');
  });
});

describe('Manifest tiene prioridad absoluta (§4.1, §6)', () => {
  test('manifest explícito gana sobre cualquier inferencia de nombre de archivo', () => {
    const r = classifyCommercialMedia({
      fileName: 'video_01.mp4', // nombre que por sí solo sería NEEDS_METADATA
      kind: 'video',
      manifest: {
        file: 'video_01.mp4', mediaType: 'VIDEO_TESTIMONIAL', businessIntent: 'CONSUMPTION',
        productId: 'sculpt-max', needTags: ['weight'], audience: 'female', displayName: 'Cápsulas Sculpt Max — Testimonio',
      },
    });
    assert.equal(r.mediaType, 'VIDEO_TESTIMONIAL');
    assert.equal(r.businessIntent, 'CONSUMPTION');
    assert.equal(r.productId, 'sculpt-max');
    assert.equal(r.displayName, 'Cápsulas Sculpt Max — Testimonio');
    assert.equal(r.classificationConfidence, 'HIGH');
  });

  test('manifest con enum inválido lanza -- nunca se registra silenciosamente algo fuera del vocabulario cerrado', () => {
    assert.throws(() => classifyCommercialMedia({
      fileName: 'x.mp4', kind: 'video', manifest: { file: 'x.mp4', mediaType: 'INVENTADO' },
    }), /inválido/);
  });
});

describe('Ambigüedad real del catálogo -- nunca se asume (§4, §41)', () => {
  test('"Reishi" solo (5 productos reales lo comparten) -> sin producto asignado, no se inventa cuál', () => {
    const r = classifyCommercialMedia({ fileName: 'Reishi_testimonio.mp4', kind: 'video' });
    // El patrón "testimonial" sí se reconoce (mediaType/businessIntent quedan resueltos),
    // pero el producto real queda sin asignar por ambigüedad real -- nunca se adivina cuál Reishi.
    assert.equal(r.productId, null);
  });
});

describe('Audiencia -- nunca inferencia agresiva (§10)', () => {
  test('sin señal real de género en el nombre -> audience:null, nunca "general" por defecto', () => {
    const r = classifyCommercialMedia({ fileName: 'Venus_menopausia_testimonio.mp4', kind: 'video' });
    assert.equal(r.audience, null);
  });

  test('con palabra real "mujeres" en el nombre -> audience:"female"', () => {
    const r = classifyCommercialMedia({ fileName: 'testimonio_mujeres_venus.mp4', kind: 'video' });
    assert.equal(r.audience, 'female');
  });
});

describe('Need tags -- solo vocabulario conocido, nunca inventado (§9)', () => {
  test('sin ninguna palabra reconocida -> needTags:[] (nunca se fuerza una etiqueta)', () => {
    const r = classifyCommercialMedia({ fileName: 'Venus_testimonio.mp4', kind: 'video' });
    assert.deepEqual([...r.needTags], []);
  });
});

describe('Business model y testimonial nunca se confunden (§25, §26, §33, §34)', () => {
  test('un BUSINESS_MODEL_VIDEO nunca se clasifica como VIDEO_TESTIMONIAL aunque ambos sean video', () => {
    const r = classifyCommercialMedia({ fileName: 'Modelo_negocio_testimonio_falso.mp4', kind: 'video' });
    // "modelo de negocio" tiene prioridad sobre "testimonio" en NAME_PATTERNS -- nunca ambiguo entre los dos.
    assert.equal(r.mediaType, 'BUSINESS_MODEL_VIDEO');
    assert.equal(r.businessIntent, 'DISTRIBUTION');
  });
});
