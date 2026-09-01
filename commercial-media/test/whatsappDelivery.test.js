// whatsappDelivery.test.js — payload real hasta selector (§48), sin envío
// externo real (§47, §49). Nunca toca la red: WHATSAPP_ACCESS_TOKEN/
// WHATSAPP_PHONE_NUMBER_ID no están configurados en este entorno de test.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildWhatsAppMediaSendRequest, sendCommercialMedia } from '../src/whatsappDelivery.js';

delete process.env.WHATSAPP_ACCESS_TOKEN;
delete process.env.WHATSAPP_PHONE_NUMBER_ID;

function activeRecord(overrides = {}) {
  return { mediaId: 'm1', displayName: 'Cápsulas Venus — Testimonio', filePath: 'C:/incoming/venus.mp4', mimeType: 'video/mp4', mediaType: 'VIDEO_TESTIMONIAL', businessIntent: 'CONSUMPTION', active: true, ...overrides };
}

describe('buildWhatsAppMediaSendRequest — payload real, nunca envía (§48)', () => {
  test('registro activo real -> ready:true, type real derivado del mimeType', () => {
    const payload = buildWhatsAppMediaSendRequest(activeRecord(), { to: '5212345678900' });
    assert.equal(payload.ready, true);
    assert.equal(payload.type, 'video');
    assert.equal(payload.filePath, 'C:/incoming/venus.mp4');
    assert.equal(payload.to, '5212345678900');
  });

  test('audio real -> type "audio"', () => {
    const payload = buildWhatsAppMediaSendRequest(activeRecord({ mimeType: 'audio/mpeg' }), { to: '5212345678900' });
    assert.equal(payload.type, 'audio');
  });

  test('registro inactivo (NEEDS_METADATA) -> ready:false, nunca se prepara para enviar', () => {
    const payload = buildWhatsAppMediaSendRequest(activeRecord({ active: false, businessIntent: 'NEEDS_METADATA' }), { to: '5212345678900' });
    assert.equal(payload.ready, false);
    assert.match(payload.reason, /no está active/);
  });

  test('sin "to" -- lanza, nunca construye un payload sin destinatario', () => {
    assert.throws(() => buildWhatsAppMediaSendRequest(activeRecord(), {}), /"to".*obligatorio/);
  });
});

describe('sendCommercialMedia — nunca ejecuta envío externo real en este entorno (§47, §49)', () => {
  test('sin credenciales reales configuradas -- ok:false, etapa "config", NUNCA toca la red', async () => {
    const result = await sendCommercialMedia(activeRecord(), { to: '5212345678900' });
    assert.equal(result.ok, false);
    assert.equal(result.etapa, 'config');
  });

  test('registro inactivo -- ok:false antes de siquiera considerar credenciales', async () => {
    const result = await sendCommercialMedia(activeRecord({ active: false }), { to: '5212345678900' });
    assert.equal(result.ok, false);
    assert.equal(result.etapa, 'validacion_registro');
  });
});
