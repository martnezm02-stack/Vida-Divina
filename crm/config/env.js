// env.js
// Única fuente de configuración de crm/ — lee exclusivamente de
// process.env. Nunca hardcodea ni loguea credenciales (ver
// docs/CRM_FASE_B_POSTGRESQL.md, sección de seguridad). Ver
// crm/.env.example para la plantilla de variables reconocidas.

function numeroODefecto(valor, porDefecto) {
  if (valor === undefined || valor === null || valor === '') return porDefecto;
  const n = Number(valor);
  return Number.isFinite(n) ? n : porDefecto;
}

function leerComun() {
  return {
    poolMax: numeroODefecto(process.env.CRM_DB_POOL_MAX, 10),
    ssl: process.env.CRM_DB_SSL === 'true',
    idleTimeoutMillis: numeroODefecto(process.env.CRM_DB_IDLE_TIMEOUT_MS, 30000),
    connectionTimeoutMillis: numeroODefecto(process.env.CRM_DB_CONNECTION_TIMEOUT_MS, 5000),
  };
}

/**
 * Configuración para el runtime normal de crm/ (repositories vía
 * crm/index.js, migraciones ejecutadas contra la base de desarrollo).
 * Lanza si falta DATABASE_URL — nunca asume un valor por defecto para una
 * cadena de conexión (sería apuntar silenciosamente a algo no autorizado).
 */
export function getConfig() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'crm/config: falta DATABASE_URL en el entorno. Define DATABASE_URL en crm/.env ' +
        '(copia crm/.env.example) o expórtala en el shell antes de usar el módulo crm/.'
    );
  }
  return { databaseUrl, ...leerComun() };
}

/**
 * Configuración exclusiva para crm/test/ — lee TEST_DATABASE_URL, nunca
 * DATABASE_URL, para que un test nunca pueda ejecutarse por accidente
 * contra la base de desarrollo/producción.
 */
export function getTestConfig() {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'crm/config: falta TEST_DATABASE_URL en el entorno. Los tests de crm/ requieren una ' +
        'base de datos PostgreSQL separada exclusiva para pruebas — define TEST_DATABASE_URL ' +
        'en crm/.env (copia crm/.env.example). Nunca debe apuntar a la misma base que DATABASE_URL.'
    );
  }
  return { databaseUrl, ...leerComun() };
}
