// captionStyle.js — Editable Video Project (2026-08-24). Estilo de
// captions/subtítulos REAL y editable -- antes, hyperframesRenderer.js
// horneaba un único CSS fijo (.caption-line) sin ningún parámetro
// expuesto. Este módulo define el modelo de estilo (fuente/tamaño/color/
// posición/animación/palabras resaltadas) y las funciones puras que lo
// traducen a CSS/HTML real -- vive en video-production/ (capa de render,
// no de negocio) para que content-orchestrator/ lo consuma sin invertir
// la dirección de dependencia ya establecida (content-orchestrator ->
// video-production, nunca al revés).
//
// Compatibilidad: cuando el llamador no pasa un captionStyle real,
// hyperframesRenderer.js sigue usando su CSS hardcodeado original
// (byte-idéntico) -- este módulo nunca cambia el comportamiento de un
// llamador existente que no lo usa explícitamente.

export const CAPTION_POSITIONS = Object.freeze(['top', 'center', 'bottom']);
export const CAPTION_ANIMATIONS = Object.freeze(['fade', 'pop', 'none']);
export const TEXT_OVERLAY_POSITIONS = Object.freeze(['top', 'center', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right']);

export const DEFAULT_CAPTION_STYLE = Object.freeze({
  fontFamily: '"Segoe UI", Arial, sans-serif',
  fontSizePx: 38,
  fontWeight: 600,
  textColor: '#ffffff',
  backgroundColor: '#000000',
  backgroundOpacity: 0.45,
  position: 'bottom',
  animation: 'fade',
  highlightColor: '#ffd166',
  highlightWords: Object.freeze([]),
});

function assertHexColor(value, fieldName) {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`captionStyle: "${fieldName}" debe ser un color hex real "#RRGGBB" (recibido: ${value}).`);
  }
}

/** Combina un override real del usuario sobre DEFAULT_CAPTION_STYLE, validando cada campo -- nunca acepta un estilo real inválido en silencio. */
export function mergeCaptionStyle(override = {}) {
  const merged = { ...DEFAULT_CAPTION_STYLE, ...override, highlightWords: override.highlightWords ?? DEFAULT_CAPTION_STYLE.highlightWords };
  if (!CAPTION_POSITIONS.includes(merged.position)) throw new Error(`captionStyle: "position" inválida "${merged.position}" (válidas: ${CAPTION_POSITIONS.join(', ')}).`);
  if (!CAPTION_ANIMATIONS.includes(merged.animation)) throw new Error(`captionStyle: "animation" inválida "${merged.animation}" (válidas: ${CAPTION_ANIMATIONS.join(', ')}).`);
  if (!Number.isFinite(merged.fontSizePx) || merged.fontSizePx <= 0) throw new Error('captionStyle: "fontSizePx" debe ser un número real > 0.');
  if (!Number.isFinite(merged.backgroundOpacity) || merged.backgroundOpacity < 0 || merged.backgroundOpacity > 1) throw new Error('captionStyle: "backgroundOpacity" debe estar entre 0 y 1.');
  if (!Array.isArray(merged.highlightWords)) throw new Error('captionStyle: "highlightWords" debe ser un arreglo real de strings.');
  assertHexColor(merged.textColor, 'textColor');
  assertHexColor(merged.backgroundColor, 'backgroundColor');
  assertHexColor(merged.highlightColor, 'highlightColor');
  return Object.freeze(merged);
}

function hexToRgba(hex, opacity) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

const POSICION_CSS = Object.freeze({
  top: 'top: 140px; bottom: auto;',
  center: 'top: 50%; bottom: auto; transform: translateY(-50%);',
  bottom: 'bottom: 130px; top: auto;',
});

/** CSS real (.caption-wrap/.caption-line) derivado de un captionStyle real ya validado (mergeCaptionStyle()). */
export function construirCssCaption(style) {
  const bg = hexToRgba(style.backgroundColor, style.backgroundOpacity);
  return `.caption-wrap { position: absolute; ${POSICION_CSS[style.position]} left: 0; right: 0; display: flex; justify-content: center; z-index: 2; }
      .caption-line { color: ${style.textColor}; font-family: ${style.fontFamily}; font-size: ${style.fontSizePx}px; font-weight: ${style.fontWeight}; text-align: center; max-width: 920px; background: ${bg}; padding: 14px 32px; border-radius: 16px; opacity: 0; }
      .caption-line .hl { color: ${style.highlightColor}; font-weight: 800; }`;
}

/**
 * Envuelve las palabras/frases reales de `highlightWords` en
 * `<span class="hl">` dentro de `texto` -- SIEMPRE escapa primero con
 * `escapeFn` (nunca inserta HTML no controlado que venga del texto real
 * del guion), y solo después envuelve el resaltado sobre el texto ya
 * escapado. Coincidencia case-insensitive, por substring simple (no por
 * límite de palabra) para soportar resaltar frases cortas reales.
 */
export function resaltarPalabrasHtml(texto, highlightWords, escapeFn) {
  const safe = escapeFn(texto);
  if (!highlightWords?.length) return safe;
  let resultado = safe;
  for (const palabra of highlightWords) {
    if (!palabra?.trim()) continue;
    const escapedPalabra = escapeFn(palabra.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escapedPalabra) continue;
    const re = new RegExp(`(${escapedPalabra})`, 'gi');
    resultado = resultado.replace(re, '<span class="hl">$1</span>');
  }
  return resultado;
}

const OVERLAY_POSICION_CSS = Object.freeze({
  top: 'top: 100px; left: 50%; transform: translateX(-50%);',
  center: 'top: 50%; left: 50%; transform: translate(-50%, -50%);',
  bottom: 'bottom: 260px; left: 50%; transform: translateX(-50%);',
  'top-left': 'top: 100px; left: 80px;',
  'top-right': 'top: 100px; right: 80px;',
  'bottom-left': 'bottom: 260px; left: 80px;',
  'bottom-right': 'bottom: 260px; right: 80px;',
});

/** Valida un Text Overlay real (independiente de captions -- ver editableVideoProject.js). */
export function assertValidTextOverlay(overlay, index = 0) {
  if (!overlay?.text?.trim()) throw new Error(`assertValidTextOverlay: overlay[${index}] requiere "text" real.`);
  if (!TEXT_OVERLAY_POSITIONS.includes(overlay.position)) throw new Error(`assertValidTextOverlay: overlay[${index}] tiene "position" inválida "${overlay.position}".`);
  if (!Number.isFinite(overlay.startSeconds) || overlay.startSeconds < 0) throw new Error(`assertValidTextOverlay: overlay[${index}] requiere "startSeconds" real >= 0.`);
  if (!Number.isFinite(overlay.durationSeconds) || overlay.durationSeconds <= 0) throw new Error(`assertValidTextOverlay: overlay[${index}] requiere "durationSeconds" real > 0.`);
  return true;
}

export { OVERLAY_POSICION_CSS };
