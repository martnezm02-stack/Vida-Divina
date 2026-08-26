// captionStyle.test.js — Editable Video Project (2026-08-24).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CAPTION_STYLE, mergeCaptionStyle, construirCssCaption, resaltarPalabrasHtml, assertValidTextOverlay,
  CAPTION_VISIBILITY_MODES, CAPTION_PRESET_NAMES, resolveCaptionPreset, resolveEffectiveCaptionsVisibility,
  shouldRenderCaptions, normalizeForComparison, isHookCaptionDuplicate,
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

  test('Problema 3 -- combina outline/shadow/alignment/presetId reales sobre el default', () => {
    const style = mergeCaptionStyle({ outlineColor: '#ff0000', outlineWidthPx: 3, shadow: true, alignment: 'left' });
    assert.equal(style.outlineColor, '#ff0000');
    assert.equal(style.outlineWidthPx, 3);
    assert.equal(style.shadow, true);
    assert.equal(style.alignment, 'left');
    assert.equal(style.presetId, null); // sin preset explícito -- sigue el default real.
  });

  test('rechaza alignment inválida', () => {
    assert.throws(() => mergeCaptionStyle({ alignment: 'justify' }), /alignment/);
  });

  test('rechaza outlineWidthPx negativo', () => {
    assert.throws(() => mergeCaptionStyle({ outlineWidthPx: -1 }), /outlineWidthPx/);
  });

  test('rechaza shadow no-boolean', () => {
    assert.throws(() => mergeCaptionStyle({ shadow: 'sí' }), /shadow/);
  });

  test('rechaza presetId que no sea string ni null', () => {
    assert.throws(() => mergeCaptionStyle({ presetId: 42 }), /presetId/);
  });

  test('highlightWords acepta el formato nuevo (objeto por-palabra) y lo valida', () => {
    const style = mergeCaptionStyle({ highlightWords: [{ text: 'energía', color: '#00ff00', fontWeight: 900, fontSizePx: 50, backgroundColor: '#111111', animation: 'pop' }] });
    assert.equal(style.highlightWords[0].text, 'energía');
    assert.equal(style.highlightWords[0].animation, 'pop');
  });

  test('rechaza una entrada de highlightWords sin "text" real', () => {
    assert.throws(() => mergeCaptionStyle({ highlightWords: [{ color: '#ffffff' }] }), /text/);
  });

  test('rechaza animation inválida en una entrada de highlightWords', () => {
    assert.throws(() => mergeCaptionStyle({ highlightWords: [{ text: 'x', animation: 'diagonal' }] }), /animation/);
  });
});

describe('Caption Presets (Problema 3) -- configuraciones reales del MISMO captionStyle, nunca un renderizador paralelo', () => {
  test('CAPTION_PRESET_NAMES expone los 5 presets reales pedidos', () => {
    assert.deepEqual([...CAPTION_PRESET_NAMES], ['CLASSIC', 'BOLD', 'MINIMAL', 'HIGHLIGHT', 'SOCIAL_DYNAMIC']);
  });

  test('cada preset real resuelve a un captionStyle válido (mergeCaptionStyle) con su propio presetId', () => {
    for (const name of CAPTION_PRESET_NAMES) {
      const style = resolveCaptionPreset(name);
      assert.equal(style.presetId, name);
    }
  });

  test('CLASSIC es exactamente el estilo default (mismo comportamiento visual de siempre)', () => {
    const classic = resolveCaptionPreset('CLASSIC');
    assert.equal(classic.fontSizePx, DEFAULT_CAPTION_STYLE.fontSizePx);
    assert.equal(classic.position, DEFAULT_CAPTION_STYLE.position);
  });

  test('el usuario puede modificar un preset real vía overrides -- el resultado sigue siendo captionStyle válido', () => {
    const bold = resolveCaptionPreset('BOLD', { fontSizePx: 70 });
    assert.equal(bold.fontSizePx, 70);
    assert.equal(bold.presetId, 'BOLD'); // conserva metadata del preset del que partió.
  });

  test('rechaza un preset real inexistente', () => {
    assert.throws(() => resolveCaptionPreset('ULTRA'), /preset inválido/);
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

  test('Problema 3 -- una entrada objeto real con estilo por-palabra agrega style inline y clase de animación', () => {
    const html = resaltarPalabrasHtml('Encuentra tu energía para cada día.', [{ text: 'energía', color: '#00e5ff', fontWeight: 900, animation: 'pop' }], escapeHtml);
    assert.match(html, /<span class="hl hl-anim-pop" style="color:#00e5ff;font-weight:900">energía<\/span>/);
  });

  test('una entrada objeto real SIN estilo extra (solo "text") se comporta igual que el formato viejo -- sin atributo style', () => {
    const html = resaltarPalabrasHtml('Reishi real', [{ text: 'Reishi' }], escapeHtml);
    assert.equal(html, '<span class="hl">Reishi</span> real');
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

describe('normalizeForComparison — normalización determinista real, SIN LLM/API/tokens', () => {
  test('minúsculas, puntuación, emojis y espacios se normalizan', () => {
    assert.equal(normalizeForComparison('¡Hola,   Mundo!! 👀🔥'), 'hola mundo');
  });

  test('acentos se remueven SIN partir la palabra (bug real evitado: "según" != "segu n")', () => {
    assert.equal(normalizeForComparison('Según él, cómo así'), 'segun el como asi');
  });

  test('entrada no-string real nunca lanza -- normaliza a cadena vacía', () => {
    assert.equal(normalizeForComparison(null), '');
    assert.equal(normalizeForComparison(undefined), '');
  });
});

describe('isHookCaptionDuplicate — Problema 2 "HOOK Y CAPTIONS DUPLICADOS", detección determinista', () => {
  test('caso real del encargo: Hook con emoji vs narración con puntos suspensivos -- SÍ es duplicado', () => {
    const hook = 'Hay algo sobre vitalidad y confianza masculina que pocas personas conocen. 👀';
    const narracion = 'Hay algo sobre vitalidad y confianza masculina que pocas personas conocen...';
    assert.equal(isHookCaptionDuplicate(hook, narracion), true);
  });

  test('el Hook es un prefijo real del inicio de una narración más larga -- SÍ es duplicado', () => {
    assert.equal(isHookCaptionDuplicate('Hay algo real aquí', 'Hay algo real aquí y además mucho más que contar'), true);
  });

  test('un Hook real distinto del contenido de la narración -- NO es duplicado', () => {
    assert.equal(isHookCaptionDuplicate('Un hook genérico cualquiera', 'Reishi real, un hongo medicinal con beneficios reales.'), false);
  });

  test('texto vacío o ausente nunca se declara duplicado', () => {
    assert.equal(isHookCaptionDuplicate('', 'algo'), false);
    assert.equal(isHookCaptionDuplicate('algo', ''), false);
    assert.equal(isHookCaptionDuplicate(null, undefined), false);
  });
});

describe('resolveEffectiveCaptionsVisibility / shouldRenderCaptions — Problema 1 (Auto/Mostrar/Ocultar)', () => {
  test('CAPTION_VISIBILITY_MODES expone los 3 modos reales pedidos', () => {
    assert.deepEqual([...CAPTION_VISIBILITY_MODES], ['AUTO', 'SHOW', 'HIDE']);
  });

  test('un valor ausente/inválido (backward compatibility con proyectos existentes) cae a AUTO, nunca lanza', () => {
    assert.equal(resolveEffectiveCaptionsVisibility(undefined), 'AUTO');
    assert.equal(resolveEffectiveCaptionsVisibility('DIAGONAL'), 'AUTO');
    assert.equal(resolveEffectiveCaptionsVisibility('HIDE'), 'HIDE');
  });

  test('SHOW explícito siempre gana, incluso si el texto duplicaría al Hook', () => {
    const dup = { visibilityMode: 'SHOW', onScreenText: 'Mismo texto real', narrationText: 'Mismo texto real' };
    assert.equal(shouldRenderCaptions(dup), true);
  });

  test('HIDE explícito siempre gana, incluso si el texto NO duplica al Hook', () => {
    const noDup = { visibilityMode: 'HIDE', onScreenText: 'Hook A', narrationText: 'Narración B, sin relación real.' };
    assert.equal(shouldRenderCaptions(noDup), false);
  });

  test('AUTO oculta captions reales cuando duplican el Hook (REGLA CREATIVA del Problema 2)', () => {
    const dup = { visibilityMode: 'AUTO', onScreenText: 'Hay algo real aquí. 👀', narrationText: 'Hay algo real aquí...' };
    assert.equal(shouldRenderCaptions(dup), false);
  });

  test('AUTO muestra captions reales cuando NO duplican el Hook', () => {
    const noDup = { visibilityMode: 'AUTO', onScreenText: 'Hook real', narrationText: 'Reishi real, un producto natural distinto del Hook.' };
    assert.equal(shouldRenderCaptions(noDup), true);
  });
});
