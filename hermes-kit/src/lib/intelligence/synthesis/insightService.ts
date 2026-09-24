// insightService.ts — Generación de insights query-driven a partir de
// patterns (MI-4), con contexto relevante seleccionado por un
// ContextOptimizer y redacción por un GenerationProvider -- ambos
// intercambiables y ninguno obligatorio para que esto funcione.
//
// Cachea/versiona igual que MI-3 (analysis_runs): un mismo pattern +
// misma configuración reutiliza la versión existente; si el pattern
// cambió (más soporte detectado) o se pide force:true, se crea la
// siguiente versión -- nunca se sobrescribe la anterior.
//
// INSUFFICIENT_EVIDENCE es un resultado válido, nunca se fabrica un
// insight sin patrones/items reales que lo sustenten.
import { createHash } from "node:crypto";
import { getDb } from "../connection";
import { getIntelligenceItemById, searchIntelligenceItems, withActiveDays } from "../items";
import { detectPatterns, getPatternSupportingActors, getPatternSupportingEvidence, getPatternSupportingItems } from "../detection";
import { getPatternById } from "../patterns";
import type { Insight, IntelligenceItemWithDerived, Pattern } from "../types";
import { deterministicContextOptimizer } from "./contextOptimizer";
import { deterministicGenerationProvider } from "./generationProvider";
import type {
  ContextCandidates,
  ContextOptimizer,
  GenerateInsightsFromPatternsRequest,
  GenerateInsightsOutcome,
  GenerateInsightsRequest,
  GenerationProvider,
  InsightContent,
} from "./types";

const TREND_MATURITY_DAYS = 7;

function classifyTemporalMaturity(pattern: Pattern): "recent" | "persistent" | null {
  if (pattern.first_seen_at === null || pattern.last_seen_at === null) return null;
  const activeDays = Math.floor((pattern.last_seen_at - pattern.first_seen_at) / 86400);
  return activeDays >= TREND_MATURITY_DAYS ? "persistent" : "recent";
}

function insightTypeForPattern(pattern: Pattern): string {
  if (pattern.pattern_type?.startsWith("performance_")) {
    return classifyTemporalMaturity(pattern) === "persistent" ? "trend" : "performance";
  }
  if (pattern.scope === "market") return "competitive";
  if (pattern.pattern_type === "creative_cta_repetition" || pattern.pattern_type === "creative_offer_repetition") {
    return "offer";
  }
  if (pattern.pattern_type === "creative_format_repetition") return "creative";
  return "messaging";
}

async function buildInsightContent(
  pattern: Pattern,
  generationProvider: GenerationProvider
): Promise<InsightContent> {
  const frequencyPct = pattern.frequency !== null ? Math.round(pattern.frequency * 1000) / 10 : null;
  const activeDays =
    pattern.first_seen_at !== null && pattern.last_seen_at !== null
      ? Math.floor((pattern.last_seen_at - pattern.first_seen_at) / 86400)
      : null;
  const maturity = classifyTemporalMaturity(pattern);

  const evidence = {
    pattern_type: pattern.pattern_type,
    pattern_key: pattern.pattern_key,
    scope: pattern.scope,
    item_support: pattern.item_support,
    actor_support: pattern.actor_support,
    total_items_examined: pattern.total_items_examined,
    frequency: pattern.frequency,
    first_seen_at: pattern.first_seen_at,
    last_seen_at: pattern.last_seen_at,
  };

  const finding = {
    frequency_pct: frequencyPct,
    active_days: activeDays,
    temporal_maturity: maturity,
    statement: `${pattern.description ?? pattern.name}`,
  };

  const context = { evidence, finding };

  const interpretationResult = await generationProvider.generate({
    prompt: `Interpreta el patrón: ${finding.statement}`,
    context,
    options: { kind: "interpretation" },
  });
  const recommendationResult = await generationProvider.generate({
    prompt: `Sugiere una implicación potencial para el patrón: ${finding.statement}`,
    context,
    options: { kind: "recommendation" },
  });

  return {
    evidence,
    finding,
    interpretation: { text: interpretationResult.text, is_recommendation: false },
    recommendation: { text: recommendationResult.text, is_recommendation: true },
  };
}

function computeInputHash(pattern: Pattern, generationProviderName: string, contextOptimizerName: string): string {
  const payload = JSON.stringify({
    patternId: pattern.id,
    patternUpdatedAt: pattern.updated_at,
    generationProvider: generationProviderName,
    contextOptimizer: contextOptimizerName,
  });
  return createHash("sha256").update(payload).digest("hex");
}

function findCachedInsight(projectId: number, patternId: number, inputHash: string): Insight | null {
  const latest = getDb()
    .prepare<[number, number], Insight>(
      `SELECT * FROM insights WHERE project_id = ? AND source_pattern_id = ?
       ORDER BY version DESC, id DESC LIMIT 1`
    )
    .get(projectId, patternId);
  return latest && latest.input_hash === inputHash ? latest : null;
}

function nextVersion(projectId: number, patternId: number): number {
  const row = getDb()
    .prepare<[number, number], { max_version: number | null }>(
      `SELECT MAX(version) AS max_version FROM insights WHERE project_id = ? AND source_pattern_id = ?`
    )
    .get(projectId, patternId);
  return (row?.max_version ?? 0) + 1;
}

async function generateInsightForPattern(
  projectId: number,
  pattern: Pattern,
  generationProvider: GenerationProvider,
  contextOptimizerName: string,
  relevance: number,
  force: boolean
): Promise<Insight> {
  const inputHash = computeInputHash(pattern, generationProvider.name, contextOptimizerName);

  if (!force) {
    const cached = findCachedInsight(projectId, pattern.id, inputHash);
    if (cached) return cached;
  }

  const content = await buildInsightContent(pattern, generationProvider);
  const insightType = insightTypeForPattern(pattern);
  const version = nextVersion(projectId, pattern.id);

  const db = getDb();
  const insertTx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO insights
          (project_id, name, description, insight_type, summary, confidence, version,
           content_json, generation_provider, context_optimizer, input_hash, source_pattern_id, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        projectId,
        pattern.name,
        content.finding.statement,
        insightType,
        content.finding.statement,
        relevance,
        version,
        JSON.stringify(content),
        generationProvider.name,
        contextOptimizerName,
        inputHash,
        pattern.id,
        JSON.stringify({ pattern_type: pattern.pattern_type, pattern_key: pattern.pattern_key })
      );
    const insightId = info.lastInsertRowid as number;
    db.prepare("INSERT OR IGNORE INTO insight_patterns (insight_id, pattern_id) VALUES (?, ?)").run(
      insightId,
      pattern.id
    );
    return insightId;
  });

  const insightId = insertTx();
  return db.prepare<[number], Insight>("SELECT * FROM insights WHERE id = ?").get(insightId)!;
}

function resolveItems(request: GenerateInsightsRequest): IntelligenceItemWithDerived[] {
  if (request.itemIds && request.itemIds.length > 0) {
    const items: IntelligenceItemWithDerived[] = [];
    for (const id of request.itemIds) {
      const item = getIntelligenceItemById(id);
      if (item && item.project_id === request.project_id) items.push(withActiveDays(item));
    }
    return items;
  }
  if (request.query) {
    return searchIntelligenceItems({ ...request.query, project_id: request.project_id });
  }
  return [];
}

async function synthesizeFromPatterns(
  projectId: number,
  patterns: Pattern[],
  candidates: ContextCandidates,
  contextOptimizer: ContextOptimizer,
  contextOptions: GenerateInsightsRequest["contextOptions"],
  generationProvider: GenerationProvider,
  force: boolean,
  itemsExamined: number[],
  itemsResolved: IntelligenceItemWithDerived[]
): Promise<GenerateInsightsOutcome> {
  if (patterns.length === 0) {
    return {
      status: "insufficient_evidence",
      reason: "No se detectó ningún patrón (repetición o tendencia) sobre el conjunto examinado.",
      itemsExamined,
    };
  }

  const relevantContext = await contextOptimizer.optimize(candidates, contextOptions);

  if (relevantContext.patternIds.length === 0) {
    return {
      status: "insufficient_evidence",
      reason: "Ningún patrón superó el umbral de relevancia configurado.",
      itemsExamined,
    };
  }

  const patternsById = new Map(patterns.map((p) => [p.id, p]));
  const insights: Insight[] = [];

  for (const entry of relevantContext.entries) {
    if (entry.kind !== "pattern") continue;
    const pattern = patternsById.get(entry.id);
    if (!pattern) continue;
    insights.push(
      await generateInsightForPattern(
        projectId,
        pattern,
        generationProvider,
        relevantContext.optimizer,
        entry.relevance,
        force
      )
    );
  }

  return { status: "ok", insights, relevantContext, items: itemsResolved, patterns };
}

function buildCandidates(items: IntelligenceItemWithDerived[], patterns: Pattern[]): ContextCandidates {
  const actorIds = new Set<number>();
  for (const item of items) if (item.actor_id !== null) actorIds.add(item.actor_id);
  // Los actores completos se resuelven perezosamente donde se necesiten
  // (competitor landscape); aquí solo se listan los IDs relevantes.
  return { items, patterns, actors: [] };
}

/** Query-driven: resuelve items (itemIds o query existente), detecta patterns (MI-4, idempotente) y genera insights sobre el contexto seleccionado. */
export async function generateInsights(request: GenerateInsightsRequest): Promise<GenerateInsightsOutcome> {
  const items = resolveItems(request);
  if (items.length === 0) {
    return { status: "insufficient_evidence", reason: "No se resolvió ningún item para la consulta.", itemsExamined: [] };
  }

  const detection = detectPatterns({
    project_id: request.project_id,
    itemIds: items.map((i) => i.id),
    minSupport: request.minSupport,
  });

  const patterns = detection.patterns;
  const candidates = buildCandidates(items, patterns);

  return synthesizeFromPatterns(
    request.project_id,
    patterns,
    candidates,
    request.contextOptimizer ?? deterministicContextOptimizer,
    request.contextOptions,
    request.generationProvider ?? deterministicGenerationProvider,
    request.force ?? false,
    detection.itemsExamined,
    items
  );
}

/** Genera insights directamente a partir de patterns ya existentes (sin volver a resolver items/detección). */
export async function generateInsightsFromPatterns(
  request: GenerateInsightsFromPatternsRequest
): Promise<GenerateInsightsOutcome> {
  const patterns: Pattern[] = [];
  for (const id of request.patternIds) {
    const pattern = getPatternById(id);
    if (pattern && pattern.project_id === request.project_id) patterns.push(pattern);
  }

  const itemIds = new Set<number>();
  for (const pattern of patterns) {
    for (const itemId of getPatternSupportingItems(pattern.id)) itemIds.add(itemId);
  }
  const items = [...itemIds]
    .map((id) => getIntelligenceItemById(id))
    .filter((i): i is NonNullable<typeof i> => i !== null)
    .map(withActiveDays);

  const candidates = buildCandidates(items, patterns);

  return synthesizeFromPatterns(
    request.project_id,
    patterns,
    candidates,
    request.contextOptimizer ?? deterministicContextOptimizer,
    request.contextOptions,
    request.generationProvider ?? deterministicGenerationProvider,
    request.force ?? false,
    [...itemIds],
    items
  );
}

export function getInsight(id: number): Insight | null {
  return getDb().prepare<[number], Insight>("SELECT * FROM insights WHERE id = ?").get(id) ?? null;
}

export function listInsightsByProject(projectId: number, insightType?: string): Insight[] {
  const db = getDb();
  return insightType
    ? db
        .prepare<[number, string], Insight>(
          "SELECT * FROM insights WHERE project_id = ? AND insight_type = ? ORDER BY created_at DESC"
        )
        .all(projectId, insightType)
    : db.prepare<[number], Insight>("SELECT * FROM insights WHERE project_id = ? ORDER BY created_at DESC").all(projectId);
}

function patternIdsForInsight(insightId: number): number[] {
  return getDb()
    .prepare<[number], { pattern_id: number }>("SELECT pattern_id FROM insight_patterns WHERE insight_id = ?")
    .all(insightId)
    .map((r) => r.pattern_id);
}

export function getInsightSupportingItems(insightId: number): number[] {
  const items = new Set<number>();
  for (const patternId of patternIdsForInsight(insightId)) {
    for (const itemId of getPatternSupportingItems(patternId)) items.add(itemId);
  }
  return [...items];
}

export function getInsightSupportingActors(insightId: number): number[] {
  const actors = new Set<number>();
  for (const patternId of patternIdsForInsight(insightId)) {
    for (const actorId of getPatternSupportingActors(patternId)) actors.add(actorId);
  }
  return [...actors];
}

export function getInsightSupportingEvidence(insightId: number): number[] {
  const evidence = new Set<number>();
  for (const patternId of patternIdsForInsight(insightId)) {
    for (const evidenceId of getPatternSupportingEvidence(patternId)) evidence.add(evidenceId);
  }
  return [...evidence];
}

export function getInsightSupportingPatterns(insightId: number): number[] {
  return patternIdsForInsight(insightId);
}
