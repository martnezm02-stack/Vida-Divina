import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createContentStrategy } from '../src/contentStrategy.js';
import { createSourceReference } from '../src/sourceReference.js';

function base(overrides = {}) {
  return {
    objective: 'Explorar ángulos educativos para TéDivina basados en patrones de mercado.',
    product_ref: 'TéDivina',
    content_pillars: ['EDUCATION'],
    market_pattern_refs: [createSourceReference({ source_module: 'marketing_intelligence', reference_type: 'inference', reference_id: 'inf-1', rationale: 'patrón real de hook-pregunta' })],
    ...overrides,
  };
}

describe('ContentStrategy — referencias entre módulos, nunca copia texto (§3, §12)', () => {
  test('crea una estrategia válida con claims_policy fija y requires_human_review=true', () => {
    const strategy = createContentStrategy(base());
    assert.equal(strategy.requires_human_review, true);
    assert.equal(strategy.claims_policy.default_status, 'UNVERIFIED');
    assert.equal(strategy.claims_policy.requires_human_review, true);
  });

  test('rechaza sin ninguna referencia real (nunca una estrategia sin evidencia)', () => {
    assert.throws(() => createContentStrategy({ ...base(), market_pattern_refs: [] }));
  });

  test('rechaza market_pattern_refs con un source_module distinto de marketing_intelligence', () => {
    const badRef = createSourceReference({ source_module: 'website_intelligence', reference_type: 'inference', reference_id: 'x', rationale: 'r' });
    assert.throws(() => createContentStrategy({ ...base(), market_pattern_refs: [badRef] }));
  });

  test('rechaza un pilar inválido', () => {
    assert.throws(() => createContentStrategy(base({ content_pillars: ['MARKETING_MASIVO'] })));
  });

  test('source_references consolida las 3 listas automáticamente, nunca se pasa por separado con riesgo de inconsistencia', () => {
    const viralRef = createSourceReference({ source_module: 'viral_content_intelligence', reference_type: 'content_opportunity', reference_id: 'opp-1', rationale: 'r' });
    const strategy = createContentStrategy(base({ viral_pattern_refs: [viralRef] }));
    assert.equal(strategy.source_references.length, 2);
  });
});

describe('ContentStrategy — aprendizaje propio nunca se convierte en regla absoluta (§13)', () => {
  test('rechaza recommended_hooks con lenguaje de regla absoluta', () => {
    assert.throws(() => createContentStrategy(base({ recommended_hooks: ['siempre usar pregunta directa'] })));
    assert.throws(() => createContentStrategy(base({ recommended_hooks: ['always use question hooks'] })));
  });

  test('acepta recommendaciones formuladas como prioridad experimental', () => {
    const strategy = createContentStrategy(base({ recommended_hooks: ['priorizar pruebas con hook de pregunta'] }));
    assert.deepEqual(strategy.recommended_hooks, ['priorizar pruebas con hook de pregunta']);
  });
});
