// systemStatus.js — VIDA DIVINA COMMAND CENTER (Fase 14, Parte 2). Solo
// lectura: agrega el estado real ya expuesto por endpoints existentes
// (Voice Engine, Publish Targets, Media Hosting, Auto Publish, Performance)
// en una sola respuesta para el Home -- no reimplementa ninguna
// verificación, solo las reutiliza y las junta.

import { sendJson } from '../lib/http.js';
import { isVoiceEngineReachable } from '../lib/voiceEngineClient.js';
import { mediaHostingService } from '../lib/schedulerInstance.js';
import { listPublishTargets } from '../../../content-orchestrator/src/publishing/publishingService.js';
import { performanceLearningStore } from '../../../content-strategy/src/performanceLearningStoreInstance.js';
import { getCurrentAutoPublishConfig } from '../../../content-planning/src/autoPublishConfig.js';
import { computeAutoPublishReadiness } from '../../../content-planning/src/autoPublishReadiness.js';

/** GET /api/system-status -- resumen real para VIDA DIVINA COMMAND CENTER (Home). */
export async function handleSystemStatus(req, res) {
  const [voiceEngineReachable, targets] = await Promise.all([
    isVoiceEngineReachable(),
    Promise.resolve(listPublishTargets()),
  ]);

  const targetByPlatform = Object.fromEntries(targets.map((t) => [t.platform, t.configured]));
  const publishedCount = performanceLearningStore.loadAll('published_content').length;
  const observationCount = performanceLearningStore.loadAll('performance_observation').length;

  const config = getCurrentAutoPublishConfig({ store: performanceLearningStore });
  const readiness = computeAutoPublishReadiness({ store: performanceLearningStore });

  sendJson(res, 200, {
    contentGeneration: { status: 'OPERATIONAL', voiceEngineReachable },
    publishing: {
      instagram: { configured: targetByPlatform.INSTAGRAM ?? false },
      facebook: { configured: targetByPlatform.FACEBOOK ?? false },
      whatsapp: { configured: targetByPlatform.WHATSAPP ?? false },
      mediaHosting: { configured: mediaHostingService.isConfigured() },
    },
    performance: { publishedCount, observationCount, hasData: publishedCount > 0 },
    autoPublish: { enabled: config.enabled, actorId: config.actorId, readiness: readiness.readiness, reasons: readiness.reasons },
  });
}
