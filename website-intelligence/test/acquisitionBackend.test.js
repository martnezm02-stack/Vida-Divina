// acquisitionBackend.test.js — Prueba central de INTERCAMBIABILIDAD (Fase 8):
// una misma función de "adquirir y normalizar" debe funcionar idéntica sin
// importar qué backend concreto se le inyecte, mientras el backend cumpla la
// interfaz. Esto es la prueba directa de que Website Intelligence no conoce
// ninguna herramienta específica — solo la interfaz.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AcquisitionBackend } from '../src/acquisition/acquisitionBackend.js';
import { HttpDirectBackend } from '../src/acquisition/backends/httpDirectBackend.js';
import { ClaudeInChromeStubBackend } from '../src/acquisition/backends/claudeInChromeStubBackend.js';
import { AgentReachWebsiteBackend } from '../src/acquisition/backends/agentReachWebsiteBackend.js';
import { createWebsiteRawRecordFromBackendResult } from '../src/acquisition/websiteRawRecord.js';

describe('AcquisitionBackend — clase abstracta', () => {
  test('lanza si una subclase no implementa "name" o "fetch"', async () => {
    const backend = new AcquisitionBackend();
    assert.throws(() => backend.name);
    await assert.rejects(() => backend.fetch('https://x.test'));
  });

  test('capabilities por defecto son todas false — un backend debe declarar explícitamente lo que soporta', () => {
    const backend = new AcquisitionBackend();
    const caps = backend.capabilities;
    assert.equal(caps.rendersJavaScript, false);
    assert.equal(caps.capturesScreenshots, false);
    assert.equal(caps.capturesInteractions, false);
    assert.equal(caps.respectsViewport, false);
    assert.equal(caps.supportsAuthentication, false);
  });
});

// Un "adapter" mínimo de prueba: exactamente la función que un futuro
// websiteAdapter.js implementaría — recibe CUALQUIER backend, nunca conoce
// su tipo concreto.
async function acquireAndNormalize(backend, url) {
  const result = await backend.fetch(url);
  return createWebsiteRawRecordFromBackendResult(result, { url, acquisitionMethod: 'http_direct' });
}

describe('Intercambiabilidad real de backends', () => {
  test('un backend HTTP real (con fetch mockeado) y un backend en memoria producen WebsiteRawRecord con la misma forma', async () => {
    const mockedHttpBackend = new HttpDirectBackend({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => '<html><title>Hola</title><body>contenido</body></html>',
      }),
    });

    class InMemoryTestBackend extends AcquisitionBackend {
      get name() { return 'in_memory_test'; }
      async fetch() {
        return { ok: true, blocked: false, authRequired: false, httpStatus: 200, html: '<html>x</html>', text: 'x', title: 'Título fijo' };
      }
    }

    const recordFromHttp = await acquireAndNormalize(mockedHttpBackend, 'https://ejemplo-ficticio.test/pagina');
    const recordFromMemory = await acquireAndNormalize(new InMemoryTestBackend(), 'https://ejemplo-ficticio.test/pagina');

    assert.equal(recordFromHttp.fetch_status, 'ok');
    assert.equal(recordFromMemory.fetch_status, 'ok');
    // Misma forma de objeto (mismas claves), aunque el backend detrás sea completamente distinto:
    assert.deepEqual(Object.keys(recordFromHttp).sort(), Object.keys(recordFromMemory).sort());
  });

  test('los backends no instalados/no conectados son intercambiables como STUB sin romper la interfaz — solo fallan al invocarlos', async () => {
    const claudeInChrome = new ClaudeInChromeStubBackend();
    const agentReach = new AgentReachWebsiteBackend();

    assert.equal(typeof claudeInChrome.name, 'string');
    assert.equal(typeof agentReach.name, 'string');
    assert.ok(claudeInChrome.capabilities.rendersJavaScript);
    assert.ok(agentReach.capabilities.capturesScreenshots);

    await assert.rejects(() => claudeInChrome.fetch('https://x.test'), /REQUIERE AUTORIZACIÓN/);
    await assert.rejects(() => agentReach.fetch('https://x.test'), /REQUIERE AUTORIZACIÓN/);
  });
});
