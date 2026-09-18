"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "../lib/apiPath";
import { Card, Badge, LoadingState, ErrorState } from "./DashboardUi";

interface VidaDivinaStatus {
  knowledgePackage: { available: boolean };
  commercialMedia: { available: boolean; count: number };
  crm: { configured: boolean };
  voiceEngine: { reachable: boolean };
  whatsapp: { status: string; phone: string | null };
  gmail: { configured: boolean };
  calendar: { configured: boolean };
}

function Fila({ nombre, ok, detalle }: { nombre: string; ok: boolean; detalle?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-brand-border last:border-0">
      <span className="text-sm text-brand-text">{nombre}</span>
      <div className="flex items-center gap-2">
        {detalle && <span className="text-xs text-brand-muted">{detalle}</span>}
        <Badge tone={ok ? "green" : "red"}>{ok ? "Conectado" : "No disponible"}</Badge>
      </div>
    </div>
  );
}

export default function IntegracionesPanel() {
  const [vd, setVd] = useState<VidaDivinaStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetch(apiUrl("/api/vida-divina-status"), { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => mounted && setVd(j))
      .catch(() => mounted && setError("No se pudo conectar con el servidor real."))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="h-full overflow-y-auto p-5 bg-brand-bg/30">
      <div className="max-w-2xl mx-auto space-y-4">
        <h2 className="font-display text-xl font-bold text-brand-text">Integraciones</h2>
        <div className="text-xs text-brand-muted -mt-2">Estado real de las conexiones que usa Hermes Ventas. Solo lectura.</div>

        {loading && <LoadingState label="Comprobando integraciones reales…" />}
        {error && <ErrorState label={error} />}

        {vd && (
          <Card>
            <Fila nombre="WhatsApp" ok={vd.whatsapp.status === "connected"} detalle={vd.whatsapp.phone ? `+${vd.whatsapp.phone}` : vd.whatsapp.status} />
            <Fila nombre="Gmail" ok={vd.gmail.configured} />
            <Fila nombre="Google Calendar" ok={vd.calendar.configured} />
            <Fila nombre="CRM (PostgreSQL)" ok={vd.crm.configured} />
            <Fila nombre="Catálogo de productos" ok={vd.knowledgePackage.available} />
            <Fila nombre="Contenido comercial / testimonios" ok={vd.commercialMedia.available} detalle={`${vd.commercialMedia.count} reales`} />
            <Fila nombre="Voice Engine" ok={vd.voiceEngine.reachable} />
          </Card>
        )}
      </div>
    </section>
  );
}
