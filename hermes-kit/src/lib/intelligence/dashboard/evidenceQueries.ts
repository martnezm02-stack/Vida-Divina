// evidenceQueries.ts — Trazabilidad real Insight -> Pattern -> Items (que a
// su vez ya expone su propio detalle con Signals/Evidence/Assets/Source via
// getItemDetail, marketIntelligenceQueries.ts). Solo composición de
// funciones MI-1..MI-5 ya existentes (getInsightById, getPatternById,
// listItemsForPattern) -- ningún ID ni relación se inventa; si algo no
// existe (insight sin source_pattern_id, pattern sin items), se refleja tal
// cual (null/[]), nunca con un item ficticio de relleno.
import { getInsightById } from "../insights";
import { getPatternById, listItemsForPattern } from "../patterns";
import { getIntelligenceItemById, withActiveDays } from "../items";
import type { Insight, IntelligenceItemWithDerived, Pattern } from "../types";

export interface InsightTrace {
  insight: Insight;
  pattern: Pattern | null;
  items: IntelligenceItemWithDerived[];
}

export function traceInsight(insightId: number): InsightTrace | null {
  const insight = getInsightById(insightId);
  if (!insight) return null;

  const pattern = insight.source_pattern_id !== null ? getPatternById(insight.source_pattern_id) : null;
  const itemIds = pattern ? listItemsForPattern(pattern.id) : [];
  const items = itemIds
    .map((id) => getIntelligenceItemById(id))
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .map(withActiveDays);

  return { insight, pattern, items };
}
