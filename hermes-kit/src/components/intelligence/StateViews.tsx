import type { ReactNode } from "react";

export function LoadingState({ label = "Cargando..." }: { label?: string }) {
  return <div className="rounded-lg border border-intel-border bg-intel-surface px-4 py-6 text-center text-sm text-intel-muted animate-pulse">{label}</div>;
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-intel-high/30 bg-intel-high/10 px-4 py-6 text-center text-sm text-intel-high">
      {message}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-intel-border px-4 py-6 text-center text-sm text-intel-muted">
      {message}
    </div>
  );
}

/** Estado explícito para cuando el backend no tiene suficiente evidencia -- nunca se rellena con datos fabricados. */
export function InsufficientEvidenceState({ reason }: { reason?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-intel-border bg-intel-surface-2 px-4 py-6 text-center text-sm text-intel-muted">
      <div className="font-medium text-intel-text">Evidencia insuficiente</div>
      {reason && <div className="mt-1 text-xs">{reason}</div>}
    </div>
  );
}

export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-intel-border bg-intel-surface p-5">
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h2 className="text-sm font-semibold text-intel-text">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
