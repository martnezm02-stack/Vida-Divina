"use client";

import { useProjectContext } from "@/components/intelligence/ProjectProvider";
import { useTheme } from "@/components/intelligence/ThemeProvider";
import { IntelligenceShell } from "@/components/intelligence/IntelligenceShell";
import { Card } from "@/components/intelligence/StateViews";
import { DEFAULT_BRAND_CONFIG } from "@/lib/intelligence/dashboard/brandConfig";

export default function ConfiguracionPage() {
  const { activeProject, projects } = useProjectContext();
  const { theme, setTheme } = useTheme();

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
          {activeProject && (
            <div className="mb-3 text-sm text-intel-text">
              Proyecto activo: <span className="text-intel-cyan">{activeProject.name}</span>
            </div>
          )}
          <ul className="space-y-1 text-sm text-intel-muted">
            {projects.map((p) => (
              <li key={p.id}>
                {p.name} <span className="text-xs">({p.slug})</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </IntelligenceShell>
  );
}
