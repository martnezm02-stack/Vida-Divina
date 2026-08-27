// kreaMcpClient.test.js — Integración Productiva Krea MCP Directo
// (2026-08-27). Sin red externa real -- usa un servidor MCP real de
// prueba local (fakeKreaMcpServer.js, SDK oficial real, Streamable HTTP
// real) para ejercer conexión real/discovery real/tool-call real/timeout
// real/reintento real/concurrencia real SIN depender de api.krea.ai real
// ni de una sesión OAuth real (esa parte ya se validó real por separado,
// ver experiments/krea-mcp-node-poc/ y el E2E real de producción).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startFakeKreaMcpServer } from './helpers/fakeKreaMcpServer.js';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'krea-mcp-client-test-'));
process.env.IMAGE_GENERATION_DATA_ROOT = TEST_DATA_ROOT; // aislado real -- nunca toca los tokens reales de producción persistidos.

const {
  callKreaMcpTool, listKreaMcpTools, isKreaMcpConfigured, KreaMcpUnavailableError,
} = await import('../src/providers/kreaMcpClient.js');

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
  delete process.env.IMAGE_GENERATION_DATA_ROOT;
  delete process.env.KREA_MCP_URL;
  delete process.env.KREA_MCP_CONNECT_TIMEOUT_MS;
  delete process.env.KREA_MCP_CALL_TIMEOUT_MS;
  delete process.env.KREA_MCP_MAX_RETRIES;
});

describe('isKreaMcpConfigured() — real, rápido, sin auth interactiva', () => {
  test('sin tokens reales persistidos -> false', () => {
    assert.equal(isKreaMcpConfigured(), false);
  });
});

describe('KreaMcpClient — conexión/discovery/tool-call reales contra un servidor MCP real de prueba', () => {
  let fakeServer;
  before(async () => {
    fakeServer = await startFakeKreaMcpServer(async (args) => ({
      job_id: 'fake-job-1', status: 'completed', result: { urls: [`http://127.0.0.1:9/${args.model}.png`] },
    }));
    process.env.KREA_MCP_URL = fakeServer.url;
  });
  after(async () => {
    await fakeServer.close();
    delete process.env.KREA_MCP_URL;
  });

  test('listKreaMcpTools() real descubre la tool real "generate_image"', async () => {
    const { tools } = await listKreaMcpTools();
    assert.ok(tools.some((t) => t.name === 'generate_image'));
  });

  test('callKreaMcpTool() real invoca la tool real y devuelve el resultado real', async () => {
    const result = await callKreaMcpTool('generate_image', { model: 'krea/krea-2/large', input: { prompt: 'x' } });
    const texto = result.content.find((c) => c.type === 'text').text;
    const job = JSON.parse(texto);
    assert.equal(job.status, 'completed');
    assert.equal(job.job_id, 'fake-job-1');
  });

  test('concurrencia real (Paso 17): dos llamadas reales simultáneas, cada una con su propia sesión real, ninguna falla por "already started"', async () => {
    const [r1, r2] = await Promise.all([
      callKreaMcpTool('generate_image', { model: 'krea/krea-2/turbo', input: { prompt: 'a' } }),
      callKreaMcpTool('generate_image', { model: 'krea/krea-2/large', input: { prompt: 'b' } }),
    ]);
    assert.ok(r1.content[0].text.includes('completed'));
    assert.ok(r2.content[0].text.includes('completed'));
  });

  test('sesiones reales SECUENCIALES (Fix B del POC): la segunda llamada real nunca reutiliza el transport real de la primera', async () => {
    await callKreaMcpTool('generate_image', { model: 'krea/krea-2/large', input: { prompt: 'primera' } });
    // Si el Fix B no estuviera aplicado real, esta segunda llamada real
    // lanzaría "StreamableHTTPClientTransport already started!".
    const result = await callKreaMcpTool('generate_image', { model: 'krea/krea-2/large', input: { prompt: 'segunda' } });
    assert.ok(result.content[0].text.includes('completed'));
  });
});

describe('KreaMcpClient — timeout real de llamada (Paso 16 del encargo, nunca infinito)', () => {
  let fakeServer;
  before(async () => {
    fakeServer = await startFakeKreaMcpServer(async () => {
      await new Promise((resolve) => { setTimeout(resolve, 2000); }); // más lento real que el timeoutMs real de la prueba.
      return { job_id: 'fake-job-lento', status: 'completed', result: { urls: ['http://127.0.0.1:9/x.png'] } };
    });
    process.env.KREA_MCP_URL = fakeServer.url;
  });
  after(async () => {
    await fakeServer.close();
    delete process.env.KREA_MCP_URL;
  });

  test('timeoutMs real corto -> KreaMcpUnavailableError real, nunca espera infinitamente', async () => {
    await assert.rejects(
      () => callKreaMcpTool('generate_image', { model: 'krea/krea-2/large', input: { prompt: 'x' } }, { timeoutMs: 200, retries: 0 }),
      KreaMcpUnavailableError,
    );
  });
});

describe('KreaMcpClient — servidor MCP real inalcanzable (Paso 15 del encargo, KREA_MCP_UNAVAILABLE real)', () => {
  before(() => { process.env.KREA_MCP_URL = 'http://127.0.0.1:1'; }); // puerto real inalcanzable a propósito.
  after(() => { delete process.env.KREA_MCP_URL; });

  test('sin servidor real -> KreaMcpUnavailableError real, nunca un éxito fabricado', async () => {
    await assert.rejects(
      () => callKreaMcpTool('generate_image', { model: 'krea/krea-2/large', input: { prompt: 'x' } }, { retries: 0 }),
      KreaMcpUnavailableError,
    );
  });
});
