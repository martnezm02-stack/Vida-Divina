// autonomousCreate.js — Content Generation más autónomo (Fase integrada,
// Bloque 1). Convierte una intención comercial de alto nivel en prosa libre
// ("Crear una campaña para TéDivina dirigida a personas con problemas
// digestivos, objetivo conversaciones por WhatsApp") en una Creative
// Proposal estructurada, SIN inventar hechos de producto ni claims.
//
// NO es un segundo cerebro: solo orquesta módulos que ya existen --
// productMatcher.js (resuelve el producto real mencionado) ->
// campaignMode.js#resolveCampaignCreativeCell (Creative Intelligence real:
// persona/pain/angle/format/awareness/hookDirection/mechanismEntry, YA
// validado en fases anteriores) -> copyGenerationProvider.js (transforma esa
// dirección estratégica en HOOK/SCRIPT/CTA reales). Si no hay match
// estratégico real o falta el producto, se reporta explícitamente -- nunca
// se rellena con datos inventados.

import { resolveProductIdFromText, resolveProductIdFromCanonicalId } from './productMatcher.js';
import { buildProductGroundedEvidence } from './productGroundedEvidence.js';
import { resolveCampaignCreativeCell, MissingStrategicMatchError } from './campaignMode.js';
import { DeterministicCopyProvider } from './copyGenerationProvider.js';
import { buildStrategyContext } from './strategyContext.js';
import { buildHypothesisExperiment, DEFAULT_VARIANT_COUNT } from './hypothesisCreativeEngine.js';

// 'HYPOTHESIS_EXPERIMENT_READY' (Fase 16, aditivo): nunca se reutiliza
// 'PROPOSAL_READY' para una hipótesis (sería presentarla como conocimiento
// validado) ni se reutiliza 'MISSING_CREATIVE_MATCH' cuando SÍ se pudo
// construir un experimento real -- ese status queda reservado para cuando
// ni siquiera existen las condiciones mínimas (ver hypothesisCreativeEngine.js#isHypothesisTestingViable).
export const PROPOSAL_STATUSES = Object.freeze([
  'PROPOSAL_READY', 'MISSING_PRODUCT', 'MISSING_CREATIVE_MATCH', 'VALIDATION_FAILED', 'HYPOTHESIS_EXPERIMENT_READY',
]);

const PATRON_OBJETIVO = Object.freeze([
  { objective: 'WHATSAPP_CONVERSATIONS', platform: 'WHATSAPP', pattern: /\bconversaci[oó]n(?:es)?\s+por\s+whatsapp\b|\bllevar(?:los)?\s+a\s+whatsapp\b|\bmensajes?\s+por\s+whatsapp\b/i },
  { objective: 'INTEREST_TO_WHATSAPP', platform: 'WHATSAPP', pattern: /\bgenerar\s+inter[eé]s\b.*\bwhatsapp\b/i },
  { objective: 'INSTAGRAM_ENGAGEMENT', platform: 'INSTAGRAM_REEL', pattern: /\binstagram\b|\breel(?:s)?\b/i },
  { objective: 'FACEBOOK_ENGAGEMENT', platform: 'FACEBOOK_REEL', pattern: /\bfacebook\b/i },
]);

/** Detecta objetivo/plataforma mencionados EXPLÍCITAMENTE en el userIntent -- nunca infiere uno no mencionado. Por defecto (sin mención), objective/platform quedan null y se marcan en missingFields. */
function detectarObjetivo(userIntent) {
  for (const { objective, platform, pattern } of PATRON_OBJETIVO) {
    if (pattern.test(userIntent)) return { objective, platform };
  }
  return { objective: null, platform: null };
}

function formatoDeliveryDesdeFormat(format) {
  // format real del ProductionBrief (ej. "Educational walk-and-talk") no es
  // un DELIVERY_FORMAT de creativeProductionArtifact.js -- ese mapeo es una
  // decisión de producción posterior (humana o de campaignMode futuro), no
  // algo que este archivo pueda inferir sin inventar. Se reporta el format
  // real tal cual, y se sugiere REEL como default de video corto (el
  // formato ya usado en todo el pipeline existente), marcado explícitamente
  // como sugerencia, no como un hecho resuelto.
  return { creativeFormat: format, suggestedDeliveryFormat: 'REEL' };
}

/**
 * @param {{ userIntent: string, productId?: string|null, copyProvider?: object, variantCount?: number, explicitCta?: string|null }} args
 * @returns {object} Creative Proposal -- ver PROPOSAL_STATUSES.
 */
export async function buildCreativeProposal({ userIntent, productId = null, copyProvider = new DeterministicCopyProvider(), variantCount = 1, explicitCta = null, strategyStore = undefined }) {
  if (!userIntent?.trim()) {
    return Object.freeze({ status: 'VALIDATION_FAILED', userIntent, errors: ['buildCreativeProposal: "userIntent" es obligatorio.'] });
  }

  // Identidad estructurada (ej. selección real en el dashboard, mismo
  // productId real que ya expone /api/products) tiene prioridad sobre la
  // búsqueda por texto libre -- nunca la sustituye por adivinanza: si el
  // productId no tiene hechos reales en docs/productos/, se reporta
  // explícito, nunca se cae de vuelta a texto libre en silencio (evitaría
  // que el usuario supiera que su selección explícita fue ignorada).
  const productMatch = productId?.trim()
    ? resolveProductIdFromCanonicalId(productId)
    : resolveProductIdFromText(userIntent);

  if (!productMatch) {
    return Object.freeze({
      status: 'MISSING_PRODUCT', userIntent, missingFields: ['productId'],
      errors: productId?.trim()
        ? [`buildCreativeProposal: el producto seleccionado ("${productId}") no tiene hechos reales todavía en docs/productos/ -- agrégalo al catálogo real antes de poder generar contenido para él. No se asume ni se sustituye por otro producto.`]
        : [`buildCreativeProposal: ningún producto real del catálogo (docs/productos/) aparece mencionado en "${userIntent}" -- no se asume uno.`],
    });
  }

  let resolution;
  try {
    resolution = resolveCampaignCreativeCell({ productId: productMatch.productId });
  } catch (err) {
    if (err instanceof MissingStrategicMatchError) {
      // Fase 20 -- Product-Grounded Creative Intelligence: sin CreativeCell
      // real (Persona/Pain con evidencia de cliente), pero SI existen
      // hechos reales del producto (docs/productos/), se adjuntan tal
      // cual -- nunca sustituye la propuesta ausente, nunca cambia
      // "status", nunca genera hook/script/cta. Ver
      // productGroundedEvidence.js para la separación explícita
      // PRODUCT_EVIDENCE vs CUSTOMER_EVIDENCE.
      const productGroundedEvidence = buildProductGroundedEvidence(productMatch.productId);

      // Fase 16 -- Marketing Creative Playbook + Hypothesis Testing
      // Integration: antes de rendirse en MISSING_CREATIVE_MATCH, evaluar
      // si existen condiciones mínimas reales (Product Facts) para
      // construir un experimento de HIPÓTESIS, nunca de conocimiento
      // validado. hypothesisCreativeEngine.js decide viabilidad por su
      // cuenta (isHypothesisTestingViable) -- este archivo no la
      // reimplementa ni la relaja.
      const hypothesisResult = buildHypothesisExperiment({ productGroundedEvidence, variantCount: DEFAULT_VARIANT_COUNT });
      if (hypothesisResult.status === 'HYPOTHESIS_EXPERIMENT_READY') {
        return Object.freeze({
          status: 'HYPOTHESIS_EXPERIMENT_READY',
          userIntent,
          product: hypothesisResult.product,
          experiment: hypothesisResult.experiment,
          variantsDetail: hypothesisResult.variantsDetail,
          disclaimer: hypothesisResult.disclaimer,
          productGroundedEvidence,
          evidenceBasedAttempt: Object.freeze({ candidatesTried: err.candidatesTried, error: err.message }),
        });
      }

      // hypothesisResult.status === 'HYPOTHESIS_TESTING_NOT_VIABLE' -- ni
      // siquiera hay Product Facts suficientes para una hipótesis grounded
      // (Fase 16, Parte 3): MISSING_CREATIVE_MATCH sigue siendo el estado
      // correcto y honesto, comportamiento intacto de fases anteriores.
      return Object.freeze({
        status: 'MISSING_CREATIVE_MATCH', userIntent,
        product: { productId: productMatch.productId, nombreComercial: productMatch.nombreComercial },
        missingFields: ['creativeCell'],
        errors: [err.message],
        candidatesTried: err.candidatesTried,
        productGroundedEvidence,
        hypothesisTestingReason: hypothesisResult.reason,
      });
    }
    return Object.freeze({ status: 'VALIDATION_FAILED', userIntent, errors: [err.message] });
  }

  const { objective, platform } = detectarObjetivo(userIntent);
  const { creativeFormat, suggestedDeliveryFormat } = formatoDeliveryDesdeFormat(resolution.productionBrief.header.format);

  // Fase 11 (Strategy-Aware Content Generation) -- ADITIVO/OPCIONAL (§8):
  // solo rellena `platform` cuando el userIntent NO lo mencionó
  // explícitamente (nunca sobrescribe una plataforma ya detectada en el
  // texto, ver Fase 4 del encargo: "no ampliar artificialmente el
  // alcance"). Lectura pura de StrategyDecision=ACCEPT ya persistidas --
  // nunca falla ni bloquea la propuesta si no hay evidencia aplicable.
  const strategyContext = buildStrategyContext({ productId: productMatch.productId, productName: productMatch.nombreComercial, store: strategyStore });

  let copyResult;
  try {
    copyResult = await copyProvider.generate({
      persona: resolution.persona, pain: resolution.pain, angle: resolution.angle,
      hookDirection: resolution.productionBrief.hookDirection,
      mechanismEntry: resolution.productionBrief.mechanismEntry,
      productFacts: resolution.productFacts,
      explicitCta, variantCount,
    });
  } catch (err) {
    return Object.freeze({ status: 'VALIDATION_FAILED', userIntent, errors: [err.message] });
  }

  const missingFields = [...copyResult.missingFields];
  if (!objective) missingFields.push('objective (no detectado en userIntent -- confirmar manualmente)');
  if (!resolution.productFacts?.nombreComercial) missingFields.push('product.nombreComercial');

  return Object.freeze({
    status: 'PROPOSAL_READY',
    userIntent,
    objective,
    product: Object.freeze({ productId: productMatch.productId, nombreComercial: resolution.productFacts.nombreComercial }),
    audience: Object.freeze({ personaName: resolution.persona.name, lifeSituation: resolution.persona.lifeSituation ?? null }),
    pain: Object.freeze({ painPoint: resolution.pain.painPoint }),
    awarenessStage: resolution.productionBrief.header.awareness,
    angle: Object.freeze({ angleText: resolution.angle.angleText }),
    hook: copyResult.hook,
    script: copyResult.script,
    voiceoverText: copyResult.voiceoverText,
    cta: copyResult.cta,
    format: creativeFormat,
    suggestedDeliveryFormat,
    platform: platform ?? (strategyContext.applied ? strategyContext.preferredPlatformProfile : null) ?? 'WHATSAPP_VIDEO',
    durationTargetSeconds: resolution.productionBrief.runtime,
    assetRequired: Object.freeze({ productImage: 'RECOMMENDED_NOT_REQUIRED', note: 'Sin fotografía real, la escena de producto usa tratamiento tipográfico (nunca fabrica packaging).' }),
    voiceoverRequired: true,
    variants: copyResult.variants,
    copyProvider: Object.freeze({ name: copyResult.provider, mode: copyResult.mode }),
    sourceRefs: Object.freeze({ cycleId: resolution.cycleId, creativeCellId: resolution.creativeCell.creativeCellId, productionBriefId: resolution.productionBrief.productionBriefId, matchScore: resolution.matchScore }),
    // Fase 11, Fase 17 (trazabilidad): Content -> StrategyContext ->
    // StrategyDecision -> StrategyFeedback(learningId) -> LearningRecord ->
    // MarketingInsight -> Performance/Attribution, siempre por IDs
    // estructurados, nunca reconstruida desde texto libre.
    strategyContext: strategyContext.applied
      ? Object.freeze({
          applied: true,
          strategyDecisionIds: strategyContext.strategyDecisionIds,
          learningIds: strategyContext.learningIds,
          strategicDirection: strategyContext.strategicDirection,
          confidence: strategyContext.confidence,
          scopeType: strategyContext.scopeType,
          rationale: strategyContext.rationale,
        })
      : Object.freeze({ applied: false, reason: strategyContext.reason }),
    missingFields: Object.freeze(missingFields),
    createdAt: new Date().toISOString(),
  });
}
