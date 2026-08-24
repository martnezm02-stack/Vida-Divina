// autoPublishReadiness.js — Fase 13, Parte 12/13. Investigación real
// (§12 del encargo): Performance Analysis/Strategy Decision YA definen
// umbrales de confianza/muestra reales -- MIN_BASELINE_SAMPLE_SIZE
// (performance-learning-intelligence/src/performanceSignal.js, =5, usado
// ya en Fases 8-10) y el nivel de confidence HIGH de StrategyDecision
// (strategy-decision-engine, Fase 10). Se REUTILIZAN tal cual -- ningún
// número nuevo se inventa para "cuántas publicaciones se necesitan".
//
// READY exige evidencia en las tres capas de la cadena real: (1) datos de
// performance reales suficientes, (2) al menos una publicación real ya
// completada por el pipeline existente (prueba de que el pipeline
// end-to-end funciona), (3) al menos una StrategyDecision ACCEPT con
// confidence HIGH (el nivel más alto ya definido, no MEDIUM).

import { performanceLearningStore as defaultStore } from '../../content-strategy/src/performanceLearningStoreInstance.js';
import { MIN_BASELINE_SAMPLE_SIZE } from '../../performance-learning-intelligence/src/performanceSignal.js';
import { listStrategyDecisions } from '../../strategy-decision-engine/src/strategyDecisionService.js';
import * as scheduledPublicationStore from '../../publishing-scheduler/src/scheduledPublicationStore.js';

export const READINESS_LEVELS = Object.freeze(['READY', 'NOT_READY']);

/**
 * @param {{store?:object, publicationStore?:object}} params
 * @returns {{readiness:string, reasons:string[], evidence:object}}
 */
export function computeAutoPublishReadiness({ store = defaultStore, publicationStore = scheduledPublicationStore } = {}) {
  const reasons = [];

  const publishedContentCount = store.loadAll('published_content').length;
  const hasEnoughPerformanceData = publishedContentCount >= MIN_BASELINE_SAMPLE_SIZE;
  if (!hasEnoughPerformanceData) reasons.push(`Insufficient real performance data (${publishedContentCount}/${MIN_BASELINE_SAMPLE_SIZE} PublishedContent reales).`);

  const publishedRecords = publicationStore.list().filter((r) => r.status === 'PUBLISHED');
  const hasRealPublishedProof = publishedRecords.length >= 1;
  if (!hasRealPublishedProof) reasons.push('Insufficient publication history (0 ScheduledPublication reales en estado PUBLISHED todavía -- el pipeline no tiene evidencia real de haber publicado con éxito).');

  const highConfidenceAccepts = listStrategyDecisions({ store, decision: 'ACCEPT', confidence: 'HIGH' });
  const hasStrategyConfidence = highConfidenceAccepts.length >= 1;
  if (!hasStrategyConfidence) reasons.push('Insufficient strategy confidence (0 StrategyDecision ACCEPT con confidence HIGH todavía).');

  const readiness = reasons.length === 0 ? 'READY' : 'NOT_READY';
  return {
    readiness,
    reasons: reasons.length ? reasons : ['Required evidence and execution prerequisites satisfied.'],
    evidence: { publishedContentCount, minRequired: MIN_BASELINE_SAMPLE_SIZE, realPublishedCount: publishedRecords.length, highConfidenceAcceptCount: highConfidenceAccepts.length },
  };
}
