// ingestionService.test.ts — MI-2: ingestCanonicalItem persiste en el
// Intelligence Store de MI-1, es idempotente en re-ingesta, acumula
// métricas como snapshots, normaliza assets/evidence sin duplicarlos, y
// aísla por proyecto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ingestCanonicalItem, tiktokAdapter } from "../../../src/lib/intelligence/ingestion";
import type { TikTokRawAd } from "../../../src/lib/intelligence/ingestion";
import {
  getIntelligenceItemById,
  listAssetsForItem,
  listEvidenceForItem,
  listMetricsHistory,
  searchIntelligenceItems,
} from "../../../src/lib/intelligence";

function fixture(overrides: Partial<TikTokRawAd> = {}): TikTokRawAd {
  return {
    id: `tiktok-${randomUUID()}`,
    url: `https://www.tiktok.com/@vidadivina.oficial/video/${randomUUID()}`,
    advertiser: {
      id: `advertiser-${randomUUID()}`,
      name: "Vida Divina",
      handle: "@vidadivina.oficial",
    },
    caption: "Transforma tu cuerpo en 30 días",
    publish_time: "2026-01-10T12:00:00.000Z",
    first_seen: "2026-01-11T08:00:00.000Z",
    last_seen: "2026-01-15T08:00:00.000Z",
    video: {
      url: "https://v16.tiktokcdn.com/ad/sculpt-max.mp4",
      thumbnail_url: "https://p16.tiktokcdn.com/ad/sculpt-max-thumb.jpg",
    },
    stats: { play_count: 10000, digg_count: 500, comment_count: 20, share_count: 5 },
    hook_text: "Llevo 30 días tomando esto",
    market: "MX",
    ...overrides,
  };
}

test("persistencia: ingerir un item TikTok lo deja consultable en el Intelligence Store", () => {
  const raw = fixture();
  const canonical = tiktokAdapter.normalize(raw, { project: `proj-${randomUUID()}` });
  const result = ingestCanonicalItem(canonical);

  assert.equal(result.created, true);
  const stored = getIntelligenceItemById(result.item.id);
  assert.equal(stored?.external_id, raw.id);
  assert.equal(stored?.hook, "Llevo 30 días tomando esto");
  assert.equal(result.actor?.display_name, "Vida Divina");
});

test("re-ingesta idempotente: el mismo raw dos veces no crea una segunda fila", () => {
  const project = `proj-${randomUUID()}`;
  const raw = fixture();

  const first = ingestCanonicalItem(tiktokAdapter.normalize(raw, { project }));
  const second = ingestCanonicalItem(tiktokAdapter.normalize(raw, { project }));

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.item.id, first.item.id);

  const results = searchIntelligenceItems({ project_id: first.item.project_id });
  assert.equal(
    results.filter((r) => r.external_id === raw.id).length,
    1,
    "no debe haber una fila duplicada tras la re-ingesta"
  );
});

test("métricas: cada ingesta con metrics_captured_at distinto agrega un snapshot nuevo", () => {
  const project = `proj-${randomUUID()}`;
  const raw = fixture();

  const first = ingestCanonicalItem(
    tiktokAdapter.normalize({ ...raw, last_seen: "2026-01-15T08:00:00.000Z" }, { project })
  );
  ingestCanonicalItem(
    tiktokAdapter.normalize(
      {
        ...raw,
        last_seen: "2026-01-20T08:00:00.000Z",
        stats: { play_count: 50000, digg_count: 3000, comment_count: 120, share_count: 40 },
      },
      { project }
    )
  );

  const history = listMetricsHistory(first.item.id);
  assert.equal(history.length, 2, "dos ingestas con captured_at distinto -> dos snapshots");
  assert.equal(history[0].views, 10000);
  assert.equal(history[1].views, 50000);
});

test("assets: no se duplican en una re-ingesta idéntica", () => {
  const project = `proj-${randomUUID()}`;
  const raw = fixture();

  const first = ingestCanonicalItem(tiktokAdapter.normalize(raw, { project }));
  ingestCanonicalItem(tiktokAdapter.normalize(raw, { project }));

  const assets = listAssetsForItem(first.item.id);
  assert.equal(assets.length, 2, "video + thumbnail, sin duplicar en la segunda ingesta");
});

test("evidence/provenance: se conserva la URL de origen y no se duplica en re-ingesta", () => {
  const project = `proj-${randomUUID()}`;
  const raw = fixture();

  const first = ingestCanonicalItem(tiktokAdapter.normalize(raw, { project }));
  ingestCanonicalItem(tiktokAdapter.normalize(raw, { project }));

  const evidence = listEvidenceForItem(first.item.id);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].kind, "source_url");
  assert.ok(evidence[0].url?.includes("tiktok.com"));
});

test("campos desconocidos permanecen desconocidos: sin stats, metrics es null -- nunca 0", () => {
  const project = `proj-${randomUUID()}`;
  const raw = fixture({ stats: undefined });

  const result = ingestCanonicalItem(tiktokAdapter.normalize(raw, { project }));

  const history = listMetricsHistory(result.item.id);
  assert.equal(history.length, 0, "sin stats en el raw, no se crea ningún snapshot de métricas");
});

test("aislamiento por project: el mismo external_id en dos proyectos crea items distintos", () => {
  const raw = fixture();
  const itemA = ingestCanonicalItem(
    tiktokAdapter.normalize(raw, { project: `marketing-intelligence-${randomUUID()}` })
  );
  const itemB = ingestCanonicalItem(
    tiktokAdapter.normalize(raw, { project: `trading-${randomUUID()}` })
  );

  assert.notEqual(itemA.item.project_id, itemB.item.project_id);
  assert.notEqual(itemA.item.id, itemB.item.id);

  const resultsA = searchIntelligenceItems({ project_id: itemA.item.project_id });
  assert.ok(resultsA.every((r) => r.project_id === itemA.item.project_id));
});
