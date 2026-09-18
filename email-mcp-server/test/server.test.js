// server.test.js — email-mcp-server real, vía protocolo MCP genuino (no un
// mock del SDK): levanta el servidor real como proceso hijo y le habla por
// stdio con un Client real. FASE "Hermes ADMIN + Gmail MCP completo"
// (2026-09-04): sin OAuth real configurado en este entorno, se valida que
// cada tool de Gmail responde un error real y honesto, nunca un envío/
// lectura/borrador simulado.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(__dirname, '..', 'src', 'server.js');

const GMAIL_TOOLS = ['searchEmails', 'readEmail', 'summarizeEmails', 'createDraft', 'updateDraft', 'trashEmail', 'getDraftSummary', 'sendApprovedEmail'];
const CALENDAR_TOOLS = ['createFollowUpCalendarEvent'];

// Esta suite valida el error real y honesto "Gmail no está configurado" --
// nunca necesita hablar con Gmail real para eso. Sin este stub, en cuanto
// OAuth quedó configurado en este entorno cada corrida creaba borradores
// REALES en tienda.vivevidadivina@gmail.com (hallazgo real, 2026-09-04).
// server.js carga su propio .env vía process.loadEnvFile, que NUNCA
// sobreescribe una variable ya presente (incluso vacía) -- por eso basta
// con pasarlas vacías aquí para que el proceso hijo real vea
// gmailConfigured() = false, sin tocar producción ni el .env real.
const GMAIL_ENV_STUB = {
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  GOOGLE_REDIRECT_URI: '',
  GOOGLE_REFRESH_TOKEN: '',
};

async function withClient(fn) {
  const transport = new StdioClientTransport({ command: 'node', args: [SERVER_PATH], env: GMAIL_ENV_STUB });
  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

test('expone send_email (legado) + los 8 tools reales de Gmail + el tool real de Calendar', async () => {
  const tools = await withClient((client) => client.listTools());
  assert.deepEqual(tools.tools.map((t) => t.name).sort(), ['send_email', ...GMAIL_TOOLS, ...CALENDAR_TOOLS].sort());
});

test('send_email sin SMTP configurado: error real, nunca simula un envío exitoso', async () => {
  const result = await withClient((client) =>
    client.callTool({ name: 'send_email', arguments: { subject: 'prueba real', text: 'cuerpo real' } })
  );
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /SMTP no está configurado/);
});

test('tool desconocida -> error real, no silencioso', async () => {
  await assert.rejects(
    withClient((client) => client.callTool({ name: 'tool_inexistente', arguments: {} }))
  );
});

for (const nombre of GMAIL_TOOLS) {
  test(`${nombre} sin Gmail/OAuth configurado: error real, nunca simula un resultado`, async () => {
    const args = { messageId: 'x', draftId: 'x', to: 'x@x.com', subject: 'x', body: 'x' };
    const result = await withClient((client) => client.callTool({ name: nombre, arguments: args }));
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Gmail no está configurado/);
  });
}

for (const nombre of CALENDAR_TOOLS) {
  test(`${nombre} sin Calendar/OAuth configurado: error real, nunca simula un resultado`, async () => {
    const args = { followUpId: 'x', titulo: 'x', descripcion: 'x', inicioISO: '2026-01-01T10:00:00-06:00', finISO: '2026-01-01T10:30:00-06:00' };
    const result = await withClient((client) => client.callTool({ name: nombre, arguments: args }));
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Google Calendar no está configurado/);
  });
}
