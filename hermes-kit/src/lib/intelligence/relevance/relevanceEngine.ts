// relevanceEngine.ts — evaluateChangeRelevance(context, decisionProvider)
// -> RelevanceDecision.
//
// Reutiliza el DecisionProvider YA existente (decision/types.ts) -- nunca
// instancia el SDK de TypeSafe aquí, nunca crea otro cliente JEV, nunca
// otro mecanismo de scoring. El caller decide QUÉ provider inyectar
// (createJevDecisionProvider() u otro) -- este archivo solo sabe hablar
// con la interfaz .classify(), igual que
// synthesis/contextOptimizer.ts#createDecisionBackedContextOptimizer.
//
// Mismo idioma de fallback que contextOptimizer.ts#withFallback (no
// duplicado, solo el mismo patrón try/catch): si decisionProvider es null,
// o si .classify() lanza (sin configurar, red, lo que sea), se usa el
// fallback determinista -- la degradación queda SIEMPRE visible en
// provenance.provider ("fallback:deterministic"), nunca disfrazada de JEV.
import { searchIntelligenceItems } from "../items";
import type { DecisionProvider } from "../decision";
import { RELEVANCE_CATEGORIES } from "./types";
import type { ChangeContext, RelevanceCategory, RelevanceDecision } from "./types";

const CREATIVE_CONTENT_FIELDS = ["hook", "angle", "cta", "offer"] as const;
// searchIntelligenceItems (MI-1, IntelligenceItemSearchFilter) solo indexa
// hook/angle como filtros exactos -- cta/offer no tienen ese soporte
// (extenderlo sería tocar MI-1, fuera de alcance de este bloque). La
// búsqueda de "elemento creativo repetido" se acota a esos dos, que ya
// bastan como evidencia observable.
const SEARCHABLE_CREATIVE_FIELDS = ["hook", "angle"] as const;

/** ¿Algún elemento creativo de este item YA aparece en otro item real del mismo proyecto? Evidencia de repetición, reutilizando searchIntelligenceItems tal cual -- no MI-4 patterns completo, solo una coincidencia exacta de campo. */
function findRepeatedCreativeElement(context: ChangeContext): { field: string; value: string } | null {
  for (const field of SEARCHABLE_CREATIVE_FIELDS) {
    const value = context.content[field];
    if (!value) continue;
    const matches = searchIntelligenceItems(
      field === "hook"
        ? { project_id: context.project.id, hook: value }
        : { project_id: context.project.id, angle: value }
    );
    if (matches.some((m) => m.id !== context.item.id)) {
      return { field, value };
    }
  }
  return null;
}

/**
 * Magnitud del cambio de métricas más grande disponible en metrics_delta
 * (en valor absoluto de `percent`) -- null si ningún campo tiene un
 * porcentaje calculable (p.ej. todos los `old` eran 0).
 */
function largestMetricPercentChange(context: ChangeContext): number | null {
  if (!context.metrics_delta) return null;
  let largest: number | null = null;
  for (const entry of Object.values(context.metrics_delta)) {
    if (entry?.percent === null || entry?.percent === undefined) continue;
    if (largest === null || Math.abs(entry.percent) > Math.abs(largest)) largest = entry.percent;
  }
  return largest;
}

/**
 * Fallback determinista, evidencia observable únicamente -- nunca fabrica
 * un juicio de calidad. Umbrales deliberadamente gruesos y conservadores
 * (no un modelo afinado): "se duplicó o más" es un umbral defendible por
 * sí mismo (magnitud inequívoca), no un número arbitrario elegido para
 * calibrar una métrica de negocio inexistente en este código.
 */
function deterministicRelevanceFallback(context: ChangeContext, reason: string): RelevanceDecision {
  const base = { provider: "fallback:deterministic", provenance: { reason } };

  if (context.change_type === "NEW") {
    const repeated = findRepeatedCreativeElement(context);
    return {
      ...base,
      decision: repeated ? "MEDIUM" : "LOW",
      confidence: 0.5,
      rationale: repeated
        ? `Contenido nuevo de una entidad vigilada; su campo "${repeated.field}" ("${repeated.value}") ya aparece en otro item real de este proyecto -- posible repetición de un elemento creativo ya observado.`
        : "Contenido nuevo de una entidad vigilada; sin coincidencia de hook/angle/cta/offer con evidencia previa del proyecto.",
      evidence: { repeated_field: repeated?.field ?? null, repeated_value: repeated?.value ?? null },
    };
  }

  if (context.change_type === "UPDATED") {
    const changedFields = context.updated_fields ?? [];
    const creativeFieldChanged = changedFields.some((f) => (CREATIVE_CONTENT_FIELDS as readonly string[]).includes(f));
    return {
      ...base,
      decision: creativeFieldChanged ? "MEDIUM" : "LOW",
      confidence: changedFields.length > 0 ? 0.5 : 0.3,
      rationale: creativeFieldChanged
        ? `Cambiaron campos creativos observables: ${changedFields.join(", ")}.`
        : changedFields.length > 0
          ? `Cambiaron campos no-creativos observables: ${changedFields.join(", ")}.`
          : "Change Detection marcó UPDATED pero no se identificaron campos específicos -- categoría conservadora por evidencia insuficiente.",
      evidence: { updated_fields: changedFields },
    };
  }

  if (context.change_type === "METRICS_CHANGED") {
    const largestPercent = largestMetricPercentChange(context);
    if (largestPercent === null) {
      return {
        ...base,
        decision: "LOW",
        confidence: 0.3,
        rationale: "Nueva observación de métricas sin una base previa comparable (primer snapshot real, o todos los valores previos eran 0) -- categoría conservadora, nunca se infla sin evidencia.",
        evidence: { metrics_delta: context.metrics_delta ?? null },
      };
    }
    const magnitude = Math.abs(largestPercent);
    const decision: RelevanceCategory = magnitude >= 1 ? "HIGH" : magnitude >= 0.2 ? "MEDIUM" : "LOW";
    return {
      ...base,
      decision,
      confidence: 0.6,
      rationale: `Mayor cambio porcentual observado en métricas reales: ${(largestPercent * 100).toFixed(1)}%.`,
      evidence: { largest_metric_percent_change: largestPercent, metrics_delta: context.metrics_delta ?? null },
    };
  }

  // UNCHANGED no debería llegar aquí (evaluateChangeRelevance lo corta antes) -- si ocurre, nunca se inventa atención.
  return { ...base, decision: "IGNORE", confidence: 1, rationale: "Sin cambio observable.", evidence: {} };
}

/**
 * Evalúa la relevancia de UN cambio ya clasificado por Change Detection.
 * `decisionProvider` es opcional/inyectado (nunca construido aquí): pásale
 * `createJevDecisionProvider()` para JEV real, o `null` para saltar
 * directo al fallback determinista cuando el caller ya sabe que JEV no
 * está configurado.
 */
export async function evaluateChangeRelevance(
  context: ChangeContext,
  decisionProvider: DecisionProvider | null
): Promise<RelevanceDecision> {
  if (context.change_type === "UNCHANGED") {
    return {
      decision: "IGNORE",
      confidence: 1,
      rationale: "Sin cambio observable (UNCHANGED) -- nunca se genera una decisión de relevancia para evidencia sin novedad.",
      evidence: {},
      provider: "fallback:deterministic",
      provenance: { reason: "change_type UNCHANGED" },
    };
  }

  if (decisionProvider) {
    try {
      const result = await decisionProvider.classify({
        subject: context,
        labels: RELEVANCE_CATEGORIES,
        context: {
          instructions:
            "Evalúa QUÉ TAN JUSTIFICADAMENTE este cambio observado en un item vigilado merece atención humana, " +
            "usando únicamente la evidencia observable en `subject` (change_type, contenido, métricas/delta, actor, watchlist). " +
            "Nunca es un juicio de calidad, éxito o potencial creativo del contenido -- solo si el cambio en sí merece revisión.",
        },
      });
      return {
        decision: result.label as RelevanceCategory,
        confidence: result.confidence.value,
        rationale: `Clasificado por ${decisionProvider.name} a partir del contexto de cambio observado (change_type=${context.change_type}).`,
        evidence: {
          change_type: context.change_type,
          updated_fields: context.updated_fields ?? null,
          metrics_delta: context.metrics_delta ?? null,
        },
        provider: decisionProvider.name,
        provenance: result.confidence.provenance ?? null,
      };
    } catch (err) {
      return deterministicRelevanceFallback(
        context,
        `${decisionProvider.name} falló o no está configurado: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return deterministicRelevanceFallback(context, "sin DecisionProvider inyectado");
}
