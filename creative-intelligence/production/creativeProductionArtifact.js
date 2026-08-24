// creativeProductionArtifact.js — Creative Production Engine v1.
//
// FASE: "Creative Production Engine v1". Convierte un CREATIVE_CELL_CANDIDATE
// (provisional, ver docs de la fase anterior — NUNCA una CreativeCell real,
// porque no existe personaId/painId real) en un artefacto de producción
// estructurado y determinista: script, copy, CTA, dirección visual,
// variantes — listo para que una herramienta downstream (generación de
// imagen/video, todavía no implementada) lo consuma.
//
// REGLA CENTRAL: esta capa NO fabrica CreativeCell/Hypothesis/ProductionBrief
// reales (creativeCell.js/hypothesis.js/productionBrief.js no se tocan ni se
// llaman aquí con ids inventados) — todo artefacto de esta fase referencia un
// creativeCellCandidateId (string libre, ej. "CC-A1"), nunca un
// creativeCellId real. customerEvidenceRequired se declara explícitamente,
// nunca se oculta.
//
// Reutiliza sin duplicar: assertNoWinnerClaim (schemas/cycleOutput.schema.js
// — genérico, opera sobre cualquier objeto serializable) y
// assertNoComplianceRiskClaimReused (src/affiliatePipeline.js) para bloquear
// que un claim de riesgo observado en un afiliado se cuele como copy.

import { randomUUID } from 'node:crypto';
import { assertNoWinnerClaim } from '../schemas/cycleOutput.schema.js';
import { assertNoComplianceRiskClaimReused } from '../src/affiliatePipeline.js';

export const PRODUCTION_ARTIFACT_STATUS = 'DRAFT_FOR_REVIEW'; // fijo — nunca "APPROVED"/"PUBLISHED" desde este constructor.

// Objetivo comercial — deliberadamente más amplio que "education" (dado
// explícitamente en esta fase): education es un mecanismo posible dentro de
// un hook, nunca el objetivo comercial final de una pieza.
export const COMMERCIAL_OBJECTIVES = Object.freeze([
  'ATTENTION', 'INTEREST', 'DESIRE', 'WHATSAPP_CONVERSATION', 'LEAD_QUALIFICATION',
  'PRODUCT_CONSIDERATION', 'OBJECTION_HANDLING', 'SALE_INTENT', 'TRUST', 'RECRUITMENT',
]);

// Tipos de hook — vocabulario nuevo de esta fase (no existía en el proyecto);
// deliberadamente distinto de FORMAT_LIBRARY (src/format.js, formatos de
// ejecución) y de hookStructure de Affiliate Evidence (src/affiliatePipeline.js,
// vocabulario de OBSERVACIÓN, no de producción).
export const HOOK_TYPES = Object.freeze([
  'CONTRAST', 'QUESTION', 'CURIOSITY', 'PROBLEM_AWARENESS', 'EDUCATION',
  'SOCIAL_PROOF', 'DEMONSTRATION', 'STORY', 'DIRECT_RESPONSE',
]);

// Formato de entrega — vocabulario de esta fase, distinto de FORMAT_LIBRARY
// (que describe estilo de ejecución del Pillar 4, no formato de entrega).
export const DELIVERY_FORMATS = Object.freeze(['REEL', 'SHORT_VIDEO', 'IMAGE', 'CAROUSEL', 'STORY', 'SCREENSHOT_STYLE', 'OTHER']);

export const VARIANT_VARIABLES = Object.freeze(['HOOK', 'FORMAT', 'CTA', 'ANGLE', 'VISUAL', 'MECHANISM']);

export const RISK_LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);

// Métricas realmente observables después de publicar — nunca ventas/ROAS/CPA
// como métrica "principal" de una pieza sin probar (esas son resultados de
// negocio, no señales públicas observables directamente de la pieza).
export const PRODUCTION_METRICS = Object.freeze([
  '3_second_views', 'video_retention', 'watch_time', 'saves', 'shares', 'comments',
  'profile_visits', 'whatsapp_conversations', 'qualified_conversations', 'product_inquiries', 'leads', 'sales',
]);

export const BASELINE_NOT_ESTABLISHED = 'BASELINE_NOT_ESTABLISHED';

// Lenguaje de promesa absoluta prohibido en esta fase — distinto de
// WINNER/VALIDATED/PROVEN (eso es sobre RESULTADOS de una pieza ya
// publicada; esto es sobre el COPY mismo prometiendo un desenlace personal
// al lector, lo cual ninguna pieza de este sistema puede hacer todavía).
export const FORBIDDEN_PROMISE_LANGUAGE = /\b(garantizado|garantizada|te va a funcionar|vas a obtener resultados|resultados garantizados|funciona garantizado)\b/i;

// Exportado (no solo local) para que otros módulos de production/ (ej.
// visualProductionPackage.js) reutilicen el mismo guard sin duplicar la
// expresión regular ni su mensaje.
export function assertNoPromiseLanguage(text, fieldName) {
  if (typeof text !== 'string') return;
  const match = text.match(FORBIDDEN_PROMISE_LANGUAGE);
  if (match) {
    throw new Error(`ProductionArtifact: "${fieldName}" contiene lenguaje de promesa absoluta prohibido ("${match[0]}") — ninguna pieza puede afirmar que funcionará o que el resultado está garantizado antes de probarla.`);
  }
}

function assertNonEmptyString(value, fieldName) {
  if (!value?.trim()) throw new Error(`ProductionArtifact: "${fieldName}" es obligatorio.`);
}

function collectTextForCompliance(fields) {
  return fields.filter((v) => typeof v === 'string').join(' \n ');
}

/**
 * @param {object} args
 * @param {string} args.creativeCellCandidateId — ej. "CC-A1". NUNCA un creativeCellId real.
 * @param {string} args.concept
 * @param {string} args.commercialObjective — uno de COMMERCIAL_OBJECTIVES
 * @param {string} args.audienceState — texto libre, explícitamente NO un personaId/painId
 * @param {string} args.coreAngle
 * @param {{type:string, text:string, mechanism:string, inspiredByPattern:string, hypothesisNote:string}} args.hook
 * @param {string} args.format — uno de DELIVERY_FORMATS
 * @param {?{durationRangeSeconds:string, beats:Array<{beat:string, content:string}>}} args.script — null si el formato no es de video
 * @param {string} args.postCopy
 * @param {{primary:string, whatsapp:string}} args.cta
 * @param {{setting:string, visualMechanism:string, props:string[]}} args.visualDirection
 * @param {string[]} args.screenText
 * @param {{applicable:boolean, description:string}} args.staticVersion
 * @param {{applicable:boolean, description:string}} args.videoVersion
 * @param {string} args.whatsappVersion
 * @param {Array<{label:string, changedVariable:string, description:string}>} args.variants — mínimo 2 (A/B), cada una cambia UNA variable
 * @param {{riskLevel:string, riskReason:string}} args.complianceNotes
 * @param {string[]} args.riskyClaims — de collectComplianceRiskClaims(), para el guard anti-reuso
 * @param {string[]} args.evidenceBasis — Patterns/afiliado que inspiraron la pieza, o ['NONE_OBSERVED_EXPLORATORY']
 * @param {Array<{fact:string, source:string}>} args.productFactsUsed — source debe apuntar a docs/productos/
 * @param {string[]} args.productFactsRequired — hechos que faltan, nunca inventados
 * @param {string} args.hypothesisRef — ej. "H-01", referencia a la hipótesis preliminar ya construida
 * @param {string} args.primaryMetric — uno de PRODUCTION_METRICS
 * @param {{metric:string, threshold:string, description:string}} args.discardCriteria — threshold siempre BASELINE_NOT_ESTABLISHED por ahora
 * @param {boolean} args.customerEvidenceRequired
 */
export function createProductionArtifact({
  creativeCellCandidateId,
  concept,
  commercialObjective,
  audienceState,
  coreAngle,
  hook,
  format,
  script = null,
  postCopy,
  cta,
  visualDirection,
  screenText = [],
  staticVersion,
  videoVersion,
  whatsappVersion,
  variants,
  complianceNotes,
  riskyClaims,
  evidenceBasis,
  productFactsUsed = [],
  productFactsRequired = [],
  hypothesisRef,
  primaryMetric,
  discardCriteria,
  customerEvidenceRequired,
}) {
  assertNonEmptyString(creativeCellCandidateId, 'creativeCellCandidateId');
  assertNonEmptyString(concept, 'concept');
  if (!COMMERCIAL_OBJECTIVES.includes(commercialObjective)) {
    throw new Error(`ProductionArtifact: "commercialObjective" inválido "${commercialObjective}" (válidos: ${COMMERCIAL_OBJECTIVES.join(', ')}).`);
  }
  assertNonEmptyString(audienceState, 'audienceState');
  // audienceState es texto libre por diseño, no se valida contra un
  // vocabulario cerrado — la única regla real es que nunca puede tener forma
  // de personaId/painId real (ver más abajo).
  if (/^PERSONA-|^PAIN-|^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(audienceState)) {
    throw new Error('ProductionArtifact: "audienceState" no puede tener forma de personaId/painId real (ej. un UUID) — debe ser una descripción en texto libre, nunca una fabricación de Persona/Pain.');
  }
  assertNonEmptyString(coreAngle, 'coreAngle');

  if (!hook || !HOOK_TYPES.includes(hook.type)) {
    throw new Error(`ProductionArtifact: "hook.type" inválido "${hook?.type}" (válidos: ${HOOK_TYPES.join(', ')}).`);
  }
  assertNonEmptyString(hook.text, 'hook.text');
  assertNonEmptyString(hook.mechanism, 'hook.mechanism');
  assertNonEmptyString(hook.inspiredByPattern, 'hook.inspiredByPattern');
  assertNonEmptyString(hook.hypothesisNote, 'hook.hypothesisNote');

  if (!DELIVERY_FORMATS.includes(format)) {
    throw new Error(`ProductionArtifact: "format" inválido "${format}" (válidos: ${DELIVERY_FORMATS.join(', ')}).`);
  }
  assertNonEmptyString(postCopy, 'postCopy');
  if (!cta?.primary?.trim() || !cta?.whatsapp?.trim()) {
    throw new Error('ProductionArtifact: "cta.primary" y "cta.whatsapp" son obligatorios.');
  }
  if (!visualDirection?.setting?.trim() || !visualDirection?.visualMechanism?.trim()) {
    throw new Error('ProductionArtifact: "visualDirection.setting" y "visualDirection.visualMechanism" son obligatorios.');
  }
  if (!Array.isArray(screenText)) throw new Error('ProductionArtifact: "screenText" debe ser un arreglo.');
  if (!staticVersion || typeof staticVersion.applicable !== 'boolean' || !staticVersion.description?.trim()) {
    throw new Error('ProductionArtifact: "staticVersion" debe tener { applicable: boolean, description }.');
  }
  if (!videoVersion || typeof videoVersion.applicable !== 'boolean' || !videoVersion.description?.trim()) {
    throw new Error('ProductionArtifact: "videoVersion" debe tener { applicable: boolean, description }.');
  }
  assertNonEmptyString(whatsappVersion, 'whatsappVersion');

  if (!Array.isArray(variants) || variants.length < 2) {
    throw new Error('ProductionArtifact: "variants" debe tener al menos 2 variantes (A/B) — cada una cambiando UNA sola variable.');
  }
  for (const v of variants) {
    if (!v.label?.trim() || !VARIANT_VARIABLES.includes(v.changedVariable) || !v.description?.trim()) {
      throw new Error(`ProductionArtifact: cada variante requiere { label, changedVariable (uno de ${VARIANT_VARIABLES.join(', ')}), description }.`);
    }
  }

  if (!complianceNotes || !RISK_LEVELS.includes(complianceNotes.riskLevel) || !complianceNotes.riskReason?.trim()) {
    throw new Error(`ProductionArtifact: "complianceNotes" debe tener { riskLevel (${RISK_LEVELS.join('/')}), riskReason }.`);
  }
  if (!Array.isArray(riskyClaims)) {
    throw new Error('ProductionArtifact: "riskyClaims" debe ser el arreglo real de collectComplianceRiskClaims() (affiliatePipeline.js) — nunca omitido.');
  }

  if (!Array.isArray(evidenceBasis) || evidenceBasis.length === 0) {
    throw new Error('ProductionArtifact: "evidenceBasis" es obligatorio — al menos 1 referencia real, o [\'NONE_OBSERVED_EXPLORATORY\'] declarado explícitamente.');
  }
  if (!Array.isArray(productFactsUsed)) throw new Error('ProductionArtifact: "productFactsUsed" debe ser un arreglo.');
  for (const f of productFactsUsed) {
    if (!f.fact?.trim() || !f.source?.trim()) {
      throw new Error('ProductionArtifact: cada productFactsUsed requiere { fact, source } — source debe apuntar a docs/productos/, nunca quedar vacío.');
    }
  }
  if (!Array.isArray(productFactsRequired)) throw new Error('ProductionArtifact: "productFactsRequired" debe ser un arreglo.');

  assertNonEmptyString(hypothesisRef, 'hypothesisRef');

  if (!PRODUCTION_METRICS.includes(primaryMetric)) {
    throw new Error(`ProductionArtifact: "primaryMetric" inválido "${primaryMetric}" (válidos: ${PRODUCTION_METRICS.join(', ')}).`);
  }
  if (!discardCriteria?.metric?.trim() || !discardCriteria?.description?.trim()) {
    throw new Error('ProductionArtifact: "discardCriteria" debe tener { metric, threshold, description }.');
  }
  if (discardCriteria.threshold !== BASELINE_NOT_ESTABLISHED && typeof discardCriteria.threshold !== 'string') {
    throw new Error(`ProductionArtifact: "discardCriteria.threshold" debe ser "${BASELINE_NOT_ESTABLISHED}" salvo que exista un benchmark real documentado con fuente.`);
  }
  if (typeof customerEvidenceRequired !== 'boolean') {
    throw new Error('ProductionArtifact: "customerEvidenceRequired" es obligatorio (boolean) — debe quedar explícito, nunca implícito.');
  }

  // --- Guards de compliance, aplicados sobre TODO el texto generado ---
  const allText = collectTextForCompliance([
    hook.text, postCopy, cta.primary, cta.whatsapp, whatsappVersion,
    ...screenText, ...variants.map((v) => v.description),
    ...(script?.beats?.map((b) => b.content) ?? []),
  ]);
  assertNoComplianceRiskClaimReused({ text: allText, riskyClaims });
  assertNoPromiseLanguage(allText, 'contenido combinado (hook/copy/cta/variantes)');

  const artifact = Object.freeze({
    productionArtifactId: randomUUID(),
    status: PRODUCTION_ARTIFACT_STATUS,
    creativeCellCandidateId,
    concept,
    commercialObjective,
    audienceState,
    coreAngle,
    hook: Object.freeze({ ...hook }),
    format,
    script: script ? Object.freeze({ durationRangeSeconds: script.durationRangeSeconds, beats: Object.freeze(script.beats.map((b) => Object.freeze({ ...b }))) }) : null,
    postCopy,
    cta: Object.freeze({ ...cta }),
    visualDirection: Object.freeze({ ...visualDirection, props: Object.freeze([...(visualDirection.props ?? [])]) }),
    screenText: Object.freeze([...screenText]),
    staticVersion: Object.freeze({ ...staticVersion }),
    videoVersion: Object.freeze({ ...videoVersion }),
    whatsappVersion,
    variants: Object.freeze(variants.map((v) => Object.freeze({ ...v }))),
    complianceNotes: Object.freeze({ ...complianceNotes }),
    evidenceBasis: Object.freeze([...evidenceBasis]),
    productFactsUsed: Object.freeze(productFactsUsed.map((f) => Object.freeze({ ...f }))),
    productFactsRequired: Object.freeze([...productFactsRequired]),
    hypothesisRef,
    primaryMetric,
    discardCriteria: Object.freeze({ ...discardCriteria }),
    customerEvidenceRequired,
    createdAt: new Date().toISOString(),
  });

  assertNoWinnerClaim(artifact); // reutilizado sin modificar (schemas/cycleOutput.schema.js) — genérico sobre cualquier objeto.
  return artifact;
}

/**
 * Revalida un artefacto ya construido (ej. leído de disco). "riskyClaims" se
 * exige explícitamente en cada llamada — nunca se asume vacío por defecto,
 * porque un default silencioso desactivaría el guard de compliance en
 * cualquier revalidación futura.
 */
export function validateProductionArtifact(artifact, riskyClaims) {
  if (!Array.isArray(riskyClaims)) {
    throw new Error('validateProductionArtifact: "riskyClaims" es obligatorio (ver collectComplianceRiskClaims) — nunca se asume vacío por defecto.');
  }
  createProductionArtifact({ ...artifact, riskyClaims });
  return true;
}
