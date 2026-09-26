"use client";

import { SectionListPage } from "@/components/intelligence/SectionListPage";
import type { Insight } from "@/lib/intelligence/types";

export default function InsightsPage() {
  return (
    <SectionListPage<Insight>
      title="Insights"
      subtitle="Insights reales generados por MI-5 para el proyecto activo"
      section="insights"
      emptyMessage="Sin insights generados todavía."
      keyOf={(i) => i.id}
      renderItem={(insight) => (
        <div className="rounded-lg border border-intel-border bg-intel-surface px-4 py-3">
          <div className="text-sm text-intel-text font-medium">{insight.name}</div>
          {insight.summary && <div className="text-xs text-intel-muted mt-1">{insight.summary}</div>}
          <div className="text-[11px] text-intel-muted mt-1">
            v{insight.version} · {new Date(insight.created_at * 1000).toLocaleString("es")}
            {insight.confidence !== null ? ` · confianza ${(insight.confidence * 100).toFixed(0)}%` : ""}
          </div>
        </div>
      )}
    />
  );
}
