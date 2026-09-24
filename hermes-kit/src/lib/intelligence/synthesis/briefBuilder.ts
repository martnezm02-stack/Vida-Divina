// briefBuilder.ts — Construye el Intelligence Brief y el Creative
// Intelligence Contract (MI-5, secciones 12-13). Funciones puras y
// serializables sobre insights/patterns/relevantContext ya generados y
// persistidos -- no crean tabla propia, no repiten trabajo de MI-1..MI-4.
//
// NO genera rankings de competidores (nunca "mejor"/"peor"/"ganador") --
// competitor_landscape representa evidencia y patrones, nunca una
// evaluación comparativa.
import { getActorById } from "../actors";
import { listMetricsHistory } from "../metrics";
import { getPatternSupportingActors } from "../detection";
import type { Insight, IntelligenceItemWithDerived, Pattern } from "../types";
import { generateInsights } from "./insightService";
import type {
  BuildBriefOptions,
  CompetitorLandscapeEntry,
  CreativeIntelligenceBrief,
  CreativeSignals,
  GenerateInsightsOutcome,
  GenerateInsightsRequest,
  IntelligenceBrief,
  RelevantContext,
} from "./types";

const CREATIVE_FIELDS = ["hook", "angle", "cta", "offer", "format"] as const;

function collectCreativeSignals(items: IntelligenceItemWithDerived[], itemIds: Set<number>): CreativeSignals {
  const signals: CreativeSignals = { hooks: [], angles: [], ctas: [], offers: [], formats: [] };
  const seen: Record<(typeof CREATIVE_FIELDS)[number], Set<string>> = {
    hook: new Set(),
    angle: new Set(),
    cta: new Set(),
    offer: new Set(),
    format: new Set(),
  };
  const targetLists: Record<(typeof CREATIVE_FIELDS)[number], string[]> = {
    hook: signals.hooks,
    angle: signals.angles,
    cta: signals.ctas,
    offer: signals.offers,
    format: signals.formats,
  };

  for (const item of items) {
    if (!itemIds.has(item.id)) continue;
    for (const field of CREATIVE_FIELDS) {
      const value = item[field];
      if (!value || !value.trim()) continue;
      const key = value.trim().toLowerCase();
      if (seen[field].has(key)) continue;
      seen[field].add(key);
      targetLists[field].push(value.trim());
    }
  }

  return signals;
}

function buildCompetitorLandscape(
  items: IntelligenceItemWithDerived[],
  patterns: Pattern[],
  relevantContext: RelevantContext
): CompetitorLandscapeEntry[] {
  const itemsInContext = items.filter((i) => relevantContext.itemIds.includes(i.id));

  const patternsByActor = new Map<number, Set<number>>();
  for (const patternId of relevantContext.patternIds) {
    for (const actorId of getPatternSupportingActors(patternId)) {
      if (!patternsByActor.has(actorId)) patternsByActor.set(actorId, new Set());
      patternsByActor.get(actorId)!.add(patternId);
    }
  }

  const byActor = new Map<number, IntelligenceItemWithDerived[]>();
  for (const item of itemsInContext) {
    if (item.actor_id === null) continue;
    if (!byActor.has(item.actor_id)) byActor.set(item.actor_id, []);
    byActor.get(item.actor_id)!.push(item);
  }

  const entries: CompetitorLandscapeEntry[] = [];
  for (const [actorId, actorItems] of byActor) {
    const actor = getActorById(actorId);
    const firstSeen = Math.min(...actorItems.map((i) => i.first_seen_at));
    const lastSeen = Math.max(...actorItems.map((i) => i.last_seen_at));
    const hasPerformanceData = actorItems.some((i) => listMetricsHistory(i.id).length > 0);

    entries.push({
      actor_id: actorId,
      display_name: actor?.display_name ?? null,
      handle: actor?.handle ?? null,
      items_observed: actorItems.length,
      pattern_ids: [...(patternsByActor.get(actorId) ?? [])],
      first_seen_at: firstSeen,
      last_seen_at: lastSeen,
      has_performance_data: hasPerformanceData,
    });
  }

  return entries;
}

function buildUnansweredQuestions(patterns: Pattern[], relevantContext: RelevantContext): string[] {
  const questions: string[] = [];
  const actorScoped = patterns.filter(
    (p) => relevantContext.patternIds.includes(p.id) && p.scope === "actor"
  );
  if (actorScoped.length > 0) {
    questions.push(
      `${actorScoped.length} patrón(es) detectado(s) están sustentados por un solo actor -- evidencia insuficiente todavía para saber si se extenderán al resto del mercado.`
    );
  }
  if (relevantContext.selectedCount < relevantContext.totalCandidates) {
    questions.push(
      `Se seleccionaron ${relevantContext.selectedCount} de ${relevantContext.totalCandidates} patrones detectados según el presupuesto de contexto configurado -- el resto no fue examinado en este brief.`
    );
  }
  return questions;
}

export interface BriefQueryContext {
  query: unknown;
  market?: string | null;
  language?: string | null;
}

/** Ensambla el Intelligence Brief a partir de un resultado 'ok' de generateInsights/generateInsightsFromPatterns. */
export function buildIntelligenceBrief(
  outcome: Extract<GenerateInsightsOutcome, { status: "ok" }>,
  queryContext: BriefQueryContext,
  options: BuildBriefOptions = {}
): IntelligenceBrief {
  const { items, patterns, insights, relevantContext } = outcome;
  const itemIdSet = new Set(relevantContext.itemIds);
  const actorIdSet = new Set(items.filter((i) => i.actor_id !== null).map((i) => i.actor_id as number));

  const contents = insights.map((i) => JSON.parse(i.content_json ?? "{}"));

  return {
    objective: options.objective ?? "Investigación de inteligencia de mercado bajo demanda",
    query: queryContext.query,
    market_context: { market: queryContext.market ?? null, language: queryContext.language ?? null },
    observed_evidence: {
      total_items_examined: items.length,
      total_patterns: patterns.length,
      total_actors: actorIdSet.size,
    },
    key_findings: contents.map((c) => c?.finding?.statement).filter((s): s is string => Boolean(s)),
    patterns: patterns.filter((p) => relevantContext.patternIds.includes(p.id)),
    insights,
    competitor_landscape: buildCompetitorLandscape(items, patterns, relevantContext),
    creative_signals: collectCreativeSignals(items, itemIdSet),
    opportunities: contents.map((c) => c?.recommendation?.text).filter((s): s is string => Boolean(s)),
    constraints: [],
    unanswered_questions: buildUnansweredQuestions(patterns, relevantContext),
    context_optimization: {
      optimizer: relevantContext.optimizer,
      selected_count: relevantContext.selectedCount,
      total_candidates: relevantContext.totalCandidates,
    },
    provenance: {
      item_ids: relevantContext.itemIds,
      evidence_ids: relevantContext.evidenceIds,
      pattern_ids: relevantContext.patternIds,
      actor_ids: relevantContext.actorIds,
    },
    generated_at: Math.floor(Date.now() / 1000),
  };
}

/** Reduce un Intelligence Brief a la forma que consumirá Creative Studio. No genera ni publica anuncios. */
export function buildCreativeIntelligenceBrief(
  brief: IntelligenceBrief,
  options: BuildBriefOptions = {}
): CreativeIntelligenceBrief {
  return {
    campaign_context: options.campaign_context ?? null,
    target_problem: options.target_problem ?? null,
    market_findings: brief.key_findings,
    relevant_patterns: brief.patterns,
    creative_signals: brief.creative_signals,
    competitor_examples: brief.competitor_landscape,
    opportunities: brief.opportunities,
    constraints: brief.constraints,
    evidence: { item_ids: brief.provenance.item_ids, evidence_ids: brief.provenance.evidence_ids },
    provenance: brief.provenance,
  };
}

export type GenerateBriefOutcome =
  | { status: "ok"; brief: IntelligenceBrief }
  | { status: "insufficient_evidence"; reason: string; itemsExamined: number[] };

/** Conveniencia query-driven: genera insights y ensambla el brief en un solo llamado. */
export async function generateBrief(
  request: GenerateInsightsRequest & { market?: string | null; language?: string | null } & BuildBriefOptions
): Promise<GenerateBriefOutcome> {
  const outcome = await generateInsights(request);
  if (outcome.status === "insufficient_evidence") return outcome;
  const queryContext: BriefQueryContext = {
    query: request.query ?? request.itemIds ?? null,
    market: request.market,
    language: request.language,
  };
  return { status: "ok", brief: buildIntelligenceBrief(outcome, queryContext, request) };
}
