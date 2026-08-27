// kreaMcpOAuthProvider.test.js — Integración Productiva Krea MCP Directo
// (2026-08-27).

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'krea-mcp-oauth-provider-test-'));
process.env.IMAGE_GENERATION_DATA_ROOT = TEST_DATA_ROOT;

const { createKreaMcpOAuthProvider, KreaMcpNonInteractiveAuthRequiredError } = await import('../src/providers/kreaMcpOAuthProvider.js');
const { clearKreaMcpAuthState } = await import('../src/kreaMcpAuthStore.js');

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
  delete process.env.IMAGE_GENERATION_DATA_ROOT;
});

describe('createKreaMcpOAuthProvider — modo no-interactivo real (producción, Paso 13 del encargo)', () => {
  test('redirectToAuthorization() real lanza KreaMcpNonInteractiveAuthRequiredError real, NUNCA espera interactivamente', () => {
    const provider = createKreaMcpOAuthProvider({ interactive: false });
    assert.throws(() => provider.redirectToAuthorization(new URL('https://example.com/auth')), KreaMcpNonInteractiveAuthRequiredError);
  });

  test('clientInformation()/tokens() real reflejan el estado real vacío inicial (sin autorización real previa)', () => {
    clearKreaMcpAuthState();
    const provider = createKreaMcpOAuthProvider({ interactive: false });
    assert.equal(provider.clientInformation(), undefined);
    assert.equal(provider.tokens(), undefined);
  });

  test('saveTokens()/tokens() real -- guarda y lee real de vuelta (persistido real, no solo en memoria)', () => {
    const provider = createKreaMcpOAuthProvider({ interactive: false });
    provider.saveTokens({ access_token: 'fake-real-token' });
    assert.equal(provider.tokens().access_token, 'fake-real-token');
    // Un provider real NUEVO (simula un request real distinto) también lo ve real.
    const provider2 = createKreaMcpOAuthProvider({ interactive: false });
    assert.equal(provider2.tokens().access_token, 'fake-real-token');
    clearKreaMcpAuthState();
  });
});

describe('createKreaMcpOAuthProvider — modo interactivo real (SOLO scripts/authorize-krea-mcp.mjs)', () => {
  test('redirectToAuthorization() real invoca onAuthorizationUrl real, nunca lanza', () => {
    let urlRecibida = null;
    const provider = createKreaMcpOAuthProvider({ interactive: true, onAuthorizationUrl: (url) => { urlRecibida = url; } });
    assert.doesNotThrow(() => provider.redirectToAuthorization(new URL('https://example.com/auth')));
    assert.equal(urlRecibida.toString(), 'https://example.com/auth');
  });

  test('interactive:true sin onAuthorizationUrl real -> lanza real (nunca falla en silencio)', () => {
    const provider = createKreaMcpOAuthProvider({ interactive: true });
    assert.throws(() => provider.redirectToAuthorization(new URL('https://example.com/auth')));
  });
});

describe('createKreaMcpOAuthProvider — seguridad (Paso 23 del encargo)', () => {
  test('el código fuente real nunca hace console.log/console.error de tokens/authorization code reales', () => {
    const src = fs.readFileSync(new URL('../src/providers/kreaMcpOAuthProvider.js', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /console\.(log|error|warn|info)\([^)]*token/i);
    assert.doesNotMatch(src, /console\.(log|error|warn|info)\([^)]*(authorizationCode|codeVerifier)/i);
  });
});
