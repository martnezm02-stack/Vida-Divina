// fixtures.js — helpers de test compartidos (no es *.test.js, no lo recoge "node --test").

import { createLearningRecord } from '../../../learning-strategy-engine/src/learningRecord.js';
import { createStrategyFeedback } from '../../../learning-strategy-engine/src/strategyFeedback.js';

export function makeLearning(overrides = {}) {
  return createLearningRecord({
    learningType: 'FORMAT_LEARNING', scope: 'instagram:format=video (N=12)', observation: 'El formato video presenta un rendimiento superior al benchmark.',
    pattern: 'Diferencia relativa de rendimiento entre formatos', evidence: { delta: 0.30, expectedDirection: 'IMPROVE' },
    evidenceCount: 12, confidence: 'HIGH', implication: 'Existe una señal para priorizar este formato.',
    recommendation: 'Evaluar mayor proporción de este formato en futuras estrategias.',
    platform: 'instagram', format: 'video', relatedInsightIds: ['mi-1'], relatedContentIds: ['c1', 'c2'],
    ...overrides,
  });
}

export function makeFeedback(learning, overrides = {}) {
  return createStrategyFeedback({
    learningId: learning.id, recommendation: learning.recommendation, rationale: learning.implication,
    evidence: { scope: learning.scope, evidenceCount: learning.evidenceCount, learningType: learning.learningType, relatedContentIds: learning.relatedContentIds },
    confidence: learning.confidence, affectedPlatform: learning.platform, affectedFormat: learning.format, affectedProduct: learning.product,
    expectedDirection: learning.evidence.expectedDirection ?? 'INVESTIGATE',
    ...overrides,
  });
}
