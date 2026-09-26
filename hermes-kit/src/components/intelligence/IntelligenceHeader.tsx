"use client";

import { useTheme } from "./ThemeProvider";

interface IntelligenceHeaderProps {
  title: string;
  subtitle?: string;
}

export function IntelligenceHeader({ title, subtitle }: IntelligenceHeaderProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex items-center justify-between border-b border-intel-border bg-intel-bg-elevated px-6 py-4">
      <div>
        <h1 className="font-display text-xl font-semibold text-intel-text">{title}</h1>
        {subtitle && <p className="text-sm text-intel-muted">{subtitle}</p>}
      </div>
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
        className="flex items-center gap-2 rounded-lg border border-intel-border bg-intel-surface-2 px-3 py-1.5 text-sm text-intel-muted hover:text-intel-text transition-colors"
      >
        {theme === "dark" ? "☀ Día" : "🌙 Noche"}
      </button>
    </header>
  );
}
