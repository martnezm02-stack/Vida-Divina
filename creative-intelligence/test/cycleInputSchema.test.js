import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createCycleInput, validateCycleInput, CYCLE_OBJECTIVES, CYCLE_EVIDENCE_DOMAINS } from '../schemas/cycleInput.schema.js';

function validEvidenceBatch() {
  return [{ domain: 'MARKET_EVIDENCE', records: [{ verbatimQuote: 'no he bajado mucho', sourcePlatform: 'doctoralia.com.mx' }] }];
}

describe('A. CycleInput válido', () => {
  test('acepta el mínimo real: objective + evidenceBatch', () => {
    const input = createCycleInput({ objective: 'GENERATE_CREATIVE_CELLS', evidenceBatch: validEvidenceBatch() });
    assert.ok(input.cycleId);
    assert.ok(input.generatedAt);
    assert.equal(input.objective, 'GENERATE_CREATIVE_CELLS');
    assert.equal(input.evidenceBatch.length, 1);
    assert.equal(input.previousCycleId, null);
    assert.equal(input.categoryScope, null);
  });

  test('acepta previousCycleId y categoryScope opcionales', () => {
    const input = createCycleInput({
      objective: 'PROCESS_NEW_EVIDENCE', evidenceBatch: validEvidenceBatch(),
      previousCycleId: 'cycle-anterior-123', categoryScope: ['control_de_peso', 'energia'],
    });
    assert.equal(input.previousCycleId, 'cycle-anterior-123');
    assert.deepEqual([...input.categoryScope], ['control_de_peso', 'energia']);
  });

  test('acepta múltiples dominios de evidencia en el mismo batch, sin mezclarlos', () => {
    const input = createCycleInput({
      objective: 'GENERATE_CREATIVE_CELLS',
      evidenceBatch: [
        { domain: 'MARKET_EVIDENCE', records: [{ verbatimQuote: 'x', sourcePlatform: 'y' }] },
        { domain: 'COMPETITIVE_EVIDENCE', records: [{ competitor: 'Fuxion' }] },
      ],
    });
    assert.equal(input.evidenceBatch.length, 2);
    assert.equal(input.evidenceBatch[0].domain, 'MARKET_EVIDENCE');
    assert.equal(input.evidenceBatch[1].domain, 'COMPETITIVE_EVIDENCE');
  });

  test('los 6 dominios de CYCLE_EVIDENCE_DOMAINS son exactamente los esperados (Fase 4A agregó CUSTOMER_EVIDENCE)', () => {
    assert.deepEqual([...CYCLE_EVIDENCE_DOMAINS], ['MARKET_EVIDENCE', 'CUSTOMER_EVIDENCE', 'COMPETITIVE_EVIDENCE', 'AFFILIATE_EVIDENCE', 'OWN_PERFORMANCE_EVIDENCE', 'BRAND_CONTEXT']);
  });

  test('acepta un evidenceBatch real con domain CUSTOMER_EVIDENCE (Fase 4A)', () => {
    const input = createCycleInput({
      objective: 'GENERATE_CREATIVE_CELLS',
      evidenceBatch: [{ domain: 'CUSTOMER_EVIDENCE', records: [{ evidenceId: 'CE-01', verbatimQuote: 'lo compré y de verdad me ayudó', sourcePlatform: 'reseña real de cliente' }] }],
    });
    assert.equal(input.evidenceBatch[0].domain, 'CUSTOMER_EVIDENCE');
  });

  test('los 3 objectives son exactamente los esperados', () => {
    assert.deepEqual([...CYCLE_OBJECTIVES], ['PROCESS_NEW_EVIDENCE', 'GENERATE_CREATIVE_CELLS', 'INGEST_PERFORMANCE']);
  });

  test('validateCycleInput revalida un objeto ya construido (ej. leído de disco)', () => {
    const input = createCycleInput({ objective: 'GENERATE_CREATIVE_CELLS', evidenceBatch: validEvidenceBatch() });
    assert.equal(validateCycleInput(JSON.parse(JSON.stringify(input))), true);
  });
});

describe('B. CycleInput inválido', () => {
  test('rechaza objective inválido', () => {
    assert.throws(() => createCycleInput({ objective: 'LAUNCH_CAMPAIGN', evidenceBatch: validEvidenceBatch() }), /objective/);
  });

  test('rechaza evidenceBatch vacío o ausente', () => {
    assert.throws(() => createCycleInput({ objective: 'GENERATE_CREATIVE_CELLS', evidenceBatch: [] }), /evidenceBatch/);
    assert.throws(() => createCycleInput({ objective: 'GENERATE_CREATIVE_CELLS' }), /evidenceBatch/);
  });

  test('rechaza domain inválido dentro de evidenceBatch', () => {
    assert.throws(
      () => createCycleInput({ objective: 'GENERATE_CREATIVE_CELLS', evidenceBatch: [{ domain: 'CUSTOMER_MESSAGES', records: [{ x: 1 }] }] }),
      /domain/
    );
  });

  test('rechaza una entrada de evidenceBatch sin records reales', () => {
    assert.throws(
      () => createCycleInput({ objective: 'GENERATE_CREATIVE_CELLS', evidenceBatch: [{ domain: 'MARKET_EVIDENCE', records: [] }] }),
      /records/
    );
  });

  test('rechaza estructuras incompatibles con los contratos existentes (record no-objeto)', () => {
    assert.throws(
      () => createCycleInput({ objective: 'GENERATE_CREATIVE_CELLS', evidenceBatch: [{ domain: 'MARKET_EVIDENCE', records: ['solo un string, no un DataPoint real'] }] }),
      /objeto real/
    );
  });

  test('rechaza previousCycleId/categoryScope con tipo incorrecto', () => {
    assert.throws(() => createCycleInput({ objective: 'GENERATE_CREATIVE_CELLS', evidenceBatch: validEvidenceBatch(), previousCycleId: 42 }));
    assert.throws(() => createCycleInput({ objective: 'GENERATE_CREATIVE_CELLS', evidenceBatch: validEvidenceBatch(), categoryScope: 'control_de_peso' }));
  });
});
