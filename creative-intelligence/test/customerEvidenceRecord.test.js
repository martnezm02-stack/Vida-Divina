// customerEvidenceRecord.test.js — Fase 4C: Ingestion Contract.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerEvidenceRecord, validateCustomerEvidenceRecord } from '../src/customerEvidenceRecord.js';

function validArgs(overrides = {}) {
  return {
    evidenceId: 'CE-01',
    verbatimQuote: 'lo compré hace 2 meses y de verdad se nota la diferencia',
    sourcePlatform: 'reseña real de cliente (WhatsApp postventa)',
    sourceType: 'CUSTOMER_TESTIMONIAL',
    observedAt: '2026-08-20',
    ...overrides,
  };
}

describe('createCustomerEvidenceRecord — Requisito 1: ingestión válida de CUSTOMER_EVIDENCE', () => {
  test('acepta el mínimo real y produce un registro consumible por evidenceIndex.js/personaStage.js', () => {
    const r = createCustomerEvidenceRecord(validArgs());
    assert.equal(r.evidenceId, 'CE-01');
    assert.equal(r.verbatimQuote, 'lo compré hace 2 meses y de verdad se nota la diferencia');
    assert.equal(r.sourcePlatform, 'reseña real de cliente (WhatsApp postventa)');
    assert.ok(r.provenance);
  });

  test('acepta sourceUrl/contentDate/originalEvidenceId/confidence opcionales cuando existen', () => {
    const r = createCustomerEvidenceRecord(validArgs({
      sourceUrl: 'https://ejemplo-real.com/resenas/123', contentDate: '2026-08-15',
      originalEvidenceId: 'REVIEW-123', confidence: 'STRONG',
    }));
    assert.equal(r.provenance.sourceUrl, 'https://ejemplo-real.com/resenas/123');
    assert.equal(r.provenance.contentDate, '2026-08-15');
    assert.equal(r.provenance.originalEvidenceId, 'REVIEW-123');
    assert.equal(r.provenance.confidence, 'STRONG');
  });
});

describe('createCustomerEvidenceRecord — Requisito 2/3: provenance obligatorio y correcto', () => {
  test('siempre construye un provenance real, nunca omitido', () => {
    const r = createCustomerEvidenceRecord(validArgs());
    assert.equal(r.provenance.evidenceDomain, 'CUSTOMER_RESEARCH');
    assert.equal(r.provenance.sourcePlatform, r.sourcePlatform);
    assert.equal(r.provenance.observedAt, '2026-08-20');
    assert.equal(r.provenance.originalEvidenceId, 'CE-01', 'sin originalEvidenceId explícito, usa el mismo evidenceId -- nunca lo deja vacío');
  });

  test('sin sourceUrl real, el provenance queda marcado sourceCurrentlyUnavailable en vez de fabricar una URL', () => {
    const r = createCustomerEvidenceRecord(validArgs());
    assert.equal(r.provenance.sourceUrl, null);
    assert.equal(r.provenance.sourceCurrentlyUnavailable, true);
  });

  test('validateCustomerEvidenceRecord revalida un registro ya construido (ej. leído de una fuente externa)', () => {
    const r = createCustomerEvidenceRecord(validArgs());
    assert.ok(validateCustomerEvidenceRecord(r));
    assert.throws(() => validateCustomerEvidenceRecord({ ...r, verbatimQuote: '' }), /verbatimQuote/);
  });
});

describe('createCustomerEvidenceRecord — Requisito 4: rechazo de evidencia sin fuente', () => {
  test('sin sourcePlatform -- rechazado explícitamente', () => {
    assert.throws(() => createCustomerEvidenceRecord(validArgs({ sourcePlatform: '' })), /sourcePlatform/);
    assert.throws(() => createCustomerEvidenceRecord(validArgs({ sourcePlatform: undefined })), /sourcePlatform/);
  });

  test('sin sourceType (parte de la procedencia real) -- rechazado vía el provenance obligatorio', () => {
    assert.throws(() => createCustomerEvidenceRecord(validArgs({ sourceType: '' })), /sourceType/);
  });

  test('sin observedAt -- rechazado, nunca evidencia sin fecha de observación', () => {
    assert.throws(() => createCustomerEvidenceRecord(validArgs({ observedAt: '' })), /observedAt/);
  });
});

describe('createCustomerEvidenceRecord — Requisito 5: rechazo de verbatim inventado o vacío', () => {
  test('verbatimQuote vacío -- rechazado', () => {
    assert.throws(() => createCustomerEvidenceRecord(validArgs({ verbatimQuote: '' })), /verbatimQuote/);
    assert.throws(() => createCustomerEvidenceRecord(validArgs({ verbatimQuote: '   ' })), /verbatimQuote/);
  });

  test('verbatimQuote ausente -- rechazado, nunca se sustituye por un texto genérico', () => {
    assert.throws(() => createCustomerEvidenceRecord(validArgs({ verbatimQuote: undefined })), /verbatimQuote/);
  });

  test('evidenceId vacío -- rechazado, nunca se autogenera en silencio', () => {
    assert.throws(() => createCustomerEvidenceRecord(validArgs({ evidenceId: '' })), /evidenceId/);
  });
});

describe('createCustomerEvidenceRecord — Requisito 9: ningún Product Fact puede transformarse automáticamente en Customer Evidence', () => {
  test('el módulo nunca importa productFactsLoader.js ni lee docs/productos/ -- estructuralmente no puede convertir un Product Fact en evidencia', async () => {
    const fs = await import('node:fs');
    const url = new URL('../src/customerEvidenceRecord.js', import.meta.url);
    const fuente = fs.readFileSync(url, 'utf8');
    assert.ok(!fuente.includes('productFactsLoader'));
    assert.ok(!fuente.includes('docs/productos'));
  });

  test('un objeto con forma de Product Fact real (problema/beneficios, sin verbatimQuote/sourcePlatform) se rechaza -- nunca se acepta como evidencia de cliente', () => {
    const productFactShaped = { problema: 'Baja masa muscular y envejecimiento prematuro.', beneficios: 'Aporta al aumento de la musculatura.' };
    assert.throws(() => createCustomerEvidenceRecord(productFactShaped), /evidenceId|verbatimQuote|sourcePlatform/);
  });
});
