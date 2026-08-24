import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MockPublicationBackend, createPublicationResult, PublicationAdapter } from '../src/publicationAdapter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('MockPublicationBackend (§4) — nunca red real', () => {
  test('publish() devuelve un PublicationResult con publication_mode "simulation"', async () => {
    const backend = new MockPublicationBackend();
    const result = await backend.publish({ content_item_id: 'abc12345', content_version: 'def67890', platform: 'instagram' });
    assert.equal(result.publication_mode, 'simulation');
    assert.equal(result.status, 'SIMULATED');
    assert.ok(result.publication_id);
    assert.ok(result.external_content_id);
  });

  test('es una instancia de PublicationAdapter (misma interfaz intercambiable que AcquisitionBackend/PerformanceSource)', () => {
    assert.ok(new MockPublicationBackend() instanceof PublicationAdapter);
  });

  test('§12-J: el archivo del backend nunca importa un cliente HTTP ni ejecuta una llamada de red', () => {
    const source = readFileSync(join(__dirname, '..', 'src', 'publicationAdapter.js'), 'utf8');
    assert.doesNotMatch(source, /\bfetch\(|require\(['"]https?['"]\)|import .* from ['"]https?['"]|axios|XMLHttpRequest/);
  });
});

describe('createPublicationResult — contrato mínimo', () => {
  test('rechaza status/publication_mode inválidos', () => {
    assert.throws(() => createPublicationResult({ platform: 'instagram', external_content_id: 'x', status: 'PUBLISHED_REAL' }));
    assert.throws(() => createPublicationResult({ platform: 'instagram', external_content_id: 'x', status: 'SIMULATED', publication_mode: 'real' }));
  });
});

describe('createPublicationResult — Fase 19 §4: extensión mínima para adapters reales (SIMULATED↔simulation, todo lo demás↔real)', () => {
  test('acepta los nuevos status reales (PUBLISHED/REJECTED/AUTHORIZATION_REQUIRED/CONFIGURATION_REQUIRED/FAILED) combinados con publication_mode "real"', () => {
    for (const status of ['PUBLISHED', 'REJECTED', 'AUTHORIZATION_REQUIRED', 'CONFIGURATION_REQUIRED', 'FAILED']) {
      const result = createPublicationResult({ platform: 'instagram', external_content_id: 'x', status, publication_mode: 'real' });
      assert.equal(result.status, status);
      assert.equal(result.publication_mode, 'real');
    }
  });

  test('rechaza cualquier status real combinado con publication_mode "simulation"', () => {
    assert.throws(() => createPublicationResult({ platform: 'instagram', external_content_id: 'x', status: 'PUBLISHED', publication_mode: 'simulation' }));
  });

  test('mantiene SIMULATED exigiendo exactamente publication_mode "simulation" (no rompe el comportamiento de Fase 17)', () => {
    const result = createPublicationResult({ platform: 'instagram', external_content_id: 'x', status: 'SIMULATED', publication_mode: 'simulation' });
    assert.equal(result.status, 'SIMULATED');
    assert.equal(result.detail, null);
  });
});
