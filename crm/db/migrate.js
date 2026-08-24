#!/usr/bin/env node
// migrate.js
// Runner de migraciones versionadas. Ningún módulo de negocio ejecuta SQL
// de creación de schema directamente (regla explícita de la Fase B) — este
// es el único mecanismo autorizado para evolucionar el schema de crm/.
//
// Mecanismo: una tabla schema_migrations (version TEXT PK, applied_at)
// registra qué archivos de crm/migrations/*.sql ya se aplicaron. Cada
// archivo pendiente se aplica en orden alfabético (por eso el prefijo
// numérico de 4 dígitos en el nombre), dentro de su propia transacción —
// si un archivo falla a la mitad, esa migración puntual se revierte
// completa y ninguna posterior se intenta. Ejecutar "up" dos veces es
// seguro: los archivos ya registrados en schema_migrations se saltan.
//
// getStatus()/runMigrations() son funciones de librería, reutilizables
// desde tests contra cualquier pool (ej. uno apuntando a
// TEST_DATABASE_URL) — la parte de abajo (main) es solo el envoltorio CLI,
// que usa el pool real de crm/db/pool.js (DATABASE_URL).
//
// Advisory lock (hallazgo real de la validación contra PostgreSQL real,
// Fase B): `node --test` ejecuta cada archivo de test en un SUBPROCESO
// separado. Cuando varios subprocesos llaman getStatus()/runMigrations()
// al mismo tiempo contra la misma base todavía sin migrar, "CREATE TABLE
// IF NOT EXISTS schema_migrations" no es atómico entre sesiones
// concurrentes — dos sesiones pueden ver "no existe" a la vez e intentar
// crearla a la vez, y PostgreSQL responde con una violación de unicidad en
// su catálogo interno (pg_type_typname_nsp_index), no con un error
// legible de "la tabla ya existe". Se serializa con
// pg_advisory_lock/pg_advisory_unlock (mismo mecanismo que usan
// herramientas de migración como golang-migrate/Flyway) — un entero fijo
// y arbitrario que identifica "el runner de migraciones de crm/" a nivel
// de servidor, nunca a nivel de esta conexión en particular.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

// Constante arbitraria — solo debe ser estable en el tiempo y no chocar
// con otro uso de pg_advisory_lock en la misma base. bigint cabe en un
// int8 de Postgres sin problema.
const MIGRATION_LOCK_ID = 727100550;

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

/**
 * Ejecuta `work(client)` mientras sostiene el advisory lock del runner de
 * migraciones — cualquier otra sesión (mismo proceso u otro) que intente
 * lo mismo al mismo tiempo se bloquea en pg_advisory_lock hasta que esta
 * termine, en vez de correr en paralelo y chocar contra el catálogo.
 */
async function conLockDeMigraciones(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    try {
      return await work(client);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {
        // Si la conexión ya se perdió, no hay lock que liberar explícitamente
        // — PostgreSQL libera todos los advisory locks de una sesión cuando
        // esa sesión termina, con o sin este unlock explícito.
      });
    }
  } finally {
    client.release();
  }
}

function listMigrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((archivo) => archivo.endsWith('.sql'))
    .sort();
}

function versionDeArchivo(archivo) {
  return archivo.replace(/\.sql$/, '');
}

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<Array<{version: string, applied: boolean, appliedAt: string|null}>>}
 */
export async function getStatus(pool) {
  return conLockDeMigraciones(pool, async (client) => {
    await ensureMigrationsTable(client);
    const { rows } = await client.query('SELECT version, applied_at FROM schema_migrations');
    const aplicadas = new Map(rows.map((r) => [r.version, r.applied_at]));
    return listMigrationFiles().map((archivo) => {
      const version = versionDeArchivo(archivo);
      return { version, applied: aplicadas.has(version), appliedAt: aplicadas.get(version) ?? null };
    });
  });
}

/**
 * Aplica todas las migraciones pendientes, en orden, cada una en su propia
 * transacción. Devuelve la lista de versiones recién aplicadas (vacía si
 * no había ninguna pendiente — correr esto dos veces seguidas es seguro).
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<string[]>}
 */
export async function runMigrations(pool) {
  return conLockDeMigraciones(pool, async (client) => {
    await ensureMigrationsTable(client);
    const { rows } = await client.query('SELECT version FROM schema_migrations');
    const yaAplicadas = new Set(rows.map((r) => r.version));

    const pendientes = listMigrationFiles().filter((archivo) => !yaAplicadas.has(versionDeArchivo(archivo)));
    const aplicadasAhora = [];

    // Todas las migraciones de esta corrida se aplican con el mismo client
    // que sostiene el advisory lock (§ arriba) — una transacción por
    // archivo, secuenciales, nunca concurrentes entre sí dentro de esta
    // misma llamada (eso ya lo garantiza ser un solo bucle síncrono).
    for (const archivo of pendientes) {
      const version = versionDeArchivo(archivo);
      const sql = readFileSync(path.join(MIGRATIONS_DIR, archivo), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
        aplicadasAhora.push(version);
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // conexión ya perdida — se prioriza el error original de abajo
        }
        throw new Error(`crm/migrate: fallo aplicando "${archivo}" — ${error.message}`);
      }
    }

    return aplicadasAhora;
  });
}

// ---------------------------------------------------------------------
// CLI — solo se ejecuta si este archivo se invoca directamente
// (node crm/db/migrate.js up|status), no cuando se importa desde tests.
// ---------------------------------------------------------------------
async function main() {
  const comando = process.argv[2] ?? 'up';
  const { getPool, closePool } = await import('./pool.js');
  const pool = getPool();
  try {
    if (comando === 'status') {
      const estado = await getStatus(pool);
      if (estado.length === 0) {
        console.log('No hay archivos de migración en crm/migrations/.');
      }
      for (const m of estado) {
        console.log(`[${m.applied ? 'x' : ' '}] ${m.version}${m.applied ? ` (aplicada ${m.appliedAt})` : ''}`);
      }
    } else if (comando === 'up') {
      const aplicadas = await runMigrations(pool);
      console.log(aplicadas.length > 0 ? `Migraciones aplicadas: ${aplicadas.join(', ')}` : 'Sin migraciones pendientes.');
    } else {
      console.error(`crm/migrate: comando desconocido "${comando}". Usa "up" o "status".`);
      process.exitCode = 1;
    }
  } finally {
    await closePool();
  }
}

if (process.argv[1] && process.argv[1].endsWith('migrate.js')) {
  main().catch((error) => {
    console.error('[crm/migrate]', error.message);
    process.exitCode = 1;
  });
}
