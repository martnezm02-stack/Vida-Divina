// creativeIntelligenceContext.js — Puente controlado entre Marketing
// Intelligence (marketingIntelligence/queryService.js, snapshot ya
// ingerido) y el Creative Pipeline (creativeDirector.js, autonomousCreate.js).
//
// MISMO CRITERIO que strategyContext.js: una capa de contexto pequeña,
// ADITIVA y OPCIONAL -- nunca reimplementa Marketing Intelligence, solo lee
// lo ya persistido (snapshot ya ingerido, sin red) y estructura un
// subconjunto compacto y rankeado. Nunca lanza por ausencia de datos
// (`applied:false` es un resultado válido, mismo contrato que
// buildStrategyContext).
//
// PRINCIPIO NO NEGOCIABLE (encargo §2): Marketing Intelligence es una
// INPUT STRATEGIC SIGNAL, nunca una COPY SOURCE ni una CLAIM AUTHORITY.
// Esta función NUNCA genera claims/hooks/scripts/prompts finales -- solo
// selecciona y compacta señales YA ALMACENADAS, con su evidencia intacta,
// para que el Creative Pipeline las pueda CONSULTAR. Los claims siguen
// gobernados exclusivamente por Product Knowledge + Claim Relevance +
// Claim Safety (video-production/src/hyperframesRenderer.js,
// content-orchestrator/src/brandVisualSystem.js) -- ninguno de los dos se
// toca ni se referencia aquí.
//
// Orden de prioridad conceptual (encargo §35) -- documental, no una regla
// que este archivo ejecute por sí solo (Claim Safety/Product Knowledge ya
// se aplican en otros archivos; Creative Intelligence nunca los precede):
export const CREATIVE_CONTEXT_PRIORITY_ORDER = Object.freeze([
  'CLAIM_SAFETY', 'PRODUCT_KNOWLEDGE', 'USER_INSTRUCTION', 'CAMPAIGN_CONTEXT', 'CREATIVE_INTELLIGENCE', 'DEFAULTS',
]);

import { getProductIntelligence, getAudienceIntelligence, getCreativeOpportunities } from './marketingIntelligence/queryService.js';
// Learning Loop (sección 23-24 del encargo de integración de aprendizaje):
// extiende este contexto con validatedLearningContext -- NUNCA un segundo
// contexto paralelo. Mismo criterio de solo-lectura/nunca-lanza que el
// resto de este archivo.
import { getValidatedLearningContext } from './learningLoop/queryService.js';

export const CREATIVE_INTELLIGENCE_VERSION = '1.0.0';

// Única fuente de configuración de este puente (mismo criterio que
// rankingConfig.js en marketingIntelligence/: nunca repartir umbrales por
// múltiples archivos).
export const CREATIVE_INTELLIGENCE_CONFIG = Object.freeze({
  maxPerBucket: 5,
  relevanceThreshold: 0.35,
  contextScoreWeights: Object.freeze({ relevanceToCampaign: 0.6, intelligenceScore: 0.4 }),
});

const BUCKET_SPECS = Object.freeze([
  ['trends', 'trends'],
  ['pains', 'painPoints'],
  ['desires', 'desires'],
  ['objections', 'objections'],
  ['hookPatterns', 'hookPatterns'],
  ['contentPatterns', 'contentPatterns'],
  ['competitorSignals', 'competitorSignals'],
  ['creatorSignals', 'creatorSignals'],
  ['purchaseTriggers', 'purchaseTriggers'],
  ['regulatoryRisks', 'regulatoryRisks'],
]);

const GENDER_PREFIXES = Object.freeze(['mujeres', 'hombres']);

function genderOf(audienceValue) {
  if (!audienceValue) return null;
  return GENDER_PREFIXES.find((p) => audienceValue.startsWith(p)) ?? null;
}

/**
 * Audience fit (encargo §6): "no mezclar men con women si la campaña tiene
 * una audiencia definida". Solo actúa cuando AMBOS lados están
 * explícitamente clasificados por género en el vocabulario del schema
 * (`mujeres-...`/`hombres-...`) -- nunca adivina género de texto libre, y
 * nunca excluye por ausencia de dato (eso sería inventar una
 * incompatibilidad que no existe).
 */
function isOppositeGenderAudience(signalAudience, campaignAudience) {
  const g1 = genderOf(signalAudience);
  const g2 = genderOf(campaignAudience);
  if (!g1 || !g2) return false;
  return g1 !== g2;
}

function tokensOf(text) {
  return (text ?? '').toLowerCase().split(/[^a-záéíóúñ0-9]+/i).filter((t) => t.length > 3);
}

/**
 * relevanceToCampaign en [0,1] -- DISTINTO de intelligenceScore (encargo
 * §37: "mantener separados"). intelligenceScore mide calidad/ranking de la
 * señal en abstracto (marketingIntelligence/ranking.js, nunca recalculado
 * aquí); relevanceToCampaign mide qué tan útil es ESA señal para ESTA
 * campaña concreta (producto/audiencia/categoría/ángulo/instrucción).
 * Determinista: mismos inputs -> mismo resultado siempre.
 */
function computeRelevanceToCampaign(signal, { audience, category, angleText, instructionTokens }) {
  if (isOppositeGenderAudience(signal.audience, audience)) return 0;

  let score = 0.5; // ya pasó el filtro de productFit (nunca NOT_RELEVANT) -- relevancia base real, no cero.
  if (audience && signal.audience === audience) score += 0.3;
  if (category && signal.category && signal.category === category) score += 0.1;

  if (angleText) {
    const haystack = `${signal.title} ${(signal.tags ?? []).join(' ')} ${signal.category ?? ''}`.toLowerCase();
    const angleTokens = tokensOf(angleText);
    if (angleTokens.length > 0 && angleTokens.some((t) => haystack.includes(t))) score += 0.1;
  }

  if (instructionTokens.length > 0) {
    const haystack = `${signal.title} ${signal.observation ?? ''}`.toLowerCase();
    if (instructionTokens.some((t) => haystack.includes(t))) score += 0.05;
  }

  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}

function creativeContextScore(relevanceToCampaign, intelligenceScore) {
  const w = CREATIVE_INTELLIGENCE_CONFIG.contextScoreWeights;
  return Number((relevanceToCampaign * w.relevanceToCampaign + intelligenceScore * w.intelligenceScore).toFixed(4));
}

/** Proyección COMPACTA (encargo §10, §27): nunca el registro completo del store -- solo lo que el pipeline creativo necesita para razonar y trazar. */
function projectSignal(signal, scoring) {
  return Object.freeze({
    signalId: signal.id,
    type: signal.type,
    title: signal.title,
    source: signal.source,
    sourceUrl: signal.sourceUrl,
    rawReference: signal.rawReference,
    evidenceLevel: signal.evidenceLevel,
    confidence: signal.confidence, // NUNCA recalculado (encargo §8, §26) -- el mismo valor fijo de schema.js.
    claimType: signal.claimType,
    productFit: signal.productFit,
    whyItMatters: signal.whyItMatters ?? signal.observation,
    intelligenceScore: signal.intelligenceScore, // preservado tal cual (encargo §38) -- nunca sobrescrito por creativeContextScore.
    relevanceToCampaign: scoring.relevanceToCampaign,
    creativeContextScore: scoring.creativeContextScore,
  });
}

function projectOpportunity(opportunity, scoring) {
  return Object.freeze({
    opportunityId: opportunity.id,
    title: opportunity.title,
    angle: opportunity.angle,
    hookPattern: opportunity.hookPattern,
    contentPattern: opportunity.contentPattern,
    priority: opportunity.priority,
    evidenceLevel: opportunity.evidenceLevel,
    confidence: opportunity.confidence,
    rationale: opportunity.rationale,
    forWhom: opportunity.audience,
    product: opportunity.product,
    evidence: opportunity.explanation?.evidence ?? Object.freeze([]),
    intelligenceScore: opportunity.intelligenceScore,
    relevanceToCampaign: scoring.relevanceToCampaign,
    creativeContextScore: scoring.creativeContextScore,
  });
}

function rankAndTrim(items, projector, relevanceInputs) {
  const scored = items
    .map((item) => {
      const relevanceToCampaign = computeRelevanceToCampaign(item, relevanceInputs);
      const score = creativeContextScore(relevanceToCampaign, item.intelligenceScore);
      return { item, relevanceToCampaign, score };
    })
    .filter(({ relevanceToCampaign, score }) => relevanceToCampaign > 0 && score >= CREATIVE_INTELLIGENCE_CONFIG.relevanceThreshold)
    .sort((a, b) => (b.score - a.score) || a.item.title.localeCompare(b.item.title))
    .slice(0, CREATIVE_INTELLIGENCE_CONFIG.maxPerBucket);

  return Object.freeze(scored.map(({ item, relevanceToCampaign, score }) => projector(item, { relevanceToCampaign, creativeContextScore: score })));
}

function summarizeConfidence(allProjectedSignals) {
  if (allProjectedSignals.length === 0) return Object.freeze({ level: null, distribution: Object.freeze({}) });
  const distribution = {};
  for (const s of allProjectedSignals) distribution[s.evidenceLevel] = (distribution[s.evidenceLevel] ?? 0) + 1;
  const level = Object.entries(distribution).sort((a, b) => b[1] - a[1])[0][0]; // moda -- descriptivo, nunca una "nueva medición" (encargo §16).
  return Object.freeze({ level, distribution: Object.freeze(distribution) });
}

function collectSources(allProjectedSignals) {
  const seen = new Map();
  for (const s of allProjectedSignals) {
    const key = s.source;
    if (!seen.has(key)) seen.set(key, s.source);
  }
  return Object.freeze([...seen.values()]);
}

const EMPTY_BUCKETS = Object.freeze(Object.fromEntries(BUCKET_SPECS.map(([outKey]) => [outKey, Object.freeze([])])));
const EMPTY_VALIDATED_LEARNING_CONTEXT = Object.freeze({ applied: false, learningSnapshotId: null, learningLoopVersion: null, learnings: Object.freeze([]) });

/** getValidatedLearningContext ya nunca lanza (learningLoop/queryService.js), pero se envuelve igual -- esta función es "aditiva y opcional" por contrato, así que ni siquiera un bug en el Learning Loop puede bloquear el contexto de mercado. */
function safeGetValidatedLearningContext(args) {
  try {
    return getValidatedLearningContext(args);
  } catch {
    return EMPTY_VALIDATED_LEARNING_CONTEXT;
  }
}

function emptyContext(reason, { productId = null, audience = null, category = null, validatedLearningContext = EMPTY_VALIDATED_LEARNING_CONTEXT } = {}) {
  return Object.freeze({
    applied: false,
    reason,
    product: productId,
    audience,
    category,
    ...EMPTY_BUCKETS,
    creativeOpportunities: Object.freeze([]),
    confidence: Object.freeze({ level: null, distribution: Object.freeze({}) }),
    sources: Object.freeze([]),
    snapshotId: null,
    intelligenceVersion: CREATIVE_INTELLIGENCE_VERSION,
    generatedAt: new Date().toISOString(),
    validatedLearningContext,
  });
}

/**
 * Construye el contexto estratégico compacto para UNA campaña. Nunca llama
 * last30days/WebSearch/HTTP -- solo lee el store de marketingIntelligence/
 * ya poblado (queryService.js, síncrono, sin red). Nunca lanza: sin
 * snapshot, sin productId, o sin señales relevantes, `applied:false` es un
 * resultado válido (mismo contrato que buildStrategyContext).
 *
 * @param {{productId?:string|null, audience?:string|null, category?:string|null,
 *   userInstruction?:string|null, primaryAngle?:string|null, secondaryAngle?:string|null,
 *   snapshotId?:string|null}} params
 */
export function buildCreativeIntelligenceContext({
  productId = null, audience = null, category = null,
  userInstruction = null, primaryAngle = null, secondaryAngle = null,
  snapshotId = null,
} = {}) {
  if (!productId && !audience) return emptyContext('NO_PRODUCT_OR_AUDIENCE', { productId, audience, category });

  let productIntelligence = null;
  let audienceIntelligence = null;
  let opportunities = [];
  let resolvedSnapshotId = snapshotId ?? null;
  let resolvedCategory = category;

  try {
    // Si marketingIntelligence/ no tiene ningún snapshot todavía,
    // getProductIntelligence/getAudienceIntelligence lanzan -- se captura
    // aquí y se convierte en `applied:false`, nunca se propaga (encargo
    // §23: "no bloquear una campaña por ausencia de intelligence").
    if (productId) {
      productIntelligence = getProductIntelligence(productId, { snapshotId: snapshotId ?? undefined });
      resolvedSnapshotId = productIntelligence.snapshotId;
      resolvedCategory = category ?? productIntelligence.category ?? null;
      opportunities = getCreativeOpportunities({ snapshotId: resolvedSnapshotId, productId });
    } else {
      audienceIntelligence = getAudienceIntelligence(audience, { snapshotId: snapshotId ?? undefined });
      resolvedSnapshotId = audienceIntelligence.snapshotId;
      opportunities = getCreativeOpportunities({ snapshotId: resolvedSnapshotId, audience });
    }
  } catch (err) {
    const validatedLearningContext = safeGetValidatedLearningContext({ productId, audience, category, userInstruction });
    return emptyContext(`NO_SNAPSHOT_AVAILABLE (${err.message})`, { productId, audience, category, validatedLearningContext });
  }

  const angleText = [primaryAngle, secondaryAngle].filter(Boolean).join(' ');
  const instructionTokens = tokensOf(userInstruction);
  const relevanceInputs = { audience, category: resolvedCategory, angleText, instructionTokens };

  // Learning Loop (encargo de integración de aprendizaje, §23-24):
  // calculado independientemente de si marketingIntelligence/ encontró
  // señales para esta consulta -- un Learning puede seguir siendo
  // relevante aunque el snapshot de mercado actual no tenga señal directa
  // (ej. un learning PERFORMANCE-only).
  const validatedLearningContext = safeGetValidatedLearningContext({ productId, audience, category: resolvedCategory, userInstruction });

  const buckets = {};
  const allProjected = [];
  for (const [outKey, sourceKey] of BUCKET_SPECS) {
    const rawItems = productId ? (productIntelligence[sourceKey] ?? []) : (audienceIntelligence[sourceKey] ?? []);
    const projected = rankAndTrim(rawItems, projectSignal, relevanceInputs);
    buckets[outKey] = projected;
    allProjected.push(...projected);
  }

  const projectedOpportunities = rankAndTrim(opportunities, projectOpportunity, relevanceInputs);

  const hasAnySignal = allProjected.length > 0 || projectedOpportunities.length > 0;
  if (!hasAnySignal && !validatedLearningContext.applied) {
    return emptyContext('NO_RELEVANT_SIGNALS', { productId, audience, category: resolvedCategory, validatedLearningContext });
  }

  return Object.freeze({
    applied: true,
    product: productId,
    audience,
    category: resolvedCategory,
    ...buckets,
    creativeOpportunities: projectedOpportunities,
    confidence: summarizeConfidence(allProjected),
    sources: collectSources(allProjected),
    validatedLearningContext,
    snapshotId: resolvedSnapshotId,
    intelligenceVersion: CREATIVE_INTELLIGENCE_VERSION,
    generatedAt: new Date().toISOString(),
  });
}
