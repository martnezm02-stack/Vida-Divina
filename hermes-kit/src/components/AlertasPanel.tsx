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

interface AlertasPanelProps {
  onOpenConversation: (localConversationId: number) => void;
}

const ETIQUETA_TIPO: Record<string, string> = {
  compra: "Listo para comprar",
  persona: "Pide hablar con alguien",
  reclamo: "Reclamo",
  fuera_de_alcance: "Fuera de alcance",
};

const COLOR_PRIORIDAD: Record<string, string> = {
  alta: "bg-red-500/15 text-red-400 border-red-500/30",
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
      const data = (await res.json()) as { ok?: boolean; alertas: HandoffAlert[]; error?: string };
      if (data.ok === false) {
        setErrorCarga(data.error ?? "Error real cargando las alertas.");
        return; // conserva la última lista real conocida -- nunca la reemplaza por una lista vacía falsa
      }
      setErrorCarga(null);
      setAlertas(data.alertas ?? []);
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
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs px-3 py-2">
            {errorResolver}
          </div>
        )}

        {errorCarga && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs px-3 py-2">
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
      </div>
    </section>
  );
}
