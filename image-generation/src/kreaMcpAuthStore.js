// kreaMcpAuthStore.js — Integración Productiva Krea MCP Directo
// (2026-08-27). Persistencia real y local de la autorización OAuth real de
// Krea (client registration + tokens) -- SOBREVIVE reinicios reales del
// Dashboard/Node (Paso 13 del encargo), NUNCA se guarda en Git
// (image-generation/data/ ya está en .gitignore, mismo criterio que
// cualquier otro secreto local de este proyecto, ej. voice-engine/.env).
//
// REGLA DE SEGURIDAD (Paso 23 del encargo): este archivo NUNCA imprime ni
// loguea el contenido real de tokens/authorization code -- solo
// existsSync/boolean hacia afuera. Los únicos lugares que leen el
// contenido real son kreaMcpOAuthProvider.js (para usarlo en la llamada
// OAuth real) y el propio archivo real en disco.

import {
  mkdirSync, readFileSync, writeFileSync, existsSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Funciones, no constantes -- mismo motivo real ya documentado en otros
// providers de este proyecto (apiBaseUrl()/claudeBin()): un "const" de
// módulo se fija para siempre en el primer import, y los tests reales
// necesitan cambiar IMAGE_GENERATION_DATA_ROOT DESPUÉS de importar el
// módulo (varios escenarios reales de disponibilidad en el mismo archivo
// de test).
export function dataRoot() {
  return process.env.IMAGE_GENERATION_DATA_ROOT
    ? join(process.env.IMAGE_GENERATION_DATA_ROOT)
    : fileURLToPath(new URL('../data', import.meta.url));
}
export function kreaMcpAuthFile() {
  return join(dataRoot(), 'krea-mcp-auth.json');
}

/** Real -- null si nunca se autorizó real o el archivo real está corrupto (nunca lanza, nunca inventa un estado real). */
export function loadKreaMcpAuthState() {
  const file = kreaMcpAuthFile();
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Real -- sobrescribe el archivo real completo (idempotente, real). mode 0o600 real en plataformas POSIX reales (Windows real lo ignora, mismo comportamiento real ya aceptado por el resto del proyecto para .env). */
export function saveKreaMcpAuthState(state) {
  mkdirSync(dataRoot(), { recursive: true });
  writeFileSync(kreaMcpAuthFile(), JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
}

/** Real -- fuerza una re-autorización real completa (ej. tras revocar acceso real desde la cuenta Krea). */
export function clearKreaMcpAuthState() {
  const file = kreaMcpAuthFile();
  if (existsSync(file)) rmSync(file);
}

/** Real y rápido -- true solo si hay un access_token real ya persistido (nunca valida su vigencia real aquí, eso lo hace el SDK real al conectar/refrescar). */
export function hasPersistedKreaMcpTokens() {
  return Boolean(loadKreaMcpAuthState()?.tokens?.access_token);
}
