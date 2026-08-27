// kreaMcpClient.js — Integración Productiva Krea MCP Directo (2026-08-27).
// Capa de producción real: conexión + OAuth real (vía
// kreaMcpOAuthProvider.js/kreaMcpAuthStore.js) + discovery real + tool
// invocation real + reconexión real + timeout/retry real -- hacia el
// servidor MCP oficial de Krea (https://api.krea.ai/mcp, Streamable HTTP
// real), SIN Claude CLI, SIN Claude API, SIN REST, SIN KREA_API_TOKEN.
// Reemplaza el puente real anterior (`claude -p`, ver git history de
// kreaMcpImageProvider.js) -- probado real y funcionando en
// experiments/krea-mcp-node-poc/ (Node directo -> Krea MCP -> Krea ->
// imagen real, CLAUDE INVOLVED: NO).
//
// NUNCA se mezcla con Creative Director (Paso 3 del encargo: responsabilidad
// única real -- conexión/auth/discovery/invocación, nunca prompts/treatment).
//
// CONCURRENCIA REAL (Paso 17 del encargo, Fix B del POC conservado): CADA
// llamada real a callKreaMcpTool()/listKreaMcpTools() crea una sesión real
// NUEVA (transport + client reales nuevos) -- un StreamableHTTPClientTransport
// real NUNCA se reutiliza tras un primer connect() real fallido, y dos
// generaciones reales concurrentes nunca comparten la misma sesión real
// (mismos tokens reales persistidos, sesiones reales independientes).

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { createKreaMcpOAuthProvider, KreaMcpNonInteractiveAuthRequiredError } from './kreaMcpOAuthProvider.js';
import { hasPersistedKreaMcpTokens } from '../kreaMcpAuthStore.js';

// Funciones, no constantes -- mismo motivo real ya documentado en todo
// este proyecto (kreaMcpAuthStore.js#dataRoot(), etc.): un "const" de
// módulo se fija para siempre en el primer import, y los tests reales
// necesitan apuntar a un servidor MCP real de prueba local DESPUÉS de
// importar el módulo.
function kreaMcpUrl() {
  return process.env.KREA_MCP_URL ?? 'https://api.krea.ai/mcp';
}
function connectTimeoutMs() {
  return Number(process.env.KREA_MCP_CONNECT_TIMEOUT_MS) || 20_000;
}
function defaultCallTimeoutMs() {
  return Number(process.env.KREA_MCP_CALL_TIMEOUT_MS) || 180_000;
}
// Reintentos reales ACOTADOS (Paso 16 del encargo: "no retries infinitos")
// -- solo ante un fallo real de CONEXIÓN (red/timeout), nunca ante un fallo
// real de autorización ni un fallo real de la propia tool.
function defaultMaxRetries() {
  return Number(process.env.KREA_MCP_MAX_RETRIES ?? 1);
}

export class KreaMcpUnavailableError extends Error {}

/**
 * Real y rápido -- NUNCA dispara un flujo real de autorización interactiva.
 * Solo refleja si hay tokens reales ya persistidos (ver
 * scripts/authorize-krea-mcp.mjs) -- mismo criterio real que
 * OpenAIImageProvider#isConfigured() (presencia real de credencial, no
 * verificación en vivo de validez).
 */
export function isKreaMcpConfigured() {
  return hasPersistedKreaMcpTokens();
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new KreaMcpUnavailableError(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Sesión real de un solo uso real -- SIEMPRE transport+client reales nuevos (Fix B del POC). */
async function connectFreshSession() {
  const authProvider = createKreaMcpOAuthProvider({ interactive: false });
  const transport = new StreamableHTTPClientTransport(new URL(kreaMcpUrl()), { authProvider });
  const client = new Client({ name: 'vida-divina', version: '1.0.0' }, { capabilities: {} });
  try {
    await withTimeout(client.connect(transport), connectTimeoutMs(), 'KREA_MCP_UNAVAILABLE: timeout real al conectar con Krea MCP.');
  } catch (err) {
    if (err instanceof KreaMcpNonInteractiveAuthRequiredError) {
      throw new KreaMcpUnavailableError(`KREA_MCP_UNAVAILABLE: ${err.message}`);
    }
    if (err instanceof UnauthorizedError || /401|unauthor/i.test(err.message ?? '')) {
      throw new KreaMcpUnavailableError('KREA_MCP_UNAVAILABLE: sesión real de Krea MCP no autorizada (sin tokens reales válidos) -- ejecuta scripts/authorize-krea-mcp.mjs.');
    }
    if (err instanceof KreaMcpUnavailableError) throw err;
    throw new KreaMcpUnavailableError(`KREA_MCP_UNAVAILABLE: fallo real al conectar con Krea MCP (${err.message}).`);
  }
  return { client, transport };
}

async function closeSessionQuietly(session) {
  try { await session?.client?.close(); } catch { /* cierre real, mejor esfuerzo -- nunca oculta el error real original de la llamada. */ }
}

/**
 * Invoca UNA tool MCP real de Krea, en una sesión real propia (Paso 17).
 * Reintento real ACOTADO solo ante fallos reales de conexión/timeout real
 * (nunca ante un fallo real de autorización ni un fallo real reportado por
 * la propia tool -- esos nunca son transitorios).
 *
 * @param {string} name
 * @param {object} args
 * @param {{timeoutMs?:number, retries?:number}} [options]
 */
export async function callKreaMcpTool(name, args, { timeoutMs = defaultCallTimeoutMs(), retries = defaultMaxRetries() } = {}) {
  let lastError;
  for (let intento = 0; intento <= retries; intento += 1) {
    let session;
    try {
      // eslint-disable-next-line no-await-in-loop
      session = await connectFreshSession();
      // eslint-disable-next-line no-await-in-loop
      const result = await withTimeout(
        session.client.callTool({ name, arguments: args }),
        timeoutMs,
        `KREA_MCP_UNAVAILABLE: timeout real en la tool "${name}".`,
      );
      // eslint-disable-next-line no-await-in-loop
      await closeSessionQuietly(session);
      return result;
    } catch (err) {
      lastError = err;
      // eslint-disable-next-line no-await-in-loop
      await closeSessionQuietly(session);
      const esFalloDeConexionReal = err instanceof KreaMcpUnavailableError && /al conectar/i.test(err.message);
      if (esFalloDeConexionReal && intento < retries) continue; // reintento real acotado, SOLO conexión.
      throw err;
    }
  }
  throw lastError;
}

/** Lista real de tools MCP reales del servidor (discovery, Paso 3 del encargo). */
export async function listKreaMcpTools() {
  const session = await connectFreshSession();
  try {
    return await session.client.listTools();
  } finally {
    await closeSessionQuietly(session);
  }
}
