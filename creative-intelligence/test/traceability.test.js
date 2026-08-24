import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createCreativeCell } from '../src/creativeCell.js';
import { createHypothesis } from '../src/hypothesis.js';
import { createProductionBrief } from '../src/productionBrief.js';
import { createPlatformMediaRef } from '../src/identifiers.js';
import { createPublishedContentRef, createPerformanceSnapshotRef, buildTraceChain, traceOriginHypothesis, traceOutcome } from '../src/traceability.js';
import { createPattern, createObservation, createDataPoint, createLearning } from '../src/evidenceTaxonomy.js';

function fullChain() {
  const cell = createCreativeCell({
    personaId: 'persona-1', painId: 'pain-1', awareness: 'Problem Aware',
    angleId: 'angle-1', formatId: 'format-1', mechanism: 'reencuadre de autoridad',
  });
  const hypothesis = createHypothesis({
    creativeCellId: cell.creativeCellId, targetPersona: 'x', awareness: 'Problem Aware',
    angle: 'x', format: 'x', expectedOutcome: 'x', mechanism: 'x',
  });
  const brief = createProductionBrief({
    creativeCellId: cell.creativeCellId,
    persona: 'x', pain: 'x', awareness: 'Problem Aware', angle: 'x', format: 'x',
    hookDirection: 'x', mechanismEntry: 'x', credibilityAnchorTiming: 'x', productRevealTiming: 'x',
    narrator: 'expert', setting: 'studio', runtime: '30s',
  });
  const mediaRef = createPlatformMediaRef({ platform: 'instagram', mediaId: '17878496934523039' });
  const published = createPublishedContentRef({ productionBriefId: brief.productionBriefId, platformMediaRef: mediaRef });
  const snapshot = createPerformanceSnapshotRef({ publishedContentId: published.publishedContentId, metrics: { reach: 1000, likes: 20 } });
  return { cell, hypothesis, brief, published, snapshot };
}

describe('Traceability validation — Own Performance Loop', () => {
  test('una CreativeCell puede rastrearse hasta un ProductionBrief', () => {
    const { cell, hypothesis, brief } = fullChain();
    const chain = buildTraceChain({ creativeCell: cell, hypothesis, productionBrief: brief });
    assert.equal(chain.creativeCellId, cell.creativeCellId);
    assert.equal(chain.productionBriefId, brief.productionBriefId);
  });

  test('rechaza un ProductionBrief que no pertenece a la CreativeCell dada', () => {
    const { cell, brief: foreignBrief } = fullChain();
    const otherCell = createCreativeCell({ personaId: 'persona-2', painId: 'pain-2', awareness: 'Solution Aware', angleId: 'angle-2', formatId: 'format-2', mechanism: 'x' });
    assert.throws(() => buildTraceChain({ creativeCell: otherCell, productionBrief: foreignBrief }));
  });

  test('cadena completa: CreativeCell → ProductionBrief → PublishedContent → PerformanceSnapshot', () => {
    const { cell, hypothesis, brief, published, snapshot } = fullChain();
    const chain = buildTraceChain({ creativeCell: cell, hypothesis, productionBrief: brief, publishedContent: published, performanceSnapshot: snapshot });
    assert.equal(chain.publishedContentId, published.publishedContentId);
    assert.equal(chain.performanceSnapshotId, snapshot.performanceSnapshotId);
  });

  test('"¿qué hipótesis originó esta pieza?" — traceOriginHypothesis responde desde la cadena', () => {
    const { cell, hypothesis, brief } = fullChain();
    const chain = buildTraceChain({ creativeCell: cell, hypothesis, productionBrief: brief });
    assert.equal(traceOriginHypothesis(chain), hypothesis.hypothesisId);
  });

  test('sin hipótesis registrada, nunca se inventa una — traceOriginHypothesis devuelve null', () => {
    const { cell, brief } = fullChain();
    const chain = buildTraceChain({ creativeCell: cell, productionBrief: brief });
    assert.equal(traceOriginHypothesis(chain), null);
  });

  test('"¿qué resultado produjo? ¿qué aprendimos?" — traceOutcome expone snapshot y learning', () => {
    const { cell, hypothesis, brief, published, snapshot } = fullChain();
    const data = createDataPoint({ domain: 'OWN_PERFORMANCE', field: 'reach', value: 1000, source: 'instagram_insights' });
    const obs1 = createObservation({ domain: 'OWN_PERFORMANCE', description: 'reach alto', basedOnData: [data] });
    const obs2 = createObservation({ domain: 'OWN_PERFORMANCE', description: 'reach alto de nuevo', basedOnData: [data] });
    const pattern = createPattern({ domain: 'OWN_PERFORMANCE', description: 'reach consistente', basedOnObservations: [obs1, obs2] });
    const learning = createLearning({ description: 'este angle sostiene reach por encima del promedio', basedOnPatterns: [pattern] });

    const chain = buildTraceChain({ creativeCell: cell, hypothesis, productionBrief: brief, publishedContent: published, performanceSnapshot: snapshot, learning });
    const outcome = traceOutcome(chain);
    assert.equal(outcome.performanceSnapshotId, snapshot.performanceSnapshotId);
    assert.equal(outcome.learningId, learning.learningId);
  });

  test('PublishedContentRef es compatible con un media id real de Instagram sin modificar la integración existente', () => {
    const mediaRef = createPlatformMediaRef({ platform: 'instagram', mediaId: '17878496934523039' });
    assert.equal(mediaRef.mediaId, '17878496934523039');
    assert.equal(mediaRef.platform, 'instagram');
  });
});
