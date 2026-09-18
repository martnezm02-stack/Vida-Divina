// config.test.js
// Prueba crm/config/env.js de forma aislada — no requiere PostgreSQL, solo
// manipula process.env dentro del propio test y lo restaura al final.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getConfig, getTestConfig, construirSslConfig } from '../config/env.js';

const CLAVES = [
  'DATABASE_URL',
  'TEST_DATABASE_URL',
  'CRM_DB_POOL_MAX',
  'CRM_DB_SSL',
  'CRM_DB_SSL_CA_PATH',
  'CRM_DB_SSL_REJECT_UNAUTHORIZED',
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

  test('sslRejectUnauthorized es true por defecto en cuanto CRM_DB_SSL=true (nunca false por defecto)', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
    process.env.CRM_DB_SSL = 'true';
    assert.equal(getConfig().sslRejectUnauthorized, true);
  });

  test('CRM_DB_SSL_REJECT_UNAUTHORIZED=false es un escape hatch explícito, no el default', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
    process.env.CRM_DB_SSL = 'true';
    process.env.CRM_DB_SSL_REJECT_UNAUTHORIZED = 'false';
    assert.equal(getConfig().sslRejectUnauthorized, false);
  });
});

describe('construirSslConfig', () => {
  test('local/test sin SSL (ssl: false) devuelve undefined -- sin cambios de comportamiento', () => {
    assert.equal(
      construirSslConfig({ ssl: false, sslCaPath: null, sslRejectUnauthorized: true }),
      undefined
    );
  });

  test('producción puede exigir SSL con validación de certificado activada', () => {
    const resultado = construirSslConfig({ ssl: true, sslCaPath: null, sslRejectUnauthorized: true });
    assert.deepEqual(resultado, { rejectUnauthorized: true });
  });

  test('rejectUnauthorized no queda permanentemente false para producción -- solo si se pide explícitamente', () => {
    const conValidacion = construirSslConfig({ ssl: true, sslCaPath: null, sslRejectUnauthorized: true });
    assert.equal(conValidacion.rejectUnauthorized, true);

    const sinValidacion = construirSslConfig({ ssl: true, sslCaPath: null, sslRejectUnauthorized: false });
    assert.equal(sinValidacion.rejectUnauthorized, false, 'el escape hatch sigue disponible, pero no es lo que devuelve el default de arriba');
  });

  test('si se provee sslCaPath, lee esa CA desde archivo -- nunca un certificado hardcodeado en el código', () => {
    const rutaCa = join(tmpdir(), `crm-test-ca-${process.pid}-${Date.now()}.pem`);
    const contenidoFalso = '-----BEGIN CERTIFICATE-----\nCONTENIDO-DE-PRUEBA\n-----END CERTIFICATE-----\n';
    writeFileSync(rutaCa, contenidoFalso, 'utf8');
    try {
      const resultado = construirSslConfig({ ssl: true, sslCaPath: rutaCa, sslRejectUnauthorized: true });
      assert.equal(resultado.ca, contenidoFalso);
    } finally {
      unlinkSync(rutaCa);
    }
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

  // Guard crítico (auditoría de persistencia, 2026-09-18): TEST_DATABASE_URL
  // nunca puede resolver a la misma base física que DATABASE_URL, porque
  // resetDatabase() (crm/test/helpers/db.js) hace DELETE FROM de 16 tablas
  // en cada caso de prueba.
  describe('guard: TEST_DATABASE_URL nunca puede ser la misma base que DATABASE_URL', () => {
    test('1) DATABASE_URL y TEST_DATABASE_URL apuntan a bases distintas -> PASS', () => {
      process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/vida_divina_crm';
      process.env.TEST_DATABASE_URL = 'postgres://user:pass@localhost:5432/vida_divina_crm_test';
      assert.doesNotThrow(() => getTestConfig());
    });

    test('2) misma base exacta -> FAIL seguro', () => {
      process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/vida_divina_crm';
      process.env.TEST_DATABASE_URL = 'postgres://otro_usuario:otro_pass@localhost:5432/vida_divina_crm';
      assert.throws(() => getTestConfig(), /misma base/i);
    });

    test('3) URLs equivalentes con parámetros no esenciales distintos (usuario/password/query) -> FAIL', () => {
      process.env.DATABASE_URL = 'postgres://prod_user:prod_secreto_xyz@localhost:5432/vida_divina_crm?sslmode=require';
      process.env.TEST_DATABASE_URL = 'postgres://test_user:otro_secreto_abc@LOCALHOST:5432/vida_divina_crm';
      assert.throws(() => getTestConfig(), /misma base/i);
    });

    test('4) el mensaje de error nunca contiene las credenciales de ninguna de las dos URLs', () => {
      process.env.DATABASE_URL = 'postgres://prod_user:prod_secreto_xyz@localhost:5432/vida_divina_crm';
      process.env.TEST_DATABASE_URL = 'postgres://test_user:otro_secreto_abc@localhost:5432/vida_divina_crm';
      try {
        getTestConfig();
        assert.fail('debía lanzar');
      } catch (error) {
        assert.doesNotMatch(error.message, /prod_user|prod_secreto_xyz|test_user|otro_secreto_abc/);
      }
    });

    test('5) la configuración real de desarrollo (DATABASE_URL != TEST_DATABASE_URL, mismo host) sigue funcionando', () => {
      // Misma forma que crm/.env.example: mismo host/puerto, distinta base.
      process.env.DATABASE_URL = 'postgres://usuario:password@localhost:5432/vida_divina_crm';
      process.env.TEST_DATABASE_URL = 'postgres://usuario:password@localhost:5432/vida_divina_crm_test';
      const config = getTestConfig();
      assert.equal(config.databaseUrl, 'postgres://usuario:password@localhost:5432/vida_divina_crm_test');
    });

    test('si DATABASE_URL no está definida, el guard no tiene nada que comparar y no bloquea', () => {
      process.env.TEST_DATABASE_URL = 'postgres://user:pass@localhost:5432/vida_divina_crm_test';
      assert.doesNotThrow(() => getTestConfig());
    });
  });
});
