// instagramPublicationAdapter.js — Fase 19, §4. Primer PublicationAdapter
// REAL (detrás de la interfaz de Fase 17, sin alterarla salvo la extensión
// mínima ya documentada en publicationAdapter.js). Diseñado siguiendo la
// auditoría oficial de Fase 18 (Instagram Content Publishing, Meta):
// crear contenedor de medios (POST /{ig-user-id}/media) → publicar el
// contenedor (POST /{media-id}/media_publish).
//
// DEFENSA EN PROFUNDIDAD (mismo criterio que approveContentItem/
// markReadyToPublish/publishReadyContentItem, Fases 16-17): este adapter NO
// confía en que publicationService.js ya validó todo — re-verifica de forma
// independiente production_status, HumanReviewRecord, versión de contenido
// y ambos gates, ANTES de intentar nada de red. Ninguno de estos parámetros
// existe ni existirá jamás en esta función: force, skip_review,
// skip_quality_gate, skip_product_truth, approved.
//
// CREDENCIALES: solo por variable de entorno (instagramConfig.js). Si falta
// INSTAGRAM_ACCESS_TOKEN o INSTAGRAM_IG_USER_ID, se devuelve
// CONFIGURATION_REQUIRED y NO se intenta ninguna llamada de red — mismo
// principio que AnthropicLLMProvider (marketing-intelligence, Fase 5), nunca
// se inventa ni se solicita una credencial desde este archivo.
//
// MEDIA HOSTING (Fase 18 §17, Fase 19 §5): Instagram exige que el medio a
// publicar esté disponible en una URL públicamente accesible en el momento
// de publicar. Este adapter NO construye, sube, ni aloja ningún archivo —
// solo ACEPTA una mediaUrl ya pública vía `context.mediaUrl` y valida su
// forma (debe ser https). Obtener/alojar ese archivo es responsabilidad de
// un módulo futuro, fuera de alcance de content-strategy y de esta fase.
//
// NUNCA SE HACE UNA LLAMADA REAL SIN CREDENCIALES CONFIGURADAS. En este
// repositorio, hoy, INSTAGRAM_ACCESS_TOKEN/INSTAGRAM_IG_USER_ID no están
// configurados — por lo tanto este adapter, ejecutado en este entorno,
// SIEMPRE devuelve CONFIGURATION_REQUIRED antes de tocar la red.

import { resolveInstagramConfig } from './instagramConfig.js';
import { createPublicationResult, PublicationAdapter } from './publicationAdapter.js';
import { computeContentVersion } from './contentItem.js';
import { runQualityGate } from './qualityGate.js';
import { runProductTruthGate } from './productTruthGate.js';

const FORBIDDEN_REVIEWER_IDS = Object.freeze(['system', 'auto', 'bot', 'automated', 'automatic', '']);

/** Fase 19 §5: única validación de forma que le corresponde a este módulo — nunca resuelve/aloja la URL. */
export function isValidPublicMediaUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

function rejected(platform, why) {
  return createPublicationResult({ platform, external_content_id: 'n/a', status: 'REJECTED', publication_mode: 'real', detail: why });
}

/** Nunca deja escapar el access token real hacia un mensaje de error, incluso si Meta lo hiciera eco. */
function redactToken(text, token) {
  if (typeof text !== 'string') return text;
  return token ? text.split(token).join('[REDACTED]') : text;
}

export class InstagramPublicationAdapter extends PublicationAdapter {
  constructor(overrides = {}) {
    super();
    const config = resolveInstagramConfig(overrides);
    this._accessToken = config.accessToken;
    this._igUserId = config.igUserId;
    this._apiVersion = config.apiVersion;
    this._fetch = overrides.fetchImpl ?? fetch;
  }

  get name() {
    return 'instagram_graph_api';
  }

  async publish(contentItem, context = {}) {
    const { draft, humanReview, mediaUrl } = context;
    const platform = contentItem?.platform ?? 'instagram';

    // --- Re-verificación independiente (nunca confía en el llamador) ---
    if (contentItem?.platform !== 'instagram') return rejected(platform, 'contentItem.platform no es "instagram".');
    if (contentItem.production_status !== 'READY_TO_PUBLISH') return rejected(platform, `production_status "${contentItem.production_status}" no es READY_TO_PUBLISH.`);
    if (!humanReview || humanReview.decision !== 'APPROVE') return rejected(platform, 'no hay un HumanReviewRecord real con decision="APPROVE".');
    if (humanReview.content_item_id !== contentItem.content_item_id) return rejected(platform, 'el HumanReviewRecord pertenece a otro ContentItem.');
    if (typeof humanReview.reviewer_id !== 'string' || FORBIDDEN_REVIEWER_IDS.includes(humanReview.reviewer_id.trim().toLowerCase())) {
      return rejected(platform, 'reviewer_id inválido — no es una persona real identificable.');
    }
    if (!draft || !draft.hook || !draft.body) return rejected(platform, 'el draft no tiene estructura válida (falta hook/body).');

    const currentVersion = computeContentVersion({ item: contentItem, draft });
    if (contentItem.content_version !== currentVersion || humanReview.content_version !== currentVersion) {
      return rejected(platform, 'la versión revisada no coincide con la versión actual del contenido.');
    }

    const truthResult = runProductTruthGate({ item: contentItem, draft });
    if (truthResult.status === 'BLOCKED') return rejected(platform, `ProductTruthGate BLOCKED: ${truthResult.reasons.join('; ')}`);

    const qualityResult = runQualityGate({ item: contentItem, draft });
    if (!qualityResult.passed) return rejected(platform, `QualityGate falla: ${qualityResult.failures.join('; ')}`);

    // --- Configuración/credenciales (nunca se intenta red sin esto) ---
    if (!this._accessToken || !this._igUserId) {
      return createPublicationResult({ platform, external_content_id: 'n/a', status: 'CONFIGURATION_REQUIRED', publication_mode: 'real', detail: 'Falta INSTAGRAM_ACCESS_TOKEN y/o INSTAGRAM_IG_USER_ID (variables de entorno) — ninguna llamada de red fue intentada.' });
    }
    if (!isValidPublicMediaUrl(mediaUrl)) {
      return createPublicationResult({ platform, external_content_id: 'n/a', status: 'CONFIGURATION_REQUIRED', publication_mode: 'real', detail: 'context.mediaUrl ausente o no es una URL https pública — Instagram exige un medio públicamente accesible al publicar.' });
    }

    // --- Llamada real (Graph API): crear contenedor → publicar contenedor ---
    const base = `https://graph.facebook.com/${this._apiVersion}/${this._igUserId}`;
    let containerId;
    try {
      const containerResp = await this._fetch(`${base}/media`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image_url: mediaUrl, caption: draft.caption ?? draft.body, access_token: this._accessToken }),
      });
      const containerBody = await containerResp.json();
      if (!containerResp.ok) {
        const message = redactToken(containerBody?.error?.message ?? `HTTP ${containerResp.status}`, this._accessToken);
        if (/permission|scope|not authorized|review|access/i.test(message)) {
          return createPublicationResult({ platform, external_content_id: 'n/a', status: 'AUTHORIZATION_REQUIRED', publication_mode: 'real', detail: message });
        }
        return createPublicationResult({ platform, external_content_id: 'n/a', status: 'FAILED', publication_mode: 'real', detail: message });
      }
      containerId = containerBody.id;
    } catch (networkError) {
      return createPublicationResult({ platform, external_content_id: 'n/a', status: 'FAILED', publication_mode: 'real', detail: `fallo de red: ${redactToken(networkError.message, this._accessToken)}` });
    }

    try {
      const publishResp = await this._fetch(`${base}/media_publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ creation_id: containerId, access_token: this._accessToken }),
      });
      const publishBody = await publishResp.json();
      if (!publishResp.ok) {
        const message = redactToken(publishBody?.error?.message ?? `HTTP ${publishResp.status}`, this._accessToken);
        if (/permission|scope|not authorized|review|access/i.test(message)) {
          return createPublicationResult({ platform, external_content_id: 'n/a', status: 'AUTHORIZATION_REQUIRED', publication_mode: 'real', detail: message });
        }
        return createPublicationResult({ platform, external_content_id: 'n/a', status: 'FAILED', publication_mode: 'real', detail: message });
      }
      return createPublicationResult({ platform, external_content_id: publishBody.id, status: 'PUBLISHED', publication_mode: 'real', detail: null });
    } catch (networkError) {
      return createPublicationResult({ platform, external_content_id: 'n/a', status: 'FAILED', publication_mode: 'real', detail: `fallo de red: ${redactToken(networkError.message, this._accessToken)}` });
    }
  }
}
