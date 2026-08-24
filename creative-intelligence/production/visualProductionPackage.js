// visualProductionPackage.js — Fase "Pasar de Production Artifact a
// Contenido Visual Real". Convierte UN ProductionArtifact + UNA de sus
// variantes (ya declaradas en creativeProductionArtifact.js) en un
// VisualProductionPackage: un objeto estructurado y determinista que una
// herramienta de generación de imagen/video pueda consumir directamente,
// sin tener que interpretar el ProductionArtifact ni inventar nada.
//
// REGLA CENTRAL: este archivo NO genera contenido nuevo por sí mismo — todo
// el texto (prompt, caption, CTA, voiceover) lo provee quien llama al
// constructor (igual que createProductionArtifact/createCreativeCell en el
// resto del proyecto: los constructores validan y guardan, no redactan).
// Reutiliza sin duplicar: assertNoComplianceRiskClaimReused
// (src/affiliatePipeline.js), assertNoPromiseLanguage y
// FORBIDDEN_PROMISE_LANGUAGE (creativeProductionArtifact.js), assertNoWinnerClaim
// (schemas/cycleOutput.schema.js).

import { randomUUID } from 'node:crypto';
import { assertNoWinnerClaim } from '../schemas/cycleOutput.schema.js';
import { assertNoComplianceRiskClaimReused } from '../src/affiliatePipeline.js';
import { assertNoPromiseLanguage } from './creativeProductionArtifact.js';

export const PACKAGE_STATUS = 'DRAFT_FOR_REVIEW'; // fijo — nunca "APPROVED"/"PUBLISHED" desde este constructor.

export const ASSET_TYPES = Object.freeze(['VIDEO', 'IMAGE', 'CAROUSEL']);

// Mapeo fijo assetType -> aspect ratios de entrega. No es un parámetro libre
// del llamador — así ningún paquete puede declarar un aspect ratio que no
// corresponda a su propio assetType.
const ASPECT_RATIOS_BY_ASSET_TYPE = Object.freeze({
  VIDEO: Object.freeze(['9:16 REEL / SHORT_VIDEO', '9:16 STORY']),
  IMAGE: Object.freeze(['4:5 FEED', '9:16 STORY']),
  CAROUSEL: Object.freeze(['4:5 FEED CAROUSEL']),
});

// DELIVERY_FORMATS de creativeProductionArtifact.js -> assetType de esta
// capa. No se duplica DELIVERY_FORMATS aquí, solo se mapea su valor real.
const ASSET_TYPE_BY_DELIVERY_FORMAT = Object.freeze({
  SHORT_VIDEO: 'VIDEO', REEL: 'VIDEO', STORY: 'VIDEO',
  IMAGE: 'IMAGE', SCREENSHOT_STYLE: 'IMAGE',
  CAROUSEL: 'CAROUSEL',
});

export const PRODUCT_REFERENCE_STATUSES = Object.freeze(['PRODUCT_REFERENCE_AVAILABLE', 'PRODUCT_REFERENCE_REQUIRED']);

function assertNonEmptyString(value, fieldName) {
  if (!value?.trim()) throw new Error(`VisualProductionPackage: "${fieldName}" es obligatorio.`);
}

function collectText(fields) {
  return fields.filter((v) => typeof v === 'string' && v.length > 0).join(' \n ');
}

/** Deriva assetType desde el ProductionArtifact real — nunca un valor libre del llamador. */
export function deriveAssetType(productionArtifact) {
  const assetType = ASSET_TYPE_BY_DELIVERY_FORMAT[productionArtifact?.format];
  if (!assetType) {
    throw new Error(`deriveAssetType: el ProductionArtifact tiene "format" "${productionArtifact?.format}", sin assetType de producción visual mapeado.`);
  }
  return assetType;
}

/**
 * @param {object} args
 * @param {object} args.productionArtifact — objeto real de createProductionArtifact() (creativeProductionArtifact.js).
 * @param {string} args.variantLabel — debe coincidir con productionArtifact.variants[].label (ej. "Variante A").
 * @param {string} args.generationPrompt
 * @param {string} args.negativePrompt
 * @param {string} args.sceneDescription
 * @param {string} args.subjectDescription
 * @param {{description:string}} args.productPlacement — el assetStatus lo calcula esta función, no el llamador.
 * @param {string} args.cameraDirection
 * @param {string} args.lightingDirection
 * @param {string[]} args.screenText
 * @param {?string[]} args.voiceover — null si el assetType no es VIDEO.
 * @param {?string[]} args.subtitleText — null si el assetType no es VIDEO.
 * @param {string} args.duration — rango sugerido o "NOT_APPLICABLE".
 * @param {string} args.caption
 * @param {string} args.cta
 * @param {string} args.whatsappCta
 * @param {string[]} args.riskyClaims — de collectComplianceRiskClaims() (affiliatePipeline.js), nunca omitido.
 * @param {boolean} [args.hasRealProductReference=false] — si no hay imagen oficial de empaque disponible en el repo, queda false y assetStatus = PRODUCT_REFERENCE_REQUIRED.
 */
export function createVisualProductionPackage({
  productionArtifact,
  variantLabel,
  generationPrompt,
  negativePrompt,
  sceneDescription,
  subjectDescription,
  productPlacement,
  cameraDirection,
  lightingDirection,
  screenText,
  voiceover = null,
  subtitleText = null,
  duration,
  caption,
  cta,
  whatsappCta,
  riskyClaims,
  hasRealProductReference = false,
}) {
  if (!productionArtifact?.productionArtifactId || productionArtifact.status !== 'DRAFT_FOR_REVIEW') {
    throw new Error('VisualProductionPackage: "productionArtifact" debe ser un ProductionArtifact real (createProductionArtifact()), con status DRAFT_FOR_REVIEW.');
  }
  const variant = (productionArtifact.variants ?? []).find((v) => v.label === variantLabel);
  if (!variant) {
    throw new Error(`VisualProductionPackage: no existe una variante con label "${variantLabel}" en el ProductionArtifact ${productionArtifact.productionArtifactId} — no se fabrica una variante nueva aquí, solo se empaqueta una ya declarada.`);
  }

  const assetType = deriveAssetType(productionArtifact);
  const aspectRatios = ASPECT_RATIOS_BY_ASSET_TYPE[assetType];

  assertNonEmptyString(generationPrompt, 'generationPrompt');
  assertNonEmptyString(negativePrompt, 'negativePrompt');
  assertNonEmptyString(sceneDescription, 'sceneDescription');
  assertNonEmptyString(subjectDescription, 'subjectDescription');
  if (!productPlacement?.description?.trim()) throw new Error('VisualProductionPackage: "productPlacement.description" es obligatorio.');
  assertNonEmptyString(cameraDirection, 'cameraDirection');
  assertNonEmptyString(lightingDirection, 'lightingDirection');
  if (!Array.isArray(screenText)) throw new Error('VisualProductionPackage: "screenText" debe ser un arreglo.');
  if (assetType === 'VIDEO') {
    if (!Array.isArray(voiceover) || voiceover.length === 0) throw new Error('VisualProductionPackage: assetType VIDEO requiere "voiceover" (arreglo no vacío).');
    if (!Array.isArray(subtitleText) || subtitleText.length === 0) throw new Error('VisualProductionPackage: assetType VIDEO requiere "subtitleText" (arreglo no vacío).');
  } else {
    if (voiceover !== null) throw new Error(`VisualProductionPackage: assetType ${assetType} no lleva voiceover — debe ser null.`);
    if (subtitleText !== null) throw new Error(`VisualProductionPackage: assetType ${assetType} no lleva subtitleText — debe ser null.`);
  }
  assertNonEmptyString(duration, 'duration');
  assertNonEmptyString(caption, 'caption');
  assertNonEmptyString(cta, 'cta');
  assertNonEmptyString(whatsappCta, 'whatsappCta');
  if (!Array.isArray(riskyClaims)) {
    throw new Error('VisualProductionPackage: "riskyClaims" es obligatorio (ver collectComplianceRiskClaims) — nunca se asume vacío.');
  }
  if (typeof hasRealProductReference !== 'boolean') {
    throw new Error('VisualProductionPackage: "hasRealProductReference" debe ser boolean explícito.');
  }

  const assetStatus = hasRealProductReference ? 'PRODUCT_REFERENCE_AVAILABLE' : 'PRODUCT_REFERENCE_REQUIRED';

  // --- Guards, aplicados sobre TODO el texto generado ---
  const allText = collectText([
    generationPrompt, negativePrompt, sceneDescription, subjectDescription, productPlacement.description,
    cameraDirection, lightingDirection, ...screenText, ...(voiceover ?? []), ...(subtitleText ?? []),
    caption, cta, whatsappCta,
  ]);
  assertNoComplianceRiskClaimReused({ text: allText, riskyClaims });
  assertNoPromiseLanguage(allText, 'contenido combinado del VisualProductionPackage');

  const variantSuffix = variantLabel.trim().split(/\s+/).pop(); // "Variante A" -> "A"

  const pkg = Object.freeze({
    visualProductionPackageId: randomUUID(),
    productionArtifactId: productionArtifact.productionArtifactId,
    creativeCellCandidateId: productionArtifact.creativeCellCandidateId,
    variantId: `${productionArtifact.creativeCellCandidateId}-${variantSuffix}`,
    variantLabel,
    variantChangedVariable: variant.changedVariable,
    variantDescription: variant.description,
    assetType,
    aspectRatios,
    generationPrompt,
    negativePrompt,
    visualDirection: productionArtifact.visualDirection,
    sceneDescription,
    subjectDescription,
    productPlacement: Object.freeze({ description: productPlacement.description, assetStatus }),
    cameraDirection,
    lightingDirection,
    screenText: Object.freeze([...screenText]),
    voiceover: voiceover ? Object.freeze([...voiceover]) : null,
    subtitleText: subtitleText ? Object.freeze([...subtitleText]) : null,
    duration,
    caption,
    cta,
    whatsappCta,
    complianceNotes: productionArtifact.complianceNotes,
    sourceFacts: productionArtifact.productFactsUsed,
    prohibitedClaims: Object.freeze([...riskyClaims]),
    humanReviewRequired: true, // fijo — ningún paquete de esta fase se genera sin revisión humana.
    status: PACKAGE_STATUS,
    createdAt: new Date().toISOString(),
  });

  assertNoWinnerClaim(pkg); // reutilizado sin modificar.
  return pkg;
}
