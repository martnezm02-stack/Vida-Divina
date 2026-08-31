// queryService.js — Marketing Intelligence: API interna de consulta y
// ranking sobre la inteligencia YA almacenada (sección 3 del encargo: "API"
// significa interfaz interna del módulo, no un endpoint HTTP).
//
// NINGUNA función de este archivo ejecuta last30days, WebSearch, ni
// cualquier otra llamada externa -- solo lee content-orchestrator/data/
// marketing-intelligence/ (secciones 27, 48: "no live research", "no
// magic research"). Si el store no tiene datos, estas funciones devuelven
// resultados vacíos o lanzan un error explícito -- nunca disparan una
// búsqueda para "rellenar" el vacío.

import { listSignals } from './signalStore.js';
import { createSnapshot as _createSnapshot, getSnapshotManifest, listSnapshots } from './snapshotStore.js';
import { listOpportunities } from './creativeOpportunityStore.js';
import { getProductCategory } from './productCatalog.js';
import { determineProductFit, computeIntelligenceScore, PRODUCT_FIT_SCORE, compareByScoreThenTitle } from './ranking.js';
import { classifySignalStaleness } from './staleness.js';

export { listSnapshots };

function resolveSnapshotId(snapshotId) {
  if (snapshotId) return snapshotId;
  const snapshots = listSnapshots();
  if (snapshots.length === 0) {
    throw new Error('resolveSnapshotId: no existe ningún snapshot todavía -- correr ingestMarketingIntelligenceSnapshot20260831.mjs (o el script del snapshot vigente) antes de consultar.');
  }
  return snapshots[snapshots.length - 1]; // "snapshot-YYYY-MM-DD" ordena lexicográficamente = orden cronológico; el último es el más reciente.
}

function enrich(signal, { productId = null, now = Date.now() } = {}) {
  const staleness = classifySignalStaleness(signal, now);
  const productFit = productId ? determineProductFit(signal, productId) : null;
  const relevance = productId ? PRODUCT_FIT_SCORE[productFit] : 1;
  const intelligenceScore = computeIntelligenceScore(signal, { productId, now });
  return { ...signal, staleness, productFit, relevance, intelligenceScore };
}

/**
 * Consulta genérica -- todos los demás getX() de este archivo se apoyan en
 * esta función. Filtros soportados (sección 12): productId, category,
 * audience, type, source, evidenceLevel, minConfidence, timeWindow,
 * signalStrength, staleness, tag. `limit` trunca DESPUÉS de rankear.
 */
export function getMarketingIntelligence(filters = {}) {
  const {
    snapshotId, productId, category, audience, type, source, evidenceLevel,
    minConfidence, timeWindow, signalStrength, staleness, tag, limit,
  } = filters;

  const resolvedSnapshotId = resolveSnapshotId(snapshotId);
  const now = Date.now();

  let signals = listSignals(resolvedSnapshotId);
  if (productId !== undefined) signals = signals.filter((s) => determineProductFit(s, productId) !== 'NOT_RELEVANT');
  if (category !== undefined) signals = signals.filter((s) => s.category === category);
  if (audience !== undefined) signals = signals.filter((s) => s.audience === audience);
  if (type !== undefined) signals = signals.filter((s) => s.type === type);
  if (source !== undefined) signals = signals.filter((s) => s.source === source);
  if (evidenceLevel !== undefined) signals = signals.filter((s) => s.evidenceLevel === evidenceLevel);
  if (minConfidence !== undefined) signals = signals.filter((s) => s.confidence >= minConfidence);
  if (timeWindow !== undefined) signals = signals.filter((s) => s.timeWindow === timeWindow);
  if (signalStrength !== undefined) signals = signals.filter((s) => s.signalStrength === signalStrength);
  if (tag !== undefined) signals = signals.filter((s) => s.tags.includes(tag));

  let ranked = signals.map((s) => enrich(s, { productId, now })).sort(compareByScoreThenTitle);
  if (staleness !== undefined) ranked = ranked.filter((s) => s.staleness === staleness);

  return limit ? ranked.slice(0, limit) : ranked;
}

const PRODUCT_INTELLIGENCE_BUCKETS = Object.freeze([
  ['trends', 'TrendSignal'],
  ['audienceSignals', 'AudienceSignal'],
  ['painPoints', 'PainPoint'],
  ['desires', 'DesireSignal'],
  ['objections', 'Objection'],
  ['hookPatterns', 'HookPattern'],
  ['contentPatterns', 'ContentPattern'],
  ['creativeAngleSignals', 'CreativeAngleSignal'],
  ['competitorSignals', 'CompetitorSignal'],
  ['creatorSignals', 'CreatorSignal'],
  ['purchaseTriggers', 'PurchaseTrigger'],
  ['brandSignals', 'BrandSignal'],
  ['regulatoryRisks', 'RegulatoryRisk'],
  ['catalogDiscrepancies', 'CatalogDiscrepancy'],
]);

/**
 * Inteligencia completa de un producto, rankeada por bucket (sección 9).
 * Incluye señales DIRECT_PRODUCT + CATEGORY + GENERAL (ver
 * ranking.js#determineProductFit) -- nunca señales de OTRO producto/
 * categoría específica.
 */
export function getProductIntelligence(productId, opts = {}) {
  const { snapshotId, limit } = opts;
  const resolvedSnapshotId = resolveSnapshotId(snapshotId);
  const result = {
    productId,
    category: getProductCategory(productId),
    snapshotId: resolvedSnapshotId,
  };
  for (const [key, type] of PRODUCT_INTELLIGENCE_BUCKETS) {
    result[key] = getMarketingIntelligence({ snapshotId: resolvedSnapshotId, productId, type, limit });
  }
  result.creativeOpportunities = getCreativeOpportunities({ snapshotId: resolvedSnapshotId, productId, limit });
  return result;
}

/** Inteligencia de una audiencia (sección 22) -- solo desde datos existentes con audience === el valor exacto pedido. */
export function getAudienceIntelligence(audience, opts = {}) {
  const { snapshotId, limit } = opts;
  const resolvedSnapshotId = resolveSnapshotId(snapshotId);
  return {
    audience,
    snapshotId: resolvedSnapshotId,
    painPoints: getMarketingIntelligence({ snapshotId: resolvedSnapshotId, audience, type: 'PainPoint', limit }),
    desires: getMarketingIntelligence({ snapshotId: resolvedSnapshotId, audience, type: 'DesireSignal', limit }),
    objections: getMarketingIntelligence({ snapshotId: resolvedSnapshotId, audience, type: 'Objection', limit }),
    relevantTrends: getMarketingIntelligence({ snapshotId: resolvedSnapshotId, audience, type: 'TrendSignal', limit }),
    contentPatterns: getMarketingIntelligence({ snapshotId: resolvedSnapshotId, audience, type: 'ContentPattern', limit }),
    creativeOpportunities: getCreativeOpportunities({ snapshotId: resolvedSnapshotId, audience, limit }),
  };
}

/** Señales de tendencia (sección 23), con dirección/evidencia/productos-categorías afectados. */
export function getTrendIntelligence(filters = {}) {
  return getMarketingIntelligence({ ...filters, type: 'TrendSignal' }).map((s) => ({
    id: s.id,
    title: s.title,
    direction: s.details?.direction ?? null,
    confidence: s.confidence,
    evidenceLevel: s.evidenceLevel,
    intelligenceScore: s.intelligenceScore,
    productId: s.productId,
    category: s.category,
    source: s.source,
    observation: s.observation,
    rawReference: s.rawReference,
  }));
}

const OPPORTUNITY_PRIORITY_BOOST = Object.freeze({ P0: 1.0, P1: 0.8, P2: 0.6, P3: 0.4 });

/**
 * CreativeOpportunity rankeadas + explicación WHAT/WHY/FOR WHOM/PRODUCT/
 * EVIDENCE/CONFIDENCE/CREATIVE USE (sección 21) -- reexpone campos ya
 * existentes (angle/hookPattern/contentPattern), nunca genera copy nuevo.
 */
export function getCreativeOpportunities(opts = {}) {
  const { snapshotId, productId, audience, limit } = opts;
  const resolvedSnapshotId = resolveSnapshotId(snapshotId);
  const now = Date.now();

  let opportunities = listOpportunities(resolvedSnapshotId);
  if (productId !== undefined) opportunities = opportunities.filter((o) => o.product === productId || o.product === null);
  if (audience !== undefined) opportunities = opportunities.filter((o) => o.audience === audience || o.audience === null);

  const signalsById = new Map(listSignals(resolvedSnapshotId).map((s) => [s.id, s]));

  const enriched = opportunities.map((o) => {
    const referencedSignals = o.signalIds.map((id) => signalsById.get(id)).filter(Boolean);
    const avgSignalScore = referencedSignals.length
      ? referencedSignals.reduce((sum, s) => sum + computeIntelligenceScore(s, { productId: o.product, now }), 0) / referencedSignals.length
      : 0;
    const priorityBoost = OPPORTUNITY_PRIORITY_BOOST[o.priority] ?? 0.5;
    const intelligenceScore = Math.max(0, Math.min(1, Number((o.confidence * 0.4 + avgSignalScore * 0.4 + priorityBoost * 0.2).toFixed(4))));

    return {
      ...o,
      intelligenceScore,
      explanation: {
        what: o.title,
        why: o.rationale,
        forWhom: o.audience,
        product: o.product,
        evidence: referencedSignals.map((s) => ({
          id: s.id, type: s.type, title: s.title, source: s.source, evidenceLevel: s.evidenceLevel, rawReference: s.rawReference,
        })),
        confidence: o.confidence,
        creativeUse: { angle: o.angle, hookPattern: o.hookPattern, contentPattern: o.contentPattern },
      },
    };
  });

  const sorted = enriched.sort((a, b) => (b.intelligenceScore - a.intelligenceScore) || a.title.localeCompare(b.title));
  return limit ? sorted.slice(0, limit) : sorted;
}

/** Snapshot + conteos agregados (sección 24) -- lectura, nunca recalcula el store. */
export function getSnapshot(snapshotId) {
  const manifest = getSnapshotManifest(snapshotId);
  const signals = listSignals(snapshotId);
  const opportunities = listOpportunities(snapshotId);
  const byType = {};
  for (const s of signals) byType[s.type] = (byType[s.type] ?? 0) + 1;
  return { ...manifest, signalCount: signals.length, opportunityCount: opportunities.length, byType };
}

/**
 * Compara dos snapshots por dedupeKey (sección 25): NEW / DISAPPEARED /
 * RISING (confidence o sourceCount subió) / DECLINING (confidence bajó) /
 * STABLE. Si no se pasan ambos ids, intenta usar los DOS snapshots más
 * recientes; si existe menos de dos en total, responde honestamente que
 * la comparación no está disponible -- nunca inventa un segundo snapshot.
 */
export function compareSnapshots(snapshotIdA, snapshotIdB) {
  let a = snapshotIdA;
  let b = snapshotIdB;
  if (!a || !b) {
    const all = listSnapshots();
    if (all.length < 2) {
      return { comparisonAvailable: false, reason: 'comparison unavailable — only one snapshot exists', snapshotsFound: all };
    }
    [a, b] = all.slice(-2);
  }

  const known = listSnapshots();
  if (!known.includes(a) || !known.includes(b)) {
    throw new Error(`compareSnapshots: uno de los snapshots no existe (recibido "${a}", "${b}"; existentes: ${known.join(', ')}).`);
  }

  const signalsA = new Map(listSignals(a).map((s) => [s.dedupeKey, s]));
  const signalsB = new Map(listSignals(b).map((s) => [s.dedupeKey, s]));
  const allKeys = new Set([...signalsA.keys(), ...signalsB.keys()]);

  const changes = [];
  for (const key of allKeys) {
    const inA = signalsA.get(key);
    const inB = signalsB.get(key);
    if (!inA && inB) { changes.push({ dedupeKey: key, type: inB.type, title: inB.title, status: 'NEW' }); continue; }
    if (inA && !inB) { changes.push({ dedupeKey: key, type: inA.type, title: inA.title, status: 'DISAPPEARED' }); continue; }
    if (inB.confidence > inA.confidence || inB.sourceCount > inA.sourceCount) {
      changes.push({
        dedupeKey: key, type: inB.type, title: inB.title, status: 'RISING',
        from: { confidence: inA.confidence, sourceCount: inA.sourceCount },
        to: { confidence: inB.confidence, sourceCount: inB.sourceCount },
      });
    } else if (inB.confidence < inA.confidence) {
      changes.push({
        dedupeKey: key, type: inB.type, title: inB.title, status: 'DECLINING',
        from: { confidence: inA.confidence }, to: { confidence: inB.confidence },
      });
    } else {
      changes.push({ dedupeKey: key, type: inB.type, title: inB.title, status: 'STABLE' });
    }
  }

  return { comparisonAvailable: true, snapshotA: a, snapshotB: b, changes };
}
