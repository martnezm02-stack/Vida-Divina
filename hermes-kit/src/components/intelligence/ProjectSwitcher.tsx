"use client";

import { useState } from "react";
import { useProjectContext } from "./ProjectProvider";

export function ProjectSwitcher() {
  const { projects, activeProject, loading, setActiveProjectId } = useProjectContext();
  const [open, setOpen] = useState(false);

  if (loading) {
    return <div className="h-11 rounded-lg bg-intel-surface-2 animate-pulse" />;
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-intel-border bg-intel-surface-2 px-3 py-2 text-xs text-intel-muted">
        Sin proyectos todavía
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-intel-border bg-intel-surface-2 px-3 py-2 text-left hover:border-intel-blue/50 transition-colors"
      >
        <div>
          <div className="text-[10px] uppercase tracking-wide text-intel-muted">Proyecto actual</div>
          <div className="text-sm font-medium text-intel-text">{activeProject?.name ?? "—"}</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 20 20" className={`text-intel-muted transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-intel-border bg-intel-bg-elevated shadow-xl overflow-hidden">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => {
                setActiveProjectId(project.id);
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-intel-surface-2 transition-colors ${
                project.id === activeProject?.id ? "text-intel-cyan" : "text-intel-text"
              }`}
            >
              {project.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
