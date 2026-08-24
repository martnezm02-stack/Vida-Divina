// campaign.js — Marketing Campaign (Fase 14, Parte 8/9). Contrato mínimo
// pedido por el encargo: nombre, objetivo, producto, plataforma, fecha
// inicial/final, número objetivo de contenidos, frecuencia, execution mode.
//
// DESVIACIÓN DOCUMENTADA: esta entidad es nueva -- no existía ningún
// "Campaign" con estos campos en el proyecto (grep real sobre crm/ y
// content-planning/ antes de crearla). No duplica el "campaign" ya
// existente en dashboard/server/routes/library.js#handleCampaigns (ese es
// CreativeCell -> ProductionArtifact -> VisualProductionPackage, la cadena
// real de producción de Creative Intelligence; esta es la agrupación
// comercial/planificación que pide el encargo, con nombre y fechas
// propios). Es deliberadamente solo METADATA + agrupación: NUNCA genera
// contenido ni agenda publicaciones por sí misma (eso sería duplicar
// content-planning/src/contentPlanningService.js y publishing-scheduler/,
// prohibido explícitamente por el encargo -- "NO crear otro Strategy
// Engine"). El "CAMPAIGN OVERVIEW" (contentPlans.js#buildCampaignOverview)
// correlaciona ContentPlan/ScheduledPublication reales por
// producto+plataforma+rango de fechas -- una heurística real y explícita,
// nunca un dato inventado.

import { randomUUID } from 'node:crypto';

export const CAMPAIGN_EXECUTION_MODES = Object.freeze(['PREPARE_ONLY', 'HUMAN_REVIEW', 'AUTO_PUBLISH']);
export const CAMPAIGN_PLATFORMS = Object.freeze(['INSTAGRAM_REEL', 'FACEBOOK_REEL', 'WHATSAPP_VIDEO', 'WHATSAPP']);
export const CAMPAIGN_FREQUENCIES = Object.freeze(['DAILY', 'EVERY_2_DAYS', 'WEEKLY', 'BIWEEKLY']);

/**
 * @param {{name:string, objective:string, productId:string, platform:string,
 *   startDate:string, endDate:string, targetContentCount:number,
 *   frequency:string, executionMode?:string}} fields
 */
export function createCampaign(fields) {
  const {
    name, objective, productId, platform, startDate, endDate,
    targetContentCount, frequency, executionMode = 'PREPARE_ONLY',
  } = fields ?? {};

  if (!name?.trim()) throw new Error('Campaign: "name" es obligatorio.');
  if (!objective?.trim()) throw new Error('Campaign: "objective" es obligatorio.');
  if (!productId?.trim()) throw new Error('Campaign: "productId" es obligatorio -- no se inventa un producto.');
  if (!CAMPAIGN_PLATFORMS.includes(platform)) throw new Error(`Campaign: "platform" inválida "${platform}" (válidas: ${CAMPAIGN_PLATFORMS.join(', ')}).`);
  if (!startDate || Number.isNaN(Date.parse(startDate))) throw new Error('Campaign: "startDate" debe ser una fecha ISO real.');
  if (!endDate || Number.isNaN(Date.parse(endDate))) throw new Error('Campaign: "endDate" debe ser una fecha ISO real.');
  if (new Date(endDate) < new Date(startDate)) throw new Error('Campaign: "endDate" no puede ser anterior a "startDate".');
  if (!Number.isInteger(targetContentCount) || targetContentCount < 1) throw new Error('Campaign: "targetContentCount" debe ser un entero >= 1.');
  if (!CAMPAIGN_FREQUENCIES.includes(frequency)) throw new Error(`Campaign: "frequency" inválida "${frequency}" (válidas: ${CAMPAIGN_FREQUENCIES.join(', ')}).`);
  if (!CAMPAIGN_EXECUTION_MODES.includes(executionMode)) throw new Error(`Campaign: "executionMode" inválido "${executionMode}" (válidos: ${CAMPAIGN_EXECUTION_MODES.join(', ')}).`);

  const now = new Date().toISOString();
  return Object.freeze({
    id: randomUUID(),
    name: name.trim(),
    objective: objective.trim(),
    productId: productId.trim(),
    platform,
    startDate,
    endDate,
    targetContentCount,
    frequency,
    executionMode,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
}
