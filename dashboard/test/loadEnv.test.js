// loadEnv.test.js — prueba aislada del fix real "content-strategy/.env nunca
// se cargaba" (2026-09-10, ver dashboard/server/lib/loadEnv.js). Importa el
// servidor real (mismo patrón que systemStatus.test.js: servidor real,
// puerto efímero) y verifica que process.env quedó poblado con las claves
// reales de Instagram tras el import -- separado de systemStatus.test.js
// para que un fallo aquí señale específicamente un problema de CARGA de
// env, no de la lógica de agregación de /api/system-status.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.PORT = '0';
delete process.env.DASHBOARD_NO_LISTEN;

const { server } = await import('../server/index.js');

before(() => new Promise((resolve, reject) => {
  if (server.listening) { resolve(); return; }
  server.once('listening', () => resolve());
  server.once('error', reject);
}));
after(() => new Promise((resolve) => {
  server.close(() => resolve());
  server.closeAllConnections?.();
}));

describe('loadEnv.js — content-strategy/.env (Instagram)', () => {
  test('INSTAGRAM_ACCESS_TOKEN e INSTAGRAM_IG_USER_ID quedan poblados en process.env', () => {
    assert.ok(process.env.INSTAGRAM_ACCESS_TOKEN, 'INSTAGRAM_ACCESS_TOKEN debería estar poblado desde content-strategy/.env');
    assert.ok(process.env.INSTAGRAM_IG_USER_ID, 'INSTAGRAM_IG_USER_ID debería estar poblado desde content-strategy/.env');
  });
});
