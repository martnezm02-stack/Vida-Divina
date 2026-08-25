// campaignIntent.js — Creative Strategy Engine (2026-08-24). Representa el
// BRIEF real de una campaña: qué audiencia, qué problema/deseo, qué
// territorio creativo -- la autoridad principal sobre DE QUÉ habla una
// creatividad. Separado a propósito de Product Facts
// (productGroundedEvidence.js): ese archivo responde "¿qué podemos decir
// REALMENTE del producto?" (claims sustentados); este responde "¿de qué
// QUEREMOS hablar?" (territorio de campaña). Ninguno reemplaza al otro --
// hypothesisCreativeEngine.js combina ambos, nunca deja que Product
// Knowledge sustituya a Campaign Knowledge (root cause real corregido en
// esta fase: antes, el "problema" de CADA variante venía siempre del
// campo "Problema que ayuda a resolver" del producto, sin importar qué
// campaña se estuviera pidiendo).
//
// REGLA: campaignTerritory/problemOrNeed pueden describir libremente la
// preocupación/deseo de la audiencia (masculinidad, vitalidad, confianza,
// desempeño, etc.) -- eso es territorio de marketing, no un claim médico.
// Pero se validan contra los MISMOS guards de Claim Safety que ya corren
// sobre el copy final (assertNoForbiddenProductClaims/
// assertBrandAvoidCompliance, sin duplicar) -- si el brief en sí mismo
// pide un verbo de eficacia prohibido ("trata", "cura", "elimina"...), se
// rechaza aquí, en la entrada, con un mensaje real y accionable -- nunca
// a mitad de la generación de un batch.

import { randomUUID, createHash } from 'node:crypto';
import { assertNoForbiddenProductClaims } from '../../video-production/src/hyperframesRenderer.js';
import { assertBrandAvoidCompliance } from './brandVisualSystem.js';

export const CAMPAIGN_OBJECTIVES = Object.freeze(['awareness', 'engagement', 'conversion', 'launch']);
// Reutiliza los 5 awareness stages REALES ya definidos por
// creative-intelligence/src/awareness.js (vía marketingPlaybook.js) --
// nunca se inventa una taxonomía paralela.
export const CAMPAIGN_AWARENESS_STAGES = Object.freeze(['Unaware', 'Problem Aware', 'Solution Aware', 'Product Aware', 'Most Aware']);

function limpiar(texto) {
  return String(texto ?? '').trim();
}

/**
 * Construye y valida un CampaignIntent real -- nunca infiere audiencia,
 * problema o territorio de un texto libre (evita "inventar" el brief);
 * los 3 campos que definen el TERRITORIO real de la campaña
 * (targetAudience/problemOrNeed/campaignTerritory) son obligatorios y
 * explícitos, tal como los provee quien pide la campaña.
 *
 * @param {{productId:string, targetAudience:string, problemOrNeed:string, campaignTerritory?:string, desiredOutcome?:string, campaignObjective?:string, awarenessStage?:string, platform?:string, format?:string, tone?:string, constraints?:string[]}} args
 */
export function buildCampaignIntent({
  productId, targetAudience, problemOrNeed, campaignTerritory = null, desiredOutcome = null,
  campaignObjective = 'awareness', awarenessStage = 'Problem Aware', platform = null, format = null,
  tone = null, constraints = [],
}) {
  if (!productId?.trim()) throw new Error('buildCampaignIntent: "productId" es obligatorio -- toda campaña real pertenece a un producto real, nunca inventado.');
  if (!targetAudience?.trim()) throw new Error('buildCampaignIntent: "targetAudience" es obligatorio -- una campaña sin audiencia real no tiene territorio que defender.');
  if (!problemOrNeed?.trim()) throw new Error('buildCampaignIntent: "problemOrNeed" es obligatorio -- sin esto, el sistema cae de vuelta a hablar solo del producto (root cause real de esta fase).');
  if (!CAMPAIGN_OBJECTIVES.includes(campaignObjective)) throw new Error(`buildCampaignIntent: "campaignObjective" debe ser uno de ${CAMPAIGN_OBJECTIVES.join(', ')} (recibido "${campaignObjective}").`);
  if (!CAMPAIGN_AWARENESS_STAGES.includes(awarenessStage)) throw new Error(`buildCampaignIntent: "awarenessStage" debe ser uno de ${CAMPAIGN_AWARENESS_STAGES.join(', ')} (recibido "${awarenessStage}").`);

  const territorio = limpiar(campaignTerritory) || limpiar(problemOrNeed);

  // Valida el BRIEF en sí (no todavía el copy generado) contra los mismos
  // guards reales de Claim Safety -- "marca el conflicto" (encargo) antes
  // de gastar una generación completa. Un mensaje real y accionable, no
  // un stacktrace a mitad del batch.
  const briefText = [targetAudience, problemOrNeed, territorio, desiredOutcome].filter(Boolean).join(' . ');
  try {
    assertNoForbiddenProductClaims(briefText, 'buildCampaignIntent: brief de campaña');
    assertBrandAvoidCompliance(briefText, 'buildCampaignIntent: brief de campaña');
  } catch (err) {
    throw new Error(`buildCampaignIntent: el brief de campaña pide un claim/lenguaje no permitido -- CONFLICTO real, no se genera nada hasta reformular manteniendo la audiencia/problema pero sin ese verbo de eficacia. Detalle real: ${err.message}`);
  }

  return Object.freeze({
    productId: productId.trim(),
    targetAudience: targetAudience.trim(),
    problemOrNeed: problemOrNeed.trim(),
    campaignTerritory: territorio,
    desiredOutcome: desiredOutcome?.trim() || null,
    campaignObjective,
    awarenessStage,
    platform: platform?.trim() || null,
    format: format?.trim() || null,
    tone: tone?.trim() || null,
    constraints: Object.freeze([...(constraints ?? [])]),
  });
}

/**
 * Identidad real y determinista de una campaña: MISMO brief (mismo
 * producto+audiencia+problema+territorio) -> MISMO campaignId siempre ->
 * "Generar más variantes" resume el historial real de ESA campaña
 * (batches/fingerprints, ver hypothesisBatchStore.js). Un brief DISTINTO
 * para el mismo producto es, por diseño, una campaña distinta con su
 * propio historial -- nunca comparte batches con otra campaña.
 */
export function computeCampaignId(campaignIntent) {
  const canonical = JSON.stringify({
    productId: campaignIntent.productId,
    targetAudience: campaignIntent.targetAudience.toLowerCase(),
    problemOrNeed: campaignIntent.problemOrNeed.toLowerCase(),
    campaignTerritory: campaignIntent.campaignTerritory.toLowerCase(),
  });
  const hash = createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 10);
  return `${campaignIntent.productId}-${hash}`;
}

/** Solo para trazabilidad/lineage donde se necesita un id de generación real y único -- nunca reutilizado. */
export function newGenerationId() {
  return randomUUID();
}
