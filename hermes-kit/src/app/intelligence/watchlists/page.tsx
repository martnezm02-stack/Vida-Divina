"use client";

import { SectionListPage } from "@/components/intelligence/SectionListPage";
import type { Watchlist } from "@/lib/intelligence/types";

export default function WatchlistsPage() {
  return (
    <SectionListPage<Watchlist>
      title="Watchlists"
      subtitle="Watchlists configuradas para el Continuous Intelligence Worker"
      section="watchlists"
      emptyMessage="Sin watchlists configuradas todavía."
      keyOf={(w) => w.id}
      renderItem={(watchlist) => (
        <div className="flex items-center justify-between rounded-lg border border-intel-border bg-intel-surface px-4 py-3">
          <div>
            <div className="text-sm text-intel-text">{watchlist.name}</div>
            <div className="text-xs text-intel-muted">
              {watchlist.watchlist_type} · {watchlist.enabled ? "activa" : "pausada"}
              {watchlist.last_checked_at ? ` · última revisión ${new Date(watchlist.last_checked_at * 1000).toLocaleString("es")}` : " · sin ejecutar todavía"}
            </div>
          </div>
        </div>
      )}
    />
  );
}
