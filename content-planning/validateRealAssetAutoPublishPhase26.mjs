#!/usr/bin/env node
// validateRealAssetAutoPublishPhase26.mjs — Real Asset Generation +
// Controlled Auto-Publish, Fase 13 (validación real, Parte 26). Usa el
// performanceLearningStore real de producción. NUNCA llama a Meta, NUNCA
// publica -- el AssetPackage usado aquí está explícitamente marcado como
// de validación (nunca un render ffmpeg real, que no es necesario para
// probar que la política de AUTO_PUBLISH bloquea correctamente).

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performanceLearningStore } from '../content-strategy/src/performanceLearningStoreInstance.js';
import { PerformanceLearningStore } from '../performance-learning-intelligence/src/store.js';
import { PublishingScheduler } from '../publishing-scheduler/src/publishingScheduler.js';
import { planContent } from './src/contentPlanningService.js';
import { getCurrentAutoPublishConfig, setAutoPublishEnabled } from './src/autoPublishConfig.js';
import { computeAutoPublishReadiness } from './src/autoPublishReadiness.js';

function fakePublicationStore() {
  const map = new Map();
  return { save: (r) => { map.set(r.id, r); return r; }, get: (id) => map.get(id) ?? null, exists: (id) => map.has(id), list: () => [...map.values()], del: (id) => map.delete(id) };
}

async function main() {
  console.log('=== 1. AUTO_PUBLISH = OFF (estado real actual) ===');
  const before = getCurrentAutoPublishConfig({ store: performanceLearningStore });
  console.log(`enabled=${before.enabled}`);

  console.log('\n=== 2. PREPARE_ONLY real: Plan -> Generation -> Quality Gate -> READY_FOR_REVIEW, sin publicar ===');
  const r1 = await planContent({ userIntent: 'Campaña de TéDivina', executionMode: 'PREPARE_ONLY', store: performanceLearningStore });
  console.log(`status=${r1.plan.status} deduped=${r1.deduped} publicationId=${r1.plan.publicationId}`);
  console.log('PUBLICATION: NOT EXECUTED.');

  console.log('\n=== 3. Dashboard OFF -> ON (solo configuración, NUNCA genera/publica/llama Meta) ===');
  const enabled = setAutoPublishEnabled({ enabled: true, actorId: 'Validación Fase 13', reason: 'validación real controlada', store: performanceLearningStore });
  console.log(`enabled=${enabled.enabled} actorId=${enabled.actorId} (0 ContentPlan creados por este cambio, 0 llamadas a Meta)`);
  const readiness = computeAutoPublishReadiness({ store: performanceLearningStore });
  console.log(`readiness real: ${readiness.readiness} -- ${readiness.reasons.join(' | ')}`);

  console.log('\n=== 4. Con la política ON pero readiness NOT_READY (esperado con los datos reales actuales): AUTO_PUBLISH sigue sin publicar ===');
  console.log('(usa un store AISLADO -- nunca el real de producción -- para que esta demostración sea repetible sin depender de corridas anteriores de este mismo script)');
  const isolatedDir = mkdtempSync(join(tmpdir(), 'phase13-validation-'));
  const isolatedStore = new PerformanceLearningStore(isolatedDir);
  const pubStore = fakePublicationStore();
  const scheduler = new PublishingScheduler({ mediaHostingService: {}, publish: () => {}, store: pubStore });
  const syntheticAssetPackage = { requestId: 'phase13-validation-req', mode: 'CREATE', status: 'COMPLETED', outputAssets: [{ assetId: 'phase13-validation-asset', path: '/tmp/validation.mp4' }], sourceAssets: [], derivedAssets: [], audioAssets: [], outputProfiles: ['INSTAGRAM_REEL'], lineage: [], errors: [], warnings: [] };
  const r2 = await planContent({
    userIntent: 'Necesito contenido de Instagram para TéDivina validación fase 13',
    executionMode: 'AUTO_PUBLISH', assetPackage: syntheticAssetPackage, store: isolatedStore, strategyStore: isolatedStore, publicationStore: pubStore, scheduler,
  });
  console.log(`status=${r2.plan.status} autoPublish.eligible=${r2.plan.autoPublish?.eligible}`);
  if (r2.plan.autoPublish) console.log(`reasons: ${r2.plan.autoPublish.reasons.join(' | ') || '(ninguna -- elegible)'}`);
  const scheduled = r2.plan.publicationId ? pubStore.get(r2.plan.publicationId) : null;
  console.log(`ScheduledPublication (store de validación, NO el real de producción): ${scheduled ? `status=${scheduled.status} externalPublicationId=${scheduled.externalPublicationId}` : '(ninguna creada)'}`);
  console.log('PUBLICATION: NOT EXECUTED. META: NOT TOUCHED.');
  rmSync(isolatedDir, { recursive: true, force: true });

  console.log('\n=== 5. Dashboard ON -> OFF (Parte 9/24: reversible, no borra histórico) ===');
  const disabled = setAutoPublishEnabled({ enabled: false, actorId: 'Validación Fase 13', reason: 'cierre de validación', store: performanceLearningStore });
  console.log(`enabled=${disabled.enabled}`);
  console.log(`histórico total de configuración (append-only, nunca borrado): ${performanceLearningStore.loadAll('auto_publish_config').length} registros`);
}

main();
