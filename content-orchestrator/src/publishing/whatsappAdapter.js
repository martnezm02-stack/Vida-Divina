// whatsappAdapter.js — Bloque 3, adapter real de WhatsApp. Reutiliza SIN
// modificar destructivamente whatsapp-adapter/src/graphApiSender.js: usa
// envioHabilitado() (misma función real que ya gatea enviarRecursos()) y
// enviarAsset() (extensión aditiva de esta fase, mismo mecanismo real que
// enviarAudio() ya validado -- ver graphApiSender.js). No se creó un
// segundo cliente de Graph API.
//
// WhatsApp no tiene un concepto nativo de "publicar" un post público -- es
// un canal de mensajería 1:1/negocio-cliente. "Publicar" aquí significa
// enviar el Final Asset Package real como mensaje a un destinatario
// (destination = wa_id, ya autorizado en la lista de prueba de Meta -- ver
// docs/WHATSAPP_CLOUD_API_STATUS.md). CAROUSEL no tiene equivalente de
// "un solo mensaje" en WhatsApp: se envían los slides en orden, uno por
// mensaje, y se reporta el resultado agregado -- nunca se inventa un envío
// que no ocurrió.

import { envioHabilitado, enviarAsset } from '../../../whatsapp-adapter/src/graphApiSender.js';
import { PublishingAdapter, createPublishResult } from './publishingContract.js';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov']);

function extractExt(path) {
  const m = /\.[a-z0-9]+$/i.exec(path ?? '');
  return m ? m[0].toLowerCase() : '';
}

export class WhatsAppAdapter extends PublishingAdapter {
  constructor(overrides = {}) {
    super();
    this._fetchImpl = overrides.fetchImpl;
  }

  get platform() {
    return 'WHATSAPP';
  }

  isConfigured() {
    return envioHabilitado();
  }

  /**
   * @param {object} assetPackage — Final Asset Package real.
   * @param {string} destination — wa_id del destinatario real (ya autorizado en Meta).
   * @param {{caption?:string}} metadata
   */
  async publish(assetPackage, destination, metadata = {}) {
    if (!this.isConfigured()) {
      return createPublishResult({
        platform: this.platform, status: 'CONFIGURATION_REQUIRED', assetIds: [],
        detail: 'Falta WHATSAPP_ACCESS_TOKEN y/o WHATSAPP_PHONE_NUMBER_ID (variables de entorno) — ninguna llamada de red fue intentada.',
      });
    }
    if (!destination?.trim()) {
      return createPublishResult({ platform: this.platform, status: 'FAILED', assetIds: [], error: 'whatsappAdapter: "destination" (wa_id del destinatario real) es obligatorio.' });
    }

    const assets = assetPackage.assetPackageType === 'CAROUSEL'
      ? (assetPackage.assetPackage?.assets ?? [])
      : (assetPackage.outputAssets?.[0] ? [assetPackage.outputAssets[0]] : []);

    if (assets.length === 0) {
      return createPublishResult({ platform: this.platform, status: 'FAILED', assetIds: [], error: 'whatsappAdapter: el Final Asset Package no tiene ningún asset real que enviar.' });
    }

    const envios = [];
    for (const asset of assets) {
      const tipo = VIDEO_EXTENSIONS.has(extractExt(asset.path)) ? 'video' : 'image';
      // eslint-disable-next-line no-await-in-loop -- Meta no ofrece un endpoint de ráfaga; los mensajes deben enviarse en orden.
      const resultado = await enviarAsset(destination, asset.path, tipo, { caption: metadata.caption ?? null, ...(this._fetchImpl ? { fetchImpl: this._fetchImpl } : {}) });
      envios.push({ assetId: asset.assetId, ...resultado });
    }

    const todosOk = envios.every((e) => e.ok);
    const assetIds = assets.map((a) => a.assetId);

    // PUBLISH_STATUSES no tiene un estado "parcial" -- un carrusel donde
    // solo algunos slides se enviaron NO es "publicado" (el contrato exige
    // FAILED con el detalle real de qué sí y qué no, nunca se declara éxito
    // sobre un envío incompleto).
    if (!todosOk) {
      return createPublishResult({
        platform: this.platform, status: 'FAILED', assetIds,
        error: envios.filter((e) => !e.ok).map((e) => `slide/asset ${e.assetId?.slice(0, 8)}: ${e.error ?? e.etapa}`).join('; '),
        detail: { envios },
      });
    }
    return createPublishResult({
      platform: this.platform, status: 'PUBLISHED', assetIds,
      externalId: envios[0]?.messageId ?? null,
      detail: { envios },
    });
  }
}
