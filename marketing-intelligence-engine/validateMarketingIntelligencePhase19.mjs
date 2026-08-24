#!/usr/bin/env node
// validateMarketingIntelligencePhase19.mjs — Marketing Intelligence Engine,
// Fase 19 (validación real controlada). Usa exclusivamente el
// performanceLearningStore real de producción (published_content,
// performance_observation, attribution_record ya generados en fases
// anteriores) -- NUNCA publica, NUNCA modifica publicaciones, NUNCA genera
// leads/ventas, NUNCA inventa revenue. Solo lee y persiste MarketingInsight
// derivados (idempotente).
//
// Uso (desde marketing-intelligence-engine/): node validateMarketingIntelligencePhase19.mjs

import { performanceLearningStore } from '../content-strategy/src/performanceLearningStoreInstance.js';
import { generateAndPersistMarketingIntelligence } from './src/marketingIntelligenceService.js';

const REAL_IDS = { instagram: '18376003507235391', facebook: '122109854133422530' };

function main() {
  const publications = performanceLearningStore.loadAll('published_content');
  console.log(`PublishedContent reales en el store: ${publications.length}`);
  for (const [platform, externalId] of Object.entries(REAL_IDS)) {
    const match = publications.find((p) => p.platform === platform && p.external_post_id === externalId);
    console.log(`  ${platform} ${externalId}: ${match ? `encontrado (content_id=${match.content_id})` : 'NO encontrado en published_content'}`);
  }

  const attributionRecords = performanceLearningStore.loadAll('attribution_record');
  console.log(`AttributionRecord reales en el store: ${attributionRecords.length} (no-UNKNOWN: ${attributionRecords.filter((r) => r.attributionType !== 'UNKNOWN').length})`);

  if (publications.length === 0) {
    console.log('\nINSUFFICIENT_DATA: no hay PublishedContent registrado -- resultado válido, no se fabrica nada.');
    return;
  }

  const result = generateAndPersistMarketingIntelligence({ store: performanceLearningStore });
  console.log(`\n=== Marketing Intelligence Engine === status=${result.status}`);
  if (result.status !== 'OK') { console.log(`reason: ${result.reason}`); return; }

  console.log(`Insights generados en esta corrida: ${result.insights.length} (nuevos: ${result.saved.length}, ya existentes: ${result.skipped.length})`);
  console.log(`Data Quality Signals: ${result.dataQualitySignals.length}`);
  console.log(`Por categoría: ${JSON.stringify(result.summary.byCategory)}`);
  console.log(`Por confidence: ${JSON.stringify(result.summary.byConfidence)}`);

  console.log('\n=== Data Quality Signals (por qué NO se generó un insight, cuando aplica) ===');
  for (const s of result.dataQualitySignals) console.log(`  [${s.reason}] ${s.category}${s.scope ? ` · ${s.scope}` : ''}${s.platform ? ` · ${s.platform}` : ''} — ${s.explanation}`);

  console.log('\n=== Insights persistidos (muestra) ===');
  for (const i of result.insights.slice(0, 10)) {
    console.log(`  [${i.category}/${i.insightType}] ${i.scope} · confidence=${i.confidence} · evidenceCount=${i.evidenceCount}`);
    console.log(`    ${i.summary}`);
  }

  const totalPersisted = performanceLearningStore.loadAll('marketing_insight').length;
  console.log(`\nTotal marketing_insight persistidos en el store (histórico, incluye corridas previas): ${totalPersisted}`);
}

main();
