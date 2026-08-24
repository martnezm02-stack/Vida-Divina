// httpServer.test.js
// Pruebas del endpoint HTTP del webhook — servidor real en un puerto
// efímero (127.0.0.1, puerto 0), solicitudes reales vía fetch nativo.
// Ningún payload sale a Internet ni toca Meta.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

import { crearManejador, RUTA_WEBHOOK } from '../src/httpServer.js';
import { loadCompiledKnowledge } from '../../simulator/src/knowledgeLoader.js';
import { CONTEXTOS_ROOT } from '../../simulator/src/contextoStorage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VERIFY_TOKEN = 'test-verify-token-solo-para-pruebas';
const APP_SECRET = 'test-app-secret-solo-para-pruebas';

let servidor;
let baseUrl;

before(async () => {
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
  process.env.WHATSAPP_APP_SECRET = APP_SECRET;

  const kb = loadCompiledKnowledge();
  servidor = http.createServer(crearManejador(kb));
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const { port } = servidor.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => servidor.close(resolve));
  const idsDePrueba = ['test-http-mensaje-entrante'];
  for (const id of idsDePrueba) {
    const ruta = path.join(CONTEXTOS_ROOT, `${id}.json`);
    if (fs.existsSync(ruta)) fs.rmSync(ruta);
  }
});

function firmar(cuerpoTexto) {
  const hmac = crypto.createHmac('sha256', APP_SECRET).update(cuerpoTexto).digest('hex');
  return `sha256=${hmac}`;
}

function payloadMensaje(waId, texto) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID_EJEMPLO',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550001111', phone_number_id: 'PHONE_ID_EJEMPLO' },
              contacts: [{ profile: { name: 'Cliente HTTP' }, wa_id: waId }],
              messages: [
                { from: waId, id: `wamid.${waId}`, timestamp: String(Date.now()), type: 'text', text: { body: texto } },
              ],
            },
          },
        ],
      },
    ],
  };
}

function payloadStatus() {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID_EJEMPLO',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550001111', phone_number_id: 'PHONE_ID_EJEMPLO' },
              statuses: [{ id: 'wamid.EJEMPLO', status: 'delivered', timestamp: String(Date.now()), recipient_id: '5215500000001' }],
            },
          },
        ],
      },
    ],
  };
}

async function postFirmado(cuerpoObjeto) {
  const texto = JSON.stringify(cuerpoObjeto);
  return fetch(`${baseUrl}${RUTA_WEBHOOK}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': firmar(texto) },
    body: texto,
  });
}

describe('Verificación GET del webhook (handshake de Meta)', () => {
  test('hub.mode=subscribe + token correcto → 200 con el challenge tal cual', async () => {
    const url = `${baseUrl}${RUTA_WEBHOOK}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1234567890`;
    const res = await fetch(url);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '1234567890');
  });

  test('token incorrecto → 403', async () => {
    const url = `${baseUrl}${RUTA_WEBHOOK}?hub.mode=subscribe&hub.verify_token=token-incorrecto&hub.challenge=1234567890`;
    const res = await fetch(url);
    assert.equal(res.status, 403);
  });

  test('sin hub.mode=subscribe → 403', async () => {
    const url = `${baseUrl}${RUTA_WEBHOOK}?hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1234567890`;
    const res = await fetch(url);
    assert.equal(res.status, 403);
  });
});

describe('Firma de las solicitudes POST (X-Hub-Signature-256)', () => {
  test('firma inválida → 401, no procesa el evento', async () => {
    const texto = JSON.stringify(payloadMensaje('test-http-firma-invalida', 'Hola'));
    const res = await fetch(`${baseUrl}${RUTA_WEBHOOK}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000' },
      body: texto,
    });
    assert.equal(res.status, 401);
    const ruta = path.join(CONTEXTOS_ROOT, 'test-http-firma-invalida.json');
    assert.equal(fs.existsSync(ruta), false);
  });
});

describe('POST — mensaje entrante real llega hasta outboundBuilder, sin envío real', () => {
  test('payload sintético de "mensaje entrante" produce salida estructurada con envioReal:false', async () => {
    // Fase Pre-E2E: id único por corrida — este id sí llega a persistirse
    // en DATABASE_URL (real, sin limpieza entre corridas).
    const res = await postFirmado(payloadMensaje(`test-http-mensaje-entrante-${Date.now()}`, 'Hola, buenas tardes'));
    assert.equal(res.status, 200);
    const cuerpo = await res.json();

    assert.equal(cuerpo.procesado, true);
    assert.equal(cuerpo.tipoEvento, 'mensaje_entrante');
    assert.equal(cuerpo.envioReal, false); // nunca se envía nada real a Meta en esta fase
    assert.equal(cuerpo.enviar, true);
    assert.equal(cuerpo.recursos[0].tipo, 'texto');
  });
});

describe('POST — statuses no activa el motor', () => {
  test('un evento de estado responde 200 pero procesado:false', async () => {
    const res = await postFirmado(payloadStatus());
    assert.equal(res.status, 200);
    const cuerpo = await res.json();
    assert.equal(cuerpo.procesado, false);
    assert.equal(cuerpo.tipoEvento, 'evento_estado');
    assert.equal(cuerpo.envioReal, false);
  });
});

describe('POST — payload no procesable no activa el motor', () => {
  test('estructura irreconocible responde 200 con procesado:false', async () => {
    const res = await postFirmado({ objeto: 'no-es-un-payload-de-meta' });
    assert.equal(res.status, 200);
    const cuerpo = await res.json();
    assert.equal(cuerpo.procesado, false);
    assert.equal(cuerpo.tipoEvento, 'no_procesable');
  });

  test('JSON malformado responde 400, no procesado', async () => {
    const res = await fetch(`${baseUrl}${RUTA_WEBHOOK}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': firmar('{esto no es json') },
      body: '{esto no es json',
    });
    assert.equal(res.status, 400);
  });
});

describe('Rutas y métodos no soportados', () => {
  test('ruta desconocida → 404', async () => {
    const res = await fetch(`${baseUrl}/no-existe`);
    assert.equal(res.status, 404);
  });

  test('método no soportado en /webhook → 405', async () => {
    const res = await fetch(`${baseUrl}${RUTA_WEBHOOK}`, { method: 'PUT' });
    assert.equal(res.status, 405);
  });
});

describe('POST — envío real habilitado (fetch global simulado, ninguna petición sale a Internet)', () => {
  test('con WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID definidas, responde envioReal:true y reporta los envíos', async () => {
    const fetchOriginal = globalThis.fetch;
    const llamadas = [];
    // Solo se intercepta la llamada saliente hacia Graph API — la petición
    // del propio test hacia el servidor local (misma función fetch global)
    // debe seguir yendo por la red real de loopback, o nunca llegaría al
    // servidor.
    globalThis.fetch = async (url, opciones) => {
      if (typeof url === 'string' && url.startsWith('https://graph.facebook.com/')) {
        llamadas.push({ url, opciones });
        return { status: 200, json: async () => ({ messages: [{ id: 'wamid.SIMULADO' }] }) };
      }
      return fetchOriginal(url, opciones);
    };
    process.env.WHATSAPP_ACCESS_TOKEN = 'token-de-prueba-http';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1237988146069127';

    const idPrueba = `test-http-envio-real-${Date.now()}`;
    try {
      const res = await postFirmado(payloadMensaje(idPrueba, 'Hola, buenas tardes'));
      const cuerpo = await res.json();

      assert.equal(res.status, 200);
      assert.equal(cuerpo.envioReal, true);
      assert.equal(cuerpo.envios.length, cuerpo.recursos.length);
      assert.equal(cuerpo.envios[0].enviado, true);
      assert.ok(llamadas.length > 0);
      assert.match(llamadas[0].url, /^https:\/\/graph\.facebook\.com\/v21\.0\/1237988146069127\/messages$/);
    } finally {
      globalThis.fetch = fetchOriginal;
      delete process.env.WHATSAPP_ACCESS_TOKEN;
      delete process.env.WHATSAPP_PHONE_NUMBER_ID;
      const ruta = path.join(CONTEXTOS_ROOT, `${idPrueba}.json`);
      if (fs.existsSync(ruta)) fs.rmSync(ruta);
    }
  });
});

describe('El servidor HTTP no introduce ningún mecanismo proactivo', () => {
  test('httpServer.js y server.js no importan evaluarRecuperacion ni usan setInterval/setTimeout', () => {
    const archivos = [
      path.join(__dirname, '..', 'src', 'httpServer.js'),
      path.join(__dirname, '..', 'server.js'),
    ];
    const patronesProhibidos = [/setInterval\s*\(/, /setTimeout\s*\(/, /node-cron/, /require\(['"]cron['"]\)/];

    for (const archivo of archivos) {
      const contenido = fs
        .readFileSync(archivo, 'utf8')
        .split('\n')
        .filter((linea) => !linea.trim().startsWith('//'))
        .join('\n');

      assert.equal(contenido.includes('evaluarRecuperacion'), false, `${path.basename(archivo)} no debe importar evaluarRecuperacion`);
      for (const patron of patronesProhibidos) {
        assert.equal(patron.test(contenido), false, `${path.basename(archivo)} no debe contener ${patron}`);
      }
    }
  });
});
