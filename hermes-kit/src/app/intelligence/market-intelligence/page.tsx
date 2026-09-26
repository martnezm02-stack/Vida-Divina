"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiUrl } from "@/lib/apiPath";
import { useProjectContext } from "@/components/intelligence/ProjectProvider";
import { IntelligenceShell } from "@/components/intelligence/IntelligenceShell";
import { Card, EmptyState, ErrorState, LoadingState } from "@/components/intelligence/StateViews";
import type { MarketIntelligenceListResult, ItemDetail } from "@/lib/intelligence/dashboard/marketIntelligenceQueries";
import type { QualificationCategory } from "@/lib/intelligence/qualification";

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface Filters {
  search: string;
  contentType: string;
  market: string;
  format: string;
}

const EMPTY_FILTERS: Filters = { search: "", contentType: "", market: "", format: "" };

function useItemList(projectId: number | null, filters: Filters, offset: number) {
  const [result, setResult] = useState<MarketIntelligenceListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (projectId === null) {
      setResult(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ projectId: String(projectId), offset: String(offset), limit: "24" });
    if (filters.search) params.set("search", filters.search);
    if (filters.contentType) params.set("contentType", filters.contentType);
    if (filters.market) params.set("market", filters.market);
    if (filters.format) params.set("format", filters.format);

    fetch(apiUrl(`/api/intelligence/items?${params.toString()}`))
      .then((res) => res.json())
      .then((json: ApiResponse<MarketIntelligenceListResult>) => {
        if (cancelled) return;
        if (!json.ok || !json.data) {
          setError(json.error ?? "No se pudo cargar la lista");
          return;
        }
        setResult(json.data);
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
  }, [projectId, filters.search, filters.contentType, filters.market, filters.format, offset]);

  return { result, loading, error };
}

function useItemDetail(itemId: number | null) {
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (itemId === null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(apiUrl(`/api/intelligence/items/${itemId}`))
      .then((res) => res.json())
      .then((json: ApiResponse<ItemDetail>) => {
        if (cancelled) return;
        if (!json.ok || !json.data) {
          setError(json.error ?? "Item no encontrado");
          return;
        }
        setDetail(json.data);
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
  }, [itemId]);

  return { detail, loading, error };
}

export default function MarketIntelligencePage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <MarketIntelligencePageInner />
    </Suspense>
  );
}

function MarketIntelligencePageInner() {
  const { activeProject, loading: projectLoading } = useProjectContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const itemIdParam = searchParams.get("itemId");
  const selectedItemId = itemIdParam ? Number(itemIdParam) : null;

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [offset, setOffset] = useState(0);

  const { result, loading, error } = useItemList(activeProject?.id ?? null, filters, offset);
  const { detail, loading: detailLoading, error: detailError } = useItemDetail(selectedItemId);

  const selectItem = useCallback(
    (id: number | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id === null) params.delete("itemId");
      else params.set("itemId", String(id));
      router.push(`/intelligence/market-intelligence?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <IntelligenceShell title="Market Intelligence" subtitle="Items de inteligencia reales del Intelligence Store">
      {projectLoading ? (
        <LoadingState />
      ) : !activeProject ? (
        <EmptyState message="No hay ningún proyecto activo." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <FilterBar
              filters={filters}
              onChange={(next) => {
                setFilters(next);
                setOffset(0);
              }}
            />

            {loading ? (
              <LoadingState label="Cargando items..." />
            ) : error ? (
              <ErrorState message={error} />
            ) : !result || result.items.length === 0 ? (
              <EmptyState message="Sin items que coincidan con estos filtros." />
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {result.items.map(({ item, qualification }) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectItem(item.id)}
                      className={`text-left rounded-lg border bg-intel-surface p-3 transition-colors ${
                        item.id === selectedItemId ? "border-intel-cyan" : "border-intel-border hover:border-intel-blue/50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-intel-muted">{item.content_type}</span>
                        <QualificationBadge qualification={qualification} />
                      </div>
                      <div className="text-sm text-intel-text truncate">{item.title ?? "Sin título"}</div>
                      <div className="text-[11px] text-intel-muted mt-1">
                        {item.active_days} días activo · {item.market ?? "mercado desconocido"}
                      </div>
                    </button>
                  ))}
                </div>
                <Pagination offset={offset} limit={result.limit} total={result.total} onChange={setOffset} />
              </>
            )}
          </div>

          <div className="lg:col-span-1">
            {selectedItemId === null ? (
              <Card>
                <EmptyState message="Selecciona un item para ver su detalle y trazabilidad de evidencia." />
              </Card>
            ) : detailLoading ? (
              <LoadingState label="Cargando detalle..." />
            ) : detailError ? (
              <ErrorState message={detailError} />
            ) : detail ? (
              <ItemDetailPanel detail={detail} onClose={() => selectItem(null)} />
            ) : null}
          </div>
        </div>
      )}
    </IntelligenceShell>
  );
}

function FilterBar({ filters, onChange }: { filters: Filters; onChange: (next: Filters) => void }) {
  return (
    <Card>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <input
          type="text"
          placeholder="Buscar..."
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="rounded-lg border border-intel-border bg-intel-surface-2 px-3 py-1.5 text-sm text-intel-text placeholder:text-intel-muted"
        />
        <input
          type="text"
          placeholder="Tipo de contenido"
          value={filters.contentType}
          onChange={(e) => onChange({ ...filters, contentType: e.target.value })}
          className="rounded-lg border border-intel-border bg-intel-surface-2 px-3 py-1.5 text-sm text-intel-text placeholder:text-intel-muted"
        />
        <input
          type="text"
          placeholder="Mercado"
          value={filters.market}
          onChange={(e) => onChange({ ...filters, market: e.target.value })}
          className="rounded-lg border border-intel-border bg-intel-surface-2 px-3 py-1.5 text-sm text-intel-text placeholder:text-intel-muted"
        />
        <input
          type="text"
          placeholder="Formato"
          value={filters.format}
          onChange={(e) => onChange({ ...filters, format: e.target.value })}
          className="rounded-lg border border-intel-border bg-intel-surface-2 px-3 py-1.5 text-sm text-intel-text placeholder:text-intel-muted"
        />
      </div>
    </Card>
  );
}

function Pagination({ offset, limit, total, onChange }: { offset: number; limit: number; total: number; onChange: (offset: number) => void }) {
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex items-center justify-between text-sm text-intel-muted">
      <span>
        {total} items · página {page} de {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
          className="rounded-lg border border-intel-border px-3 py-1 disabled:opacity-40"
        >
          Anterior
        </button>
        <button
          type="button"
          disabled={offset + limit >= total}
          onClick={() => onChange(offset + limit)}
          className="rounded-lg border border-intel-border px-3 py-1 disabled:opacity-40"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

function ItemDetailPanel({ detail, onClose }: { detail: ItemDetail; onClose: () => void }) {
  const { item, actor, source, latestMetrics, signals, assets, evidence, qualification } = detail;
  return (
    <Card
      title="Detalle del item"
      action={
        <button type="button" onClick={onClose} className="text-xs text-intel-muted hover:text-intel-text">
          Cerrar
        </button>
      }
    >
      <div className="space-y-4 text-sm">
        <div>
          <div className="flex items-center justify-between gap-2">
            <div className="text-intel-text font-medium">{item.title ?? "Sin título"}</div>
            <QualificationBadge qualification={qualification} />
          </div>
          <div className="text-xs text-intel-muted mt-1">
            {source?.name ?? "Fuente desconocida"} · {actor?.display_name ?? actor?.handle ?? "Actor desconocido"}
          </div>
          {item.canonical_url && (
            <a href={item.canonical_url} target="_blank" rel="noreferrer" className="text-xs text-intel-cyan">
              Ver contenido original
            </a>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <Field label="Días activo" value={String(item.active_days)} />
          <Field label="Tipo" value={item.content_type} />
          <Field label="Formato" value={item.format ?? "Desconocido"} />
          <Field label="Mercado" value={item.market ?? "Desconocido"} />
          <Field label="Hook" value={item.hook ?? "Desconocido"} />
          <Field label="Angle" value={item.angle ?? "Desconocido"} />
          <Field label="CTA" value={item.cta ?? "Desconocido"} />
          <Field label="Oferta" value={item.offer ?? "Desconocido"} />
        </div>

        <div>
          <div className="text-xs uppercase text-intel-muted mb-1">Métricas</div>
          {latestMetrics ? (
            <div className="grid grid-cols-4 gap-2 text-xs">
              <Field label="Vistas" value={latestMetrics.views?.toString() ?? "Desconocido"} />
              <Field label="Likes" value={latestMetrics.likes?.toString() ?? "Desconocido"} />
              <Field label="Comentarios" value={latestMetrics.comments?.toString() ?? "Desconocido"} />
              <Field label="Shares" value={latestMetrics.shares?.toString() ?? "Desconocido"} />
            </div>
          ) : (
            <EmptyState message="Sin métricas registradas." />
          )}
        </div>

        <div>
          <div className="text-xs uppercase text-intel-muted mb-1">Signals ({signals.length})</div>
          {signals.length === 0 ? (
            <EmptyState message="Sin signals asociadas." />
          ) : (
            <ul className="space-y-1">
              {signals.map((s) => (
                <li key={s.id} className="text-xs text-intel-text">
                  {s.title} <span className="text-intel-muted">· {s.signal_type}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="text-xs uppercase text-intel-muted mb-1">Evidencia ({evidence.length})</div>
          {evidence.length === 0 ? (
            <EmptyState message="Sin evidencia registrada." />
          ) : (
            <ul className="space-y-1">
              {evidence.map((e) => (
                <li key={e.id} className="text-xs text-intel-text">
                  {e.kind}
                  {e.url && (
                    <a href={e.url} target="_blank" rel="noreferrer" className="text-intel-cyan ml-1">
                      ver
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {assets.length > 0 && (
          <div>
            <div className="text-xs uppercase text-intel-muted mb-1">Assets ({assets.length})</div>
            <div className="grid grid-cols-3 gap-2">
              {assets.map((a) =>
                a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={a.id} src={a.url} alt={a.kind} className="h-16 w-full object-cover rounded-md border border-intel-border" />
                ) : null
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-intel-muted">{label}</div>
      <div className="text-intel-text">{value}</div>
    </div>
  );
}

const QUALIFICATION_STYLES: Record<QualificationCategory, string> = {
  RELEVANT: "bg-intel-low/20 text-intel-low",
  IRRELEVANT: "bg-intel-high/20 text-intel-high",
  UNCERTAIN: "bg-intel-medium/20 text-intel-medium",
};

/** RAW EVIDENCE vs. QUALIFIED INTELLIGENCE: nunca oculta el item -- solo etiqueta. Sin qualification (null) no muestra nada, comportamiento idéntico al de antes de esta capa. */
function QualificationBadge({ qualification }: { qualification: QualificationCategory | null }) {
  if (!qualification) return null;
  return (
    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${QUALIFICATION_STYLES[qualification]}`}>
      {qualification}
    </span>
  );
}
