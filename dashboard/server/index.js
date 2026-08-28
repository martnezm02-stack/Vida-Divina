#!/usr/bin/env node
// index.js — Operation Dashboard, servidor HTTP local. node:http puro,
// cero dependencias (mismo criterio que whatsapp-adapter/src/httpServer.js).
//
// Capas, sin duplicar ninguna:
//   Dashboard (public/*.html/css/js)
//     -> esta capa de API (server/routes/*.js)
//     -> Content Generation Engine real (content-orchestrator/src/contentGenerationEngine.js)
//     -> Creative Intelligence / HyperFrames / Voice Engine / PostProduction reales
//
// Uso: PORT=4310 node server/index.js  (puerto por defecto: 4310)

import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendJson, notFound, serverError } from './lib/http.js';
import { handleProducts, handleProduct, handleAssets, handleDeleteAsset, handleCampaigns, handleOutputProfiles, handleOperations, handleAudioAssets, handlePreviewInfo } from './routes/library.js';
import { handleCreate, handleEdit, handleAdapt, handleProposeCreative, handleProposeDirectCreative, handleSuggestHypothesisVariants, handleListHypothesisBatches, handleVideoScript, handleProposeCarousel, handleCreateCarousel, handlePublishTargets, handlePublish, handleProduceCreative, handleModelRecommendation, handleStructureRecommendation } from './routes/generation.js';
import { handleMedia } from './routes/media.js';
import { handlePerformanceList, handlePerformanceAnalysis } from './routes/performance.js';
import { handleAttributionList, handleAttributionSummary } from './routes/attribution.js';
import { handleIntelligenceList, handleIntelligenceSummary } from './routes/intelligence.js';
import { handleLearningList, handleLearningSummary, handleStrategyFeedbackList } from './routes/learning.js';
import { handleStrategyDecisionsList, handleStrategyDecisionsSummary } from './routes/strategyDecisions.js';
import { handleContentPlansList, handleContentPlanGet } from './routes/contentPlans.js';
import { handleSystemStatus } from './routes/systemStatus.js';
import { handleListMarketingCampaigns, handleCreateMarketingCampaign, handleGetMarketingCampaign, handleDeleteMarketingCampaign } from './routes/marketingCampaigns.js';
import { handleListWhatsappConversations, handleGetWhatsappConversation, handleSendWhatsappMessage, handleWhatsappStatus } from './routes/whatsapp.js';
import { handleGenerateContentPlan } from './routes/campaignPilot.js';
import { handleAnalyzeReference, handleListReferenceAnalyses, handleProposeReferenceAdaptation } from './routes/referenceAdaptation.js';
import { handleGetAutoPublish, handleGetAutoPublishHistory, handleEnableAutoPublish, handleDisableAutoPublish } from './routes/autoPublish.js';
import {
  handleCreateProject, handleGetProject, handleListProjectsForCreative, handleEditProject, handleRenderProject, handleMusicLibrary,
  handleRegenerateSceneVoice, handleCaptionStyleOptions,
} from './routes/projects.js';
import {
  handleListSchedules, handleGetSchedule, handleCreateSchedule, handleApproveSchedule,
  handleProgramSchedule, handleCancelSchedule, handleRunSchedulerNow, handleMediaHostingStatus,
} from './routes/scheduling.js';
import { publishingScheduler } from './lib/schedulerInstance.js';
import { loadIntegrationEnv } from './lib/integrationEnv.js';

// Solo las claves de integración reales que este servidor consume (ver
// integrationEnv.js) -- nunca el .env completo de otro servicio, para que su
// configuración de infraestructura (ej. su propio PORT) no se propague aquí.
loadIntegrationEnv({
  path: fileURLToPath(new URL('../../crm/.env', import.meta.url)),
  keys: ['DATABASE_URL', 'CRM_DB_POOL_MAX', 'CRM_DB_SSL', 'CRM_DB_IDLE_TIMEOUT_MS', 'CRM_DB_CONNECTION_TIMEOUT_MS'],
});
loadIntegrationEnv({
  path: fileURLToPath(new URL('../../whatsapp-adapter/.env', import.meta.url)),
  keys: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_GRAPH_API_VERSION'],
});

const PORT = process.env.PORT !== undefined ? Number(process.env.PORT) : 4310; // "0" -> puerto efímero real (usado por los tests); "" || 4310 se comía el 0 por ser falsy en JS.
const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));
// Intervalo real del PublishingScheduler -- corre como componente del
// backend, nunca depende de una sesión interactiva ni de Claude abierto
// (encargo §2). DASHBOARD_NO_SCHEDULER=1 lo desactiva (tests, mismo
// criterio que DASHBOARD_NO_LISTEN).
const SCHEDULER_INTERVAL_MS = Number(process.env.SCHEDULER_INTERVAL_MS) || 60000;

const STATIC_CONTENT_TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function serveStatic(req, res, pathname) {
  const rutaRelativa = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const full = join(PUBLIC_DIR, rutaRelativa);
  // Nunca sale de PUBLIC_DIR (sin ".." real): join ya normaliza, se verifica el prefijo.
  if (!full.startsWith(PUBLIC_DIR) || !existsSync(full) || !statSync(full).isFile()) { notFound(res, 'Página no encontrada.'); return; }
  const contentType = STATIC_CONTENT_TYPES[extname(full)] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  createReadStream(full).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  try {
    if (pathname.startsWith('/media/')) { await handleMedia(req, res, pathname); return; }

    if (pathname === '/api/products' && req.method === 'GET') { await handleProducts(req, res); return; }
    const productMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
    if (productMatch && req.method === 'GET') { await handleProduct(req, res, productMatch[1]); return; }
    if (pathname === '/api/assets' && req.method === 'GET') { await handleAssets(req, res); return; }
    if (pathname === '/api/assets/delete' && req.method === 'POST') { await handleDeleteAsset(req, res); return; }
    if (pathname === '/api/campaigns' && req.method === 'GET') { await handleCampaigns(req, res); return; }
    if (pathname === '/api/output-profiles' && req.method === 'GET') { await handleOutputProfiles(req, res); return; }
    if (pathname === '/api/operations' && req.method === 'GET') { await handleOperations(req, res); return; }
    if (pathname === '/api/audio-assets' && req.method === 'GET') { await handleAudioAssets(req, res); return; }
    if (pathname === '/api/preview-info' && req.method === 'GET') { await handlePreviewInfo(req, res, url); return; }

    if (pathname === '/api/create' && req.method === 'POST') { await handleCreate(req, res); return; }
    if (pathname === '/api/edit' && req.method === 'POST') { await handleEdit(req, res); return; }
    if (pathname === '/api/adapt' && req.method === 'POST') { await handleAdapt(req, res); return; }

    if (pathname === '/api/create/propose' && req.method === 'POST') { await handleProposeCreative(req, res); return; }
    if (pathname === '/api/create/propose-direct' && req.method === 'POST') { await handleProposeDirectCreative(req, res); return; }
    if (pathname === '/api/create/suggest-hypothesis' && req.method === 'POST') { await handleSuggestHypothesisVariants(req, res); return; }
    if (pathname === '/api/create/hypothesis-batches' && req.method === 'GET') { await handleListHypothesisBatches(req, res, url); return; }
    if (pathname === '/api/create/model-recommendation' && req.method === 'GET') { await handleModelRecommendation(req, res, url); return; }
    if (pathname === '/api/create/structure-recommendation' && req.method === 'GET') { await handleStructureRecommendation(req, res, url); return; }
    if (pathname === '/api/create/produce' && req.method === 'POST') { await handleProduceCreative(req, res); return; }
    if (pathname === '/api/video-script' && req.method === 'POST') { await handleVideoScript(req, res); return; }
    if (pathname === '/api/carousel/propose' && req.method === 'POST') { await handleProposeCarousel(req, res); return; }
    if (pathname === '/api/carousel' && req.method === 'POST') { await handleCreateCarousel(req, res); return; }
    if (pathname === '/api/publish/targets' && req.method === 'GET') { await handlePublishTargets(req, res); return; }
    if (pathname === '/api/publish' && req.method === 'POST') { await handlePublish(req, res); return; }

    // ADAPTAR CONTENIDO -- Video de referencia (2026-08-26)
    if (pathname === '/api/adapt/reference/analyze' && req.method === 'POST') { await handleAnalyzeReference(req, res); return; }
    if (pathname === '/api/adapt/reference/analyses' && req.method === 'GET') { await handleListReferenceAnalyses(req, res); return; }
    if (pathname === '/api/adapt/reference/propose' && req.method === 'POST') { await handleProposeReferenceAdaptation(req, res); return; }

    // EDITABLE VIDEO PROJECT (2026-08-24) -- un ProductionJob real ya
    // producido se convierte en un proyecto editable persistente.
    if (pathname === '/api/projects' && req.method === 'POST') { await handleCreateProject(req, res); return; }
    if (pathname === '/api/projects' && req.method === 'GET') { await handleListProjectsForCreative(req, res, url); return; }
    if (pathname === '/api/music-library' && req.method === 'GET') { await handleMusicLibrary(req, res); return; }
    if (pathname === '/api/caption-style-options' && req.method === 'GET') { await handleCaptionStyleOptions(req, res); return; }
    const projectIdMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (projectIdMatch && req.method === 'GET') { await handleGetProject(req, res, projectIdMatch[1]); return; }
    const projectEditMatch = pathname.match(/^\/api\/projects\/([^/]+)\/edit$/);
    if (projectEditMatch && req.method === 'POST') { await handleEditProject(req, res, projectEditMatch[1]); return; }
    const projectRenderMatch = pathname.match(/^\/api\/projects\/([^/]+)\/render$/);
    if (projectRenderMatch && req.method === 'POST') { await handleRenderProject(req, res, projectRenderMatch[1]); return; }
    // Fix Editor Hook/Voiceover/Captions (2026-08-25), Problema 4.
    const projectRegenerateVoiceMatch = pathname.match(/^\/api\/projects\/([^/]+)\/scenes\/([^/]+)\/regenerate-voice$/);
    if (projectRegenerateVoiceMatch && req.method === 'POST') { await handleRegenerateSceneVoice(req, res, projectRegenerateVoiceMatch[1], projectRegenerateVoiceMatch[2]); return; }

    // PERFORMANCE INTELLIGENCE (Fase 6 -- lectura mínima, solo lectura)
    if (pathname === '/api/performance' && req.method === 'GET') { await handlePerformanceList(req, res); return; }
    if (pathname === '/api/performance/analysis' && req.method === 'GET') { await handlePerformanceAnalysis(req, res, url); return; }

    // ATTRIBUTION ENGINE (Fase 14 -- solo lectura)
    if (pathname === '/api/attribution' && req.method === 'GET') { await handleAttributionList(req, res, url); return; }
    if (pathname === '/api/attribution/summary' && req.method === 'GET') { await handleAttributionSummary(req, res, url); return; }

    // MARKETING INTELLIGENCE ENGINE (Fase 16 -- solo lectura)
    if (pathname === '/api/intelligence' && req.method === 'GET') { await handleIntelligenceList(req, res, url); return; }
    if (pathname === '/api/intelligence/summary' && req.method === 'GET') { await handleIntelligenceSummary(req, res, url); return; }

    // LEARNING & STRATEGY FEEDBACK ENGINE (Fase 18 -- solo lectura)
    if (pathname === '/api/learning' && req.method === 'GET') { await handleLearningList(req, res, url); return; }
    if (pathname === '/api/learning/summary' && req.method === 'GET') { await handleLearningSummary(req, res, url); return; }
    if (pathname === '/api/strategy-feedback' && req.method === 'GET') { await handleStrategyFeedbackList(req, res, url); return; }

    // STRATEGY DECISION ENGINE (Fase 22 -- solo lectura, sin endpoint de ejecución)
    if (pathname === '/api/strategy-decisions' && req.method === 'GET') { await handleStrategyDecisionsList(req, res, url); return; }
    if (pathname === '/api/strategy-decisions/summary' && req.method === 'GET') { await handleStrategyDecisionsSummary(req, res, url); return; }

    // CONTENT PLANNING & EXECUTION (Fase 22/23 -- solo lectura, sin endpoint de ejecución)
    if (pathname === '/api/content-plans' && req.method === 'GET') { await handleContentPlansList(req, res, url); return; }
    const contentPlanIdMatch = pathname.match(/^\/api\/content-plans\/([^/]+)$/);
    if (contentPlanIdMatch && req.method === 'GET') { await handleContentPlanGet(req, res, contentPlanIdMatch[1]); return; }

    // CAMPAIGN PILOT (Fase 16 -- única vía real para crear un ContentPlan desde el Dashboard; AUTO_PUBLISH rechazado explícitamente aquí)
    if (pathname === '/api/content-plans/generate' && req.method === 'POST') { await handleGenerateContentPlan(req, res); return; }

    // AUTO-PUBLISH POLICY (Fase 13 -- única fuente de verdad, nunca publica al cambiar)
    if (pathname === '/api/auto-publish' && req.method === 'GET') { await handleGetAutoPublish(req, res); return; }
    if (pathname === '/api/auto-publish/history' && req.method === 'GET') { await handleGetAutoPublishHistory(req, res); return; }
    if (pathname === '/api/auto-publish/enable' && req.method === 'POST') { await handleEnableAutoPublish(req, res); return; }
    if (pathname === '/api/auto-publish/disable' && req.method === 'POST') { await handleDisableAutoPublish(req, res); return; }

    // CALENDARIO (Media Hosting + Publishing Scheduler)
    if (pathname === '/api/media-hosting/status' && req.method === 'GET') { await handleMediaHostingStatus(req, res); return; }
    if (pathname === '/api/schedule' && req.method === 'GET') { await handleListSchedules(req, res); return; }
    if (pathname === '/api/schedule' && req.method === 'POST') { await handleCreateSchedule(req, res); return; }
    if (pathname === '/api/schedule/run-now' && req.method === 'POST') { await handleRunSchedulerNow(req, res); return; }
    const scheduleIdMatch = pathname.match(/^\/api\/schedule\/([^/]+)$/);
    if (scheduleIdMatch && req.method === 'GET') { await handleGetSchedule(req, res, scheduleIdMatch[1]); return; }
    const approveMatch = pathname.match(/^\/api\/schedule\/([^/]+)\/approve$/);
    if (approveMatch && req.method === 'POST') { await handleApproveSchedule(req, res, approveMatch[1]); return; }
    const programMatch = pathname.match(/^\/api\/schedule\/([^/]+)\/program$/);
    if (programMatch && req.method === 'POST') { await handleProgramSchedule(req, res, programMatch[1]); return; }
    const cancelMatch = pathname.match(/^\/api\/schedule\/([^/]+)\/cancel$/);
    if (cancelMatch && req.method === 'POST') { await handleCancelSchedule(req, res, cancelMatch[1]); return; }

    // VIDA DIVINA COMMAND CENTER (Fase 14 -- solo lectura, agrega estado ya real)
    if (pathname === '/api/system-status' && req.method === 'GET') { await handleSystemStatus(req, res); return; }

    // MARKETING CAMPAIGNS (Fase 14, Parte 8/9 -- metadata + overview, nunca genera ni publica)
    if (pathname === '/api/marketing-campaigns' && req.method === 'GET') { await handleListMarketingCampaigns(req, res); return; }
    if (pathname === '/api/marketing-campaigns' && req.method === 'POST') { await handleCreateMarketingCampaign(req, res); return; }
    const marketingCampaignIdMatch = pathname.match(/^\/api\/marketing-campaigns\/([^/]+)$/);
    if (marketingCampaignIdMatch && req.method === 'GET') { await handleGetMarketingCampaign(req, res, marketingCampaignIdMatch[1]); return; }
    const marketingCampaignDeleteMatch = pathname.match(/^\/api\/marketing-campaigns\/([^/]+)\/delete$/);
    if (marketingCampaignDeleteMatch && req.method === 'POST') { await handleDeleteMarketingCampaign(req, res, marketingCampaignDeleteMatch[1]); return; }

    // WHATSAPP CONSOLE (Fase 15 -- reutiliza crm/ real + whatsapp-adapter/ real, nunca un segundo cliente)
    if (pathname === '/api/whatsapp/status' && req.method === 'GET') { await handleWhatsappStatus(req, res); return; }
    if (pathname === '/api/whatsapp/conversations' && req.method === 'GET') { await handleListWhatsappConversations(req, res, url); return; }
    const waConvMatch = pathname.match(/^\/api\/whatsapp\/conversations\/([^/]+)$/);
    if (waConvMatch && req.method === 'GET') { await handleGetWhatsappConversation(req, res, waConvMatch[1]); return; }
    const waSendMatch = pathname.match(/^\/api\/whatsapp\/conversations\/([^/]+)\/send$/);
    if (waSendMatch && req.method === 'POST') { await handleSendWhatsappMessage(req, res, waSendMatch[1]); return; }

    if (pathname === '/api/health') { sendJson(res, 200, { status: 'ok' }); return; }

    if (pathname.startsWith('/api/')) { notFound(res, 'Endpoint no reconocido.'); return; }

    serveStatic(req, res, pathname);
  } catch (err) {
    serverError(res, err);
  }
});

if (process.env.DASHBOARD_NO_LISTEN !== '1') {
  server.listen(PORT, () => {
    console.log(`Vida Divina Creative Studio — dashboard local corriendo en http://localhost:${PORT}`);
  });
}

let schedulerTimer = null;
if (process.env.DASHBOARD_NO_SCHEDULER !== '1') {
  schedulerTimer = setInterval(() => {
    publishingScheduler.runDuePublications().catch((err) => console.error('PublishingScheduler.runDuePublications falló:', err.message));
  }, SCHEDULER_INTERVAL_MS);
  schedulerTimer.unref?.(); // nunca mantiene el proceso vivo solo por este intervalo (mismo criterio que timers de test/servidores efímeros)
}

export { server, schedulerTimer };
