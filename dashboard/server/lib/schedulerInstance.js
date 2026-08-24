// schedulerInstance.js — única instancia real del PublishingScheduler que
// usa el servidor del dashboard. Conecta, sin reimplementar ninguno:
//   - media-hosting/src/mediaHostingService.js (provider "r2" real -- sin
//     credenciales configuradas, CONFIGURATION_REQUIRED explícito);
//   - content-orchestrator/src/publishing/publishingService.js#publish
//     (MetaAdapter/FacebookAdapter reales, ya existentes).
// Un solo punto de importación para server/index.js (el tick periódico) y
// server/routes/scheduling.js (las acciones del dashboard).

import { MediaHostingService } from '../../../media-hosting/src/mediaHostingService.js';
import { PublishingScheduler } from '../../../publishing-scheduler/src/publishingScheduler.js';
import { publish } from '../../../content-orchestrator/src/publishing/publishingService.js';

export const mediaHostingService = new MediaHostingService();
export const publishingScheduler = new PublishingScheduler({ mediaHostingService, publish });
