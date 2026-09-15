import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sin esto, Next.js intenta empaquetar baileys/better-sqlite3/pino en su bundle
  // del server y rompe. Estos paquetes son nativos y deben quedarse externos.
  serverExternalPackages: [
    "@whiskeysockets/baileys",
    "better-sqlite3",
    "pino",
    "pino-pretty",
  ],
  // Integración "WhatsApp / Hermes" en el Dashboard Vida Divina (2026-09-04):
  // el server node:http de dashboard/ hace reverse-proxy de /hermes/* hacia
  // este proceso Next.js (puerto propio, ver hermes-kit/README-INTEGRACION.md).
  // basePath mueve TODAS las rutas (páginas + API routes + assets /_next/)
  // bajo /hermes automáticamente -- el proxy no necesita reescribir nada.
  // Ningún archivo de src/ se modifica para esto: es config pura de Next.js.
  basePath: "/hermes",
};

export default nextConfig;
