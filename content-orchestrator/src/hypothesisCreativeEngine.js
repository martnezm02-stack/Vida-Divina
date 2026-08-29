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
import { createHash } from 'node:crypto';
import {
  generateBlueprintAtIndex, VARIANT_BLUEPRINTS, PERSONA_FRAMINGS, assertValidPersonaFraming,
  buildAngleText, buildMechanismStatement, buildMarketingPrincipleBasisEntry,
  VISUAL_STYLES, assertValidVisualStyle, SCROLL_STOPPING_PATTERNS, assertValidScrollStoppingPattern,
} from '../../creative-intelligence/src/marketingPlaybook.js';

const VARIANT_BLUEPRINTS_LENGTH = VARIANT_BLUEPRINTS.length;
import { generateVariantCopy } from './hypothesisCopyProvider.js';
import { runCreativeQualityGate, runExperimentQualityGate } from './creativeQualityGate.js';
import { deriveBrandSceneColors, assertBrandAvoidCompliance } from './brandVisualSystem.js';

export const HYPOTHESIS_ENGINE_STATUSES = Object.freeze(['HYPOTHESIS_EXPERIMENT_READY', 'HYPOTHESIS_TESTING_NOT_VIABLE']);

export const DEFAULT_VARIANT_COUNT = 3;
const MIN_VARIANT_COUNT = 3;
// Creative Factory (generación masiva/incremental): antes 5 (limitado a
// los VARIANT_BLUEPRINTS curados a mano). selectBlueprintRange() ya cubre
// un espacio combinatorio mucho más grande (ver marketingPlaybook.js) --
// 50 es un tope de seguridad explícito para evitar una generación
// accidentalmente ilimitada (Creative Factory, Paso 6), no una limitación
// técnica real.
const MAX_VARIANT_COUNT = 50;
// Cuántos blueprints de más se intentan por batch antes de rendirse
// buscando reemplazos para variantes que colisionaron con una ya vista
// (ver excludeFingerprints más abajo) -- generoso pero acotado, nunca un
// bucle sin límite real.
const MAX_SKIP_ATTEMPTS_PER_VARIANT = 20;

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
    // Nombre visible (UX cleanup, 2026-08-26): aditivo, nunca reemplaza
    // nombreComercial (que sigue siendo el nombre técnico real usado para
    // matching/correlación) -- ver productFactsLoader.js.
    nombreVisible: productGroundedEvidence.nombreVisible ?? productGroundedEvidence.nombreComercial,
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

// Longitud máxima real de un fragmento de hook derivado del territorio de
// campaña -- un hook debe ser breve (mismo criterio que los fragmentos
// fijos de PERSONA_FRAMINGS#buildPainHookFragment, ej. "mantener una
// rutina consistente"). Nunca trunca a mitad de palabra.
const MAX_CAMPAIGN_HOOK_FRAGMENT_LENGTH = 80;

/**
 * Fragmento CORTO real para el hook -- Creative Strategy Engine: cuando
 * hay una campaña real, el hook debe hablar del TERRITORIO de esa
 * campaña, no de un fragmento genérico por persona (root cause real: el
 * fragmento fijo de PERSONA_FRAMINGS nunca dependía ni del producto ni de
 * la campaña). Sin campaignIntent, comportamiento preexistente intacto.
 */
function campaignHookFragment(framing, campaignIntent) {
  if (!campaignIntent) return framing.buildPainHookFragment();
  // campaignTerritory (etiqueta corta), NUNCA problemOrNeed (texto más
  // largo, ya usado literal en la sección "problem" del cuerpo vía
  // effectiveFacts.problema) -- si el hook y el cuerpo citaran el MISMO
  // texto, colisionarían con creativeQualityGate.js#checkHookRepetition
  // (root cause real encontrado durante la validación de esta fase).
  const real = campaignIntent.campaignTerritory.replace(/\.+$/, '').trim();
  if (real.length <= MAX_CAMPAIGN_HOOK_FRAGMENT_LENGTH) return real;
  const corte = real.lastIndexOf(' ', MAX_CAMPAIGN_HOOK_FRAGMENT_LENGTH);
  return `${real.slice(0, corte > 0 ? corte : MAX_CAMPAIGN_HOOK_FRAGMENT_LENGTH)}…`;
}

/**
 * Construye UNA variante completa (persona hipótesis + pain hipótesis +
 * CreativeVariant real + copy + Creative Quality Gate + visual direction)
 * a partir de UN blueprint real. `facts` ya viene con "problema" real
 * efectivo (Campaign Knowledge cuando hay campaña, Product Knowledge si
 * no -- ver effectiveFacts() en buildHypothesisExperiment) -- este
 * archivo no decide esa prioridad, solo la consume.
 */
function buildVariant(blueprint, productBasis, facts, campaignIntent = null) {
  assertValidPersonaFraming(blueprint.personaFraming);
  const framing = PERSONA_FRAMINGS[blueprint.personaFraming];

  // effectiveFacts: Campaign Knowledge manda sobre "problema" cuando hay
  // campaña real (root cause de esta fase) -- ingredientes/beneficios
  // (lo único que se puede AFIRMAR del producto) nunca cambian, siempre
  // vienen de `facts` real, sin importar si hay campaña o no.
  const effectiveFacts = campaignIntent ? { ...facts, problema: campaignIntent.problemOrNeed } : facts;

  const marketingPrincipleEntry = buildMarketingPrincipleBasisEntry(blueprint.angle, {
    personaFramingLabel: framing.label,
    factFragment: effectiveFacts.problema ?? effectiveFacts.beneficios,
  });
  const variantBasis = Object.freeze([...productBasis, marketingPrincipleEntry]);

  const personaHypothesis = createPersonaHypothesis({
    name: framing.buildName(),
    lifeSituation: framing.buildLifeSituation(effectiveFacts.problema ?? effectiveFacts.beneficios),
    relationshipToProblem: framing.buildRelationship(),
    basis: variantBasis,
  });

  // Pain reframing (Fase de Creative Quality, Parte 6): el mismo Product
  // Fact real, reencuadrado con énfasis distinto por variante -- nunca
  // idéntico entre variantes como antes (root cause real confirmado en el
  // benchmark de Ripped). Sigue siendo HIPÓTESIS, grounded en
  // PRODUCT_FACT/CAMPAIGN_BRIEF + MARKETING_PRINCIPLE, nunca en Customer
  // Evidence.
  const painFragmentFull = framing.buildPainFragment(effectiveFacts);
  const painHypothesis = createPainHypothesis({
    personaHypothesisId: personaHypothesis.personaHypothesisId,
    painPoint: `Hipótesis: podría importar ${painFragmentFull}.`,
    basis: variantBasis,
  });

  // El hook publicitario usa el fragmento CORTO de encuadre
  // (painHookFragment), nunca el painPoint completo -- ver
  // hypothesisCopyProvider.js para el porqué (evita hooks largos/con
  // comillas anidadas, root cause real corregido). Con campaña real,
  // habla del TERRITORIO de la campaña -- nunca de un fragmento genérico
  // de persona desconectado del brief.
  const painHookFragment = campaignHookFragment(framing, campaignIntent);
  // generateVariantCopy() usa effectiveFacts para "problem" (SOURCE_FIELD_BY_SECTION.problem
  // = 'problema') pero SIGUE usando ingredientes/beneficios reales del
  // producto para "mechanism"/"productReveal" -- effectiveFacts nunca
  // toca esos dos campos, sin importar si hay campaña.
  const copy = generateVariantCopy({
    blueprint, painHookFragment, facts: effectiveFacts, campaignIntent,
  });

  const creativeVariant = createCreativeVariant({
    personaHypothesisId: personaHypothesis.personaHypothesisId,
    painHypothesisId: painHypothesis.painHypothesisId,
    awareness: blueprint.awareness,
    angleText: buildAngleText(blueprint.angle, effectiveFacts),
    hook: copy.hook,
    format: blueprint.format,
    mechanism: buildMechanismStatement(facts),
  });

  // Creative Quality Gate (Fase de Creative Quality, Parte 10/11; Creative
  // Strategy Engine: + Campaign Relevance) -- DESPUÉS de Claim Safety (ya
  // ejecutado dentro de generateVariantCopy()). Nunca genera contenido,
  // solo analiza/puntúa/reporta.
  const qualityGate = runCreativeQualityGate({
    hook: copy.hook,
    primaryText: copy.primaryText,
    cta: copy.cta,
    bodyLines: copy.bodyLines,
    sectionsUsed: copy.sectionsUsed,
    facts,
    campaignIntent,
  });

  const visualDirection = buildVisualDirection(blueprint, facts);

  // Creative Strategy Engine: "concepto" real de esta variante -- hoy el
  // angle ES el concepto (mismo vocabulario, ver marketingPlaybook.js;
  // nunca una taxonomía paralela). conceptId/angleId/hookId reales para
  // que el Dashboard pueda mostrar por qué esta variante pertenece a esta
  // campaña (Paso 6/10 del encargo).
  return Object.freeze({
    blueprintId: blueprint.id,
    conceptId: blueprint.angle,
    angleId: blueprint.angle,
    hookId: blueprint.hook,
    personaHypothesis,
    painHypothesis,
    creativeVariant,
    copy,
    visualDirection,
    qualityGate,
    copyStyle: blueprint.copyStyle,
    ctaStrategy: blueprint.ctaStrategy,
    scrollStoppingPattern: blueprint.scrollStoppingPattern,
    // hookRegenerationContext (Corrección "Hook Intelligence + Claim
    // Relevance + Auto-QA", 2026-08-28, Paso 2/3 del encargo): MISMOS
    // insumos reales ya usados arriba para generateVariantCopy() --
    // expuestos para que hookIntelligence.js pueda re-renderizar
    // candidatos de hook reales (mismo painHookFragment/facts/
    // campaignIntent, solo cambiando blueprint.hook) sin recalcular nada
    // ni inventar un segundo motor de copy.
    hookRegenerationContext: Object.freeze({ blueprint, painHookFragment, facts, campaignIntent }),
  });
}

/**
 * Fingerprint pequeño y determinista de UNA variante ya construida --
 * usado para deduplicación real ENTRE llamadas/batches (Creative Factory,
 * Paso 4). A diferencia de variantSignature() interno de
 * hypothesisTesting.js (angle+hook+format, solo dedup DENTRO de un mismo
 * experimento), este fingerprint también cubre el TEXTO real ya
 * renderizado (hook + primaryText + cta) -- dos blueprints distintos
 * podrían, en teoría, rendir un texto casi idéntico; dos generationId
 * distintos NUNCA son, por sí solos, prueba de que el contenido difiere
 * (Paso 4: "NO compares únicamente por generationId").
 */
export function computeVariantFingerprint(variant) {
  const payload = [
    variant.blueprintId, variant.copyStyle, variant.ctaStrategy,
    variant.creativeVariant?.angleText, variant.copy?.hook, variant.copy?.primaryText, variant.copy?.cta,
  ].map((v) => String(v ?? '').trim().toLowerCase()).join('||');
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Punto de entrada único del motor (Fase 16, Parte 5/6/9/10/11; Fase de
 * Creative Quality Parte 12; Creative Factory: generación incremental por
 * batch, Paso 2-5).
 *
 * @param {{productGroundedEvidence: object, variantCount?: number, batchOffset?: number, excludeFingerprints?: Iterable<string>, campaignIntent?: object|null}} args
 * @returns {{status: 'HYPOTHESIS_EXPERIMENT_READY', product: object, experiment: object, variantsDetail: object[], experimentQualityGate: object, disclaimer: string} |
 *           {status: 'HYPOTHESIS_TESTING_NOT_VIABLE', reason: string}}
 */
export function buildHypothesisExperiment({
  productGroundedEvidence, variantCount = DEFAULT_VARIANT_COUNT, batchOffset = 0, excludeFingerprints = [], campaignIntent = null,
}) {
  if (!Number.isInteger(variantCount) || variantCount < MIN_VARIANT_COUNT || variantCount > MAX_VARIANT_COUNT) {
    throw new Error(`buildHypothesisExperiment: "variantCount" debe ser un entero entre ${MIN_VARIANT_COUNT} y ${MAX_VARIANT_COUNT} (Fase 16, Parte 3/12; Creative Factory Paso 6).`);
  }
  if (!Number.isInteger(batchOffset) || batchOffset < 0) {
    throw new Error(`buildHypothesisExperiment: "batchOffset" debe ser un entero >= 0 (recibido ${batchOffset}).`);
  }
  if (campaignIntent && campaignIntent.productId !== productGroundedEvidence?.productId) {
    throw new Error(`buildHypothesisExperiment: "campaignIntent.productId" (${campaignIntent.productId}) no coincide con el producto real de "productGroundedEvidence" (${productGroundedEvidence?.productId}) -- nunca se mezcla la campaña de un producto con hechos de otro.`);
  }
  if (!isHypothesisTestingViable(productGroundedEvidence)) {
    return Object.freeze({
      status: 'HYPOTHESIS_TESTING_NOT_VIABLE',
      reason: 'Sin Product Facts reales suficientes ("Problema que ayuda a resolver" / "Beneficios") para construir una hipótesis grounded — nunca se inventa lo que falta.',
    });
  }

  const facts = extractGroundedFacts(productGroundedEvidence);
  // Campaign Knowledge ("¿de qué queremos hablar?") vs Product Knowledge
  // ("¿qué podemos decir del producto?") -- Creative Strategy Engine,
  // 2026-08-24. Nunca se mezclan en la MISMA entrada de basis: un
  // CAMPAIGN_BRIEF real nunca se etiqueta como PRODUCT_FACT (honestidad de
  // lineage), y viceversa.
  const productBasis = Object.freeze([
    ...(facts.problema?.trim() ? [{ type: 'PRODUCT_FACT', ref: 'problema', detail: facts.problema }] : []),
    ...(facts.beneficios?.trim() ? [{ type: 'PRODUCT_FACT', ref: 'beneficios', detail: facts.beneficios }] : []),
    ...(campaignIntent ? [
      { type: 'CAMPAIGN_BRIEF', ref: 'targetAudience', detail: campaignIntent.targetAudience },
      { type: 'CAMPAIGN_BRIEF', ref: 'problemOrNeed', detail: campaignIntent.problemOrNeed },
      { type: 'CAMPAIGN_BRIEF', ref: 'campaignTerritory', detail: campaignIntent.campaignTerritory },
    ] : []),
  ]);

  // generateBlueprintAtIndex(n) para n=0..4 devuelve EXACTAMENTE los 5
  // VARIANT_BLUEPRINTS curados a mano (mismos ids A-E) -- por eso
  // batchOffset=0 (primera llamada de una campaña, incluida
  // autonomousCreate.js, que nunca pasa batchOffset) produce el mismo
  // resultado de siempre para variantCount<=5, sin necesidad de una rama
  // "legada" aparte. batchOffset>0 (Batch #2, #3...) avanza el cursor
  // hacia combinaciones generadas nuevas (ver marketingPlaybook.js).
  const excludeSet = excludeFingerprints instanceof Set ? excludeFingerprints : new Set(excludeFingerprints);

  const variants = [];
  let cursor = batchOffset;
  let attemptsSinceLastAccepted = 0;
  while (variants.length < variantCount) {
    const bp = generateBlueprintAtIndex(cursor);
    // El comportamiento estricto (throw inmediato) es solo para el caso
    // preexistente REAL: los 5 blueprints curados a mano, renderizados
    // SOLO con Product Facts (sin campaña) -- esa combinación exacta ya
    // está vetted por test. Con campaignIntent real, el texto de campaña
    // se inyecta en esos MISMOS 5 blueprints (nunca vetted para eso) --
    // un choque puntual (ej. hook y "problem" section citando el mismo
    // territorio corto cuando el brief no da un campaignTerritory
    // distinto) se trata igual que cualquier otra combinación generada:
    // se descarta y se avanza, nunca se tira todo el batch.
    const esBlueprintCurado = cursor < VARIANT_BLUEPRINTS_LENGTH && !campaignIntent;
    cursor += 1;
    const candidate = buildVariant(bp, productBasis, facts, campaignIntent);

    // Fase de Creative Quality, Parte 12 (comportamiento preexistente,
    // intacto para los 5 blueprints curados a mano -- ya vetted por test,
    // un fallo ahí es una señal real de bug, se rechaza el experimento
    // completo de inmediato, nunca en silencio). Creative Strategy Engine
    // (2026-08-24): para blueprints GENERADOS (combinatoria de
    // marketingPlaybook.js, cursor >= 5), un fallo del gate (ej. score de
    // relevancia de campaña bajo, o colisión hook/cuerpo puntual) se trata
    // igual que una colisión de fingerprint -- se descarta ESA combinación
    // puntual y se avanza a la siguiente, en vez de tirar el batch
    // completo. Hay ~2310 combinaciones reales disponibles; descartar una
    // ocasional no es "sobre-ingeniería", es la misma red de seguridad ya
    // usada para duplicados.
    if (!candidate.qualityGate.passed) {
      if (esBlueprintCurado) {
        throw new Error(`buildHypothesisExperiment: la variante ${candidate.blueprintId} (uno de los 5 blueprints curados a mano) no pasó el Creative Quality Gate -- nunca se devuelve un experimento con una variante rechazada silenciosamente. Detalle: ${candidate.qualityGate.issues.join(' | ')}`);
      }
      attemptsSinceLastAccepted += 1;
      if (attemptsSinceLastAccepted > MAX_SKIP_ATTEMPTS_PER_VARIANT) {
        throw new Error(`buildHypothesisExperiment: no se encontró una variante real que pase el Creative Quality Gate tras ${MAX_SKIP_ATTEMPTS_PER_VARIANT} intentos consecutivos -- el espacio combinatorio real para "${facts.nombreComercial}" parece agotado para este batchOffset (${batchOffset}). No se fabrica una variante de baja calidad para completar el batch. Último motivo real: ${candidate.qualityGate.issues.join(' | ')}`);
      }
      continue;
    }

    const fingerprint = computeVariantFingerprint(candidate);
    if (excludeSet.has(fingerprint) || variants.some((v) => v.fingerprint === fingerprint)) {
      attemptsSinceLastAccepted += 1;
      if (attemptsSinceLastAccepted > MAX_SKIP_ATTEMPTS_PER_VARIANT) {
        throw new Error(`buildHypothesisExperiment: no se encontró una variante real nueva tras ${MAX_SKIP_ATTEMPTS_PER_VARIANT} intentos consecutivos -- el espacio combinatorio real para "${facts.nombreComercial}" parece agotado para este batchOffset (${batchOffset}). No se fabrica una variante duplicada para completar el batch.`);
      }
      continue;
    }
    attemptsSinceLastAccepted = 0;
    variants.push({ ...candidate, fingerprint });
  }

  const experiment = createExperiment({
    productBasis,
    variants: variants.map((v) => v.creativeVariant),
  });

  const experimentQualityGate = runExperimentQualityGate(variants.map((v) => v.copy));

  return Object.freeze({
    status: 'HYPOTHESIS_EXPERIMENT_READY',
    product: Object.freeze({ productId: productGroundedEvidence.productId, nombreComercial: facts.nombreComercial, nombreVisible: facts.nombreVisible }),
    campaignIntent,
    experiment,
    variantsDetail: Object.freeze(variants.map((v) => Object.freeze({
      blueprintId: v.blueprintId,
      conceptId: v.conceptId,
      angleId: v.angleId,
      hookId: v.hookId,
      fingerprint: v.fingerprint,
      personaHypothesis: v.personaHypothesis,
      painHypothesis: v.painHypothesis,
      creativeVariant: v.creativeVariant,
      copy: v.copy,
      visualDirection: v.visualDirection,
      qualityGate: v.qualityGate,
      campaignRelevance: v.qualityGate.checks.campaignRelevance,
      copyStyle: v.copyStyle,
      ctaStrategy: v.ctaStrategy,
      scrollStoppingPattern: v.scrollStoppingPattern,
      hookRegenerationContext: v.hookRegenerationContext,
    }))),
    experimentQualityGate,
    disclaimer: 'Estas ideas son hipótesis de marketing. No representan conocimiento validado de clientes y requieren revisión humana.',
  });
}
