// generationProvider.ts — GenerationProvider: síntesis/interpretación en
// lenguaje natural, agnóstico de proveedor (Claude, OpenAI, local...).
// Rol estrictamente distinto de DecisionProvider (MI-4): este módulo nunca
// decide/clasifica/puntúa, solo redacta texto a partir de datos ya
// decididos por capas anteriores (MI-3/MI-4/ContextOptimizer).
//
// No se integra aquí ningún LLM real ni se reutiliza src/lib/openrouter.ts
// (acoplado al agente conversacional de ventas, con su propio system
// prompt/tools/guardrails -- no es una utilidad de síntesis genérica). La
// implementación de referencia es puramente determinista/basada en
// plantillas: MI-5 debe funcionar sin ningún modelo generativo real, igual
// que sin JEV. Un provider real (Claude u otro) es intercambiable después
// sin tocar insightService.ts.
import type { GenerationProvider, GenerationRequest, GenerationResult } from "./types";

function interpretationTemplate(context: any): string {
  const scope = context?.evidence?.scope;
  const frequencyPct = context?.finding?.frequency_pct;
  const patternType: string | undefined = context?.evidence?.pattern_type;

  const subject = scope === "market" ? "Múltiples actores distintos" : "Un mismo actor";
  const implication =
    scope === "market"
      ? "sugiere una concentración de mercado alrededor de este elemento creativo"
      : "sugiere un patrón propio de ese actor, no necesariamente una tendencia de mercado";

  const kind = patternType?.startsWith("performance_") ? "cambio de performance" : "elemento creativo";

  return `${subject} repite este ${kind}${
    frequencyPct !== null && frequencyPct !== undefined ? ` (presente en ${frequencyPct}% de lo examinado)` : ""
  }, lo cual ${implication}.`;
}

function recommendationTemplate(context: any): string {
  const scope = context?.evidence?.scope;
  const suggestion =
    scope === "market"
      ? "explorar una variante diferenciada frente a este patrón de mercado"
      : "evaluar si vale la pena adoptar o evitar este patrón específico de este actor";
  return `Puede ${suggestion}. Esta es una sugerencia exploratoria a validar, no una conclusión definitiva ni un ranking de competidores.`;
}

/**
 * Implementación de referencia: sin llamadas a red, sin IA. Suficiente
 * para que MI-5 sea completamente funcional y testeable sin depender de
 * ningún modelo generativo real.
 */
export const deterministicGenerationProvider: GenerationProvider = {
  name: "deterministic-template",

  generate(request: GenerationRequest): GenerationResult {
    const kind = request.options?.kind;
    if (kind === "interpretation") {
      return { text: interpretationTemplate(request.context), model: null };
    }
    if (kind === "recommendation") {
      return { text: recommendationTemplate(request.context), model: null };
    }
    return { text: request.prompt, model: null };
  },
};
