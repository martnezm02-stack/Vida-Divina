// creativeAnalysisProvider.ts — Enriquecimiento creativo determinista.
//
// Todo lo que expone ya existe como dato observado en el item (MI-1/MI-2)
// -- este provider solo lo organiza para el contrato de análisis, nunca
// infiere nada. `inferred` queda vacío a propósito: un futuro provider
// respaldado por LLM sí podría poblarlo (p.ej. "messaging themes"
// derivados del texto), pero eso no es responsabilidad de este provider.
import type { AnalysisProvider, AnalysisProviderOutput, AnalysisRequest } from "../types";
import type { IntelligenceItemWithDerived } from "../../types";

export const creativeAnalysisProvider: AnalysisProvider = {
  name: "deterministic-creative",

  analyze(items: IntelligenceItemWithDerived[], _request: AnalysisRequest): AnalysisProviderOutput {
    const perItem: Record<number, unknown> = {};
    for (const item of items) {
      perItem[item.id] = {
        content_type: item.content_type,
        media_type: item.media_type,
        format: item.format,
        style: item.style,
        theme: item.theme,
        hook: item.hook,
        angle: item.angle,
        cta: item.cta,
        offer: item.offer,
        funnel_stage: item.funnel_stage,
        tags: item.tags_json ? JSON.parse(item.tags_json) : [],
      };
    }
    return { observed: { items: perItem } };
  },
};
