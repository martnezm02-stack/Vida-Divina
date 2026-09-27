"use client";

import { useState } from "react";
import Link from "next/link";
import { apiUrl } from "@/lib/apiPath";
import { useProjectContext } from "@/components/intelligence/ProjectProvider";
import { IntelligenceShell } from "@/components/intelligence/IntelligenceShell";
import { Card, EmptyState, ErrorState, InsufficientEvidenceState, LoadingState } from "@/components/intelligence/StateViews";

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface BriefPatternRef {
  id: number;
  name: string;
  pattern_key: string | null;
}

interface BriefInsightRef {
  id: number;
  name: string;
  summary: string | null;
  version: number;
  source_pattern_id: number | null;
}

interface BriefProvenance {
  item_ids: number[];
  evidence_ids: number[];
  pattern_ids: number[];
  actor_ids: number[];
}

interface BriefDetail {
  key_findings: string[];
  opportunities: string[];
  unanswered_questions: string[];
  observed_evidence: { total_items_examined: number; total_patterns: number; total_actors: number };
  patterns: BriefPatternRef[];
  insights: BriefInsightRef[];
  provenance: BriefProvenance;
  generated_at: number;
}

type BriefOutcome = { status: "ok"; brief: BriefDetail } | { status: "insufficient_evidence"; reason: string };

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
          <Card
            title="Brief generado"
            action={<span className="text-[11px] text-intel-muted">{new Date(outcome.brief.generated_at * 1000).toLocaleString("es")}</span>}
          >
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

              {outcome.brief.patterns.length > 0 && (
                <div>
                  <div className="text-xs uppercase text-intel-muted mb-1">Patterns que respaldan este brief</div>
                  <ul className="space-y-1">
                    {outcome.brief.patterns.map((pattern) => (
                      <li key={pattern.id} className="text-intel-text">
                        {pattern.name} <span className="text-xs text-intel-muted">(pattern #{pattern.id})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {outcome.brief.insights.length > 0 && (
                <div>
                  <div className="text-xs uppercase text-intel-muted mb-1">Insights vigentes usados</div>
                  <ul className="space-y-1">
                    {outcome.brief.insights.map((insight) => (
                      <li key={insight.id} className="text-intel-text">
                        <Link href="/intelligence/evidence-explorer" className="text-intel-cyan hover:underline">
                          {insight.name} (insight #{insight.id}, v{insight.version})
                        </Link>
                        {insight.summary && <div className="text-xs text-intel-muted">{insight.summary}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <div className="text-xs uppercase text-intel-muted mb-1">Provenance (trazabilidad real)</div>
                <div className="grid grid-cols-2 gap-2 text-xs text-intel-muted">
                  <div>
                    Patterns: {outcome.brief.provenance.pattern_ids.join(", ") || "ninguno"}
                  </div>
                  <div>
                    Actores: {outcome.brief.provenance.actor_ids.length}
                  </div>
                  <div className="col-span-2">
                    Items: {outcome.brief.provenance.item_ids.length} ·{" "}
                    <Link href="/intelligence/market-intelligence" className="text-intel-cyan hover:underline">
                      ver items en Market Intelligence
                    </Link>
                  </div>
                  <div className="col-span-2">Evidence: {outcome.brief.provenance.evidence_ids.length} filas reales</div>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </IntelligenceShell>
  );
}
