#!/usr/bin/env node
// validateStrategyDecisionPhase26.mjs — Strategy Decision Engine, Fase 26
// (validación real controlada). Usa exclusivamente el performanceLearningStore
// real de producción (strategy_feedback/learning_record ya generados) --
// NUNCA publica, NUNCA modifica Content Strategy/CRM/Meta/WhatsApp. Solo
// lee y persiste StrategyDecision derivadas (idempotente). No se fuerza
// ningún resultado: si todo termina en DEFER por falta de datos, es un
// resultado válido (§26 del encargo).
//
// Uso (desde strategy-decision-engine/): node validateStrategyDecisionPhase26.mjs

import { performanceLearningStore } from '../content-strategy/src/performanceLearningStoreInstance.js';
import { generateAndPersistStrategyDecisions } from './src/strategyDecisionService.js';

function main() {
  const feedback = performanceLearningStore.loadAll('strategy_feedback');
  console.log(`StrategyFeedback reales en el store: ${feedback.length} (todos PROPOSED)`);

  const result = generateAndPersistStrategyDecisions({ store: performanceLearningStore });
  console.log(`\n=== Strategy Decision Engine === status=${result.status}`);
  if (result.status !== 'OK') { console.log(`reason: ${result.reason}`); return; }

  console.log(`StrategyDecision generadas en esta corrida: ${result.decisions.length} (nuevas: ${result.saved.length}, ya existentes: ${result.skipped.length})`);
  console.log(`Por decision: ${JSON.stringify(result.summary.byDecision)}`);
  console.log(`Por risk: ${JSON.stringify(result.summary.byRisk)}`);

  console.log('\n=== Detalle real (todas) ===');
  for (const d of result.decisions) {
    console.log(`  [${d.decision} · risk=${d.risk} · confidence=${d.confidence} · impacto=${d.expectedImpact} · scopeType=${d.scopeType}] ${d.scope}`);
    console.log(`    razón: ${d.decisionReason}`);
    if (d.contradictions.length) console.log(`    contradicciones: ${d.contradictions.map((c) => `${c.learningType}(${c.expectedDirection})`).join(', ')}`);
    console.log(`    executionStatus: ${d.executionStatus}`);
  }

  const allExecution = new Set(performanceLearningStore.loadAll('strategy_decision').map((d) => d.executionStatus));
  console.log(`\nexecutionStatus distintos observados en TODO el store real: ${[...allExecution].join(', ')} (debe ser exclusivamente NOT_EXECUTED)`);

  const totalDecisions = performanceLearningStore.loadAll('strategy_decision').length;
  console.log(`Total strategy_decision persistidas (histórico): ${totalDecisions}`);
}

main();
