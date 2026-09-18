// env.js
// Única fuente de configuración de crm/ — lee exclusivamente de
// process.env. Nunca hardcodea ni loguea credenciales (ver
// docs/CRM_FASE_B_POSTGRESQL.md, sección de seguridad). Ver
// crm/.env.example para la plantilla de variables reconocidas.

import { readFileSync } from 'node:fs';

function numeroODefecto(valor, porDefecto) {
  if (valor === undefined || valor === null || valor === '') return porDefecto;
  const n = Number(valor);
  return Number.isFinite(n) ? n : porDefecto;
}

function leerComun() {
  return {
    poolMax: numeroODefecto(process.env.CRM_DB_POOL_MAX, 10),
    ssl: process.env.CRM_DB_SSL === 'true',
    // Ver construirSslConfig() más abajo -- estas dos solo tienen efecto si
    // CRM_DB_SSL=true.
    sslCaPath: process.env.CRM_DB_SSL_CA_PATH || null,
    sslRejectUnauthorized: process.env.CRM_DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    idleTimeoutMillis: numeroODefecto(process.env.CRM_DB_IDLE_TIMEOUT_MS, 30000),
    connectionTimeoutMillis: numeroODefecto(process.env.CRM_DB_CONNECTION_TIMEOUT_MS, 5000),
  };
}

/**
 * Construye la opción `ssl` para `new pg.Pool(...)` a partir de la config ya
 * leída — único lugar del proyecto que decide esta forma (antes duplicada
 * en crm/db/pool.js y crm/test/helpers/db.js con `rejectUnauthorized: false`
 * incondicional, lo que anulaba la validación del certificado incluso si
 * algún día CRM_DB_SSL=true apuntaba a producción cloud).
 *
 * - `ssl: false` (DEV/TEST local, default) -> `undefined`, exactamente el
 *   comportamiento actual: sin SSL, Postgres local no lo requiere.
 * - `ssl: true` -> valida el certificado por defecto
 *   (`rejectUnauthorized: true`), usando el trust store estándar de Node.
 *   Es suficiente para un proveedor cloud cuyo certificado esté firmado por
 *   una CA pública reconocida (el caso común de Postgres administrado).
 * - `sslCaPath`: ruta a un archivo .pem con la CA específica del proveedor,
 *   SOLO si ese proveedor usa una CA propia no reconocida por el trust
 *   store de Node -- nunca se hardcodea aquí ni se inventa un valor; si
 *   hace falta, quien despliegue debe proveer el archivo y apuntar
 *   CRM_DB_SSL_CA_PATH a él. Sin esta variable, se usa el trust store
 *   estándar (suficiente para el caso común).
 * - `sslRejectUnauthorized: false` (vía CRM_DB_SSL_REJECT_UNAUTHORIZED=false)
 *   es un escape hatch explícito solo para diagnóstico temporal -- NUNCA es
 *   el default cuando SSL está activo.
 *
 * @param {{ssl: boolean, sslCaPath: string|null, sslRejectUnauthorized: boolean}} config
 * @returns {{rejectUnauthorized: boolean, ca?: string}|undefined}
 */
export function construirSslConfig({ ssl, sslCaPath, sslRejectUnauthorized }) {
  if (!ssl) return undefined;
  const opciones = { rejectUnauthorized: sslRejectUnauthorized };
  if (sslCaPath) {
    opciones.ca = readFileSync(sslCaPath, 'utf8');
  }
  return opciones;
}

/**
 * Firma segura de una cadena de conexión de PostgreSQL: host + puerto +
 * nombre de base, en minúsculas, con el puerto por defecto real de
 * PostgreSQL (5432) si la URL no lo especifica -- igual criterio que usa
 * libpq/pg. NUNCA incluye usuario/password, y nunca compara la cadena
 * completa (eso haría que dos URLs de la MISMA base con distinto
 * usuario/password, o con parámetros irrelevantes como `sslmode`/
 * `application_name` en distinto orden, parecieran bases DISTINTAS cuando
 * en realidad son la misma base física).
 *
 * @param {string} urlTexto
 * @param {string} etiqueta - nombre de la variable de entorno, solo para el mensaje de error.
 * @returns {string}
 */
function firmaDeConexion(urlTexto, etiqueta) {
  let url;
  try {
    url = new URL(urlTexto);
  } catch {
    throw new Error(`crm/config: "${etiqueta}" no es una URL de conexión de PostgreSQL válida.`);
  }
  const host = url.hostname.toLowerCase();
  const puerto = url.port || '5432';
  const base = url.pathname.replace(/^\//, '').toLowerCase();
  return `${host}:${puerto}/${base}`;
}

/**
 * Guard crítico (auditoría de persistencia, 2026-09-18): antes de este fix,
 * nada impedía que TEST_DATABASE_URL y DATABASE_URL apuntaran a la misma
 * base -- un error de configuración así haría que resetDatabase()
 * (crm/test/helpers/db.js, DELETE FROM de 16 tablas en cada beforeEach)
 * se ejecutara contra datos reales. Vive dentro de getTestConfig() (más
 * abajo) -- el único punto por el que CUALQUIER consumidor obtiene
 * TEST_DATABASE_URL hoy (crm/test/helpers/db.js#getTestPool, llamado en el
 * before() de los 9 archivos de test de integración) -- así ninguna ruta
 * hacia un pool de test puede evitarlo sin pasar por aquí.
 *
 * Si DATABASE_URL no está definida (ej. un entorno que solo corre tests y
 * nunca configura la base "real"), no hay nada que comparar -- no es un
 * error, es la ausencia legítima de una variable opcional en ese contexto.
 *
 * @param {string} testDatabaseUrl
 */
function assertTestDatabaseSeparadaDeProd(testDatabaseUrl) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;
  const firmaProd = firmaDeConexion(databaseUrl, 'DATABASE_URL');
  const firmaTest = firmaDeConexion(testDatabaseUrl, 'TEST_DATABASE_URL');
  if (firmaProd === firmaTest) {
    throw new Error(
      `crm/config: TEST_DATABASE_URL y DATABASE_URL apuntan a la misma base (${firmaTest}). ` +
        'Los tests de crm/ ejecutan DELETE FROM sobre TODAS las filas de 16 tablas en cada caso ' +
        '(ver crm/test/helpers/db.js#resetDatabase) -- TEST_DATABASE_URL debe ser una base ' +
        'PostgreSQL completamente separada, nunca la misma que DATABASE_URL, ni siquiera con ' +
        'usuario/password o parámetros de query distintos.'
    );
  }
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
 * contra la base de desarrollo/producción. Ver assertTestDatabaseSeparadaDeProd
 * arriba para la protección adicional contra que ambas apunten a la misma base.
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
  assertTestDatabaseSeparadaDeProd(databaseUrl);
  return { databaseUrl, ...leerComun() };
}
