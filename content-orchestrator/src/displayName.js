// displayName.js — Corrección "Flujo creativo integral" (2026-08-28, Paso
// 17/18 del encargo). Nombre humano real para un video producido --
// "[Producto] — [Concepto] — [Formato] — v[versión]" -- SOLO a partir de
// datos reales ya conocidos del proyecto (nombreVisible/nombreComercial
// real, conceptId/angleId real ya elegido por el copy, outputProfileName
// real, versionNumber real). Nunca inventa un nombre -- si falta un dato
// real, ese segmento se omite (nunca un placeholder falso).
//
// UUID/productionJobId/assetId/storagePath siguen existiendo tal cual en
// todos lados (Paso 18: "el nombre técnico puede permanecer en Detalles
// técnicos") -- este módulo NUNCA los reemplaza, solo añade un campo
// nuevo (displayName/displayFilename) al lado.

const OUTPUT_PROFILE_LABELS = Object.freeze({
  INSTAGRAM_REEL: 'Instagram Reel',
  INSTAGRAM_FEED: 'Instagram Feed',
  INSTAGRAM_STORY: 'Instagram Story',
  TIKTOK: 'TikTok',
  GENERIC_VERTICAL: 'Vertical',
});

function humanizeOutputProfile(profileName) {
  return OUTPUT_PROFILE_LABELS[profileName] ?? String(profileName ?? '').replace(/_/g, ' ');
}

// conceptId/angleId real (hypothesisCreativeEngine.js, ej. "problem_agitation",
// "comparison") -- humanizado por formato, nunca reinterpretado ni inventado.
function humanizeConceptId(conceptId) {
  if (!conceptId) return null;
  return String(conceptId)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function sanitizeForFilename(texto) {
  // Caracteres reales inválidos en nombres de archivo de Windows -- nunca
  // se inventa un reemplazo "creativo", solo se retiran.
  return String(texto ?? '').replace(/[\\/:*?"<>|]/g, '').trim();
}

/**
 * @param {{nombreVisible?:?string, nombreComercial?:?string, conceptId?:?string, angleId?:?string, outputProfileName?:?string, versionNumber?:?number}} args
 * @returns {{displayName:string, displayFilename:string}}
 */
export function buildDisplayName({
  nombreVisible = null, nombreComercial = null, conceptId = null, angleId = null,
  outputProfileName = null, versionNumber = 1,
}) {
  const producto = nombreVisible ?? nombreComercial ?? null;
  const concepto = humanizeConceptId(conceptId ?? angleId);
  const formato = outputProfileName ? humanizeOutputProfile(outputProfileName) : null;
  const version = Number.isInteger(versionNumber) && versionNumber > 0 ? `v${versionNumber}` : null;

  const segmentos = [producto, concepto, formato, version].filter((s) => s && String(s).trim().length > 0);
  const displayName = segmentos.length > 0 ? segmentos.join(' — ') : null;

  return Object.freeze({
    displayName,
    displayFilename: displayName ? `${sanitizeForFilename(displayName)}.mp4` : null,
  });
}
