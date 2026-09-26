"use client";

import { BrandMark } from "./BrandMark";
import { useTheme } from "./ThemeProvider";

export function TopBar() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex h-20 shrink-0 items-center justify-between border-b border-intel-border bg-intel-bg-elevated px-6">
      <BrandMark size={38} />
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
        className="flex items-center gap-2 rounded-lg border border-intel-border bg-intel-surface-2 px-3 py-1.5 text-sm text-intel-muted hover:text-intel-text transition-colors"
      >
        {theme === "dark" ? "☀ Día" : "🌙 Noche"}
      </button>
    </div>
  );
}
