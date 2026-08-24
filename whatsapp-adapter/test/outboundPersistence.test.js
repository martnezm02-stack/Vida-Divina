// outboundPersistence.test.js — Fase 16, Parte 7/8/22. Integración real
// contra PostgreSQL (TEST_DATABASE_URL, nunca DATABASE_URL — mismo
// criterio que e2ePostgres.test.js). Sin llamar a Meta: se construyen
// arreglos `envios` sintéticos (la misma forma real que
// graphApiSender.js#enviarRecursos ya devuelve), nunca se envía nada real.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

import { persistOutboundReal } from '../src/outboundPersistence.js';
import * as crm from '../../crm/index.js';
import { getTestPool, resetDatabase, closeTestPool } from '../../crm/test/helpers/db.js';

let pool;
before(async () => {
  pool = await getTestPool();
  await resetDatabase(pool);
});
after(async () => {
  await crm.closePool();
  await closeTestPool();
});

async function crearConversacionReal(waId) {
  const customer = await crm.customers.createCustomer({ nombre: null, email: null });
  const channel = await crm.customerChannels.createCustomerChannel({ customerId: customer.customerId, tipoCanal: 'whatsapp', identificadorExterno: waId });
  const conversation = await crm.conversations.createConversation({ customerId: customer.customerId, customerChannelId: channel.customerChannelId, waIdConversacion: waId, source: 'TEST' });
  return conversation;
}

describe('persistOutboundReal', () => {
  test('persiste como saliente solo los recursos confirmados como enviados (enviado:true)', async () => {
    const waId = '5215500002001';
    const conversation = await crearConversacionReal(waId);
    const envios = [
      { tipo: 'texto', enviado: true, status: 200, texto: 'Hola, gracias por escribirnos', messageId: 'wamid.REAL1' },
      { tipo: 'audio', enviado: false, motivo: 'sin_contenido_de_texto' },
    ];
    const persistidos = await persistOutboundReal(waId, envios);
    assert.equal(persistidos.length, 1);
    assert.equal(persistidos[0].direccion, 'saliente');
    assert.equal(persistidos[0].texto, 'Hola, gracias por escribirnos');
    assert.equal(persistidos[0].canalMessageId, 'wamid.REAL1');

    const mensajesReales = await crm.messages.listByConversationId(conversation.conversationId);
    assert.equal(mensajesReales.length, 1);
    assert.equal(mensajesReales[0].direccion, 'saliente');
  });

  test('nunca persiste un envío fallido (enviado:false) como mensaje saliente', async () => {
    const waId = '5215500002002';
    await crearConversacionReal(waId);
    const envios = [{ tipo: 'texto', enviado: false, status: 500, motivo: 'error_red' }];
    const persistidos = await persistOutboundReal(waId, envios);
    assert.equal(persistidos.length, 0);
  });

  test('idempotente: el mismo messageId real no se guarda dos veces (ej. reintento del webhook)', async () => {
    const waId = '5215500002003';
    const conversation = await crearConversacionReal(waId);
    const envios = [{ tipo: 'texto', enviado: true, status: 200, texto: 'Mensaje real', messageId: 'wamid.DUPLICADO' }];
    const primero = await persistOutboundReal(waId, envios);
    const segundo = await persistOutboundReal(waId, envios);
    assert.equal(primero.length, 1);
    assert.equal(segundo.length, 0, 'el segundo intento con el mismo wamid real no debe insertar de nuevo');
    const todos = await crm.messages.listByConversationId(conversation.conversationId);
    assert.equal(todos.length, 1);
  });

  test('sin conversation real para ese wa_id -- no crea una nueva, no lanza', async () => {
    const envios = [{ tipo: 'texto', enviado: true, status: 200, texto: 'Nadie a quien atribuir esto', messageId: 'wamid.SINCONV' }];
    const persistidos = await persistOutboundReal('5215500002099-sin-conversacion', envios);
    assert.deepEqual(persistidos, []);
  });

  test('sin envios reales confirmados -- no toca la base', async () => {
    const waId = '5215500002004';
    await crearConversacionReal(waId);
    assert.deepEqual(await persistOutboundReal(waId, []), []);
    assert.deepEqual(await persistOutboundReal(waId, null), []);
  });
});
