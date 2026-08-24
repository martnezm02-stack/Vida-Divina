// graphApiSender.test.js
// Pruebas del módulo de envío real — ninguna toca la red: fetchImpl se
// inyecta como un doble de prueba en cada caso. Cubre: envío deshabilitado
// por falta de variables de entorno, extracción de texto enviable (nunca
// se fabrica contenido para recursos sin texto real), manejo de error de
// Graph API y manejo de error de red.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { envioHabilitado, enviarRecursos, enviarAudio } from '../src/graphApiSender.js';

const ENV_KEYS = ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_GRAPH_API_VERSION'];
let envOriginal;

beforeEach(() => {
  envOriginal = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (envOriginal[k] === undefined) delete process.env[k];
    else process.env[k] = envOriginal[k];
  }
});

function fetchFalso({ status = 200, cuerpo = { messages: [{ id: 'wamid.FALSO' }] } } = {}) {
  const llamadas = [];
  const impl = async (url, opciones) => {
    llamadas.push({ url, opciones });
    return {
      status,
      json: async () => cuerpo,
    };
  };
  impl.llamadas = llamadas;
  return impl;
}

describe('envioHabilitado()', () => {
  test('false si faltan ambas variables', () => {
    assert.equal(envioHabilitado(), false);
  });

  test('false si falta solo WHATSAPP_PHONE_NUMBER_ID', () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token-de-prueba';
    assert.equal(envioHabilitado(), false);
  });

  test('true si ambas están definidas', () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token-de-prueba';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1237988146069127';
    assert.equal(envioHabilitado(), true);
  });
});

describe('enviarRecursos() — envío deshabilitado', () => {
  test('sin variables de entorno, reporta todos los recursos como no enviados, sin llamar a fetch', async () => {
    const fetchImpl = fetchFalso();
    const resultado = {
      id: '5215500000001',
      recursos: [{ tipo: 'texto', contenido: 'Hola' }],
    };

    const reportes = await enviarRecursos(resultado, { fetchImpl });

    assert.deepEqual(reportes, [{ tipo: 'texto', enviado: false, motivo: 'envio_deshabilitado' }]);
    assert.equal(fetchImpl.llamadas.length, 0);
  });
});

describe('enviarRecursos() — envío habilitado', () => {
  beforeEach(() => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token-de-prueba';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1237988146069127';
  });

  test('recurso "texto" con contenido real se envía como mensaje de texto', async () => {
    const fetchImpl = fetchFalso();
    const resultado = { id: '5215500000001', recursos: [{ tipo: 'texto', contenido: 'Hola, buenas tardes' }] };

    const reportes = await enviarRecursos(resultado, { fetchImpl });

    assert.equal(reportes.length, 1);
    assert.equal(reportes[0].enviado, true);
    assert.equal(fetchImpl.llamadas.length, 1);

    const { url, opciones } = fetchImpl.llamadas[0];
    assert.equal(url, 'https://graph.facebook.com/v21.0/1237988146069127/messages');
    assert.equal(opciones.method, 'POST');
    assert.equal(opciones.headers.Authorization, 'Bearer token-de-prueba');
    const cuerpo = JSON.parse(opciones.body);
    assert.deepEqual(cuerpo, {
      messaging_product: 'whatsapp',
      to: '5215500000001',
      type: 'text',
      text: { body: 'Hola, buenas tardes' },
    });
  });

  test('respeta WHATSAPP_GRAPH_API_VERSION si está definida', async () => {
    process.env.WHATSAPP_GRAPH_API_VERSION = 'v23.0';
    const fetchImpl = fetchFalso();
    const resultado = { id: '5215500000001', recursos: [{ tipo: 'texto', contenido: 'Hola' }] };

    await enviarRecursos(resultado, { fetchImpl });

    assert.match(fetchImpl.llamadas[0].url, /^https:\/\/graph\.facebook\.com\/v23\.0\//);
  });

  test('recurso "audio" (contenido de texto real) se envía como texto', async () => {
    const fetchImpl = fetchFalso();
    const resultado = {
      id: '5215500000001',
      recursos: [{ tipo: 'audio', contenido: 'Pregunta de cierre de la explicación.' }],
    };

    const reportes = await enviarRecursos(resultado, { fetchImpl });

    assert.equal(reportes[0].enviado, true);
    const cuerpo = JSON.parse(fetchImpl.llamadas[0].opciones.body);
    assert.equal(cuerpo.text.body, 'Pregunta de cierre de la explicación.');
  });

  test('recurso "testimonio" (disponible:false) se omite sin llamar a fetch, sin fabricar texto', async () => {
    const fetchImpl = fetchFalso();
    const resultado = {
      id: '5215500000001',
      recursos: [{ tipo: 'testimonio', disponible: false, necesidadId: 'estrenimiento' }],
    };

    const reportes = await enviarRecursos(resultado, { fetchImpl });

    assert.deepEqual(reportes, [{ tipo: 'testimonio', enviado: false, motivo: 'sin_contenido_de_texto' }]);
    assert.equal(fetchImpl.llamadas.length, 0);
  });

  test('recurso "objecion_documentada" (sin contenido de texto) se omite sin fabricar texto', async () => {
    const fetchImpl = fetchFalso();
    const resultado = {
      id: '5215500000001',
      recursos: [{ tipo: 'objecion_documentada', objecionId: 'esta_caro', fuente: 'docs/objeciones/esta_caro.md' }],
    };

    const reportes = await enviarRecursos(resultado, { fetchImpl });

    assert.deepEqual(reportes, [{ tipo: 'objecion_documentada', enviado: false, motivo: 'sin_contenido_de_texto' }]);
    assert.equal(fetchImpl.llamadas.length, 0);
  });

  test('recursos mixtos: cada uno se reporta por separado, en orden', async () => {
    const fetchImpl = fetchFalso();
    const resultado = {
      id: '5215500000001',
      recursos: [
        { tipo: 'audio', contenido: 'Pregunta.' },
        { tipo: 'testimonio', disponible: false },
        { tipo: 'imagen_precio', disponible: false },
        { tipo: 'oferta', contenido: 'Oferta real.' },
        { tipo: 'cierre', subtipo: 'texto', contenido: 'Cierre real.' },
      ],
    };

    const reportes = await enviarRecursos(resultado, { fetchImpl });

    assert.deepEqual(
      reportes.map((r) => r.tipo),
      ['audio', 'testimonio', 'imagen_precio', 'oferta', 'cierre']
    );
    assert.deepEqual(
      reportes.map((r) => r.enviado),
      [true, false, false, true, true]
    );
    assert.equal(fetchImpl.llamadas.length, 3); // solo los 3 con texto real
  });

  test('Graph API responde con error (4xx) → enviado:false, status preservado, no lanza', async () => {
    const fetchImpl = fetchFalso({ status: 401, cuerpo: { error: { message: 'Invalid OAuth access token.' } } });
    const resultado = { id: '5215500000001', recursos: [{ tipo: 'texto', contenido: 'Hola' }] };

    const reportes = await enviarRecursos(resultado, { fetchImpl });

    assert.equal(reportes[0].enviado, false);
    assert.equal(reportes[0].status, 401);
  });

  test('fallo de red → enviado:false con motivo error_red, no lanza', async () => {
    const fetchImpl = async () => {
      throw new Error('fetch failed: ECONNREFUSED');
    };
    const resultado = { id: '5215500000001', recursos: [{ tipo: 'texto', contenido: 'Hola' }] };

    const reportes = await enviarRecursos(resultado, { fetchImpl });

    assert.equal(reportes[0].enviado, false);
    assert.equal(reportes[0].motivo, 'error_red');
  });
});

describe('enviarAudio() — camino mínimo archivo -> upload -> media_id -> mensaje', () => {
  let dir;
  let archivoAudio;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'whatsapp-adapter-test-'));
    archivoAudio = join(dir, 'clip-de-prueba.ogg');
    await writeFile(archivoAudio, Buffer.from([0x4f, 0x67, 0x67, 0x53])); // cabecera OggS, contenido irrelevante para las pruebas
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function fetchDobleUploadYEnvio({
    uploadStatus = 200,
    uploadCuerpo = { id: 'MEDIA_ID_FALSO' },
    sendStatus = 200,
    sendCuerpo = { messages: [{ id: 'wamid.FALSO_AUDIO' }] },
  } = {}) {
    const llamadas = [];
    const impl = async (url, opciones) => {
      llamadas.push({ url, opciones });
      if (url.includes('/media')) {
        return { status: uploadStatus, json: async () => uploadCuerpo };
      }
      return { status: sendStatus, json: async () => sendCuerpo };
    };
    impl.llamadas = llamadas;
    return impl;
  }

  test('sin variables de entorno → ok:false, etapa "config", sin llamar a fetch', async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    const fetchImpl = fetchDobleUploadYEnvio();

    const resultado = await enviarAudio('5212225240044', archivoAudio, { fetchImpl });

    assert.equal(resultado.ok, false);
    assert.equal(resultado.etapa, 'config');
    assert.equal(fetchImpl.llamadas.length, 0);
  });

  describe('con variables de entorno definidas', () => {
    beforeEach(() => {
      process.env.WHATSAPP_ACCESS_TOKEN = 'token-de-prueba';
      process.env.WHATSAPP_PHONE_NUMBER_ID = '1237988146069127';
    });

    test('archivo inexistente → ok:false, etapa "validacion_archivo", sin llamar a fetch', async () => {
      const fetchImpl = fetchDobleUploadYEnvio();
      const rutaInexistente = join(dir, 'no-existe.ogg');

      const resultado = await enviarAudio('5212225240044', rutaInexistente, { fetchImpl });

      assert.equal(resultado.ok, false);
      assert.equal(resultado.etapa, 'validacion_archivo');
      assert.equal(fetchImpl.llamadas.length, 0);
    });

    test('camino feliz: upload + envío exitosos → ok:true con mediaId y messageId', async () => {
      const fetchImpl = fetchDobleUploadYEnvio();

      const resultado = await enviarAudio('5212225240044', archivoAudio, { fetchImpl });

      assert.equal(resultado.ok, true);
      assert.equal(resultado.etapa, 'completo');
      assert.equal(resultado.uploadStatus, 200);
      assert.equal(resultado.mediaId, 'MEDIA_ID_FALSO');
      assert.equal(resultado.sendStatus, 200);
      assert.equal(resultado.messageId, 'wamid.FALSO_AUDIO');
      assert.equal(fetchImpl.llamadas.length, 2);

      const llamadaUpload = fetchImpl.llamadas[0];
      assert.match(llamadaUpload.url, /\/1237988146069127\/media$/);
      assert.equal(llamadaUpload.opciones.headers.Authorization, 'Bearer token-de-prueba');
      assert.equal(llamadaUpload.opciones.headers['Content-Type'], undefined); // multipart: el boundary lo pone fetch, no nosotros
      assert.ok(llamadaUpload.opciones.body instanceof FormData);

      const llamadaEnvio = fetchImpl.llamadas[1];
      assert.match(llamadaEnvio.url, /\/1237988146069127\/messages$/);
      const cuerpoEnvio = JSON.parse(llamadaEnvio.opciones.body);
      assert.deepEqual(cuerpoEnvio, {
        messaging_product: 'whatsapp',
        to: '5212225240044',
        type: 'audio',
        audio: { id: 'MEDIA_ID_FALSO' },
      });
    });

    test('upload falla (4xx) → ok:false, etapa "upload", no intenta enviar el mensaje', async () => {
      const fetchImpl = fetchDobleUploadYEnvio({
        uploadStatus: 401,
        uploadCuerpo: { error: { message: 'Invalid OAuth access token.' } },
      });

      const resultado = await enviarAudio('5212225240044', archivoAudio, { fetchImpl });

      assert.equal(resultado.ok, false);
      assert.equal(resultado.etapa, 'upload');
      assert.equal(resultado.uploadStatus, 401);
      assert.equal(resultado.error, 'Invalid OAuth access token.');
      assert.equal(fetchImpl.llamadas.length, 1); // nunca llega a intentar el envío
    });

    test('upload ok pero envío del mensaje falla → ok:false, etapa "send", conserva mediaId', async () => {
      const fetchImpl = fetchDobleUploadYEnvio({
        sendStatus: 400,
        sendCuerpo: { error: { message: 'Recipient phone number not in allowed list' } },
      });

      const resultado = await enviarAudio('5212225240044', archivoAudio, { fetchImpl });

      assert.equal(resultado.ok, false);
      assert.equal(resultado.etapa, 'send');
      assert.equal(resultado.mediaId, 'MEDIA_ID_FALSO');
      assert.equal(resultado.sendStatus, 400);
      assert.equal(resultado.error, 'Recipient phone number not in allowed list');
    });

    test('fallo de red durante el upload → ok:false, etapa "upload", motivo error_red', async () => {
      const fetchImpl = async () => {
        throw new Error('fetch failed: ECONNREFUSED');
      };

      const resultado = await enviarAudio('5212225240044', archivoAudio, { fetchImpl });

      assert.equal(resultado.ok, false);
      assert.equal(resultado.etapa, 'upload');
      assert.match(resultado.error, /error_red/);
    });

    test('respeta WHATSAPP_GRAPH_API_VERSION si está definida', async () => {
      process.env.WHATSAPP_GRAPH_API_VERSION = 'v23.0';
      const fetchImpl = fetchDobleUploadYEnvio();

      await enviarAudio('5212225240044', archivoAudio, { fetchImpl });

      assert.match(fetchImpl.llamadas[0].url, /^https:\/\/graph\.facebook\.com\/v23\.0\//);
      assert.match(fetchImpl.llamadas[1].url, /^https:\/\/graph\.facebook\.com\/v23\.0\//);
    });
  });
});
