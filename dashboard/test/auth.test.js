// auth.test.js — tests reales de autenticación nativa del Dashboard (FASE
// "Autenticación nativa del Dashboard", 2026-09-19). A diferencia del resto
// de dashboard/test/ (que corre con DASHBOARD_TEST_BYPASS_AUTH=1, ver
// dashboard/.env.test.example), este archivo BORRA ese bypass antes de
// importar el servidor -- es el único que de verdad ejercita la puerta de
// sesión real. Usuario ADMIN de prueba aislado en su propio
// AUTH_DATA_ROOT temporal (mismo patrón que assetOverrideStore.js/
// ASSET_OVERRIDE_DATA_ROOT) -- nunca toca server/data/users.json real de
// Manuel.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PORT = '0';
delete process.env.DASHBOARD_NO_LISTEN;
delete process.env.DASHBOARD_TEST_BYPASS_AUTH; // ejercitar la puerta real, nunca el bypass de los demás tests

const TEST_AUTH_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-auth-test-'));
process.env.AUTH_DATA_ROOT = TEST_AUTH_DATA_ROOT;

const TEST_ADMIN_EMAIL = 'admin-test@vida-divina.local';
const TEST_ADMIN_PASSWORD = 'ContraseñaDePruebaReal-2026!';
process.env.DASHBOARD_ADMIN_EMAIL = TEST_ADMIN_EMAIL;
process.env.DASHBOARD_ADMIN_PASSWORD = TEST_ADMIN_PASSWORD;

const { server } = await import('../server/index.js');

let baseUrl;
before(() => new Promise((resolve, reject) => {
  if (server.listening) { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); return; }
  server.once('listening', () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); });
  server.once('error', reject);
}));
after(() => new Promise((resolve) => {
  server.close(() => resolve());
  server.closeAllConnections?.();
  fs.rmSync(TEST_AUTH_DATA_ROOT, { recursive: true, force: true });
}));

function extractSessionCookie(res) {
  const raw = res.headers.get('set-cookie');
  if (!raw) return null;
  const match = raw.match(/vd_session=[^;]+/);
  return match ? match[0] : null;
}

async function login(email, password, extraHeaders = {}) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify({ email, password }),
  });
  return { res, body: await res.json().catch(() => null), cookie: extractSessionCookie(res) };
}

describe('Usuario NO autenticado', () => {
  test('no puede acceder a la página protegida (GET /) -- redirige real a /login', async () => {
    const res = await fetch(`${baseUrl}/`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.match(res.headers.get('location') ?? '', /\/login$/);
  });

  test('no puede acceder a una API protegida genérica -- 401, nunca 200', async () => {
    const res = await fetch(`${baseUrl}/api/workspace`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.ok(body.error);
  });

  test('acceso directo a una API sensible (WhatsApp) sin sesión -- rechazado igual', async () => {
    const res = await fetch(`${baseUrl}/api/whatsapp/status`);
    assert.equal(res.status, 401);
  });
});

describe('/hermes/* protegido', () => {
  test('sin sesión -- 401, nunca llega a intentar el proxy real hacia hermes-kit', async () => {
    const res = await fetch(`${baseUrl}/hermes/api/health`);
    assert.equal(res.status, 401);
  });

  test('con sesión real -- el gate deja pasar (nunca 401); si hermes-kit no corre en este entorno de test, el proxy real puede devolver 502, pero jamás 401', async () => {
    const { cookie } = await login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
    const res = await fetch(`${baseUrl}/hermes/api/health`, { headers: { Cookie: cookie } });
    assert.notEqual(res.status, 401);
  });
});

describe('Login', () => {
  test('credenciales correctas -- crea una sesión real válida (cookie real)', async () => {
    const { res, body, cookie } = await login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.role, 'ADMIN');
    assert.ok(cookie, 'debe llegar Set-Cookie con vd_session');
  });

  test('contraseña incorrecta -- 401, sin cookie de sesión', async () => {
    const { res, cookie } = await login(TEST_ADMIN_EMAIL, 'contraseña-incorrecta-real');
    assert.equal(res.status, 401);
    assert.equal(cookie, null);
  });

  test('email inexistente -- 401 genérico (nunca revela si el email existe de verdad)', async () => {
    const { res, body } = await login('nadie-real@vida-divina.local', 'lo-que-sea');
    assert.equal(res.status, 401);
    assert.ok(body.error);
  });
});

describe('Cookie de sesión', () => {
  test('nunca contiene la contraseña real, y trae HttpOnly + SameSite reales', async () => {
    const { res } = await login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
    const raw = res.headers.get('set-cookie');
    assert.ok(raw);
    assert.doesNotMatch(raw, new RegExp(TEST_ADMIN_PASSWORD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(raw, /HttpOnly/i);
    assert.match(raw, /SameSite=Lax/i);
    // Petición local real por HTTP, sin X-Forwarded-Proto -- nunca debe
    // llevar Secure, o la cookie sería inservible en desarrollo local real.
    assert.doesNotMatch(raw, /;\s*Secure/i);
  });

  test('Secure real cuando la request llega marcada HTTPS (X-Forwarded-Proto -- mismo criterio real que usan ngrok/Cloudflare Tunnel al reenviar)', async () => {
    const { res } = await login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, { 'X-Forwarded-Proto': 'https' });
    const raw = res.headers.get('set-cookie');
    assert.match(raw, /;\s*Secure/i);
  });
});

describe('Sesión válida', () => {
  test('permite acceso real a un endpoint protegido con la cookie real', async () => {
    const { cookie } = await login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
    const res = await fetch(`${baseUrl}/api/workspace`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
  });

  test('GET /api/auth/session refleja la sesión real (authenticated + email + role)', async () => {
    const { cookie } = await login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
    const res = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookie } });
    const body = await res.json();
    assert.equal(body.authenticated, true);
    assert.equal(body.email, TEST_ADMIN_EMAIL);
    assert.equal(body.role, 'ADMIN');
  });

  test('sin cookie, /api/auth/session responde honesto authenticated:false -- nunca 401, es la ruta pública de chequeo', async () => {
    const res = await fetch(`${baseUrl}/api/auth/session`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.authenticated, false);
  });
});

describe('Logout', () => {
  test('invalida la sesión real del lado del servidor -- la misma cookie ya no sirve después', async () => {
    const { cookie } = await login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
    const antes = await fetch(`${baseUrl}/api/workspace`, { headers: { Cookie: cookie } });
    assert.equal(antes.status, 200);

    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
    assert.equal(logoutRes.status, 200);

    const despues = await fetch(`${baseUrl}/api/workspace`, { headers: { Cookie: cookie } });
    assert.equal(despues.status, 401, 'la sesión debe quedar invalidada del lado del servidor, no solo borrada en el cliente');
  });

  test('logout sin sesión -- nunca lanza, responde ok igual', async () => {
    const res = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });
    assert.equal(res.status, 200);
  });
});

describe('Manipulación/ausencia de sesión', () => {
  test('cookie con un token inventado -- rechazada igual que sin cookie', async () => {
    const res = await fetch(`${baseUrl}/api/workspace`, { headers: { Cookie: 'vd_session=token-inventado-no-real' } });
    assert.equal(res.status, 401);
  });

  test('cookie con valor vacío -- rechazada', async () => {
    const res = await fetch(`${baseUrl}/api/workspace`, { headers: { Cookie: 'vd_session=' } });
    assert.equal(res.status, 401);
  });
});

describe('No romper funcionalidad existente', () => {
  test('GET /api/health sigue público, sin sesión', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
  });

  test('GET / con sesión válida sirve el Dashboard real (200, HTML real)', async () => {
    const { cookie } = await login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
    const res = await fetch(`${baseUrl}/`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Vida Divina/);
  });
});
