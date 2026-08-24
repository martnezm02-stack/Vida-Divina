#!/usr/bin/env node
// validateContentPlanningPhase28.mjs — Content Planning & Execution, Fase
// 28 (validación real). Usa el performanceLearningStore real (StrategyDecision
// ya generadas, Fase 10) + Content Generation real (buildCreativeProposal,
// Fase 11). PREPARE_ONLY primero (nunca publica). Luego HUMAN_REVIEW con un
// Final Asset Package SINTÉTICO marcado explícitamente como no-real (para
// probar el hand-off a ScheduledPublication sin depender de un render
// pesado) -- NUNCA se llama a Meta, NUNCA se aprueba/publica.

import { performanceLearningStore } from '../content-strategy/src/performanceLearningStoreInstance.js';
import { planContent, listContentPlans } from './src/contentPlanningService.js';

function fakePublicationStore() {
  const map = new Map();
  return { save: (r) => { map.set(r.id, r); return r; }, get: (id) => map.get(id) ?? null, exists: (id) => map.has(id), list: () => [...map.values()], del: (id) => map.delete(id) };
}

async function main() {
  console.log('=== PREPARE_ONLY sobre una StrategyDecision ACCEPT real ===');
  const r1 = await planContent({ userIntent: 'Campaña de TéDivina', executionMode: 'PREPARE_ONLY', store: performanceLearningStore });
  console.log(`status=${r1.plan.status} deduped=${r1.deduped}`);
  console.log(`strategyDecisionIds: ${r1.plan.strategyDecisionIds.join(', ') || '(ninguna aplicable)'}`);
  console.log(`platform=${r1.plan.platform} product=${r1.plan.product} assetPackageId=${r1.plan.assetPackageId} publicationId=${r1.plan.publicationId}`);
  console.log('PUBLICATION: NOT EXECUTED (PREPARE_ONLY nunca crea ScheduledPublication).');

  console.log('\n=== AUTO_PUBLISH (debe quedar protegido, nunca generar nada) ===');
  const r2 = await planContent({ userIntent: 'Campaña de TéDivina', executionMode: 'AUTO_PUBLISH', store: performanceLearningStore });
  console.log(`status=${r2.plan.status}`);

  console.log('\n=== HUMAN_REVIEW con un Final Asset Package sintético (hand-off a ScheduledPublication real, DRAFT, sin publicar) ===');
  const pubStore = fakePublicationStore();
  const syntheticAssetPackage = { requestId: 'validation-req-1', mode: 'CREATE', status: 'COMPLETED', outputAssets: [{ assetId: 'validation-asset-1', path: '/tmp/validation.mp4' }], sourceAssets: [], derivedAssets: [], audioAssets: [], outputProfiles: ['INSTAGRAM_REEL'], lineage: [], errors: [], warnings: [] };
  const r3 = await planContent({
    userIntent: 'Necesito contenido de Instagram para TéDivina',
    executionMode: 'HUMAN_REVIEW', assetPackage: syntheticAssetPackage, caption: 'Caption de validación (nunca publicada).',
    store: performanceLearningStore, publicationStore: pubStore,
  });
  console.log(`status=${r3.plan.status} deduped=${r3.deduped} publicationId=${r3.plan.publicationId}`);
  const scheduled = r3.plan.publicationId ? pubStore.get(r3.plan.publicationId) : null;
  if (scheduled) {
    console.log(`ScheduledPublication real (store en memoria de esta corrida, NO persistido en publishing-scheduler real): status=${scheduled.status} externalPublicationId=${scheduled.externalPublicationId}`);
  } else if (r3.deduped) {
    console.log('(ContentPlan deduplicado de una corrida anterior -- su ScheduledPublication original vivía en el store en memoria de esa corrida, ya no existe en este proceso; el ContentPlan real persistido nunca se pierde ni se duplica, solo el store en memoria de prueba es efímero por diseño.)');
  }
  console.log('PUBLICATION: NOT EXECUTED (ScheduledPublication queda en DRAFT; approve()/publish() nunca se llaman en esta validación).');

  const all = listContentPlans({ store: performanceLearningStore });
  console.log(`\nTotal content_plan persistidos (histórico, incluye corridas previas): ${all.length}`);
}

main();
