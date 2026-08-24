import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createContentBrief, createPatternReference, createClaimReference, PAGE_TYPES } from '../src/contentBrief.js';

function base(overrides = {}) {
  return {
    page_type: 'landing_campana',
    objective: 'Objetivo de prueba',
    main_message: 'Mensaje de prueba',
    ...overrides,
  };
}

describe('ContentBrief — campos obligatorios y page_type', () => {
  test('crea un brief válido con requires_human_review=true siempre', () => {
    const brief = createContentBrief(base());
    assert.equal(brief.requires_human_review, true);
    assert.ok(brief.content_brief_id);
  });

  test('rechaza page_type inválido, objective u main_message ausentes', () => {
    assert.throws(() => createContentBrief(base({ page_type: 'tipo_inventado' })));
    assert.throws(() => createContentBrief(base({ objective: undefined })));
    assert.throws(() => createContentBrief(base({ main_message: undefined })));
  });

  test('funciona para los 4 page_type sin exigir campos de landing (offer/cta) en los otros', () => {
    for (const page_type of PAGE_TYPES) {
      const brief = createContentBrief(base({ page_type }));
      assert.equal(brief.page_type, page_type);
      assert.equal(brief.offer, null);
      assert.deepEqual(brief.cta, []);
    }
  });
});

describe('PatternReference — trazabilidad y justificación obligatoria', () => {
  test('exige rationale — "¿por qué usamos este patrón?" nunca queda sin respuesta', () => {
    assert.throws(() => createPatternReference({ source_module: 'website_intelligence', reference_type: 'observation', reference_id: 'x' }));
  });

  test('rechaza source_module o reference_type inválidos', () => {
    assert.throws(() => createPatternReference({ source_module: 'otro_modulo', reference_type: 'observation', reference_id: 'x', rationale: 'r' }));
    assert.throws(() => createPatternReference({ source_module: 'marketing_intelligence', reference_type: 'tipo_raro', reference_id: 'x', rationale: 'r' }));
  });

  test('una referencia válida queda embebida en el ContentBrief y es trazable por id', () => {
    const ref = createPatternReference({ source_module: 'marketing_intelligence', reference_type: 'inference', reference_id: 'inf-123', rationale: 'porque aparece en 3 de 5 anuncios revisados' });
    const brief = createContentBrief(base({ cta: [ref] }));
    assert.equal(brief.cta[0].reference_id, 'inf-123');
    assert.equal(brief.cta[0].rationale, 'porque aparece en 3 de 5 anuncios revisados');
  });
});

describe('ClaimReference — política de claims idéntica a marketing-intelligence', () => {
  test('SIEMPRE verified_by_vida_divina=false y requires_human_review=true, sin importar el input', () => {
    const claim = createClaimReference({ claim_text: 'el sitio afirma X', claim_type: 'health_benefit_claim' });
    assert.equal(claim.verified_by_vida_divina, false);
    assert.equal(claim.requires_human_review, true);
  });

  test('la función no acepta verified_by_vida_divina ni requires_human_review como parámetros — no se pueden sobreescribir por accidente', () => {
    const claim = createClaimReference({ claim_text: 'x', claim_type: 'result_claim', verified_by_vida_divina: true, requires_human_review: false });
    assert.equal(claim.verified_by_vida_divina, false, 'un intento de pasar true debe ser ignorado, no aplicado');
    assert.equal(claim.requires_human_review, true, 'un intento de pasar false debe ser ignorado, no aplicado');
  });
});
