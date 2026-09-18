"use client";

import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../lib/apiPath";
import { StatCard, Card, Badge, Donut, BarList, LoadingState, ErrorState, EmptyState } from "./DashboardUi";

interface ProductoInventario {
  productoId: string;
  producto: string;
  sku: string;
  categoria: string;
  existencia: number;
  minimo: number | null;
  estado: "NORMAL" | "MINIMO" | "AGOTADO";
  costoUnitario: number | null;
  moneda: string | null;
  valor: number | null;
}
interface InventarioData {
  actualizadoEn: string;
  resumen: { existenciaTotal: number; productosAgotados: number; enNivelMinimo: number; productosNormales: number; valorInventario: number; valorInventarioIncompleto: boolean };
  distribucion: { normal: number; minimo: number; agotado: number };
  valorPorCategoria: Array<{ categoria: string; valor: number; incompleto: boolean }>;
  productosCriticos: ProductoInventario[];
  productos: ProductoInventario[];
}

const PAGE_SIZE = 10;

function fmtMoney(n: number | null): string {
  if (n == null) return "sin costo real";
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function InventarioPanel() {
  const [data, setData] = useState<InventarioData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    let mounted = true;
    fetch(apiUrl("/api/inventario"), { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!mounted) return;
        if (j.ok) setData(j);
        else setError(j.error ?? "No se pudo cargar el inventario real.");
      })
      .catch(() => mounted && setError("No se pudo conectar con el servidor real."))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const categorias = useMemo(() => [...new Set((data?.productos ?? []).map((p) => p.categoria))].sort(), [data]);

  const filtrados = useMemo(() => {
    if (!data) return [];
    const q = busqueda.trim().toLowerCase();
    return data.productos.filter((p) => {
      if (filtroEstado && p.estado !== filtroEstado) return false;
      if (filtroCategoria && p.categoria !== filtroCategoria) return false;
      if (q && !p.producto.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, busqueda, filtroEstado, filtroCategoria]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const visibles = filtrados.slice((paginaSegura - 1) * PAGE_SIZE, paginaSegura * PAGE_SIZE);

  const donutEstado = data
    ? [
        { label: "Normal", value: data.distribucion.normal },
        { label: "Mínimo", value: data.distribucion.minimo },
        { label: "Agotado", value: data.distribucion.agotado },
      ]
    : [];

  return (
    <section className="h-full overflow-y-auto p-5 bg-brand-bg">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-brand-text">Inventario</h2>
            <div className="text-xs text-brand-muted">Estado real de productos Vida Divina — fuente única: PostgreSQL</div>
          </div>
          {data && <div className="text-[11px] text-brand-muted">Actualizado: {new Date(data.actualizadoEn).toLocaleString("es-MX")}</div>}
        </div>

        {loading && <LoadingState label="Cargando inventario real…" />}
        {error && <ErrorState label={error} />}

        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon="box" tone="blue" label="Existencia total" value={String(data.resumen.existenciaTotal)} sub="unidades" />
              <StatCard
                icon="chart"
                tone="purple"
                label="Valor de inventario"
                value={fmtMoney(data.resumen.valorInventario)}
                sub={data.resumen.valorInventarioIncompleto ? "Incompleto: falta costo real de algún producto" : "a costo"}
              />
              <StatCard icon="alert" tone={data.resumen.productosAgotados > 0 ? "red" : "green"} label="Productos agotados" value={String(data.resumen.productosAgotados)} />
              <StatCard icon="alert" tone={data.resumen.enNivelMinimo > 0 ? "gold" : "green"} label="En nivel mínimo" value={String(data.resumen.enNivelMinimo)} />
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
              {/* Columna principal: búsqueda + tabla */}
              <div className="lg:col-span-2">
                <Card title={`Productos (${filtrados.length})`}>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <input
                      value={busqueda}
                      onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
                      placeholder="Buscar por nombre o SKU…"
                      className="flex-1 min-w-[160px] bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-xs text-brand-text placeholder:text-brand-muted"
                    />
                    <select value={filtroEstado} onChange={(e) => { setFiltroEstado(e.target.value); setPagina(1); }} className="bg-brand-bg border border-brand-border rounded-lg px-2.5 py-1.5 text-xs text-brand-text">
                      <option value="">Todos los estados</option>
                      <option value="NORMAL">Normal</option>
                      <option value="MINIMO">Mínimo</option>
                      <option value="AGOTADO">Agotado</option>
                    </select>
                    <select value={filtroCategoria} onChange={(e) => { setFiltroCategoria(e.target.value); setPagina(1); }} className="bg-brand-bg border border-brand-border rounded-lg px-2.5 py-1.5 text-xs text-brand-text">
                      <option value="">Todas las categorías</option>
                      {categorias.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  {visibles.length === 0 ? (
                    <EmptyState label="Ningún producto real coincide con el filtro." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-brand-muted uppercase tracking-wider text-[10px] border-b border-brand-border">
                            <th className="py-2 pr-2">Producto</th>
                            <th className="py-2 pr-2">SKU</th>
                            <th className="py-2 pr-2">Categoría</th>
                            <th className="py-2 pr-2 text-right">Existencia</th>
                            <th className="py-2 pr-2 text-right">Mínimo</th>
                            <th className="py-2 pr-2">Estado</th>
                            <th className="py-2 pr-2 text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibles.map((p) => (
                            <tr key={p.productoId} className="border-b border-brand-border/60 last:border-0 hover:bg-brand-bg/60">
                              <td className="py-2 pr-2 text-brand-text font-medium">{p.producto}</td>
                              <td className="py-2 pr-2 text-brand-muted font-mono">{p.sku}</td>
                              <td className="py-2 pr-2 text-brand-muted">{p.categoria}</td>
                              <td className="py-2 pr-2 text-right text-brand-text">{p.existencia}</td>
                              <td className="py-2 pr-2 text-right text-brand-muted">{p.minimo ?? "—"}</td>
                              <td className="py-2 pr-2"><Badge tone={p.estado === "AGOTADO" ? "red" : p.estado === "MINIMO" ? "gold" : "green"}>{p.estado}</Badge></td>
                              <td className="py-2 pr-2 text-right text-brand-text">{fmtMoney(p.valor)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {totalPaginas > 1 && (
                    <div className="flex items-center justify-center gap-3 mt-3 text-xs text-brand-muted">
                      <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={paginaSegura <= 1} className="disabled:opacity-30">‹</button>
                      <span>Página {paginaSegura} de {totalPaginas}</span>
                      <button onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={paginaSegura >= totalPaginas} className="disabled:opacity-30">›</button>
                    </div>
                  )}
                </Card>
              </div>

              {/* Columna lateral: distribución + valor por categoría + críticos */}
              <div className="space-y-4">
                <Card title="Estado de productos">
                  <Donut segments={donutEstado} centerLabel="Productos" centerValue={String(data.productos.length)} />
                </Card>

                {data.valorPorCategoria.length > 0 && (
                  <Card title="Valor por categoría">
                    <BarList items={data.valorPorCategoria.map((c) => ({ label: c.categoria, value: c.valor }))} formatValue={fmtMoney} />
                  </Card>
                )}

                {data.productosCriticos.length > 0 && (
                  <Card title={`Productos críticos (${data.productosCriticos.length})`}>
                    <ul className="space-y-2">
                      {data.productosCriticos.slice(0, 8).map((p) => (
                        <li key={p.productoId} className="flex items-center justify-between text-sm">
                          <span className="text-brand-text truncate">{p.producto}</span>
                          <Badge tone={p.estado === "AGOTADO" ? "red" : "gold"}>{p.estado} · {p.existencia}</Badge>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
