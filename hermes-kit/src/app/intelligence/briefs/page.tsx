"use client";

import { useState } from "react";
import { apiUrl } from "@/lib/apiPath";
import { useProjectContext } from "@/components/intelligence/ProjectProvider";
import { IntelligenceShell } from "@/components/intelligence/IntelligenceShell";
import { Card, EmptyState, ErrorState, InsufficientEvidenceState, LoadingState } from "@/components/intelligence/StateViews";

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

type BriefOutcome =
  | { status: "ok"; brief: { key_findings: string[]; opportunities: string[]; unanswered_questions: string[]; observed_evidence: { total_items_examined: number; total_patterns: number; total_actors: number } } }
  | { status: "insufficient_evidence"; reason: string };

export default function BriefsPage() {
  const { activeProject } = useProjectContext();
  const [outcome, setOutcome] = useState<BriefOutcome | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = () => {
    if (!activeProject) return;
    setLoading(true);
    setError(null);
    fetch(apiUrl("/api/intelligence/briefs/generate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: activeProject.id }),
    })
      .then((res) => res.json())
      .then((json: ApiResponse<BriefOutcome>) => {
        if (!json.ok || !json.data) {
          setError(json.error ?? "No se pudo generar el brief");
          return;
        }
        setOutcome(json.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  return (
    <IntelligenceShell
      title="Intelligence Briefs"
      subtitle="Los briefs se generan bajo demanda a partir de evidencia real -- nunca se almacena un historial"
    >
      <div className="space-y-4">
        <Card>
          <button
            type="button"
            onClick={generate}
            disabled={!activeProject || loading}
            className="rounded-lg bg-intel-blue px-4 py-2 text-sm text-white hover:bg-intel-blue/80 disabled:opacity-40 transition-colors"
          >
            {loading ? "Generando..." : "Generar Intelligence Brief"}
          </button>
        </Card>

        {error ? (
          <ErrorState message={error} />
        ) : loading ? (
          <LoadingState label="Analizando evidencia real del proyecto..." />
        ) : !outcome ? (
          <EmptyState message="Genera un brief para ver hallazgos reales del proyecto activo." />
        ) : outcome.status === "insufficient_evidence" ? (
          <InsufficientEvidenceState reason={outcome.reason} />
        ) : (
          <Card title="Brief generado">
            <div className="space-y-4 text-sm">
              <div className="text-xs text-intel-muted">
                {outcome.brief.observed_evidence.total_items_examined} items examinados ·{" "}
                {outcome.brief.observed_evidence.total_patterns} patterns · {outcome.brief.observed_evidence.total_actors} actores
              </div>
              <div>
                <div className="text-xs uppercase text-intel-muted mb-1">Hallazgos clave</div>
                {outcome.brief.key_findings.length === 0 ? (
                  <EmptyState message="Sin hallazgos suficientes para reportar." />
                ) : (
                  <ul className="list-disc pl-4 space-y-1 text-intel-text">
                    {outcome.brief.key_findings.map((finding, i) => (
                      <li key={i}>{finding}</li>
                    ))}
                  </ul>
                )}
              </div>
              {outcome.brief.opportunities.length > 0 && (
                <div>
                  <div className="text-xs uppercase text-intel-muted mb-1">Oportunidades</div>
                  <ul className="list-disc pl-4 space-y-1 text-intel-text">
                    {outcome.brief.opportunities.map((opp, i) => (
                      <li key={i}>{opp}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </IntelligenceShell>
  );
}
