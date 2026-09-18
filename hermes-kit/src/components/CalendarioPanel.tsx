"use client";

import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../lib/apiPath";
import { LoadingState, EmptyState, ErrorState, Badge } from "./DashboardUi";

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

type Modo = "dia" | "semana" | "mes";

const TIPO_LABEL: Record<string, string> = { postventa_dia3: "Día 3", postventa_semana: "Semana 1", recuperacion_dia5: "Recuperación día 5" };
const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function startOfWeek(d: Date): Date {
  const dia = d.getDay();
  const diff = (dia === 0 ? -6 : 1) - dia;
  const r = new Date(d);
  r.setDate(d.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}
function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function EventoBadge({ e }: { e: CalendarioEvento }) {
  const tone = e.estado === "ejecutado" ? "green" : e.estado === "cancelado" ? "muted" : "gold";
  return (
    <div className="rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-[11px]">
      <div className="flex items-center justify-between gap-1">
        <span className="font-semibold text-brand-text truncate">{e.cliente ?? e.telefono ?? "Sin cliente"}</span>
        <Badge tone={tone}>{e.estado}</Badge>
      </div>
      <div className="text-brand-muted truncate">{TIPO_LABEL[e.tipo] ?? e.tipo} · {new Date(e.fechaProgramada).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</div>
      {e.producto && <div className="text-brand-muted truncate">{e.producto}</div>}
    </div>
  );
}

function ListaEventos({ eventos }: { eventos: CalendarioEvento[] }) {
  if (eventos.length === 0) return <EmptyState label="Sin seguimientos reales en este rango." />;
  return (
    <ul className="space-y-2">
      {eventos
        .slice()
        .sort((a, b) => new Date(a.fechaProgramada).getTime() - new Date(b.fechaProgramada).getTime())
        .map((e) => (
          <li key={e.followUpId} className="rounded-lg border border-brand-border bg-brand-surface/70 px-3.5 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-brand-text truncate">{e.cliente ?? e.telefono ?? "Cliente sin nombre real"}</div>
              <div className="text-xs text-brand-muted truncate">
                {e.producto ?? "Sin producto"} {e.orderId ? `· Pedido ${e.orderId.slice(0, 8)}` : ""}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs text-brand-text font-mono">
                {new Date(e.fechaProgramada).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}{" "}
                {new Date(e.fechaProgramada).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
              </div>
              <Badge tone={e.estado === "ejecutado" ? "green" : e.estado === "cancelado" ? "muted" : "gold"}>{TIPO_LABEL[e.tipo] ?? e.tipo}</Badge>
            </div>
          </li>
        ))}
    </ul>
  );
}

export default function CalendarioPanel() {
  const [modo, setModo] = useState<Modo>("mes");
  const [cursor, setCursor] = useState(() => new Date());
  const [eventos, setEventos] = useState<CalendarioEvento[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const rango = useMemo(() => {
    if (modo === "dia") {
      const since = startOfDay(cursor);
      const until = new Date(since);
      until.setDate(until.getDate() + 1);
      return { since, until };
    }
    if (modo === "semana") {
      const since = startOfWeek(cursor);
      const until = new Date(since);
      until.setDate(until.getDate() + 7);
      return { since, until };
    }
    const since = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const until = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    return { since, until };
  }, [modo, cursor]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetch(apiUrl(`/api/calendario?since=${rango.since.toISOString()}&until=${rango.until.toISOString()}`), { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!mounted) return;
        if (j.ok) setEventos(j.eventos);
        else setError(j.error ?? "No se pudo cargar el calendario real.");
      })
      .catch(() => mounted && setError("No se pudo conectar con el servidor real."))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [rango]);

  function moverCursor(deltaDias: number) {
    const step = modo === "mes" ? 30 : modo === "semana" ? 7 : 1;
    const nuevo = new Date(cursor);
    nuevo.setDate(nuevo.getDate() + deltaDias * step);
    setCursor(nuevo);
  }

  const eventosPorDia = useMemo(() => {
    const map = new Map<string, CalendarioEvento[]>();
    (eventos ?? []).forEach((e) => {
      const key = startOfDay(new Date(e.fechaProgramada)).toISOString();
      map.set(key, [...(map.get(key) ?? []), e]);
    });
    return map;
  }, [eventos]);

  const celdasMes = useMemo(() => {
    if (modo !== "mes") return [];
    const primerDia = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const inicioGrid = startOfWeek(primerDia);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(inicioGrid);
      d.setDate(inicioGrid.getDate() + i);
      return d;
    });
  }, [modo, cursor]);

  return (
    <section className="h-full overflow-y-auto p-5 bg-brand-bg/30">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-display text-xl font-bold text-brand-text">Calendario de seguimientos</h2>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-lg border border-brand-border p-0.5 bg-brand-bg">
              <button onClick={() => moverCursor(-1)} className="px-2.5 py-1.5 text-brand-muted hover:text-brand-text" aria-label="Anterior">‹</button>
              <button onClick={() => setCursor(new Date())} className="px-3 py-1.5 text-xs font-semibold text-brand-text">Hoy</button>
              <button onClick={() => moverCursor(1)} className="px-2.5 py-1.5 text-brand-muted hover:text-brand-text" aria-label="Siguiente">›</button>
            </div>
            <div className="inline-flex rounded-lg border border-brand-border p-0.5 bg-brand-bg">
              {(["dia", "semana", "mes"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setModo(m)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${modo === m ? "bg-brand-gold text-black" : "text-brand-muted hover:text-brand-text"}`}
                >
                  {m === "dia" ? "Día" : m === "semana" ? "Semana" : "Mes"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="text-sm text-brand-text font-semibold">
          {modo === "mes" ? `${MESES[cursor.getMonth()]} ${cursor.getFullYear()}` : `${rango.since.toLocaleDateString("es-MX", { day: "2-digit", month: "long" })} — ${new Date(rango.until.getTime() - 1).toLocaleDateString("es-MX", { day: "2-digit", month: "long" })}`}
        </div>

        {loading && <LoadingState label="Cargando seguimientos reales…" />}
        {error && <ErrorState label={error} />}

        {!loading && !error && modo === "mes" && (
          <div className="rounded-xl border border-brand-border overflow-hidden">
            <div className="grid grid-cols-7 bg-brand-surface text-[11px] uppercase tracking-wider text-brand-muted">
              {DIAS_SEMANA.map((d) => (
                <div key={d} className="px-2 py-2 text-center">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {celdasMes.map((d, i) => {
                const enMes = d.getMonth() === cursor.getMonth();
                const esHoy = sameDay(d, new Date());
                const eventosDia = eventosPorDia.get(startOfDay(d).toISOString()) ?? [];
                return (
                  <div key={i} className={`min-h-[92px] border-t border-l border-brand-border p-1.5 ${i % 7 === 6 ? "border-r" : ""} ${enMes ? "bg-brand-bg/20" : "bg-brand-bg/5"}`}>
                    <div className={`text-[11px] font-mono mb-1 ${esHoy ? "text-brand-gold font-bold" : enMes ? "text-brand-text/70" : "text-brand-muted/40"}`}>{d.getDate()}</div>
                    <div className="space-y-1">
                      {eventosDia.slice(0, 3).map((e) => (
                        <div key={e.followUpId} className="text-[10px] truncate rounded bg-brand-gold/15 text-brand-gold px-1 py-0.5">
                          {new Date(e.fechaProgramada).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} {e.cliente ?? e.telefono ?? "—"}
                        </div>
                      ))}
                      {eventosDia.length > 3 && <div className="text-[10px] text-brand-muted">+{eventosDia.length - 3} más</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!loading && !error && modo !== "mes" && <ListaEventos eventos={eventos ?? []} />}
      </div>
    </section>
  );
}
