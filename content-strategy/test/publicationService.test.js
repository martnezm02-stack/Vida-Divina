// publicationService.test.js — Fase 17, §12. Pruebas de seguridad A-J.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createContentItem, approveContentItem, markReadyToPublish, computeContentVersion } from '../src/contentItem.js';
import { createSourceReference } from '../src/sourceReference.js';
import { createHumanReviewRecord } from '../src/humanReviewRecord.js';
import { runQualityGate } from '../src/qualityGate.js';
import { runProductTruthGate } from '../src/productTruthGate.js';
import { publishReadyContentItem, findExistingPublication } from '../src/publicationService.js';
import { MockPublicationBackend } from '../src/publicationAdapter.js';
import { PerformanceLearningStore } from '../../performance-learning-intelligence/src/store.js';

function baseItem(overrides = {}) {
  return createContentItem({
    platform: 'instagram', format: 'slideshow', pillar: 'PRODUCT_CONTEXT', objective: 'Explicar la presentación real de TéDivina.',
    hook: 'QUESTION', angle: 'educación', core_message: 'TéDivina se presenta en bolsitas de té, 3 oz, 1 bolsita por sobre.',
    structure: 'headline -> supporting_message -> cta', product_ref: 'TéDivina',
    source_references: [createSourceReference({ source_module: 'marketing_intelligence', reference_type: 'inference', reference_id: 'inf-1', rationale: 'r' })],
    ...overrides,
  });
}

function safeDraft(overrides = {}) {
  return { hook: 'Conoce cómo se presenta TéDivina.', body: 'TéDivina se presenta en bolsitas de té, 3 oz, 1 bolsita por sobre, según el catálogo oficial.', caption: null, scene_structure: [{ block: 'headline', content: 'Presentación real' }], cta: null, claims: [], requires_human_review: true, ...overrides };
}

function realHumanReview({ item, draft, reviewer_id = 'maria.revisora@vidadivina.test', decision = 'APPROVE' }) {
  const quality = runQualityGate({ item, draft });
  const truth = runProductTruthGate({ item, draft });
  return createHumanReviewRecord({ content_item_id: item.content_item_id, content_version: computeContentVersion({ item, draft }), reviewer_id, decision, reviewed_quality_gate: quality, reviewed_product_truth_gate: truth });
}

function buildReadyItem() {
  const draftItem = baseItem({ production_status: 'DRAFT' });
  const reviewItem = { ...draftItem, production_status: 'REVIEW_REQUIRED' };
  const draft = safeDraft();
  const humanReview = realHumanReview({ item: reviewItem, draft });
  const approved = approveContentItem({ item: reviewItem, draft, humanReview });
  const ready = markReadyToPublish({ item: approved, draft, humanReview });
  return { ready, draft, humanReview };
}

describe('publishReadyContentItem — §12 pruebas de seguridad A-J', () => {
  let dir, store, backend;
  before(() => { dir = mkdtempSync(join(tmpdir(), 'pub-fase17-')); store = new PerformanceLearningStore(dir); backend = new MockPublicationBackend(); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('A. DRAFT → publicación DEBE FALLAR', async () => {
    const item = baseItem({ production_status: 'DRAFT' });
    const draft = safeDraft();
    await assert.rejects(() => publishReadyContentItem({ item, draft, humanReview: realHumanReview({ item, draft }), backend, store }), /READY_TO_PUBLISH/);
  });

  test('B. REVIEW_REQUIRED → publicación DEBE FALLAR', async () => {
    const item = baseItem({ production_status: 'REVIEW_REQUIRED' });
    const draft = safeDraft();
    await assert.rejects(() => publishReadyContentItem({ item, draft, humanReview: realHumanReview({ item, draft }), backend, store }), /READY_TO_PUBLISH/);
  });

  test('C. APPROVED (sin READY_TO_PUBLISH) → publicación DEBE FALLAR', async () => {
    const reviewItem = baseItem({ production_status: 'REVIEW_REQUIRED' });
    const draft = safeDraft();
    const humanReview = realHumanReview({ item: reviewItem, draft });
    const approved = approveContentItem({ item: reviewItem, draft, humanReview });
    await assert.rejects(() => publishReadyContentItem({ item: approved, draft, humanReview, backend, store }), /READY_TO_PUBLISH/);
  });

  test('D. READY_TO_PUBLISH sin HumanReviewRecord DEBE FALLAR', async () => {
    const { ready, draft } = buildReadyItem();
    await assert.rejects(() => publishReadyContentItem({ item: ready, draft, humanReview: null, backend, store }), /HumanReviewRecord real/);
  });

  test('E. READY_TO_PUBLISH con reviewer="system" DEBE FALLAR', async () => {
    const { ready, draft, humanReview } = buildReadyItem();
    const tamperedReview = { ...humanReview, reviewer_id: 'system' };
    await assert.rejects(() => publishReadyContentItem({ item: ready, draft, humanReview: tamperedReview, backend, store }), /reviewer_id inválido/);
  });

  test('F. READY_TO_PUBLISH con versión distinta DEBE FALLAR', async () => {
    const { ready, draft, humanReview } = buildReadyItem();
    const changedDraft = safeDraft({ body: 'Cuerpo modificado después de la aprobación.' });
    await assert.rejects(() => publishReadyContentItem({ item: ready, draft: changedDraft, humanReview, backend, store }), /versión/);
  });

  test('G. misma clave (content_item_id + version + platform) → segunda publicación NO duplica (ALREADY_PUBLISHED)', async () => {
    const { ready, draft, humanReview } = buildReadyItem();
    const first = await publishReadyContentItem({ item: ready, draft, humanReview, backend, store });
    assert.equal(first.status, 'PUBLISHED');

    const second = await publishReadyContentItem({ item: ready, draft, humanReview, backend, store });
    assert.equal(second.status, 'ALREADY_PUBLISHED');
    assert.equal(second.publishedContent.content_id, first.publishedContent.content_id);

    const all = store.loadAll('published_content').filter((r) => r.metadata?.content_item_id === ready.content_item_id);
    assert.equal(all.length, 1, 'nunca debe existir una segunda entrada duplicada en el store');
  });

  test('H. force=true es ignorado — no existe tal parámetro, así que un DRAFT sigue fallando aunque se pase', async () => {
    const item = baseItem({ production_status: 'DRAFT' });
    const draft = safeDraft();
    await assert.rejects(() => publishReadyContentItem({ item, draft, humanReview: realHumanReview({ item, draft }), backend, store, force: true }), /READY_TO_PUBLISH/);
  });

  test('I. skip_review=true es ignorado — sigue exigiendo HumanReviewRecord real', async () => {
    const { ready, draft } = buildReadyItem();
    await assert.rejects(() => publishReadyContentItem({ item: ready, draft, humanReview: null, backend, store, skip_review: true }), /HumanReviewRecord real/);
  });

  test('J (control): con todo correcto, SÍ publica y queda trazable en el store', async () => {
    const { ready, draft, humanReview } = buildReadyItem();
    const result = await publishReadyContentItem({ item: ready, draft, humanReview, backend, store });
    assert.equal(result.status, 'PUBLISHED');
    assert.equal(result.publishedContent.metadata.content_item_id, ready.content_item_id);
    assert.equal(result.publishedContent.metadata.publication_mode, 'simulation');
  });

  test('findExistingPublication no encuentra nada para una clave que nunca se publicó', () => {
    assert.equal(findExistingPublication(store, { content_item_id: 'nunca-existio', content_version: 'x', platform: 'instagram' }), null);
  });
});
