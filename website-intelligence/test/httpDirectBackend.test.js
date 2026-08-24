// httpDirectBackend.test.js — Prueba el backend REAL por defecto con
// fetchImpl inyectado (mockeado) — nunca se hace una llamada de red real en
// esta suite, tal como exige la Fase 8 ("sin necesitar Internet real").

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HttpDirectBackend } from '../src/acquisition/backends/httpDirectBackend.js';

function fakeResponse({ status = 200, ok = true, body = '' }) {
  return { status, ok, text: async () => body };
}

describe('HttpDirectBackend — capabilities declaradas honestamente', () => {
  test('no afirma capacidades que no tiene (sin JS, sin screenshots, sin interacción, sin viewport)', () => {
    const backend = new HttpDirectBackend();
    const caps = backend.capabilities;
    assert.equal(caps.rendersJavaScript, false);
    assert.equal(caps.capturesScreenshots, false);
    assert.equal(caps.capturesInteractions, false);
    assert.equal(caps.respectsViewport, false);
  });
});

describe('HttpDirectBackend — "leer una página" (nunca "observar")', () => {
  test('respuesta exitosa devuelve html, text plano y título extraído', async () => {
    const backend = new HttpDirectBackend({
      fetchImpl: async () => fakeResponse({ body: '<html><title>Mi Página</title><body><h1>Hola</h1></body></html>' }),
    });
    const result = await backend.fetch('https://ejemplo-ficticio.test/x');
    assert.equal(result.ok, true);
    assert.equal(result.title, 'Mi Página');
    assert.match(result.text, /Hola/);
    assert.doesNotMatch(result.text, /<h1>/); // el texto plano no debe contener etiquetas
  });

  test('HTTP 401/403 se reporta como authRequired, nunca como contenido parcial', async () => {
    const backend = new HttpDirectBackend({ fetchImpl: async () => fakeResponse({ status: 401, ok: false }) });
    const result = await backend.fetch('https://ejemplo-ficticio.test/privado');
    assert.equal(result.authRequired, true);
    assert.equal(result.ok, false);
    assert.equal(result.html, null);
  });

  test('un formulario de login en el HTML (sin 401/403) también se detecta como authRequired', async () => {
    const backend = new HttpDirectBackend({
      fetchImpl: async () => fakeResponse({ body: '<html><body><form><input type="password"/></form></body></html>' }),
    });
    const result = await backend.fetch('https://ejemplo-ficticio.test/login');
    assert.equal(result.authRequired, true);
  });

  test('contenido con marcadores anti-bot se reporta como blocked, nunca se intenta evadir', async () => {
    const backend = new HttpDirectBackend({
      fetchImpl: async () => fakeResponse({ body: 'Please complete the CAPTCHA to continue.' }),
    });
    const result = await backend.fetch('https://ejemplo-ficticio.test/bloqueado');
    assert.equal(result.blocked, true);
    assert.equal(result.ok, false);
  });

  test('un error HTTP genérico (500) se reporta como error, distinto de blocked/authRequired', async () => {
    const backend = new HttpDirectBackend({ fetchImpl: async () => fakeResponse({ status: 500, ok: false }) });
    const result = await backend.fetch('https://ejemplo-ficticio.test/roto');
    assert.equal(result.ok, false);
    assert.equal(result.blocked, false);
    assert.equal(result.authRequired, false);
  });
});
