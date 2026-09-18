"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "../lib/apiPath";

interface HandoffAlert {
  handoffId: string;
  crmConversationId: string;
  localConversationId: number | null;
  phone: string | null;
  tipo: string | null;
  producto: string | null;
  necesidad: string | null;
  intencionCompra: boolean | null;
  prioridad: "alta" | "media" | "baja";
  motivo: string;
  timestamp: string;
  ultimoContexto: string | null;
}

interface SeguimientoAlerta {
  followUpId: string;
  tipo: string;
  fechaProgramada: string;
  cliente: string | null;
  telefono: string | null;
}
interface PagoPendienteAlerta {
  paymentId: string;
  orderId: string;
  metodo: string;
  importe: number;
  creadoEn: string;
  cliente: string | null;
  telefono: string | null;
}
interface IntegracionAlerta {
  integracion: string;
  mensaje: string;
}

interface AlertasPanelProps {
  onOpenConversation: (localConversationId: number) => void;
}

const TIPO_SEGUIMIENTO_LABEL: Record<string, string> = { postventa_dia3: "Día 3", postventa_semana: "Semana 1", recuperacion_dia5: "Recuperación día 5" };

const ETIQUETA_TIPO: Record<string, string> = {
  compra: "Listo para comprar",
  persona: "Pide hablar con alguien",
  reclamo: "Reclamo",
  fuera_de_alcance: "Fuera de alcance",
};

const COLOR_PRIORIDAD: Record<string, string> = {
  alta: "bg-red-50 text-red-600 border-red-200",
  media: "bg-brand-gold/15 text-brand-gold border-brand-gold/30",
  baja: "bg-brand-muted/15 text-brand-muted border-brand-muted/30",
};

function formatFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function AlertasPanel({ onOpenConversation }: AlertasPanelProps) {
  const [alertas, setAlertas] = useState<HandoffAlert[] | null>(null);
  const [seguimientosVencidos, setSeguimientosVencidos] = useState<SeguimientoAlerta[]>([]);
  const [pagosPendientes, setPagosPendientes] = useState<PagoPendienteAlerta[]>([]);
  const [integraciones, setIntegraciones] = useState<IntegracionAlerta[]>([]);
  const [resolviendo, setResolviendo] = useState<Set<string>>(new Set());
  const [errorResolver, setErrorResolver] = useState<string | null>(null);
  // Error REAL de carga (2026-09-12, hallazgo real): antes un fallo real del
  // CRM devolvía alertas:[] indistinguible de "no hay handoffs pendientes".
  // Este estado es aparte de `alertas` para que la UI pueda mostrar un error
  // real, nunca confundirlo con una bandeja genuinamente vacía.
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch(apiUrl("/api/alertas"), { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        alertas: HandoffAlert[];
        seguimientosVencidos?: SeguimientoAlerta[];
        pagosPendientes?: PagoPendienteAlerta[];
        integraciones?: IntegracionAlerta[];
        error?: string;
      };
      if (data.ok === false) {
        setErrorCarga(data.error ?? "Error real cargando las alertas.");
        return; // conserva la última lista real conocida -- nunca la reemplaza por una lista vacía falsa
      }
      setErrorCarga(null);
      setAlertas(data.alertas ?? []);
      setSeguimientosVencidos(data.seguimientosVencidos ?? []);
      setPagosPendientes(data.pagosPendientes ?? []);
      setIntegraciones(data.integraciones ?? []);
    } catch {
      // silenciar -- se reintenta en el próximo refresco (fallo de red, no del CRM)
    }
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  async function marcarResuelto(handoffId: string) {
    setErrorResolver(null);
    setResolviendo((prev) => new Set(prev).add(handoffId));
    try {
      const res = await fetch(apiUrl("/api/alertas/resolve"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handoffId }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setErrorResolver(data.error ?? "No se pudo marcar como resuelto.");
        return;
      }
      // Quita esta alerta de la lista al instante (sin esperar al próximo
      // refresco de 5s) -- solo esta fila, nunca afecta a otras conversaciones.
      setAlertas((prev) => (prev ? prev.filter((a) => a.handoffId !== handoffId) : prev));
      void refresh();
    } catch {
      setErrorResolver("No se pudo conectar para marcar como resuelto. Inténtalo de nuevo.");
    } finally {
      setResolviendo((prev) => {
        const next = new Set(prev);
        next.delete(handoffId);
        return next;
      });
    }
  }

  return (
    <section className="h-full overflow-y-auto p-5 bg-brand-bg/30">
      <div className="max-w-3xl mx-auto space-y-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-xl font-bold text-brand-text">Alertas — leads listos para un humano</h2>
          {alertas && (
            <span className="text-[11px] font-semibold text-brand-gold bg-brand-gold/10 border border-brand-gold/20 rounded-full px-2 py-0.5">
              {alertas.length}
            </span>
          )}
        </div>

        {errorResolver && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs px-3 py-2">
            {errorResolver}
          </div>
        )}

        {errorCarga && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs px-3 py-2">
            Error real cargando las alertas (no es que no haya handoffs): {errorCarga}
          </div>
        )}

        {alertas === null && !errorCarga && <div className="text-sm text-brand-muted">Cargando alertas…</div>}

        {alertas !== null && alertas.length === 0 && !errorCarga && (
          <div className="rounded-xl border border-brand-border bg-brand-surface/70 p-6 text-center text-sm text-brand-muted">
            No hay handoffs pendientes ahora mismo. En cuanto Hermes derive una conversación a un humano, aparece aquí.
          </div>
        )}

        {alertas?.map((a) => (
          <div key={a.handoffId} className="rounded-xl border border-brand-border bg-brand-surface/70 p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold border ${COLOR_PRIORIDAD[a.prioridad]}`}>
                  {a.prioridad}
                </span>
                <span className="text-sm font-semibold text-brand-text">
                  {(a.tipo && ETIQUETA_TIPO[a.tipo]) ?? "Handoff"}
                </span>
              </div>
              <span className="text-[11px] text-brand-muted shrink-0">{formatFecha(a.timestamp)}</span>
            </div>

            <div className="text-sm text-brand-text space-y-0.5 mb-2">
              {a.producto && <div>Producto: <span className="text-brand-gold">{a.producto}</span></div>}
              {a.necesidad && <div>Necesidad: {a.necesidad}</div>}
              {a.intencionCompra !== null && <div>Intención de compra: {a.intencionCompra ? "sí" : "no"}</div>}
              {a.phone && <div className="font-mono text-xs text-brand-muted">+{a.phone}</div>}
            </div>

            {a.ultimoContexto && (
              <div className="text-xs text-brand-muted italic mb-2 line-clamp-2">"{a.ultimoContexto}"</div>
            )}

            <div className="text-xs text-brand-muted mb-3">{a.motivo}</div>

            <div className="flex items-center gap-2">
              {a.localConversationId !== null ? (
                <button
                  onClick={() => onOpenConversation(a.localConversationId as number)}
                  className="text-xs px-3.5 py-2 rounded-lg bg-brand-gold text-black font-semibold hover:opacity-90 transition-opacity"
                >
                  Abrir conversación
                </button>
              ) : (
                <div className="text-[11px] text-brand-muted">Sin conversación local vinculada todavía.</div>
              )}
              <button
                onClick={() => marcarResuelto(a.handoffId)}
                disabled={resolviendo.has(a.handoffId)}
                className="text-xs px-3.5 py-2 rounded-lg border border-brand-border text-brand-text font-semibold hover:bg-brand-border/30 transition-opacity disabled:opacity-50"
              >
                {resolviendo.has(a.handoffId) ? "Marcando…" : "Marcar resuelto"}
              </button>
            </div>
          </div>
        ))}

        {(seguimientosVencidos.length > 0 || pagosPendientes.length > 0 || integraciones.length > 0) && (
          <div className="pt-4 space-y-3">
            {seguimientosVencidos.length > 0 && (
              <div className="rounded-xl border border-brand-border bg-brand-surface/70 p-4">
                <div className="text-sm font-semibold text-brand-text mb-2">Seguimientos vencidos ({seguimientosVencidos.length})</div>
                <ul className="space-y-1.5 text-xs">
                  {seguimientosVencidos.map((s) => (
                    <li key={s.followUpId} className="flex items-center justify-between text-brand-text">
                      <span>{s.cliente ?? s.telefono ?? "Cliente sin nombre real"} — {TIPO_SEGUIMIENTO_LABEL[s.tipo] ?? s.tipo}</span>
                      <span className="text-brand-muted">{formatFecha(s.fechaProgramada)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {pagosPendientes.length > 0 && (
              <div className="rounded-xl border border-brand-border bg-brand-surface/70 p-4">
                <div className="text-sm font-semibold text-brand-text mb-2">Pagos/comprobantes pendientes de confirmar ({pagosPendientes.length})</div>
                <ul className="space-y-1.5 text-xs">
                  {pagosPendientes.map((p) => (
                    <li key={p.paymentId} className="flex items-center justify-between text-brand-text">
                      <span>{p.cliente ?? p.telefono ?? "Cliente sin nombre real"} — {p.metodo} · ${p.importe.toLocaleString("es-MX")}</span>
                      <span className="text-brand-muted">{formatFecha(p.creadoEn)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {integraciones.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="text-sm font-semibold text-red-600 mb-2">Integraciones con problemas ({integraciones.length})</div>
                <ul className="space-y-1 text-xs text-red-600">
                  {integraciones.map((i) => (
                    <li key={i.integracion}>{i.integracion}: {i.mensaje}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
