"use client";

import { SectionListPage } from "@/components/intelligence/SectionListPage";
import type { Pattern } from "@/lib/intelligence/types";

export default function CreativeIntelligencePage() {
  return (
    <SectionListPage<Pattern>
      title="Creative Intelligence"
      subtitle="Patrones creativos detectados (MI-4) -- soporte de detección, no una evaluación de calidad"
      section="patterns"
      emptyMessage="Sin patrones detectados todavía."
      keyOf={(p) => p.id}
      renderItem={(pattern) => (
        <div className="rounded-lg border border-intel-border bg-intel-surface px-4 py-3">
          <div className="text-sm text-intel-text">{pattern.name}</div>
          <div className="text-xs text-intel-muted mt-1">
            {pattern.scope ?? "alcance desconocido"} · {pattern.item_support ?? "?"} items · {pattern.actor_support ?? "?"} actores
            {pattern.confidence !== null ? ` · soporte ${(pattern.confidence * 100).toFixed(0)}%` : ""}
          </div>
        </div>
      )}
    />
  );
}
