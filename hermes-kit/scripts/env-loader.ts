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
