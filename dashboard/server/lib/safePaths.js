// safePaths.js — frontera de seguridad real del dashboard (Parte
// "SEGURIDAD Y ARCHIVOS"). Ninguna ruta que llegue desde el navegador se
// usa tal cual contra el filesystem: se resuelve, se normaliza, y se
// verifica que caiga DENTRO de una raíz explícitamente permitida. Nunca
// se sirve ni se lee: .env, node_modules, credenciales, ni cualquier ruta
// fuera de las raíces reales de medios de este proyecto.

import { realpathSync, existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

// Únicas raíces reales desde las que el dashboard puede leer/servir
// archivos de medios (fotografías RAW, MP4 finales). Ninguna otra ruta del
// repositorio (creative-intelligence/data, .env de cualquier módulo,
// voice-engine/, crm/, whatsapp-adapter/) es alcanzable desde aquí.
export const ALLOWED_MEDIA_ROOTS = Object.freeze([
  resolve(PROJECT_ROOT, 'assets', 'products'),
  resolve(PROJECT_ROOT, 'video-production'),
]);

/**
 * Resuelve `candidatePath` de forma segura contra las raíces permitidas.
 * Devuelve la ruta real absoluta si es válida, o null si:
 *  - la ruta no existe físicamente;
 *  - la ruta resuelta (siguiendo symlinks reales) cae fuera de toda raíz permitida.
 * Nunca lanza sobre input de usuario no confiable -- responde null, y quien
 * llama decide el 404/400 correspondiente.
 */
export function resolveSafeMediaPath(candidatePath) {
  if (typeof candidatePath !== 'string' || !candidatePath.trim()) return null;
  if (!existsSync(candidatePath)) return null;
  let real;
  try {
    real = realpathSync(candidatePath);
  } catch {
    return null;
  }
  const dentroDeAlgunaRaiz = ALLOWED_MEDIA_ROOTS.some((root) => {
    const rootReal = existsSync(root) ? realpathSync(root) : root;
    return real === rootReal || real.startsWith(rootReal + sep);
  });
  return dentroDeAlgunaRaiz ? real : null;
}

/** true si la ruta cae dentro de alguna raíz permitida, sin exigir que exista físicamente (útil para validar antes de construir una ruta de salida). */
export function isWithinAllowedRoot(candidatePath) {
  const resolved = resolve(candidatePath);
  return ALLOWED_MEDIA_ROOTS.some((root) => resolved === root || resolved.startsWith(root + sep));
}

/**
 * Traduce una ruta absoluta real del servidor a una URL `/media/...` segura
 * para enviar al navegador -- el frontend nunca recibe una ruta absoluta
 * de filesystem (Parte "SEGURIDAD Y ARCHIVOS": no exponer rutas sensibles
 * innecesarias). Devuelve null si la ruta no cae dentro de ninguna raíz
 * permitida (nunca genera una URL hacia algo que /media no serviría).
 */
export function toMediaUrl(absolutePath) {
  const real = resolveSafeMediaPath(absolutePath);
  if (!real) return null;
  const root = ALLOWED_MEDIA_ROOTS.find((r) => real === r || real.startsWith(r + sep));
  const rootName = root.endsWith('products') ? 'assets-products' : 'video-production';
  const relative = real.slice(root.length + 1).split(sep).join('/');
  return `/media/${rootName}/${relative.split('/').map(encodeURIComponent).join('/')}`;
}
