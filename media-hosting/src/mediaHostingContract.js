// mediaHostingContract.js — forma común de todo resultado de
// MediaHostingService, y el único lugar donde se decide qué tipos de
// archivo son alojables (JPEG/PNG/MP4, según el encargo de esta fase).
// Ningún provider (R2Provider, MockMediaHostingProvider) construye este
// objeto directamente -- siempre pasa por createMediaHostingResult() para
// garantizar la misma forma sin importar el provider real detrás.

export const MEDIA_HOSTING_STATUSES = Object.freeze([
  'UPLOADED', 'DELETED', 'NOT_FOUND', 'FAILED', 'CONFIGURATION_REQUIRED', 'REJECTED',
]);

const CONTENT_TYPES_BY_EXT = Object.freeze({
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
});

/** null si la extensión no es una de las 3 soportadas por esta fase (JPEG/PNG/MP4) -- nunca se adivina un content-type genérico. */
export function contentTypeForPath(localPath) {
  const m = /\.[a-z0-9]+$/i.exec(localPath ?? '');
  if (!m) return null;
  return CONTENT_TYPES_BY_EXT[m[0].toLowerCase()] ?? null;
}

export function extensionOf(localPath) {
  const m = /\.[a-z0-9]+$/i.exec(localPath ?? '');
  return m ? m[0].toLowerCase() : '';
}

export function createMediaHostingResult({ status, assetId, publicUrl = null, providerMode, error = null }) {
  if (!MEDIA_HOSTING_STATUSES.includes(status)) {
    throw new Error(`createMediaHostingResult: "status" inválido "${status}" (válidos: ${MEDIA_HOSTING_STATUSES.join(', ')}).`);
  }
  if (!assetId) throw new Error('createMediaHostingResult: "assetId" es obligatorio.');
  if (status === 'UPLOADED' && (!publicUrl || !publicUrl.startsWith('https://'))) {
    throw new Error('createMediaHostingResult: status "UPLOADED" requiere "publicUrl" real https.');
  }
  if ((status === 'FAILED' || status === 'CONFIGURATION_REQUIRED' || status === 'REJECTED') && !error) {
    throw new Error(`createMediaHostingResult: status "${status}" requiere "error" explícito.`);
  }
  return Object.freeze({ status, assetId, publicUrl, providerMode, error });
}
