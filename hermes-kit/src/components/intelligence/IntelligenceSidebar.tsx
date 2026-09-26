"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProjectSwitcher } from "./ProjectSwitcher";

interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: string;
}

// Iconos inline SVG (mismo patrón que Sidebar.tsx del kit -- sin librería de iconos nueva).
const ICONS: Record<string, string> = {
  overview: "M3 12l4-4 4 4 6-6",
  market: "M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z",
  competitive: "M10 2l8 4-8 4-8-4z M2 10l8 4 8-4 M2 14l8 4 8-4",
  creative: "M10 2a6 6 0 100 12 4 4 0 010 4",
  signals: "M4 10h2v6H4zM9 6h2v10H9zM14 12h2v4h-2z",
  insights: "M10 2a6 6 0 00-3 11.2V16h6v-2.8A6 6 0 0010 2z M8 18h4",
  briefs: "M5 3h10v14l-3-2-2 2-2-2-3 2z",
  watchlists: "M10 3a7 7 0 100 14 7 7 0 000-14zM10 6v4l3 2",
  performance: "M3 15l4-5 3 3 6-8",
  predictions: "M3 10a7 7 0 1114 0M10 10v6",
  evidence: "M4 3h9l3 3v11H4zM13 3v3h3",
  config: "M10 6a4 4 0 100 8 4 4 0 000-8zM3 10h2M15 10h2M10 3v2M10 15v2",
};

const NAV: NavItem[] = [
  { key: "overview", label: "Overview", href: "/intelligence", icon: "overview" },
  { key: "market", label: "Market Intelligence", href: "/intelligence/market-intelligence", icon: "market" },
  { key: "competitive", label: "Competitive Intelligence", href: "/intelligence/competitive-intelligence", icon: "competitive" },
  { key: "creative", label: "Creative Intelligence", href: "/intelligence/creative-intelligence", icon: "creative" },
  { key: "signals", label: "Signals", href: "/intelligence/signals", icon: "signals" },
  { key: "insights", label: "Insights", href: "/intelligence/insights", icon: "insights" },
  { key: "briefs", label: "Intelligence Briefs", href: "/intelligence/briefs", icon: "briefs" },
  { key: "watchlists", label: "Watchlists", href: "/intelligence/watchlists", icon: "watchlists" },
  { key: "performance", label: "Performance", href: "/intelligence/performance", icon: "performance" },
  { key: "predictions", label: "Predictions", href: "/intelligence/predictions", icon: "predictions" },
  { key: "evidence", label: "Evidence Explorer", href: "/intelligence/evidence-explorer", icon: "evidence" },
  { key: "config", label: "Configuración", href: "/intelligence/configuracion", icon: "config" },
];

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" fill="none">
      <path d={path} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        active ? "bg-intel-blue/15 text-intel-cyan" : "text-intel-muted hover:bg-intel-surface-2 hover:text-intel-text"
      }`}
    >
      <Icon path={ICONS[item.icon]} />
      <span>{item.label}</span>
    </Link>
  );
}

export function IntelligenceSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-72 shrink-0 h-full flex flex-col border-r border-intel-border bg-intel-bg-elevated">
      <div className="p-3.5 border-b border-intel-border">
        <ProjectSwitcher />
      </div>
      <nav className="flex-1 overflow-y-auto intel-scrollbar px-2 py-2 space-y-0.5">
        {NAV.map((item) => (
          <NavLink key={item.key} item={item} active={pathname === item.href} />
        ))}
      </nav>
      <div className="p-3 border-t border-intel-border text-[11px] text-intel-muted">
        Powered by la plataforma Hermes
      </div>
    </aside>
  );
}
