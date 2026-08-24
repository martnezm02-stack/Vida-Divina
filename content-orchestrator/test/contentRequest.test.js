import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseContentRequest, assertContentRequestComplete, CONTENT_MODES, CONTENT_TYPES } from '../src/contentRequest.js';

describe('parseContentRequest — clasificación de modo', () => {
  test('una solicitud estratégica sin contenido literal se clasifica CAMPAIGN_MODE', () => {
    const req = parseContentRequest({
      rawText: 'Quiero una campaña para Té Divina dirigida a mujeres interesadas en bienestar digestivo, para Instagram Reels, con objetivo de generar conversaciones por WhatsApp.',
      contentType: 'CAMPAIGN',
    });
    assert.equal(req.mode, 'CAMPAIGN_MODE');
    assert.equal(req.productId, 'te-divina');
    assert.ok(req.platforms.includes('INSTAGRAM'));
    assert.equal(req.objectiveWhatsappConversation, true);
  });

  test('una solicitud con voiceoverText/cta/visualAssets explícitos se clasifica DIRECT_INSTRUCTION_MODE', () => {
    const req = parseContentRequest({
      rawText: 'Usa esta fotografía real de Té Divina y mi voz oficial. Haz un Reel vertical de 20-30 segundos con CTA a WhatsApp.',
      contentType: 'VIDEO_REEL',
      explicitFields: {
        voiceoverText: 'TéDivina, parte del catálogo de Vida Divina.',
        cta: 'Escríbenos por WhatsApp.',
        visualAssets: [{ assetId: 'abc', sourcePath: 'x.jpeg' }],
      },
    });
    assert.equal(req.mode, 'DIRECT_INSTRUCTION_MODE');
  });

  test('forcedMode explícito siempre gana sobre el clasificador de texto', () => {
    const req = parseContentRequest({ rawText: 'algo genérico', contentType: 'CAMPAIGN', forcedMode: 'DIRECT_INSTRUCTION_MODE' });
    assert.equal(req.mode, 'DIRECT_INSTRUCTION_MODE');
  });

  test('rechaza forcedMode inválido', () => {
    assert.throws(() => parseContentRequest({ rawText: 'x', contentType: 'CAMPAIGN', forcedMode: 'NOT_A_MODE' }), /forcedMode.*inválido/);
  });
});

describe('parseContentRequest — extensibilidad de tipos de contenido', () => {
  test('soporta los 7 tipos mínimos requeridos', () => {
    for (const t of ['VIDEO_REEL', 'VIDEO_STORY', 'VIDEO_SHORT', 'IMAGE_POST', 'IMAGE_STORY', 'CAROUSEL', 'CAMPAIGN']) {
      assert.ok(CONTENT_TYPES.includes(t));
    }
  });

  test('rechaza un contentType desconocido', () => {
    assert.throws(() => parseContentRequest({ rawText: 'x', contentType: 'NOT_A_TYPE' }), /contentType.*inválido/);
  });

  test('rechaza rawText vacío', () => {
    assert.throws(() => parseContentRequest({ rawText: '  ', contentType: 'CAMPAIGN' }), /rawText/);
  });
});

describe('parseContentRequest — NO INVENTAR: missingFields explícito', () => {
  test('un producto no reconocido queda productId:null y aparece en missingFields', () => {
    const req = parseContentRequest({ rawText: 'Quiero una campaña para un producto cualquiera', contentType: 'CAMPAIGN' });
    assert.equal(req.productId, null);
    assert.ok(req.missingFields.includes('productId'));
  });

  test('DIRECT_INSTRUCTION_MODE sin cta/voiceoverText/visualAssets explícitos reporta los 3 en missingFields', () => {
    const req = parseContentRequest({ rawText: 'x', contentType: 'VIDEO_REEL', forcedMode: 'DIRECT_INSTRUCTION_MODE' });
    assert.ok(req.missingFields.includes('voiceoverText'));
    assert.ok(req.missingFields.includes('cta'));
    assert.ok(req.missingFields.includes('visualAssets'));
  });

  test('assertContentRequestComplete lanza si falta un campo requerido real', () => {
    const req = parseContentRequest({ rawText: 'Quiero una campaña para un producto cualquiera', contentType: 'CAMPAIGN' });
    assert.throws(() => assertContentRequestComplete(req, ['productId']), /faltan campos estratégicos reales/);
  });

  test('assertContentRequestComplete no lanza si el campo sí está presente', () => {
    const req = parseContentRequest({ rawText: 'campaña de Té Divina para Instagram', contentType: 'CAMPAIGN' });
    assert.equal(assertContentRequestComplete(req, ['productId', 'platforms']), true);
  });
});

describe('parseContentRequest — trazabilidad', () => {
  test('cada ContentRequest tiene un contentRequestId único y createdAt real', () => {
    const a = parseContentRequest({ rawText: 'campaña de Té Divina para Instagram', contentType: 'CAMPAIGN' });
    const b = parseContentRequest({ rawText: 'campaña de Té Divina para Instagram', contentType: 'CAMPAIGN' });
    assert.notEqual(a.contentRequestId, b.contentRequestId);
    assert.ok(!Number.isNaN(Date.parse(a.createdAt)));
  });

  test('CONTENT_MODES expone exactamente los 2 modos requeridos', () => {
    assert.deepEqual([...CONTENT_MODES].sort(), ['CAMPAIGN_MODE', 'DIRECT_INSTRUCTION_MODE']);
  });
});
