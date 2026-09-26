"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type IntelTheme = "dark" | "light";

const STORAGE_KEY = "intel-theme";

interface ThemeContextValue {
  theme: IntelTheme;
  setTheme: (theme: IntelTheme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): IntelTheme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<IntelTheme>("dark");

  useEffect(() => {
    setThemeState(readStoredTheme());
  }, []);

  const setTheme = (next: IntelTheme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage puede fallar (ventana privada, cuota) -- el tema sigue funcionando en memoria para esta sesión.
    }
  };

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      <div data-intel-theme={theme} className="intel-root min-h-screen">
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme debe usarse dentro de <ThemeProvider>");
  return ctx;
}
