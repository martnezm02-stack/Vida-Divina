// assetAnalysisProvider.ts — Enriquecimiento de assets, determinista:
// organiza tipo/dimensiones/duración/fingerprint ya guardados por MI-1/MI-2
// (metadata_json de cada asset). Un campo ausente en el asset original
// queda `null` -- nunca se completa con un valor inventado.
import { listAssetsForItem } from "../../assets";
import type { AnalysisProvider, AnalysisProviderOutput, AnalysisRequest } from "../types";
import type { IntelligenceItemWithDerived } from "../../types";

interface AssetMetadata {
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  fingerprint?: string | null;
}

export const assetAnalysisProvider: AnalysisProvider = {
  name: "deterministic-asset",

  analyze(items: IntelligenceItemWithDerived[], _request: AnalysisRequest): AnalysisProviderOutput {
    const perItem: Record<number, unknown> = {};
    for (const item of items) {
      const assets = listAssetsForItem(item.id);
      perItem[item.id] = assets.map((asset) => {
        let metadata: AssetMetadata = {};
        if (asset.metadata_json) {
          try {
            metadata = JSON.parse(asset.metadata_json) as AssetMetadata;
          } catch {
            metadata = {};
          }
        }
        return {
          asset_id: asset.id,
          kind: asset.kind,
          url: asset.url,
          width: metadata.width ?? null,
          height: metadata.height ?? null,
          duration_seconds: metadata.duration_seconds ?? null,
          fingerprint: metadata.fingerprint ?? null,
        };
      });
    }
    return { observed: { items: perItem } };
  },
};
