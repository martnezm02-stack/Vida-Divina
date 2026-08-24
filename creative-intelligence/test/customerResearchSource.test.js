// customerResearchSource.test.js — no existía cobertura de este archivo
// antes de Fase 4C. Cubre NullCustomerResearchSource (comportamiento
// preexistente, sin cambios) y StructuredCustomerResearchSource (Fase 4C:
// primera fuente real de Customer Research Ingestion).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CustomerResearchSource, NullCustomerResearchSource, StructuredCustomerResearchSource } from '../src/sources/customerResearchSource.js';
import { createCustomerEvidenceRecord } from '../src/customerEvidenceRecord.js';

describe('NullCustomerResearchSource — comportamiento preexistente, sin cambios', () => {
  test('fetchResearch siempre devuelve vacío -- nunca inventa un dataset', async () => {
    const source = new NullCustomerResearchSource();
    const result = await source.fetchResearch({ personaHint: 'lo que sea' });
    assert.deepEqual(result, { persona: null, pains: [], verbatimQuotes: [] });
    assert.equal(source.name, 'null_customer_research_source');
  });
});

describe('CustomerResearchSource — clase abstracta intacta', () => {
  test('la subclase base sigue lanzando si no se implementa', async () => {
    const base = new CustomerResearchSource();
    assert.throws(() => base.name, /debe implementarse/);
    await assert.rejects(() => base.fetchResearch({}), /debe implementarse/);
  });
});

function sampleRecords() {
  return [
    createCustomerEvidenceRecord({ evidenceId: 'CE-A-01', verbatimQuote: 'lo compré y de verdad me ayudó a dormir mejor', sourcePlatform: 'reseña real (WhatsApp postventa)', sourceType: 'CUSTOMER_TESTIMONIAL', observedAt: '2026-08-10' }),
    createCustomerEvidenceRecord({ evidenceId: 'CE-A-02', verbatimQuote: 'ya llevo 3 pedidos, es lo único que me ha funcionado', sourcePlatform: 'reseña real (WhatsApp postventa)', sourceType: 'CUSTOMER_TESTIMONIAL', observedAt: '2026-08-11' }),
    createCustomerEvidenceRecord({ evidenceId: 'CE-A-03', verbatimQuote: 'mi asesora me lo recomendó y sí cumplió lo que prometía', sourcePlatform: 'llamada de venta real (transcripción)', sourceType: 'SALES_CALL_TRANSCRIPT', observedAt: '2026-08-12' }),
  ];
}

describe('StructuredCustomerResearchSource — Fase 4C: primera fuente real (sin scraping/LLM/conectores)', () => {
  test('constructor rechaza un arreglo vacío -- nunca una fuente "real" sin evidencia real detrás', () => {
    assert.throws(() => new StructuredCustomerResearchSource([]), /al menos 1 elemento/);
    assert.throws(() => new StructuredCustomerResearchSource(null), /al menos 1 elemento/);
  });

  test('constructor rechaza un objeto suelto que no sea un CustomerEvidenceRecord real', () => {
    assert.throws(() => new StructuredCustomerResearchSource([{ text: 'inventado', source: 'x' }]), /createCustomerEvidenceRecord/);
  });

  test('fetchResearch() sin personaHint devuelve TODA la evidencia real ingerida, con provenance intacto', async () => {
    const source = new StructuredCustomerResearchSource(sampleRecords());
    const result = await source.fetchResearch();
    assert.equal(result.verbatimQuotes.length, 3);
    assert.ok(result.verbatimQuotes.every((r) => r.provenance?.evidenceDomain === 'CUSTOMER_RESEARCH'));
  });

  test('fetchResearch() con personaHint filtra por coincidencia textual literal, nunca comprensión semántica', async () => {
    const source = new StructuredCustomerResearchSource(sampleRecords());
    const result = await source.fetchResearch({ personaHint: 'dormir' });
    assert.equal(result.verbatimQuotes.length, 1);
    assert.equal(result.verbatimQuotes[0].evidenceId, 'CE-A-01');
  });

  // Fase 4, Human Review — regla central de esta fuente.
  test('fetchResearch() NUNCA sintetiza una Persona ni un Pain -- persona:null, pains:[] siempre, aunque haya evidencia real de sobra', async () => {
    const source = new StructuredCustomerResearchSource(sampleRecords());
    const result = await source.fetchResearch();
    assert.equal(result.persona, null);
    assert.deepEqual([...result.pains], []);
  });

  test('.records expone los registros reales ingeridos, de solo lectura', () => {
    const records = sampleRecords();
    const source = new StructuredCustomerResearchSource(records);
    assert.equal(source.records.length, 3);
    assert.throws(() => { source.records.push({}); });
  });

  test('name identifica esta fuente real, distinta de la Null', () => {
    const source = new StructuredCustomerResearchSource(sampleRecords());
    assert.equal(source.name, 'structured_customer_research_source');
  });
});
