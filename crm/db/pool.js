// pool.js
// Único lugar del proyecto que crea un pg.Pool para el runtime normal de
// crm/ (ver docs/CRM_FASE_B_POSTGRESQL.md — regla de acceso exclusivo).
// Instancia única (singleton) reutilizada entre llamadas — nunca se abre
// una conexión nueva por query. No se exporta el pool en sí desde
// crm/index.js (ver ese archivo): este módulo es interno a crm/.

import pg from 'pg';
import { getConfig } from '../config/env.js';

let pool = null;

/**
 * Devuelve la instancia única del pool, creándola en el primer uso. Lanza
 * si falta configuración (getConfig ya valida DATABASE_URL) — nunca crea
 * un pool con una cadena de conexión inventada o vacía.
 */
export function getPool() {
  if (pool) return pool;

  const config = getConfig();
  pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: config.poolMax,
    idleTimeoutMillis: config.idleTimeoutMillis,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
  });

  // Sin este listener, un error en una conexión inactiva del pool (ej. el
  // servidor de PostgreSQL cierra la conexión) tira process.on('uncaughtException')
  // y puede derribar el proceso completo — comportamiento documentado de
  // node-postgres. Se registra el mensaje del error, nunca la cadena de
  // conexión ni ningún dato de la query en curso.
  pool.on('error', (error) => {
    console.error('[crm/db/pool] error inesperado en una conexión inactiva del pool:', error.message);
  });

  return pool;
}

/**
 * Verifica que el pool puede efectivamente conectarse y ejecutar una query
 * mínima. Pensado para health-checks (ej. antes de levantar un consumidor
 * de crm/) — no reemplaza el manejo de errores de cada repository.
 * @returns {Promise<boolean>}
 */
export async function testConnection() {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('SELECT 1');
    return true;
  } finally {
    client.release();
  }
}

/**
 * Cierra el pool y todas sus conexiones. Necesario para que un proceso de
 * test o un script de corta duración pueda terminar limpiamente (sin esto,
 * Node no sale porque el pool mantiene sockets abiertos). Idempotente.
 */
export async function closePool() {
  if (!pool) return;
  const actual = pool;
  pool = null;
  await actual.end();
}
