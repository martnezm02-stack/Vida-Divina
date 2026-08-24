import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createContentDraft } from '../src/contentDraft.js';
import { createContentItem } from '../src/contentItem.js';
import { createSourceReference } from '../src/sourceReference.js';

function baseItem(overrides = {}) {
  return createContentItem({
    platform: 'instagram', format: 'slideshow', pillar: 'EDUCATION', objective: 'Explicar la preparación previa.',
    hook: 'pregunta', angle: 'educación', core_message: 'Preparación previa real.', structure: 'hook -> problema -> cta',
    product_ref: 'TéDivina', source_references: [createSourceReference({ source_module: 'marketing_intelligence', reference_type: 'inference', reference_id: 'inf-1', rationale: 'r' })],
    ...overrides,
  });
}

function baseDraftFields(item, overrides = {}) {
  return { content_item: item, hook: '¿Sabías que la preparación previa importa?', body: 'TéDivina está formulado con malva, mirra y cardo bendito para la etapa previa a un programa.', generation_method: 'rule_based_template', ...overrides };
}

describe('ContentDraft — Control de Calidad (§20)', () => {
  test('crea un draft válido, hereda source_references del ContentItem, requires_human_review=true', () => {
    const item = baseItem();
    const draft = createContentDraft(baseDraftFields(item));
    assert.equal(draft.requires_human_review, true);
    assert.deepEqual(draft.source_references, item.source_references);
    assert.equal(draft.content_item_id, item.content_item_id);
  });

  test('rechaza sin hook/body (§20-3)', () => {
    const item = baseItem();
    assert.throws(() => createContentDraft({ ...baseDraftFields(item), hook: undefined }));
    assert.throws(() => createContentDraft({ ...baseDraftFields(item), body: undefined }));
  });

  test('si el ContentItem pide CTA, el draft debe incluirlo (§20-5)', () => {
    const item = baseItem({ cta: 'Conoce TéDivina' });
    assert.throws(() => createContentDraft({ ...baseDraftFields(item), cta: null }));
    const draft = createContentDraft({ ...baseDraftFields(item), cta: 'Conoce TéDivina en el catálogo' });
    assert.ok(draft.cta);
  });

  test('rechaza afirmaciones de certeza inventada (§20-9/10): "garantizado", "cura ", "estudio clínico"', () => {
    const item = baseItem();
    assert.throws(() => createContentDraft({ ...baseDraftFields(item), body: 'Resultados garantizados desde el primer día.' }));
    assert.throws(() => createContentDraft({ ...baseDraftFields(item), body: 'Un estudio clínico lo confirma.' }));
    assert.throws(() => createContentDraft({ ...baseDraftFields(item), hook: 'Cura la hinchazón en 24 horas.' }));
  });

  test('rechaza reproducir un fragmento literal largo de una fuente externa (§20-8, anti-copy)', () => {
    const item = baseItem();
    const externalExampleTexts = ['Do Detox Teas Really Work? Dietitian Reviews and honest opinions from real users'];
    assert.throws(() => createContentDraft({
      ...baseDraftFields(item),
      hook: 'Do Detox Teas Really Work? Dietitian Reviews and honest opinions',
      externalExampleTexts,
    }));
  });

  test('claims se heredan del ContentItem (política existente, nunca inventada de nuevo)', () => {
    const item = baseItem({ claims: [{ claim_text: 'ayuda a preparar el cuerpo', verified_by_vida_divina: false, requires_human_review: true }] });
    const draft = createContentDraft(baseDraftFields(item));
    assert.equal(draft.claims[0].verified_by_vida_divina, false);
  });
});
