// marketingCampaigns.js — Fase 14, Parte 8/9: CAMPAIGNS (crear) + CAMPAIGN
// OVERVIEW. Distinto de dashboard/server/routes/library.js#handleCampaigns
// (esa es la cadena real CreativeCell -> ProductionArtifact ->
// VisualProductionPackage de Creative Intelligence, sin tocar). Esta es la
// agrupación comercial/planificación nueva (content-planning/src/campaign.js)
// -- solo metadata, nunca genera ni publica nada por sí misma.
//
// CAMPAIGN OVERVIEW: correlaciona ContentPlan/ScheduledPublication reales
// por producto (nombreComercial real, vía productCatalog) + plataforma +
// rango de fechas [startDate, endDate] -- una heurística real y explícita
// (no existe una foreign key real "campaignId" en ContentPlan), nunca un
// dato inventado. Si no hay coincidencias, los contadores son 0 reales, no
// simulados.

import { sendJson, badRequest, notFound, readJsonBody } from '../lib/http.js';
import { createCampaign, CAMPAIGN_PLATFORMS, CAMPAIGN_FREQUENCIES } from '../../../content-planning/src/campaign.js';
import * as campaignStore from '../../../content-planning/src/campaignStore.js';
import { getProduct } from '../lib/productCatalog.js';
import { performanceLearningStore } from '../../../content-strategy/src/performanceLearningStoreInstance.js';
import { listContentPlans } from '../../../content-planning/src/contentPlanningService.js';
import * as scheduledPublicationStore from '../../../publishing-scheduler/src/scheduledPublicationStore.js';

export async function handleListMarketingCampaigns(req, res) {
  sendJson(res, 200, campaignStore.list());
}

export async function handleCreateMarketingCampaign(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  if (body.productId && !getProduct(body.productId)) {
    badRequest(res, `CAMPAIGNS: "productId" debe ser un producto real ya registrado (recibido: "${body.productId}").`);
    return;
  }
  try {
    const campaign = createCampaign(body);
    campaignStore.save(campaign);
    sendJson(res, 200, campaign);
  } catch (err) {
    badRequest(res, err.message);
  }
}

/** GET /api/marketing-campaigns/:id -- detalle + CAMPAIGN OVERVIEW real (Parte 9). */
export async function handleGetMarketingCampaign(req, res, id) {
  const campaign = campaignStore.get(id);
  if (!campaign) { notFound(res, `No existe ninguna campaña con id "${id}".`); return; }

  const product = getProduct(campaign.productId);
  const productName = product?.nombreComercial ?? null;
  const productNameVisible = product?.nombreVisible ?? productName;

  const rangeStart = new Date(campaign.startDate);
  const rangeEnd = new Date(new Date(campaign.endDate).getTime() + 24 * 60 * 60 * 1000); // fin de día real del endDate

  const allPlans = listContentPlans({ store: performanceLearningStore, platform: campaign.platform });
  const correlatedPlans = allPlans.filter((p) => {
    if (productName && p.product !== productName) return false;
    const created = new Date(p.createdAt);
    return created >= rangeStart && created < rangeEnd;
  });

  let published = 0, pending = 0, failed = 0;
  const contentPlansWithStatus = [];
  for (const plan of correlatedPlans) {
    const schedule = plan.publicationId ? scheduledPublicationStore.get(plan.publicationId) : null;
    const effectiveStatus = schedule?.status ?? plan.status;
    if (effectiveStatus === 'PUBLISHED') published += 1;
    else if (['FAILED', 'RENDER_FAILED', 'QUALITY_FAILED', 'FAILED_GENERATION', 'MEDIA_HOSTING_FAILED', 'PUBLISH_FAILED', 'CANCELLED'].includes(effectiveStatus)) failed += 1;
    else pending += 1;
    contentPlansWithStatus.push({ ...plan, effectiveStatus });
  }

  sendJson(res, 200, {
    campaign,
    overview: {
      objective: campaign.objective,
      productId: campaign.productId,
      productName: productNameVisible,
      platforms: [campaign.platform],
      planned: correlatedPlans.length,
      published, pending, failed,
      correlationMethod: 'ContentPlan.product === productName real && ContentPlan.platform === campaign.platform && createdAt dentro de [startDate, endDate] -- heurística real, sin foreign key propia todavía.',
      contentPlans: contentPlansWithStatus,
    },
  });
}

/**
 * DELETE (POST /api/marketing-campaigns/:id/delete) — elimina una campaña
 * real (2026-08-26). Bloquea si tiene contenido/publicaciones correlacionados
 * (misma heurística real ya usada en el overview) -- nunca borra contenido
 * compartido. Las campañas de prueba sin dependencias se eliminan sin más.
 */
export async function handleDeleteMarketingCampaign(req, res, id) {
  const campaign = campaignStore.get(id);
  if (!campaign) { notFound(res, `No existe ninguna campaña con id "${id}".`); return; }

  const product = getProduct(campaign.productId);
  const productName = product?.nombreComercial ?? null;
  const rangeStart = new Date(campaign.startDate);
  const rangeEnd = new Date(new Date(campaign.endDate).getTime() + 24 * 60 * 60 * 1000);
  const allPlans = listContentPlans({ store: performanceLearningStore, platform: campaign.platform });
  const correlatedPlans = allPlans.filter((p) => {
    if (productName && p.product !== productName) return false;
    const created = new Date(p.createdAt);
    return created >= rangeStart && created < rangeEnd;
  });

  if (correlatedPlans.length > 0) {
    sendJson(res, 409, {
      deleted: false,
      error: 'No se puede eliminar esta campaña porque tiene contenido asociado.',
      contentPlanCount: correlatedPlans.length,
    });
    return;
  }

  campaignStore.del(id);
  sendJson(res, 200, { deleted: true });
}

export { CAMPAIGN_PLATFORMS, CAMPAIGN_FREQUENCIES };
