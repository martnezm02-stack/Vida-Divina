// kreaMcpAuthStore.test.js — Integración Productiva Krea MCP Directo
// (2026-08-27). Persistencia real (Paso 13 del encargo: "debe sobrevivir
// reinicio de Dashboard/Node") -- se prueba real reimportando el módulo
// en un proceso hijo real para el caso de "sobrevive reinicio real",
// y con lectura/escritura directa real del archivo real para el resto.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'krea-mcp-auth-store-test-'));
process.env.IMAGE_GENERATION_DATA_ROOT = TEST_DATA_ROOT;

const {
  loadKreaMcpAuthState, saveKreaMcpAuthState, clearKreaMcpAuthState, hasPersistedKreaMcpTokens, kreaMcpAuthFile,
} = await import('../src/kreaMcpAuthStore.js');

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
  delete process.env.IMAGE_GENERATION_DATA_ROOT;
});

describe('kreaMcpAuthStore — persistencia real local', () => {
  test('sin autorización real previa -> loadKreaMcpAuthState() null, hasPersistedKreaMcpTokens() false', () => {
    clearKreaMcpAuthState();
    assert.equal(loadKreaMcpAuthState(), null);
    assert.equal(hasPersistedKreaMcpTokens(), false);
  });

  test('saveKreaMcpAuthState() real -> se puede leer real de vuelta (mismo estado real)', () => {
    saveKreaMcpAuthState({ clientInformation: { client_id: 'fake-real-id' }, tokens: { access_token: 'fake-real-token', refresh_token: 'fake-real-refresh' } });
    const cargado = loadKreaMcpAuthState();
    assert.equal(cargado.clientInformation.client_id, 'fake-real-id');
    assert.equal(cargado.tokens.access_token, 'fake-real-token');
    assert.equal(hasPersistedKreaMcpTokens(), true);
  });

  test('el archivo real vive dentro de IMAGE_GENERATION_DATA_ROOT real (nunca fuera, nunca en el repo real)', () => {
    assert.ok(kreaMcpAuthFile().startsWith(TEST_DATA_ROOT));
  });

  test('clearKreaMcpAuthState() real -> vuelve a null real, nunca lanza si ya no existe', () => {
    clearKreaMcpAuthState();
    assert.equal(loadKreaMcpAuthState(), null);
    assert.doesNotThrow(() => clearKreaMcpAuthState());
  });

  test('un archivo real corrupto (JSON inválido real) -> null real, nunca lanza', () => {
    fs.mkdirSync(path.dirname(kreaMcpAuthFile()), { recursive: true });
    fs.writeFileSync(kreaMcpAuthFile(), 'esto no es JSON real {{{');
    assert.equal(loadKreaMcpAuthState(), null);
    clearKreaMcpAuthState();
  });

  test('SOBREVIVE un reinicio real del proceso (Paso 13 del encargo): un proceso hijo real nuevo lee el mismo estado real', () => {
    saveKreaMcpAuthState({ tokens: { access_token: 'fake-token-sobrevive-reinicio' } });
    const helperScript = fileURLToPath(new URL('./helpers/readKreaMcpAuthState.mjs', import.meta.url));
    const salida = execFileSync(process.execPath, [helperScript], {
      encoding: 'utf8', env: { ...process.env, IMAGE_GENERATION_DATA_ROOT: TEST_DATA_ROOT },
    });
    assert.equal(salida.trim(), 'true'); // el proceso hijo real (reinicio real simulado) SÍ ve los tokens reales.
    clearKreaMcpAuthState();
  });
});

describe('kreaMcpAuthStore — seguridad (Paso 23 del encargo)', () => {
  test('el código fuente real nunca hace console.log/console.error de "tokens"/"access_token"/"refresh_token" reales', () => {
    const src = fs.readFileSync(new URL('../src/kreaMcpAuthStore.js', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /console\.(log|error|warn|info)\([^)]*token/i);
  });
});
