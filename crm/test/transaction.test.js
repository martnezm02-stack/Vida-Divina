// transaction.test.js
// Prueba real de crm/index.js (la API pública) y de la infraestructura de
// transacciones — sin mocks. Verifica exactamente la operación que la
// Fase B §24 pide dejar lista (no implementada como flujo de negocio,
// solo como infraestructura): crear customer + canal + conversación de
// forma atómica, con rollback real si algo falla a mitad de camino.
//
// index.js valida DATABASE_URL en cuanto se usa un método ligado al pool
// real — por eso este archivo, antes de importarlo, apunta DATABASE_URL a
// la misma base de TEST_DATABASE_URL. Es el único archivo de test que
// hace esto; el resto de crm/test/ usa TEST_DATABASE_URL directamente vía
// crm/test/helpers/db.js sin tocar DATABASE_URL.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getTestConfig } from '../config/env.js';
import { getTestPool, resetDatabase, closeTestPool } from './helpers/db.js';

let pool;
let crm;

before(async () => {
  pool = await getTestPool(); // aplica migraciones y valida conectividad primero
  process.env.DATABASE_URL = getTestConfig().databaseUrl;
  crm = await import('../index.js');
});

beforeEach(async () => {
  await resetDatabase(pool);
});

after(async () => {
  // `crm` puede seguir undefined si before() falló antes de asignarlo (ej.
  // TEST_DATABASE_URL no está definida) — no se enmascara ese fallo
  // original con un TypeError secundario aquí.
  if (crm) await crm.closePool();
  await closeTestPool();
  delete process.env.DATABASE_URL;
});

test('crm/index.js no expone el pool crudo ni ninguna función de query genérica', () => {
  const superficiePublica = Object.keys(crm);
  for (const nombreProhibido of ['getPool', 'pool', 'query', 'client']) {
    assert.ok(!superficiePublica.includes(nombreProhibido), `no debería exportarse "${nombreProhibido}"`);
  }
});

test('testConnection() funciona a través de la API pública', async () => {
  const ok = await crm.testConnection();
  assert.equal(ok, true);
});

test('withTransaction: crear customer + canal + conversación es atómico (COMMIT)', async () => {
  const resultado = await crm.withTransaction(async (scoped) => {
    const customer = await scoped.customers.createCustomer({ nombre: 'Prueba Atómica' });
    const canal = await scoped.customerChannels.createCustomerChannel({
      customerId: customer.customerId,
      tipoCanal: 'whatsapp',
      identificadorExterno: '5215500000123',
    });
    const conversacion = await scoped.conversations.createConversation({
      customerId: customer.customerId,
      customerChannelId: canal.customerChannelId,
      waIdConversacion: '5215500000123',
      estadoActual: 'MensajeInicialEnviado',
    });
    return { customer, canal, conversacion };
  });

  const encontrado = await crm.customers.findCustomerById(resultado.customer.customerId);
  assert.ok(encontrado, 'el customer debe existir después del COMMIT');

  const canales = await crm.customerChannels.listByCustomerId(resultado.customer.customerId);
  assert.equal(canales.length, 1);
});

test('withTransaction: si un paso falla, TODO se revierte (ROLLBACK) — nada queda persistido', async () => {
  await assert.rejects(() =>
    crm.withTransaction(async (scoped) => {
      const customer = await scoped.customers.createCustomer({ nombre: 'Debe Desaparecer' });
      await scoped.customerChannels.createCustomerChannel({
        customerId: customer.customerId,
        tipoCanal: 'whatsapp',
        identificadorExterno: '5215500000124',
      });
      // Falla deliberadamente: customer_id inexistente en el segundo canal.
      await scoped.customerChannels.createCustomerChannel({
        customerId: '00000000-0000-0000-0000-000000000000',
        tipoCanal: 'whatsapp',
        identificadorExterno: '5215500000125',
      });
    })
  );

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM customers');
  assert.equal(rows[0].n, 0, 'el ROLLBACK debe haber revertido incluso el customer creado antes del fallo');

  const canales = await pool.query('SELECT COUNT(*)::int AS n FROM customer_channels');
  assert.equal(canales.rows[0].n, 0);
});
