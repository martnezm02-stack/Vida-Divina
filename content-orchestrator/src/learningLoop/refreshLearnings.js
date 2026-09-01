// refreshLearnings.js — Learning Loop: motor de correlación. Lee (nunca
// modifica) tres sistemas ya existentes -- marketingIntelligence/ (señal
// externa), learning-strategy-engine/ (LearningRecord, desempeño propio ya
// mecanizado), y el store compartido de performance-learning-intelligence/
// (attribution_record crudo) -- y produce Learning (este módulo) + 0+
// CreativeRecommendation. NUNCA ejecuta last30days/WebSearch/HTTP: solo
// lee stores ya persistidos, síncrono.
//
// Estado real del entorno (documentado, no asumido): learning-strategy-engine/
// hoy solo tiene datos MEDIUM/UNKNOWN (nunca HIGH/LOW reales) y
// attribution-engine/ está 100% en UNKNOWN (sin revenue real) -- así que en
// la práctica la mayoría de los Learning producidos hoy serán MARKET-only
// o PERFORMANCE-only PRELIMINARY, no COMBINED. Eso es correcto y honesto,
// no un bug: el mecanismo de correlación está listo para cuando exista más
// evidencia propia real.

import { getMarketingIntelligence, listSnapshots as listMarketSnapshots } from '../marketingIntelligence/queryService.js';
import { listLearningRecords } from '../../../learning-strategy-engine/src/learningService.js';
import { performanceLearningStore as defaultPerformanceStore } from '../../../content-strategy/src/performanceLearningStoreInstance.js';
import { resolveProductIdFromCanonicalId } from '../productMatcher.js';
import { PRODUCT_IDS, getProductCategory } from '../marketingIntelligence/productCatalog.js';
import { CREATIVE_LEARNING_TYPES, combineEvidenceLevels, evidenceLevelFromMarketingConfidence, buildCreativeImplication } from './schema.js';
import { upsertLearning, saveRecommendation, listRecommendations, markContradiction, listLearnings, bumpLearningLoopVersion } from './learningStore.js';

// ---------------------------------------------------------------------
// Traducción slug <-> nombreComercial (mismo problema ya resuelto una vez
// por strategyContext.js: LearningRecord.product SIEMPRE guarda
// nombreComercial real, marketingIntelligence/ SIEMPRE guarda el slug de
// docs/productos/). Se construye UNA vez, perezosamente, desde hechos
// reales del catálogo (productMatcher.js) -- nunca un mapeo inventado a
// mano.
let _nombreComercialToSlug = null;
function nombreComercialToSlug(nombreComercial) {
  if (!nombreComercial) return null;
  if (!_nombreComercialToSlug) {
    _nombreComercialToSlug = new Map();
    for (const slug of PRODUCT_IDS) {
      const match = resolveProductIdFromCanonicalId(slug);
      if (match?.nombreComercial) _nombreComercialToSlug.set(match.nombreComercial, slug);
    }
  }
  return _nombreComercialToSlug.get(nombreComercial) ?? null;
}

// ---------------------------------------------------------------------
// Candidatos de MERCADO (marketingIntelligence/) -> CREATIVE_LEARNING_TYPES
// ---------------------------------------------------------------------
const MARKET_TYPE_MAP = Object.freeze({
  HookPattern: 'HOOK_LEARNING',
  CreativeAngleSignal: 'ANGLE_LEARNING',
  AudienceSignal: 'AUDIENCE_LEARNING',
  Objection: 'OBJECTION_LEARNING',
});

const FORMAT_KEYWORDS = /\breel\b|\bstory\b|\bstories\b|\bfeed\b|\bcarrusel\b|\bvideo corto\b|\blive shopping\b/i;
const TIMING_KEYWORDS = /\bhorario\b|\bhora\b|\bd[íi]a\b|\bcalendario\b|\bestacional\b|\bregreso a clases\b/i;
const STRUCTURE_KEYWORDS = /\bproblema\b.*\bsoluci[oó]n\b|\bestructura\b|\bantes\/despu[eé]s\b|\bhistoria\b/i;
const CTA_KEYWORDS = /\bcta\b|\bwhatsapp\b|\bcompra\b|\bcatalog/i;

function classifyContentPattern(signal) {
  const text = `${signal.title} ${signal.category ?? ''}`;
  if (FORMAT_KEYWORDS.test(text)) return 'FORMAT_LEARNING';
  if (TIMING_KEYWORDS.test(text)) return 'TIMING_LEARNING';
  if (STRUCTURE_KEYWORDS.test(text)) return 'STRUCTURE_LEARNING';
  return 'CONTENT_LEARNING';
}

function classifyPurchaseTrigger(signal) {
  return CTA_KEYWORDS.test(signal.title) ? 'CTA_LEARNING' : null; // sin evidencia de conversión real, un PurchaseTrigger de mercado nunca se clasifica CONVERSION_LEARNING por sí solo (sección 40: requiere publication+performance+attribution).
}

function scopeFromMarketSignal(signal) {
  if (signal.productId) return { scopeType: 'PRODUCT', productId: signal.productId, category: getProductCategory(signal.productId), audience: signal.audience ?? null };
  if (signal.category) return { scopeType: 'CATEGORY', productId: null, category: signal.category, audience: signal.audience ?? null };
  if (signal.audience) return { scopeType: 'AUDIENCE', productId: null, category: null, audience: signal.audience };
  return { scopeType: 'GENERAL', productId: null, category: null, audience: null };
}

/** Construye candidatos MARKET a partir del snapshot de mercado más reciente (o el pedido). Nunca lanza si no hay snapshot -- devuelve []. */
function buildMarketCandidates(snapshotId) {
  let resolvedSnapshotId = snapshotId;
  if (!resolvedSnapshotId) {
    const snapshots = listMarketSnapshots();
    if (snapshots.length === 0) return [];
    resolvedSnapshotId = snapshots[snapshots.length - 1];
  }

  const candidates = [];
  const pushCandidate = (signal, learningType) => {
    if (!learningType) return;
    const scope = scopeFromMarketSignal(signal);
    candidates.push({
      title: signal.title,
      description: signal.whyItMatters ?? signal.observation,
      learningType,
      sourceTypes: ['MARKET'],
      signalIds: [signal.id],
      ...scope,
      evidenceLevel: signal.evidenceLevel,
      evidenceCount: 1,
      pattern: signal.title,
      creativeImplication: buildCreativeImplication({ pattern: signal.title, scopeLabel: scope.productId ?? scope.category ?? scope.audience ?? null, combinedSourceType: 'MARKET' }),
    });
  };

  for (const [type, learningType] of Object.entries(MARKET_TYPE_MAP)) {
    for (const signal of getMarketingIntelligence({ snapshotId: resolvedSnapshotId, type })) pushCandidate(signal, learningType);
  }
  for (const signal of getMarketingIntelligence({ snapshotId: resolvedSnapshotId, type: 'ContentPattern' })) pushCandidate(signal, classifyContentPattern(signal));
  for (const signal of getMarketingIntelligence({ snapshotId: resolvedSnapshotId, type: 'PurchaseTrigger' })) pushCandidate(signal, classifyPurchaseTrigger(signal));
  for (const signal of [...getMarketingIntelligence({ snapshotId: resolvedSnapshotId, type: 'PainPoint' }), ...getMarketingIntelligence({ snapshotId: resolvedSnapshotId, type: 'DesireSignal' }), ...getMarketingIntelligence({ snapshotId: resolvedSnapshotId, type: 'TrendSignal' })]) {
    if (signal.productId || signal.category) pushCandidate(signal, 'PRODUCT_LEARNING'); // sección 29: sin producto/categoría real, no se fuerza un PRODUCT_LEARNING.
  }
  for (const signal of getMarketingIntelligence({ snapshotId: resolvedSnapshotId, type: 'CreativeOpportunity' })) pushCandidate(signal, 'CREATIVE_LEARNING');

  return candidates.map((c) => ({ ...c, marketSnapshotId: resolvedSnapshotId }));
}

// ---------------------------------------------------------------------
// Candidatos de DESEMPEÑO PROPIO (LearningRecord ya existente)
// ---------------------------------------------------------------------
// Mapeo DOCUMENTADO y auditable de LEARNING_TYPES (learning-strategy-engine,
// orientado a analítica) -> CREATIVE_LEARNING_TYPES (este módulo, orientado
// a estrategia creativa). DATA_QUALITY_LEARNING se excluye a propósito: es
// una señal sobre la calidad del propio pipeline de datos, no una
// implicación creativa real.
const PERFORMANCE_TYPE_MAP = Object.freeze({
  CONTENT_LEARNING: 'CONTENT_LEARNING',
  FORMAT_LEARNING: 'FORMAT_LEARNING',
  PLATFORM_LEARNING: 'FORMAT_LEARNING', // la plataforma condiciona la decisión de formato -- encaje conceptual más cercano entre los 12 tipos permitidos.
  PRODUCT_LEARNING: 'PRODUCT_LEARNING',
  COMMERCIAL_LEARNING: 'CONVERSION_LEARNING', // único tipo con evidencia comercial real detrás (decisionRules.js#hasRealCommercialEvidence ya lo exige aguas arriba).
  ENGAGEMENT_LEARNING: 'CTA_LEARNING',
  OPPORTUNITY_LEARNING: 'CREATIVE_LEARNING',
  STRATEGY_LEARNING: 'CREATIVE_LEARNING',
  PERFORMANCE_LEARNING: 'CONTENT_LEARNING',
  // DATA_QUALITY_LEARNING: excluido deliberadamente.
});

const HOOK_TEXT_PATTERN = /\bhook\b|\bpregunta\b|\bgancho\b/i;

function buildPerformanceCandidates(store) {
  const records = listLearningRecords({ store });
  const candidates = [];
  for (const record of records) {
    let learningType = PERFORMANCE_TYPE_MAP[record.learningType];
    if (!learningType) continue; // DATA_QUALITY_LEARNING u otro tipo no mapeado -- se omite, nunca se fuerza.
    const patternText = `${record.pattern ?? ''} ${record.observation ?? ''}`;
    if (HOOK_TEXT_PATTERN.test(patternText)) learningType = 'HOOK_LEARNING'; // refinamiento: un CONTENT_LEARNING sobre hooks/preguntas es más útil clasificado como HOOK_LEARNING.

    const productSlug = nombreComercialToSlug(record.product);
    candidates.push({
      title: record.observation ?? record.pattern ?? `LearningRecord ${record.id}`,
      description: record.implication ?? record.recommendation ?? '',
      learningType,
      sourceTypes: ['PERFORMANCE'],
      performanceIds: [record.id],
      contentIds: record.relatedContentIds ?? [],
      publicationIds: record.relatedPublicationIds ?? [],
      scopeType: productSlug ? 'PRODUCT' : (record.format || record.platform ? 'GENERAL' : 'GENERAL'),
      productId: productSlug,
      category: productSlug ? getProductCategory(productSlug) : null,
      audience: null, // LearningRecord no tiene campo audience -- nunca se inventa uno (sección 5, "no inventar relación").
      evidenceLevel: evidenceLevelFromMarketingConfidence(record.confidence),
      evidenceCount: record.evidenceCount ?? 1,
      pattern: record.pattern ?? record.observation ?? '',
      creativeImplication: buildCreativeImplication({ pattern: record.pattern ?? record.observation ?? 'patrón de desempeño', scopeLabel: productSlug, combinedSourceType: 'PERFORMANCE' }),
    });
  }
  return candidates;
}

// ---------------------------------------------------------------------
// Correlación MARKET + PERFORMANCE -> COMBINED (sección 9)
// ---------------------------------------------------------------------
function tokensOf(text) {
  return (text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((t) => t.length > 3);
}

function sameScope(a, b) {
  if (a.productId && b.productId) return a.productId === b.productId;
  if (a.category && b.category) return a.category === b.category;
  return a.scopeType === 'GENERAL' && b.scopeType === 'GENERAL';
}

function patternOverlaps(a, b) {
  const tokensA = new Set(tokensOf(a.pattern));
  const tokensB = tokensOf(b.pattern);
  return tokensB.some((t) => tokensA.has(t));
}

const POSITIVE_KEYWORDS = /\balta se[ñn]al\b|\bmejor\b|\bfunciona\b|\bretiene m[aá]s\b|\balto engagement\b|\brinde mejor\b/i;
const NEGATIVE_KEYWORDS = /\bobjeci[oó]n\b|\bescepticismo\b|\brebote\b|\briesgo\b|\bfatiga\b|\bsaturad[oa]\b|\bno funciona\b/i;
function polarityOf(candidate) {
  const text = `${candidate.title} ${candidate.description ?? ''}`;
  if (POSITIVE_KEYWORDS.test(text)) return 'POSITIVE';
  if (NEGATIVE_KEYWORDS.test(text)) return 'NEGATIVE';
  return null;
}

/**
 * Fusiona candidatos MARKET+PERFORMANCE que comparten learningType+scope+
 * patrón (sección 9) en un único candidato COMBINED. Los que no
 * correlacionan se devuelven tal cual (MARKET-only o PERFORMANCE-only).
 * Además detecta pares con polaridad opuesta para contradicción (sección
 * 17, 63) -- devueltos por separado, nunca fusionados entre sí.
 */
function correlateCandidates(marketCandidates, performanceCandidates) {
  const usedPerformance = new Set();
  const combined = [];
  const contradictionPairs = [];

  for (const marketCandidate of marketCandidates) {
    let merged = null;
    // Recorre TODOS los candidatos de desempeño del mismo learningType+scope
    // que realmente hablan del mismo patrón -- nunca se detiene en el
    // primero: una contradicción real puede estar en el segundo o tercero,
    // después de un match compatible con el primero (bug corregido: un
    // `break` temprano dejaba contradicciones reales sin detectar porque
    // la fusión con el primer candidato compatible cortaba la búsqueda).
    for (let i = 0; i < performanceCandidates.length; i += 1) {
      if (usedPerformance.has(i)) continue;
      const perfCandidate = performanceCandidates[i];
      if (perfCandidate.learningType !== marketCandidate.learningType) continue;
      if (!sameScope(marketCandidate, perfCandidate)) continue;
      if (!patternOverlaps(marketCandidate, perfCandidate)) continue; // solo compara polaridad/fusión entre candidatos que realmente hablan del mismo patrón.

      const polarityMarket = polarityOf(marketCandidate);
      const polarityPerf = polarityOf(perfCandidate);
      if (polarityMarket && polarityPerf && polarityMarket !== polarityPerf) {
        contradictionPairs.push([marketCandidate, perfCandidate]);
        continue; // contradictorios nunca se fusionan en un COMBINED falso -- pero se sigue buscando otro candidato compatible para fusionar.
      }

      if (!merged) {
        usedPerformance.add(i);
        merged = {
          title: marketCandidate.title,
          description: `${marketCandidate.description ?? ''} | Desempeño propio: ${perfCandidate.description ?? ''}`.trim(),
          learningType: marketCandidate.learningType,
          sourceTypes: ['MARKET', 'PERFORMANCE'],
          signalIds: marketCandidate.signalIds,
          performanceIds: perfCandidate.performanceIds,
          contentIds: perfCandidate.contentIds,
          publicationIds: perfCandidate.publicationIds,
          scopeType: marketCandidate.scopeType,
          productId: marketCandidate.productId ?? perfCandidate.productId,
          category: marketCandidate.category ?? perfCandidate.category,
          audience: marketCandidate.audience,
          evidenceLevel: combineEvidenceLevels(marketCandidate.evidenceLevel, perfCandidate.evidenceLevel),
          evidenceCount: marketCandidate.evidenceCount + perfCandidate.evidenceCount,
          pattern: marketCandidate.pattern,
          creativeImplication: buildCreativeImplication({ pattern: marketCandidate.pattern, scopeLabel: marketCandidate.productId ?? marketCandidate.category ?? null, combinedSourceType: 'COMBINED' }),
        };
      }
    }
    combined.push(merged ?? marketCandidate);
  }

  const leftoverPerformance = performanceCandidates.filter((_, i) => !usedPerformance.has(i));
  return { finalCandidates: [...combined, ...leftoverPerformance], contradictionPairs };
}

// ---------------------------------------------------------------------
// CreativeRecommendation desde Learnings confirmados
// ---------------------------------------------------------------------
const RECOMMENDATION_ELIGIBLE_TYPES = Object.freeze(['HOOK_LEARNING', 'ANGLE_LEARNING', 'STRUCTURE_LEARNING', 'CREATIVE_LEARNING', 'CONTENT_LEARNING']);
const PRIORITY_BY_EVIDENCE_LEVEL = Object.freeze({ HIGH: 'P1', 'MEDIUM-HIGH': 'P1', MEDIUM: 'P2', 'LOW-MEDIUM': 'P3', LOW: 'P3' });

function buildRecommendationsFromLearnings(learnings) {
  // Idempotencia (sección 49): una recomendación ya existente para el
  // MISMO learningId no se vuelve a crear -- distinto candidato lo sería
  // (ej. el learning se reforzó y ya no es el mismo estado), pero
  // re-ejecutar refreshLearnings() sobre estado sin cambios no debe
  // producir CreativeRecommendation duplicadas.
  const alreadyRecommendedLearningIds = new Set(listRecommendations().flatMap((r) => r.learningIds));
  const created = [];
  for (const learning of learnings) {
    if (learning.status !== 'CONFIRMED') continue; // sección 20/59: solo learnings ya suficientemente soportados generan recomendación.
    if (!RECOMMENDATION_ELIGIBLE_TYPES.includes(learning.learningType)) continue;
    if (alreadyRecommendedLearningIds.has(learning.id)) continue;
    created.push(saveRecommendation({
      title: `Recomendación creativa: ${learning.title}`,
      learningIds: [learning.id],
      productId: learning.productId,
      audience: learning.audience,
      angle: learning.learningType === 'ANGLE_LEARNING' ? learning.title : null,
      hookPattern: learning.learningType === 'HOOK_LEARNING' ? learning.title : null,
      structurePattern: learning.learningType === 'STRUCTURE_LEARNING' ? learning.title : null,
      contentPattern: (learning.learningType === 'CONTENT_LEARNING' || learning.learningType === 'CREATIVE_LEARNING') ? learning.title : null,
      evidenceLevel: learning.evidenceLevel,
      rationale: learning.creativeImplication,
      priority: PRIORITY_BY_EVIDENCE_LEVEL[learning.evidenceLevel] ?? 'P3',
    }));
  }
  return created;
}

/**
 * Orquestador principal (sección 48): analiza Market Intelligence +
 * LearningRecord (desempeño propio ya mecanizado) YA PERSISTIDOS, produce/
 * refuerza Learning, detecta contradicciones, genera CreativeRecommendation,
 * y avanza la versión del Learning Loop. NUNCA ejecuta last30days ni
 * ninguna llamada externa -- ni siquiera indirectamente (no dispara
 * generateAndPersistLearning/generateAndPersistMarketingIntelligence, que sí
 * PODRÍAN existir como pasos previos en OTRO comando -- este refresh solo
 * LEE lo que esos pasos ya hayan dejado persistido).
 */
export function refreshLearnings({ marketingSnapshotId = null, performanceStore = defaultPerformanceStore } = {}) {
  const marketCandidates = buildMarketCandidates(marketingSnapshotId);
  const performanceCandidates = buildPerformanceCandidates(performanceStore);
  const { finalCandidates, contradictionPairs } = correlateCandidates(marketCandidates, performanceCandidates);

  const upserted = finalCandidates.map((c) => upsertLearning(c));

  // Idempotencia (sección 49): solo se cuenta/marca una contradicción
  // GENUINAMENTE nueva -- si el par ya estaba marcado en una corrida
  // anterior (mismo par de ids ya presente en contradictedBy), re-marcarlo
  // sería inflar contradictionsDetected sin evidencia nueva.
  const contradictionsMarked = [];
  for (const [a, b] of contradictionPairs) {
    const learningA = upsertLearning(a);
    const learningB = upsertLearning(b);
    if (learningA.id !== learningB.id && !learningA.contradictedBy.includes(learningB.id)) {
      markContradiction(learningA.id, learningB.id);
      contradictionsMarked.push([learningA.id, learningB.id]);
    }
  }

  const recommendations = buildRecommendationsFromLearnings(listLearnings());
  const manifest = bumpLearningLoopVersion();

  return Object.freeze({
    manifest,
    learningsProcessed: upserted.length,
    contradictionsDetected: contradictionsMarked.length,
    recommendationsCreated: recommendations.length,
  });
}
