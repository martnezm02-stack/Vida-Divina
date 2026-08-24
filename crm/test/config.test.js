// config.test.js
// Prueba crm/config/env.js de forma aislada — no requiere PostgreSQL, solo
// manipula process.env dentro del propio test y lo restaura al final.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getConfig, getTestConfig } from '../config/env.js';

const CLAVES = [
  'DATABASE_URL',
  'TEST_DATABASE_URL',
  'CRM_DB_POOL_MAX',
  'CRM_DB_SSL',
  'CRM_DB_IDLE_TIMEOUT_MS',
  'CRM_DB_CONNECTION_TIMEOUT_MS',
];

let respaldo;

beforeEach(() => {
  respaldo = Object.fromEntries(CLAVES.map((k) => [k, process.env[k]]));
  for (const k of CLAVES) delete process.env[k];
});

afterEach(() => {
  for (const k of CLAVES) {
    if (respaldo[k] === undefined) delete process.env[k];
    else process.env[k] = respaldo[k];
  }
});

describe('getConfig', () => {
  test('lanza un error claro si falta DATABASE_URL', () => {
    assert.throws(() => getConfig(), /DATABASE_URL/);
  });

  test('nunca inventa una cadena de conexión por defecto', () => {
    process.env.DATABASE_URL = '';
    assert.throws(() => getConfig(), /DATABASE_URL/);
  });

  test('devuelve databaseUrl y valores por defecto razonables cuando solo se define DATABASE_URL', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
    const config = getConfig();
    assert.equal(config.databaseUrl, 'postgres://user:pass@localhost:5432/db');
    assert.equal(config.poolMax, 10);
    assert.equal(config.ssl, false);
    assert.equal(config.idleTimeoutMillis, 30000);
    assert.equal(config.connectionTimeoutMillis, 5000);
  });

  test('respeta los valores explícitos de las variables opcionales', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
    process.env.CRM_DB_POOL_MAX = '25';
    process.env.CRM_DB_SSL = 'true';
    process.env.CRM_DB_IDLE_TIMEOUT_MS = '1000';
    process.env.CRM_DB_CONNECTION_TIMEOUT_MS = '2000';
    const config = getConfig();
    assert.equal(config.poolMax, 25);
    assert.equal(config.ssl, true);
    assert.equal(config.idleTimeoutMillis, 1000);
    assert.equal(config.connectionTimeoutMillis, 2000);
  });
});

describe('getTestConfig', () => {
  test('lanza un error claro si falta TEST_DATABASE_URL', () => {
    assert.throws(() => getTestConfig(), /TEST_DATABASE_URL/);
  });

  test('nunca cae de vuelta a DATABASE_URL si TEST_DATABASE_URL falta', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/produccion';
    assert.throws(() => getTestConfig(), /TEST_DATABASE_URL/);
  });

  test('devuelve testDatabaseUrl cuando TEST_DATABASE_URL está definida', () => {
    process.env.TEST_DATABASE_URL = 'postgres://user:pass@localhost:5432/test';
    const config = getTestConfig();
    assert.equal(config.databaseUrl, 'postgres://user:pass@localhost:5432/test');
  });
});
