"use client";

import { useState } from "react";
import Link from "next/link";
import { apiUrl } from "@/lib/apiPath";
import { IntelligenceShell } from "@/components/intelligence/IntelligenceShell";
import { Card, EmptyState, ErrorState, LoadingState } from "@/components/intelligence/StateViews";
import type { InsightTrace } from "@/lib/intelligence/dashboard/evidenceQueries";

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export default function EvidenceExplorerPage() {
  const [insightIdInput, setInsightIdInput] = useState("");
  const [trace, setTrace] = useState<InsightTrace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = () => {
    const id = Number(insightIdInput);
    if (!Number.isFinite(id)) return;
    setLoading(true);
    setError(null);
    fetch(apiUrl(`/api/intelligence/trace/${id}`))
      .then((res) => res.json())
      .then((json: ApiResponse<InsightTrace>) => {
        if (!json.ok || !json.data) {
          setError(json.error ?? "No se encontró trazabilidad");
          setTrace(null);
          return;
        }
        setTrace(json.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  return (
    <IntelligenceShell
      title="Evidence Explorer"
      subtitle="Trazabilidad real: Insight → Pattern → Intelligence Items → Evidencia / Fuente original"
    >
      <div className="space-y-4">
        <Card title="Buscar por Insight ID">
          <div className="flex gap-2">
            <input
              type="number"
              value={insightIdInput}
              onChange={(e) => setInsightIdInput(e.target.value)}
              placeholder="ID del insight (ver sección Insights)"
              className="flex-1 rounded-lg border border-intel-border bg-intel-surface-2 px-3 py-1.5 text-sm text-intel-text placeholder:text-intel-muted"
            />
            <button
              type="button"
              onClick={search}
              className="rounded-lg bg-intel-blue px-4 py-1.5 text-sm text-white hover:bg-intel-blue/80 transition-colors"
            >
              Trazar
            </button>
          </div>
        </Card>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : trace ? (
          <Card title="Trazabilidad">
            <div className="space-y-4 text-sm">
              <div>
                <div className="text-xs uppercase text-intel-muted">Insight</div>
                <div className="text-intel-text">{trace.insight.name}</div>
                {trace.insight.summary && <div className="text-xs text-intel-muted mt-1">{trace.insight.summary}</div>}
              </div>

              <div>
                <div className="text-xs uppercase text-intel-muted">Pattern</div>
                {trace.pattern ? (
                  <div className="text-intel-text">
                    {trace.pattern.name} <span className="text-xs text-intel-muted">({trace.pattern.scope ?? "alcance desconocido"})</span>
                  </div>
                ) : (
                  <EmptyState message="Este insight no tiene un pattern de origen registrado." />
                )}
              </div>

              <div>
                <div className="text-xs uppercase text-intel-muted">Intelligence Items ({trace.items.length})</div>
                {trace.items.length === 0 ? (
                  <EmptyState message="Sin items asociados a este pattern." />
                ) : (
                  <ul className="space-y-1">
                    {trace.items.map((item) => (
                      <li key={item.id}>
                        <Link href={`/intelligence/market-intelligence?itemId=${item.id}`} className="text-intel-cyan text-xs">
                          {item.title ?? `Item #${item.id}`} → ver evidencia y fuente
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>
        ) : (
          <EmptyState message="Introduce un Insight ID para ver su trazabilidad completa hasta la evidencia original." />
        )}
      </div>
    </IntelligenceShell>
  );
}
