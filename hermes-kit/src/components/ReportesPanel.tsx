"use client";

import { useState } from "react";
import { apiUrl } from "../lib/apiPath";
import { Card, LoadingState, ErrorState } from "./DashboardUi";
import MetricsPanel from "./MetricsPanel";

type Periodo = "hoy" | "ayer" | "esta_semana" | "semana_pasada" | "este_mes" | "mes_pasado";
type TipoReporte = "ventas" | "inventario" | "actividad-ia";

const PERIODOS: Array<{ id: Periodo; label: string }> = [
  { id: "hoy", label: "Hoy" },
  { id: "esta_semana", label: "Esta semana" },
  { id: "semana_pasada", label: "Semana pasada" },
  { id: "este_mes", label: "Este mes" },
  { id: "mes_pasado", label: "Mes pasado" },
];

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

export default function ReportesPanel() {
  const [tipo, setTipo] = useState<TipoReporte>("ventas");
  const [periodo, setPeriodo] = useState<Periodo>("esta_semana");
  const [reporte, setReporte] = useState<{ resumenEjecutivo: string; reporteFormal: string } | null>(null);
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
      setReporte({ resumenEjecutivo: j.resumenEjecutivo, reporteFormal: j.reporteFormal });
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
      <div className="max-w-3xl mx-auto space-y-4">
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
          </div>
        </Card>

        {error && <ErrorState label={error} />}
        {loading && <LoadingState label="Generando reporte real…" />}

        {reporte && (
          <Card
            title="Reporte real"
            action={
              <div className="flex items-center gap-2">
                <button
                  onClick={enviarPorCorreo}
                  disabled={enviando}
                  className="text-xs px-3 py-1.5 rounded-lg border border-brand-border text-brand-text font-semibold hover:bg-brand-border/30 disabled:opacity-50"
                >
                  {enviando ? "Preparando…" : "Enviar por correo (borrador)"}
                </button>
              </div>
            }
          >
            <pre className="whitespace-pre-wrap text-xs text-brand-text/90 font-mono leading-relaxed max-h-[50vh] overflow-y-auto">{reporte.reporteFormal}</pre>
          </Card>
        )}

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
