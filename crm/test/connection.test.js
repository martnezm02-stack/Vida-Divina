// connection.test.js
// Prueba real de conexión contra TEST_DATABASE_URL — sin mocks. Requiere
// una instancia de PostgreSQL accesible (ver docs/CRM_FASE_B_POSTGRESQL.md).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getTestPool, closeTestPool } from './helpers/db.js';

let pool;

before(async () => {
  pool = await getTestPool();
});

after(async () => {
  await closeTestPool();
});

test('el pool de test puede conectarse y ejecutar una query real', async () => {
  const { rows } = await pool.query('SELECT 1 AS uno');
  assert.equal(rows[0].uno, 1);
});

test('el pool de test apunta a una base con las tablas del CRM ya migradas', async () => {
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [['customers', 'customer_channels', 'conversations', 'messages', 'state_transitions',
      'opportunities', 'offers_log', 'follow_ups', 'handoffs', 'product_pricing']]
  );
  assert.equal(rows.length, 10, `esperaba 10 tablas del CRM, encontró ${rows.length}`);
});
