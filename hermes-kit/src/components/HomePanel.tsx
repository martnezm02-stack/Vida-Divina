"use client";

import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../lib/apiPath";
import { Card, StatCard, Badge, Donut, LoadingState, EmptyState, ErrorState } from "./DashboardUi";

interface CalendarioEvento {
  followUpId: string;
  tipo: string;
  estado: string;
  fechaProgramada: string;
  cliente: string | null;
  telefono: string | null;
  orderId: string | null;
  producto: string | null;
}
interface ActividadReciente {
  tipo: "conversacion" | "oportunidad";
  texto: string;
  timestamp: string;
}
interface DashboardSummary {
  periodo: { label: string };
  kpis: { clientesNuevos: number; leads: number; leadsCalificados: number; handoffs: number; handoffsAbiertos: number };
  estadoConversaciones: { ai: number; human: number; total: number };
  seguimientosHoy: CalendarioEvento[];
  actividadReciente: ActividadReciente[];
  productosConMasInteres: Array<{ producto: string; intentos: number }>;
  resumenCalendarioMes: { mes: string; anio: number; diasConSeguimientos: Record<string, number> };
}

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}
function fmtRelativo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}
const TIPO_LABEL: Record<string, string> = { postventa_dia3: "Día 3", postventa_semana: "Semana 1", recuperacion_dia5: "Recuperación día 5" };

function MiniCalendario({ resumen }: { resumen: DashboardSummary["resumenCalendarioMes"] }) {
  const hoy = new Date();
  const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const diaSemanaInicio = (primerDia.getDay() + 6) % 7; // lunes=0
  const diasEnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const celdas = [...Array(diaSemanaInicio).fill(null), ...Array.from({ length: diasEnMes }, (_, i) => i + 1)];

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-brand-muted mb-1">
        {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celdas.map((dia, i) => {
          if (dia === null) return <div key={i} />;
          const n = resumen.diasConSeguimientos[String(dia)] ?? 0;
          const esHoy = dia === hoy.getDate();
          return (
            <div
              key={i}
              className={`aspect-square rounded-md flex flex-col items-center justify-center text-[10px] ${
                esHoy ? "bg-brand-gold text-black font-bold" : n > 0 ? "bg-brand-gold/10 text-brand-text" : "text-brand-muted"
              }`}
            >
              <span>{dia}</span>
              {n > 0 && !esHoy && <span className="w-1 h-1 rounded-full bg-brand-gold mt-0.5" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function HomePanel() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetch(apiUrl("/api/dashboard-summary"), { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!mounted) return;
        if (j.ok) setData(j.data);
        else setError(j.error ?? "No se pudo cargar el resumen real.");
      })
      .catch(() => mounted && setError("No se pudo conectar con el servidor real."))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const donutConversaciones = useMemo(
    () =>
      data
        ? [
            { label: "Atendidas por IA", value: data.estadoConversaciones.ai },
            { label: "Con un humano", value: data.estadoConversaciones.human },
          ]
        : [],
    [data]
  );

  return (
    <section className="h-full overflow-y-auto p-5 bg-brand-bg">
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-brand-text">¡Hola!</h2>
          <p className="text-sm text-brand-muted">Aquí tienes un resumen real de la actividad de Hermes Ventas.</p>
        </div>

        {loading && <LoadingState label="Cargando resumen real…" />}
        {error && <ErrorState label={error} />}

        {data && (
          <>
            <div className="text-xs text-brand-muted">Periodo: {data.periodo.label}</div>

            {/* KPIs comerciales reales */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon="users" tone="green" label="Clientes nuevos" value={String(data.kpis.clientesNuevos)} />
              <StatCard icon="chart" tone="gold" label="Leads" value={String(data.kpis.leads)} sub={`${data.kpis.leadsCalificados} calificados`} />
              <StatCard icon="alert" tone={data.kpis.handoffsAbiertos > 0 ? "red" : "blue"} label="Handoffs" value={String(data.kpis.handoffs)} sub={`${data.kpis.handoffsAbiertos} sin resolver`} />
              <StatCard icon="chat" tone="purple" label="Conversaciones" value={String(data.estadoConversaciones.total)} sub={`${data.estadoConversaciones.ai} IA · ${data.estadoConversaciones.human} humano`} />
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
              {/* Estado de clientes/conversaciones */}
              <Card title="Estado de conversaciones">
                {data.estadoConversaciones.total === 0 ? (
                  <EmptyState label="Sin conversaciones reales todavía." />
                ) : (
                  <Donut segments={donutConversaciones} centerLabel="Total" centerValue={String(data.estadoConversaciones.total)} />
                )}
              </Card>

              {/* Productos con más interés real */}
              <Card title="Productos con más interés">
                {data.productosConMasInteres.length === 0 ? (
                  <EmptyState label="Sin intención de compra real registrada esta semana." />
                ) : (
                  <ul className="space-y-2">
                    {data.productosConMasInteres.map((p, i) => (
                      <li key={p.producto} className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-brand-gold/12 text-brand-gold text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                        <span className="text-sm text-brand-text flex-1 truncate">{p.producto}</span>
                        <span className="text-xs text-brand-muted">{p.intentos} interés{p.intentos === 1 ? "" : "es"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Resumen visual de calendario -- NUNCA el calendario completo (vive en "Calendario") */}
              <Card title={`Calendario — ${data.resumenCalendarioMes.mes} ${data.resumenCalendarioMes.anio}`}>
                <MiniCalendario resumen={data.resumenCalendarioMes} />
              </Card>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Seguimientos de hoy */}
              <Card title="Seguimientos de hoy">
                {data.seguimientosHoy.length === 0 ? (
                  <EmptyState label="Sin seguimientos reales pendientes para hoy." />
                ) : (
                  <ul className="space-y-2.5">
                    {data.seguimientosHoy.map((s) => (
                      <li key={s.followUpId} className="flex items-center justify-between text-sm">
                        <div className="min-w-0">
                          <div className="text-brand-text font-medium truncate">{s.cliente ?? s.telefono ?? "Cliente sin nombre real"}</div>
                          <div className="text-[11px] text-brand-muted truncate">{s.producto ?? "Sin producto asociado"} · {TIPO_LABEL[s.tipo] ?? s.tipo}</div>
                        </div>
                        <div className="text-[11px] text-brand-muted shrink-0 ml-2">{fmtHora(s.fechaProgramada)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Actividad comercial reciente */}
              <Card title="Actividad reciente">
                {data.actividadReciente.length === 0 ? (
                  <EmptyState label="Sin actividad real registrada todavía." />
                ) : (
                  <ul className="space-y-2.5">
                    {data.actividadReciente.map((a, i) => (
                      <li key={i} className="flex items-center justify-between text-sm gap-2">
                        <div className="min-w-0 flex items-center gap-2">
                          <Badge tone={a.tipo === "oportunidad" ? "gold" : "green"}>{a.tipo === "oportunidad" ? "Interés" : "Chat"}</Badge>
                          <span className="text-brand-text truncate">{a.texto}</span>
                        </div>
                        <span className="text-[11px] text-brand-muted shrink-0">{fmtRelativo(a.timestamp)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className="text-[11px] text-brand-muted text-center pt-1">
              KPIs de la semana en curso. Vista general — el calendario completo de seguimientos vive en “Calendario”.
            </div>
          </>
        )}
      </div>
    </section>
  );
}
