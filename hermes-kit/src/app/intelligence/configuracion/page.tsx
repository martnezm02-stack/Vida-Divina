"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/apiPath";
import { useProjectContext } from "@/components/intelligence/ProjectProvider";
import { useTheme } from "@/components/intelligence/ThemeProvider";
import { IntelligenceShell } from "@/components/intelligence/IntelligenceShell";
import { Card, EmptyState } from "@/components/intelligence/StateViews";
import { DEFAULT_BRAND_CONFIG } from "@/lib/intelligence/dashboard/brandConfig";

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

function useProjectCount() {
  const [total, setTotal] = useState<number | null>(null);
  useEffect(() => {
    fetch(apiUrl("/api/intelligence/projects?limit=1"))
      .then((res) => res.json())
      .then((json: ApiResponse<{ total: number }>) => {
        if (json.ok && json.data) setTotal(json.data.total);
      })
      .catch(() => {});
  }, []);
  return total;
}

export default function ConfiguracionPage() {
  const { activeProject } = useProjectContext();
  const { theme, setTheme } = useTheme();
  const totalProjects = useProjectCount();

  return (
    <IntelligenceShell title="Configuración" subtitle="Marca, tema y proyectos de esta instancia">
      <div className="space-y-6">
        <Card title="Marca (white-label)">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-intel-muted">Nombre del producto</div>
              <div className="text-intel-text">{DEFAULT_BRAND_CONFIG.productName}</div>
            </div>
            <div>
              <div className="text-xs text-intel-muted">Subtítulo</div>
              <div className="text-intel-text">{DEFAULT_BRAND_CONFIG.productSubtitle}</div>
            </div>
            <div>
              <div className="text-xs text-intel-muted">Tagline</div>
              <div className="text-intel-text">{DEFAULT_BRAND_CONFIG.tagline}</div>
            </div>
            <div>
              <div className="text-xs text-intel-muted">Plataforma técnica subyacente</div>
              <div className="text-intel-text">{DEFAULT_BRAND_CONFIG.platformName}</div>
            </div>
          </div>
          <p className="mt-3 text-xs text-intel-muted">
            Editable en <code>src/lib/intelligence/dashboard/brandConfig.ts</code> para personalización por cliente, sin tocar ningún componente.
          </p>
        </Card>

        <Card title="Tema">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={`rounded-lg border px-4 py-2 text-sm ${theme === "dark" ? "border-intel-cyan text-intel-cyan" : "border-intel-border text-intel-muted"}`}
            >
              🌙 Noche
            </button>
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`rounded-lg border px-4 py-2 text-sm ${theme === "light" ? "border-intel-cyan text-intel-cyan" : "border-intel-border text-intel-muted"}`}
            >
              ☀ Día
            </button>
          </div>
        </Card>

        <Card title="Proyectos">
          {!activeProject ? (
            <EmptyState message="No hay ningún proyecto activo todavía." />
          ) : (
            <div className="space-y-1 text-sm">
              <div className="text-intel-text">
                Proyecto activo: <span className="text-intel-cyan">{activeProject.name}</span>
              </div>
              <div className="text-xs text-intel-muted">
                {activeProject.itemCount} intelligence items · slug: {activeProject.slug}
                {activeProject.isLikelyTest && " · marcado heurísticamente como Test/Internal"}
              </div>
            </div>
          )}
          <p className="mt-3 text-xs text-intel-muted">
            {totalProjects !== null
              ? `Hay ${totalProjects} proyectos en total en el Intelligence Store. `
              : ""}
            Usa el buscador del selector de proyectos en la barra lateral para cambiar de proyecto.
          </p>
        </Card>
      </div>
    </IntelligenceShell>
  );
}
