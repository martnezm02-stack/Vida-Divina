// videoScriptGenerator.js — Video Workspace, capa NUEVA y SEPARADA de
// hypothesisCopyProvider.js (Creative Copy). Auditoría "Video Workspace +
// Voice Engine" (2026-08-23), hallazgo real: el voiceover que llegaba a
// Voice Engine era una reutilización literal, sin transformar, de
// [hook, ...bodyLines] del ad copy -- sin target de duración, sin
// estructura propia de guion audiovisual. Este archivo NO reemplaza el
// copy, lo ADAPTA:
//
//   CREATIVE COPY (hypothesisCopyProvider.js, SIN TOCAR)
//     -> VIDEO SCRIPT (este archivo -- secciones con timing conceptual)
//     -> VOICEOVER TEXT (el texto real que se envía a Voice Engine --
//        editable por el usuario en el Dashboard; ver REGLA FUNDAMENTAL
//        más abajo)
//     -> ON-SCREEN TEXT (puede ser más corto que el voiceover)
//     -> CTA (campo separado, sin cambios)
//
// REGLA CENTRAL: nunca escribe copy nuevo ni inventa un Product Fact --
// reestructura EXCLUSIVAMENTE hook/bodyLines/cta ya generados y ya
// validados por Claim Safety (hypothesisCopyProvider.js), solo decide en
// qué ventana de tiempo cae cada fragmento y calcula una duración
// ESTIMADA (nunca medida -- la duración real solo se conoce después del
// render del audio real, ver leerInfoWav()). Los mismos guards de Claim
// Safety se re-aplican aquí como red de seguridad adicional (defensa en
// profundidad, mismo patrón ya usado en contentOrchestrator.js y
// hyperframesRenderer.js), NUNCA como el único mecanismo.
//
// REGLA FUNDAMENTAL (auditoría, Parte 1): el texto que este módulo
// produce es solo el punto de PARTIDA ("GENERATED"). Si el usuario lo
// edita en el Dashboard, el texto editado ("USER_EDITED") es la única
// fuente de verdad para Voice Engine -- este archivo nunca reconstruye
// ni sobrescribe un voiceover ya editado; esa garantía vive en
// dashboard/public/app.js (nunca vuelve a llamar a este generador
// después de que el usuario edita) y dashboard/server/routes/generation.js
// (usa literalmente body.voiceoverText, nunca un campo derivado).

import { assertNoForbiddenProductClaims } from '../../video-production/src/hyperframesRenderer.js';
import { assertBrandAvoidCompliance } from './brandVisualSystem.js';

export const VIDEO_SCRIPT_SECTION_TYPES = Object.freeze(['HOOK', 'CONTEXT', 'PRODUCT_MECHANISM', 'GROUNDED_PRODUCT_FACT', 'CTA']);

export const STYLE_CATEGORIES = Object.freeze(['UGC_CONVERSATIONAL', 'EDUCATIONAL', 'DIRECT_RESPONSE', 'POV', 'STORYTELLING']);

export const DURATION_TARGET_SECONDS_BY_STYLE = Object.freeze({
  UGC_CONVERSATIONAL: Object.freeze({ min: 15, max: 25 }),
  EDUCATIONAL: Object.freeze({ min: 30, max: 45 }),
  DIRECT_RESPONSE: Object.freeze({ min: 20, max: 30 }),
  POV: Object.freeze({ min: 15, max: 25 }),
  STORYTELLING: Object.freeze({ min: 30, max: 60 }),
});

// Mapeo determinista del "format" real de VARIANT_BLUEPRINTS
// (creative-intelligence/src/marketingPlaybook.js, sin tocar) a la
// categoría de estilo de esta fase -- por format primero (más específico);
// copyStyle como respaldo para cualquier format futuro no listado aquí.
const STYLE_CATEGORY_BY_FORMAT = Object.freeze({
  'Native TikTok-style': 'UGC_CONVERSATIONAL',
  'Educational walk-and-talk': 'EDUCATIONAL',
  'POV personal story': 'POV',
  'Skit conversation': 'STORYTELLING',
});
const STYLE_CATEGORY_BY_COPY_STYLE = Object.freeze({
  UGC_CONVERSATIONAL: 'UGC_CONVERSATIONAL',
  EDUCATIONAL: 'EDUCATIONAL',
  STORYTELLING: 'STORYTELLING',
  POV: 'POV',
  LIFESTYLE: 'UGC_CONVERSATIONAL',
  DIRECT_RESPONSE: 'DIRECT_RESPONSE',
});

// Formatos sin pieza audiovisual real (mismo criterio que
// hypothesisCopyProvider.js#STATIC_FORMATS, sin duplicarlo -- se repite
// aquí literal porque ese archivo no lo exporta y no se debe tocar).
// Exportado (Corrección "Crear contenido" -- Media Type, 2026-08-28):
// generation.js#handleProposeDirectCreative necesita evitar blueprints
// estáticos cuando la pieza es de VIDEO -- fuente única real, en vez de
// una tercera copia del mismo arreglo literal.
export const STATIC_FORMATS = Object.freeze(['Static comparison frames']);

// section (CopyStructure real, hypothesisCopyProvider.js#sectionsUsed) -> tipo de sección de Video Script.
const SECTION_TYPE_BY_COPY_SECTION = Object.freeze({
  problem: 'CONTEXT',
  mechanism: 'PRODUCT_MECHANISM',
  productReveal: 'GROUNDED_PRODUCT_FACT',
});

// Ritmo de habla estimado en español neutro (~150 palabras/minuto), solo
// para calcular un rango objetivo ANTES de generar audio real -- nunca
// sustituye la duración medida del WAV real (leerInfoWav()), que sigue
// siendo la única fuente de verdad después de la generación.
export const WORDS_PER_SECOND_ESTIMATE = 2.5;

function contarPalabras(texto) {
  return String(texto ?? '').trim().split(/\s+/).filter(Boolean).length;
}

export function estimateDurationSeconds(text) {
  return +(contarPalabras(text) / WORDS_PER_SECOND_ESTIMATE).toFixed(1);
}

/** TOO_SHORT / WITHIN_TARGET / TOO_LONG -- informativo, nunca reescribe el texto (Parte 4 del encargo: "no sobrescribirlo"). */
export function classifyDuration(estimatedSeconds, targetRange) {
  if (estimatedSeconds < targetRange.min) return 'TOO_SHORT';
  if (estimatedSeconds > targetRange.max) return 'TOO_LONG';
  return 'WITHIN_TARGET';
}

/** Resuelve la categoría de estilo real -- por format primero, copyStyle como respaldo. Nunca inventa una categoría para un format/copyStyle desconocido: devuelve null (el llamador decide el default, nunca este módulo). */
export function resolveStyleCategory({ format, copyStyle }) {
  return STYLE_CATEGORY_BY_FORMAT[format] ?? STYLE_CATEGORY_BY_COPY_STYLE[copyStyle] ?? null;
}

/**
 * Reparte proporcionalmente (por número de palabras) un conjunto de
 * secciones tipadas sobre la duración ESTIMADA total -- mismo criterio ya
 * validado en video-production/src/hyperframesRenderer.js#distribuirSubtitulos
 * (no se importa de ahí para no acoplar Video Script, capa de
 * planificación, a HyperFrames, capa de render; la fórmula es la misma
 * "peso por palabras", sin lógica adicional).
 */
function allocateTiming(sections, totalDurationSeconds) {
  const pesos = sections.map((s) => contarPalabras(s.text));
  const totalPalabras = pesos.reduce((a, b) => a + b, 0) || 1;
  let cursor = 0;
  return sections.map((s, i) => {
    const dur = (pesos[i] / totalPalabras) * totalDurationSeconds;
    const seg = { ...s, startSeconds: +cursor.toFixed(2), durationSeconds: +dur.toFixed(2) };
    cursor += dur;
    return seg;
  });
}

/**
 * Construye el Video Script real de UNA variante ya generada por
 * hypothesisCopyProvider.js#generateVariantCopy() -- toma hook/bodyLines/
 * sectionsUsed/cta TAL CUAL (nunca los reescribe), los tipa por sección
 * (HOOK/CONTEXT/PRODUCT_MECHANISM/GROUNDED_PRODUCT_FACT/CTA), calcula un
 * target de duración por estilo/format y una duración estimada real (por
 * conteo de palabras), y arma el voiceoverText inicial (GENERATED --
 * punto de partida editable, ver REGLA FUNDAMENTAL arriba del archivo).
 *
 * @param {{hook:string, bodyLines:string[], sectionsUsed:Array<{section:string,sourceField:string}>, cta:string, format:string, copyStyle:string}} args
 * @returns {{applicable:boolean, styleCategory:?string, targetDurationRange:?{min:number,max:number}, sections:?object[], voiceoverText:?string, onScreenText:?{hook:string,body:string[],cta:string}, wordCount:?number, estimatedDurationSeconds:?number, durationStatus:?string}}
 */
export function buildVideoScript({ hook, bodyLines, sectionsUsed = [], cta, format, copyStyle }) {
  if (!hook?.trim()) throw new Error('buildVideoScript: "hook" es obligatorio.');
  if (!cta?.trim()) throw new Error('buildVideoScript: "cta" es obligatorio.');
  if (!Array.isArray(bodyLines)) throw new Error('buildVideoScript: "bodyLines" debe ser un arreglo (puede ser vacío, ej. awareness "Most Aware").');

  if (STATIC_FORMATS.includes(format)) {
    return Object.freeze({
      applicable: false, styleCategory: null, targetDurationRange: null, sections: null,
      voiceoverText: null, onScreenText: null, wordCount: null, estimatedDurationSeconds: null, durationStatus: null,
      reason: `Video Script no aplica: "${format}" es un formato estático (sin voiceover), mismo criterio que hypothesisCopyProvider.js#STATIC_FORMATS.`,
    });
  }

  const styleCategory = resolveStyleCategory({ format, copyStyle }) ?? 'UGC_CONVERSATIONAL';
  const targetDurationRange = DURATION_TARGET_SECONDS_BY_STYLE[styleCategory];

  const rawSections = [
    { type: 'HOOK', text: hook },
    ...bodyLines.map((text, i) => ({
      type: SECTION_TYPE_BY_COPY_SECTION[sectionsUsed[i]?.section] ?? 'GROUNDED_PRODUCT_FACT',
      text,
    })),
    { type: 'CTA', text: cta },
  ];

  const voiceoverText = [hook, ...bodyLines, cta].join(' ');
  // Defensa en profundidad (Parte 3 del encargo): el mismo texto ya pasó
  // estos guards dentro de generateVariantCopy() -- se re-aplican aquí
  // porque el Video Script es, a partir de este punto, un artefacto
  // propio (con timing/duración/target), no una simple copia del copy.
  assertNoForbiddenProductClaims(voiceoverText, 'buildVideoScript: voiceoverText');
  assertBrandAvoidCompliance(voiceoverText, 'buildVideoScript: voiceoverText');

  const wordCount = contarPalabras(voiceoverText);
  const estimatedDurationSeconds = estimateDurationSeconds(voiceoverText);
  const durationStatus = classifyDuration(estimatedDurationSeconds, targetDurationRange);
  const sections = allocateTiming(rawSections, estimatedDurationSeconds);

  return Object.freeze({
    applicable: true,
    styleCategory,
    targetDurationRange: Object.freeze({ ...targetDurationRange }),
    sections: Object.freeze(sections.map((s) => Object.freeze(s))),
    voiceoverText,
    onScreenText: Object.freeze({ hook, body: Object.freeze([...bodyLines]), cta }),
    wordCount,
    estimatedDurationSeconds,
    durationStatus,
  });
}

/**
 * Verifica un voiceoverText EDITADO por el usuario contra los mismos
 * guards de Claim Safety (Parte 3 del encargo: "aplicar los guards...
 * igual que al copy") -- se llama SIEMPRE antes de enviar cualquier
 * voiceoverText (generado o editado) a Voice Engine, para que un texto
 * editado por el usuario no pueda introducir un claim prohibido o
 * lenguaje BRAND_AVOID que el copy original nunca tuvo.
 */
export function assertVoiceoverTextSafe(voiceoverText, fieldName = 'voiceoverText') {
  assertNoForbiddenProductClaims(voiceoverText, fieldName);
  assertBrandAvoidCompliance(voiceoverText, fieldName);
  return true;
}
