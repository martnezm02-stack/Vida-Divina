// types.ts — Contratos de Content Qualification.
//
//   RETRIEVAL              "¿qué se recuperó de la fuente?"       (ingestion/, sin tocar)
//   QUALIFICATION            "¿esto pertenece genuinamente a la marca/entidad que investigamos?" (este módulo)
//   RELEVANCE (ya existente)   "¿este CAMBIO ya observado merece atención?" (relevance/, sin tocar -- pregunta distinta: requiere un ChangeContext con watchlist/metrics_delta; qualification se evalúa una sola vez por item recién recuperado, sin necesitar ninguno de esos dos)
//   ANALYSIS                    "¿qué significa?"                  (analysis/, sin tocar)
//
// Igual que relevance/types.ts: una QualificationDecision nunca es un
// juicio de calidad/performance del contenido -- solo "¿la evidencia
// disponible identifica a esta entidad (actor/página/contenido) como
// genuinamente parte de la marca investigada?". IRRELEVANT nunca implica
// "malo"; solo "no es esto".
//
// UNCERTAIN existe deliberadamente como tercera categoría -- nunca se
// colapsa a RELEVANT por defecto cuando la evidencia no alcanza (ver
// qualificationEngine.ts).
export type QualificationCategory = "RELEVANT" | "IRRELEVANT" | "UNCERTAIN";
export const QUALIFICATION_CATEGORIES: QualificationCategory[] = ["RELEVANT", "IRRELEVANT", "UNCERTAIN"];

/**
 * Descriptor de la marca/entidad contra la que se califica un item --
 * viene del caller (nunca inventado por este módulo). `brandTokens` son
 * tokens compactos y ANCLADOS (sin espacios/puntuación, p.ej. "vidadivina",
 * "tedivina") -- nunca una palabra genérica corta ("divina") que produciría
 * falsos positivos por similitud difusa. `lookalikeTokens` son tokens que
 * se sabe que se confunden por similitud superficial (p.ej. "divina" sola)
 * y que, en AUSENCIA de un brandToken, deben resolver a IRRELEVANT en vez
 * de UNCERTAIN (evidencia de que es un look-alike conocido, no simple
 * ausencia de información).
 */
export interface BrandDescriptor {
  name: string;
  brandTokens: string[];
  lookalikeTokens?: string[];
}

/** Contexto MÍNIMO -- solo los campos ya normalizados en el Store, nunca el raw source payload completo. */
export interface QualificationContext {
  project: { id: number; slug: string };
  brand: BrandDescriptor;
  item: {
    id: number;
    canonical_url: string | null;
    description_snippet: string | null;
    source_metadata_page_name: string | null;
  };
  actor: { handle: string | null; display_name: string | null } | null;
}

export interface QualificationDecision {
  decision: QualificationCategory;
  /** 0..1 -- qué tan justificada está la decisión bajo la evidencia disponible. */
  confidence: number;
  rationale: string;
  evidence: Record<string, unknown>;
  provider: string;
  provenance: unknown;
}
