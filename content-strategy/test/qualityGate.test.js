import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runQualityGate } from '../src/qualityGate.js';

function validItem(overrides = {}) {
  return {
    product_ref: 'TéDivina', objective: 'o', hook: 'QUESTION', angle: 'educación', format: 'slideshow', pillar: 'EDUCATION',
    source_references: [{ source_module: 'marketing_intelligence', reference_id: 'x' }],
    claims: [{ claim_text: 'x', verified_by_vida_divina: false, requires_human_review: true }],
    requires_human_review: true,
    ...overrides,
  };
}

function validDraft(overrides = {}) {
  return { hook: 'hook real', body: 'body real', caption: null, title: null, requires_human_review: true, ...overrides };
}

describe('runQualityGate (§15) — no lanza, reporta pass/fail con motivos', () => {
  test('un item/draft completamente válido pasa el gate', () => {
    const result = runQualityGate({ item: validItem(), draft: validDraft() });
    assert.equal(result.passed, true);
    assert.deepEqual(result.failures, []);
  });

  test('detecta cada campo obligatorio ausente por separado', () => {
    for (const field of ['product_ref', 'objective', 'hook', 'angle', 'format', 'pillar']) {
      const result = runQualityGate({ item: validItem({ [field]: undefined }), draft: validDraft() });
      assert.equal(result.passed, false, `debería fallar sin ${field}`);
    }
  });

  test('detecta un claim mal marcado (verified_by_vida_divina=true o requires_human_review=false)', () => {
    const r1 = runQualityGate({ item: validItem({ claims: [{ claim_text: 'x', verified_by_vida_divina: true, requires_human_review: true }] }), draft: validDraft() });
    assert.equal(r1.passed, false);
    const r2 = runQualityGate({ item: validItem({ claims: [{ claim_text: 'x', verified_by_vida_divina: false, requires_human_review: false }] }), draft: validDraft() });
    assert.equal(r2.passed, false);
  });

  test('detecta requires_human_review incorrecto en item o draft', () => {
    assert.equal(runQualityGate({ item: validItem({ requires_human_review: false }), draft: validDraft() }).passed, false);
    assert.equal(runQualityGate({ item: validItem(), draft: validDraft({ requires_human_review: false }) }).passed, false);
  });

  test('detecta contenido copiado de una fuente externa', () => {
    const result = runQualityGate({
      item: validItem(), draft: validDraft({ hook: 'Do Detox Teas Really Work? exactamente igual palabra por palabra aquí' }),
      externalExampleTexts: ['Do Detox Teas Really Work? exactamente igual palabra por palabra aquí'],
    });
    assert.equal(result.passed, false);
    assert.ok(result.failures.some((f) => f.includes('copiado')));
  });

  test('detecta lenguaje causal y certeza inventada', () => {
    const r1 = runQualityGate({ item: validItem(), draft: validDraft({ body: 'Esto garantiza resultados.' }) });
    assert.equal(r1.passed, false);
    const r2 = runQualityGate({ item: validItem(), draft: validDraft({ body: 'Resultados garantizado para todos.' }) });
    assert.equal(r2.passed, false);
  });

  test('respeta un batchDiversityResult inválido pasado externamente', () => {
    const result = runQualityGate({ item: validItem(), draft: validDraft(), batchDiversityResult: { valid: false, violations: [{ check: 'hooks_no_idénticos_en_exceso' }] } });
    assert.equal(result.passed, false);
    assert.ok(result.failures.some((f) => f.includes('diversidad')));
  });
});
