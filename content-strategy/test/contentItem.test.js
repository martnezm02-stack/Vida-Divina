import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createContentItem, approveContentItem, markReadyToPublish, markReviewRequired, computeContentVersion, PRODUCTION_STATUSES } from '../src/contentItem.js';
import { createSourceReference } from '../src/sourceReference.js';
import { createHumanReviewRecord } from '../src/humanReviewRecord.js';
import { runQualityGate } from '../src/qualityGate.js';
import { runProductTruthGate } from '../src/productTruthGate.js';

function base(overrides = {}) {
  return {
    platform: 'instagram', format: 'slideshow', pillar: 'PRODUCT_CONTEXT', objective: 'Explicar la presentación real de TéDivina.',
    hook: 'QUESTION', angle: 'educación', core_message: 'TéDivina se presenta en bolsitas de té, 3 oz, 1 bolsita por sobre.',
    structure: 'headline -> supporting_message -> cta', product_ref: 'TéDivina',
    source_references: [createSourceReference({ source_module: 'marketing_intelligence', reference_type: 'inference', reference_id: 'inf-1', rationale: 'r' })],
    ...overrides,
  };
}

// Draft SEGURO y respaldado: sin lenguaje fisiológico, con un hecho real
// (presentación) — para poder demostrar una aprobación real que SÍ debería
// poder llegar a REVIEW_REQUIRED → APPROVED → READY_TO_PUBLISH.
function safeDraft(overrides = {}) {
  return { hook: 'Conoce cómo se presenta TéDivina.', body: 'TéDivina se presenta en bolsitas de té, 3 oz, 1 bolsita por sobre, según el catálogo oficial.', caption: null, scene_structure: [{ block: 'headline', content: 'Presentación real de TéDivina' }], cta: null, claims: [], requires_human_review: true, ...overrides };
}

// Draft con lenguaje fisiológico sin marcar — para BLOCKED/REVIEW_REQUIRED.
function riskyDraft(overrides = {}) {
  return { hook: 'Este té ayuda a perder peso y elimina toxinas rápidamente.', body: 'x', caption: null, scene_structure: [], cta: null, claims: [], requires_human_review: true, ...overrides };
}

function realHumanReview({ item, draft, decision = 'APPROVE', reviewer_id = 'maria.revisora@vidadivina.test' }) {
  const quality = runQualityGate({ item, draft });
  const truth = runProductTruthGate({ item, draft });
  return createHumanReviewRecord({
    content_item_id: item.content_item_id, content_version: computeContentVersion({ item, draft }),
    reviewer_id, decision, reviewed_quality_gate: quality, reviewed_product_truth_gate: truth,
  });
}

describe('ContentItem — contrato base (§6, sin cambios de forma)', () => {
  test('crea un item válido en STRATEGY_ONLY por defecto', () => {
    const item = createContentItem(base());
    assert.equal(item.production_status, 'STRATEGY_ONLY');
    assert.equal(item.requires_human_review, true);
    assert.equal(item.content_version, null);
  });

  test('AUTO_PUBLISHED no existe en el enum de estados válidos', () => {
    assert.ok(!PRODUCTION_STATUSES.includes('AUTO_PUBLISHED'));
  });

  test('createContentItem() rechaza intentar crear directamente en APPROVED o READY_TO_PUBLISH', () => {
    assert.throws(() => createContentItem(base({ production_status: 'APPROVED' })), /acción humana explícita/);
    assert.throws(() => createContentItem(base({ production_status: 'READY_TO_PUBLISH' })));
    assert.throws(() => createContentItem(base({ production_status: 'AUTO_PUBLISHED' })));
  });
});

describe('Máquina de estados (§8) — transiciones ilegales rechazadas explícitamente', () => {
  test('DRAFT → REVIEW_REQUIRED es una transición permitida', () => {
    const item = createContentItem(base({ production_status: 'DRAFT' }));
    const reviewed = markReviewRequired(item);
    assert.equal(reviewed.production_status, 'REVIEW_REQUIRED');
  });

  test('markReviewRequired() rechaza desde un estado que no lo permite (ej. APPROVED)', () => {
    const item = createContentItem(base({ production_status: 'DRAFT' }));
    const reviewed = markReviewRequired(item);
    const draft = safeDraft();
    const approved = approveContentItem({ item: reviewed, draft, humanReview: realHumanReview({ item: reviewed, draft }) });
    assert.throws(() => markReviewRequired(approved));
  });
});

describe('§9 Tests críticos A-L — frontera humana obligatoria', () => {
  test('A. ProductTruthGate BLOCKED → approveContentItem() rechaza', () => {
    const item = createContentItem(base({ production_status: 'REVIEW_REQUIRED' }));
    const draft = { hook: 'x', body: 'Ingredientes: ginseng siberiano inventado', scene_structure: [], claims: [], requires_human_review: true };
    const review = realHumanReview({ item, draft }); // el propio humano vería BLOCKED y no debería aprobar, pero probamos que el sistema lo impide aunque lo intente
    assert.throws(() => approveContentItem({ item, draft, humanReview: review }), /BLOCKED/);
  });

  test('B. QualityGate falla → approveContentItem() rechaza', () => {
    const item = createContentItem(base({ production_status: 'REVIEW_REQUIRED' }));
    const draft = { hook: 'x', body: 'Esto garantiza resultados.', scene_structure: [], claims: [], requires_human_review: true }; // dispara detectInventedCertainty -> qualityGate falla
    const review = realHumanReview({ item, draft });
    assert.throws(() => approveContentItem({ item, draft, humanReview: review }), /QualityGate/);
  });

  test('C. REVIEW_REQUIRED sin reviewer → rechaza', () => {
    const item = createContentItem(base({ production_status: 'REVIEW_REQUIRED' }));
    const draft = safeDraft();
    assert.throws(() => approveContentItem({ item, draft, humanReview: null }), /HumanReviewRecord real/);
  });

  test('D. REVIEW_REQUIRED con reviewer humano + APPROVE → permite APPROVED si los gates están satisfechos', () => {
    const item = createContentItem(base({ production_status: 'REVIEW_REQUIRED' }));
    const draft = safeDraft();
    const approved = approveContentItem({ item, draft, humanReview: realHumanReview({ item, draft }) });
    assert.equal(approved.production_status, 'APPROVED');
  });

  test('E. Reviewer = "system" → rechaza (ya en createHumanReviewRecord, defensa en profundidad)', () => {
    const item = createContentItem(base({ production_status: 'REVIEW_REQUIRED' }));
    const draft = safeDraft();
    assert.throws(() => realHumanReview({ item, draft, reviewer_id: 'system' }), /reviewer_id/);
  });

  test('F. Reviewer vacío → rechaza', () => {
    const item = createContentItem(base({ production_status: 'REVIEW_REQUIRED' }));
    const draft = safeDraft();
    assert.throws(() => realHumanReview({ item, draft, reviewer_id: '' }));
  });

  test('G. ContentItem/draft modificado después de aprobación → aprobación invalidada', () => {
    const item = createContentItem(base({ production_status: 'REVIEW_REQUIRED' }));
    const draft = safeDraft();
    const review = realHumanReview({ item, draft }); // revisión sobre ESTA versión
    const changedDraft = safeDraft({ body: 'Texto completamente distinto tras la revisión.' });
    assert.throws(() => approveContentItem({ item, draft: changedDraft, humanReview: review }), /VERSIÓN DISTINTA/);
  });

  test('H. READY_TO_PUBLISH sin APPROVED → rechaza', () => {
    const item = createContentItem(base({ production_status: 'REVIEW_REQUIRED' }));
    const draft = safeDraft();
    assert.throws(() => markReadyToPublish({ item, draft, humanReview: realHumanReview({ item, draft }) }), /transición ilegal/);
  });

  test('I. READY_TO_PUBLISH sin HumanReviewRecord → rechaza', () => {
    const item = createContentItem(base({ production_status: 'REVIEW_REQUIRED' }));
    const draft = safeDraft();
    const approved = approveContentItem({ item, draft, humanReview: realHumanReview({ item, draft }) });
    assert.throws(() => markReadyToPublish({ item: approved, draft, humanReview: null }));
  });

  test('J. READY_TO_PUBLISH con todos los requisitos → permite la transición', () => {
    const item = createContentItem(base({ production_status: 'REVIEW_REQUIRED' }));
    const draft = safeDraft();
    const review = realHumanReview({ item, draft });
    const approved = approveContentItem({ item, draft, humanReview: review });
    const ready = markReadyToPublish({ item: approved, draft, humanReview: review });
    assert.equal(ready.production_status, 'READY_TO_PUBLISH');
  });

  test('K. Contenido copiado nunca llega automáticamente a READY_TO_PUBLISH', () => {
    const item = createContentItem(base({ production_status: 'REVIEW_REQUIRED' }));
    const externalExampleTexts = ['Do Detox Teas Really Work? Dietitian Reviews and honest opinions from everywhere'];
    const draft = safeDraft({ hook: 'Do Detox Teas Really Work? Dietitian Reviews and honest opinions from everywhere' });
    const review = realHumanReview({ item, draft }); // el gate real (sin externalExampleTexts) podría no atraparlo aquí
    const approved = (() => { try { return approveContentItem({ item, draft, humanReview: review, externalExampleTexts }); } catch { return null; } })();
    // Si de alguna forma se aprobó, markReadyToPublish debe detenerlo igualmente al re-chequear con las fuentes externas reales.
    if (approved) {
      assert.throws(() => markReadyToPublish({ item: approved, draft, humanReview: review, externalExampleTexts }));
    } else {
      assert.equal(approved, null); // quedó detenido desde approveContentItem — igualmente correcto
    }
  });

  test('L. Claim de salud no respaldado (BLOCKED) nunca llega automáticamente a READY_TO_PUBLISH', () => {
    const item = createContentItem(base({ production_status: 'REVIEW_REQUIRED' }));
    const draft = { hook: 'x', body: 'El 95% de los usuarios confirma resultados.', scene_structure: [], claims: [], requires_human_review: true }; // estadística inventada -> BLOCKED
    const review = realHumanReview({ item, draft });
    assert.throws(() => approveContentItem({ item, draft, humanReview: review }));
  });
});

describe('§13 Seguridad de aprobación — bypasses conocidos, ninguno existe en esta API', () => {
  test('no existe ningún parámetro approve/approved/force/skip_* — pasar campos extra no tiene ningún efecto', () => {
    const item = createContentItem(base({ production_status: 'REVIEW_REQUIRED' }));
    const draft = safeDraft();
    assert.throws(() => approveContentItem({ item, draft, humanReview: null, approve: true, approved: true, force: true, skip_quality_gate: true, skip_product_truth: true }));
  });

  test('requires_human_review=false en el item no elimina la necesidad de un HumanReviewRecord real', () => {
    const item = createContentItem(base({ production_status: 'REVIEW_REQUIRED' }));
    const tampered = { ...item, requires_human_review: false };
    const draft = safeDraft();
    assert.throws(() => approveContentItem({ item: tampered, draft, humanReview: null }));
  });
});
