"use client";

import type { ReactNode } from "react";
import { IntelligenceSidebar } from "./IntelligenceSidebar";
import { IntelligenceHeader } from "./IntelligenceHeader";
import { useProjectContext } from "./ProjectProvider";

interface IntelligenceShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function IntelligenceShell({ title, subtitle, children }: IntelligenceShellProps) {
  const { error } = useProjectContext();

  return (
    <div className="flex h-screen overflow-hidden">
      <IntelligenceSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <IntelligenceHeader title={title} subtitle={subtitle} />
        <main className="flex-1 overflow-y-auto intel-scrollbar p-6">
          {error ? (
            <div className="rounded-lg border border-intel-high/30 bg-intel-high/10 px-4 py-3 text-sm text-intel-high mb-4">
              No se pudieron cargar los proyectos: {error}
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
