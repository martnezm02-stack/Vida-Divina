// index.ts — Punto de entrada del Intelligence Store (MI-1).
//
// Infraestructura de Hermes Marketing Intelligence: local, persistente
// (SQLite vía better-sqlite3, mismo patrón que src/lib/db.ts), separada del
// CRM PostgreSQL de Vida Divina y del data/messages.db de conversaciones.
// Ver docs/00-intelligence-store.md para el modelo completo.
export { getDb, getDbPath, _resetConnectionForTests } from "./connection";

export * from "./types";

export { getOrCreateProject, getProjectBySlug, getProjectById, listProjects } from "./projects";
export { getOrCreateSource, getSourceBySlug, listSources } from "./sources";
export { upsertActor, getActorById, listActorsByProject } from "./actors";
export {
  upsertIntelligenceItem,
  getIntelligenceItemById,
  updateIntelligenceItem,
  searchIntelligenceItems,
  withActiveDays,
} from "./items";
export { recordMetrics, getLatestMetrics, listMetricsHistory } from "./metrics";
export { attachAsset, listAssetsForItem } from "./assets";
export { addEvidence, listEvidenceForItem } from "./evidence";
export { saveAiAnalysis, listAiAnalysesForItem } from "./aiAnalysis";
export { createSignal, listSignalsByProject, listSignalsForItem } from "./signals";
export { createRelationship, listRelationshipsForItem } from "./relationships";
export {
  createPattern,
  getPatternById,
  listPatternsByProject,
  linkPatternItem,
  listItemsForPattern,
} from "./patterns";
export { createInsight, getInsightById, listInsightsByProject, linkInsightPattern } from "./insights";
export {
  createWatchlist,
  listWatchlistsByProject,
  addWatchlistEntry,
  listWatchlistEntries,
} from "./watchlists";

// MI-2: capa de ingesta/normalización (RAW SOURCE DATA -> adapter ->
// CanonicalIntelligenceItem -> ingestCanonicalItem -> Intelligence Store).
export * from "./ingestion";

// MI-3: capa de análisis/enriquecimiento, query-driven (analyzeItems /
// analyzeQuery -- nunca se ejecuta sin que algo los llame).
export * from "./analysis";

// MI-4: capa de detección de patrones/señales, query-driven (detectPatterns /
// detectPatternsFromQuery -- nunca se ejecuta sin que algo los llame).
export * from "./detection";

// Complemento a MI-4: DecisionProvider, abstracción provider-agnostic para
// decisiones/clasificación (JEV es una implementación intercambiable, no
// una dependencia). No wired en ningún camino de detection/.
export * from "./decision";

// MI-5: insights, briefs y optimización de contexto, query-driven
// (generateInsights/generateInsightsFromPatterns/generateBrief -- nunca se
// ejecuta sin que algo los llame).
export * from "./synthesis";
