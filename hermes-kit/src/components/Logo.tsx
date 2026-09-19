"use client";

import { apiUrl } from "../lib/apiPath";

// ============================================================
// LOGO / MARCA DEL PANEL — Integración "WhatsApp / Hermes" (2026-09-04):
// nombre y gradiente alineados a la paleta real del Dashboard Vida Divina
// (--forest/--gold, ver globals.css). Estructura del componente intacta.
//
// FASE "Cierre de autenticación + logo + correo de inventario"
// (2026-09-19): el wordmark del sidebar (Sidebar.tsx -- ÚNICO punto de
// esta fase) ahora antepone el logo REAL de Vive Vida Divina
// (public/logo.jpg) delante del símbolo Emblem existente. Emblem NO se
// toca: ConversationPanel.tsx sigue usándolo tal cual en su propio lugar,
// fuera del alcance de esta fase.
//
// CORRECCIÓN (Fase "Corrección del logo de Hermes Ventas", 2026-09-19,
// archivo real reemplazado por el que el usuario adjuntó) -- causa raíz
// real de la imagen rota: next/image (<Image>) pasa por el optimizador de
// Next.js (/hermes/_next/image?url=...), que devolvía 400 real ("The
// requested resource isn't a valid image") para este asset local en este
// entorno (Turbopack + basePath) -- confirmado con curl directo: el
// archivo crudo en /hermes/logo.jpg SIEMPRE respondió 200 real, solo el
// optimizador fallaba. Se cambia a <img> plano (sin next/image) + apiUrl()
// -- mismo helper YA existente en el proyecto para anteponer el basePath
// real a mano (ver lib/apiPath.ts), evitando el optimizador por completo.
const BRAND_NAME = "Hermes";

/** Logo real de Vive Vida Divina, recortado a badge circular -- mismo criterio CSS exacto que dashboard/public/styles.css#.brand-logo (object-fit: cover + border-radius: 50%), nunca una imagen regenerada. */
function BrandBadge({ size }: { size: number }) {
  return (
    <img
      src={apiUrl("/logo.jpg")}
      alt="Vive Vida Divina"
      width={size}
      height={size}
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  );
}

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
      <BrandBadge size={size * 1.25} />
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
