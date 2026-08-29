// creativeVariantDiversity.js — Corrección "Cierre del Creative Director"
// (2026-08-28, Paso 25/26 del encargo). Score determinista real de
// diversidad SEMÁNTICA entre un conjunto real de variantes ya construidas
// (nunca genera nada -- solo mide lo que ya existe).

function limpiar(t) { return String(t ?? '').toLowerCase().trim(); }
function normalizeHook(t) { return limpiar(t).replace(/[¿?¡!.,]/g, '').replace(/\s+/g, ' ').trim(); }

function distinctRatio(values) {
  const reales = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (reales.length === 0) return 0;
  return new Set(reales).size / reales.length;
}

/** Firma real determinista de los claims CORE de una variante (orden real preservado -- el orden ya refleja relevancia real, ver claimRelevance.js) -- nunca inventa un claim, solo compara los reales ya elegidos. */
function claimSignature(relevantClaims) {
  const core = relevantClaims?.core ?? [];
  if (core.length === 0) return null;
  return core.map((c) => limpiar(c)).join('|');
}

/**
 * @param {{primaryAngle:{id:string}, hookType:{id:string}, hook:string, structureId:?string, visualTreatment:?string, relevantClaims:?{core:string[]}}[]} variants
 * @returns {{diversityScore:number, distinctHooks:number, distinctHookTypes:number, distinctAngles:number, distinctStructures:number, distinctTreatments:number, distinctClaims:number, exactDuplicateHooks:number}}
 */
export function computeDiversityScore(variants) {
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error('computeDiversityScore: "variants" debe ser un arreglo real no vacío.');
  }
  if (variants.length === 1) {
    return Object.freeze({
      diversityScore: 1, distinctHooks: 1, distinctHookTypes: 1, distinctAngles: 1, distinctStructures: 1, distinctTreatments: 1, distinctClaims: 1, exactDuplicateHooks: 0,
    });
  }

  const hooksNormalizados = variants.map((v) => normalizeHook(v.hook));
  const hookTypes = variants.map((v) => v.hookType?.id ?? null);
  const angles = variants.map((v) => v.primaryAngle?.id ?? null);
  const structures = variants.map((v) => v.structureId ?? null);
  const treatments = variants.map((v) => v.visualTreatment ?? null);
  const claims = variants.map((v) => claimSignature(v.relevantClaims));

  const hookRatio = distinctRatio(hooksNormalizados);
  const hookTypeRatio = distinctRatio(hookTypes);
  const angleRatio = distinctRatio(angles);
  const structureRatio = distinctRatio(structures);
  const treatmentRatio = distinctRatio(treatments);
  const claimRatio = distinctRatio(claims);

  const conteoHooks = hooksNormalizados.reduce((acc, h) => acc.set(h, (acc.get(h) ?? 0) + 1), new Map());
  const exactDuplicateHooks = [...conteoHooks.values()].reduce((acc, n) => acc + Math.max(0, n - 1), 0);

  // Ponderación real (Corrección "Refinamiento creativo", 2026-08-28, Paso
  // 24/25 del encargo): structure+claims ahora pesan tanto como hook+angle
  // -- "no considerar 'solo cambió el hook' como alta diversidad" (Paso 25).
  // hook/hookType siguen aportando, pero ya NO pueden por sí solos empujar
  // el score real por encima de una estructura/claims real idénticos entre
  // las 5 variantes (root cause real del Problema 2 del encargo).
  const diversityScore = Math.max(0, Math.min(1,
    (0.20 * hookRatio) + (0.15 * hookTypeRatio) + (0.20 * angleRatio) + (0.20 * structureRatio) + (0.15 * claimRatio) + (0.10 * treatmentRatio),
  ));

  return Object.freeze({
    diversityScore,
    distinctHooks: new Set(hooksNormalizados).size,
    distinctHookTypes: new Set(hookTypes.filter(Boolean)).size,
    distinctAngles: new Set(angles.filter(Boolean)).size,
    distinctStructures: new Set(structures.filter(Boolean)).size,
    distinctTreatments: new Set(treatments.filter(Boolean)).size,
    distinctClaims: new Set(claims.filter(Boolean)).size,
    exactDuplicateHooks,
  });
}
