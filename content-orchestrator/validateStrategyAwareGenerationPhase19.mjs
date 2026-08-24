#!/usr/bin/env node
// validateStrategyAwareGenerationPhase19.mjs — Strategy-Aware Content
// Generation, validación real (Fase 19). Usa el performanceLearningStore
// real de producción (StrategyDecision ya generadas en fases anteriores).
// Genera contenido REAL localmente (buildCreativeProposal) -- NUNCA
// publica, NUNCA llama Meta/WhatsApp/CRM.

import { buildStrategyContext } from './src/strategyContext.js';
import { buildCreativeProposal } from './src/autonomousCreate.js';
import { performanceLearningStore } from '../content-strategy/src/performanceLearningStoreInstance.js';
import { listStrategyDecisions } from '../strategy-decision-engine/src/strategyDecisionService.js';

function main() {
  const all = listStrategyDecisions({ store: performanceLearningStore });
  const byDecision = { ACCEPT: 0, DEFER: 0, REJECT: 0 };
  for (const d of all) byDecision[d.decision] = (byDecision[d.decision] ?? 0) + 1;
  console.log(`StrategyDecision reales: ${all.length} -- ACCEPT=${byDecision.ACCEPT} DEFER=${byDecision.DEFER} REJECT=${byDecision.REJECT}`);
  console.log('(DEFER/REJECT quedan excluidos por construcción: buildStrategyContext solo lee decision="ACCEPT")');

  console.log('\n=== buildStrategyContext sin productId (resuelve el ACCEPT de mayor especificidad disponible: PLATFORM) ===');
  const ctxNoProduct = buildStrategyContext({ store: performanceLearningStore });
  console.log(JSON.stringify(ctxNoProduct, null, 2));

  console.log('\n=== buildStrategyContext con productId="tedivina"/productName="TéDivina" (PRODUCT gana sobre PLATFORM por especificidad, Fase 6) ===');
  const ctxProduct = buildStrategyContext({ store: performanceLearningStore, productId: 'tedivina', productName: 'TéDivina' });
  console.log(JSON.stringify(ctxProduct, null, 2));

  console.log('\n=== Generación real local (sin publicar): "Campaña de TéDivina" ===');
  buildCreativeProposal({ userIntent: 'Campaña de TéDivina' }).then((proposal) => {
    console.log(`status: ${proposal.status}`);
    console.log(`platform resuelto: ${proposal.platform}`);
    console.log(`strategyContext.applied: ${proposal.strategyContext.applied}`);
    if (proposal.strategyContext.applied) {
      console.log(`  strategyDecisionIds: ${proposal.strategyContext.strategyDecisionIds.join(', ')}`);
      console.log(`  learningIds: ${proposal.strategyContext.learningIds.join(', ')}`);
      console.log(`  scopeType: ${proposal.strategyContext.scopeType} · confidence: ${proposal.strategyContext.confidence} · direction: ${proposal.strategyContext.strategicDirection}`);
    }
    console.log('\nPUBLICATION: NOT EXECUTED (buildCreativeProposal nunca llama a publishingService/Meta/WhatsApp).');
  });
}

main();
