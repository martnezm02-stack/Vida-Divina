// session.js — sesiones reales del Dashboard (FASE "Autenticación nativa
// del Dashboard", 2026-09-19). Cookie HttpOnly + token opaco de
// crypto.randomBytes, sesión guardada en memoria del propio proceso
// (nunca en el cliente, nunca en localStorage) -- este servidor es un
// proceso Node local de un solo operador (ver package.json), reiniciarlo
// exige volver a iniciar sesión, comportamiento aceptado a propósito (más
// simple y más seguro que persistir sesiones en disco).
//
// Bypass de test (DASHBOARD_TEST_BYPASS_AUTH=1, ver dashboard/.env.test.example):
// los 21 archivos de test HTTP ya existentes en dashboard/test/ (autoPublish.
// test.js, inventory.test.js, etc.) llaman a la API real sin sesión --
// exigirles autenticarse habría significado tocar cada uno de esos archivos
// para una fase que es EXCLUSIVAMENTE autenticación. Con la variable puesta
// (solo la pone dashboard/package.json#scripts.test, nunca "start"), TODA
// request se trata como ADMIN ya autenticado. dashboard/test/auth.test.js
// (los tests reales de esta fase) borra la variable ANTES de importar el
// servidor -- mismo patrón ya usado en este archivo por
// autoPublish.test.js con DASHBOARD_NO_LISTEN -- así sus propios tests SÍ
// ejercitan la puerta real, nunca el bypass.

import crypto from 'node:crypto';

const SESSION_COOKIE_NAME = 'vd_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h, mismo criterio que hermes-kit/docs/05-cloudflare-access.md

const sessions = new Map();

function limpiarExpiradas() {
  const ahora = Date.now();
  for (const [token, sesion] of sessions) {
    if (sesion.expiresAt <= ahora) sessions.delete(token);
  }
}

export function createSession(user) {
  limpiarExpiradas();
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    userId: user.id,
    email: user.email,
    role: user.role,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

export function getSession(token) {
  if (!token) return null;
  const sesion = sessions.get(token);
  if (!sesion) return null;
  if (sesion.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return sesion;
}

export function destroySession(token) {
  if (token) sessions.delete(token);
}

/** Solo para tests: vacía todas las sesiones reales de este proceso. */
export function clearAllSessionsForTests() {
  sessions.clear();
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  for (const parte of header.split(';')) {
    const eq = parte.indexOf('=');
    if (eq < 0) continue;
    const key = parte.slice(0, eq).trim();
    const value = parte.slice(eq + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

/** true si la conexión real (directa o vía proxy -- ngrok/Cloudflare Tunnel siempre ponen X-Forwarded-Proto) es HTTPS. */
function esConexionSegura(req) {
  if (req.headers['x-forwarded-proto'] === 'https') return true;
  return Boolean(req.socket?.encrypted);
}

export function buildSessionCookie(token, req) {
  const partes = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (esConexionSegura(req)) partes.push('Secure');
  return partes.join('; ');
}

export function buildClearCookie(req) {
  const partes = [`${SESSION_COOKIE_NAME}=`, 'HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=0'];
  if (esConexionSegura(req)) partes.push('Secure');
  return partes.join('; ');
}

export function getSessionTokenFromRequest(req) {
  return parseCookies(req)[SESSION_COOKIE_NAME] ?? null;
}

/**
 * Resuelve la sesión real de una request -- devuelve la sesión (con role)
 * o null si no hay una válida. Único punto real de verdad para "¿está
 * autenticado?", reutilizado por el gate de index.js y por cualquier route
 * que necesite saber quién hace la llamada.
 */
export function resolveRequestSession(req) {
  if (process.env.DASHBOARD_TEST_BYPASS_AUTH === '1') {
    return { userId: 'test-bypass', email: 'test-bypass@local', role: 'ADMIN', bypass: true };
  }
  const token = getSessionTokenFromRequest(req);
  return getSession(token);
}

/**
 * true si la sesión tiene uno de los roles permitidos -- arquitectura lista
 * para ADMIN/OPERADOR (encargo: "diseña la estructura... aunque
 * inicialmente solo exista ADMIN"). Hoy el único rol real que puede existir
 * es ADMIN (ver authStore.js#ensureBootstrapAdmin), así que
 * requireRole(session, ['ADMIN']) y "está autenticado" son equivalentes en
 * la práctica -- la diferencia es solo de intención/arquitectura hasta que
 * exista un segundo rol real.
 */
export function sessionHasRole(session, roles) {
  if (!session) return false;
  if (!roles || roles.length === 0) return true;
  return roles.includes(session.role);
}

export { SESSION_COOKIE_NAME };
