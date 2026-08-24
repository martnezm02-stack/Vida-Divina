// productionBrief.js — Pillar 5, Prompt 10 (Production-Ready Concept Brief
// Generator).
//
// FRAMEWORK ORIGINAL: header (persona × pain × awareness × format), hook
// direction (3-second opening ÚNICAMENTE), body (mechanism entry,
// credibility anchor timing, product reveal timing), visual (wardrobe,
// setting, lighting, props), casting (creator type, age range, energy),
// además runtime target, success metrics, kill criteria. Debe ser
// suficientemente específico para que creator + editor produzcan sin otra
// llamada estratégica.
//
// Regla no negociable (dada en esta fase): "No inventar métricas
// universales. Si no existe un benchmark real de Vida Divina, marcarlo
// como NOT_ESTABLISHED." successMetrics y killCriteria SOLO aceptan el
// sentinel 'NOT_ESTABLISHED' o un objeto estructurado con fuente explícita
// — nunca un número desnudo sin origen.

import { randomUUID } from 'node:crypto';

export const NOT_ESTABLISHED = 'NOT_ESTABLISHED';

function assertMetricField(value, fieldName) {
  if (value === NOT_ESTABLISHED) return;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (!value.source?.trim()) {
      throw new Error(`ProductionBrief: "${fieldName}" tiene un valor estructurado pero le falta "source" — nunca se presenta un benchmark sin de dónde viene.`);
    }
    return;
  }
  throw new Error(`ProductionBrief: "${fieldName}" debe ser el sentinel "${NOT_ESTABLISHED}" o un objeto { ..., source } — nunca un valor inventado sin marcar.`);
}

export function createProductionBrief({
  creativeCellId,
  persona,
  pain,
  awareness,
  angle,
  format,
  hookDirection,
  mechanismEntry,
  credibilityAnchorTiming,
  productRevealTiming,
  narrator,
  casting,
  setting,
  lighting,
  props = [],
  runtime,
  successMetrics = NOT_ESTABLISHED,
  killCriteria = NOT_ESTABLISHED,
}) {
  if (!creativeCellId) throw new Error('ProductionBrief: "creativeCellId" es obligatorio — todo brief nace de una CreativeCell (nunca se genera un anuncio sin una hipótesis estratégica detrás).');
  if (!persona?.trim() || !pain?.trim() || !awareness?.trim() || !format?.trim()) {
    throw new Error('ProductionBrief: el header (persona × pain × awareness × format) es obligatorio completo (Prompt 10).');
  }
  if (!hookDirection?.trim()) throw new Error('ProductionBrief: "hookDirection" es obligatorio — dirección de apertura de 3 segundos únicamente, nunca el guion completo.');
  if (!mechanismEntry?.trim()) throw new Error('ProductionBrief: "mechanismEntry" es obligatorio.');
  if (!credibilityAnchorTiming?.trim()) throw new Error('ProductionBrief: "credibilityAnchorTiming" es obligatorio.');
  if (!productRevealTiming?.trim()) throw new Error('ProductionBrief: "productRevealTiming" es obligatorio.');
  if (!narrator?.trim()) throw new Error('ProductionBrief: "narrator" (creator type) es obligatorio.');
  if (!setting?.trim()) throw new Error('ProductionBrief: "setting" es obligatorio.');
  if (!runtime?.trim()) throw new Error('ProductionBrief: "runtime" (target) es obligatorio.');

  assertMetricField(successMetrics, 'successMetrics');
  assertMetricField(killCriteria, 'killCriteria');

  return Object.freeze({
    productionBriefId: randomUUID(),
    creativeCellId,
    header: Object.freeze({ persona, pain, awareness, angle: angle ?? null, format }),
    hookDirection,
    mechanismEntry,
    credibilityAnchorTiming,
    productRevealTiming,
    visual: Object.freeze({ setting, lighting: lighting ?? null, props: Object.freeze([...props]) }),
    casting: Object.freeze({ narrator, ...(casting ?? {}) }),
    runtime,
    successMetrics,
    killCriteria,
    createdAt: new Date().toISOString(),
  });
}

export function validateProductionBrief(brief) {
  createProductionBrief({
    ...brief,
    persona: brief?.header?.persona,
    pain: brief?.header?.pain,
    awareness: brief?.header?.awareness,
    angle: brief?.header?.angle,
    format: brief?.header?.format,
    narrator: brief?.casting?.narrator,
    casting: brief?.casting,
    setting: brief?.visual?.setting,
    lighting: brief?.visual?.lighting,
    props: brief?.visual?.props,
  });
  return true;
}
