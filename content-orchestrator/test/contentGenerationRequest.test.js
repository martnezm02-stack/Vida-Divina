import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseContentGenerationRequest, CONTENT_GENERATION_MODES } from '../src/contentGenerationRequest.js';

describe('parseContentGenerationRequest — clasificación de modo', () => {
  test('sin sourceAsset siempre es CREATE, sin importar el verbo', () => {
    const req = parseContentGenerationRequest({ rawText: 'Mejora la estrategia de Té Divina', productId: 'te-divina' });
    assert.equal(req.mode, 'CREATE');
  });

  test('con sourceAsset + verbo de mejora es EDIT_ENHANCE', () => {
    const req = parseContentGenerationRequest({ rawText: 'Mejora este video: normaliza el audio y agrega CTA.', sourceAsset: { type: 'VIDEO', path: 'x.mp4' } });
    assert.equal(req.mode, 'EDIT_ENHANCE');
  });

  test('con sourceAsset + mención de plataformas es ADAPT', () => {
    const req = parseContentGenerationRequest({ rawText: 'Convierte este Reel para Facebook, YouTube Shorts y WhatsApp.', sourceAsset: { type: 'VIDEO', path: 'x.mp4' } });
    assert.equal(req.mode, 'ADAPT');
    assert.ok(req.outputProfiles.includes('FACEBOOK_REEL') || req.outputProfiles.includes('YOUTUBE_SHORT'));
  });

  test('"genera todas las versiones" expande a ALL_VIDEO_PROFILES', () => {
    const req = parseContentGenerationRequest({ rawText: 'Genera todas las versiones de este Reel.', sourceAsset: { type: 'VIDEO', path: 'x.mp4' } });
    assert.equal(req.outputProfiles, 'ALL_VIDEO_PROFILES');
  });

  test('forcedMode explícito siempre gana sobre el clasificador de texto', () => {
    const req = parseContentGenerationRequest({ rawText: 'texto genérico', sourceAsset: { type: 'VIDEO', path: 'x.mp4' }, forcedMode: 'ADAPT', outputProfiles: ['INSTAGRAM_REEL'] });
    assert.equal(req.mode, 'ADAPT');
  });

  test('rechaza forcedMode inválido', () => {
    assert.throws(() => parseContentGenerationRequest({ rawText: 'x', forcedMode: 'DELETE_EVERYTHING' }), /forcedMode.*inválido/);
  });

  test('rechaza EDIT_ENHANCE/ADAPT forzado sin sourceAsset -- nunca asume un asset', () => {
    assert.throws(() => parseContentGenerationRequest({ rawText: 'x', forcedMode: 'EDIT_ENHANCE' }), /requiere "sourceAsset" real/);
    assert.throws(() => parseContentGenerationRequest({ rawText: 'x', forcedMode: 'ADAPT' }), /requiere "sourceAsset" real/);
  });
});

describe('parseContentGenerationRequest — NO INVENTAR: missingFields', () => {
  test('CREATE sin productId reporta missingFields', () => {
    const req = parseContentGenerationRequest({ rawText: 'Crear un anuncio para generar conversaciones.' });
    assert.ok(req.missingFields.includes('productId'));
  });

  test('ADAPT sin ningún Output Profile detectado reporta missingFields', () => {
    const req = parseContentGenerationRequest({ rawText: 'Adapta este video.', sourceAsset: { type: 'VIDEO', path: 'x.mp4' }, forcedMode: 'ADAPT' });
    assert.ok(req.missingFields.includes('outputProfiles'));
  });
});

describe('parseContentGenerationRequest — trazabilidad y contrato', () => {
  test('CONTENT_GENERATION_MODES expone exactamente los 4 modos requeridos (incluye CAROUSEL, Bloque 2)', () => {
    assert.deepEqual([...CONTENT_GENERATION_MODES].sort(), ['ADAPT', 'CAROUSEL', 'CREATE', 'EDIT_ENHANCE']);
  });

  test('cada request tiene un requestId único y createdAt real', () => {
    const a = parseContentGenerationRequest({ rawText: 'x', productId: 'te-divina' });
    const b = parseContentGenerationRequest({ rawText: 'x', productId: 'te-divina' });
    assert.notEqual(a.requestId, b.requestId);
    assert.ok(!Number.isNaN(Date.parse(a.createdAt)));
  });

  test('rechaza rawText vacío', () => {
    assert.throws(() => parseContentGenerationRequest({ rawText: '' }), /rawText/);
  });
});
