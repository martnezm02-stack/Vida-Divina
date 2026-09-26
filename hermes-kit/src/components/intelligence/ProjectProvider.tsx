"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiUrl } from "@/lib/apiPath";
import type { ProjectListEntry } from "@/lib/intelligence/dashboard/projectQueries";

const STORAGE_KEY = "intel-active-project-id";

interface ProjectContextValue {
  activeProject: ProjectListEntry | null;
  loading: boolean;
  error: string | null;
  setActiveProjectId: (id: number) => void;
  refresh: () => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

function readStoredProjectId(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const id = raw ? Number(raw) : null;
    return id !== null && Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

function writeStoredProjectId(id: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    // per-viewer convenience únicamente -- si falla, el contexto sigue vivo en memoria para esta sesión.
  }
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [activeProject, setActiveProject] = useState<ProjectListEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const hydrateById = useCallback((id: number): Promise<boolean> => {
    return fetch(apiUrl(`/api/intelligence/projects/${id}`))
      .then((res) => res.json())
      .then((json: ApiResponse<ProjectListEntry>) => {
        if (!json.ok || !json.data) return false;
        setActiveProject(json.data);
        writeStoredProjectId(json.data.id);
        return true;
      })
      .catch(() => false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function init() {
      // Aislamiento de contexto: la selección persiste por-navegador, nunca
      // en una variable global ambigua. "Vida Divina" nunca se hardcodea
      // como id -- el fallback real (nombre real existente, o el proyecto
      // con más actividad real) lo calcula getDefaultProject() server-side.
      const stored = readStoredProjectId();
      if (stored !== null) {
        const ok = await hydrateById(stored);
        if (ok || cancelled) return;
      }

      try {
        const res = await fetch(apiUrl("/api/intelligence/projects?limit=1"));
        const json: ApiResponse<{ defaultProject: ProjectListEntry | null }> = await res.json();
        if (cancelled) return;
        if (!json.ok || !json.data) {
          setError(json.error ?? "No se pudieron cargar los proyectos");
          return;
        }
        if (json.data.defaultProject) {
          setActiveProject(json.data.defaultProject);
          writeStoredProjectId(json.data.defaultProject.id);
        } else {
          setActiveProject(null);
        }
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }

    init().finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [reloadToken, hydrateById]);

  const setActiveProjectId = useCallback(
    (id: number) => {
      hydrateById(id);
    },
    [hydrateById]
  );

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  return (
    <ProjectContext.Provider value={{ activeProject, loading, error, setActiveProjectId, refresh }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProjectContext debe usarse dentro de <ProjectProvider>");
  return ctx;
}
