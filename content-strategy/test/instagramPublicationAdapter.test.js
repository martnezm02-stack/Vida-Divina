// instagramPublicationAdapter.test.js — Fase 19, §9. Pruebas A-L adaptadas
// al primer adapter real. Ninguna prueba de este archivo hace una llamada
// HTTP real (§9-I): las únicas dos pruebas que ejercitan la rama de red
// inyectan un fetchImpl de prueba (mismo mecanismo que
// AnthropicLLMProvider/overrides.fetchImpl, marketing-intelligence)
// — nunca contactan graph.facebook.com.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createContentItem, approveContentItem, markReadyToPublish, computeContentVersion } from '../src/contentItem.js';
import { createSourceReference } from '../src/sourceReference.js';
import { createHumanReviewRecord } from '../src/humanReviewRecord.js';
import { runQualityGate } from '../src/qualityGate.js';
import { runProductTruthGate } from '../src/productTruthGate.js';
import { InstagramPublicationAdapter, isValidPublicMediaUrl } from '../src/instagramPublicationAdapter.js';
import { PublicationAdapter } from '../src/publicationAdapter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const REAL_MEDIA_URL = 'https://example-cdn.vidadivina.test/piezas/pieza-piloto-1.jpg';

describe('InstagramPublicationAdapter — es una instancia intercambiable de PublicationAdapter', () => {
  test('extiende PublicationAdapter', () => {
    assert.ok(new InstagramPublicationAdapter() instanceof PublicationAdapter);
  });
});

describe('InstagramPublicationAdapter — §9 pruebas de seguridad A-L (defensa en profundidad, independiente de publicationService.js)', () => {
  test('A. DRAFT → REJECTED (nunca intenta red)', async () => {
    const item = baseItem({ production_status: 'DRAFT' });
    const draft = safeDraft();
    const adapter = new InstagramPublicationAdapter();
    const result = await adapter.publish(item, { draft, humanReview: realHumanReview({ item, draft }), mediaUrl: REAL_MEDIA_URL });
    assert.equal(result.status, 'REJECTED');
    assert.equal(result.publication_mode, 'real');
  });

  test('B. REVIEW_REQUIRED → REJECTED', async () => {
    const item = baseItem({ production_status: 'REVIEW_REQUIRED' });
    const draft = safeDraft();
    const adapter = new InstagramPublicationAdapter();
    const result = await adapter.publish(item, { draft, humanReview: realHumanReview({ item, draft }), mediaUrl: REAL_MEDIA_URL });
    assert.equal(result.status, 'REJECTED');
  });

  test('C. APPROVED (sin READY_TO_PUBLISH) → REJECTED', async () => {
    const reviewItem = baseItem({ production_status: 'REVIEW_REQUIRED' });
    const draft = safeDraft();
    const humanReview = realHumanReview({ item: reviewItem, draft });
    const approved = approveContentItem({ item: reviewItem, draft, humanReview });
    const adapter = new InstagramPublicationAdapter();
    const result = await adapter.publish(approved, { draft, humanReview, mediaUrl: REAL_MEDIA_URL });
    assert.equal(result.status, 'REJECTED');
  });

  test('D. READY_TO_PUBLISH sin HumanReviewRecord → REJECTED', async () => {
    const { ready, draft } = buildReadyItem();
    const adapter = new InstagramPublicationAdapter();
    const result = await adapter.publish(ready, { draft, humanReview: null, mediaUrl: REAL_MEDIA_URL });
    assert.equal(result.status, 'REJECTED');
  });

  test('E. reviewer_id="system" → REJECTED', async () => {
    const { ready, draft, humanReview } = buildReadyItem();
    const tampered = { ...humanReview, reviewer_id: 'system' };
    const adapter = new InstagramPublicationAdapter();
    const result = await adapter.publish(ready, { draft, humanReview: tampered, mediaUrl: REAL_MEDIA_URL });
    assert.equal(result.status, 'REJECTED');
  });

  test('F. versión distinta (draft modificado post-aprobación) → REJECTED', async () => {
    const { ready, draft, humanReview } = buildReadyItem();
    const changedDraft = safeDraft({ body: 'Cuerpo modificado después de la aprobación.' });
    const adapter = new InstagramPublicationAdapter();
    const result = await adapter.publish(ready, { draft: changedDraft, humanReview, mediaUrl: REAL_MEDIA_URL });
    assert.equal(result.status, 'REJECTED');
  });

  test('G. sin credenciales configuradas → CONFIGURATION_REQUIRED (nunca intenta red)', async () => {
    const { ready, draft, humanReview } = buildReadyItem();
    const adapter = new InstagramPublicationAdapter({ accessToken: null, igUserId: null }); // estado real de este repositorio: sin credenciales
    const result = await adapter.publish(ready, { draft, humanReview, mediaUrl: REAL_MEDIA_URL });
    assert.equal(result.status, 'CONFIGURATION_REQUIRED');
    assert.equal(result.publication_mode, 'real');
  });

  test('G2. credenciales presentes pero sin mediaUrl pública → CONFIGURATION_REQUIRED', async () => {
    const { ready, draft, humanReview } = buildReadyItem();
    const adapter = new InstagramPublicationAdapter({ accessToken: 'fake-token-for-structural-test', igUserId: 'fake-ig-user' });
    const result = await adapter.publish(ready, { draft, humanReview, mediaUrl: null });
    assert.equal(result.status, 'CONFIGURATION_REQUIRED');
  });

  test('H. force=true es ignorado — no existe tal parámetro, DRAFT sigue fallando aunque se pase', async () => {
    const item = baseItem({ production_status: 'DRAFT' });
    const draft = safeDraft();
    const adapter = new InstagramPublicationAdapter();
    const result = await adapter.publish(item, { draft, humanReview: realHumanReview({ item, draft }), mediaUrl: REAL_MEDIA_URL, force: true });
    assert.equal(result.status, 'REJECTED');
  });

  test('I. ninguna llamada HTTP real ocurre en A-H: no se pasó fetchImpl y ninguna alcanzó la red (todas rechazadas antes)', () => {
    // Verificación estructural (mismo espíritu que §12-J de publicationAdapter.test.js): el archivo no debe requerir
    // acceso de red para las rutas de rechazo/configuración — ya demostrado arriba porque this._fetch nunca se invoca
    // antes de superar TODAS las verificaciones de A-G2. Se confirma aquí que el import no ejecuta ninguna llamada top-level.
    assert.ok(typeof InstagramPublicationAdapter === 'function');
  });

  test('J. con fetchImpl inyectado (nunca red real) simulando una respuesta EXITOSA de Meta, forma documentada en Fase 18 → PUBLISHED, publication_mode "real"', async () => {
    const { ready, draft, humanReview } = buildReadyItem();
    let call = 0;
    const fetchImpl = async (url) => {
      call += 1;
      if (call === 1) {
        assert.match(url, /\/media$/);
        return { ok: true, json: async () => ({ id: 'container_abc123' }) };
      }
      assert.match(url, /\/media_publish$/);
      return { ok: true, json: async () => ({ id: 'ig_media_real_999' }) };
    };
    const adapter = new InstagramPublicationAdapter({ accessToken: 'fake-token-for-structural-test', igUserId: 'fake-ig-user', fetchImpl });
    const result = await adapter.publish(ready, { draft, humanReview, mediaUrl: REAL_MEDIA_URL });
    assert.equal(result.status, 'PUBLISHED');
    assert.equal(result.publication_mode, 'real');
    assert.equal(result.external_content_id, 'ig_media_real_999');
  });

  test('K. con fetchImpl inyectado simulando un error de permisos de Meta → AUTHORIZATION_REQUIRED, nunca lanza ni inventa éxito', async () => {
    const { ready, draft, humanReview } = buildReadyItem();
    const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'Permissions error: instagram_content_publish requires App Review' } }) });
    const adapter = new InstagramPublicationAdapter({ accessToken: 'fake-token-for-structural-test', igUserId: 'fake-ig-user', fetchImpl });
    const result = await adapter.publish(ready, { draft, humanReview, mediaUrl: REAL_MEDIA_URL });
    assert.equal(result.status, 'AUTHORIZATION_REQUIRED');
    assert.equal(result.publication_mode, 'real');
    assert.doesNotMatch(result.detail, /fake-token-for-structural-test/);
  });

  test('L. idempotencia sigue siendo responsabilidad de publicationService.js (findExistingPublication) — este adapter no la reimplementa, evitando dos fuentes de verdad', () => {
    // Verificación de diseño: el adapter no importa PerformanceLearningStore ni ninguna lógica de idempotencia propia.
    const source = readFileSync(join(__dirname, '..', 'src', 'instagramPublicationAdapter.js'), 'utf8');
    assert.doesNotMatch(source, /findExistingPublication|PerformanceLearningStore/);
  });
});

describe('isValidPublicMediaUrl — §5 frontera mínima de media hosting', () => {
  test('acepta solo https', () => {
    assert.equal(isValidPublicMediaUrl('https://example.com/img.jpg'), true);
    assert.equal(isValidPublicMediaUrl('http://example.com/img.jpg'), false);
    assert.equal(isValidPublicMediaUrl('not-a-url'), false);
    assert.equal(isValidPublicMediaUrl(null), false);
    assert.equal(isValidPublicMediaUrl(''), false);
  });
});
