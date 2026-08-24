// graphApiSenderMedia.test.js — Bloque 3 (Publicación real): pruebas de
// enviarAsset() (imagen/video), mismo patrón que graphApiSender.test.js
// (fetch simulado, ninguna petición sale a Internet).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { enviarAsset } from '../src/graphApiSender.js';

let dir;
let imagenPath;
let videoPath;

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'graphapi-media-'));
  imagenPath = join(dir, 'slide.png');
  videoPath = join(dir, 'clip.mp4');
  writeFileSync(imagenPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(videoPath, Buffer.from([0x00, 0x00, 0x00, 0x18]));
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('enviarAsset() — camino mínimo archivo -> upload -> media_id -> mensaje (imagen/video)', () => {
  test('sin credenciales configuradas: ok:false, etapa "config", ninguna llamada de red', async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    let fetchLlamado = false;
    const fetchImpl = async () => { fetchLlamado = true; return { status: 200, json: async () => ({}) }; };
    const r = await enviarAsset('5212225240044', imagenPath, 'image', { fetchImpl });
    assert.equal(r.ok, false);
    assert.equal(r.etapa, 'config');
    assert.equal(fetchLlamado, false);
  });

  test('tipo inválido: ok:false, etapa "config", ninguna llamada de red', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token-test';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
    let fetchLlamado = false;
    const fetchImpl = async () => { fetchLlamado = true; return { status: 200, json: async () => ({}) }; };
    const r = await enviarAsset('5212225240044', imagenPath, 'document', { fetchImpl });
    assert.equal(r.ok, false);
    assert.equal(r.etapa, 'config');
    assert.equal(fetchLlamado, false);
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  });

  test('archivo inexistente: ok:false, etapa "validacion_archivo"', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token-test';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
    const r = await enviarAsset('5212225240044', join(dir, 'no-existe.png'), 'image', { fetchImpl: async () => ({ status: 200, json: async () => ({}) }) });
    assert.equal(r.ok, false);
    assert.equal(r.etapa, 'validacion_archivo');
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  });

  test('con variables de entorno definidas: sube imagen real (simulada) y envía el mensaje', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token-test';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1237988146069127';
    const llamadas = [];
    const fetchImpl = async (url, opciones) => {
      llamadas.push({ url, opciones });
      if (String(url).endsWith('/media')) return { status: 200, json: async () => ({ id: 'media-id-imagen-123' }) };
      return { status: 200, json: async () => ({ messages: [{ id: 'wamid.IMAGEN' }] }) };
    };
    const r = await enviarAsset('5212225240044', imagenPath, 'image', { caption: 'TéDivina', fetchImpl });
    assert.equal(r.ok, true);
    assert.equal(r.etapa, 'completo');
    assert.equal(r.mediaId, 'media-id-imagen-123');
    assert.equal(r.messageId, 'wamid.IMAGEN');
    assert.equal(llamadas.length, 2);
    assert.match(llamadas[0].url, /\/1237988146069127\/media$/);
    assert.match(llamadas[1].url, /\/1237988146069127\/messages$/);
    const bodyEnviado = JSON.parse(llamadas[1].opciones.body);
    assert.equal(bodyEnviado.type, 'image');
    assert.equal(bodyEnviado.image.id, 'media-id-imagen-123');
    assert.equal(bodyEnviado.image.caption, 'TéDivina');
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  });

  test('con variables de entorno definidas: sube video real (simulado) sin caption', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token-test';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1237988146069127';
    const fetchImpl = async (url) => {
      if (String(url).endsWith('/media')) return { status: 200, json: async () => ({ id: 'media-id-video-123' }) };
      return { status: 200, json: async () => ({ messages: [{ id: 'wamid.VIDEO' }] }) };
    };
    const r = await enviarAsset('5212225240044', videoPath, 'video', { fetchImpl });
    assert.equal(r.ok, true);
    assert.equal(r.mediaId, 'media-id-video-123');
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  });

  test('upload falla (4xx) → ok:false, etapa "upload", no intenta enviar el mensaje', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token-test';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1237988146069127';
    let llamadasMensaje = 0;
    const fetchImpl = async (url) => {
      if (String(url).endsWith('/media')) return { status: 400, json: async () => ({ error: { message: 'Invalid file' } }) };
      llamadasMensaje += 1;
      return { status: 200, json: async () => ({}) };
    };
    const r = await enviarAsset('5212225240044', imagenPath, 'image', { fetchImpl });
    assert.equal(r.ok, false);
    assert.equal(r.etapa, 'upload');
    assert.equal(llamadasMensaje, 0);
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  });
});
