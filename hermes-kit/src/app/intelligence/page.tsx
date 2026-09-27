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

const KPI_ACCENTS = ["bg-intel-cyan", "bg-intel-blue", "bg-intel-violet", "bg-intel-low", "bg-intel-medium"];

function KpiCard({ label, value, caption, accent, href }: { label: string; value: number; caption?: string; accent: string; href?: string }) {
  const content = (
    <>
      <span className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
      <div className="text-[11px] font-medium uppercase tracking-wider text-intel-muted">{label}</div>
      <div className="mt-1.5 font-display text-3xl font-semibold text-intel-text">{value.toLocaleString("es")}</div>
      {caption && <div className="mt-1 text-[11px] text-intel-muted">{caption}</div>}
    </>
  );
  const className = "relative overflow-hidden rounded-xl border border-intel-border bg-intel-surface p-4";
  if (href) {
    return (
      <Link href={href} className={`${className} block hover:border-intel-blue/50 transition-colors`}>
        {content}
      </Link>
    );
  }
  return <div className={className}>{content}</div>;
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
            <KpiCard label="Intelligence Items" value={data.kpis.intelligenceItems} accent={KPI_ACCENTS[0]} />
            <KpiCard label="Actores" value={data.kpis.actors} accent={KPI_ACCENTS[1]} />
            <KpiCard label="Signals" value={data.kpis.signals} accent={KPI_ACCENTS[2]} />
            <KpiCard label="Insights" value={data.kpis.insights} accent={KPI_ACCENTS[3]} />
            <KpiCard
              label="Intelligence Briefs"
              value={data.kpis.intelligenceBriefsAvailable ? 1 : 0}
              caption={data.kpis.intelligenceBriefsAvailable ? "Disponible -- generar y ver" : "Sin evidencia suficiente todavía"}
              accent={KPI_ACCENTS[4]}
              href="/intelligence/briefs"
            />
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
  const colorBySource = new Map(
    sources.map((source, i) => [source, ["bg-intel-cyan", "bg-intel-blue", "bg-intel-violet", "bg-intel-medium"][i % 4]])
  );
  // Escala relativa al TOTAL diario (apilado), no al máximo de un punto
  // individual -- con un solo punto por fuente, escalar contra el máximo
  // de un punto aislado podía pedir más del 100% de altura al día con
  // más fuentes combinadas (nunca visible: dependía de que flexbox lo
  // recortara por accidente). Ahora la barra apilada de un día nunca
  // excede la altura del gráfico.
  const dailyTotals = dates.map((date) => points.filter((p) => p.date === date).reduce((sum, p) => sum + p.count, 0));
  const maxDailyTotal = Math.max(...dailyTotals, 1);

  return (
    <div>
      <div className="flex gap-4 mb-3 text-xs">
        {sources.map((source) => (
          <div key={source} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${colorBySource.get(source)}`} />
            <span className="text-intel-muted">{source}</span>
          </div>
        ))}
      </div>
      {/* h-32 en el contenedor no basta: con items-end (nunca stretch) cada
          columna quedaba con altura auto/content-based, así que el height:
          "N%" de la barra resolvía contra un contenedor sin altura definida
          -- 0px renderizado (fechas y leyenda sí se veían porque no dependen
          de altura). Cada columna necesita su PROPIA altura explícita
          (h-full, heredada del h-32 del padre) para que el porcentaje de la
          barra tenga algo real contra qué resolver. */}
      <div className="flex gap-1 h-32">
        {dates.map((date, dateIndex) => {
          const dayPoints = points.filter((p) => p.date === date);
          const dayTotal = dailyTotals[dateIndex];
          return (
            <div
              key={date}
              className="flex-1 flex h-full flex-col-reverse items-center gap-px"
              title={`${date}: ${dayTotal} (${dayPoints.map((p) => `${p.sourceSlug}=${p.count}`).join(", ")})`}
            >
              {dayPoints.map((point) => (
                <div
                  key={point.sourceSlug}
                  className={`w-full last:rounded-t ${colorBySource.get(point.sourceSlug)}`}
                  style={{ height: `${Math.max((point.count / maxDailyTotal) * 100, 2)}%` }}
                />
              ))}
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
