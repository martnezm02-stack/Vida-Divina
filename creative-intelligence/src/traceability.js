// traceability.js — Own Performance Loop: CreativeCell → ProductionBrief →
// PublishedContent → PerformanceSnapshot → Analysis → Learning.
//
// Debe poder responder: "¿qué hipótesis originó esta pieza?", "¿qué
// resultado produjo?", "¿qué aprendimos?" — sin PostgreSQL ni ninguna
// persistencia real en esta fase; son estructuras en memoria que validan
// consistencia de referencias entre las entidades ya creadas.

/**
 * Vincula una pieza REAL ya publicada (ej. un media de Instagram leído por
 * InstagramOwnPerformanceSource, sin productionBriefId propio todavía) con
 * el CreativeCell/ProductionBrief que la originó — SOLO si esa relación
 * existe de verdad en `knownLinks`. Nunca inventa un CreativeCell para una
 * publicación: si no hay coincidencia real, el resultado es
 * status:"UNLINKED", con creativeCellId/productionBriefId/hypothesisId en
 * null. `knownLinks` es la única fuente de verdad de esa relación en esta
 * fase (no hay persistencia real todavía) — quien llama debe proveerla
 * explícitamente, nunca se asume.
 */
export function linkPublishedContentToCreativeCell(publishedContentRef, knownLinks = []) {
  if (!publishedContentRef?.platform || !publishedContentRef?.platformMediaId) {
    throw new Error('linkPublishedContentToCreativeCell: se requiere un publishedContentRef real con "platform" y "platformMediaId".');
  }
  const match = knownLinks.find(
    (link) => link.platform === publishedContentRef.platform && link.platformMediaId === publishedContentRef.platformMediaId
  );
  if (!match) {
    return Object.freeze({ ...publishedContentRef, status: 'UNLINKED', creativeCellId: null, productionBriefId: null, hypothesisId: null });
  }
  return Object.freeze({
    ...publishedContentRef,
    status: 'LINKED',
    creativeCellId: match.creativeCellId,
    productionBriefId: match.productionBriefId ?? null,
    hypothesisId: match.hypothesisId ?? null,
  });
}

export function createPublishedContentRef({ productionBriefId, platformMediaRef }) {
  if (!productionBriefId) throw new Error('PublishedContentRef: "productionBriefId" es obligatorio — nunca una pieza publicada sin brief que la originó.');
  if (!platformMediaRef?.mediaId) throw new Error('PublishedContentRef: "platformMediaRef" debe ser un PlatformMediaRef real (ver identifiers.js).');
  return Object.freeze({ publishedContentId: `${platformMediaRef.platform}:${platformMediaRef.mediaId}`, productionBriefId, platformMediaRef });
}

export function createPerformanceSnapshotRef({ publishedContentId, capturedAt = new Date().toISOString(), metrics }) {
  if (!publishedContentId) throw new Error('PerformanceSnapshotRef: "publishedContentId" es obligatorio.');
  if (!metrics || typeof metrics !== 'object') throw new Error('PerformanceSnapshotRef: "metrics" debe ser un objeto (ver OwnPerformanceSource).');
  return Object.freeze({ performanceSnapshotId: `${publishedContentId}@${capturedAt}`, publishedContentId, capturedAt, metrics: Object.freeze({ ...metrics }) });
}

/**
 * Construye la cadena completa y valida que cada eslabón referencia
 * correctamente al anterior — nunca acepta una cadena con un hueco.
 */
export function buildTraceChain({ creativeCell, hypothesis, productionBrief, publishedContent, performanceSnapshot = null, learning = null }) {
  if (!creativeCell?.creativeCellId) throw new Error('buildTraceChain: se requiere una CreativeCell real.');
  if (hypothesis && hypothesis.creativeCellId !== creativeCell.creativeCellId) {
    throw new Error('buildTraceChain: la Hypothesis no pertenece a esta CreativeCell.');
  }
  if (productionBrief && productionBrief.creativeCellId !== creativeCell.creativeCellId) {
    throw new Error('buildTraceChain: el ProductionBrief no pertenece a esta CreativeCell.');
  }
  if (publishedContent && productionBrief && publishedContent.productionBriefId !== productionBrief.productionBriefId) {
    throw new Error('buildTraceChain: el PublishedContent no pertenece a este ProductionBrief.');
  }
  if (performanceSnapshot && publishedContent && performanceSnapshot.publishedContentId !== publishedContent.publishedContentId) {
    throw new Error('buildTraceChain: el PerformanceSnapshot no pertenece a este PublishedContent.');
  }

  return Object.freeze({
    creativeCellId: creativeCell.creativeCellId,
    hypothesisId: hypothesis?.hypothesisId ?? null,
    productionBriefId: productionBrief?.productionBriefId ?? null,
    publishedContentId: publishedContent?.publishedContentId ?? null,
    performanceSnapshotId: performanceSnapshot?.performanceSnapshotId ?? null,
    learningId: learning?.learningId ?? null,
  });
}

/** "¿Qué hipótesis originó esta pieza?" */
export function traceOriginHypothesis(chain) {
  return chain.hypothesisId; // null si la pieza nunca tuvo una hipótesis registrada — nunca se inventa una.
}

/** "¿Qué resultado produjo?" / "¿qué aprendimos?" */
export function traceOutcome(chain) {
  return Object.freeze({ performanceSnapshotId: chain.performanceSnapshotId, learningId: chain.learningId });
}
