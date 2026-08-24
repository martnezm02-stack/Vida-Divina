// migrate.test.js
// Prueba real del runner de migraciones contra TEST_DATABASE_URL. Verifica
// el criterio de aceptación #4 de la Fase B: ejecutar migraciones dos
// veces no rompe el schema.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getTestPool, closeTestPool } from './helpers/db.js';
import { runMigrations, getStatus } from '../db/migrate.js';

let pool;

before(async () => {
  // getTestPool() ya corre runMigrations() una vez al crear el pool — este
  // archivo prueba explícitamente que volver a correrlas es seguro.
  pool = await getTestPool();
});

after(async () => {
  await closeTestPool();
});

test('todas las migraciones de crm/migrations/ quedan aplicadas', async () => {
  const estado = await getStatus(pool);
  assert.ok(estado.length >= 1, 'debe existir al menos la migración inicial');
  for (const m of estado) {
    assert.equal(m.applied, true, `la migración "${m.version}" debería estar aplicada`);
  }
});

test('ejecutar runMigrations() de nuevo sobre una base ya migrada no aplica nada ni falla', async () => {
  const aplicadas = await runMigrations(pool);
  assert.deepEqual(aplicadas, [], 'no debería haber migraciones pendientes en la segunda corrida');
});

test('las 10 tablas aprobadas existen y orders/payments NO existen', async () => {
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  );
  const nombres = new Set(rows.map((r) => r.table_name));

  for (const tabla of [
    'customers', 'customer_channels', 'conversations', 'messages', 'state_transitions',
    'opportunities', 'offers_log', 'follow_ups', 'handoffs', 'product_pricing', 'schema_migrations',
  ]) {
    assert.ok(nombres.has(tabla), `falta la tabla aprobada "${tabla}"`);
  }

  assert.ok(!nombres.has('orders'), 'orders NO debe existir todavía (bloqueada por decisión de negocio)');
  assert.ok(!nombres.has('payments'), 'payments NO debe existir todavía (bloqueada por decisión de negocio)');
});
