import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPublishedContent } from '../src/publishedContent.js';

function base(overrides = {}) {
  return {
    platform: 'instagram', published_at: '2026-08-01T00:00:00Z', content_type: 'reel', format: 'slideshow', topic: 'detox_tea', product_ref: 'TéDivina',
    ...overrides,
  };
}

describe('PublishedContent — contrato válido', () => {
  test('crea un registro válido con content_id y created_at generados', () => {
    const pc = createPublishedContent(base());
    assert.ok(pc.content_id);
    assert.ok(pc.created_at);
    assert.equal(pc.product_ref, 'TéDivina');
  });

  test('rechaza platform/content_type/format/topic ausentes', () => {
    assert.throws(() => createPublishedContent(base({ platform: undefined })));
    assert.throws(() => createPublishedContent(base({ content_type: undefined })));
    assert.throws(() => createPublishedContent(base({ format: undefined })));
    assert.throws(() => createPublishedContent(base({ topic: undefined })));
  });

  test('rechaza platform inválida (fuera del enum soportado)', () => {
    assert.throws(() => createPublishedContent(base({ platform: 'myspace' })));
  });
});

describe('PublishedContent — nunca almacena contenido completo (§1)', () => {
  test('rechaza structuralmente content_text/transcript/script en el nivel raíz', () => {
    assert.throws(() => createPublishedContent(base({ content_text: 'texto completo del post' })), /contenido completo/);
    assert.throws(() => createPublishedContent(base({ transcript: 'transcripción completa' })));
    assert.throws(() => createPublishedContent(base({ script: 'guion completo' })));
  });

  test('rechaza la misma fuga dentro de metadata anidada', () => {
    assert.throws(() => createPublishedContent(base({ metadata: { caption_text: 'texto completo' } })));
  });

  test('las referencias (hook_pattern_ref/content_opportunity_ref/content_brief_ref) son opacas — solo ids, nunca objetos completos', () => {
    const pc = createPublishedContent(base({ hook_pattern_ref: 'inf-123', content_opportunity_ref: 'opp-456', content_brief_ref: 'brief-789' }));
    assert.equal(pc.hook_pattern_ref, 'inf-123');
    assert.equal(pc.content_opportunity_ref, 'opp-456');
    assert.equal(pc.content_brief_ref, 'brief-789');
  });
});
