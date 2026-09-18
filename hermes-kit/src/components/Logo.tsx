"use client";

// ============================================================
// LOGO / MARCA DEL PANEL — Integración "WhatsApp / Hermes" (2026-09-04):
// nombre y gradiente alineados a la paleta real del Dashboard Vida Divina
// (--forest/--gold, ver globals.css). Estructura del componente intacta.
// ============================================================
const BRAND_NAME = "Hermes";

/** Emblema: un pequeño sello con destello (para favicon o espacios mínimos). */
export function Emblem({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="brand-mark" x1="0" y1="0" x2="48" y2="48">
          <stop offset="0" stopColor="#e0c785" />
          <stop offset="0.5" stopColor="#b58c33" />
          <stop offset="1" stopColor="#7a5c1f" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="#101a33" stroke="url(#brand-mark)" strokeWidth="2" />
      <path
        d="M24 9 C25 18 30 23 39 24 C30 25 25 30 24 39 C23 30 18 25 9 24 C18 23 23 18 24 9 Z"
        fill="url(#brand-mark)"
      />
      <path
        d="M35.5 11 C35.8 13.6 36.4 14.2 39 14.5 C36.4 14.8 35.8 15.4 35.5 18 C35.2 15.4 34.6 14.8 32 14.5 C34.6 14.2 35.2 13.6 35.5 11 Z"
        fill="#e0c785"
      />
    </svg>
  );
}

/** Wordmark del panel: emblema + nombre. `size` es la altura tipográfica base. */
export default function Logo({ size = 26 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5 select-none" aria-label={BRAND_NAME}>
      <Emblem size={size * 1.25} />
      <span
        className="font-display font-black tracking-tight leading-none"
        style={{
          fontSize: size,
          backgroundImage: "linear-gradient(180deg, #e6d3a0 0%, #b58c33 48%, #7a5c1f 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.4))",
        }}
      >
        {BRAND_NAME}
      </span>
    </div>
  );
}
