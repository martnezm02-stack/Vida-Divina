// researchService.ts — Orquestador Research Query → Intelligence Brief.
//
// Query-driven: solo corre cuando runResearchQuery() se llama, nunca por
// cron/polling/crawler. No reimplementa MI-1..MI-5 -- únicamente los
// secuencia en el orden pedido:
//
//   query → retrieval (MI-1) → [ingesta MI-2, solo si hace falta] →
//   analysis (MI-3) → patterns (MI-4, vía MI-5) → insights (MI-5) → brief
//
// Nunca modifica evidencia canónica directamente: la ingesta pasa siempre
// por ingestCanonicalItem (MI-2, ya idempotente/upsert), nunca UPDATE/
// DELETE directo. JEV solo participa si el caller pasa explícitamente un
// contextOptimizer/generationProvider respaldado por JEV -- este
// orquestador no crea ningún cliente JEV propio.
import { getOrCreateProject } from "../projects";
import { searchIntelligenceItems } from "../items";
import { ingestCanonicalItem } from "../ingestion";
import { analyzeItems, creativeAnalysisProvider } from "../analysis";
import type { AnalysisRunWithItems } from "../analysis";
import { generateBrief } from "../synthesis";
import { assessEvidence } from "./evidenceAssessment";
import type { ResearchOutcome, ResearchQueryRequest, RetrievalSummary } from "./types";

const DEFAULT_MIN_ITEMS = 2;
const DEFAULT_ANALYSIS_TYPE = "creative_summary";

export async function runResearchQuery(request: ResearchQueryRequest): Promise<ResearchOutcome> {
  const project = getOrCreateProject(request.project);
  const minItems = request.minItems ?? DEFAULT_MIN_ITEMS;

  // 1) Retrieval: reutilizar PRIMERO la evidencia ya existente en el Store.
  let items = searchIntelligenceItems({ ...request.query, project_id: project.id });
  const itemsFoundBeforeIngestion = items.length;
  let assessment = assessEvidence(items, { minItems, freshnessWindowSeconds: request.freshnessWindowSeconds });

  // 2) Identificar faltantes -> ingerir SOLO lo necesario, y solo si se
  // proveyó algo que ingerir (este orquestador nunca sale a buscar datos
  // por su cuenta -- no es un crawler).
  let itemsIngested = 0;
  if (!assessment.sufficient && request.ingest && request.ingest.length > 0) {
    for (const { adapter, raw } of request.ingest) {
      const canonical = adapter.normalize(raw, { project: request.project });
      ingestCanonicalItem(canonical);
      itemsIngested++;
    }
    items = searchIntelligenceItems({ ...request.query, project_id: project.id });
    assessment = assessEvidence(items, { minItems, freshnessWindowSeconds: request.freshnessWindowSeconds });
  }

  const retrieval: RetrievalSummary = {
    itemsFoundBeforeIngestion,
    itemsIngested,
    itemsAfterIngestion: items.length,
    mostRecentLastSeenAt: assessment.mostRecentLastSeenAt,
    usedExistingEvidenceOnly: itemsIngested === 0,
  };

  if (!assessment.sufficient) {
    const noIngestProvided = !request.ingest || request.ingest.length === 0;
    if (noIngestProvided) {
      // Nada para ingerir y la evidencia existente no alcanza: Hermes debe
      // solicitar una nueva ingesta -- este orquestador no la produce solo.
      return { status: "needs_ingestion", reason: assessment.reason!, retrieval };
    }
    // Se ingirió lo provisto y aun así no alcanza (insuficiente/obsoleto).
    return {
      status: "insufficient_evidence",
      reason: assessment.reason!,
      itemsExamined: items.map((i) => i.id),
      retrieval,
    };
  }

  // 3) Analysis (MI-3): enriquecimiento explícito sobre el conjunto
  // resuelto -- mantiene la cadena completa query→...→brief trazable.
  const analysisProvider = request.analysisProvider ?? creativeAnalysisProvider;
  const analysisType = request.analysisType ?? DEFAULT_ANALYSIS_TYPE;
  const { run: analysisRun } = await analyzeItems(
    { project_id: project.id, itemIds: items.map((i) => i.id), analysisType },
    analysisProvider
  );
  const analysisRuns: AnalysisRunWithItems[] = [analysisRun];

  // 4-6) Patterns (MI-4) + Insights (MI-5) + Brief (MI-5) -- generateBrief
  // ya encadena las tres, reutilizado tal cual, sin reimplementar nada.
  const briefOutcome = await generateBrief({
    project_id: project.id,
    itemIds: items.map((i) => i.id),
    query: { ...request.query, project_id: project.id },
    minSupport: request.minSupport,
    contextOptimizer: request.contextOptimizer,
    contextOptions: request.contextOptions,
    generationProvider: request.generationProvider,
    market: request.market,
    language: request.language,
    objective: request.objective,
    campaign_context: request.campaign_context,
    target_problem: request.target_problem,
    force: request.force,
  });

  if (briefOutcome.status === "insufficient_evidence") {
    // 7) insufficient_evidence debe propagarse tal cual, nunca ocultarse
    // ni convertirse en un brief fabricado.
    return {
      status: "insufficient_evidence",
      reason: briefOutcome.reason,
      itemsExamined: briefOutcome.itemsExamined,
      retrieval,
    };
  }

  return { status: "ok", brief: briefOutcome.brief, analysisRuns, retrieval };
}
