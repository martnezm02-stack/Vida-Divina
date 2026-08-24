import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateContentBatchDiversity } from '../src/batchDiversity.js';

let autoCounter = 0;
function piece({ hook = 'QUESTION', angle = 'educación', format = 'slideshow', draftHook, body, structure, cta = 'cta1' } = {}) {
  autoCounter += 1;
  return {
    item: { hook, angle, format },
    draft: {
      hook: draftHook ?? `hook-auto-${autoCounter}`,
      body: body ?? `body-auto-${autoCounter}`,
      scene_structure: structure ?? [{ block: 'a', content: `content-auto-${autoCounter}` }],
      cta,
    },
  };
}

describe('validateContentBatchDiversity (§7) — diversidad controlada, no aleatoriedad total', () => {
  test('un batch de 5 piezas con combinaciones únicas y textos distintos es válido', () => {
    const pieces = [
      piece({ hook: 'QUESTION', angle: 'educación', format: 'slideshow', draftHook: 'h1', body: 'b1', cta: 'c1' }),
      piece({ hook: 'QUESTION', angle: 'comparación', format: 'short_video', draftHook: 'h2', body: 'b2', cta: 'c2' }),
      piece({ hook: 'MYTH', angle: 'educación', format: 'slideshow', draftHook: 'h3', body: 'b3', cta: 'c1' }),
      piece({ hook: 'PROBLEM', angle: 'problema', format: 'static', draftHook: 'h4', body: 'b4', cta: 'c3' }),
      piece({ hook: 'EDUCATIONAL', angle: 'mecanismo', format: 'short_video', draftHook: 'h5', body: 'b5', cta: 'c2' }),
    ];
    const result = validateContentBatchDiversity(pieces);
    assert.equal(result.valid, true);
  });

  test('permite que 2 (no más) piezas compartan el mismo hook — diversidad controlada, no prohibición total', () => {
    const pieces = [
      piece({ draftHook: 'mismo hook', angle: 'educación', format: 'slideshow', cta: 'c1' }),
      piece({ draftHook: 'mismo hook', angle: 'comparación', format: 'short_video', cta: 'c2' }),
    ];
    assert.equal(validateContentBatchDiversity(pieces).valid, true);
  });

  test('rechaza más de 2 piezas con el hook idéntico', () => {
    const pieces = [
      piece({ draftHook: 'mismo hook', angle: 'educación', format: 'slideshow' }),
      piece({ draftHook: 'mismo hook', angle: 'comparación', format: 'short_video' }),
      piece({ draftHook: 'mismo hook', angle: 'problema', format: 'static' }),
    ];
    const result = validateContentBatchDiversity(pieces);
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.check === 'hooks_no_idénticos_en_exceso'));
  });

  test('rechaza dos piezas con body byte-idéntico', () => {
    const pieces = [piece({ body: 'idéntico' }), piece({ body: 'idéntico' })];
    const result = validateContentBatchDiversity(pieces);
    assert.ok(result.violations.some((v) => v.check === 'body_no_idéntico'));
  });

  test('rechaza dos piezas con scene_structure idéntica', () => {
    const sameStructure = [{ block: 'a', content: 'x' }];
    const pieces = [piece({ structure: sameStructure, body: 'b1' }), piece({ structure: sameStructure, body: 'b2' })];
    const result = validateContentBatchDiversity(pieces);
    assert.ok(result.violations.some((v) => v.check === 'estructura_no_idéntica'));
  });

  test('rechaza la combinación hook+angle+format repetida', () => {
    const pieces = [
      piece({ hook: 'QUESTION', angle: 'educación', format: 'slideshow', body: 'b1' }),
      piece({ hook: 'QUESTION', angle: 'educación', format: 'slideshow', body: 'b2' }),
    ];
    const result = validateContentBatchDiversity(pieces);
    assert.ok(result.violations.some((v) => v.check === 'combinación_hook_angle_format_repetida'));
  });

  test('rechaza cuando TODAS las piezas comparten exactamente el mismo CTA', () => {
    const pieces = [
      piece({ cta: 'mismo', angle: 'educación', format: 'slideshow', body: 'b1' }),
      piece({ cta: 'mismo', angle: 'comparación', format: 'short_video', body: 'b2' }),
      piece({ cta: 'mismo', angle: 'problema', format: 'static', body: 'b3' }),
    ];
    const result = validateContentBatchDiversity(pieces);
    assert.ok(result.violations.some((v) => v.check === 'cta_idéntico_innecesario'));
  });
});
