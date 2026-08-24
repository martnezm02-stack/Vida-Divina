import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createContentPlan, MAX_CONTENT_ITEMS } from '../src/contentPlan.js';
import { createSourceReference } from '../src/sourceReference.js';

function base(overrides = {}) {
  return {
    product_ref: 'TéDivina', objective: 'Plan piloto', content_pillars: ['EDUCATION'],
    content_items: ['item-1', 'item-2'],
    source_references: [createSourceReference({ source_module: 'marketing_intelligence', reference_type: 'inference', reference_id: 'inf-1', rationale: 'r' })],
    ...overrides,
  };
}

describe('ContentPlan — máximo 10 items, nunca un calendario gigante (§5)', () => {
  test('crea un plan válido', () => {
    const plan = createContentPlan(base());
    assert.equal(plan.requires_human_review, true);
    assert.equal(plan.content_items.length, 2);
  });

  test(`rechaza más de ${MAX_CONTENT_ITEMS} content_items`, () => {
    const tooMany = Array.from({ length: MAX_CONTENT_ITEMS + 1 }, (_, i) => `item-${i}`);
    assert.throws(() => createContentPlan(base({ content_items: tooMany })));
  });

  test('rechaza sin source_references — nunca un plan sin trazabilidad', () => {
    assert.throws(() => createContentPlan(base({ source_references: [] })));
  });
});
