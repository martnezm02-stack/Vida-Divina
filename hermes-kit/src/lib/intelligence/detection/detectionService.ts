// detectionService.ts — API query-driven de MI-4: detectPatterns /
// detectPatternsFromQuery. Nunca se ejecuta sola -- solo corre cuando algo
// la llama explícitamente (sin cron, sin polling, sin crawling periódico).
//
// Orquesta: resolver items -> extraer señales -> detectar patrones
// (creative + performance) -> derivar relaciones -> devolver todo.
import { getIntelligenceItemById, searchIntelligenceItems, withActiveDays } from "../items";
import type { IntelligenceItemWithDerived, Pattern, Signal } from "../types";
import { detectFrequencySignals } from "./signalDetection";
import { detectCreativePatterns, detectPerformancePatterns } from "./patternDetection";
import { detectSharedFieldRelationships } from "./relationshipDetection";
import type { PatternDetectionRequest, PatternDetectionResult } from "./types";

const MIN_SUPPORT_DEFAULT = 2;

function resolveItems(request: PatternDetectionRequest): IntelligenceItemWithDerived[] {
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

function signalIndexByFieldValue(signals: Signal[]): Map<string, Signal> {
  // signal_type ya codifica el campo (HOOK_FREQUENCY, CTA_FREQUENCY...);
  // signal_key es el valor normalizado -- se reconstruye "field:value" a
  // partir de metadata_json.field, que detectFrequencySignals siempre guarda.
  const index = new Map<string, Signal>();
  for (const signal of signals) {
    if (!signal.metadata_json) continue;
    try {
      const metadata = JSON.parse(signal.metadata_json) as { value?: string };
      if (signal.signal_key !== null && metadata.value !== undefined) {
        const field = fieldFromSignalType(signal.signal_type);
        if (field) index.set(`${field}:${signal.signal_key}`, signal);
      }
    } catch {
      // metadata inesperada -- se ignora, el pattern simplemente queda sin signal enlazada
    }
  }
  return index;
}

function fieldFromSignalType(signalType: string): string | null {
  const map: Record<string, string> = {
    HOOK_FREQUENCY: "hook",
    ANGLE_FREQUENCY: "angle",
    CTA_FREQUENCY: "cta",
    OFFER_FREQUENCY: "offer",
    FORMAT_FREQUENCY: "format",
  };
  return map[signalType] ?? null;
}

/** Detecta señales, patrones y relaciones sobre un conjunto concreto de items. Query-driven: solo corre al ser llamada. */
export function detectPatterns(request: PatternDetectionRequest): PatternDetectionResult {
  const items = resolveItems(request);
  if (items.length === 0) {
    throw new Error(
      "detectPatterns: no se resolvió ningún item para analizar (itemIds/query vacíos o inválidos)"
    );
  }

  const minSupport = request.minSupport ?? MIN_SUPPORT_DEFAULT;
  const signals: Signal[] = [];
  const patterns: Pattern[] = [];

  if (request.detectCreative !== false) {
    signals.push(...detectFrequencySignals(items, request.project_id, minSupport));
    patterns.push(
      ...detectCreativePatterns(items, request.project_id, minSupport, signalIndexByFieldValue(signals))
    );
  }

  if (request.detectPerformance !== false) {
    patterns.push(...detectPerformancePatterns(items, request.project_id, minSupport));
  }

  let relationshipsCreated = 0;
  if (request.detectRelationships !== false) {
    relationshipsCreated = detectSharedFieldRelationships(items, minSupport);
  }

  return {
    patterns,
    signals,
    relationshipsCreated,
    itemsExamined: items.map((i) => i.id),
  };
}

/** Resuelve el conjunto vía las capacidades de búsqueda existentes (searchIntelligenceItems) y detecta sobre él. */
export function detectPatternsFromQuery(
  request: Omit<PatternDetectionRequest, "itemIds">
): PatternDetectionResult {
  return detectPatterns(request);
}
