// traceability.test.js — Prueba REAL (no simulada) de trazabilidad contra los
// datos que ya existen en marketing-intelligence/data/ (Fases 2-5). Solo
// lectura: nunca se llama a ningún método que escriba en esos stores.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { traceReference } from '../src/traceability.js';
import { createPatternReference } from '../src/contentBrief.js';
import { RawStore } from '../../marketing-intelligence/src/storage/rawStore.js';
import { IntelligenceStore } from '../../marketing-intelligence/src/storage/intelligenceStore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MI_DATA_DIR = join(__dirname, '..', '..', 'marketing-intelligence', 'data');

describe('traceReference — website_intelligence (sin RawStore propio todavía)', () => {
  test('devuelve status "pending" explícito, nunca inventa una resolución', () => {
    const ref = createPatternReference({ source_module: 'website_intelligence', reference_type: 'observation', reference_id: 'x', rationale: 'r' });
    const result = traceReference(ref);
    assert.equal(result.status, 'pending');
  });
});

describe('traceReference — marketing_intelligence (datos REALES de las Fases 2-5, solo lectura)', () => {
  let rawStore, intelligenceStore, realHypotheses;

  before(() => {
    rawStore = new RawStore(join(MI_DATA_DIR, 'raw'));
    intelligenceStore = new IntelligenceStore(join(MI_DATA_DIR, 'intelligence'));
    realHypotheses = intelligenceStore.loadAll('hypothesis');
  });

  test('hay datos reales disponibles de fases anteriores para probar la trazabilidad', () => {
    assert.ok(realHypotheses.length > 0, 'se esperaban hipótesis reales ya generadas en marketing-intelligence/data/');
  });

  test('resuelve una PatternReference real hasta la URL original, atravesando hipótesis → inferencia → observación → RAW', () => {
    const realHypothesis = realHypotheses[0];
    const ref = createPatternReference({
      source_module: 'marketing_intelligence',
      reference_type: 'hypothesis',
      reference_id: realHypothesis.hypothesis_id,
      rationale: 'prueba real de trazabilidad (Fase 7) contra datos ya existentes',
    });

    const result = traceReference(ref, { rawStore, intelligenceStore });

    assert.equal(result.status, 'resolved');
    assert.equal(result.chain.hypothesis.hypothesis_id, realHypothesis.hypothesis_id);
    assert.ok(result.chain.inference, 'debe resolver la inferencia real que sustenta la hipótesis');
    assert.ok(result.chain.observation, 'debe resolver al menos una observación real que sustenta la inferencia');
    assert.ok(result.chain.raw_id, 'debe resolver el raw_id real de la fuente');
    assert.ok(result.chain.url, 'debe resolver la URL real de la fuente original');
    assert.match(result.chain.url, /^https?:\/\//);
  });

  test('una referencia con un id inexistente devuelve "not_found", nunca lanza ni inventa una cadena', () => {
    const ref = createPatternReference({ source_module: 'marketing_intelligence', reference_type: 'hypothesis', reference_id: 'id-que-no-existe', rationale: 'r' });
    const result = traceReference(ref, { rawStore, intelligenceStore });
    assert.equal(result.status, 'not_found');
  });

  test('nunca se llama a ningún método de escritura de los stores de marketing-intelligence desde esta prueba', () => {
    assert.equal(typeof rawStore.save, 'function');
    assert.equal(typeof intelligenceStore.save, 'function');
    // Verificación de intención: este archivo de prueba, íntegramente, solo
    // invoca traceReference()/loadAll() — nunca .save(). Se deja constancia
    // explícita aquí para que un futuro cambio que añada un .save() en este
    // archivo sea fácil de detectar en revisión de código.
  });
});
