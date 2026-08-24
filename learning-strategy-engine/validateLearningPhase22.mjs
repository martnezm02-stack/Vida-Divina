#!/usr/bin/env node
// validateLearningPhase22.mjs — Learning & Strategy Feedback Engine, Fase 22
// (validación real controlada). Usa exclusivamente el performanceLearningStore
// real de producción (marketing_insight/attribution_record ya generados en
// fases anteriores) -- NUNCA publica, NUNCA crea leads/ventas, NUNCA
// modifica CRM/WhatsApp/Meta. Solo lee y persiste LearningRecord/
// StrategyFeedback derivados (idempotente).
//
// Uso (desde learning-strategy-engine/): node validateLearningPhase22.mjs

import { performanceLearningStore } from '../content-strategy/src/performanceLearningStoreInstance.js';
import { generateAndPersistLearning } from './src/learningService.js';

function main() {
  const marketingInsights = performanceLearningStore.loadAll('marketing_insight');
  const attributionRecords = performanceLearningStore.loadAll('attribution_record');
  const nonUnknownAttribution = attributionRecords.filter((r) => r.attributionType !== 'UNKNOWN');
  console.log(`MarketingInsight reales en el store: ${marketingInsights.length}`);
  console.log(`AttributionRecord reales en el store: ${attributionRecords.length} (no-UNKNOWN: ${nonUnknownAttribution.length})`);
  if (nonUnknownAttribution.length === 0) {
    console.log('Atribución real actual: todas UNKNOWN -- se espera INSUFFICIENT_COMMERCIAL_DATA (ningún COMMERCIAL_LEARNING fabricado).');
  }

  const result = generateAndPersistLearning({ store: performanceLearningStore });
  console.log(`\n=== Learning & Strategy Feedback Engine === status=${result.status}`);
  if (result.status !== 'OK') { console.log(`reason: ${result.reason}`); return; }

  console.log(`LearningRecord generados en esta corrida: ${result.learningRecords.length} (nuevos: ${result.savedLearning.length}, ya existentes: ${result.skippedLearning.length})`);
  console.log(`StrategyFeedback generados en esta corrida: ${result.strategyFeedback.length} (nuevos: ${result.savedFeedback.length}, ya existentes: ${result.skippedFeedback.length})`);
  console.log(`Por learningType: ${JSON.stringify(result.summary.byLearningType)}`);
  console.log(`Por confidence: ${JSON.stringify(result.summary.byConfidence)}`);

  const commercialLearnings = result.learningRecords.filter((r) => r.learningType === 'COMMERCIAL_LEARNING');
  console.log(`\nCOMMERCIAL_LEARNING generados: ${commercialLearnings.length} ${commercialLearnings.length === 0 ? '(esperado -- INSUFFICIENT_COMMERCIAL_DATA, atribución real es toda UNKNOWN, nunca se fabricó)' : '(con evidencia real de atribución no-UNKNOWN)'}`);

  const dataQuality = result.learningRecords.filter((r) => r.learningType === 'DATA_QUALITY_LEARNING');
  console.log(`\n=== DATA_QUALITY_LEARNING (por qué NO hay aprendizaje accionable en ese scope) ===`);
  for (const dq of dataQuality) console.log(`  [${dq.evidence.reason}] ${dq.scope}${dq.platform ? ` · ${dq.platform}` : ''} — ${dq.observation}`);

  console.log('\n=== StrategyFeedback propuestos (muestra, status=PROPOSED, ninguno ejecutado) ===');
  for (const sf of result.strategyFeedback.slice(0, 8)) {
    console.log(`  [${sf.status} · confidence=${sf.confidence} · esperado=${sf.expectedDirection}] ${sf.affectedPlatform ?? '—'}${sf.affectedFormat ? `/${sf.affectedFormat}` : ''}`);
    console.log(`    QUÉ: ${sf.recommendation}`);
    console.log(`    POR QUÉ: ${sf.rationale}`);
  }

  const totalLearning = performanceLearningStore.loadAll('learning_record').length;
  const totalFeedback = performanceLearningStore.loadAll('strategy_feedback').length;
  console.log(`\nTotal learning_record persistidos (histórico): ${totalLearning}`);
  console.log(`Total strategy_feedback persistidos (histórico, todos PROPOSED): ${totalFeedback}`);
}

main();
