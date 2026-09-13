"use client";

import { useState } from "react";
import Logo from "./Logo";
import { apiUrl } from "../lib/apiPath";

type View = "chats" | "metrics" | "settings" | "alertas";
interface DashboardHeaderProps {
  phone: string | null;
  view: View;
  onViewChange: (v: View) => void;
  alertCount?: number;
}

export default function DashboardHeader({ phone, view, onViewChange, alertCount = 0 }: DashboardHeaderProps) {
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
    <header className="border-b border-brand-border bg-brand-surface/80 backdrop-blur px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3.5">
        {/* Enlace de regreso al Dashboard principal de Vive Vida Divina */}
        <a
          href="/"
          className="text-xs text-brand-muted hover:text-brand-gold transition-colors shrink-0"
          title="Volver al Dashboard principal de Vive Vida Divina"
        >
          ← Vida Divina
        </a>
        {/* Logo principal de marca */}
        <Logo size={20} />
        <div className="h-9 w-px bg-brand-border" />
        <nav className="inline-flex rounded-lg border border-brand-border p-0.5 bg-brand-bg" aria-label="Vistas del dashboard">
          {(["chats", "metrics", "alertas", "settings"] as const).map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              aria-pressed={view === v}
              className={`relative px-3.5 py-1.5 text-sm font-semibold rounded-md transition-colors ${
                view === v
                  ? "bg-brand-gold/20 text-brand-gold"
                  : "text-brand-text/70 hover:text-brand-text"
              }`}
            >
              {v === "chats" ? "Chats" : v === "metrics" ? "Métricas" : v === "alertas" ? "Alertas" : "Ajustes"}
              {v === "alertas" && alertCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {alertCount}
                </span>
              )}
            </button>
          ))}
        </nav>
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
          className="text-xs px-3.5 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:border-red-500/50 hover:text-red-300 transition-colors disabled:opacity-50"
        >
          {disconnecting ? "Desconectando WhatsApp..." : "Desconectar WhatsApp"}
        </button>
      </div>
    </header>
  );
}
