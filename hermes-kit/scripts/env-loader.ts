// Carga .env.local en process.env ANTES de cualquier otro import.
// Side effect puro, sin exports — debe importarse como primer módulo en
// start-bot.ts/start-qr.ts. Resuelve el bug clásico de hoisting de ES
// modules en Node + tsx.

import path from "node:path";
import fs from "node:fs";

/**
 * Copia SOLO las claves listadas de un archivo .env externo a process.env
 * -- mismo criterio real que dashboard/server/lib/integrationEnv.js (nunca
 * el archivo completo de otro módulo, para que su propia infraestructura,
 * ej. un PORT distinto, no contamine este proceso), reimplementado aquí en
 * forma síncrona (sin import() dinámico: tsx transpila este archivo bajo
 * semántica CJS en el arranque de start-bot.ts/start-qr.ts, donde
 * "top-level await" no está soportado -- ver hallazgo real, 2026-09-05).
 * Nunca sobreescribe una variable ya presente en process.env.
 */
function loadKeysFromEnvFile(filePath: string, keys: string[]): void {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf-8");
  const valores: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    valores[key] = value;
  }
  for (const key of keys) {
    if (process.env[key] === undefined && valores[key] !== undefined) {
      process.env[key] = valores[key];
    }
  }
}

// Aislamiento de tests por defecto (Parte 4, fase "Dashboard: limpieza de
// datos de prueba", 2026-09-19) -- hallazgo real: .env.local de este propio
// kit trae DATABASE_URL hardcodeado al valor REAL de producción (ver
// comentario de esa línea, 2026-09-10). El bloque de abajo lo carga tal
// cual, antes de que nada más corra -- así que fijar el default de test más
// abajo (cerca de crm/.env) llegaba demasiado tarde: para entonces
// DATABASE_URL ya estaba seteada y el guard de "no sobreescribir" ganaba,
// dejando cualquier test corriendo contra la base real. Por eso este default
// tiene que ir AQUÍ, antes del loader de .env.local, no después.
if (process.env.HERMES_TEST_MODE === "1" && process.env.DATABASE_URL === undefined) {
  const crmEnvPath = path.resolve(process.cwd(), "..", "crm", ".env");
  if (fs.existsSync(crmEnvPath)) {
    const texto = fs.readFileSync(crmEnvPath, "utf-8");
    const linea = texto.split(/\r?\n/).find((l) => l.trim().startsWith("TEST_DATABASE_URL="));
    if (linea) {
      process.env.DATABASE_URL = linea.slice(linea.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
}

const envPath = path.resolve(process.cwd(), ".env.local");

if (fs.existsSync(envPath)) {
  const text = fs.readFileSync(envPath, "utf-8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// Integración "Hermes end-to-end" (2026-09-05): además de .env.local propio,
// carga SOLO las claves reales que las tools de Hermes consumen de otros
// módulos independientes (CRM real, Voice Engine real) -- mismo criterio
// exacto que dashboard/server/lib/integrationEnv.js ya usa para el
// Dashboard (ver dashboard/server/lib/loadEnv.js): nunca el .env completo
// de otro módulo, nunca se sobreescribe una variable ya presente. Nunca se
// versionan estos archivos (crm/.env, voice-engine/.env — ambos en
// .gitignore de sus propios módulos).
//
// DATABASE_URL sigue en esta lista por compatibilidad (si .env.local algún
// día deja de traerla), pero en la práctica ya no hace nada por este punto:
// en modo test (HERMES_TEST_MODE=1) ya quedó fijada arriba, antes del
// loader de .env.local; en modo real, .env.local ya la trae hardcodeada
// (ver ese comentario). loadKeysFromEnvFile nunca sobreescribe una variable
// ya presente, así que esta línea es un no-op en ambos casos actuales.
loadKeysFromEnvFile(path.resolve(process.cwd(), "..", "crm", ".env"), [
  "DATABASE_URL",
  "CRM_DB_POOL_MAX",
  "CRM_DB_SSL",
  "CRM_DB_IDLE_TIMEOUT_MS",
  "CRM_DB_CONNECTION_TIMEOUT_MS",
]);
loadKeysFromEnvFile(path.resolve(process.cwd(), "..", "voice-engine", ".env"), [
  "VOICE_ENGINE_API_KEY",
  "VOICE_ENGINE_HOST",
  "VOICE_ENGINE_PORT",
]);
