import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WhatsAppAdapter } from '../../src/publishing/whatsappAdapter.js';

// enviarAsset() (graphApiSender.js) verifica que el archivo exista realmente
// en disco ANTES de subir -- estos paths deben ser archivos reales, aunque
// mínimos, no strings arbitrarios.
let dir, slide1Path, slide2Path, videoPath;
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'whatsapp-publish-test-'));
  slide1Path = join(dir, 'slide-01.png');
  slide2Path = join(dir, 'slide-02.png');
  videoPath = join(dir, 'a.mp4');
  writeFileSync(slide1Path, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(slide2Path, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(videoPath, Buffer.from([0x00, 0x00, 0x00, 0x18]));
});
after(() => { rmSync(dir, { recursive: true, force: true }); });

describe('WhatsAppAdapter — envía el Final Asset Package real como mensaje(s)', () => {
  test('sin WHATSAPP_ACCESS_TOKEN/PHONE_NUMBER_ID: CONFIGURATION_REQUIRED, ninguna llamada de red', async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    let llamado = false;
    const adapter = new WhatsAppAdapter({ fetchImpl: async () => { llamado = true; } });
    const r = await adapter.publish({ status: 'COMPLETED', assetPackageType: 'SINGLE', outputAssets: [{ assetId: 'x', path: 'a.mp4' }] }, '5212225240044', {});
    assert.equal(r.status, 'CONFIGURATION_REQUIRED');
    assert.equal(llamado, false);
  });

  test('sin "destination": FAILED explícito', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
    const adapter = new WhatsAppAdapter({});
    const r = await adapter.publish({ status: 'COMPLETED', assetPackageType: 'SINGLE', outputAssets: [{ assetId: 'x', path: 'a.mp4' }] }, null, {});
    assert.equal(r.status, 'FAILED');
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  });

  test('SINGLE, con credenciales + fetch simulado: PUBLISHED, un solo envío', async (t) => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1237988146069127';
    const fetchImpl = async (url) => {
      if (String(url).endsWith('/media')) return { status: 200, json: async () => ({ id: 'media-1' }) };
      return { status: 200, json: async () => ({ messages: [{ id: 'wamid.1' }] }) };
    };
    const adapter = new WhatsAppAdapter({ fetchImpl });
    const r = await adapter.publish({ status: 'COMPLETED', assetPackageType: 'SINGLE', outputAssets: [{ assetId: 'x'.repeat(8), path: videoPath }] }, '5212225240044', { caption: 'Hola' });
    assert.equal(r.status, 'PUBLISHED');
    assert.equal(r.externalId, 'wamid.1');
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  });

  test('CAROUSEL: envía cada slide como mensaje separado, en orden, y agrega los resultados', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1237988146069127';
    let n = 0;
    const fetchImpl = async (url) => {
      if (String(url).endsWith('/media')) { n += 1; return { status: 200, json: async () => ({ id: `media-${n}` }) }; }
      return { status: 200, json: async () => ({ messages: [{ id: `wamid.${n}` }] }) };
    };
    const adapter = new WhatsAppAdapter({ fetchImpl });
    const pkg = {
      status: 'COMPLETED', assetPackageType: 'CAROUSEL',
      assetPackage: { type: 'CAROUSEL', assets: [{ assetId: 'a1', path: slide1Path }, { assetId: 'a2', path: slide2Path }] },
      outputAssets: [],
    };
    const r = await adapter.publish(pkg, '5212225240044', {});
    assert.equal(r.status, 'PUBLISHED');
    assert.equal(r.detail.envios.length, 2);
    assert.equal(n, 2);
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  });

  test('un envío falla en un carrusel: FAILED con el detalle de cuál sí y cuál no', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1237988146069127';
    let llamadaMedia = 0;
    const fetchImpl = async (url) => {
      if (String(url).endsWith('/media')) {
        llamadaMedia += 1;
        if (llamadaMedia === 2) return { status: 400, json: async () => ({ error: { message: 'fallo simulado' } }) };
        return { status: 200, json: async () => ({ id: 'media-1' }) };
      }
      return { status: 200, json: async () => ({ messages: [{ id: 'wamid.1' }] }) };
    };
    const adapter = new WhatsAppAdapter({ fetchImpl });
    const pkg = {
      status: 'COMPLETED', assetPackageType: 'CAROUSEL',
      assetPackage: { type: 'CAROUSEL', assets: [{ assetId: 'a1', path: slide1Path }, { assetId: 'a2', path: slide2Path }] },
      outputAssets: [],
    };
    const r = await adapter.publish(pkg, '5212225240044', {});
    assert.equal(r.status, 'FAILED');
    assert.equal(r.detail.envios.filter((e) => e.ok).length, 1);
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  });
});
