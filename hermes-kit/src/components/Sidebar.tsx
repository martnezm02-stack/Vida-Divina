"use client";

import { useState } from "react";
import Logo from "./Logo";

export type MainView =
  | "dashboard"
  | "chats"
  | "calendario"
  | "alertas"
  | "personalizacion"
  | "integraciones"
  | "reportes"
  | "inventario"
  | "settings";

export type PersonalizacionSubView = "general" | "horarios" | "negocio" | "productos";

interface SidebarProps {
  view: MainView;
  personalizacionSub: PersonalizacionSubView;
  onViewChange: (v: MainView) => void;
  onPersonalizacionSubChange: (v: PersonalizacionSubView) => void;
  alertCount?: number;
}

// Iconos inline (sin dependencia nueva) -- trazos simples, 20x20, heredan currentColor.
function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-[18px] h-[18px] shrink-0">
      <path d={path} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICONS = {
  dashboard: "M3 10.5 10 4l7 6.5M5 9v7h10V9",
  chats: "M3 5h14v9H7l-4 3V5Z",
  calendario: "M4 4h12v13H4V4Zm0 4h12M7 2v4M13 2v4",
  alertas: "M10 3a5 5 0 0 0-5 5v3l-1.5 3h13L15 11V8a5 5 0 0 0-5-5Zm-1.5 13a1.5 1.5 0 0 0 3 0",
  personalizacion: "M4 6h9M4 10h12M4 14h7M15 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  integraciones: "M7 8V5.5a2.5 2.5 0 0 1 5 0V8m-6 0h8l-1 9H8L7 8Z",
  reportes: "M4 16V9m4 7V4m4 12v-6m4 6V7",
  inventario: "M3 6l7-3 7 3v8l-7 3-7-3V6Zm0 0 7 3m0 0 7-3m-7 3v8",
  settings: "M10 12.5A2.5 2.5 0 1 0 10 7.5a2.5 2.5 0 0 0 0 5Zm7-2.5a6.9 6.9 0 0 0-.1-1.2l1.5-1.2-1.5-2.6-1.8.6a7 7 0 0 0-2-1.2L13 2h-3l-.1 2.4a7 7 0 0 0-2 1.2l-1.8-.6-1.5 2.6L6.1 8.8A6.9 6.9 0 0 0 6 10c0 .4 0 .8.1 1.2l-1.5 1.2 1.5 2.6 1.8-.6a7 7 0 0 0 2 1.2L10 18h3l.1-2.4a7 7 0 0 0 2-1.2l1.8.6 1.5-2.6-1.5-1.2c.1-.4.1-.8.1-1.2Z",
};

const NAV: Array<{ key: MainView; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "chats", label: "Conversaciones" },
  { key: "calendario", label: "Calendario" },
  { key: "alertas", label: "Alertas" },
];

const PERSONALIZACION_ITEMS: Array<{ key: PersonalizacionSubView; label: string }> = [
  { key: "general", label: "General" },
  { key: "horarios", label: "Horarios" },
  { key: "negocio", label: "Negocio" },
  { key: "productos", label: "Productos" },
];

const NAV_AFTER: Array<{ key: MainView; label: string }> = [
  { key: "integraciones", label: "Integraciones" },
  { key: "reportes", label: "Reportes" },
  { key: "inventario", label: "Inventario" },
  { key: "settings", label: "Configuración" },
];

function NavButton({
  active,
  icon,
  label,
  badge,
  onClick,
  indent = false,
}: {
  active: boolean;
  icon?: string;
  label: string;
  badge?: number;
  onClick: () => void;
  indent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`w-full flex items-center gap-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
        indent ? "pl-9 pr-3 py-1.5" : "px-3 py-2"
      } ${active ? "bg-brand-gold/20 text-brand-gold" : "text-sidebar-text hover:bg-sidebar-surface hover:text-white"}`}
    >
      {icon && <Icon path={icon} />}
      <span className="flex-1 truncate">{label}</span>
      {!!badge && badge > 0 && (
        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
          {badge}
        </span>
      )}
    </button>
  );
}

export default function Sidebar({ view, personalizacionSub, onViewChange, onPersonalizacionSubChange, alertCount = 0 }: SidebarProps) {
  const [personalizacionAbierta, setPersonalizacionAbierta] = useState(view === "personalizacion");

  return (
    <aside className="w-64 shrink-0 h-full flex flex-col bg-sidebar-bg border-r border-sidebar-border">
      <div className="px-5 pt-6 pb-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <Logo size={22} />
        </div>
        <div className="text-[11px] text-sidebar-muted mt-1.5">Tu asistente de ventas, siempre contigo</div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Navegación principal">
        {NAV.map((item) => (
          <NavButton
            key={item.key}
            active={view === item.key}
            icon={ICONS[item.key]}
            label={item.label}
            badge={item.key === "alertas" ? alertCount : undefined}
            onClick={() => onViewChange(item.key)}
          />
        ))}

        <div>
          <button
            onClick={() => {
              setPersonalizacionAbierta((v) => !v);
              onViewChange("personalizacion");
            }}
            aria-expanded={personalizacionAbierta}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
              view === "personalizacion" ? "bg-brand-gold/20 text-brand-gold" : "text-sidebar-text hover:bg-sidebar-surface hover:text-white"
            }`}
          >
            <Icon path={ICONS.personalizacion} />
            <span className="flex-1">Personalización</span>
            <svg viewBox="0 0 20 20" className={`w-3.5 h-3.5 transition-transform ${personalizacionAbierta ? "rotate-90" : ""}`} fill="none">
              <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {personalizacionAbierta && (
            <div className="mt-1 space-y-0.5">
              {PERSONALIZACION_ITEMS.map((sub) => (
                <NavButton
                  key={sub.key}
                  indent
                  active={view === "personalizacion" && personalizacionSub === sub.key}
                  label={sub.label}
                  onClick={() => {
                    onViewChange("personalizacion");
                    onPersonalizacionSubChange(sub.key);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {NAV_AFTER.map((item) => (
          <NavButton key={item.key} active={view === item.key} icon={ICONS[item.key]} label={item.label} onClick={() => onViewChange(item.key)} />
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-sidebar-border text-[11px] text-sidebar-muted">
        Vida Divina — Hermes Ventas
      </div>
    </aside>
  );
}
