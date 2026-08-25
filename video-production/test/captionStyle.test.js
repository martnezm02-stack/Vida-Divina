// captionStyle.test.js — Editable Video Project (2026-08-24).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CAPTION_STYLE, mergeCaptionStyle, construirCssCaption, resaltarPalabrasHtml, assertValidTextOverlay,
} from '../src/captionStyle.js';

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

describe('mergeCaptionStyle — validación real de un estilo de caption editable', () => {
  test('sin override, devuelve exactamente DEFAULT_CAPTION_STYLE', () => {
    assert.deepEqual(mergeCaptionStyle(), DEFAULT_CAPTION_STYLE);
  });

  test('combina un override real parcial sobre el default', () => {
    const style = mergeCaptionStyle({ fontSizePx: 50, position: 'top' });
    assert.equal(style.fontSizePx, 50);
    assert.equal(style.position, 'top');
    assert.equal(style.textColor, DEFAULT_CAPTION_STYLE.textColor); // no tocado, sigue el default real.
  });

  test('rechaza una position inválida', () => {
    assert.throws(() => mergeCaptionStyle({ position: 'diagonal' }), /position/);
  });

  test('rechaza un color no-hex real', () => {
    assert.throws(() => mergeCaptionStyle({ textColor: 'red' }), /textColor/);
  });

  test('rechaza fontSizePx <= 0', () => {
    assert.throws(() => mergeCaptionStyle({ fontSizePx: 0 }), /fontSizePx/);
  });

  test('rechaza backgroundOpacity fuera de [0,1]', () => {
    assert.throws(() => mergeCaptionStyle({ backgroundOpacity: 1.5 }), /backgroundOpacity/);
  });
});

describe('construirCssCaption — CSS real derivado de un estilo ya validado', () => {
  test('produce reglas .caption-wrap/.caption-line reales con los valores del estilo', () => {
    const css = construirCssCaption(mergeCaptionStyle({ fontSizePx: 44, textColor: '#112233' }));
    assert.ok(css.includes('font-size: 44px'));
    assert.ok(css.includes('color: #112233'));
  });
});

describe('resaltarPalabrasHtml — resaltado real de palabras, siempre escapado primero', () => {
  test('sin highlightWords, devuelve el texto escapado tal cual', () => {
    assert.equal(resaltarPalabrasHtml('<script>x</script>', [], escapeHtml), '&lt;script&gt;x&lt;/script&gt;');
  });

  test('envuelve las palabras reales pedidas en <span class="hl">, case-insensitive', () => {
    const html = resaltarPalabrasHtml('Reishi real y REISHI de nuevo', ['reishi'], escapeHtml);
    assert.equal((html.match(/<span class="hl">/g) ?? []).length, 2);
  });

  test('nunca inserta HTML no controlado del texto real -- se escapa antes de resaltar', () => {
    const html = resaltarPalabrasHtml('<b>Reishi</b>', ['Reishi'], escapeHtml);
    assert.ok(!html.includes('<b>'));
    assert.ok(html.includes('&lt;b&gt;<span class="hl">Reishi</span>&lt;/b&gt;'));
  });
});

describe('assertValidTextOverlay — validación real de un Text Overlay', () => {
  test('acepta un overlay real válido', () => {
    assert.ok(assertValidTextOverlay({ text: 'Oferta', position: 'top', startSeconds: 0, durationSeconds: 2 }));
  });
  test('rechaza sin text', () => {
    assert.throws(() => assertValidTextOverlay({ position: 'top', startSeconds: 0, durationSeconds: 2 }), /text/);
  });
  test('rechaza position inválida', () => {
    assert.throws(() => assertValidTextOverlay({ text: 'x', position: 'diagonal', startSeconds: 0, durationSeconds: 2 }), /position/);
  });
  test('rechaza durationSeconds <= 0', () => {
    assert.throws(() => assertValidTextOverlay({ text: 'x', position: 'top', startSeconds: 0, durationSeconds: 0 }), /durationSeconds/);
  });
});
