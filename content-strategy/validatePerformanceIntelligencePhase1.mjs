#!/usr/bin/env node
// validatePerformanceIntelligencePhase1.mjs — Performance Intelligence,
// Fase 10 (validación real controlada). Backfillea (si hace falta, §7) y
// recolecta métricas reales SOLO para los dos posts reales ya conocidos —
// nunca escanea ni descubre publicaciones, nunca publica ni modifica nada
// remoto, nunca republica. Usa el store de producción real
// (content-strategy/src/performanceLearningStoreInstance.js) — el mismo
// que lee dashboard/server/routes/performance.js.
//
// Uso (desde content-strategy/): node --env-file=.env validatePerformanceIntelligencePhase1.mjs
// (FACEBOOK_PAGE_ID/FACEBOOK_PAGE_ACCESS_TOKEN/FACEBOOK_GRAPH_API_VERSION ya
// están en el entorno persistente del sistema -- no hace falta un .env para
// esos tres.)

import { backfillPublishedContentFromExternalId } from './src/backfillPublishedContent.js';
import { collectPerformanceForPublishedContent } from './src/performanceCollectionService.js';
import { performanceLearningStore } from './src/performanceLearningStoreInstance.js';
import { NOT_AVAILABLE } from '../performance-learning-intelligence/src/performanceObservation.js';

const TARGETS = [
  { platform: 'instagram', externalPostId: '18376003507235391' },
  { platform: 'facebook', externalPostId: '122109854133422530' },
];

async function runOne({ platform, externalPostId }) {
  console.log(`\n=== ${platform.toUpperCase()} — ${externalPostId} ===`);

  const backfill = await backfillPublishedContentFromExternalId({ platform, externalPostId, store: performanceLearningStore });
  console.log(`Backfill: ${backfill.status}`);
  if (backfill.status === 'ERROR') { console.log(`  error: ${backfill.error}`); return; }

  const publishedContent = backfill.publishedContent;
  console.log(`  content_id: ${publishedContent.content_id}`);
  console.log(`  published_at: ${publishedContent.published_at}`);

  const collection = await collectPerformanceForPublishedContent({ publishedContent, store: performanceLearningStore });
  console.log(`Colección: ${collection.status}`);
  if (collection.status !== 'COLLECTED') { console.log(`  error: ${collection.error}`); return; }

  for (const obs of collection.saved) {
    console.log(`  [NUEVO] ${obs.metric} = ${obs.value === NOT_AVAILABLE ? 'NOT_AVAILABLE' : obs.value}`);
  }
  for (const skip of collection.skipped) {
    console.log(`  [YA COLECTADO HOY] ${skip.metric}`);
  }
}

async function main() {
  for (const target of TARGETS) await runOne(target);
  console.log('\n=== FIN — ninguna credencial fue impresa arriba, ningún post fue modificado ni republicado ===');
}

main().catch((error) => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
