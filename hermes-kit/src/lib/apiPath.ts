// apiPath.ts — Integración "WhatsApp / Hermes" en el Dashboard Vida Divina
// (2026-09-05, fix de rutas bajo basePath).
//
// Causa raíz: next.config.ts define basePath: "/hermes" para que el reverse
// proxy de dashboard/server/lib/hermesProxy.js pueda montar TODO el kit
// (páginas + rutas API + estáticos) bajo /hermes/*. Next.js reescribe el
// basePath automáticamente para next/link, next/router y next/image, pero
// NUNCA para fetch()/axios() con una ruta escrita a mano -- los componentes
// del kit (escritos originalmente para vivir en la raíz del dominio) hacían
// fetch("/api/...") literal, que el navegador resuelve contra la raíz real
// del ORIGIN (el Dashboard Vida Divina en :4310), no contra /hermes -- de
// ahí el 404 y la UI atascada en "Cargando...".
//
// Único helper centralizado para las rutas API internas del kit: nunca
// cambia el contrato de la API (mismos paths, mismos métodos, mismo body),
// solo antepone el basePath real ya montado. src/lib/baileys/*, openrouter.ts,
// tools/, guardrails.ts, memory.ts, db.ts, watchdog.ts, transcribe.ts,
// vision.ts NO se tocan -- sus llamadas a "https://openrouter.ai/api/v1/..."
// son externas, ajenas a este basePath, y no pasan por aquí.
const HERMES_BASE_PATH = "/hermes";

/**
 * Construye la URL real de una ruta interna del API de Hermes bajo el
 * basePath ya configurado en next.config.ts.
 *
 * apiUrl("/api/connection/status") -> "/hermes/api/connection/status"
 */
export function apiUrl(path: string): string {
  return `${HERMES_BASE_PATH}${path}`;
}
