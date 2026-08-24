// publishingContract.js — Bloque 3 (Publicación real). Contrato común de
// TODOS los PublishingAdapter reales: publish(assetPackage, platform,
// destination, metadata) -> PublishResult estructurado.
//
// RELACIÓN CON content-strategy/src/publicationAdapter.js: ese contrato
// (Fase 17/19) ya existe y es real, pero está diseñado para el mundo de
// ContentItem (texto + review humano + QualityGate/ProductTruthGate de
// content-strategy). El Final Asset Package de content-orchestrator (esta
// fase) es un objeto distinto -- ya pasó por su propio pipeline de
// integridad (productIntegrity.js, brandVisualSystem.js, guards de
// hyperframesRenderer.js) y no tiene ContentItem/HumanReviewRecord detrás.
// Este archivo declara un contrato PARALELO, deliberadamente más simple,
// para ese objeto -- no una copia: el vocabulario de estado es el que pide
// esta fase (PENDING/READY/PUBLISHED/FAILED/CONFIGURATION_REQUIRED), no el
// de Fase 17 (SIMULATED/REJECTED/AUTHORIZATION_REQUIRED). Los adapters
// reales de esta fase SÍ reutilizan la mecánica real ya construida donde
// aplica (ver metaAdapter.js -- reutiliza content-strategy/src/
// instagramConfig.js#resolveInstagramConfig tal cual).

import { randomUUID } from 'node:crypto';

export const PUBLISH_STATUSES = Object.freeze(['PENDING', 'READY', 'PUBLISHED', 'FAILED', 'CONFIGURATION_REQUIRED']);
export const PUBLISH_PLATFORMS = Object.freeze(['INSTAGRAM', 'FACEBOOK', 'WHATSAPP']);

export function createPublishResult({ platform, status, assetIds = [], externalId = null, error = null, detail = null }) {
  if (!PUBLISH_PLATFORMS.includes(platform)) throw new Error(`createPublishResult: "platform" inválido "${platform}" (válidos: ${PUBLISH_PLATFORMS.join(', ')}).`);
  if (!PUBLISH_STATUSES.includes(status)) throw new Error(`createPublishResult: "status" inválido "${status}" (válidos: ${PUBLISH_STATUSES.join(', ')}).`);
  if (status === 'FAILED' && !error) throw new Error('createPublishResult: status "FAILED" requiere "error" explícito.');
  return Object.freeze({
    publicationId: randomUUID(),
    platform,
    status,
    assetIds: Object.freeze([...assetIds]),
    externalId,
    publishedAt: status === 'PUBLISHED' ? new Date().toISOString() : null,
    error,
    detail,
  });
}

export class PublishingAdapter {
  get platform() {
    throw new Error('PublishingAdapter: la propiedad "platform" debe implementarse en la subclase.');
  }

  /** Verifica credenciales/configuración SIN tocar la red -- usado por el dashboard para mostrar "Configuración requerida" antes de intentar publicar. */
  isConfigured() {
    throw new Error('PublishingAdapter.isConfigured() debe implementarse en la subclase.');
  }

  // eslint-disable-next-line no-unused-vars
  async publish(assetPackage, destination, metadata = {}) {
    throw new Error('PublishingAdapter.publish() debe implementarse en la subclase.');
  }
}
