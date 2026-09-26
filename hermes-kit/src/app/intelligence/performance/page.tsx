"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/apiPath";
import { useProjectContext } from "@/components/intelligence/ProjectProvider";
import { IntelligenceShell } from "@/components/intelligence/IntelligenceShell";
import { Card, EmptyState, ErrorState, LoadingState } from "@/components/intelligence/StateViews";
import type { PredictionEntry } from "@/lib/intelligence/dashboard/overviewQueries";

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export default function PerformancePage() {
  const { activeProject, loading: projectLoading } = useProjectContext();
  const [predictions, setPredictions] = useState<PredictionEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeProject) {
      setPredictions(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(apiUrl(`/api/intelligence/predictions?projectId=${activeProject.id}`))
      .then((res) => res.json())
      .then((json: ApiResponse<PredictionEntry[]>) => {
        if (cancelled) return;
        if (!json.ok || !json.data) {
          setError(json.error ?? "No se pudo cargar performance");
          return;
        }
        setPredictions(json.data);
        setError(null);
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
  }, [activeProject]);

  const withActual = predictions?.filter((p) => p.status === "ok" && p.actual !== undefined) ?? [];
  const meanError =
    withActual.length > 0
      ? withActual.reduce((sum, p) => sum + Math.abs(p.relativeError ?? 0), 0) / withActual.length
      : null;

  return (
    <IntelligenceShell title="Performance" subtitle="Resumen de precisión del Performance Predictor, solo sobre predicciones con resultado real observado">
      {projectLoading || loading ? (
        <LoadingState />
      ) : !activeProject ? (
        <EmptyState message="No hay ningún proyecto activo." />
      ) : error ? (
        <ErrorState message={error} />
      ) : !predictions || predictions.length === 0 ? (
        <EmptyState message="Sin predicciones registradas todavía." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="Predictions">
            <div className="text-2xl font-semibold text-intel-text">{predictions.length}</div>
          </Card>
          <Card title="Con resultado real">
            <div className="text-2xl font-semibold text-intel-text">{withActual.length}</div>
          </Card>
          <Card title="Error medio (con resultado)">
            {meanError === null ? (
              <EmptyState message="Sin predicciones con resultado real todavía." />
            ) : (
              <div className="text-2xl font-semibold text-intel-text">{(meanError * 100).toFixed(1)}%</div>
            )}
          </Card>
        </div>
      )}
    </IntelligenceShell>
  );
}
