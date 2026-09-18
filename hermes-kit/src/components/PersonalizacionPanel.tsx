"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "../lib/apiPath";
import { Card, LoadingState, EmptyState } from "./DashboardUi";
import type { PersonalizacionSubView } from "./Sidebar";

const DIAS: Array<{ key: string; label: string }> = [
  { key: "lunes", label: "Lunes" },
  { key: "martes", label: "Martes" },
  { key: "miercoles", label: "Miércoles" },
  { key: "jueves", label: "Jueves" },
  { key: "viernes", label: "Viernes" },
  { key: "sabado", label: "Sábado" },
  { key: "domingo", label: "Domingo" },
];

interface HorarioDia {
  abierto: boolean;
  desde: string;
  hasta: string;
}
type Horarios = Record<string, HorarioDia>;

function GeneralTab() {
  const [contenido, setContenido] = useState<string | null>(null);
  useEffect(() => {
    fetch(apiUrl("/api/personalizacion/general"), { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setContenido(j.contenido ?? ""))
      .catch(() => setContenido(""));
  }, []);
  return (
    <Card title="Identidad de marca">
      <div className="text-xs text-brand-muted mb-3">
        El nombre, los colores y el logo del panel se editan en el código fuente (<code className="text-brand-gold">src/components/Logo.tsx</code> y{" "}
        <code className="text-brand-gold">src/app/globals.css</code>) — pídeselo a Claude Code en lenguaje normal, o edítalos tú directamente. Esta sección
        reutiliza la documentación real ya existente del kit:
      </div>
      {contenido === null ? (
        <LoadingState label="Cargando documentación real…" />
      ) : (
        <pre className="whitespace-pre-wrap text-[11px] text-brand-text/80 font-mono leading-relaxed max-h-[50vh] overflow-y-auto">{contenido || "Documentación no disponible."}</pre>
      )}
    </Card>
  );
}

function HorariosTab() {
  const [horarios, setHorarios] = useState<Horarios | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiUrl("/api/personalizacion/horarios"), { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setHorarios(j.horarios))
      .catch(() => setHorarios(null));
  }, []);

  function actualizar(dia: string, campo: keyof HorarioDia, valor: string | boolean) {
    setHorarios((prev) => (prev ? { ...prev, [dia]: { ...prev[dia], [campo]: valor } } : prev));
  }

  async function guardar() {
    if (!horarios) return;
    setGuardando(true);
    setMensaje(null);
    try {
      const res = await fetch(apiUrl("/api/personalizacion/horarios"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(horarios),
      });
      const j = await res.json();
      setMensaje(j.ok ? "Horario guardado." : j.error ?? "No se pudo guardar.");
    } catch {
      setMensaje("No se pudo conectar con el servidor real.");
    } finally {
      setGuardando(false);
    }
  }

  if (!horarios) return <LoadingState label="Cargando horarios reales…" />;

  return (
    <Card
      title="Horario de atención"
      action={
        <button onClick={guardar} disabled={guardando} className="text-xs px-3 py-1.5 rounded-lg bg-brand-gold text-black font-semibold disabled:opacity-50">
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      }
    >
      <div className="text-xs text-brand-muted mb-3">
        Este horario se guarda real (mismo almacén que el resto de Configuración) pero todavía <strong>no cambia el comportamiento del agente</strong> --
        Hermes sigue respondiendo siempre. Úsalo como referencia hasta que se conecte al flujo de mensajes.
      </div>
      <div className="space-y-2">
        {DIAS.map((d) => (
          <div key={d.key} className="flex items-center gap-3 text-sm">
            <label className="w-24 flex items-center gap-2 text-brand-text">
              <input type="checkbox" checked={horarios[d.key]?.abierto ?? false} onChange={(e) => actualizar(d.key, "abierto", e.target.checked)} />
              {d.label}
            </label>
            <input
              type="time"
              value={horarios[d.key]?.desde ?? "09:00"}
              onChange={(e) => actualizar(d.key, "desde", e.target.value)}
              disabled={!horarios[d.key]?.abierto}
              className="bg-brand-bg border border-brand-border rounded-lg px-2 py-1 text-xs text-brand-text disabled:opacity-40"
            />
            <span className="text-brand-muted text-xs">a</span>
            <input
              type="time"
              value={horarios[d.key]?.hasta ?? "18:00"}
              onChange={(e) => actualizar(d.key, "hasta", e.target.value)}
              disabled={!horarios[d.key]?.abierto}
              className="bg-brand-bg border border-brand-border rounded-lg px-2 py-1 text-xs text-brand-text disabled:opacity-40"
            />
          </div>
        ))}
      </div>
      {mensaje && <div className="text-xs text-brand-gold mt-3">{mensaje}</div>}
    </Card>
  );
}

function NegocioTab() {
  const [contenido, setContenido] = useState<string | null>(null);
  const [sinRellenar, setSinRellenar] = useState(false);
  useEffect(() => {
    fetch(apiUrl("/api/personalizacion/negocio"), { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setContenido(j.contenido ?? "");
        setSinRellenar(!!j.sinRellenar);
      })
      .catch(() => setContenido(""));
  }, []);
  return (
    <Card title="Guion de negocio (prompts/negocio.md)">
      <div className="text-xs text-brand-muted mb-3">
        Solo lectura — este es el guion real que usa Hermes. Para editarlo, dile a Claude Code <em>"/personaliza"</em> (mismo backend real, nunca una
        segunda copia).
      </div>
      {sinRellenar && (
        <div className="text-xs text-brand-gold mb-2">Este guion todavía tiene campos sin rellenar (entre corchetes).</div>
      )}
      {contenido === null ? (
        <LoadingState label="Cargando guion real…" />
      ) : contenido ? (
        <pre className="whitespace-pre-wrap text-[11px] text-brand-text/80 font-mono leading-relaxed max-h-[55vh] overflow-y-auto">{contenido}</pre>
      ) : (
        <EmptyState label="No se encontró prompts/negocio.md todavía." />
      )}
    </Card>
  );
}

function ProductosTab() {
  const [productos, setProductos] = useState<Array<{ id: string; titulo: string; categoria: string }> | null>(null);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    fetch(apiUrl("/api/personalizacion/productos"), { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setProductos(j.productos ?? []))
      .catch(() => setProductos([]));
  }, []);

  const filtrados = (productos ?? []).filter((p) => p.titulo.toLowerCase().includes(busqueda.toLowerCase()));

  return (
    <Card title={`Catálogo real (${productos?.length ?? "…"})`}>
      <div className="text-xs text-brand-muted mb-3">
        Mismo catálogo que usa Hermes para responder (Knowledge Package) — solo lectura, nunca una segunda fuente de productos/precios.
      </div>
      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar producto…"
        className="w-full mb-3 bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-xs text-brand-text placeholder:text-brand-muted"
      />
      {productos === null ? (
        <LoadingState label="Cargando catálogo real…" />
      ) : filtrados.length === 0 ? (
        <EmptyState label="Sin resultados." />
      ) : (
        <div className="max-h-[55vh] overflow-y-auto space-y-1">
          {filtrados.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm rounded-lg border border-brand-border px-3 py-2">
              <span className="text-brand-text">{p.titulo}</span>
              <span className="text-[11px] text-brand-muted">{p.categoria}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function PersonalizacionPanel({ sub }: { sub: PersonalizacionSubView }) {
  return (
    <section className="h-full overflow-y-auto p-5 bg-brand-bg/30">
      <div className="max-w-3xl mx-auto space-y-4">
        <h2 className="font-display text-xl font-bold text-brand-text">
          Personalización — {sub === "general" ? "General" : sub === "horarios" ? "Horarios" : sub === "negocio" ? "Negocio" : "Productos"}
        </h2>
        {sub === "general" && <GeneralTab />}
        {sub === "horarios" && <HorariosTab />}
        {sub === "negocio" && <NegocioTab />}
        {sub === "productos" && <ProductosTab />}
      </div>
    </section>
  );
}
