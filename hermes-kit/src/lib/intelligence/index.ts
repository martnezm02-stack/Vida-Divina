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
  getIntelligenceItemByExternalId,
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
  getWatchlistById,
  touchWatchlistLastChecked,
  setWatchlistSchedule,
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

// Research Query orchestrator: encadena MI-1..MI-5 (retrieval → ingesta
// condicional → analysis → patterns → insights → brief) sin reimplementar
// ninguna capa. Query-driven, nunca cron/polling/crawler.
export * from "./research";

// Performance Predictor: CREATIVE + CONTEXT + HISTORICAL EVIDENCE ->
// predicción + confidence + evidence + explanation. Reutiliza MI-1
// (métricas), MI-3 (performanceAnalysisProvider) y MI-4 (groupByField/
// CREATIVE_FIELDS) -- no es una capa MI-1..MI-5 nueva, no reimplementa
// ninguna. Query-driven, nunca se ejecuta sin que algo lo llame.
export * from "./prediction";

// Bridges: adquisición externa (Hermes Desktop/Monid, ...) -> contrato
// estable -> SourceAdapter existente (MI-2). Ningún bridge interpreta
// nada -- solo transporte/reshaping. Producen AvailableSource/
// UnavailableSource, listos para runMultiSourceResearchQuery() (./research)
// tal cual, sin ninguna API nueva en ese orquestador.
export * from "./bridges";

// Watchlists + Change Detection (Continuous Intelligence, infraestructura):
// runWatchlistRun() clasifica NEW/UPDATED/METRICS_CHANGED/UNCHANGED contra
// el Intelligence Store ya existente y delega SIEMPRE en ingestCanonicalItem
// (MI-2) -- nunca escribe SQL propio, nunca adquiere datos por sí mismo.
export * from "./watchlist";

// Relevance/Change Intelligence: "¿qué cambio merece atención?", sobre los
// cambios ya clasificados por Watchlist Runner. Reutiliza el DecisionProvider
// existente (decision/) -- nunca otro cliente JEV -- y signals (MI-1) --
// nunca otra tabla. Ni Watchlist Runner ni el Scheduler importan esto.
export * from "./relevance";

// Signal -> MI-5 (Insights/Briefs): conecta las signals de relevance/ con
// el motor de insights YA existente (synthesis/generateInsights, sin
// tocar) -- resuelve evidencia real vía signal_items y delega el resto
// por completo en MI-5. processWatchlistSignals() es el orquestador de
// alto nivel (Watchlist Run -> Signals -> Insights -> Brief opcional);
// ni Watchlist Runner ni el Scheduler importan nada de este módulo.
export * from "./signalInsights";
