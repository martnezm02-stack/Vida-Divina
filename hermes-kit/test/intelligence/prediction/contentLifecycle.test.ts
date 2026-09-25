// contentLifecycle.test.ts — Ciclo real: creative candidate -> prediction
// PRE-PUBLICATION -> published content -> intelligence item -> performance
// real -> prediction vs actual -> evidencia histórica reutilizable.
//
// No reimplementa ni el predictor ni publishedContentAdapter -- solo
// ejercita el vínculo de identidad (content_item_id, ver docstring de
// PublishedContentRaw) que hace que la ingesta PRE-publicación y la
// ingesta POST-publicación upserteen la MISMA fila de intelligence_items,
// y las dos funciones nuevas de localización automática
// (findLatestPredictionForItem / comparePredictionToActualForItem).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  getOrCreateSource,
  publishedContentAdapter,
  ingestCanonicalItem,
  getIntelligenceItemById,
  getIntelligenceItemByExternalId,
  historicalSimilarityPerformancePredictor,
  savePredictionRecord,
  listPredictionRecordsForItem,
  findLatestPredictionForItem,
  comparePredictionToActual,
  comparePredictionToActualForItem,
} from "../../../src/lib/intelligence";
import type { PublishedContentRaw } from "../../../src/lib/intelligence";

test("ciclo completo: candidate -> prediction pre-publication -> publish -> performance real -> prediction vs actual -> evidencia futura", async () => {
  const project = `content-lifecycle-${randomUUID()}`;
  const projectRow = getOrCreateProject(project);
  const sourceRow = getOrCreateSource("published_content");
  const contentItemId = randomUUID(); // ContentItem.content_item_id real -- conocido desde ANTES de publicar

  // Evidencia histórica YA existente (otros items reales del proyecto,
  // nunca el propio candidato) que comparten cta/offer/format con el
  // candidato -- para que la predicción tenga con qué comparar.
  const evidenceRaw1: PublishedContentRaw = {
    content_id: `evidence-${randomUUID()}`,
    platform: "instagram",
    published_at: "2026-08-01T00:00:00.000Z",
    content_type: "social_post",
    format: "reel",
  };
  const evidenceRaw2: PublishedContentRaw = { ...evidenceRaw1, content_id: `evidence-${randomUUID()}` };
  const evidenceItemIds: number[] = [];
  for (const [raw, metrics] of [
    [evidenceRaw1, [{ content_id: evidenceRaw1.content_id!, metric: "views", value: 1000 }, { content_id: evidenceRaw1.content_id!, metric: "likes", value: 60 }]],
    [evidenceRaw2, [{ content_id: evidenceRaw2.content_id!, metric: "views", value: 2000 }, { content_id: evidenceRaw2.content_id!, metric: "likes", value: 100 }]],
  ] as const) {
    const canonical = publishedContentAdapter.normalize({ publishedContent: raw, observations: [...metrics] }, { project });
    canonical.cta = "Compra ahora";
    canonical.offer = "20% de descuento";
    const { item } = ingestCanonicalItem(canonical);
    evidenceItemIds.push(item.id);
  }

  // ===== A) CANDIDATO CREATIVO REAL: ingesta PRE-PUBLICACIÓN, sin published_at ni performance =====
  const candidateRaw: PublishedContentRaw = {
    content_item_id: contentItemId,
    platform: "instagram",
    content_type: "social_post",
    format: "reel",
    topic: "Control de peso con Sculpt Max",
    product_ref: "Sculpt Max",
    hook_pattern_ref: "Llevo 30 días tomando esto y no lo puedo creer",
    // published_at/url/external_post_id/content_id: intencionalmente AUSENTES -- no existen todavía.
  };
  const candidateCanonical = publishedContentAdapter.normalize({ publishedContent: candidateRaw, observations: [] }, { project });
  candidateCanonical.cta = "Compra ahora";
  candidateCanonical.offer = "20% de descuento";

  assert.equal(candidateCanonical.external_id, contentItemId, "sin content_id/external_post_id todavía -- external_id debe ser el content_item_id");
  assert.equal(candidateCanonical.published_at, null, "nunca se inventa una fecha de publicación");
  assert.equal(candidateCanonical.metrics, null, "sin performance todavía");

  const { item: stubItem, created: stubCreated } = ingestCanonicalItem(candidateCanonical);
  assert.equal(stubCreated, true);
  assert.equal(stubItem.published_at, null);

  // Localizable por identidad externa (content_item_id) sin conocer el id numérico.
  const resolvedStub = getIntelligenceItemByExternalId(projectRow.id, sourceRow.id, contentItemId);
  assert.equal(resolvedStub?.id, stubItem.id);

  // ===== B) PREDICTION ANTES DE PUBLICACIÓN =====
  const predictionOutcome = await historicalSimilarityPerformancePredictor.predict({
    project_id: projectRow.id,
    itemId: stubItem.id, // se autoexcluye de su propia evidencia
    minEvidence: 2,
  });
  assert.equal(predictionOutcome.status, "ok", "debe predecir usando SOLO la evidencia histórica ya existente");
  assert.deepEqual(predictionOutcome.evidence.item_ids.slice().sort((a, b) => a - b), evidenceItemIds.slice().sort((a, b) => a - b));
  assert.equal(predictionOutcome.evidence.item_ids.includes(stubItem.id), false, "el propio candidato nunca es su propia evidencia");

  // ===== C) PERSISTIR PREDICTION (inmutable, ai_analyses -- ninguna tabla nueva) =====
  const predictionRecord = savePredictionRecord(stubItem.id, historicalSimilarityPerformancePredictor.name, predictionOutcome);
  assert.equal(predictionRecord.item_id, stubItem.id);
  const beforePublishSnapshot = JSON.parse(predictionRecord.result_json);

  // Nunca hay performance todavía en este punto -- comparar no debe inventar nada.
  assert.deepEqual(comparePredictionToActualForItem(stubItem.id), []);

  // ===== D) PUBLICAR/EJECUTAR el MISMO contenido (misma content_item_id) =====
  const publishedRaw: PublishedContentRaw = {
    ...candidateRaw,
    content_id: randomUUID(), // generado recién al publicar (createPublishedContent real) -- nunca se conocía antes
    published_at: "2026-09-25T12:00:00.000Z",
    url: "https://www.instagram.com/p/fake-lifecycle-e2e/",
    external_post_id: "fake_lifecycle_e2e_post_id",
  };

  // ===== E/F) PERFORMANCE REAL observada después -> ingerir en el Intelligence Store =====
  const observations = [
    { content_id: publishedRaw.content_id!, metric: "views", value: 1500 },
    { content_id: publishedRaw.content_id!, metric: "likes", value: 90 },
  ];
  const publishedCanonical = publishedContentAdapter.normalize({ publishedContent: publishedRaw, observations }, { project });
  publishedCanonical.cta = "Compra ahora";
  publishedCanonical.offer = "20% de descuento";

  assert.equal(publishedCanonical.external_id, contentItemId, "sigue siendo la MISMA identidad -- content_item_id nunca cambia");

  const { item: publishedItem, created: publishedCreated } = ingestCanonicalItem(publishedCanonical);
  assert.equal(publishedCreated, false, "debe UPSERTEAR la fila del candidato, nunca crear una segunda");
  assert.equal(publishedItem.id, stubItem.id, "MISMO item.id antes y después de publicar -- vínculo candidate -> prediction -> published content preservado");
  assert.equal(publishedItem.published_at, Math.floor(new Date(publishedRaw.published_at as string).getTime() / 1000));
  assert.ok(publishedItem.canonical_url);

  // ===== G) comparePredictionToActual localiza la prediction automáticamente por CONTENIDO (item.id) =====
  const autoLocated = findLatestPredictionForItem(publishedItem.id, historicalSimilarityPerformancePredictor.name);
  assert.equal(autoLocated?.id, predictionRecord.id);

  const comparisons = comparePredictionToActualForItem(publishedItem.id, historicalSimilarityPerformancePredictor.name);
  assert.equal(comparisons.length, 1);
  const [cmp] = comparisons;

  // ===== H) verificaciones =====
  assert.notEqual(cmp.predicted, null);
  assert.notEqual(cmp.actual, null);
  assert.equal(cmp.prediction_record_id, predictionRecord.id, "predicted y actual corresponden al MISMO contenido/prediction");
  const expectedActual = 90 / 1500; // engagement_rate real: solo likes/views disponibles (comments/shares ausentes -- basis parcial, nunca inventado ni sustituido por 0)
  assert.ok(Math.abs(cmp.actual - expectedActual) < 1e-9);
  assert.ok(Math.abs(cmp.delta - (cmp.actual - cmp.predicted)) < 1e-9, "error relativo/delta calculado correctamente");
  if (cmp.predicted !== 0) {
    assert.ok(Math.abs((cmp.relative_error ?? NaN) - (cmp.delta / cmp.predicted)) < 1e-9);
  }

  // La prediction original NUNCA se modifica al compararla contra performance real.
  const reloaded = listPredictionRecordsForItem(publishedItem.id);
  assert.equal(reloaded.length, 1, "sigue existiendo UNA sola prediction -- comparar no crea ni sobrescribe nada");
  assert.deepEqual(JSON.parse(reloaded[0].result_json), beforePublishSnapshot, "prediction inmutable: idéntica a como se guardó antes de publicar");

  // ===== I) este contenido, ya con performance real, sirve como evidencia histórica para OTRA prediction futura =====
  const futureCandidateOutcome = await historicalSimilarityPerformancePredictor.predict({
    project_id: projectRow.id,
    candidate: { cta: "Compra ahora", offer: "20% de descuento", format: "reel" },
    minEvidence: 1,
  });
  assert.equal(futureCandidateOutcome.status, "ok");
  assert.ok(
    futureCandidateOutcome.evidence.item_ids.includes(publishedItem.id),
    "el contenido recién publicado con performance real ya es evidencia reutilizable para futuras predicciones"
  );
});

test("findLatestPredictionForItem/comparePredictionToActualForItem: sin ninguna prediction guardada, [] / null -- nunca se inventa una", () => {
  const project = `content-lifecycle-no-prediction-${randomUUID()}`;
  const { item } = ingestCanonicalItem(
    publishedContentAdapter.normalize(
      { publishedContent: { content_item_id: randomUUID(), platform: "instagram", content_type: "social_post" }, observations: [] },
      { project }
    )
  );
  assert.equal(findLatestPredictionForItem(item.id), null);
  assert.deepEqual(comparePredictionToActualForItem(item.id), []);
});

test("findLatestPredictionForItem: varias predictions de distintos predictors -- filtra por predictorName, toma la más reciente del propio", () => {
  const project = `content-lifecycle-multi-predictor-${randomUUID()}`;
  const { item } = ingestCanonicalItem(
    publishedContentAdapter.normalize(
      { publishedContent: { content_item_id: randomUUID(), platform: "instagram", content_type: "social_post" }, observations: [] },
      { project }
    )
  );

  const outcomeA = { status: "insufficient_evidence" as const, reason: "r1", evidence: { item_ids: [], metric_snapshots_used: 0, matched_fields: [], source_ids: [] } };
  const outcomeB = { status: "insufficient_evidence" as const, reason: "r2", evidence: { item_ids: [], metric_snapshots_used: 0, matched_fields: [], source_ids: [] } };
  savePredictionRecord(item.id, "predictor-viejo", outcomeA);
  const latestReal = savePredictionRecord(item.id, historicalSimilarityPerformancePredictor.name, outcomeB);

  const latest = findLatestPredictionForItem(item.id, historicalSimilarityPerformancePredictor.name);
  assert.equal(latest?.id, latestReal.id);
  assert.equal(latest?.model, historicalSimilarityPerformancePredictor.name);
});
