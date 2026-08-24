// db.js (test helper)
// Infraestructura compartida para los tests de integración de crm/. Usa
// SIEMPRE TEST_DATABASE_URL (nunca DATABASE_URL) — ver crm/config/env.js
// getTestConfig(). No es un mock: abre un pg.Pool real contra una base de
// PostgreSQL real y corre las migraciones reales de crm/migrations/.
//
// Si TEST_DATABASE_URL no está definida, o si PostgreSQL no está
// accesible en esa dirección, getTestPool() lanza un error explícito y
// accionable — los tests que dependan de esto deben dejar que ese error
// se propague (node:test lo reporta como fallo con el mensaje completo),
// nunca deben silenciarlo ni fingir éxito.
//
// IMPORTANTE — por qué "npm test" corre con --test-concurrency=1 (hallazgo
// real de la validación contra PostgreSQL, Fase B): "node --test" ejecuta
// cada archivo de test en un subproceso separado. Todos comparten la MISMA
// base física de TEST_DATABASE_URL, y resetDatabase() de abajo hace DELETE
// sobre las 10 tablas completas — si dos archivos corrieran en paralelo,
// el beforeEach de uno podría borrar datos que otro acababa de crear a
// mitad de su propio test (visto en la práctica: una condición de carrera
// intermitente en "crea una conversación ligada a customer + channel").
// Forzar concurrencia 1 en crm/package.json es la forma estándar y mínima
// de resolver esto para tests de integración contra una única base
// compartida — la alternativa (una base o schema por archivo) es
// desproporcionada para el volumen de pruebas actual.

import pg from 'pg';
import { getTestConfig } from '../../config/env.js';
import { runMigrations } from '../../db/migrate.js';

let pool = null;

/**
 * Pool real contra TEST_DATABASE_URL, con las migraciones ya aplicadas.
 * Reutiliza la misma instancia entre archivos de test que la soliciten
 * dentro del mismo proceso de `node --test`.
 *
 * @returns {Promise<import('pg').Pool>}
 */
export async function getTestPool() {
  if (pool) return pool;
  const config = getTestConfig();
  const candidato = new pg.Pool({
    connectionString: config.databaseUrl,
    max: config.poolMax,
    idleTimeoutMillis: config.idleTimeoutMillis,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
  });
  candidato.on('error', (error) => {
    console.error('[crm/test] error inesperado en una conexión inactiva del pool de test:', error.message);
  });

  // Falla rápido y con un mensaje claro si Postgres no está accesible, en
  // vez de dejar que cada test individual reporte un timeout de conexión
  // distinto y menos legible.
  try {
    const client = await candidato.connect();
    client.release();
  } catch (error) {
    await candidato.end().catch(() => {});
    throw new Error(
      `crm/test: no se pudo conectar a TEST_DATABASE_URL (${error.code ?? error.message}). ` +
        'Verifica que PostgreSQL esté corriendo y accesible en la dirección configurada en crm/.env. ' +
        'Ver docs/CRM_FASE_B_POSTGRESQL.md, sección "Ejecutar los tests".'
    );
  }

  await runMigrations(candidato);
  pool = candidato;
  return pool;
}

/**
 * Borra todos los datos de las tablas del CRM, en orden que respeta las
 * foreign keys (hijos antes que padres; conversations.handoff_pendiente_id
 * se limpia antes de vaciar handoffs para romper la referencia circular).
 * No usa TRUNCATE...CASCADE — el orden explícito documenta exactamente qué
 * depende de qué, igual que las FK del schema.
 *
 * @param {import('pg').Pool} testPool
 */
export async function resetDatabase(testPool) {
  await testPool.query('DELETE FROM offers_log');
  await testPool.query('DELETE FROM follow_ups');
  await testPool.query('DELETE FROM messages');
  await testPool.query('DELETE FROM state_transitions');
  await testPool.query('UPDATE conversations SET handoff_pendiente_id = NULL');
  await testPool.query('DELETE FROM handoffs');
  await testPool.query('DELETE FROM opportunities');
  await testPool.query('DELETE FROM conversations');
  await testPool.query('DELETE FROM customer_channels');
  await testPool.query('DELETE FROM customers');
  await testPool.query('DELETE FROM product_pricing');
}

/**
 * Cierra el pool de test — debe llamarse en un after() de nivel superior
 * para que `node --test` pueda terminar el proceso limpiamente.
 */
export async function closeTestPool() {
  if (!pool) return;
  const actual = pool;
  pool = null;
  await actual.end();
}
