"use client";

import Link from "next/link";
import { SectionListPage } from "@/components/intelligence/SectionListPage";
import type { Signal } from "@/lib/intelligence/types";

export default function SignalsPage() {
  return (
    <SectionListPage<Signal>
      title="Signals"
      subtitle="Todas las señales reales detectadas para el proyecto activo"
      section="signals"
      emptyMessage="Sin signals registradas todavía."
      keyOf={(s) => s.id}
      renderItem={(signal) => (
        <div className="flex items-center justify-between rounded-lg border border-intel-border bg-intel-surface px-4 py-3">
          <div>
            <div className="text-sm text-intel-text">{signal.title}</div>
            <div className="text-xs text-intel-muted">
              {signal.signal_type} · {new Date(signal.detected_at * 1000).toLocaleString("es")}
            </div>
          </div>
          {signal.item_id && (
            <Link href={`/intelligence/market-intelligence?itemId=${signal.item_id}`} className="text-xs text-intel-cyan">
              Ver evidencia
            </Link>
          )}
        </div>
      )}
    />
  );
}
