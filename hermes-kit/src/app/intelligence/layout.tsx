import type { ReactNode } from "react";
import "./intelligence.css";
import { ThemeProvider } from "@/components/intelligence/ThemeProvider";
import { ProjectProvider } from "@/components/intelligence/ProjectProvider";

export const metadata = {
  title: "AI Marketing Intelligence & Growth OS",
  description: "Insight, estrategia, creatividad y crecimiento a partir de inteligencia de mercado real.",
};

export default function IntelligenceLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ProjectProvider>{children}</ProjectProvider>
    </ThemeProvider>
  );
}
