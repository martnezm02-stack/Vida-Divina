import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHumanReviewRecord, REVIEW_DECISIONS } from '../src/humanReviewRecord.js';

function base(overrides = {}) {
  return {
    content_item_id: 'item-1', content_version: 'abc123', reviewer_id: 'maria.revisora@vidadivina.test', decision: 'APPROVE',
    reviewed_quality_gate: { passed: true, failures: [] }, reviewed_product_truth_gate: { status: 'PASS', reasons: [] },
    ...overrides,
  };
}

describe('HumanReviewRecord (§4) — el registro de la decisión humana misma', () => {
  test('crea un registro válido, nunca guarda el objeto completo de los gates (solo un resumen)', () => {
    const record = createHumanReviewRecord(base());
    assert.ok(record.review_id);
    assert.equal(record.reviewed_quality_gate.passed, true);
    assert.equal(record.reviewed_product_truth_gate.status, 'PASS');
    assert.ok(record.reviewed_at);
  });

  test('rechaza reviewer_id="system"/"auto"/vacío (§13)', () => {
    assert.throws(() => createHumanReviewRecord(base({ reviewer_id: 'system' })));
    assert.throws(() => createHumanReviewRecord(base({ reviewer_id: 'SYSTEM' })));
    assert.throws(() => createHumanReviewRecord(base({ reviewer_id: 'auto' })));
    assert.throws(() => createHumanReviewRecord(base({ reviewer_id: '' })));
    assert.throws(() => createHumanReviewRecord(base({ reviewer_id: '   ' })));
  });

  test('rechaza decision inválida', () => {
    assert.throws(() => createHumanReviewRecord(base({ decision: 'MAYBE' })));
  });

  test('acepta las 3 decisiones válidas', () => {
    for (const decision of REVIEW_DECISIONS) {
      const record = createHumanReviewRecord(base({ decision }));
      assert.equal(record.decision, decision);
    }
  });

  test('rechaza sin content_version — toda revisión pertenece a una versión concreta (§6)', () => {
    assert.throws(() => createHumanReviewRecord(base({ content_version: undefined })));
  });

  test('rechaza sin evidencia de que los gates se ejecutaron', () => {
    assert.throws(() => createHumanReviewRecord(base({ reviewed_quality_gate: undefined })));
    assert.throws(() => createHumanReviewRecord(base({ reviewed_product_truth_gate: undefined })));
  });
});
