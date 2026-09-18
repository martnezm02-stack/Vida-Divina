"use client";

import { useEffect, useState } from "react";
import Sidebar, { type MainView, type PersonalizacionSubView } from "./Sidebar";
import DashboardHeader from "./DashboardHeader";
import ConversationList from "./ConversationList";
import ConversationPanel from "./ConversationPanel";
import AmbientBackground from "./AmbientBackground";
import HomePanel from "./HomePanel";
import CalendarioPanel from "./CalendarioPanel";
import AlertasPanel from "./AlertasPanel";
import PersonalizacionPanel from "./PersonalizacionPanel";
import IntegracionesPanel from "./IntegracionesPanel";
import ReportesPanel from "./ReportesPanel";
import InventarioPanel from "./InventarioPanel";
import SettingsPanel from "./SettingsPanel";
import { apiUrl } from "../lib/apiPath";

interface DashboardProps {
  phone: string | null;
}

export interface ConversationItem {
  id: number;
  phone: string;
  name: string | null;
  mode: "AI" | "HUMAN";
  last_message_at: number | null;
  last_message_preview: string | null;
}

const TITULOS: Record<MainView, string> = {
  dashboard: "Dashboard",
  chats: "Conversaciones",
  calendario: "Calendario",
  alertas: "Alertas",
  personalizacion: "Personalización",
  integraciones: "Integraciones",
  reportes: "Reportes",
  inventario: "Inventario",
  settings: "Configuración",
};

export default function Dashboard({ phone }: DashboardProps) {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState<MainView>("dashboard");
  const [personalizacionSub, setPersonalizacionSub] = useState<PersonalizacionSubView>("general");
  const [alertCount, setAlertCount] = useState(0);

  async function refreshAlertCount() {
    try {
      const res = await fetch(apiUrl("/api/alertas"), { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { count: number };
      setAlertCount(data.count ?? 0);
    } catch {
      // silenciar
    }
  }

  async function refresh() {
    try {
      const res = await fetch(apiUrl("/api/conversations"), { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { conversations: ConversationItem[] };
      setConversations(data.conversations);
    } catch {
      // silenciar
    }
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refreshAlertCount();
    const interval = setInterval(refreshAlertCount, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Selecciona una conversación SOLO si la actual no es válida (ninguna aún, o
  // se borró). No se ejecuta en cada refresco, así que no te saca de la que lees.
  useEffect(() => {
    if (conversations.length === 0) return;
    const sigueValida = selectedId !== null && conversations.some((c) => c.id === selectedId);
    if (!sigueValida) setSelectedId(conversations[0].id);
  }, [conversations, selectedId]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  function abrirConversacion(id: number) {
    setSelectedId(id);
    setView("chats");
  }

  return (
    <main className="h-screen overflow-hidden flex">
      <AmbientBackground />
      <Sidebar
        view={view}
        personalizacionSub={personalizacionSub}
        onViewChange={setView}
        onPersonalizacionSubChange={setPersonalizacionSub}
        alertCount={alertCount}
      />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <DashboardHeader phone={phone} title={TITULOS[view]} />
        {view === "dashboard" ? (
          <HomePanel />
        ) : view === "chats" ? (
          <div className="flex-1 min-h-0 grid grid-cols-[320px_1fr] overflow-hidden">
            <ConversationList conversations={conversations} selectedId={selectedId} onSelect={setSelectedId} onRefresh={refresh} />
            <ConversationPanel conversation={selected} onRefresh={refresh} />
          </div>
        ) : view === "calendario" ? (
          <CalendarioPanel />
        ) : view === "alertas" ? (
          <AlertasPanel onOpenConversation={abrirConversacion} />
        ) : view === "personalizacion" ? (
          <PersonalizacionPanel sub={personalizacionSub} />
        ) : view === "integraciones" ? (
          <IntegracionesPanel />
        ) : view === "reportes" ? (
          <ReportesPanel />
        ) : view === "inventario" ? (
          <InventarioPanel />
        ) : (
          <SettingsPanel />
        )}
      </div>
    </main>
  );
}
