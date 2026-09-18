// DashboardUi.tsx — pequeños bloques visuales compartidos entre los
// paneles nuevos del Dashboard (FASE "Rediseño Dashboard Hermes Ventas" +
// "Corrección de dirección visual", 2026-09-18) -- mismos brand tokens ya
// definidos en globals.css (tema claro: tarjetas blancas, sombra suave,
// bordes discretos), nunca un sistema de diseño paralelo ni una librería
// de UI nueva.

export function Card({ title, action, children, className = "" }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-brand-border bg-brand-surface shadow-sm p-4 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          {title && <div className="text-[11px] uppercase tracking-wider text-brand-muted font-semibold">{title}</div>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

const ICON_TONE_BG: Record<string, string> = {
  gold: "bg-brand-gold/15 text-brand-gold",
  green: "bg-wa-green/15 text-wa-green",
  red: "bg-red-500/12 text-red-600",
  blue: "bg-blue-500/12 text-blue-600",
  purple: "bg-purple-500/12 text-purple-600",
};

function TileIcon({ tone, path }: { tone: string; path: string }) {
  return (
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${ICON_TONE_BG[tone] ?? ICON_TONE_BG.gold}`}>
      <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5">
        <path d={path} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

const STAT_ICON_PATHS: Record<string, string> = {
  chart: "M3 16.5V13m5 3.5V8m5 8.5V5m5 11.5V10",
  users: "M6.5 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm7-1a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM2 16c.4-2.6 2.2-4 4.5-4s4.1 1.4 4.5 4M11 16c.3-1.8 1.5-3 3.5-3s3.2 1.2 3.5 3",
  chat: "M3 5h14v9H7l-4 3V5Z",
  cart: "M3 4h2l1.5 9h8L16 7H6",
  alert: "M10 3a5 5 0 0 0-5 5v3l-1.5 3h13L15 11V8a5 5 0 0 0-5-5Z",
  box: "M3 6l7-3 7 3v8l-7 3-7-3V6Zm0 0 7 3m0 0 7-3m-7 3v8",
};

export function StatCard({ label, value, sub, tone = "gold", icon, trend }: { label: string; value: string; sub?: string; tone?: "gold" | "green" | "red" | "blue" | "purple"; icon?: keyof typeof STAT_ICON_PATHS; trend?: string }) {
  return (
    <div className="rounded-xl border border-brand-border bg-brand-surface shadow-sm px-4 py-3.5">
      <div className="flex items-start gap-3">
        {icon && <TileIcon tone={tone} path={STAT_ICON_PATHS[icon]} />}
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-brand-muted">{label}</div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="font-display text-2xl font-bold text-brand-text leading-none">{value}</span>
            {trend && <span className="text-[11px] font-semibold text-wa-green">{trend}</span>}
          </div>
          {sub && <div className="text-[11px] text-brand-muted mt-1">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

export function Badge({ tone, children }: { tone: "green" | "gold" | "red" | "muted"; children: React.ReactNode }) {
  const cls =
    tone === "green"
      ? "bg-wa-green/10 text-wa-green"
      : tone === "gold"
        ? "bg-brand-gold/12 text-brand-gold"
        : tone === "red"
          ? "bg-red-50 text-red-600"
          : "bg-brand-border/60 text-brand-muted";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>{children}</span>;
}

export function LoadingState({ label = "Cargando…" }: { label?: string }) {
  return <div className="py-10 text-center text-sm text-brand-muted">{label}</div>;
}

export function EmptyState({ label }: { label: string }) {
  return <div className="py-8 text-center text-sm text-brand-muted">{label}</div>;
}

export function ErrorState({ label }: { label: string }) {
  return <div className="py-3 px-3 rounded-lg bg-red-50 border border-red-200 text-center text-sm text-red-600">{label}</div>;
}

const DONUT_COLORS = ["#1fa855", "#3b82f6", "#b8863a", "#9ca3af", "#a855f7", "#ef4444"];

/** Dona SVG simple, sin dependencia nueva -- para "Estado de clientes"/"Estado de productos". */
export function Donut({ segments, centerLabel, centerValue }: { segments: Array<{ label: string; value: number }>; centerLabel: string; centerValue: string }) {
  const total = Math.max(1, segments.reduce((a, s) => a + s.value, 0));
  const radius = 15.9155;
  const circumference = 2 * Math.PI * radius;
  let acumulado = 0;

  return (
    <div className="flex items-center gap-5">
      <div className="relative w-32 h-32 shrink-0">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r={radius} fill="none" stroke="var(--color-brand-border)" strokeWidth="4" />
          {segments.map((s, i) => {
            const frac = s.value / total;
            const dash = frac * circumference;
            const offset = acumulado;
            acumulado += dash;
            return (
              <circle
                key={s.label}
                cx="18"
                cy="18"
                r={radius}
                fill="none"
                stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
                strokeWidth="4"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-bold text-brand-text">{centerValue}</span>
          <span className="text-[10px] text-brand-muted">{centerLabel}</span>
        </div>
      </div>
      <ul className="space-y-1.5 text-xs flex-1 min-w-0">
        {segments.map((s, i) => (
          <li key={s.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
              <span className="text-brand-text truncate">{s.label}</span>
            </span>
            <span className="text-brand-muted shrink-0">
              {s.value} ({total > 0 ? Math.round((s.value / total) * 100) : 0}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barras horizontales simples -- para "Valor por categoría". */
export function BarList({ items, formatValue }: { items: Array<{ label: string; value: number }>; formatValue: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-2.5">
      {items.map((item, i) => (
        <div key={item.label}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-brand-text">{item.label}</span>
            <span className="text-brand-muted font-medium">{formatValue(item.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-brand-bg overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(item.value / max) * 100}%`, background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}
