// contextOptimizer.ts — Selección de contexto relevante a partir del pool
// completo de evidencia. Nunca modifica ni resume destructivamente la
// evidencia canónica del Store -- solo produce una vista/selección
// derivada, siempre con referencias reconstruibles al original.
//
// Dos implementaciones: deterministic (fallback local, sin IA) y una
// respaldada por JEV vía el DecisionProvider ya existente (MI-4) -- no se
// crea un cliente JEV independiente para esto, se reutiliza la misma
// abstracción. withFallback() compone ambas: si JEV falla o no está
// configurado, cae automáticamente al fallback determinista.
import type { DecisionProvider } from "../decision/types";
import { getPatternSupportingEvidence, getPatternSupportingItems } from "../detection";
import type {
  ContextCandidates,
  ContextOptimizationOptions,
  ContextOptimizer,
  RelevantContext,
  RelevantContextEntry,
} from "./types";

const DEFAULT_MAX_TOKENS = 8000;

function estimateTokens(text: string): number {
  // Heurística simple (≈4 caracteres/token) -- suficiente para no enviar
  // contexto desbordado al modelo generativo; no hace falta un tokenizer real.
  return Math.ceil(text.length / 4);
}

function buildRelevantContext(
  optimizerName: string,
  selectedPatterns: Array<{ id: number; relevance: number; reason: string }>,
  candidates: ContextCandidates,
  options: ContextOptimizationOptions
): RelevantContext {
  const entries: RelevantContextEntry[] = [];
  const itemIds = new Set<number>();
  const evidenceIds = new Set<number>();
  const actorIds = new Set<number>();

  const maxItems = options.maxItems ?? Number.POSITIVE_INFINITY;
  const maxEvidence = options.maxEvidence ?? Number.POSITIVE_INFINITY;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  let tokenBudget = maxTokens;

  const itemsById = new Map(candidates.items.map((i) => [i.id, i]));

  for (const { id, relevance, reason } of selectedPatterns) {
    const patternText = reason;
    const patternTokens = estimateTokens(patternText);
    if (patternTokens > tokenBudget) break; // presupuesto de tokens agotado -- no se sigue agregando contexto

    entries.push({ kind: "pattern", id, relevance, reason });
    tokenBudget -= patternTokens;

    for (const itemId of getPatternSupportingItems(id)) {
      if (itemIds.size >= maxItems) break;
      if (itemIds.has(itemId)) continue;
      itemIds.add(itemId);
      const item = itemsById.get(itemId);
      if (item?.actor_id) actorIds.add(item.actor_id);
      entries.push({ kind: "item", id: itemId, relevance, reason: `sustenta el patrón ${id}` });
    }

    for (const evidenceId of getPatternSupportingEvidence(id)) {
      if (evidenceIds.size >= maxEvidence) break;
      if (evidenceIds.has(evidenceId)) continue;
      evidenceIds.add(evidenceId);
      entries.push({ kind: "evidence", id: evidenceId, relevance, reason: `evidencia del patrón ${id}` });
    }
  }

  return {
    patternIds: selectedPatterns.map((p) => p.id),
    itemIds: [...itemIds],
    evidenceIds: [...evidenceIds],
    actorIds: [...actorIds],
    entries,
    totalCandidates: candidates.patterns.length,
    selectedCount: selectedPatterns.length,
    optimizer: optimizerName,
  };
}

/** Fallback local: rankea patrones por confidence (soporte cuantificable ya calculado por MI-4), sin IA. */
export const deterministicContextOptimizer: ContextOptimizer = {
  name: "deterministic",

  optimize(candidates: ContextCandidates, options: ContextOptimizationOptions = {}): RelevantContext {
    const threshold = options.relevanceThreshold ?? 0;
    const maxPatterns = options.maxPatterns ?? Number.POSITIVE_INFINITY;

    const ranked = [...candidates.patterns]
      .filter((p) => (p.confidence ?? 0) >= threshold)
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, maxPatterns)
      .map((p) => ({
        id: p.id,
        relevance: p.confidence ?? 0,
        reason: p.description ?? p.name,
      }));

    return buildRelevantContext("deterministic", ranked, candidates, options);
  },
};

/**
 * Optimizer respaldado por un DecisionProvider (JEV u otro): usa
 * .score() por patrón para decidir relevancia en vez de leer directamente
 * pattern.confidence. Si el provider no está configurado (p.ej. JEV sin
 * credenciales), optimize() propaga el error -- usar withFallback() para
 * degradar automáticamente al determinista.
 */
export function createDecisionBackedContextOptimizer(decisionProvider: DecisionProvider): ContextOptimizer {
  return {
    name: `decision:${decisionProvider.name}`,

    async optimize(candidates: ContextCandidates, options: ContextOptimizationOptions = {}): Promise<RelevantContext> {
      const threshold = options.relevanceThreshold ?? 0;
      const maxPatterns = options.maxPatterns ?? Number.POSITIVE_INFINITY;

      const scored: Array<{ id: number; relevance: number; reason: string }> = [];
      for (const pattern of candidates.patterns) {
        const result = await decisionProvider.score({
          subject: pattern.confidence ?? 0,
          criteria: { pattern_type: pattern.pattern_type, scope: pattern.scope },
          context: candidates,
        });
        scored.push({ id: pattern.id, relevance: result.score, reason: pattern.description ?? pattern.name });
      }

      const ranked = scored
        .filter((s) => s.relevance >= threshold)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, maxPatterns);

      return buildRelevantContext(`decision:${decisionProvider.name}`, ranked, candidates, options);
    },
  };
}

/**
 * Compone dos optimizers: intenta `primary` (p.ej. respaldado por JEV) y,
 * si lanza (no configurado, error de red, lo que sea), cae a `fallback`
 * (p.ej. deterministic) -- MI-5 nunca queda bloqueado por la ausencia de JEV.
 */
export function withFallback(primary: ContextOptimizer, fallback: ContextOptimizer): ContextOptimizer {
  return {
    name: `${primary.name}+fallback:${fallback.name}`,

    async optimize(candidates: ContextCandidates, options?: ContextOptimizationOptions): Promise<RelevantContext> {
      try {
        return await primary.optimize(candidates, options);
      } catch {
        const result = await fallback.optimize(candidates, options);
        // Provenance honesta: deja constancia de que el primario falló y
        // se usó el fallback, en vez de reportar el nombre del fallback
        // como si hubiera sido la elección normal.
        return { ...result, optimizer: `fallback:${result.optimizer}` };
      }
    },
  };
}
