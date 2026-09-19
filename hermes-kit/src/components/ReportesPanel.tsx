"use client";

import { useState } from "react";
import { apiUrl } from "../lib/apiPath";
import { Card, StatCard, Badge, BarList, LoadingState, ErrorState, EmptyState } from "./DashboardUi";
import MetricsPanel from "./MetricsPanel";
import type { InventoryReportData } from "../lib/vidaDivina/inventoryReportGenerator";
import type { ReportData } from "../lib/vidaDivina/reportGenerator";

type Periodo = "hoy" | "ayer" | "esta_semana" | "semana_pasada" | "este_mes" | "mes_pasado";
type TipoReporte = "ventas" | "inventario" | "actividad-ia";

const PERIODOS: Array<{ id: Periodo; label: string }> = [
  { id: "hoy", label: "Hoy" },
  { id: "esta_semana", label: "Esta semana" },
  { id: "semana_pasada", label: "Semana pasada" },
  { id: "este_mes", label: "Este mes" },
  { id: "mes_pasado", label: "Mes pasado" },
];

// Mismo formateador de moneda ya usado por InventarioPanel.tsx -- reutilizado
// tal cual, nunca una segunda convención de formato para el mismo dato.
function fmtMoney(n: number | null): string {
  if (n == null) return "sin costo real";
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function TabsReportes({ tipo, setTipo }: { tipo: TipoReporte; setTipo: (t: TipoReporte) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-brand-border p-0.5 bg-brand-bg">
      {(["ventas", "inventario", "actividad-ia"] as const).map((t) => (
        <button
          key={t}
          onClick={() => setTipo(t)}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${tipo === t ? "bg-brand-gold text-black" : "text-brand-muted hover:text-brand-text"}`}
        >
          {t === "ventas" ? "Ventas / CRM" : t === "inventario" ? "Inventario" : "Actividad IA"}
        </button>
      ))}
    </div>
  );
}

function ReporteInventario({ data }: { data: InventoryReportData }) {
  return (
    <div className="space-y-4">
      <div className="text-[11px] text-brand-muted">Corte: {new Date(data.actualizadoEn).toLocaleString("es-MX")}</div>

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

      {data.valorPorCategoria.length > 0 && (
        <Card title="Valor por categoría">
          <BarList items={data.valorPorCategoria.map((c) => ({ label: c.categoria, value: c.valor }))} formatValue={fmtMoney} />
        </Card>
      )}

      <Card title={`Detalle de inventario (${data.productos.length})`}>
        {data.productos.length === 0 ? (
          <EmptyState label="Sin productos reales registrados en inventory." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-brand-muted uppercase tracking-wider text-[10px] border-b border-brand-border">
                  <th className="py-2 pr-2">Producto</th>
                  <th className="py-2 pr-2 text-right">Existencia</th>
                  <th className="py-2 pr-2 text-right">Mínimo</th>
                  <th className="py-2 pr-2">Estado</th>
                  <th className="py-2 pr-2 text-right">Costo unitario</th>
                  <th className="py-2 pr-2 text-right">Valor a costo</th>
                </tr>
              </thead>
              <tbody>
                {data.productos.map((p) => (
                  <tr key={p.productoId} className="border-b border-brand-border/60 last:border-0 hover:bg-brand-bg/60">
                    <td className="py-2 pr-2 text-brand-text font-medium">{p.producto}</td>
                    <td className="py-2 pr-2 text-right text-brand-text">{p.existencia}</td>
                    <td className="py-2 pr-2 text-right text-brand-muted">{p.minimo ?? "—"}</td>
                    <td className="py-2 pr-2"><Badge tone={p.estado === "AGOTADO" ? "red" : p.estado === "MINIMO" ? "gold" : "green"}>{p.estado}</Badge></td>
                    <td className="py-2 pr-2 text-right text-brand-muted">{fmtMoney(p.costoUnitario)}</td>
                    <td className="py-2 pr-2 text-right text-brand-text">{fmtMoney(p.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ReporteVentas({ data }: { data: ReportData }) {
  return (
    <div className="space-y-4">
      <div className="text-[11px] text-brand-muted">
        {data.periodo.label}: {new Date(data.periodo.since).toLocaleDateString("es-MX")} – {new Date(new Date(data.periodo.until).getTime() - 1).toLocaleDateString("es-MX")}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon="users" tone="blue" label="Clientes nuevos" value={String(data.clientesNuevos)} />
        <StatCard icon="chart" tone="gold" label="Leads" value={String(data.leads)} sub={`${data.leadsCalificados} calificados`} />
        <StatCard icon="alert" tone={data.handoffsAbiertos > 0 ? "red" : "green"} label="Handoffs" value={String(data.handoffs)} sub={`${data.handoffsAbiertos} sin resolver`} />
        <StatCard icon="chat" tone="purple" label="Mensajes de hoy" value={String(data.mensajesHoy.usuario)} sub={`${data.mensajesHoy.bot} de Hermes`} />
      </div>

      <Card title="Top productos por intención de compra real">
        {data.productosTopIntencion.length === 0 ? (
          <EmptyState label="Sin oportunidades reales en este periodo." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-brand-muted uppercase tracking-wider text-[10px] border-b border-brand-border">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Producto</th>
                  <th className="py-2 pr-2 text-right">Intentos</th>
                </tr>
              </thead>
              <tbody>
                {data.productosTopIntencion.map((p, i) => (
                  <tr key={p.producto} className="border-b border-brand-border/60 last:border-0 hover:bg-brand-bg/60">
                    <td className="py-2 pr-2 text-brand-muted">{i + 1}</td>
                    <td className="py-2 pr-2 text-brand-text font-medium">{p.producto}</td>
                    <td className="py-2 pr-2 text-right text-brand-text">{p.intentos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Atribución de clientes nuevos (origen)">
          {data.origenNuevosClientes.length === 0 ? (
            <EmptyState label="Sin clientes nuevos en este periodo." />
          ) : (
            <BarList
              items={data.origenNuevosClientes.map((o) => ({ label: o.valor === "unknown" ? "Sin atribución disponible" : o.valor, value: o.n }))}
              formatValue={(n) => String(n)}
            />
          )}
        </Card>

        <Card title="Mejor origen / campaña">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-brand-muted">Mejor origen</span>
              {data.mejorOrigen ? <Badge tone="green">{data.mejorOrigen}</Badge> : <span className="text-brand-muted text-xs">Sin atribución disponible</span>}
            </li>
            <li className="flex items-center justify-between">
              <span className="text-brand-muted">Mejor campaña</span>
              {data.mejorCampaña ? <Badge tone="gold">{data.mejorCampaña}</Badge> : <span className="text-brand-muted text-xs">Sin atribución disponible</span>}
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

interface ReporteState {
  tipo: "ventas" | "inventario";
  data: ReportData | InventoryReportData;
}

export default function ReportesPanel() {
  const [tipo, setTipo] = useState<TipoReporte>("ventas");
  const [periodo, setPeriodo] = useState<Periodo>("esta_semana");
  const [reporte, setReporte] = useState<ReporteState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mensajeEnvio, setMensajeEnvio] = useState<string | null>(null);

  async function generar() {
    setLoading(true);
    setError(null);
    setReporte(null);
    setMensajeEnvio(null);
    try {
      const url = tipo === "ventas" ? apiUrl(`/api/reportes/ventas?periodo=${periodo}`) : apiUrl("/api/reportes/inventario");
      const res = await fetch(url, { cache: "no-store" });
      const j = await res.json();
      if (!j.ok) {
        setError(j.error ?? "No se pudo generar el reporte real.");
        return;
      }
      setReporte({ tipo: tipo as "ventas" | "inventario", data: j.data });
    } catch {
      setError("No se pudo conectar con el servidor real.");
    } finally {
      setLoading(false);
    }
  }

  async function enviarPorCorreo() {
    setEnviando(true);
    setMensajeEnvio(null);
    try {
      const res = await fetch(apiUrl("/api/reportes/enviar"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, periodo: tipo === "ventas" ? periodo : undefined }),
      });
      const j = await res.json();
      setMensajeEnvio(j.message ?? (j.ok ? "Borrador creado." : "No se pudo crear el borrador."));
    } catch {
      setMensajeEnvio("No se pudo conectar con el servidor real.");
    } finally {
      setEnviando(false);
    }
  }

  if (tipo === "actividad-ia") {
    // Métricas del agente (mensajes/funnel/dudas IA) -- componente existente
    // sin tocar, reutilizado tal cual dentro de Reportes (antes vivía en su
    // propia pestaña "Métricas" del nav anterior; se conserva aquí para no
    // perder esa información al reorganizar la navegación).
    return (
      <div className="h-full flex flex-col">
        <div className="px-5 pt-5">
          <div className="max-w-3xl mx-auto">
            <TabsReportes tipo={tipo} setTipo={setTipo} />
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <MetricsPanel />
        </div>
      </div>
    );
  }

  return (
    <section className="h-full overflow-y-auto p-5 bg-brand-bg">
      <div className="max-w-5xl mx-auto space-y-4">
        <h2 className="font-display text-xl font-bold text-brand-text">Reportes</h2>

        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <TabsReportes tipo={tipo} setTipo={setTipo} />
            {tipo === "ventas" && (
              <select
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value as Periodo)}
                className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-xs text-brand-text"
              >
                {PERIODOS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            )}
            <button
              onClick={generar}
              disabled={loading}
              className="px-4 py-1.5 rounded-lg bg-brand-gold text-black text-xs font-semibold disabled:opacity-50"
            >
              {loading ? "Generando…" : "Generar reporte"}
            </button>
            {reporte && (
              <button
                onClick={enviarPorCorreo}
                disabled={enviando}
                className="text-xs px-3 py-1.5 rounded-lg border border-brand-border text-brand-text font-semibold hover:bg-brand-border/30 disabled:opacity-50"
              >
                {enviando ? "Preparando…" : "Enviar por correo (borrador)"}
              </button>
            )}
          </div>
        </Card>

        {error && <ErrorState label={error} />}
        {loading && <LoadingState label="Generando reporte real…" />}

        {reporte && reporte.tipo === "inventario" && <ReporteInventario data={reporte.data as InventoryReportData} />}
        {reporte && reporte.tipo === "ventas" && <ReporteVentas data={reporte.data as ReportData} />}

        {mensajeEnvio && (
          <div className="rounded-lg border border-brand-border bg-brand-surface/70 text-xs text-brand-text px-3 py-2">{mensajeEnvio}</div>
        )}

        <div className="text-[11px] text-brand-muted text-center pt-1">
          "Enviar por correo" crea un borrador real en Gmail — el envío real requiere confirmación aparte por WhatsApp.
        </div>
      </div>
    </section>
  );
}
