// hypothesisCreativeEngine.js — Fase 16 (integración inicial) + Fase de
// Creative Quality (integración de copyStyle/ctaStrategy/scrollStoppingPattern
// + pain reframing + Creative Quality Gate). Orquestador delgado y ÚNICO
// entre Product-Grounded Evidence + Marketing Creative Playbook +
// Hypothesis Testing real + generación de copy por variante + Creative
// Quality QA + dirección visual por variante.
//
// REGLA CENTRAL (Fase 16, Parte 5): tanto autonomousCreate.js (Crear
// Autónomo) como generation.js (Crear Contenido -> "Sugerir variantes")
// llaman a ESTE MISMO módulo -- no existen dos motores de hipótesis.
//
// NUNCA reimplementa:
//   - createPersonaHypothesis/createPainHypothesis/createCreativeVariant/
//     createExperiment (creative-intelligence/src/hypothesisTesting.js);
//   - buildProductGroundedEvidence (productGroundedEvidence.js);
//   - la validación de diversidad estructural entre variantes (createExperiment);
//   - la generación de copy en sí (delegada a hypothesisCopyProvider.js);
//   - Claim Safety (assertNoForbiddenProductClaims/assertBrandAvoidCompliance,
//     ejecutados dentro de hypothesisCopyProvider.js, sin cambios);
//   - Creative Quality QA (delegada a creativeQualityGate.js).
//
// FLUJO REAL (Fase de Creative Quality, Fase 12 del encargo):
//   buildHypothesisExperiment()
//     -> generate variants (persona/pain hipótesis + CreativeVariant real)
//     -> generate copy (hypothesisCopyProvider.js)
//     -> Claim Safety (dentro del paso anterior, sin cambios)
//     -> Creative Quality Gate (creativeQualityGate.js, por variante)
//     -> Visual Direction (marketingPlaybook.js + SCROLL_STOPPING_PATTERNS)
//     -> createExperiment()
//     -> Experiment Quality Gate (CTA diversity, a nivel de experimento completo)
//
// Si una variante falla un check BLOQUEANTE del gate (issues, no
// warnings): esta fase NO regenera automáticamente con otra estrategia
// (evitar sobre-ingeniería -- Fase 20 del encargo) -- en su lugar,
// buildHypothesisExperiment() lanza un error explícito, listando qué
// variante y por qué. Nunca se devuelve silenciosamente un experimento con
// una variante de baja calidad como si fuera válida.

import {
  createPersonaHypothesis, createPainHypothesis, createCreativeVariant, createExperiment,
} from '../../creative-intelligence/src/hypothesisTesting.js';
import {
  selectVariantBlueprints, PERSONA_FRAMINGS, assertValidPersonaFraming,
  buildAngleText, buildMechanismStatement, buildMarketingPrincipleBasisEntry,
  VISUAL_STYLES, assertValidVisualStyle, SCROLL_STOPPING_PATTERNS, assertValidScrollStoppingPattern,
} from '../../creative-intelligence/src/marketingPlaybook.js';
import { generateVariantCopy } from './hypothesisCopyProvider.js';
import { runCreativeQualityGate, runExperimentQualityGate } from './creativeQualityGate.js';
import { deriveBrandSceneColors, assertBrandAvoidCompliance } from './brandVisualSystem.js';

export const HYPOTHESIS_ENGINE_STATUSES = Object.freeze(['HYPOTHESIS_EXPERIMENT_READY', 'HYPOTHESIS_TESTING_NOT_VIABLE']);

export const DEFAULT_VARIANT_COUNT = 3;
const MIN_VARIANT_COUNT = 3;
const MAX_VARIANT_COUNT = 5;

const FIELD_PROBLEMA = 'Problema que ayuda a resolver';
const FIELD_BENEFICIOS = 'Beneficios';
const FIELD_INGREDIENTES = 'Ingredientes principales';

const ASPECT_RATIO_BY_FORMAT = Object.freeze({ 'Static comparison frames': '4:5 FEED' });
const DEFAULT_ASPECT_RATIO = '9:16 REEL / SHORT_VIDEO';

function extractField(productGroundedEvidence, fieldName) {
  return productGroundedEvidence.sourceEvidence.find((e) => e.field === fieldName)?.value ?? null;
}

/** Extrae SOLO los campos reales necesarios para hipótesis, desde un Product-Grounded Evidence YA construido (productGroundedEvidence.js) -- nunca vuelve a leer docs/productos/. */
export function extractGroundedFacts(productGroundedEvidence) {
  if (!productGroundedEvidence) throw new Error('extractGroundedFacts: "productGroundedEvidence" es obligatorio.');
  return Object.freeze({
    nombreComercial: productGroundedEvidence.nombreComercial,
    problema: extractField(productGroundedEvidence, FIELD_PROBLEMA),
    beneficios: extractField(productGroundedEvidence, FIELD_BENEFICIOS),
    ingredientes: extractField(productGroundedEvidence, FIELD_INGREDIENTES),
  });
}

/**
 * Condiciones mínimas reales para construir una hipótesis grounded (Fase
 * 16, Parte 3): al menos "problema" o "beneficios" reales documentados.
 * Sin esto, ni siquiera hay insumo real para basis/painPoint -- se
 * mantiene MISSING_CREATIVE_MATCH (nunca se inventa lo que falta).
 */
export function isHypothesisTestingViable(productGroundedEvidence) {
  if (!productGroundedEvidence) return false;
  const facts = extractGroundedFacts(productGroundedEvidence);
  return Boolean(facts.problema?.trim() || facts.beneficios?.trim());
}

function aspectRatioForFormat(format) {
  return ASPECT_RATIO_BY_FORMAT[format] ?? DEFAULT_ASPECT_RATIO;
}

/**
 * Dirección visual real de la variante -- combina VISUAL_STYLES (estilo de
 * escena/cámara/luz/movimiento/overlay) con SCROLL_STOPPING_PATTERNS
 * (firstFrame + por qué detiene el scroll), ambos de marketingPlaybook.js.
 * Prepara datos, NUNCA llama a ningún ImageProvider ni genera nada (Fase
 * 16 Parte 16/17; Fase de Creative Quality Parte 9/16).
 */
function buildVisualDirection(blueprint, facts) {
  assertValidVisualStyle(blueprint.visualStyle);
  assertValidScrollStoppingPattern(blueprint.scrollStoppingPattern);
  const style = VISUAL_STYLES[blueprint.visualStyle];
  const pattern = Object.values(SCROLL_STOPPING_PATTERNS).find((p) => p.id === blueprint.scrollStoppingPattern);
  assertBrandAvoidCompliance(style.sceneDescription, `hypothesisCreativeEngine: visualStyle "${blueprint.visualStyle}"`);
  assertBrandAvoidCompliance(pattern.firstFrame, `hypothesisCreativeEngine: scrollStoppingPattern "${blueprint.scrollStoppingPattern}"`);

  return Object.freeze({
    sceneDescription: style.sceneDescription,
    subjectDescription: `${facts.nombreComercial}, producto real, empaque sin alterar.`,
    productPlacement: `${facts.nombreComercial} visible en primer plano, empaque real, sin modificar etiqueta ni logo.`,
    cameraDirection: style.cameraDirection,
    lightingDirection: style.lightingDirection,
    motionDirection: style.motionDirection,
    textOverlayStyle: style.textOverlayStyle,
    firstFrame: pattern.firstFrame,
    visualHook: pattern.visualHook,
    aspectRatio: aspectRatioForFormat(blueprint.format),
    format: blueprint.format,
    brandSceneColors: deriveBrandSceneColors(),
  });
}

/**
 * Construye UNA variante completa (persona hipótesis + pain hipótesis +
 * CreativeVariant real + copy + Creative Quality Gate + visual direction)
 * a partir de UN blueprint real.
 */
function buildVariant(blueprint, productBasis, facts) {
  assertValidPersonaFraming(blueprint.personaFraming);
  const framing = PERSONA_FRAMINGS[blueprint.personaFraming];
  const marketingPrincipleEntry = buildMarketingPrincipleBasisEntry(blueprint.angle, {
    personaFramingLabel: framing.label,
    factFragment: facts.problema ?? facts.beneficios,
  });
  const variantBasis = Object.freeze([...productBasis, marketingPrincipleEntry]);

  const personaHypothesis = createPersonaHypothesis({
    name: framing.buildName(),
    lifeSituation: framing.buildLifeSituation(facts.problema ?? facts.beneficios),
    relationshipToProblem: framing.buildRelationship(),
    basis: variantBasis,
  });

  // Pain reframing (Fase de Creative Quality, Parte 6): el mismo Product
  // Fact real, reencuadrado con énfasis distinto por variante -- nunca
  // idéntico entre variantes como antes (root cause real confirmado en el
  // benchmark de Ripped). Sigue siendo HIPÓTESIS, grounded en
  // PRODUCT_FACT + MARKETING_PRINCIPLE, nunca en Customer Evidence.
  const painFragmentFull = framing.buildPainFragment(facts);
  const painHypothesis = createPainHypothesis({
    personaHypothesisId: personaHypothesis.personaHypothesisId,
    painPoint: `Hipótesis: podría importar ${painFragmentFull}.`,
    basis: variantBasis,
  });

  // El hook publicitario usa el fragmento CORTO de encuadre
  // (painHookFragment), nunca el painPoint completo -- ver
  // hypothesisCopyProvider.js para el porqué (evita hooks largos/con
  // comillas anidadas, root cause real corregido).
  const painHookFragment = framing.buildPainHookFragment();
  const copy = generateVariantCopy({ blueprint, painHookFragment, facts });

  const creativeVariant = createCreativeVariant({
    personaHypothesisId: personaHypothesis.personaHypothesisId,
    painHypothesisId: painHypothesis.painHypothesisId,
    awareness: blueprint.awareness,
    angleText: buildAngleText(blueprint.angle, facts),
    hook: copy.hook,
    format: blueprint.format,
    mechanism: buildMechanismStatement(facts),
  });

  // Creative Quality Gate (Fase de Creative Quality, Parte 10/11) --
  // DESPUÉS de Claim Safety (ya ejecutado dentro de generateVariantCopy()).
  // Nunca genera contenido, solo analiza/puntúa/reporta.
  const qualityGate = runCreativeQualityGate({
    hook: copy.hook,
    primaryText: copy.primaryText,
    cta: copy.cta,
    bodyLines: copy.bodyLines,
    sectionsUsed: copy.sectionsUsed,
    facts,
  });

  const visualDirection = buildVisualDirection(blueprint, facts);

  return Object.freeze({
    blueprintId: blueprint.id, personaHypothesis, painHypothesis, creativeVariant, copy, visualDirection, qualityGate,
    copyStyle: blueprint.copyStyle, ctaStrategy: blueprint.ctaStrategy, scrollStoppingPattern: blueprint.scrollStoppingPattern,
  });
}

/**
 * Punto de entrada único del motor (Fase 16, Parte 5/6/9/10/11; Fase de
 * Creative Quality Parte 12).
 *
 * @param {{productGroundedEvidence: object, variantCount?: number}} args
 * @returns {{status: 'HYPOTHESIS_EXPERIMENT_READY', product: object, experiment: object, variantsDetail: object[], experimentQualityGate: object, disclaimer: string} |
 *           {status: 'HYPOTHESIS_TESTING_NOT_VIABLE', reason: string}}
 */
export function buildHypothesisExperiment({ productGroundedEvidence, variantCount = DEFAULT_VARIANT_COUNT }) {
  if (!Number.isInteger(variantCount) || variantCount < MIN_VARIANT_COUNT || variantCount > MAX_VARIANT_COUNT) {
    throw new Error(`buildHypothesisExperiment: "variantCount" debe ser un entero entre ${MIN_VARIANT_COUNT} y ${MAX_VARIANT_COUNT} (Fase 16, Parte 3/12).`);
  }
  if (!isHypothesisTestingViable(productGroundedEvidence)) {
    return Object.freeze({
      status: 'HYPOTHESIS_TESTING_NOT_VIABLE',
      reason: 'Sin Product Facts reales suficientes ("Problema que ayuda a resolver" / "Beneficios") para construir una hipótesis grounded — nunca se inventa lo que falta.',
    });
  }

  const facts = extractGroundedFacts(productGroundedEvidence);
  const blueprints = selectVariantBlueprints(variantCount);
  const productBasis = Object.freeze([
    ...(facts.problema?.trim() ? [{ type: 'PRODUCT_FACT', ref: 'problema', detail: facts.problema }] : []),
    ...(facts.beneficios?.trim() ? [{ type: 'PRODUCT_FACT', ref: 'beneficios', detail: facts.beneficios }] : []),
  ]);

  const variants = blueprints.map((bp) => buildVariant(bp, productBasis, facts));

  // Fase de Creative Quality, Parte 12: una variante que falla un check
  // BLOQUEANTE (issues, no warnings) del gate NUNCA se convierte
  // silenciosamente en válida -- se rechaza el experimento completo con un
  // error explícito, listando cuál variante y por qué. Regenerar
  // automáticamente con otra estrategia queda fuera de esta fase (Fase 20,
  // no sobre-ingeniería) -- los 5 blueprints reales ya están verificados
  // por test contra este mismo gate.
  const variantesConProblemas = variants.filter((v) => !v.qualityGate.passed);
  if (variantesConProblemas.length > 0) {
    const detalle = variantesConProblemas.map((v) => `Variante ${v.blueprintId}: ${v.qualityGate.issues.join(' | ')}`).join(' ;; ');
    throw new Error(`buildHypothesisExperiment: ${variantesConProblemas.length} variante(s) real(es) no pasaron el Creative Quality Gate -- nunca se devuelve un experimento con una variante rechazada silenciosamente. Detalle: ${detalle}`);
  }

  const experiment = createExperiment({
    productBasis,
    variants: variants.map((v) => v.creativeVariant),
  });

  const experimentQualityGate = runExperimentQualityGate(variants.map((v) => v.copy));

  return Object.freeze({
    status: 'HYPOTHESIS_EXPERIMENT_READY',
    product: Object.freeze({ productId: productGroundedEvidence.productId, nombreComercial: facts.nombreComercial }),
    experiment,
    variantsDetail: Object.freeze(variants.map((v) => Object.freeze({
      blueprintId: v.blueprintId,
      personaHypothesis: v.personaHypothesis,
      painHypothesis: v.painHypothesis,
      creativeVariant: v.creativeVariant,
      copy: v.copy,
      visualDirection: v.visualDirection,
      qualityGate: v.qualityGate,
      copyStyle: v.copyStyle,
      ctaStrategy: v.ctaStrategy,
      scrollStoppingPattern: v.scrollStoppingPattern,
    }))),
    experimentQualityGate,
    disclaimer: 'Estas ideas son hipótesis de marketing. No representan conocimiento validado de clientes y requieren revisión humana.',
  });
}
