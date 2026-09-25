// types.ts — Contratos de Relevance/Change Intelligence.
//
//   CHANGE DETECTION  "¿qué cambió?"       (watchlist/changeDetection.ts, sin tocar)
//   RELEVANCE          "¿qué merece atención?"  (este módulo)
//   ANALYSIS            "¿qué significa?"        (analysis/, sin tocar)
//   PATTERNS             "¿hay un comportamiento repetido?" (detection/, sin tocar)
//   INSIGHTS               "¿qué podemos concluir?"          (synthesis/, sin tocar)
//
// Una RelevanceDecision NUNCA es un juicio de calidad/performance -- solo
// "qué tan justificadamente este cambio observado merece atención bajo
// criterios explícitos", con la evidencia observable que lo sustenta.
import type { ChangeStatus } from "../watchlist/types";

/** Categorías discretas, nunca un score arbitrario de 0-100 sin semántica. */
export type RelevanceCategory = "HIGH" | "MEDIUM" | "LOW" | "IGNORE";
export const RELEVANCE_CATEGORIES: RelevanceCategory[] = ["HIGH", "MEDIUM", "LOW", "IGNORE"];

export interface RelevanceMetricDelta {
  old: number | null;
  new: number | null;
  delta: number;
  /** Solo cuando old es un número distinto de 0 -- nunca se fuerza un porcentaje sin sentido matemático. */
  percent: number | null;
}

/**
 * Contexto MÍNIMO y COMPACTO que se le entrega al DecisionProvider (JEV o
 * fallback) -- nunca el item completo, nunca el raw source payload, nunca
 * el historial completo de un actor. Solo lo que un humano necesitaría
 * para juzgar "¿esto merece que alguien lo mire?".
 */
export interface ChangeContext {
  change_type: ChangeStatus;
  project: { id: number; slug: string };
  source: string;
  actor: { external_id: string | null; handle: string | null; display_name: string | null } | null;
  item: { id: number; external_id: string | null; canonical_url: string | null };
  /** Solo los campos creativos/de copy ya normalizados en el Store -- nunca el texto crudo completo del raw source. */
  content: {
    hook: string | null;
    angle: string | null;
    cta: string | null;
    offer: string | null;
    format: string | null;
    /** Recorte corto (nunca el caption/descripción completos) -- solo para dar contexto legible, no para análisis semántico (eso es MI-3). */
    description_snippet: string | null;
  };
  /** Campos de content que realmente cambiaron -- solo presente/no vacío cuando change_type === "UPDATED". */
  updated_fields?: string[];
  /** Métricas ya observadas para el item (snapshot más reciente disponible) -- null si nunca hubo ninguna. */
  metrics_observed: Partial<Record<"views" | "likes" | "comments" | "shares" | "engagement" | "reach", number | null>> | null;
  /** Solo presente cuando change_type === "METRICS_CHANGED" y hay un snapshot anterior real con el que comparar. */
  metrics_delta?: Partial<Record<"views" | "likes" | "comments" | "shares" | "engagement" | "reach", RelevanceMetricDelta>>;
  watchlist: { id: number; name: string; watchlist_type: string } | null;
  provenance: {
    watchlistId: number;
    runCheckedAt: number;
  };
}

export interface RelevanceDecision {
  decision: RelevanceCategory;
  /** 0..1 -- qué tan justificada está la decisión bajo la evidencia disponible, NUNCA una medida de calidad/éxito del contenido. */
  confidence: number;
  /** Explicación en términos de evidencia OBSERVABLE, nunca una afirmación de que el contenido es "bueno"/"exitoso"/"estratégico". */
  rationale: string;
  /** Hechos observables concretos que sustentan la decisión -- distinto de rationale (texto) para que quede trazable/estructurado. */
  evidence: Record<string, unknown>;
  /** "jev" cuando JEV real respondió; "fallback:deterministic" cuando se usó el fallback -- nunca el fallback se hace pasar por JEV. */
  provider: string;
  /** Lo que el provider subyacente haya devuelto (probabilities/model para JEV; la razón del fallback en el caso determinista) -- passthrough, nunca reinterpretado. */
  provenance: unknown;
}
