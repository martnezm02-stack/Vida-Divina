"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiUrl } from "@/lib/apiPath";
import { useProjectContext } from "@/components/intelligence/ProjectProvider";
import { IntelligenceShell } from "@/components/intelligence/IntelligenceShell";
import { Card, EmptyState, ErrorState, InsufficientEvidenceState, LoadingState } from "@/components/intelligence/StateViews";
import type { OverviewData } from "@/lib/intelligence/dashboard/overviewQueries";

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

function useOverviewData(projectId: number | null) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (projectId === null) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(apiUrl(`/api/intelligence/overview?projectId=${projectId}`))
      .then((res) => res.json())
      .then((json: ApiResponse<OverviewData>) => {
        if (cancelled) return;
        if (!json.ok || !json.data) {
          setError(json.error ?? "No se pudo cargar el overview");
          return;
        }
        setData(json.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { data, loading, error };
}

function KpiCard({ label, value, caption }: { label: string; value: number; caption?: string }) {
  return (
    <div className="rounded-xl border border-intel-border bg-intel-surface p-4">
      <div className="text-xs uppercase tracking-wide text-intel-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-intel-text">{value.toLocaleString("es")}</div>
      {caption && <div className="mt-1 text-[11px] text-intel-muted">{caption}</div>}
    </div>
  );
}

const RELEVANCE_COLORS: Record<string, string> = {
  HIGH: "bg-intel-high",
  MEDIUM: "bg-intel-medium",
  LOW: "bg-intel-low",
  IGNORE: "bg-intel-info",
  OTHER: "bg-intel-info",
};

export default function IntelligenceOverviewPage() {
  const { activeProject, loading: projectLoading } = useProjectContext();
  const { data, loading, error } = useOverviewData(activeProject?.id ?? null);

  return (
    <IntelligenceShell title="Market Intelligence Overview" subtitle="Vista general de la actividad, señales e insights del mercado">
      {projectLoading || loading ? (
        <LoadingState label="Cargando overview..." />
      ) : error ? (
        <ErrorState message={error} />
      ) : !activeProject ? (
        <EmptyState message="No hay ningún proyecto activo. Crea uno para empezar a ver inteligencia de mercado." />
      ) : !data ? (
        <EmptyState message="Sin datos disponibles todavía." />
      ) : (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KpiCard label="Intelligence Items" value={data.kpis.intelligenceItems} />
            <KpiCard label="Actores" value={data.kpis.actors} />
            <KpiCard label="Signals" value={data.kpis.signals} />
            <KpiCard label="Insights" value={data.kpis.insights} />
            <KpiCard label="Intelligence Briefs" value={0} caption="Generado bajo demanda" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Actividad del mercado */}
            <Card title="Actividad del mercado">
              {data.marketActivity.length === 0 ? (
                <EmptyState message="Sin actividad registrada en la ventana seleccionada." />
              ) : (
                <MarketActivityChart points={data.marketActivity} />
              )}
            </Card>

            {/* Signals por relevancia */}
            <Card title="Signals por relevancia">
              {data.signalsByRelevance.total === 0 ? (
                <EmptyState message="Sin signals de relevancia registradas todavía." />
              ) : (
                <div className="space-y-2">
                  {Object.entries(data.signalsByRelevance.buckets)
                    .filter(([, count]) => count > 0)
                    .map(([bucket, count]) => (
                      <div key={bucket} className="flex items-center gap-3">
                        <span className={`h-2.5 w-2.5 rounded-full ${RELEVANCE_COLORS[bucket]}`} />
                        <span className="w-24 text-sm text-intel-muted">{bucket}</span>
                        <div className="flex-1 h-2 rounded-full bg-intel-surface-2 overflow-hidden">
                          <div
                            className={`h-full ${RELEVANCE_COLORS[bucket]}`}
                            style={{ width: `${(count / data.signalsByRelevance.total) * 100}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-sm text-intel-text">{count}</span>
                      </div>
                    ))}
                </div>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Actividad por fuente */}
            <Card title="Actividad por fuente">
              {data.sourceActivity.length === 0 ? (
                <EmptyState message="Sin items registrados todavía." />
              ) : (
                <div className="space-y-2">
                  {data.sourceActivity.map((entry) => {
                    const total = data.sourceActivity.reduce((sum, e) => sum + e.itemCount, 0);
                    const pct = total > 0 ? Math.round((entry.itemCount / total) * 100) : 0;
                    return (
                      <div key={entry.sourceSlug} className="flex items-center gap-3">
                        <span className="w-28 text-sm text-intel-muted truncate">{entry.sourceName}</span>
                        <div className="flex-1 h-2 rounded-full bg-intel-surface-2 overflow-hidden">
                          <div className="h-full bg-intel-blue" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-16 text-right text-sm text-intel-text">
                          {entry.itemCount} · {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Signals recientes */}
            <Card title="Signals recientes">
              {data.recentSignals.length === 0 ? (
                <EmptyState message="Sin signals recientes." />
              ) : (
                <ul className="space-y-2">
                  {data.recentSignals.map((signal) => (
                    <li key={signal.id} className="flex items-start gap-3 text-sm">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-intel-cyan" />
                      <div className="flex-1">
                        <div className="text-intel-text">{signal.title}</div>
                        <div className="text-xs text-intel-muted">
                          {signal.signal_type} · {new Date(signal.detected_at * 1000).toLocaleDateString("es")}
                        </div>
                      </div>
                      {signal.item_id && (
                        <Link href={`/intelligence/market-intelligence?itemId=${signal.item_id}`} className="text-xs text-intel-cyan shrink-0">
                          Ver evidencia
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Insights recientes */}
            <Card title="Insights recientes">
              {data.recentInsights.length === 0 ? (
                <EmptyState message="Sin insights generados todavía." />
              ) : (
                <ul className="space-y-3">
                  {data.recentInsights.map((insight) => (
                    <li key={insight.id} className="text-sm">
                      <div className="text-intel-text font-medium">{insight.name}</div>
                      {insight.summary && <div className="text-xs text-intel-muted mt-0.5">{insight.summary}</div>}
                      <div className="text-[11px] text-intel-muted mt-1">
                        {insight.created_at ? new Date(insight.created_at * 1000).toLocaleDateString("es") : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Actores más activos */}
            <Card title="Actores más activos">
              {data.activeActors.length === 0 ? (
                <EmptyState message="Sin actores observados todavía." />
              ) : (
                <ul className="space-y-2">
                  {data.activeActors.map((entry) => (
                    <li key={entry.actor.id} className="flex items-center justify-between text-sm">
                      <span className="text-intel-text">{entry.actor.display_name ?? entry.actor.handle ?? `Actor #${entry.actor.id}`}</span>
                      <span className="text-xs text-intel-muted">
                        {entry.itemCount} items · {entry.signalCount} signals
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Contenido reciente del mercado */}
          <Card title="Contenido reciente del mercado">
            {data.recentContent.length === 0 ? (
              <EmptyState message="Sin contenido reciente registrado." />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {data.recentContent.map((entry) => (
                  <Link
                    key={entry.item.id}
                    href={`/intelligence/market-intelligence?itemId=${entry.item.id}`}
                    className="rounded-lg border border-intel-border bg-intel-surface-2 overflow-hidden hover:border-intel-blue/50 transition-colors"
                  >
                    <div className="h-24 bg-intel-bg flex items-center justify-center text-intel-muted text-xs">
                      {entry.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={entry.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        "Sin miniatura"
                      )}
                    </div>
                    <div className="p-2 text-xs">
                      <div className="text-intel-muted">{entry.sourceSlug}</div>
                      <div className="text-intel-text truncate">{entry.item.title ?? "Sin título"}</div>
                      <div className="text-intel-muted mt-1">
                        {entry.metrics?.views !== null && entry.metrics?.views !== undefined ? `${entry.metrics.views} vistas` : "Vistas desconocidas"}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Patrones creativos principales */}
          <Card title="Patrones creativos principales">
            {data.creativePatterns.length === 0 ? (
              <EmptyState message="Sin patrones detectados todavía." />
            ) : (
              <div className="space-y-2">
                {data.creativePatterns.map((entry) => (
                  <div key={entry.pattern.id} className="flex items-center gap-3">
                    <span className="w-48 text-sm text-intel-text truncate">{entry.pattern.name}</span>
                    <div className="flex-1 h-2 rounded-full bg-intel-surface-2 overflow-hidden">
                      <div className="h-full bg-intel-violet" style={{ width: `${Math.round((entry.pattern.confidence ?? 0) * 100)}%` }} />
                    </div>
                    <span className="w-32 text-right text-xs text-intel-muted">
                      {entry.itemSupport ?? "?"} items · {entry.actorSupport ?? "?"} actores
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Performance & Predictions */}
          <Card title="Performance & Predictions">
            {data.performancePredictions.length === 0 ? (
              <EmptyState message="Sin predicciones registradas todavía." />
            ) : (
              <ul className="space-y-2">
                {data.performancePredictions.map((prediction) => (
                  <li key={prediction.id} className="flex items-center justify-between text-sm border-b border-intel-border/60 pb-2 last:border-0">
                    {prediction.status === "insufficient_evidence" ? (
                      <InsufficientEvidenceState />
                    ) : (
                      <>
                        <span className="text-intel-text">{prediction.metric}</span>
                        <span className="text-xs text-intel-muted">
                          Predicho: {prediction.predictedValue?.toFixed(3)}
                          {prediction.actual !== undefined ? ` · Actual: ${prediction.actual.toFixed(3)}` : " · Actual: pendiente"}
                          {prediction.relativeError !== null && prediction.relativeError !== undefined
                            ? ` · Error: ${(prediction.relativeError * 100).toFixed(1)}%`
                            : ""}
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </IntelligenceShell>
  );
}

function MarketActivityChart({ points }: { points: OverviewData["marketActivity"] }) {
  const dates = [...new Set(points.map((p) => p.date))].sort();
  const sources = [...new Set(points.map((p) => p.sourceSlug))];
  const maxCount = Math.max(...points.map((p) => p.count), 1);
  const colors = ["bg-intel-cyan", "bg-intel-blue", "bg-intel-violet", "bg-intel-medium"];

  return (
    <div>
      <div className="flex gap-4 mb-3 text-xs">
        {sources.map((source, i) => (
          <div key={source} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${colors[i % colors.length]}`} />
            <span className="text-intel-muted">{source}</span>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-1 h-32">
        {dates.map((date) => {
          const dayTotal = points.filter((p) => p.date === date).reduce((sum, p) => sum + p.count, 0);
          return (
            <div key={date} className="flex-1 flex flex-col items-center gap-1" title={`${date}: ${dayTotal}`}>
              <div
                className="w-full rounded-t bg-intel-blue/70"
                style={{ height: `${Math.max((dayTotal / maxCount) * 100, 4)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-intel-muted">
        <span>{dates[0]}</span>
        <span>{dates[dates.length - 1]}</span>
      </div>
    </div>
  );
}
