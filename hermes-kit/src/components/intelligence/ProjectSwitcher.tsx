"use client";

import { useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/apiPath";
import { useProjectContext } from "./ProjectProvider";
import type { ProjectListEntry } from "@/lib/intelligence/dashboard/projectQueries";

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

const PAGE_LIMIT = 30;

/**
 * La BD real tiene miles de proyectos acumulados por sesiones de test
 * anteriores (getOrCreateProject en decenas de archivos de test) --
 * renderizar todos rompería el sidebar. El switcher SIEMPRE pide una
 * página acotada (server-side LIMIT + búsqueda), nunca la lista completa.
 */
function useProjectSearch(query: string, open: boolean) {
  const [results, setResults] = useState<ProjectListEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
    if (query) params.set("search", query);

    fetch(apiUrl(`/api/intelligence/projects?${params.toString()}`))
      .then((res) => res.json())
      .then((json: ApiResponse<{ projects: ProjectListEntry[]; total: number }>) => {
        if (cancelled) return;
        if (json.ok && json.data) {
          setResults(json.data.projects);
          setTotal(json.data.total);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, open]);

  return { results, total, loading };
}

export function ProjectSwitcher() {
  const { activeProject, loading: activeLoading, setActiveProjectId } = useProjectContext();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const { results, total, loading } = useProjectSearch(query, open);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (activeLoading) {
    return <div className="h-[52px] rounded-lg bg-intel-surface-2 animate-pulse" />;
  }

  if (!activeProject) {
    return (
      <div className="rounded-lg border border-intel-border bg-intel-surface-2 px-3 py-2 text-xs text-intel-muted">
        Sin proyectos todavía
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-intel-border bg-intel-surface-2 px-3 py-2 text-left hover:border-intel-blue/50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide text-intel-muted">Proyecto actual</div>
          <div className="flex items-center gap-1.5">
            <div className="text-sm font-medium text-intel-text truncate" title={activeProject.name}>
              {activeProject.name}
            </div>
            {activeProject.isLikelyTest && <TestBadge />}
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 20 20" className={`shrink-0 text-intel-muted transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full rounded-lg border border-intel-border bg-intel-bg-elevated shadow-xl overflow-hidden">
          <div className="p-2 border-b border-intel-border">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar proyecto..."
              className="w-full rounded-md border border-intel-border bg-intel-surface-2 px-2.5 py-1.5 text-sm text-intel-text placeholder:text-intel-muted"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto intel-scrollbar py-1">
            {loading ? (
              <li className="px-3 py-2 text-xs text-intel-muted">Buscando...</li>
            ) : results.length === 0 ? (
              <li className="px-3 py-2 text-xs text-intel-muted">Sin proyectos que coincidan.</li>
            ) : (
              results.map((project) => (
                <li key={project.id} role="option" aria-selected={project.id === activeProject.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveProjectId(project.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-intel-surface-2 transition-colors ${
                      project.id === activeProject.id ? "text-intel-cyan" : "text-intel-text"
                    }`}
                  >
                    <span className="truncate">{project.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {project.isLikelyTest && <TestBadge />}
                      <span className="text-[11px] text-intel-muted">{project.itemCount}</span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          {total > results.length && (
            <div className="px-3 py-1.5 text-[11px] text-intel-muted border-t border-intel-border">
              Mostrando {results.length} de {total} -- refina la búsqueda para ver más.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TestBadge() {
  return (
    <span className="shrink-0 rounded-full bg-intel-medium/20 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-intel-medium">
      Test/Internal
    </span>
  );
}
