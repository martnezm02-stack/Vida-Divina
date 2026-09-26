"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/apiPath";
import { useProjectContext } from "@/components/intelligence/ProjectProvider";
import { IntelligenceShell } from "@/components/intelligence/IntelligenceShell";
import { EmptyState, ErrorState, InsufficientEvidenceState, LoadingState } from "@/components/intelligence/StateViews";
import type { PredictionEntry } from "@/lib/intelligence/dashboard/overviewQueries";

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export default function PredictionsPage() {
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
          setError(json.error ?? "No se pudieron cargar las predicciones");
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

  return (
    <IntelligenceShell title="Predictions" subtitle="Predicciones reales del Performance Predictor, comparadas contra resultado real cuando existe">
      {projectLoading || loading ? (
        <LoadingState />
      ) : !activeProject ? (
        <EmptyState message="No hay ningún proyecto activo." />
      ) : error ? (
        <ErrorState message={error} />
      ) : !predictions || predictions.length === 0 ? (
        <EmptyState message="Sin predicciones registradas todavía." />
      ) : (
        <div className="space-y-2">
          {predictions.map((prediction) =>
            prediction.status === "insufficient_evidence" ? (
              <InsufficientEvidenceState key={prediction.id} />
            ) : (
              <div key={prediction.id} className="rounded-lg border border-intel-border bg-intel-surface px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-intel-text">{prediction.metric}</span>
                  <span className="text-xs text-intel-muted">{new Date(prediction.createdAt * 1000).toLocaleDateString("es")}</span>
                </div>
                <div className="text-xs text-intel-muted mt-1">
                  Predicho: {prediction.predictedValue?.toFixed(3)} · confianza {((prediction.confidence ?? 0) * 100).toFixed(0)}%
                  {prediction.actual !== undefined ? ` · Actual: ${prediction.actual.toFixed(3)}` : " · Actual: pendiente"}
                  {prediction.relativeError !== null && prediction.relativeError !== undefined
                    ? ` · Error: ${(prediction.relativeError * 100).toFixed(1)}%`
                    : ""}
                </div>
                {prediction.matchedFields && prediction.matchedFields.length > 0 && (
                  <div className="text-[11px] text-intel-muted mt-1">Basado en: {prediction.matchedFields.join(", ")}</div>
                )}
              </div>
            )
          )}
        </div>
      )}
    </IntelligenceShell>
  );
}
