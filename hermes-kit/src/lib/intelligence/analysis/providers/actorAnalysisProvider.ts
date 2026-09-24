// actorAnalysisProvider.ts — Enriquecimiento de actor (anunciante/marca/
// creador), determinista: normaliza y organiza lo ya guardado por MI-1/MI-2
// sobre el actor de cada item. Sin actor asociado, el item queda con
// `actor: null` -- nunca se inventa uno.
import { getActorById } from "../../actors";
import type { AnalysisProvider, AnalysisProviderOutput, AnalysisRequest } from "../types";
import type { IntelligenceItemWithDerived } from "../../types";

export const actorAnalysisProvider: AnalysisProvider = {
  name: "deterministic-actor",

  analyze(items: IntelligenceItemWithDerived[], _request: AnalysisRequest): AnalysisProviderOutput {
    const perItem: Record<number, unknown> = {};
    for (const item of items) {
      const actor = item.actor_id ? getActorById(item.actor_id) : null;
      perItem[item.id] = actor
        ? {
            actor_id: actor.id,
            type: actor.type,
            handle: actor.handle,
            display_name: actor.display_name,
            url: actor.url,
            source_identity: actor.external_id,
          }
        : null;
    }
    return { observed: { items: perItem } };
  },
};
