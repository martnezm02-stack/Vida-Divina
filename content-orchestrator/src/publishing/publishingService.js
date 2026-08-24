// publishingService.js — Bloque 3, punto de entrada único:
// publish(assetPackage, platform, destination, metadata). Solo hace
// dispatch hacia el PublishingAdapter real del platform pedido -- nunca
// implementa lógica de red aquí (eso vive en cada adapter). Mismo
// principio de todo el proyecto: "no fabricar" -- un platform sin adapter
// real reporta explícitamente que no está soportado, nunca se finge.

import { PUBLISH_PLATFORMS, createPublishResult } from './publishingContract.js';
import { MetaAdapter } from './metaAdapter.js';
import { FacebookAdapter } from './facebookAdapter.js';
import { WhatsAppAdapter } from './whatsappAdapter.js';

/** Fábrica de adapters -- un adapter nuevo (real) solo se agrega aquí, nunca reimplementando el Content Generation Engine ni el Asset Package. */
export function getAdapterForPlatform(platform, overrides = {}) {
  switch (platform) {
    case 'INSTAGRAM': return new MetaAdapter(overrides);
    case 'FACEBOOK': return new FacebookAdapter(overrides);
    case 'WHATSAPP': return new WhatsAppAdapter(overrides);
    default: return null;
  }
}

/** Estado de configuración de TODOS los platforms reales, sin tocar la red -- para que el dashboard muestre "Configuración requerida" antes de que el usuario intente publicar. */
export function listPublishTargets() {
  return PUBLISH_PLATFORMS.map((platform) => {
    const adapter = getAdapterForPlatform(platform);
    return { platform, configured: adapter.isConfigured() };
  });
}

/**
 * @param {object} assetPackage — Final Asset Package real (contentGenerationEngine.js).
 * @param {string} platform — uno de PUBLISH_PLATFORMS.
 * @param {string} destination — destino real (ej. wa_id para WHATSAPP; no usado por INSTAGRAM/FACEBOOK, que publican a la cuenta ya fijada por credencial).
 * @param {object} metadata — específico del adapter (ver metaAdapter.js/facebookAdapter.js/whatsappAdapter.js).
 */
export async function publish(assetPackage, platform, destination, metadata = {}) {
  if (!assetPackage) {
    return createPublishResultSafe({ platform, status: 'FAILED', error: 'publish: "assetPackage" es obligatorio.' });
  }
  if (assetPackage.status !== 'COMPLETED' && assetPackage.status !== 'PARTIAL') {
    return createPublishResultSafe({ platform, status: 'FAILED', error: `publish: el Final Asset Package tiene status "${assetPackage.status}" -- solo se puede publicar contenido COMPLETED o PARTIAL (ya producido y validado).` });
  }
  if (!PUBLISH_PLATFORMS.includes(platform)) {
    return createPublishResultSafe({ platform, status: 'FAILED', error: `publish: platform "${platform}" no soportado (válidos: ${PUBLISH_PLATFORMS.join(', ')}).` });
  }

  const adapter = getAdapterForPlatform(platform, metadata.adapterOverrides ?? {});
  try {
    return await adapter.publish(assetPackage, destination, metadata);
  } catch (err) {
    return createPublishResultSafe({ platform, status: 'FAILED', error: `publish: fallo inesperado del adapter — ${err.message}` });
  }
}

function createPublishResultSafe({ platform, status, error }) {
  // Envoltura defensiva: si `platform` ni siquiera es válido, createPublishResult() lanzaría -- este helper garantiza que publish() SIEMPRE devuelve un resultado estructurado, nunca lanza.
  if (!PUBLISH_PLATFORMS.includes(platform)) {
    return Object.freeze({ publicationId: null, platform, status: 'FAILED', assetIds: [], externalId: null, publishedAt: null, error, detail: null });
  }
  return createPublishResult({ platform, status, assetIds: [], error });
}
