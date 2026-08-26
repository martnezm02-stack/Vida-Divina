// captionStyle.js — Editable Video Project (2026-08-24, extendido
// 2026-08-25 — Fix Editor: Hook/Voiceover/Captions + Caption Styles).
// Estilo de captions/subtítulos REAL y editable -- antes,
// hyperframesRenderer.js horneaba un único CSS fijo (.caption-line) sin
// ningún parámetro expuesto. Este módulo define el modelo de estilo
// (fuente/tamaño/color/posición/animación/palabras resaltadas), los
// presets reales sobre ese mismo modelo, la detección determinista de
// duplicación Hook/Captions, y las funciones puras que todo esto traduce
// a CSS/HTML real -- vive en video-production/ (capa de render, no de
// negocio) para que content-orchestrator/ lo consuma sin invertir la
// dirección de dependencia ya establecida (content-orchestrator ->
// video-production, nunca al revés).
//
// Compatibilidad: cuando el llamador no pasa un captionStyle real,
// hyperframesRenderer.js sigue usando su CSS hardcodeado original
// (byte-idéntico) -- este módulo nunca cambia el comportamiento de un
// llamador existente que no lo usa explícitamente. highlightWords sigue
// aceptando el formato viejo (arreglo de strings) sin cambiar su HTML de
// salida -- el formato nuevo (arreglo de objetos con estilo por-palabra)
// es aditivo.

// Rango real de marcas diacríticas combinantes Unicode (U+0300-U+036F) --
// construido con String.fromCodePoint (nunca un literal de regex con
// escapes \u en el código fuente) para que el archivo nunca dependa de
// cómo una herramienta de edición/transporte reinterprete esos escapes.
const COMBINING_DIACRITICAL_MARKS_RE = new RegExp(`[${String.fromCodePoint(0x0300)}-${String.fromCodePoint(0x036f)}]`, 'g');

export const CAPTION_POSITIONS = Object.freeze(['top', 'center', 'bottom']);
export const CAPTION_ANIMATIONS = Object.freeze(['fade', 'pop', 'none']);
export const CAPTION_ALIGNMENTS = Object.freeze(['left', 'center', 'right']);
export const TEXT_OVERLAY_POSITIONS = Object.freeze(['top', 'center', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right']);

// Modo de visibilidad real de la CAPA de captions (Problema 1 del fix) --
// independiente de la posición/estilo. 'AUTO' decide en base a
// isHookCaptionDuplicate() (Problema 2); 'SHOW'/'HIDE' son overrides
// explícitos del usuario que siempre ganan sobre la detección automática.
export const CAPTION_VISIBILITY_MODES = Object.freeze(['AUTO', 'SHOW', 'HIDE']);

// Lista curada real para el selector de fuente del editor -- fontFamily
// sigue siendo un string libre (nunca se rechaza uno fuera de esta lista),
// esto es solo la oferta por defecto en la UI.
export const CAPTION_FONT_FAMILIES = Object.freeze([
  '"Segoe UI", Arial, sans-serif',
  '"Montserrat", "Segoe UI", sans-serif',
  '"Poppins", "Segoe UI", sans-serif',
  '"Bebas Neue", Impact, sans-serif',
  '"Georgia", "Times New Roman", serif',
  '"Courier New", monospace',
]);

export const DEFAULT_CAPTION_STYLE = Object.freeze({
  fontFamily: '"Segoe UI", Arial, sans-serif',
  fontSizePx: 38,
  fontWeight: 600,
  textColor: '#ffffff',
  backgroundColor: '#000000',
  backgroundOpacity: 0.45,
  position: 'bottom',
  alignment: 'center',
  animation: 'fade',
  outlineColor: '#000000',
  outlineWidthPx: 0,
  shadow: false,
  highlightColor: '#ffd166',
  highlightWords: Object.freeze([]),
  presetId: null,
});

function assertHexColor(value, fieldName) {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`captionStyle: "${fieldName}" debe ser un color hex real "#RRGGBB" (recibido: ${value}).`);
  }
}

/**
 * Valida UNA entrada real de `highlightWords` -- acepta el formato viejo
 * (string simple, backward compatible byte-a-byte con el render anterior)
 * O el formato nuevo (objeto `{text, color?, fontWeight?, fontSizePx?,
 * backgroundColor?, animation?}`, Problema 3 "PALABRAS DESTACADAS": color,
 * peso, tamaño, background, animación por palabra).
 */
function assertValidHighlightWordEntry(entry, index) {
  const isObj = typeof entry === 'object' && entry !== null;
  if (typeof entry !== 'string' && !isObj) {
    throw new Error(`captionStyle: "highlightWords[${index}]" debe ser un string o un objeto real {text, ...} (recibido: ${typeof entry}).`);
  }
  const texto = isObj ? entry.text : entry;
  if (!texto?.trim?.()) throw new Error(`captionStyle: "highlightWords[${index}]" requiere un "text" real no vacío.`);
  if (!isObj) return;
  if (entry.color !== undefined) assertHexColor(entry.color, `highlightWords[${index}].color`);
  if (entry.backgroundColor !== undefined) assertHexColor(entry.backgroundColor, `highlightWords[${index}].backgroundColor`);
  if (entry.fontWeight !== undefined && (!Number.isFinite(entry.fontWeight) || entry.fontWeight <= 0)) {
    throw new Error(`captionStyle: "highlightWords[${index}].fontWeight" debe ser un número real > 0.`);
  }
  if (entry.fontSizePx !== undefined && (!Number.isFinite(entry.fontSizePx) || entry.fontSizePx <= 0)) {
    throw new Error(`captionStyle: "highlightWords[${index}].fontSizePx" debe ser un número real > 0.`);
  }
  if (entry.animation !== undefined && !CAPTION_ANIMATIONS.includes(entry.animation)) {
    throw new Error(`captionStyle: "highlightWords[${index}].animation" inválida "${entry.animation}" (válidas: ${CAPTION_ANIMATIONS.join(', ')}).`);
  }
}

/** Combina un override real del usuario sobre DEFAULT_CAPTION_STYLE, validando cada campo -- nunca acepta un estilo real inválido en silencio. */
export function mergeCaptionStyle(override = {}) {
  const merged = { ...DEFAULT_CAPTION_STYLE, ...override, highlightWords: override.highlightWords ?? DEFAULT_CAPTION_STYLE.highlightWords };
  if (!CAPTION_POSITIONS.includes(merged.position)) throw new Error(`captionStyle: "position" inválida "${merged.position}" (válidas: ${CAPTION_POSITIONS.join(', ')}).`);
  if (!CAPTION_ALIGNMENTS.includes(merged.alignment)) throw new Error(`captionStyle: "alignment" inválida "${merged.alignment}" (válidas: ${CAPTION_ALIGNMENTS.join(', ')}).`);
  if (!CAPTION_ANIMATIONS.includes(merged.animation)) throw new Error(`captionStyle: "animation" inválida "${merged.animation}" (válidas: ${CAPTION_ANIMATIONS.join(', ')}).`);
  if (!Number.isFinite(merged.fontSizePx) || merged.fontSizePx <= 0) throw new Error('captionStyle: "fontSizePx" debe ser un número real > 0.');
  if (!Number.isFinite(merged.fontWeight) || merged.fontWeight <= 0) throw new Error('captionStyle: "fontWeight" debe ser un número real > 0.');
  if (!Number.isFinite(merged.backgroundOpacity) || merged.backgroundOpacity < 0 || merged.backgroundOpacity > 1) throw new Error('captionStyle: "backgroundOpacity" debe estar entre 0 y 1.');
  if (!Number.isFinite(merged.outlineWidthPx) || merged.outlineWidthPx < 0) throw new Error('captionStyle: "outlineWidthPx" debe ser un número real >= 0.');
  if (typeof merged.shadow !== 'boolean') throw new Error('captionStyle: "shadow" debe ser boolean.');
  if (merged.presetId !== null && typeof merged.presetId !== 'string') throw new Error('captionStyle: "presetId" debe ser un string real o null.');
  if (!Array.isArray(merged.highlightWords)) throw new Error('captionStyle: "highlightWords" debe ser un arreglo real de strings u objetos.');
  merged.highlightWords.forEach((entry, i) => assertValidHighlightWordEntry(entry, i));
  assertHexColor(merged.textColor, 'textColor');
  assertHexColor(merged.backgroundColor, 'backgroundColor');
  assertHexColor(merged.outlineColor, 'outlineColor');
  assertHexColor(merged.highlightColor, 'highlightColor');
  return Object.freeze(merged);
}

// ---------------------------------------------------------------------
// Caption Presets (Problema 3 "CAPTION PRESETS") -- configuraciones reales
// del MISMO captionStyle (nunca un renderizador paralelo). El usuario
// selecciona un preset, lo puede modificar, y el resultado (con
// `presetId` conservado como metadata) se guarda en el proyecto.

export const CAPTION_PRESET_NAMES = Object.freeze(['CLASSIC', 'BOLD', 'MINIMAL', 'HIGHLIGHT', 'SOCIAL_DYNAMIC']);

const CAPTION_PRESET_STYLES = Object.freeze({
  CLASSIC: Object.freeze({}), // = DEFAULT_CAPTION_STYLE tal cual.
  BOLD: Object.freeze({
    fontSizePx: 52, fontWeight: 800, outlineColor: '#000000', outlineWidthPx: 3,
    backgroundOpacity: 0, shadow: true, highlightColor: '#ffd166',
  }),
  MINIMAL: Object.freeze({
    fontSizePx: 32, fontWeight: 500, backgroundOpacity: 0, outlineWidthPx: 0, shadow: true,
  }),
  HIGHLIGHT: Object.freeze({
    fontSizePx: 42, fontWeight: 700, backgroundOpacity: 0.55, highlightColor: '#00e5ff',
  }),
  SOCIAL_DYNAMIC: Object.freeze({
    fontSizePx: 46, fontWeight: 800, position: 'center', animation: 'pop',
    backgroundOpacity: 0, outlineColor: '#000000', outlineWidthPx: 2, highlightColor: '#ff5876',
  }),
});

/** Resuelve un preset real (Classic/Bold/Minimal/Highlight/Social · Dynamic) + overrides adicionales del usuario sobre ese preset -- SIEMPRE pasa por mergeCaptionStyle(), nunca un renderizador paralelo. */
export function resolveCaptionPreset(presetName, overrides = {}) {
  if (!CAPTION_PRESET_NAMES.includes(presetName)) {
    throw new Error(`captionStyle: preset inválido "${presetName}" (válidos: ${CAPTION_PRESET_NAMES.join(', ')}).`);
  }
  return mergeCaptionStyle({ ...CAPTION_PRESET_STYLES[presetName], ...overrides, presetId: presetName });
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

const ALINEACION_CSS = Object.freeze({ left: 'left', center: 'center', right: 'right' });

/** CSS real (.caption-wrap/.caption-line) derivado de un captionStyle real ya validado (mergeCaptionStyle()). */
export function construirCssCaption(style) {
  const bg = hexToRgba(style.backgroundColor, style.backgroundOpacity);
  const outline = style.outlineWidthPx > 0 ? `-webkit-text-stroke: ${style.outlineWidthPx}px ${style.outlineColor}; paint-order: stroke fill;` : '';
  const shadow = style.shadow ? 'text-shadow: 0 2px 8px rgba(0,0,0,0.65);' : '';
  const animacionesResaltado = new Set((style.highlightWords ?? []).map((e) => (typeof e === 'object' && e?.animation) || null).filter(Boolean));
  const keyframesResaltado = animacionesResaltado.has('pop')
    ? '@keyframes hlAnimPop { 0% { transform: scale(0.7); opacity: 0.4; } 100% { transform: scale(1); opacity: 1; } }\n      .hl-anim-pop { display: inline-block; animation: hlAnimPop 0.35s ease; }'
    : '';
  return `.caption-wrap { position: absolute; ${POSICION_CSS[style.position]} left: 0; right: 0; display: flex; justify-content: center; z-index: 2; }
      .caption-line { color: ${style.textColor}; font-family: ${style.fontFamily}; font-size: ${style.fontSizePx}px; font-weight: ${style.fontWeight}; text-align: ${ALINEACION_CSS[style.alignment]}; max-width: 920px; background: ${bg}; padding: 14px 32px; border-radius: 16px; opacity: 0; ${outline} ${shadow} }
      .caption-line .hl { color: ${style.highlightColor}; font-weight: 800; }
      ${keyframesResaltado}`;
}

function construirEstiloInlineHighlight(entry) {
  const partes = [];
  if (entry.color) partes.push(`color:${entry.color}`);
  if (entry.fontWeight) partes.push(`font-weight:${entry.fontWeight}`);
  if (entry.fontSizePx) partes.push(`font-size:${entry.fontSizePx}px`);
  if (entry.backgroundColor) partes.push(`background:${entry.backgroundColor}`);
  return partes.join(';');
}

/**
 * Envuelve las palabras/frases reales de `highlightWords` en
 * `<span class="hl">` dentro de `texto` -- SIEMPRE escapa primero con
 * `escapeFn` (nunca inserta HTML no controlado que venga del texto real
 * del guion), y solo después envuelve el resaltado sobre el texto ya
 * escapado. Coincidencia case-insensitive, por substring simple (no por
 * límite de palabra) para soportar resaltar frases cortas reales.
 *
 * Acepta entradas string (formato viejo, byte-idéntico al HTML anterior:
 * SIN atributo `style` -- el color/peso vienen de la regla CSS `.hl`) o
 * entradas objeto `{text, color?, fontWeight?, fontSizePx?,
 * backgroundColor?, animation?}` (Problema 3, "PALABRAS DESTACADAS") --
 * solo estas últimas agregan un `style="..."` inline con las propiedades
 * explícitamente pedidas.
 */
export function resaltarPalabrasHtml(texto, highlightWords, escapeFn) {
  const safe = escapeFn(texto);
  if (!highlightWords?.length) return safe;
  let resultado = safe;
  for (const entry of highlightWords) {
    const isObj = typeof entry === 'object' && entry !== null;
    const palabraRaw = isObj ? entry.text : entry;
    if (!palabraRaw?.trim()) continue;
    const escapedPalabra = escapeFn(palabraRaw.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escapedPalabra) continue;
    const re = new RegExp(`(${escapedPalabra})`, 'gi');
    const claseAnimacion = isObj && entry.animation && entry.animation !== 'none' ? ` hl-anim-${entry.animation}` : '';
    const estiloInline = isObj ? construirEstiloInlineHighlight(entry) : '';
    const spanApertura = `<span class="hl${claseAnimacion}"${estiloInline ? ` style="${estiloInline}"` : ''}>`;
    resultado = resultado.replace(re, `${spanApertura}$1</span>`);
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

// ---------------------------------------------------------------------
// Problema 2 "HOOK Y CAPTIONS DUPLICADOS" + Auto Captions -- detección
// determinista real, SIN LLM/API/tokens: compara el Hook/On-Screen Text
// contra el inicio real del voiceover/narración de la escena, normalizando
// mayúsculas/minúsculas, puntuación, emojis, espacios y acentos.

/**
 * Normaliza un texto real para comparación determinista: minúsculas, sin
 * acentos (NFD + remueve diacríticos), sin puntuación/emojis/símbolos
 * (\p{L}/\p{N}/espacio son las únicas categorías que sobreviven), espacios
 * colapsados. Nunca usa un modelo -- es una normalización de texto pura.
 */
export function normalizeForComparison(text) {
  if (typeof text !== 'string') return '';
  return text
    .normalize('NFD') // separa acentos en marcas combinantes reales (ej. "según" -> "segu" + marca combinante + "n").
    .replace(COMBINING_DIACRITICAL_MARKS_RE, '') // las quita SIN espacio -- reemplazarlas por espacio partiría la palabra en dos (bug real: "según" != "segun" si se inserta un espacio ahí).
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // puntuación/emojis/símbolos reales -- estos sí se reemplazan por espacio (separan palabras de verdad).
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True si `hookText` (Hook/On-Screen Text) coincide sustancialmente con el
 * INICIO real de `narrationText` (voiceover/narración de la escena) --
 * criterio determinista y estable: tras normalizar ambos, uno es
 * exactamente el prefijo de palabras del otro. Se usa para decidir, en
 * modo AUTO, si los captions de esta escena duplicarían visualmente al
 * Hook ya mostrado en pantalla.
 */
export function isHookCaptionDuplicate(hookText, narrationText) {
  const normHook = normalizeForComparison(hookText);
  const normNarration = normalizeForComparison(narrationText);
  if (!normHook || !normNarration) return false;
  if (normHook === normNarration) return true;
  if (normNarration.startsWith(normHook) || normHook.startsWith(normNarration)) return true;
  const hookWords = normHook.split(' ').filter(Boolean);
  const narrationWords = normNarration.split(' ').filter(Boolean);
  const prefijoNarracion = narrationWords.slice(0, hookWords.length).join(' ');
  return prefijoNarracion === normHook;
}

/** Resuelve un valor crudo (posiblemente ausente -- backward compatibility con proyectos existentes) a un CAPTION_VISIBILITY_MODES real -- ausente/inválido siempre cae a 'AUTO', nunca lanza. */
export function resolveEffectiveCaptionsVisibility(rawValue) {
  return CAPTION_VISIBILITY_MODES.includes(rawValue) ? rawValue : 'AUTO';
}

/**
 * Decide si los captions de UNA escena real deben renderizarse -- REGLA
 * CREATIVA del Problema 2: SHOW/HIDE explícitos siempre ganan; en AUTO,
 * se ocultan solo si duplican al Hook/On-Screen Text ya visible (Problema
 * 2), y se muestran normalmente en cualquier otro caso.
 */
export function shouldRenderCaptions({ visibilityMode, onScreenText, narrationText }) {
  const mode = resolveEffectiveCaptionsVisibility(visibilityMode);
  if (mode === 'SHOW') return true;
  if (mode === 'HIDE') return false;
  return !isHookCaptionDuplicate(onScreenText, narrationText);
}

export { OVERLAY_POSICION_CSS };
