"use client";

import { SectionListPage } from "@/components/intelligence/SectionListPage";
import type { Actor } from "@/lib/intelligence/types";

export default function CompetitiveIntelligencePage() {
  return (
    <SectionListPage<Actor>
      title="Competitive Intelligence"
      subtitle="Actores observados en el mercado -- sin rankings artificiales de 'mejor competidor'"
      section="actors"
      emptyMessage="Sin actores observados todavía."
      keyOf={(a) => a.id}
      renderItem={(actor) => (
        <div className="flex items-center justify-between rounded-lg border border-intel-border bg-intel-surface px-4 py-3">
          <div>
            <div className="text-sm text-intel-text">{actor.display_name ?? actor.handle ?? `Actor #${actor.id}`}</div>
            <div className="text-xs text-intel-muted">{actor.type ?? "Tipo desconocido"}</div>
          </div>
          {actor.url && (
            <a href={actor.url} target="_blank" rel="noreferrer" className="text-xs text-intel-cyan">
              Ver perfil
            </a>
          )}
        </div>
      )}
    />
  );
}
