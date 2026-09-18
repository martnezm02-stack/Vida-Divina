"use client";

import { useState } from "react";
import { apiUrl } from "../lib/apiPath";

interface DashboardHeaderProps {
  phone: string | null;
  title: string;
}

export default function DashboardHeader({ phone, title }: DashboardHeaderProps) {
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    const confirmed = confirm(
      "¿Seguro que quieres desconectar WhatsApp? Tendrás que escanear el QR otra vez."
    );
    if (!confirmed) return;

    setDisconnecting(true);
    try {
      await fetch(apiUrl("/api/connection/disconnect"), { method: "POST" });
      window.location.reload();
    } catch {
      setDisconnecting(false);
      alert("Error al desconectar. Inténtalo de nuevo.");
    }
  }

  return (
    <header className="border-b border-brand-border bg-brand-surface/80 backdrop-blur px-6 py-3.5 flex items-center justify-between">
      <div className="flex items-center gap-3.5">
        {/* Enlace de regreso al Dashboard principal de Vive Vida Divina */}
        <a
          href="/"
          className="text-xs text-brand-muted hover:text-brand-gold transition-colors shrink-0"
          title="Volver al Dashboard principal de Vive Vida Divina"
        >
          ← Vida Divina
        </a>
        <div className="h-5 w-px bg-brand-border" />
        <h1 className="font-display text-lg font-bold text-brand-text">{title}</h1>
      </div>

      <div className="flex items-center gap-5">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="brand-pulse absolute inline-flex h-full w-full rounded-full bg-wa-green opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-wa-green" />
          </span>
          <div className="leading-tight">
            <div className="text-xs font-semibold text-brand-text">Conectado</div>
            {phone && (
              <div className="text-[11px] text-brand-muted font-mono">+{phone}</div>
            )}
          </div>
        </div>

        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="text-xs px-3.5 py-2 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300 transition-colors disabled:opacity-50"
        >
          {disconnecting ? "Desconectando WhatsApp..." : "Desconectar WhatsApp"}
        </button>
      </div>
    </header>
  );
}
