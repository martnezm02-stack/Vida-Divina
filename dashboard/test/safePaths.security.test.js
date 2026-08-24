// safePaths.security.test.js — PRUEBA REAL (Fase "Consolidación y
// Validación del Operation Dashboard", sección 8). server.test.js ya cubre
// un traversal básico y que /media sirve un RAW real -- esta suite cierra
// huecos reales de cobertura que server.test.js no probaba todavía:
//   - archivos .env REALES del repo (content-strategy/, crm/, voice-engine/,
//     whatsapp-adapter/) nunca alcanzables vía /media, ni por
//     resolveSafeMediaPath() directamente;
//   - creative-intelligence/data (Cycles, ProductionArtifacts, evidencia de
//     negocio) inalcanzable;
//   - node_modules inalcanzable;
//   - un nombre de raíz desconocido en /media/<rootName>/... responde 404,
//     nunca intenta resolverlo;
//   - traversal con segmentos codificados en la URL (%2e%2e) también falla;
//   - el límite real "raíz + separador" de isWithinAllowedRoot/
//     resolveSafeMediaPath -- un directorio hermano cuyo nombre EMPIEZA con
//     el mismo string que una raíz permitida (ej. "assets/products-evil")
//     no debe colar por un prefix-match ingenuo sin separador;
//   - /api/preview-info (endpoint nuevo de esta fase) reusa la misma
//     frontera real, nunca acepta una ruta fuera de las raíces permitidas.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { resolveSafeMediaPath, isWithinAllowedRoot, toMediaUrl, PROJECT_ROOT, ALLOWED_MEDIA_ROOTS } from '../server/lib/safePaths.js';

process.env.PORT = '0';
delete process.env.DASHBOARD_NO_LISTEN;

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
}));

describe('resolveSafeMediaPath — límites reales del filesystem (archivos .env reales del repo)', () => {
  const realEnvFiles = [
    join(PROJECT_ROOT, 'content-strategy', '.env'),
    join(PROJECT_ROOT, 'crm', '.env'),
    join(PROJECT_ROOT, 'voice-engine', '.env'),
    join(PROJECT_ROOT, 'whatsapp-adapter', '.env'),
  ];

  for (const envPath of realEnvFiles) {
    test(`"${envPath.replace(PROJECT_ROOT, '')}" (.env real, existe en disco) nunca resuelve`, () => {
      assert.ok(existsSync(envPath), 'precondición: el .env real debe existir para que esta prueba sea significativa');
      assert.equal(resolveSafeMediaPath(envPath), null);
      assert.equal(isWithinAllowedRoot(envPath), false);
    });
  }

  test('creative-intelligence/data (Cycles/ProductionArtifacts reales) nunca resuelve', () => {
    const p = join(PROJECT_ROOT, 'creative-intelligence', 'data');
    assert.ok(existsSync(p));
    assert.equal(resolveSafeMediaPath(p), null);
  });

  test('node_modules nunca resuelve', () => {
    const p = join(PROJECT_ROOT, 'dashboard', 'node_modules');
    if (existsSync(p)) assert.equal(resolveSafeMediaPath(p), null);
  });

  test('un directorio hermano cuyo nombre empieza igual que una raíz permitida no cuela por prefix-match sin separador', () => {
    // "assets/products-evil" comparte el string "assets/products" como
    // prefijo, pero NO es un subdirectorio real de assets/products/ -- el
    // chequeo real (`+ sep`) debe rechazarlo aunque exista en disco.
    const evilDir = join(PROJECT_ROOT, 'assets', 'products-evil');
    mkdirSync(evilDir, { recursive: true });
    const evilFile = join(evilDir, 'no-deberia-resolver.txt');
    writeFileSync(evilFile, 'contenido de prueba, no un asset real.');
    try {
      assert.equal(resolveSafeMediaPath(evilFile), null);
      assert.equal(isWithinAllowedRoot(evilFile), false);
    } finally {
      rmSync(evilDir, { recursive: true, force: true });
    }
  });

  test('toMediaUrl() nunca genera una URL para una ruta fuera de las raíces permitidas', () => {
    assert.equal(toMediaUrl(join(PROJECT_ROOT, 'voice-engine', '.env')), null);
  });
});

describe('/media real — HTTP, nombres de raíz y traversal codificado', () => {
  test('un nombre de raíz desconocido responde 404, nunca intenta resolverlo', async () => {
    const res = await fetch(`${baseUrl}/media/etc-passwd/algo`);
    assert.equal(res.status, 404);
  });

  test('/media/assets-products/../../voice-engine/.env (traversal literal) nunca sirve 200', async () => {
    const res = await fetch(`${baseUrl}/media/assets-products/../../voice-engine/.env`);
    assert.notEqual(res.status, 200);
  });

  test('/media/ con segmentos de traversal codificados (%2e%2e) nunca sirve 200', async () => {
    const res = await fetch(`${baseUrl}/media/assets-products/%2e%2e/%2e%2e/voice-engine/.env`);
    assert.notEqual(res.status, 200);
  });

  test('/media/video-production/../creative-intelligence/data (raíz vecina real de negocio) nunca sirve 200', async () => {
    const res = await fetch(`${baseUrl}/media/video-production/../creative-intelligence/data`);
    assert.notEqual(res.status, 200);
  });
});

describe('/api/preview-info real — reusa la misma frontera de seguridad, no una propia', () => {
  test('un "path" fuera de las raíces permitidas responde 404, nunca ejecuta ffprobe sobre él', async () => {
    const res = await fetch(`${baseUrl}/api/preview-info?path=${encodeURIComponent(join(PROJECT_ROOT, 'voice-engine', '.env'))}`);
    assert.equal(res.status, 404);
  });

  test('un "path" real dentro de video-production/ responde 200 con datos reales de ffprobe', async () => {
    const realMp4Roots = ALLOWED_MEDIA_ROOTS[1];
    if (!existsSync(realMp4Roots)) return; // no hay video-production en este checkout -- nada que probar.
    // Reusa cualquier MP4 real ya presente (generado por pruebas E2E previas de esta misma sesión) si existe; si no hay ninguno, la prueba se omite sin fallar (no se inventa un archivo).
    const { readdirSync, statSync } = await import('node:fs');
    function buscarMp4(dir, profundidad) {
      if (profundidad > 4) return null;
      let entradas; try { entradas = readdirSync(dir); } catch { return null; }
      for (const e of entradas) {
        const full = join(dir, e);
        let st; try { st = statSync(full); } catch { continue; }
        if (st.isDirectory() && e !== 'node_modules') { const found = buscarMp4(full, profundidad + 1); if (found) return found; }
        else if (e.toLowerCase().endsWith('.mp4')) return full;
      }
      return null;
    }
    const mp4Real = buscarMp4(realMp4Roots, 0);
    if (!mp4Real) return;
    const res = await fetch(`${baseUrl}/api/preview-info?path=${encodeURIComponent(mp4Real)}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.probe.ok, true);
  });
});
