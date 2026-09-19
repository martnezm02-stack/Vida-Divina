// auth.js — login/logout/session-check reales del Dashboard (FASE
// "Autenticación nativa del Dashboard", 2026-09-19). Mismo criterio
// zero-dependency del resto de dashboard/server/ (node:http + helpers de
// lib/http.js, sin librerías de auth externas -- node:crypto ya cubre hash
// de contraseña real y tokens de sesión reales, ver lib/passwordHash.js/
// lib/session.js).

import { sendJson, badRequest, readJsonBody } from '../lib/http.js';
import { getUserByEmail } from '../lib/authStore.js';
import { verifyPassword } from '../lib/passwordHash.js';
import { createSession, destroySession, buildSessionCookie, buildClearCookie, getSessionTokenFromRequest, resolveRequestSession } from '../lib/session.js';

/** POST /api/auth/login -- credenciales reales contra el usuario real guardado (nunca contra el env var de bootstrap). Mensaje de error genérico a propósito: nunca revela si el email existe. */
export async function handleLogin(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    badRequest(res, err.message);
    return;
  }
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) {
    badRequest(res, 'Email y contraseña son obligatorios.');
    return;
  }

  const user = getUserByEmail(email);
  const credencialesValidas = user ? verifyPassword(password, user.salt, user.passwordHash) : false;
  if (!credencialesValidas) {
    sendJson(res, 401, { error: 'Email o contraseña incorrectos.' });
    return;
  }

  const token = createSession(user);
  res.setHeader('Set-Cookie', buildSessionCookie(token, req));
  sendJson(res, 200, { ok: true, email: user.email, role: user.role });
}

/** POST /api/auth/logout -- invalida la sesión real del lado del servidor (nunca solo borra la cookie del lado del cliente) y limpia la cookie. Seguro llamarlo sin sesión -- no lanza, no revela nada. */
export function handleLogout(req, res) {
  const token = getSessionTokenFromRequest(req);
  destroySession(token);
  res.setHeader('Set-Cookie', buildClearCookie(req));
  sendJson(res, 200, { ok: true });
}

/** GET /api/auth/session -- session-check real, PUBLIC (debe poder llamarse sin sesión para saber que, en efecto, no hay sesión). Nunca expone el userId/email de otra sesión -- solo la propia, resuelta desde la cookie real de esta request. */
export function handleSessionCheck(req, res) {
  const session = resolveRequestSession(req);
  if (!session) {
    sendJson(res, 200, { authenticated: false });
    return;
  }
  sendJson(res, 200, { authenticated: true, email: session.email, role: session.role });
}
