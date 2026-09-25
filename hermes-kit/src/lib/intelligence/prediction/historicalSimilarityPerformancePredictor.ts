// historicalSimilarityPerformancePredictor.ts — Primera implementación de
// PerformancePredictor: determinista, explicable, sin ML/estadística.
//
// Técnica: encuentra items del MISMO proyecto que comparten al menos un
// elemento creativo (hook/angle/cta/offer/problem/promise/mechanism/format
// -- MI-4, groupByField/CREATIVE_FIELDS, mismo criterio de normalización
// que ya usa la detección de patrones) con el candidato, deriva su
// engagement_rate REAL observado (MI-3, performanceAnalysisProvider --
// reutilizado tal cual, nunca reimplementado) y predice el promedio para
// el candidato. Un elemento ausente en el candidato simplemente no aporta
// evidencia -- nunca se sustituye por un valor inventado.
//
// insufficient_evidence es un resultado válido y esperado, no un error:
// se devuelve cuando no hay ningún item que comparta un elemento creativo,
// o cuando los que comparten no tienen métricas observadas usables.
//
// confidence = suficiencia (cuántos items) × consistencia (qué tan
// dispersos están sus engagement_rate) -- nunca una medida de calidad
// creativa.
import { searchIntelligenceItems, getIntelligenceItemById, withActiveDays } from "../items";
import { groupByField, CREATIVE_FIELDS } from "../detection";
import { performanceAnalysisProvider } from "../analysis";
import type { IntelligenceItemWithDerived } from "../types";
import type {
  PerformancePredictionCandidate,
  PerformancePredictionOutcome,
  PerformancePredictionRequest,
  PerformancePredictor,
  PredictionElementField,
} from "./types";

function resolveCandidate(request: PerformancePredictionRequest): {
  candidate: PerformancePredictionCandidate;
  excludeItemId: number | undefined;
} {
  if (request.itemId !== undefined) {
    const item = getIntelligenceItemById(request.itemId);
    if (!item || item.project_id !== request.project_id) {
      return { candidate: {}, excludeItemId: request.itemId };
    }
    return { candidate: item, excludeItemId: request.itemId };
  }
  return { candidate: request.candidate ?? {}, excludeItemId: undefined };
}

function emptyEvidence(): { item_ids: number[]; metric_snapshots_used: number; matched_fields: PredictionElementField[]; source_ids: number[] } {
  return { item_ids: [], metric_snapshots_used: 0, matched_fields: [], source_ids: [] };
}

export const historicalSimilarityPerformancePredictor: PerformancePredictor = {
  name: "historical-similarity-v1",

  predict(request: PerformancePredictionRequest): PerformancePredictionOutcome {
    const { candidate, excludeItemId } = resolveCandidate(request);

    const allItems = searchIntelligenceItems({
      project_id: request.project_id,
      ...(request.market ? { market: request.market } : {}),
    });

    // 1) Encuentra, por cada elemento creativo PRESENTE en el candidato
    // (los ausentes simplemente se saltan -- reducen evidencia, nunca
    // fuerzan una coincidencia artificial), qué items históricos
    // comparten exactamente ese valor. Mismo matching que MI-4.
    const matchedFields: PredictionElementField[] = [];
    const matchedItemIds = new Set<number>();
    for (const field of CREATIVE_FIELDS) {
      const candidateValue = candidate[field as keyof PerformancePredictionCandidate];
      if (typeof candidateValue !== "string" || !candidateValue.trim()) continue;
      const normalized = candidateValue.trim().toLowerCase();
      const groups = groupByField(allItems, field);
      const group = groups.find((g) => g.value === normalized);
      if (!group) continue;
      const ids = group.itemIds.filter((id) => id !== excludeItemId);
      if (ids.length === 0) continue;
      matchedFields.push(field);
      for (const id of ids) matchedItemIds.add(id);
    }

    if (matchedFields.length === 0) {
      return {
        status: "insufficient_evidence",
        reason:
          "El candidato no comparte ningún elemento creativo (hook/angle/cta/offer/problem/promise/mechanism/format) " +
          "con ningún item existente de este proyecto -- no hay evidencia histórica de la que partir.",
        evidence: emptyEvidence(),
      };
    }

    // 2) Deriva engagement_rate REAL (MI-3, reutilizado tal cual) para
    // cada item histórico encontrado. Un item sin métricas simplemente no
    // cuenta como evidencia usable -- nunca se trata como 0.
    const matchedItems: IntelligenceItemWithDerived[] = [...matchedItemIds]
      .map((id) => getIntelligenceItemById(id))
      .filter((i): i is NonNullable<typeof i> => i !== null)
      .map(withActiveDays);

    const perfOutput = performanceAnalysisProvider.analyze(matchedItems, {
      project_id: request.project_id,
      analysisType: "performance_delta",
    }) as { observed: { items: Record<number, { engagement_rate?: number } | null> } };
    const perfByItem = perfOutput.observed.items;

    const engagementRates: number[] = [];
    const usableItemIds: number[] = [];
    const sourceIds = new Set<number>();
    for (const item of matchedItems) {
      const rate = perfByItem[item.id]?.engagement_rate;
      if (typeof rate === "number") {
        engagementRates.push(rate);
        usableItemIds.push(item.id);
        sourceIds.add(item.source_id);
      }
    }

    const minEvidence = request.minEvidence ?? 2;
    if (engagementRates.length < minEvidence) {
      return {
        status: "insufficient_evidence",
        reason:
          `Se encontraron ${matchedItemIds.size} item(s) histórico(s) que comparten [${matchedFields.join(", ")}], ` +
          `pero solo ${engagementRates.length} tienen engagement_rate observado usable -- por debajo del mínimo requerido de ${minEvidence}.`,
        evidence: {
          item_ids: usableItemIds,
          metric_snapshots_used: engagementRates.length,
          matched_fields: matchedFields,
          source_ids: [...sourceIds],
        },
      };
    }

    // 3) Predicción: promedio del engagement_rate real observado.
    // Confidence: suficiencia (cuántos items) × consistencia (dispersión
    // relativa entre ellos) -- nunca "calidad" de la creatividad.
    const mean = engagementRates.reduce((a, b) => a + b, 0) / engagementRates.length;
    const variance = engagementRates.reduce((a, b) => a + (b - mean) ** 2, 0) / engagementRates.length;
    const stddev = Math.sqrt(variance);
    const coefficientOfVariation = mean > 0 ? stddev / mean : 1;

    const sufficiency = Math.min(1, engagementRates.length / 3);
    const consistency = Math.max(0, 1 - Math.min(1, coefficientOfVariation));
    const confidence = sufficiency * consistency;

    return {
      status: "ok",
      predictions: [{ metric: "engagement_rate", value: mean, basis: matchedFields }],
      confidence,
      evidence: {
        item_ids: usableItemIds,
        metric_snapshots_used: engagementRates.length,
        matched_fields: matchedFields,
        source_ids: [...sourceIds],
      },
      explanation:
        `Predicción de engagement_rate = promedio observado en ${engagementRates.length} item(s) histórico(s) ` +
        `de este proyecto que comparten [${matchedFields.join(", ")}] con el candidato ` +
        `(media=${mean.toFixed(4)}, desviación estándar=${stddev.toFixed(4)}). ` +
        `Confianza = suficiencia de evidencia (${engagementRates.length} item(s), min. ${minEvidence}) × ` +
        `consistencia entre ellos (coeficiente de variación=${coefficientOfVariation.toFixed(2)}) -- ` +
        `nunca una medida de calidad creativa.`,
    };
  },
};
