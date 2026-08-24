// whatsapp.test.js — WHATSAPP CONSOLE (Fase 15, Partes 8-16). Integración
// real contra PostgreSQL (TEST_DATABASE_URL, nunca DATABASE_URL — mismo
// criterio que whatsapp-adapter/test/e2ePostgres.test.js) + servidor HTTP
// real del dashboard. Sin mocks de crm/ ni de graphApiSender.js: el envío
// real está deshabilitado en este entorno (sin WHATSAPP_ACCESS_TOKEN), así
// que "enviar" ejercita el camino real CONFIGURATION_REQUIRED, nunca un
// POST real a Meta.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Mismo criterio que whatsapp-adapter/test/e2ePostgres.test.js: el pool de
// crm/ es perezoso y lee DATABASE_URL en cada llamada -- sin esto, las
// rutas del dashboard escribirían contra la base real de desarrollo.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.PORT = '0';
delete process.env.DASHBOARD_NO_LISTEN;

const { server } = await import('../server/index.js');
const crm = await import('../../crm/index.js');
const { getTestPool, resetDatabase, closeTestPool } = await import('../../crm/test/helpers/db.js');

let baseUrl;
let pool;
let fixtureConversationId;
let realConversationId;

before(async () => {
  pool = await getTestPool();
  await resetDatabase(pool);

  // Fase 16, Parte 4/21 -- fixtures de test SIEMPRE con source explícito
  // ('TEST'), nunca 'REAL' ni el default 'UNKNOWN' (para poder probar el
  // filtro por source sin ambigüedad).
  const customer = await crm.customers.createCustomer({ nombre: null, email: null });
  const channel = await crm.customerChannels.createCustomerChannel({ customerId: customer.customerId, tipoCanal: 'whatsapp', identificadorExterno: '5215500000000' });
  const conversation = await crm.conversations.createConversation({ customerId: customer.customerId, customerChannelId: channel.customerChannelId, waIdConversacion: '5215500000000', estadoActual: 'PrecioEnviado', ultimaInteraccion: new Date().toISOString(), source: 'TEST' });
  fixtureConversationId = conversation.conversationId;
  await crm.messages.insertMessage({ conversationId: fixtureConversationId, direccion: 'entrante', texto: 'Hola, ¿cuánto cuesta?', timestamp: new Date(Date.now() - 60000).toISOString() });
  await crm.messages.insertMessage({ conversationId: fixtureConversationId, direccion: 'saliente', texto: 'Cuesta $X, ¿te interesa?', timestamp: new Date().toISOString() });

  // Segunda conversación fixture, source REAL explícito -- para probar que
  // el filtro por defecto (REAL) sí la incluye y excluye la 'TEST' de arriba.
  const customer2 = await crm.customers.createCustomer({ nombre: 'Cliente Real de Prueba', email: null });
  const channel2 = await crm.customerChannels.createCustomerChannel({ customerId: customer2.customerId, tipoCanal: 'whatsapp', identificadorExterno: '5215500000001' });
  const conversation2 = await crm.conversations.createConversation({ customerId: customer2.customerId, customerChannelId: channel2.customerChannelId, waIdConversacion: '5215500000001', estadoActual: 'MensajeInicialEnviado', ultimaInteraccion: new Date().toISOString(), source: 'REAL' });
  realConversationId = conversation2.conversationId;

  await new Promise((resolve, reject) => {
    if (server.listening) { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); return; }
    server.once('listening', () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); });
    server.once('error', reject);
  });
});
after(async () => {
  await new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); });
  await closeTestPool();
});

async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe('GET /api/whatsapp/status', () => {
  test('sendEnabled real -- refleja envioHabilitado() (sin WHATSAPP_ACCESS_TOKEN en este entorno, debe ser false)', async () => {
    const { status, body } = await get('/api/whatsapp/status');
    assert.equal(status, 200);
    assert.equal(typeof body.sendEnabled, 'boolean');
  });
});

describe('GET /api/whatsapp/conversations', () => {
  test('source=ALL incluye ambas conversaciones fixture (TEST y REAL), con contacto/estado/último mensaje/source reales', async () => {
    const { status, body } = await get('/api/whatsapp/conversations?days=1&source=ALL');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.conversations));
    const found = body.conversations.find((c) => c.conversationId === fixtureConversationId);
    assert.ok(found, 'la conversación fixture TEST debe aparecer en la lista sin filtrar');
    assert.equal(found.waId, '5215500000000');
    assert.equal(found.estadoActual, 'PrecioEnviado');
    assert.equal(found.source, 'TEST');
    assert.equal(found.lastMessage.direccion, 'saliente');
    assert.equal(found.lastMessage.texto, 'Cuesta $X, ¿te interesa?');
  });

  test('filtro por defecto (sin "source") es REAL -- excluye la fixture TEST, incluye la fixture REAL', async () => {
    const { status, body } = await get('/api/whatsapp/conversations?days=1');
    assert.equal(status, 200);
    assert.equal(body.appliedFilter, 'REAL');
    assert.ok(!body.conversations.some((c) => c.conversationId === fixtureConversationId), 'una conversación TEST nunca debe aparecer bajo el filtro REAL');
    assert.ok(body.conversations.some((c) => c.conversationId === realConversationId), 'la conversación REAL sí debe aparecer');
  });

  test('bySource refleja el desglose real completo del rango, incluso cuando el filtro aplicado reduce la lista (nunca oculta que existen otras)', async () => {
    const { body } = await get('/api/whatsapp/conversations?days=1&source=REAL');
    assert.ok(body.bySource.TEST >= 1);
    assert.ok(body.bySource.REAL >= 1);
    assert.equal(body.totalInRange, Object.values(body.bySource).reduce((a, b) => a + b, 0));
  });

  test('source inválido -- 400 real', async () => {
    const { status } = await get('/api/whatsapp/conversations?source=PRODUCTION');
    assert.equal(status, 400);
  });
});

describe('GET /api/whatsapp/conversations/:id', () => {
  test('devuelve historial real completo, en orden, con direccion real (nunca AI/HUMAN inventado)', async () => {
    const { status, body } = await get(`/api/whatsapp/conversations/${fixtureConversationId}`);
    assert.equal(status, 200);
    assert.equal(body.conversation.conversationId, fixtureConversationId);
    assert.equal(body.conversation.source, 'TEST');
    assert.equal(body.messages.length, 2);
    assert.equal(body.messages[0].direccion, 'entrante');
    assert.equal(body.messages[1].direccion, 'saliente');
    assert.ok(!('origin' in body.messages[0]) && !('sender' in body.messages[0]), 'nunca se inventa un campo de origen AI/HUMAN que no existe en el schema real');
    assert.equal(body.opportunity, null, 'sin Opportunity real vinculada -- nunca se inventa una');
  });

  test('id inexistente -- 404 real', async () => {
    const { status, body } = await get('/api/whatsapp/conversations/00000000-0000-0000-0000-000000000000');
    assert.equal(status, 404);
    assert.match(body.error, /no existe/i);
  });
});

describe('POST /api/whatsapp/conversations/:id/send', () => {
  test('sin texto -- 400 real, nunca envía', async () => {
    const { status } = await post(`/api/whatsapp/conversations/${fixtureConversationId}/send`, { text: '  ' });
    assert.equal(status, 400);
  });

  test('conversación inexistente -- 404 real', async () => {
    const { status } = await post('/api/whatsapp/conversations/00000000-0000-0000-0000-000000000000/send', { text: 'hola' });
    assert.equal(status, 404);
  });

  test('sin WHATSAPP_ACCESS_TOKEN configurado -- CONFIGURATION_REQUIRED real, nunca intenta enviar ni guarda un mensaje falso', async () => {
    const before = await get(`/api/whatsapp/conversations/${fixtureConversationId}`);
    const { status, body } = await post(`/api/whatsapp/conversations/${fixtureConversationId}/send`, { text: 'Respuesta manual de prueba real' });
    assert.equal(status, 200);
    assert.equal(body.status, 'CONFIGURATION_REQUIRED');
    const after = await get(`/api/whatsapp/conversations/${fixtureConversationId}`);
    assert.equal(after.body.messages.length, before.body.messages.length, 'CONFIGURATION_REQUIRED nunca persiste un mensaje saliente falso');
  });
});
