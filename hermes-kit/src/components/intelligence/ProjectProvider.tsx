"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiUrl } from "@/lib/apiPath";
import type { Project } from "@/lib/intelligence/types";

const STORAGE_KEY = "intel-active-project-id";

interface ProjectContextValue {
  projects: Project[];
  activeProject: Project | null;
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

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(apiUrl("/api/intelligence/projects"))
      .then((res) => res.json())
      .then((json: ApiResponse<Project[]>) => {
        if (cancelled) return;
        if (!json.ok || !json.data) {
          setError(json.error ?? "No se pudieron cargar los proyectos");
          return;
        }
        setProjects(json.data);
        setError(null);

        // Aislamiento de contexto: la selección persiste por-navegador,
        // nunca en una variable global ambigua. Si el proyecto guardado ya
        // no existe (fue eliminado en otra sesión), cae al primero real
        // disponible -- nunca a un id inventado.
        let stored: number | null = null;
        try {
          const raw = window.localStorage.getItem(STORAGE_KEY);
          stored = raw ? Number(raw) : null;
        } catch {
          stored = null;
        }
        const validStored = stored !== null && json.data.some((p) => p.id === stored);
        setActiveProjectIdState(validStored ? stored : json.data[0]?.id ?? null);
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
  }, [reloadToken]);

  const setActiveProjectId = useCallback((id: number) => {
    setActiveProjectIdState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(id));
    } catch {
      // per-viewer convenience únicamente -- si falla, el contexto sigue vivo en memoria para esta sesión.
    }
  }, []);

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  return (
    <ProjectContext.Provider value={{ projects, activeProject, loading, error, setActiveProjectId, refresh }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProjectContext debe usarse dentro de <ProjectProvider>");
  return ctx;
}
