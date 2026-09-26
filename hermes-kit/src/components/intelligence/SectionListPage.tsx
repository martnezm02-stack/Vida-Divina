"use client";

import { useEffect, useState, type ReactNode } from "react";
import { apiUrl } from "@/lib/apiPath";
import { useProjectContext } from "./ProjectProvider";
import { IntelligenceShell } from "./IntelligenceShell";
import { EmptyState, ErrorState, LoadingState } from "./StateViews";

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface SectionListPageProps<T> {
  title: string;
  subtitle: string;
  section: string;
  emptyMessage: string;
  renderItem: (item: T) => ReactNode;
  keyOf: (item: T) => string | number;
}

export function SectionListPage<T>({ title, subtitle, section, emptyMessage, renderItem, keyOf }: SectionListPageProps<T>) {
  const { activeProject, loading: projectLoading } = useProjectContext();
  const [items, setItems] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeProject) {
      setItems(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(apiUrl(`/api/intelligence/sections/${section}?projectId=${activeProject.id}`))
      .then((res) => res.json())
      .then((json: ApiResponse<T[]>) => {
        if (cancelled) return;
        if (!json.ok || !json.data) {
          setError(json.error ?? "No se pudo cargar la sección");
          return;
        }
        setItems(json.data);
        setError(null);
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
  }, [activeProject, section]);

  return (
    <IntelligenceShell title={title} subtitle={subtitle}>
      {projectLoading || loading ? (
        <LoadingState />
      ) : !activeProject ? (
        <EmptyState message="No hay ningún proyecto activo." />
      ) : error ? (
        <ErrorState message={error} />
      ) : !items || items.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <div className="space-y-2">{items.map((item) => <div key={keyOf(item)}>{renderItem(item)}</div>)}</div>
      )}
    </IntelligenceShell>
  );
}
